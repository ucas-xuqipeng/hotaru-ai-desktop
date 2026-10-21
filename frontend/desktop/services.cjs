'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

function getBundlePaths(root) {
  root = path.resolve(root);
  return {
    root, appPython: path.join(root, 'runtime/app/python.exe'),
    voicePython: path.join(root, 'runtime/voice/python.exe'),
    backendEntry: path.join(root, 'backend/hotaru_runtime.py'),
    voiceEntry: path.join(root, 'backend/portable/launch_voice.py'),
    config: path.join(root, 'config/config.yaml'),
    data: path.join(root, 'data'), logs: path.join(root, 'data/logs'),
    profile: path.join(root, 'data/profile'),
  };
}

// Hold both sockets until both ports are allocated so the OS cannot reuse one.
async function reservePorts() {
  const servers = [];
  try {
    for (let i = 0; i < 2; i++) {
      const server = net.createServer(); servers.push(server);
      await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    }
    return { appPort: servers[0].address().port, ttsPort: servers[1].address().port };
  } finally {
    await Promise.all(servers.filter(s => s.listening).map(s => new Promise(resolve => s.close(resolve))));
  }
}

function probe(url) {
  return new Promise(resolve => {
    const req = http.get(url, response => { response.resume(); resolve(response.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

class ServiceManager {
  constructor(root, options = {}) {
    this.paths = getBundlePaths(root);
    this.spawn = options.spawn || spawn;
    this.timeout = options.readinessTimeoutMs || 180000;
    this.children = new Set();
    this.stopping = false;
  }
  log(message) {
    // Lifecycle events only: never dump config, environment, child output or request data.
    fs.appendFileSync(path.join(this.paths.logs, 'desktop.log'), `${new Date().toISOString()} ${message}\n`);
  }
  launch(exe, args, cwd, env, label) {
    // Voice emits model/runtime diagnostics only. Backend owns its separate redacted log.
    const voiceLog = label === 'voice' ? fs.openSync(path.join(this.paths.logs, 'voice.log'), 'a') : null;
    let child;
    try {
      child = this.spawn(exe, args, { cwd, env, windowsHide: true,
        stdio: voiceLog === null ? 'ignore' : ['ignore', voiceLog, voiceLog] });
    } finally { if (voiceLog !== null) fs.closeSync(voiceLog); }
    this.children.add(child);
    child.once('error', () => { child.hotaruFailed = true; });
    child.once('exit', code => { child.hotaruFailed = true; this.log(`${label} exited (${code ?? 'signal'})`); });
    return child;
  }
  async waitReady(url) {
    const deadline = Date.now() + this.timeout;
    while (Date.now() < deadline) {
      if (this.stopping || [...this.children].some(c => c.hotaruFailed || c.exitCode !== null || c.signalCode !== null)) {
        throw new Error('本地服务启动失败，请检查便携包是否完整，以及安全软件是否拦截运行。');
      }
      if (await probe(url)) return;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('本地服务启动超时；首次加载语音模型可能较慢，请检查模型文件与可用内存后重试。');
  }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.startServices();
    return this.starting;
  }
  async startServices() {
    const p = this.paths;
    for (const name of ['appPython', 'voicePython', 'backendEntry', 'voiceEntry', 'config']) {
      if (!fs.existsSync(p[name])) throw new Error(`便携包缺少必要文件：${path.relative(p.root, p[name])}。请完整解压后再启动。`);
    }
    fs.mkdirSync(p.logs, { recursive: true });
    try {
      const { appPort, ttsPort } = await reservePorts();
      if (this.stopping) throw new Error('启动已取消。');
      const env = { ...process.env, HOTARU_BUNDLE_ROOT: p.root, HOTARU_APP_PORT: String(appPort), HOTARU_TTS_PORT: String(ttsPort), PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', PYTHONNOUSERSITE: '1' };
      for (const key of Object.keys(env)) if (/^PYTHON(HOME|PATH)$/i.test(key)) delete env[key];
      const voiceArgs = [p.voiceEntry, '--root', p.root, '--port', String(ttsPort)];
      if (env.HOTARU_FORCE_CPU === '1') voiceArgs.push('--cpu');
      this.launch(p.voicePython, voiceArgs, path.join(p.root, 'voice'), env, 'voice');
      this.launch(p.appPython, [p.backendEntry], path.join(p.root, 'backend'), env, 'backend');
      const voiceUrl = `http://127.0.0.1:${ttsPort}`;
      const appUrl = `http://127.0.0.1:${appPort}/?desktop=portable`;
      await Promise.all([this.waitReady(`${voiceUrl}/openapi.json`), this.waitReady(`http://127.0.0.1:${appPort}/`)]);
      if (this.stopping) throw new Error('启动已取消。');
      this.log('Both local services ready');
      return { appUrl, voiceUrl };
    } catch (error) { await this.stop(); throw error; }
  }
  async stop() {
    this.stopping = true;
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = Promise.all([...this.children].map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null || !child.pid) return resolve();
      child.once('close', resolve);
      if (process.platform === 'win32') {
        // Kill only the tree launched by this instance; never enumerate/kill by name.
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('error', () => child.kill());
        killer.once('exit', () => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
      } else child.kill('SIGTERM');
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
      timer.unref(); child.once('close', () => clearTimeout(timer));
    }))).then(() => { this.children.clear(); });
    return this.stopPromise;
  }
}
module.exports = { getBundlePaths, reservePorts, ServiceManager };

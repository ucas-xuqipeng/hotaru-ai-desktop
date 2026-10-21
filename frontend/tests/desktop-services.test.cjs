const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { getBundlePaths, reservePorts, ServiceManager } = require('../desktop/services.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '萤 AI '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const paths = getBundlePaths(root);
  for (const file of [paths.appPython, paths.voicePython, paths.backendEntry, paths.voiceEntry, paths.config]) {
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'fixture');
  }
  return { root, paths };
}
test('paths remain under a root containing spaces and non-ASCII', () => {
  const root = path.resolve('萤 AI portable');
  const p = getBundlePaths(root);
  assert.equal(p.appPython, path.join(root, 'runtime/app/python.exe'));
  assert.equal(p.voiceEntry, path.join(root, 'backend/portable/launch_voice.py'));
  assert.equal(p.profile, path.join(root, 'data/profile'));
});
test('selected ports are distinct and available on loopback', async () => {
  const { appPort, ttsPort } = await reservePorts();
  assert.notEqual(appPort, ttsPort);
  for (const port of [appPort, ttsPort]) {
    const server = net.createServer();
    await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
    await new Promise(resolve => server.close(resolve));
  }
});
test('missing assets fail before any process is spawned', async () => {
  let spawned = false;
  const manager = new ServiceManager(os.tmpdir(), { spawn: () => { spawned = true; } });
  await assert.rejects(manager.start(), /缺少/);
  assert.equal(spawned, false);
});
test('real tiny HTTP children become ready and stop leaves unrelated process alive', async t => {
  const { root } = fixture(t);
  const children = [];
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(() => unrelated.kill());
  const manager = new ServiceManager(root, { spawn: (_exe, _args, options) => {
    const port = options.env.HOTARU_APP_PORT === options.env.HOTARU_TTS_PORT ? 0 :
      (_args.includes('--port') ? options.env.HOTARU_TTS_PORT : options.env.HOTARU_APP_PORT);
    const child = spawn(process.execPath, ['-e', `require('http').createServer((q,r)=>r.end('ok')).listen(${port},'127.0.0.1')`], { stdio: 'ignore' });
    children.push(child); return child;
  }, readinessTimeoutMs: 5000 });
  t.after(() => manager.stop());
  const urls = await manager.start();
  assert.match(urls.appUrl, /^http:\/\/127\.0\.0\.1:\d+\/\?desktop=portable$/);
  assert.equal((await fetch(urls.voiceUrl)).status, 200);
  await manager.stop(); await manager.stop();
  assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
  assert.equal(unrelated.exitCode, null);
  assert.equal(unrelated.signalCode, null);
});
test('failed readiness cleans up every owned child', async t => {
  const { root } = fixture(t); const children = [];
  const manager = new ServiceManager(root, { spawn: () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    children.push(child); return child;
  }, readinessTimeoutMs: 100 });
  await assert.rejects(manager.start(), /启动/);
  assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
});
test('failed child cleans up the other child immediately', async t => {
  const { root } = fixture(t); const children = [];
  const manager = new ServiceManager(root, { spawn: () => {
    const child = spawn(process.execPath, ['-e', children.length ? 'process.exit(7)' : 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    children.push(child); return child;
  }, readinessTimeoutMs: 5000 });
  await assert.rejects(manager.start(), /启动/);
  assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
});
test('bundled interpreters cannot inherit another installation through Python environment', async t => {
  const { root } = fixture(t);
  const oldHome = process.env.PYTHONHOME; const oldPath = process.env.PYTHONPATH;
  process.env.PYTHONHOME = 'unrelated-python'; process.env.PYTHONPATH = 'unrelated-packages';
  t.after(() => {
    if (oldHome === undefined) delete process.env.PYTHONHOME; else process.env.PYTHONHOME = oldHome;
    if (oldPath === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH = oldPath;
  });
  const environments = [];
  const manager = new ServiceManager(root, { spawn: (_exe, _args, options) => {
    environments.push(options.env);
    return spawn(process.execPath, ['-e', 'process.exit(7)'], { stdio: 'ignore' });
  }, readinessTimeoutMs: 5000 });
  await assert.rejects(manager.start(), /启动/);
  for (const env of environments) {
    assert.equal(env.PYTHONHOME, undefined);
    assert.equal(env.PYTHONPATH, undefined);
    assert.equal(env.PYTHONNOUSERSITE, '1');
  }
});
test('voice diagnostics are retained under portable logs without copying backend stdout', async t => {
  const { root, paths } = fixture(t);
  const manager = new ServiceManager(root, { spawn: (_exe, args, options) => {
    const voice = args.includes('--port');
    const port = voice ? options.env.HOTARU_TTS_PORT : options.env.HOTARU_APP_PORT;
    return spawn(process.execPath, ['-e', `console.log('${voice ? 'voice fixture diagnostic' : 'backend private output'}');require('http').createServer((q,r)=>r.end('ok')).listen(${port},'127.0.0.1')`], { stdio: options.stdio });
  }, readinessTimeoutMs: 5000 });
  t.after(() => manager.stop());
  await manager.start(); await manager.stop();
  assert.match(fs.readFileSync(path.join(paths.logs, 'voice.log'), 'utf8'), /voice fixture diagnostic/);
  assert.equal(fs.readFileSync(path.join(paths.logs, 'desktop.log'), 'utf8').includes('backend private output'), false);
});

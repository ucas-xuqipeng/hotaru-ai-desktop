'use strict';
const { app, BrowserWindow, dialog, session, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ServiceManager, getBundlePaths } = require('./services.cjs');
const { isAppUrl, requestedMedia } = require('./policy.cjs');
const { PreferencesStore, restoreScript } = require('./preferences.cjs');
const { chooseDisplayMedia, ownedPermission } = require('./display-media.cjs');

const root = path.resolve(__dirname, '../..');
const paths = getBundlePaths(root);
fs.mkdirSync(paths.profile, { recursive: true });
app.setName('萤AI对话');
app.setPath('userData', paths.profile);
app.setPath('sessionData', paths.profile);
app.setAppLogsPath(paths.logs);
let window;
let manager;
let quitting = false;
let origin = null;
const preferences = new PreferencesStore(path.join(paths.data, 'preferences.json'));

async function finishQuit() {
  try {
    if (origin && window && !window.isDestroyed() && isAppUrl(window.webContents.getURL(), origin)) {
      await preferences.capture(window.webContents, origin);
    }
  } catch { /* Retain the last saved snapshot; never log preference content. */ }
  finally {
    try { await manager?.stop(); } catch { /* Always finish quitting after cleanup is attempted. */ }
    finally { app.quit(); }
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    void finishQuit();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(start).catch(() => { dialog.showErrorBox('萤AI对话启动失败', '无法初始化桌面窗口，请将便携包解压到有写入权限的文件夹后重试。'); app.quit(); });
}

async function start() {
  window = new BrowserWindow({ title: '萤AI对话', icon: path.join(root, 'resources/icon.ico'),
    width: 1280, height: 850, minWidth: 960, minHeight: 640,
    autoHideMenuBar: true, backgroundColor: '#111827',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  window.removeMenu();
  // Keep the page alive until preferences are captured, including native close/X.
  window.on('close', event => { if (!quitting) { event.preventDefault(); app.quit(); } });
  window.on('page-title-updated', event => { event.preventDefault(); window.setTitle('萤AI对话'); });
  const wc = window.webContents;
  let navigationEpoch = 0;
  wc.on('did-start-navigation', () => { navigationEpoch++; });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => { if (!origin || !isAppUrl(url, origin)) event.preventDefault(); });
  wc.on('will-redirect', (event, url) => { if (!origin || !isAppUrl(url, origin)) event.preventDefault(); });
  const grants = new Set();
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => (
    ownedPermission(contents, wc, origin, requestingOrigin, details)
    && (permission === 'display-capture' || (permission === 'media' && grants.has(details.mediaType)))
  ));
  session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (!ownedPermission(contents, wc, origin, details.requestingUrl, details)) return callback(false);
    // This gate permits the API to reach the explicit source chooser; it grants no stream.
    if (permission === 'display-capture') return callback(true);
    const media = requestedMedia(permission, details);
    if (!media.length) return callback(false);
    try {
      const answer = await dialog.showMessageBox(window, { type: 'question', title: '媒体访问权限',
        message: `是否允许萤AI对话使用${media.map(type => type === 'audio' ? '麦克风' : '摄像头').join('和')}？`,
        detail: '仅向当前本地对话页面授权。', buttons: ['允许', '拒绝'], defaultId: 1, cancelId: 1, noLink: true });
      const allowed = answer.response === 0 && !window.isDestroyed() && isAppUrl(wc.getURL(), origin);
      if (allowed) media.forEach(type => grants.add(type));
      callback(allowed);
    } catch { callback(false); }
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    callback(await chooseDisplayMedia(request, { window, origin,
      getNavigationEpoch: () => navigationEpoch,
      getSources: options => desktopCapturer.getSources(options),
      showDialog: options => dialog.showMessageBox(window, options) }));
  });
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html lang="zh"><meta charset="utf-8"><title>萤AI对话</title><body style="background:#111827;color:#f9fafb;font:20px system-ui;display:grid;place-content:center;height:90vh"><h1>萤AI对话</h1><p>正在启动本地服务并加载语音模型，请稍候……</p><p style="font-size:14px">首次启动可能需要几分钟。</p></body></html>'));
  manager = new ServiceManager(root);
  try {
    const { appUrl } = await manager.start();
    if (quitting || window.isDestroyed()) return;
    origin = new URL(appUrl).origin;
    await window.loadURL(`${origin}/desktop-bootstrap.html`);
    await wc.executeJavaScript(restoreScript(preferences.load(), origin));
    const verifyArg = process.argv.find(arg => arg.startsWith('--verify='));
    const verify = verifyArg ? await require('./verify.cjs').createVerification(window, verifyArg.slice('--verify='.length)) : null;
    await window.loadURL(appUrl);
    if (verify) {
      await verify();
      if (process.argv.includes('--exit-after-verify')) app.quit();
    }
  } catch (error) {
    await manager.stop();
    if (!quitting) {
      // Only manager-authored Chinese errors are safe to surface; never stringify arbitrary exceptions.
      const safe = /^(便携包缺少|本地服务启动|启动已取消|验证输出必须)/.test(error.message || '') ? error.message : '启动失败，请确认便携包完整、文件夹可写且模型未被安全软件拦截。';
      dialog.showErrorBox('萤AI对话启动失败', `${safe}\n启动记录：data/logs/desktop.log`);
      app.quit();
    }
  }
}

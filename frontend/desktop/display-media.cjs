'use strict';
const { isAppUrl } = require('./policy.cjs');

function ownedPermission(contents, owned, origin, requestingOrigin, details) {
  try {
    return contents === owned && !owned.isDestroyed() && details.isMainFrame === true
      && isAppUrl(requestingOrigin, origin) && isAppUrl(details.requestingUrl, origin)
      && isAppUrl(owned.getURL(), origin);
  } catch { return false; }
}
async function chooseDisplayMedia(request, { window, origin, getSources, showDialog, getNavigationEpoch = () => 0 }) {
  try {
    const contents = window.webContents;
    const frame = request.frame;
    const initialUrl = contents.getURL(); const initialFrameUrl = frame?.url;
    const epoch = getNavigationEpoch();
    const valid = () => !window.isDestroyed() && !contents.isDestroyed()
      && request.userGesture === true && request.videoRequested === true
      && frame && frame === contents.mainFrame && isAppUrl(frame.url, origin)
      && frame.url === initialFrameUrl && contents.getURL() === initialUrl && getNavigationEpoch() === epoch
      && isAppUrl(request.securityOrigin, origin) && isAppUrl(contents.getURL(), origin);
    if (!valid()) return null;
    const options = { types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false };
    const sources = await getSources(options);
    if (!valid() || !Array.isArray(sources) || !sources.length || sources.some(source => !source || typeof source.id !== 'string'
      || !/^(screen|window):[0-9]+:[0-9]+$/.test(source.id) || typeof source.name !== 'string')
      || new Set(sources.map(source => source.id)).size !== sources.length) return null;
    const answer = await showDialog({ type: 'question', title: '选择要共享的屏幕或窗口',
      message: '请选择要发送给萤AI的画面来源', detail: '仅共享所选画面，不共享系统音频。取消将不共享任何画面。',
      buttons: ['取消', ...sources.map((source, index) => `${index + 1}. ${source.name.replace(/[\r\n]/g, ' ').slice(0, 120)}`)],
      defaultId: 0, cancelId: 0, noLink: true });
    if (!valid() || !Number.isInteger(answer?.response) || answer.response < 1 || answer.response > sources.length) return null;
    const selected = sources[answer.response - 1];
    const available = await getSources(options);
    if (!valid() || !Array.isArray(available) || !available.some(source => source.id === selected.id)) return null;
    return { video: selected };
  } catch { return null; }
}
module.exports = { chooseDisplayMedia, ownedPermission };

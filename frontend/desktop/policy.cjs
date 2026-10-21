'use strict';
function isAppUrl(url, origin) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.origin === origin;
  } catch { return false; }
}
function requestedMedia(permission, details) {
  const types = details.mediaTypes;
  return permission === 'media' && Array.isArray(types) && types.length > 0
    && types.every(type => type === 'audio' || type === 'video') ? [...new Set(types)] : [];
}
function sanitizeFrame(frame) {
  const text = value => typeof value === 'string' ? value.slice(0, 2000) : '';
  const actions = value => Array.isArray(value) ? value.filter(v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v)).slice(0, 20) : [];
  if (frame.type === 'audio') return { type: 'audio', audioPresent: typeof frame.audio === 'string' && frame.audio.length > 0,
    reply: text(frame.display_text?.text), motions: actions(frame.actions?.motions), expressions: actions(frame.actions?.expressions) };
  if (frame.type === 'full-text') return { type: 'reply', reply: text(frame.text) };
  if (frame.type === 'backend-synth-complete') return { type: 'backend-synth-complete' };
  if (frame.type === 'conversation-chain-end' || (frame.type === 'control' && frame.text === 'conversation-chain-end')) return { type: 'conversation-end' };
  return null;
}
function consoleDiagnostic(message) {
  if (typeof message !== 'string') return null;
  if (/^Audio (?:play error:|playback error:)/.test(message)) return 'audio-playback-error';
  if (/^Audio playback setup error:/.test(message)) return 'audio-setup-error';
  const motion = /^Dialogue motion: (mtn_[a-zA-Z0-9_]{1,64})$/.exec(message);
  if (motion) return `dialogue-motion:${motion[1]}`;
  return ({ 'Starting audio playback with lip sync': 'audio-playback-started',
    'Audio playback completed': 'audio-playback-completed',
    'Applying enhanced lip sync': 'lip-sync-applied',
    'Audio playback error:': 'audio-playback-error' })[message] || null;
}
function verificationComplete(result) {
  return !result.playbackFailed && result.audioPresent && result.backendSynthComplete && result.idle
    && result.events.some(event => event.type === 'audio' && event.audioPresent && typeof event.reply === 'string' && event.reply.trim().length > 0)
    && result.events.some(event => event.type === 'conversation-end')
    && result.diagnostics.includes('audio-playback-completed')
    && !result.diagnostics.some(label => label === 'audio-playback-error' || label === 'audio-setup-error');
}
module.exports = { isAppUrl, requestedMedia, sanitizeFrame, consoleDiagnostic, verificationComplete };

export function defaultServerEndpoints(href?: string) {
  let baseUrl = 'http://127.0.0.1:12393';
  try {
    const page = new URL(href || '');
    if (['http:', 'https:'].includes(page.protocol)
      && ['127.0.0.1', 'localhost', '[::1]'].includes(page.hostname)) baseUrl = page.origin;
  } catch { /* File/standalone contexts retain the normal backend default. */ }
  return { baseUrl, wsUrl: `${baseUrl.replace(/^http/, 'ws')}/client-ws` };
}

export function isPortableDesktop(search: string) {
  return new URLSearchParams(search).get('desktop') === 'portable';
}

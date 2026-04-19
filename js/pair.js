(function () {
  'use strict';

  const BASE = 'https://paste.rs/';
  const MAGIC = 'MWTV1:';

  function b64encode(s) {
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  async function publish(config) {
    const payload = MAGIC + b64encode(JSON.stringify(config));
    const res = await fetch(BASE, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'text/plain' },
    });
    if (!res.ok) throw new Error('Upload failed (HTTP ' + res.status + ')');
    const url = (await res.text()).trim();
    const m = url.match(/paste\.rs\/([A-Za-z0-9]+)/);
    if (!m) throw new Error('Unexpected response');
    return m[1];
  }

  async function fetchCode(code) {
    const clean = String(code).trim()
      .replace(/^https?:\/\/paste\.rs\//, '')
      .replace(/[^A-Za-z0-9]/g, '');
    if (!clean) throw new Error('Empty code');
    const res = await fetch(BASE + encodeURIComponent(clean), { cache: 'no-store' });
    if (!res.ok) throw new Error('Code not found');
    const text = (await res.text()).trim();
    if (!text.startsWith(MAGIC)) throw new Error('Not a MyWolf code');
    return JSON.parse(b64decode(text.slice(MAGIC.length)));
  }

  window.MWPair = { publish, fetch: fetchCode };
})();

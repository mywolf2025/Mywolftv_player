(function () {
  'use strict';

  const CACHE_PREFIX = 'mwtv.apicache.';

  function normalizeHost(host) {
    let h = (host || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
    return h;
  }

  function cacheKeyFor(url) {
    const stripped = url.replace(/username=[^&]+&?/i, '').replace(/password=[^&]+&?/i, '');
    let hash = 0;
    for (let i = 0; i < stripped.length; i++) hash = ((hash << 5) - hash + stripped.charCodeAt(i)) | 0;
    return CACHE_PREFIX + Math.abs(hash).toString(36);
  }

  function readCache(url, ttlMs) {
    try {
      const raw = localStorage.getItem(cacheKeyFor(url));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || (Date.now() - obj.ts) > ttlMs) return null;
      return obj.data;
    } catch (e) { return null; }
  }

  function writeCache(url, data) {
    try {
      localStorage.setItem(cacheKeyFor(url), JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
      try { pruneCache(); localStorage.setItem(cacheKeyFor(url), JSON.stringify({ ts: Date.now(), data })); }
      catch (e2) { /* quota — give up */ }
    }
  }

  function pruneCache() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        try {
          const v = JSON.parse(localStorage.getItem(k));
          entries.push({ k, ts: v.ts || 0 });
        } catch (e) { localStorage.removeItem(k); }
      }
    }
    entries.sort((a, b) => a.ts - b.ts);
    entries.slice(0, Math.ceil(entries.length / 2)).forEach(e => localStorage.removeItem(e.k));
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text) return [];
    try { return JSON.parse(text); } catch (e) { throw new Error('Invalid JSON'); }
  }

  async function cachedFetch(url, ttlMs) {
    const hit = readCache(url, ttlMs);
    if (hit) {
      // Refresh in the background so next visit is fresh, but return cache now.
      fetchJSON(url).then(fresh => writeCache(url, fresh)).catch(() => {});
      return hit;
    }
    const data = await fetchJSON(url);
    writeCache(url, data);
    return data;
  }

  const TTL = {
    categories: 24 * 60 * 60 * 1000, // 24h — rarely changes
    streams:    30 * 60 * 1000,      // 30min
    info:       60 * 60 * 1000,      // 1h
  };

  class XtreamClient {
    constructor({ host, username, password }) {
      this.host = normalizeHost(host);
      this.username = username;
      this.password = password;
    }

    _api(params) {
      const base = `${this.host}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
      return params ? `${base}&${params}` : base;
    }

    async auth() {
      const data = await fetchJSON(this._api());
      if (!data || !data.user_info) throw new Error('Login failed');
      if (String(data.user_info.auth) === '0') throw new Error('Invalid credentials');
      return data;
    }

    getLiveCategories()   { return cachedFetch(this._api('action=get_live_categories'), TTL.categories); }
    getVodCategories()    { return cachedFetch(this._api('action=get_vod_categories'), TTL.categories); }
    getSeriesCategories() { return cachedFetch(this._api('action=get_series_categories'), TTL.categories); }

    getLiveStreams(categoryId) {
      const q = 'action=get_live_streams' + (categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '');
      return cachedFetch(this._api(q), TTL.streams);
    }
    getVodStreams(categoryId) {
      const q = 'action=get_vod_streams' + (categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '');
      return cachedFetch(this._api(q), TTL.streams);
    }
    getSeries(categoryId) {
      const q = 'action=get_series' + (categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '');
      return cachedFetch(this._api(q), TTL.streams);
    }
    getSeriesInfo(seriesId) {
      return cachedFetch(this._api(`action=get_series_info&series_id=${encodeURIComponent(seriesId)}`), TTL.info);
    }
    getVodInfo(vodId) {
      return cachedFetch(this._api(`action=get_vod_info&vod_id=${encodeURIComponent(vodId)}`), TTL.info);
    }
    getShortEPG(streamId, limit = 6) {
      return fetchJSON(this._api(`action=get_short_epg&stream_id=${encodeURIComponent(streamId)}&limit=${limit}`));
    }

    liveStreamUrl(streamId, ext = 'm3u8') {
      return `${this.host}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${ext}`;
    }
    vodStreamUrl(streamId, ext) {
      const e = ext || 'mp4';
      return `${this.host}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${e}`;
    }
    seriesStreamUrl(episodeId, ext) {
      const e = ext || 'mp4';
      return `${this.host}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${episodeId}.${e}`;
    }
  }

  window.XtreamClient = XtreamClient;
})();

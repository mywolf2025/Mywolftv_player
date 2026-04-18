(function () {
  'use strict';

  function normalizeHost(host) {
    let h = (host || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
    return h;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!text) return [];
    try { return JSON.parse(text); } catch (e) { throw new Error('Invalid JSON'); }
  }

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

    getLiveCategories() { return fetchJSON(this._api('action=get_live_categories')); }
    getVodCategories() { return fetchJSON(this._api('action=get_vod_categories')); }
    getSeriesCategories() { return fetchJSON(this._api('action=get_series_categories')); }

    getLiveStreams(categoryId) {
      const q = 'action=get_live_streams' + (categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '');
      return fetchJSON(this._api(q));
    }
    getVodStreams(categoryId) {
      const q = 'action=get_vod_streams' + (categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '');
      return fetchJSON(this._api(q));
    }
    getSeries(categoryId) {
      const q = 'action=get_series' + (categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '');
      return fetchJSON(this._api(q));
    }
    getSeriesInfo(seriesId) {
      return fetchJSON(this._api(`action=get_series_info&series_id=${encodeURIComponent(seriesId)}`));
    }
    getVodInfo(vodId) {
      return fetchJSON(this._api(`action=get_vod_info&vod_id=${encodeURIComponent(vodId)}`));
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

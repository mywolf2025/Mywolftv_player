(function () {
  'use strict';

  const PLAYLISTS_KEY = 'mywolftv.playlists';
  const ACTIVE_KEY = 'mywolftv.active';
  const FAVS_KEY = 'mywolftv.favorites';
  const SETTINGS_KEY = 'mywolftv.settings';
  const HISTORY_KEY = 'mywolftv.history';
  const HISTORY_LIMIT = 30;
  const RESUME_KEY = 'mywolftv.resume';
  const DEVICE_KEY = 'mywolftv.deviceId';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  const Storage = {
    getPlaylists() {
      return read(PLAYLISTS_KEY, []);
    },
    savePlaylist(playlist) {
      const list = Storage.getPlaylists();
      const existing = list.findIndex(p => p.id === playlist.id);
      if (existing >= 0) list[existing] = playlist;
      else list.push(playlist);
      write(PLAYLISTS_KEY, list);
      return playlist;
    },
    removePlaylist(id) {
      const list = Storage.getPlaylists().filter(p => p.id !== id);
      write(PLAYLISTS_KEY, list);
      const active = Storage.getActive();
      if (active && active.id === id) Storage.clearActive();
    },
    getActive() {
      return read(ACTIVE_KEY, null);
    },
    setActive(playlist) {
      write(ACTIVE_KEY, playlist);
    },
    clearActive() {
      localStorage.removeItem(ACTIVE_KEY);
    },
    getFavorites(playlistId) {
      const all = read(FAVS_KEY, {});
      return all[playlistId] || { live: [], movies: [], series: [] };
    },
    toggleFavorite(playlistId, kind, id) {
      const all = read(FAVS_KEY, {});
      const current = all[playlistId] || { live: [], movies: [], series: [] };
      const arr = current[kind] || [];
      const idx = arr.indexOf(id);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(id);
      current[kind] = arr;
      all[playlistId] = current;
      write(FAVS_KEY, all);
      return idx < 0;
    },
    isFavorite(playlistId, kind, id) {
      const favs = Storage.getFavorites(playlistId);
      return (favs[kind] || []).includes(id);
    },
    getSettings() {
      return read(SETTINGS_KEY, { autoplay: true, preferredQuality: 'auto' });
    },
    saveSettings(settings) {
      write(SETTINGS_KEY, settings);
    },
    getHistory(playlistId) {
      const all = read(HISTORY_KEY, {});
      return all[playlistId] || { live: [], movies: [], series: [] };
    },
    addHistory(playlistId, kind, entry) {
      const all = read(HISTORY_KEY, {});
      const current = all[playlistId] || { live: [], movies: [], series: [] };
      const arr = current[kind] || [];
      const idx = arr.findIndex(e => String(e.id) === String(entry.id));
      if (idx >= 0) arr.splice(idx, 1);
      arr.unshift({ ...entry, ts: Date.now() });
      if (arr.length > HISTORY_LIMIT) arr.length = HISTORY_LIMIT;
      current[kind] = arr;
      all[playlistId] = current;
      write(HISTORY_KEY, all);
    },
    clearHistory(playlistId, kind) {
      const all = read(HISTORY_KEY, {});
      if (!all[playlistId]) return;
      if (kind) all[playlistId][kind] = [];
      else all[playlistId] = { live: [], movies: [], series: [] };
      write(HISTORY_KEY, all);
    },
    clearFavorites(playlistId, kind) {
      const all = read(FAVS_KEY, {});
      if (!all[playlistId]) return;
      if (kind) all[playlistId][kind] = [];
      else all[playlistId] = { live: [], movies: [], series: [] };
      write(FAVS_KEY, all);
    },
    getResume(playlistId, kind, id) {
      const all = read(RESUME_KEY, {});
      const k = `${playlistId}|${kind}|${id}`;
      return all[k] || null;
    },
    saveResume(playlistId, kind, id, position, duration) {
      if (!position || position < 15) return;
      if (duration && position > duration - 30) {
        Storage.clearResume(playlistId, kind, id);
        return;
      }
      const all = read(RESUME_KEY, {});
      const k = `${playlistId}|${kind}|${id}`;
      all[k] = { position, duration: duration || 0, ts: Date.now() };
      const keys = Object.keys(all);
      if (keys.length > 200) {
        keys.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0));
        keys.slice(0, 50).forEach(x => delete all[x]);
      }
      write(RESUME_KEY, all);
    },
    clearResume(playlistId, kind, id) {
      const all = read(RESUME_KEY, {});
      const k = `${playlistId}|${kind}|${id}`;
      if (all[k]) { delete all[k]; write(RESUME_KEY, all); }
    },
    clearAllResume() {
      localStorage.removeItem(RESUME_KEY);
    },
    getDeviceId() {
      let id = read(DEVICE_KEY, null);
      if (!id) {
        id = 'MW-' + Math.random().toString(36).slice(2, 6).toUpperCase()
          + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        write(DEVICE_KEY, id);
      }
      return id;
    },
    clearAll() {
      [PLAYLISTS_KEY, ACTIVE_KEY, FAVS_KEY, SETTINGS_KEY, HISTORY_KEY, RESUME_KEY].forEach(k => localStorage.removeItem(k));
    },
  };

  window.MWStorage = Storage;
})();

(function () {
  'use strict';

  const PLAYLISTS_KEY = 'mywolftv.playlists';
  const ACTIVE_KEY = 'mywolftv.active';
  const FAVS_KEY = 'mywolftv.favorites';
  const SETTINGS_KEY = 'mywolftv.settings';

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
  };

  window.MWStorage = Storage;
})();

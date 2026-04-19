(function () {
  'use strict';

  // Auto-open directly into the active playlist unless the user
  // explicitly requested the chooser (e.g. from Settings → Switch).
  (function autoOpen() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.has('choose') || params.has('add')) return;
      const active = MWStorage.getActive();
      if (active) {
        window.location.replace('player.html');
      }
    } catch (e) {}
  })();

  const toast = document.getElementById('toast');
  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.className = 'toast'; }, 3200);
  }

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      document.getElementById(target + '-form').classList.add('active');
    });
  });

  function uid() {
    return 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function setLoading(button, loading) {
    if (loading) {
      button.dataset.orig = button.innerHTML;
      button.innerHTML = '<span class="spinner"></span>';
      button.disabled = true;
    } else {
      button.innerHTML = button.dataset.orig || button.innerHTML;
      button.disabled = false;
    }
  }

  // Xtream form
  document.getElementById('xtream-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type=submit]');
    const name = form.name.value.trim();
    const host = form.host.value.trim();
    const username = form.username.value.trim();
    const password = form.password.value.trim();

    setLoading(btn, true);
    try {
      const client = new XtreamClient({ host, username, password });
      const info = await client.auth();
      const playlist = {
        id: uid(),
        type: 'xtream',
        name,
        host: client.host,
        username,
        password,
        userInfo: info.user_info || null,
        serverInfo: info.server_info || null,
        createdAt: Date.now(),
      };
      MWStorage.savePlaylist(playlist);
      MWStorage.setActive(playlist);
      showToast('Connected successfully', 'success');
      setTimeout(() => { window.location.href = 'player.html'; }, 500);
    } catch (err) {
      showToast('Login failed: ' + err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  // M3U form
  document.getElementById('m3u-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type=submit]');
    const name = form.name.value.trim();
    const url = form.url.value.trim();
    const epg = form.epg.value.trim();

    setLoading(btn, true);
    try {
      // Light validation: try HEAD-free fetch of first bytes
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
        throw new Error('Not a valid M3U playlist');
      }
      const playlist = {
        id: uid(),
        type: 'm3u',
        name,
        url,
        epg,
        createdAt: Date.now(),
      };
      MWStorage.savePlaylist(playlist);
      MWStorage.setActive(playlist);
      showToast('Playlist loaded', 'success');
      setTimeout(() => { window.location.href = 'player.html'; }, 400);
    } catch (err) {
      showToast('Load failed: ' + err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  // Pair Code form
  const pairForm = document.getElementById('pair-form');
  if (pairForm) {
    pairForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('button[type=submit]');
      const code = form.code.value.trim();
      if (!code) return;
      setLoading(btn, true);
      try {
        const cfg = await MWPair.fetch(code);
        if (!cfg || !cfg.type) throw new Error('Invalid pair payload');
        const playlist = { ...cfg, id: uid(), createdAt: Date.now() };
        if (playlist.type === 'xtream') {
          const client = new XtreamClient(playlist);
          const info = await client.auth();
          playlist.host = client.host;
          playlist.userInfo = info.user_info || null;
          playlist.serverInfo = info.server_info || null;
        }
        MWStorage.savePlaylist(playlist);
        MWStorage.setActive(playlist);
        showToast('Paired successfully', 'success');
        setTimeout(() => { window.location.href = 'player.html'; }, 500);
      } catch (err) {
        showToast('Pair failed: ' + err.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // Saved playlists
  function renderSaved() {
    const container = document.getElementById('saved-playlists');
    const playlists = MWStorage.getPlaylists();
    container.innerHTML = '';
    if (!playlists.length) return;

    const title = document.createElement('div');
    title.className = 'saved-title';
    title.textContent = 'Saved Playlists';
    container.appendChild(title);

    playlists.forEach(pl => {
      const el = document.createElement('div');
      el.className = 'saved-item';
      const subtitle = pl.type === 'xtream' ? pl.host : pl.url;
      el.innerHTML = `
        <div class="saved-item-info">
          <div class="saved-item-name">${escapeHtml(pl.name)}</div>
          <div class="saved-item-host">${escapeHtml(subtitle || '')}</div>
        </div>
        <button class="saved-item-del" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>`;
      el.querySelector('.saved-item-info').addEventListener('click', () => {
        MWStorage.setActive(pl);
        window.location.href = 'player.html';
      });
      el.querySelector('.saved-item-del').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Remove "' + pl.name + '"?')) {
          MWStorage.removePlaylist(pl.id);
          renderSaved();
        }
      });
      container.appendChild(el);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  renderSaved();

  // If we were asked to show the chooser, surface a "Back to app" shortcut.
  const active = MWStorage.getActive();
  if (active) {
    const saved = document.getElementById('saved-playlists');
    if (saved) {
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;text-align:center;font-size:13px;color:var(--text-dim)';
      hint.innerHTML = `<a href="player.html">← Back to "${escapeHtml(active.name)}"</a>`;
      saved.appendChild(hint);
    }
  }
})();

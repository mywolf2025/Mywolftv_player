(function () {
  'use strict';

  const active = MWStorage.getActive();
  if (!active) {
    window.location.href = 'index.html';
    return;
  }

  // ========== State ==========
  const state = {
    view: 'live', // live | movies | series | favorites | search | settings
    categories: { live: [], movies: [], series: [] },
    items: { live: [], movies: [], series: [] }, // flattened lists
    cache: { live: {}, movies: {}, series: {} }, // keyed by category_id
    selectedCategory: { live: '*', movies: '*', series: '*' }, // '*' = all
    userPickedCategory: { live: false, movies: false, series: false },
    filter: '',
    loading: false,
  };

  let client = null;
  if (active.type === 'xtream') {
    client = new XtreamClient(active);
  }

  // ========== DOM ==========
  const $ = (sel) => document.querySelector(sel);
  const viewTitle = $('#view-title');
  const playlistName = $('#playlist-name');
  const categoryList = $('#category-list');
  const itemsGrid = $('#items-grid');
  const emptyState = $('#empty-state');
  const search = $('#category-search');
  const toast = $('#toast');
  const playerModal = $('#player-modal');
  const video = $('#video');
  const playerTitle = $('#player-title');
  const playerProgram = $('#player-program');
  const playerLogo = $('#player-logo');
  const epgPanel = $('#epg-panel');
  const favBtn = $('#player-fav');
  const clockEl = $('#clock');

  playlistName.textContent = active.name;

  const player = new MWPlayer(video);

  // ========== Helpers ==========
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.className = 'toast'; }, 3000);
  }
  function setLoading(msg) {
    emptyState.hidden = false;
    emptyState.querySelector('p').textContent = msg || 'Loading...';
    itemsGrid.innerHTML = '';
    const stale = itemsGrid.parentElement.querySelector('.load-more-btn');
    if (stale) stale.remove();
    state.renderCtx = null;
  }
  function clearLoading() {
    emptyState.hidden = true;
  }

  // ========== Clock ==========
  function tickClock() {
    const d = new Date();
    clockEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tickClock();
  setInterval(tickClock, 15000);

  // ========== Navigation ==========
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      switchView(view);
    });
  });

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.getAttribute('data-view') === view);
    });
    const titles = { live: 'Live TV', movies: 'Movies', series: 'Series', favorites: 'Favorites', recent: 'Recently Played', search: 'Search', settings: 'Settings' };
    viewTitle.textContent = titles[view] || view;

    if (view === 'settings') {
      renderSettings();
      return;
    }
    if (view === 'search') {
      renderSearch();
      return;
    }
    if (view === 'favorites') {
      renderFavorites();
      return;
    }
    if (view === 'recent') {
      renderRecent();
      return;
    }
    loadView(view);
  }

  $('#logout-btn').addEventListener('click', () => {
    if (confirm('Log out of this playlist?')) {
      MWStorage.clearActive();
      player.destroy();
      window.location.href = 'index.html';
    }
  });

  // ========== Data loading ==========
  async function loadView(view) {
    if (view === 'favorites' || view === 'search' || view === 'settings') return;

    categoryList.style.display = '';
    setLoading('Loading ' + view + '...');

    try {
      if (active.type === 'xtream') {
        await loadXtreamView(view);
      } else {
        await loadM3UView(view);
      }
    } catch (err) {
      showToast('Failed to load: ' + err.message, 'error');
      emptyState.querySelector('p').textContent = 'Unable to load content';
    }
  }

  async function loadXtreamView(view) {
    if (!state.categories[view].length) {
      let cats = [];
      if (view === 'live') cats = await client.getLiveCategories();
      else if (view === 'movies') cats = await client.getVodCategories();
      else if (view === 'series') cats = await client.getSeriesCategories();
      state.categories[view] = Array.isArray(cats) ? cats : [];
    }

    // For big playlists, avoid defaulting to "All" — pick first category.
    if (
      state.selectedCategory[view] === '*' &&
      !state.userPickedCategory[view] &&
      state.categories[view].length > 0
    ) {
      state.selectedCategory[view] = String(state.categories[view][0].category_id);
    }

    renderCategories(view);
    await loadCategoryItems(view, state.selectedCategory[view]);
  }

  async function loadCategoryItems(view, categoryId) {
    setLoading('Loading...');
    let items;
    if (categoryId === '*') {
      if (!state.cache[view]['*']) {
        if (view === 'live') items = await client.getLiveStreams();
        else if (view === 'movies') items = await client.getVodStreams();
        else if (view === 'series') items = await client.getSeries();
        state.cache[view]['*'] = Array.isArray(items) ? items : [];
      }
      items = state.cache[view]['*'];
    } else {
      if (!state.cache[view][categoryId]) {
        if (view === 'live') items = await client.getLiveStreams(categoryId);
        else if (view === 'movies') items = await client.getVodStreams(categoryId);
        else if (view === 'series') items = await client.getSeries(categoryId);
        items = Array.isArray(items) ? items : [];
        // Some Xtream servers ignore category_id and return everything.
        // If the payload is large, filter by category_id client-side.
        if (items.length > 800) {
          items = items.filter(it => String(it.category_id) === String(categoryId));
        }
        state.cache[view][categoryId] = items;
      }
      items = state.cache[view][categoryId];
    }
    renderItems(view, items);
  }

  async function loadM3UView(view) {
    // M3U only supports Live (in this player)
    if (view !== 'live') {
      categoryList.style.display = 'none';
      itemsGrid.innerHTML = '';
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'M3U playlists only support Live TV. Use Xtream Codes login for Movies and Series.';
      return;
    }
    if (!state.cache.live._m3u) {
      const items = await M3U.loadM3U(active.url);
      state.cache.live._m3u = items;
      // Build categories from groups
      const groups = {};
      for (const it of items) {
        groups[it.group] = (groups[it.group] || 0) + 1;
      }
      state.categories.live = Object.keys(groups).map(name => ({
        category_id: name,
        category_name: name,
        count: groups[name],
      }));
    }
    renderCategories('live');

    const selCat = state.selectedCategory.live;
    const all = state.cache.live._m3u;
    const items = selCat === '*' ? all : all.filter(it => it.group === selCat);
    renderItems('live', items);
  }

  // ========== Rendering ==========
  function renderCategories(view) {
    const cats = state.categories[view];
    const selected = state.selectedCategory[view];

    categoryList.innerHTML = '';
    const all = document.createElement('div');
    all.className = 'category-item' + (selected === '*' ? ' active' : '');
    all.innerHTML = `<span>All</span>`;
    all.addEventListener('click', () => {
      state.selectedCategory[view] = '*';
      state.userPickedCategory[view] = true;
      loadView(view);
    });
    categoryList.appendChild(all);

    cats.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'category-item' + (selected === String(cat.category_id) ? ' active' : '');
      const count = cat.count ? `<span class="category-count">${cat.count}</span>` : '';
      el.innerHTML = `<span title="${escapeHtml(cat.category_name)}">${escapeHtml(cat.category_name)}</span>${count}`;
      el.addEventListener('click', () => {
        state.selectedCategory[view] = String(cat.category_id);
        state.userPickedCategory[view] = true;
        loadView(view);
      });
      categoryList.appendChild(el);
    });
  }

  const PAGE_SIZE = 36;

  function renderItems(view, items) {
    clearLoading();
    itemsGrid.className = 'items-grid';

    const filter = state.filter.toLowerCase();
    const filtered = filter
      ? items.filter(it => {
          const n = (it.name || it.title || '').toLowerCase();
          return n.includes(filter);
        })
      : items;

    if (!filtered.length) {
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'No items found';
      return;
    }

    state.renderCtx = { view, filtered, offset: 0 };
    itemsGrid.innerHTML = '';
    appendPage();
  }

  function appendPage() {
    const ctx = state.renderCtx;
    if (!ctx) return;
    const { view, filtered } = ctx;
    const start = ctx.offset;
    const end = Math.min(start + PAGE_SIZE, filtered.length);
    if (start >= filtered.length) return;

    const favs = MWStorage.getFavorites(active.id);
    const kind = view;
    const favIds = new Set((favs[kind] || []).map(String));

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const it = filtered[i];
      const id = String(it.stream_id || it.series_id || it.id);
      const name = it.name || it.title || 'Unknown';
      const logo = it.stream_icon || it.cover || it.logo || '';
      const isChannel = view === 'live';
      const card = document.createElement('div');
      card.className = 'item-card' + (isChannel ? ' channel' : '');
      card.setAttribute('tabindex', '0');
      const fav = favIds.has(id) ? 'active' : '';
      const extra = (!isChannel && it.rating) ? `<div class="item-meta">${escapeHtml(it.rating)}</div>` : '';
      const posterHtml = logo
        ? `<img class="item-poster" src="${escapeHtml(logo)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'" />`
        : `<div class="item-poster" style="display:grid;place-items:center;color:#5f6690;font-size:11px;">No Image</div>`;
      card.innerHTML = `
        ${posterHtml}
        <button class="item-fav ${fav}" data-fav title="Favorite" tabindex="-1">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <div class="item-body">
          <div class="item-name">${escapeHtml(name)}</div>
          ${extra}
        </div>`;
      card.querySelector('[data-fav]').addEventListener('click', (e) => {
        e.stopPropagation();
        const added = MWStorage.toggleFavorite(active.id, kind, id);
        e.currentTarget.classList.toggle('active', added);
      });
      card.addEventListener('click', () => openItem(view, it));
      frag.appendChild(card);
    }
    itemsGrid.appendChild(frag);
    ctx.offset = end;

    // Remove any existing "load more" button
    const existingMore = itemsGrid.parentElement.querySelector('.load-more-btn');
    if (existingMore) existingMore.remove();

    if (end < filtered.length) {
      const btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.setAttribute('tabindex', '0');
      btn.textContent = `Show more (${filtered.length - end} remaining)`;
      btn.addEventListener('click', () => {
        btn.remove();
        appendPage();
      });
      itemsGrid.parentElement.appendChild(btn);
    }
  }

  // ========== Playback ==========
  async function openItem(view, item) {
    let url, title, logo, streamId;
    if (view === 'live') {
      title = item.name || 'Live channel';
      logo = item.stream_icon || item.logo || '';
      if (active.type === 'xtream') {
        streamId = item.stream_id;
        url = client.liveStreamUrl(streamId);
      } else {
        url = item.url;
      }
    } else if (view === 'movies') {
      title = item.name || item.title || 'Movie';
      logo = item.stream_icon || item.cover || '';
      streamId = item.stream_id;
      url = client.vodStreamUrl(streamId, item.container_extension);
    } else if (view === 'series') {
      // Fetch series info and pick first episode
      try {
        const info = await client.getSeriesInfo(item.series_id);
        const seasons = info.episodes || {};
        const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
        if (!seasonKeys.length) throw new Error('No episodes');
        const firstEp = seasons[seasonKeys[0]][0];
        title = (item.name || 'Series') + ' — S' + seasonKeys[0] + 'E' + (firstEp.episode_num || '1');
        logo = item.cover || firstEp.info?.movie_image || '';
        url = client.seriesStreamUrl(firstEp.id, firstEp.container_extension);
      } catch (err) {
        showToast('Unable to load series: ' + err.message, 'error');
        return;
      }
    }

    playerTitle.textContent = title;
    playerProgram.textContent = '';
    if (logo) { playerLogo.src = logo; playerLogo.style.display = ''; } else { playerLogo.style.display = 'none'; }

    try {
      const histId = String(item.stream_id || item.series_id || item.id);
      MWStorage.addHistory(active.id, view, { id: histId, name: title, logo });
    } catch (e) {}

    const kind = view;
    const id = String(item.stream_id || item.series_id || item.id);
    const isFav = MWStorage.isFavorite(active.id, kind, id);
    favBtn.classList.toggle('active', isFav);
    favBtn.onclick = () => {
      const added = MWStorage.toggleFavorite(active.id, kind, id);
      favBtn.classList.toggle('active', added);
    };

    epgPanel.innerHTML = '';
    playerModal.hidden = false;
    player.play(url, {
      onError: (data) => {
        showToast('Playback error: ' + (data.details || 'stream unavailable'), 'error');
      },
    });

    // Load EPG for live channels (Xtream only)
    if (view === 'live' && active.type === 'xtream' && streamId) {
      loadEpg(streamId).catch(() => {});
    }
  }

  async function loadEpg(streamId) {
    try {
      const data = await client.getShortEPG(streamId, 6);
      const list = data?.epg_listings || [];
      if (!list.length) return;
      const now = Date.now() / 1000;
      let currentTitle = '';
      const rows = list.map(ev => {
        const start = Number(ev.start_timestamp || 0);
        const end = Number(ev.stop_timestamp || 0);
        const isNow = now >= start && now < end;
        if (isNow) currentTitle = decodeB64(ev.title);
        const time = new Date(start * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<div class="epg-row ${isNow ? 'now' : ''}">
          <div class="epg-time">${time}</div>
          <div class="epg-title">${escapeHtml(decodeB64(ev.title))}</div>
        </div>`;
      }).join('');
      epgPanel.innerHTML = rows;
      if (currentTitle) playerProgram.textContent = 'Now: ' + currentTitle;
    } catch (e) { /* ignore */ }
  }

  function decodeB64(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { return s; }
  }

  $('#player-close').addEventListener('click', closePlayer);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !playerModal.hidden) closePlayer();
  });

  function closePlayer() {
    playerModal.hidden = true;
    player.destroy();
  }

  // ========== Search ==========
  function renderSearch() {
    categoryList.style.display = '';
    categoryList.innerHTML = `
      <div class="category-item active">All content</div>
    `;
    itemsGrid.innerHTML = '';
    emptyState.hidden = false;
    emptyState.querySelector('p').textContent = 'Type in the search box to find content across Live, Movies, and Series';
  }

  search.addEventListener('input', () => {
    state.filter = search.value.trim();
    if (state.view === 'search') {
      runSearch();
    } else if (state.view === 'favorites') {
      renderFavorites();
    } else {
      const items = currentItems();
      renderItems(state.view, items);
    }
  });

  function currentItems() {
    const view = state.view;
    if (active.type === 'm3u' && view === 'live') {
      const sel = state.selectedCategory.live;
      const all = state.cache.live._m3u || [];
      return sel === '*' ? all : all.filter(it => it.group === sel);
    }
    const sel = state.selectedCategory[view];
    return state.cache[view][sel] || [];
  }

  async function runSearch() {
    if (!state.filter) {
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'Type in the search box to find content';
      itemsGrid.innerHTML = '';
      return;
    }
    setLoading('Searching...');
    const results = [];
    const q = state.filter.toLowerCase();

    if (active.type === 'xtream') {
      // Ensure "all" lists are loaded (once)
      const views = ['live', 'movies', 'series'];
      for (const v of views) {
        if (!state.cache[v]['*']) {
          try {
            let data;
            if (v === 'live') data = await client.getLiveStreams();
            else if (v === 'movies') data = await client.getVodStreams();
            else data = await client.getSeries();
            state.cache[v]['*'] = Array.isArray(data) ? data : [];
          } catch (e) { state.cache[v]['*'] = []; }
        }
      }
      for (const v of views) {
        for (const it of state.cache[v]['*']) {
          const n = (it.name || it.title || '').toLowerCase();
          if (n.includes(q)) results.push({ view: v, item: it });
          if (results.length >= 400) break;
        }
      }
    } else {
      const items = state.cache.live._m3u || [];
      for (const it of items) {
        if ((it.name || '').toLowerCase().includes(q)) {
          results.push({ view: 'live', item: it });
        }
      }
    }

    renderMixed(results);
  }

  function renderMixed(results) {
    clearLoading();
    if (!results.length) {
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'No results found';
      itemsGrid.innerHTML = '';
      return;
    }
    const frag = document.createDocumentFragment();
    results.slice(0, 300).forEach(({ view, item }) => {
      const name = item.name || item.title || 'Unknown';
      const logo = item.stream_icon || item.cover || item.logo || '';
      const isChannel = view === 'live';
      const card = document.createElement('div');
      card.className = 'item-card' + (isChannel ? ' channel' : '');
      const badge = `<div class="item-badge">${view}</div>`;
      const posterHtml = logo
        ? `<img class="item-poster" src="${escapeHtml(logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
        : `<div class="item-poster" style="display:grid;place-items:center;color:#5f6690;font-size:11px;">No Image</div>`;
      card.innerHTML = `
        ${posterHtml}
        ${badge}
        <div class="item-body">
          <div class="item-name">${escapeHtml(name)}</div>
        </div>`;
      card.addEventListener('click', () => openItem(view, item));
      frag.appendChild(card);
    });
    itemsGrid.innerHTML = '';
    itemsGrid.appendChild(frag);
  }

  // ========== Favorites ==========
  async function renderFavorites() {
    categoryList.style.display = '';
    categoryList.innerHTML = '';
    ['live', 'movies', 'series'].forEach(kind => {
      const count = (MWStorage.getFavorites(active.id)[kind] || []).length;
      const el = document.createElement('div');
      el.className = 'category-item' + (state.selectedCategory.favs === kind ? ' active' : '');
      el.innerHTML = `<span>${kind.charAt(0).toUpperCase() + kind.slice(1)}</span><span class="category-count">${count}</span>`;
      el.addEventListener('click', () => {
        state.selectedCategory.favs = kind;
        renderFavorites();
      });
      categoryList.appendChild(el);
    });
    if (!state.selectedCategory.favs) state.selectedCategory.favs = 'live';

    const kind = state.selectedCategory.favs;
    const favIds = (MWStorage.getFavorites(active.id)[kind] || []).map(String);
    if (!favIds.length) {
      itemsGrid.innerHTML = '';
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'No favorites yet — tap the heart icon on any channel, movie, or series.';
      return;
    }
    setLoading('Loading favorites...');

    // Ensure all items are loaded
    if (active.type === 'xtream') {
      if (!state.cache[kind]['*']) {
        try {
          let data;
          if (kind === 'live') data = await client.getLiveStreams();
          else if (kind === 'movies') data = await client.getVodStreams();
          else data = await client.getSeries();
          state.cache[kind]['*'] = Array.isArray(data) ? data : [];
        } catch (e) {
          state.cache[kind]['*'] = [];
        }
      }
      const all = state.cache[kind]['*'];
      const items = all.filter(it => favIds.includes(String(it.stream_id || it.series_id || it.id)));
      renderItems(kind, items);
    } else {
      const items = (state.cache.live._m3u || []).filter(it => favIds.includes(String(it.id)));
      renderItems('live', items);
    }
  }

  // ========== Settings ==========
  function renderSettings() {
    categoryList.style.display = 'none';
    itemsGrid.className = 'items-grid list';
    itemsGrid.innerHTML = '';
    emptyState.hidden = true;

    const wrap = document.createElement('div');
    wrap.className = 'settings-wrap';

    const u = active.userInfo || {};
    const s = active.serverInfo || {};
    const expiry = u.exp_date ? new Date(Number(u.exp_date) * 1000).toLocaleDateString() : '—';
    const settings = MWStorage.getSettings();
    const hist = MWStorage.getHistory(active.id);
    const favs = MWStorage.getFavorites(active.id);
    const playlists = MWStorage.getPlaylists();

    wrap.innerHTML = `
      <div class="settings-section">
        <h3>Playlist Info</h3>
        <div class="info-row"><span class="label">Name</span><span class="value">${escapeHtml(active.name)}</span></div>
        <div class="info-row"><span class="label">Type</span><span class="value">${active.type === 'xtream' ? 'Xtream Codes' : 'M3U URL'}</span></div>
        <div class="info-row"><span class="label">${active.type === 'xtream' ? 'Host' : 'URL'}</span><span class="value">${escapeHtml(active.type === 'xtream' ? active.host : active.url)}</span></div>
        ${active.type === 'xtream' ? `
          <div class="info-row"><span class="label">Username</span><span class="value">${escapeHtml(active.username)}</span></div>
          <div class="info-row"><span class="label">Status</span><span class="value">${escapeHtml(u.status || '—')}</span></div>
          <div class="info-row"><span class="label">Expires</span><span class="value">${expiry}</span></div>
          <div class="info-row"><span class="label">Connections</span><span class="value">${escapeHtml(u.active_cons || '0')} / ${escapeHtml(u.max_connections || '—')}</span></div>
          <div class="info-row"><span class="label">Server</span><span class="value">${escapeHtml(s.url || '—')}</span></div>
        ` : ''}
      </div>

      <div class="settings-section">
        <h3>Playback</h3>
        <div class="info-row">
          <span class="label">Autoplay</span>
          <span class="value"><input type="checkbox" id="setting-autoplay" ${settings.autoplay ? 'checked' : ''}></span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Watch History</h3>
        <div class="info-row"><span class="label">Live TV</span><span class="value">${(hist.live || []).length} items</span></div>
        <div class="info-row"><span class="label">Movies</span><span class="value">${(hist.movies || []).length} items</span></div>
        <div class="info-row"><span class="label">Series</span><span class="value">${(hist.series || []).length} items</span></div>
        <div class="settings-actions">
          <button class="btn-setting" data-act="clear-hist" data-kind="live">Clear Live History</button>
          <button class="btn-setting" data-act="clear-hist" data-kind="movies">Clear Movies History</button>
          <button class="btn-setting" data-act="clear-hist" data-kind="series">Clear Series History</button>
          <button class="btn-setting btn-danger" data-act="clear-hist">Clear All History</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Favorites</h3>
        <div class="info-row"><span class="label">Live TV</span><span class="value">${(favs.live || []).length} items</span></div>
        <div class="info-row"><span class="label">Movies</span><span class="value">${(favs.movies || []).length} items</span></div>
        <div class="info-row"><span class="label">Series</span><span class="value">${(favs.series || []).length} items</span></div>
        <div class="settings-actions">
          <button class="btn-setting" data-act="clear-fav" data-kind="live">Clear Live Favorites</button>
          <button class="btn-setting" data-act="clear-fav" data-kind="movies">Clear Movie Favorites</button>
          <button class="btn-setting" data-act="clear-fav" data-kind="series">Clear Series Favorites</button>
          <button class="btn-setting btn-danger" data-act="clear-fav">Clear All Favorites</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Manage Playlists</h3>
        <div class="info-row"><span class="label">Saved playlists</span><span class="value">${playlists.length}</span></div>
        <div class="settings-actions">
          <button class="btn-setting" data-act="switch">Switch / Add Playlist</button>
          <button class="btn-setting" data-act="refresh">Refresh Cached Data</button>
          <button class="btn-setting btn-danger" data-act="remove-active">Remove This Playlist</button>
          <button class="btn-setting btn-danger" data-act="reset-all">Reset Everything</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Pair Device / Easy Setup</h3>
        <p class="settings-desc">Don't want to type on the TV remote? Open the setup page on your phone, enter your login, and paste the short code here.</p>
        <div class="info-row"><span class="label">Setup page</span><span class="value"><a href="https://mywolf2025.github.io/Mywolftv_player/setup.html" target="_blank" rel="noopener">mywolf2025.github.io/Mywolftv_player/setup.html</a></span></div>
        <div class="pair-row">
          <input type="text" id="pair-code-input" placeholder="Enter 3–8 character code" maxlength="12" autocapitalize="off" autocorrect="off" />
          <button class="btn-setting btn-primary-inline" data-act="pair-apply">Apply Code</button>
        </div>
        <div id="pair-status" class="pair-status"></div>
      </div>

      <div class="settings-section">
        <h3>About</h3>
        <div class="info-row"><span class="label">App</span><span class="value">MyWolf TV Player</span></div>
        <div class="info-row"><span class="label">Version</span><span class="value">1.1.0</span></div>
        <div class="info-row"><span class="label">Website</span><span class="value"><a href="https://mywolftv.com" target="_blank" rel="noopener">mywolftv.com</a></span></div>
      </div>
    `;

    itemsGrid.appendChild(wrap);

    const chk = document.getElementById('setting-autoplay');
    chk.addEventListener('change', () => {
      const st = MWStorage.getSettings();
      st.autoplay = chk.checked;
      MWStorage.saveSettings(st);
    });

    wrap.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleSettingAction(btn.dataset.act, btn.dataset.kind));
    });
  }

  function handleSettingAction(act, kind) {
    if (act === 'clear-hist') {
      const label = kind ? kind : 'all';
      if (!confirm('Clear ' + label + ' history?')) return;
      MWStorage.clearHistory(active.id, kind || null);
      showToast('History cleared', 'success');
      renderSettings();
    } else if (act === 'clear-fav') {
      const label = kind ? kind : 'all';
      if (!confirm('Clear ' + label + ' favorites?')) return;
      MWStorage.clearFavorites(active.id, kind || null);
      showToast('Favorites cleared', 'success');
      renderSettings();
    } else if (act === 'switch') {
      window.location.href = 'index.html';
    } else if (act === 'refresh') {
      state.categories = { live: [], movies: [], series: [] };
      state.cache = { live: {}, movies: {}, series: {} };
      showToast('Cache cleared. Reloading...', 'success');
      setTimeout(() => switchView('live'), 400);
    } else if (act === 'remove-active') {
      if (!confirm('Remove this playlist from the device?')) return;
      MWStorage.removePlaylist(active.id);
      window.location.href = 'index.html';
    } else if (act === 'reset-all') {
      if (!confirm('Erase ALL data (playlists, favorites, history, settings)?')) return;
      MWStorage.clearAll();
      window.location.href = 'index.html';
    } else if (act === 'pair-apply') {
      applyPairCode();
    }
  }

  async function applyPairCode() {
    const input = document.getElementById('pair-code-input');
    const status = document.getElementById('pair-status');
    const raw = (input.value || '').trim();
    if (!raw) {
      status.textContent = 'Enter a code first.';
      status.className = 'pair-status error';
      return;
    }
    status.textContent = 'Fetching...';
    status.className = 'pair-status';
    try {
      const cfg = await MWPair.fetch(raw);
      if (!cfg || !cfg.type) throw new Error('Invalid pair payload');
      const playlist = { ...cfg, id: 'pl_' + Date.now().toString(36), createdAt: Date.now() };
      if (playlist.type === 'xtream') {
        const tmp = new XtreamClient(playlist);
        const info = await tmp.auth();
        playlist.host = tmp.host;
        playlist.userInfo = info.user_info || null;
        playlist.serverInfo = info.server_info || null;
      }
      MWStorage.savePlaylist(playlist);
      MWStorage.setActive(playlist);
      status.textContent = 'Paired! Loading...';
      status.className = 'pair-status success';
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      status.textContent = 'Failed: ' + err.message;
      status.className = 'pair-status error';
    }
  }

  // ========== Recent / History ==========
  async function renderRecent() {
    categoryList.style.display = '';
    categoryList.innerHTML = '';
    const hist = MWStorage.getHistory(active.id);

    ['live', 'movies', 'series'].forEach(kind => {
      const count = (hist[kind] || []).length;
      const el = document.createElement('div');
      el.className = 'category-item' + (state.selectedCategory.recent === kind ? ' active' : '');
      el.innerHTML = `<span>${kind.charAt(0).toUpperCase() + kind.slice(1)}</span><span class="category-count">${count}</span>`;
      el.addEventListener('click', () => {
        state.selectedCategory.recent = kind;
        renderRecent();
      });
      categoryList.appendChild(el);
    });
    if (!state.selectedCategory.recent) state.selectedCategory.recent = 'live';

    const kind = state.selectedCategory.recent;
    const entries = hist[kind] || [];
    if (!entries.length) {
      itemsGrid.innerHTML = '';
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'No recently played items yet.';
      return;
    }

    clearLoading();
    itemsGrid.className = 'items-grid';
    itemsGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'item-card' + (kind === 'live' ? ' channel' : '');
      card.setAttribute('tabindex', '0');
      const logo = entry.logo || '';
      const posterHtml = logo
        ? `<img class="item-poster" src="${escapeHtml(logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
        : `<div class="item-poster" style="display:grid;place-items:center;color:#5f6690;font-size:11px;">No Image</div>`;
      const when = entry.ts ? new Date(entry.ts).toLocaleString() : '';
      card.innerHTML = `
        ${posterHtml}
        <div class="item-body">
          <div class="item-name">${escapeHtml(entry.name)}</div>
          <div class="item-meta">${escapeHtml(when)}</div>
        </div>`;
      card.addEventListener('click', () => replayFromHistory(kind, entry));
      frag.appendChild(card);
    });
    itemsGrid.appendChild(frag);
  }

  async function replayFromHistory(kind, entry) {
    if (active.type !== 'xtream' && kind !== 'live') {
      showToast('Cannot replay — switch to Xtream playlist', 'error');
      return;
    }
    const fakeItem = kind === 'series'
      ? { series_id: entry.id, name: entry.name, cover: entry.logo }
      : kind === 'movies'
        ? { stream_id: entry.id, name: entry.name, stream_icon: entry.logo }
        : { stream_id: entry.id, name: entry.name, stream_icon: entry.logo };
    openItem(kind, fakeItem);
  }

  // ========== Search ==========
  // (handled above)

  // ========== Boot ==========
  switchView('live');
})();

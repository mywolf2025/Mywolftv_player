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
  const audioBtn = $('#player-audio');
  const subsBtn = $('#player-subs');
  const qualityBtn = $('#player-quality');
  const rateBtn = $('#player-rate');
  const aspectBtn = $('#player-aspect');
  const playerMenu = $('#player-menu');
  const clockEl = $('#clock');
  const hubEl = $('#hub');
  const hubClock = $('#hub-clock');
  const hubExpiry = $('#hub-expiry');
  const topExpiry = $('#topbar-expiry');
  const hubPlaylistName = $('#hub-playlist-name');
  const backHubBtn = $('#back-hub');
  const appBody = document.body;
  const channelCol = $('#channel-col');
  const previewCol = $('#preview-col');
  const previewHeader = $('#preview-header');
  const previewBody = $('#preview-body');
  const previewLogo = $('#preview-logo');
  const previewName = $('#preview-name');
  const previewEpg = $('#preview-epg');
  const previewPlayBtn = $('#preview-play');
  const previewFavBtn = $('#preview-fav');
  const content = $('#content');

  playlistName.textContent = active.name;
  if (hubPlaylistName) hubPlaylistName.textContent = active.name;

  // Playlist expiry banner
  const u0 = active.userInfo || {};
  const expTxt = u0.exp_date ? 'Expires: ' + new Date(Number(u0.exp_date) * 1000).toLocaleDateString() : '';
  if (hubExpiry) hubExpiry.textContent = expTxt;
  if (topExpiry) topExpiry.textContent = expTxt;

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
    const fmt = (MWStorage.getSettings().timeFormat || '24h') === '12h';
    const txt = d.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', hour12: fmt,
    });
    clockEl.textContent = txt;
    if (hubClock) hubClock.textContent = txt;
  }
  tickClock();
  setInterval(tickClock, 15000);

  // ========== Hub ==========
  function showHub() {
    appBody.classList.add('hub-mode');
    if (hubEl) hubEl.hidden = false;
    state.view = 'hub';
  }
  function hideHub() {
    appBody.classList.remove('hub-mode');
    if (hubEl) hubEl.hidden = true;
  }
  document.querySelectorAll('[data-hub]').forEach(tile => {
    tile.addEventListener('click', () => {
      const act = tile.getAttribute('data-hub');
      if (act === 'exit') {
        try { if (window.Android && Android.exitApp) Android.exitApp(); } catch (e) {}
        window.close();
        return;
      }
      if (act === 'switch') {
        window.location.href = 'index.html?choose=1';
        return;
      }
      if (act === 'reload') {
        state.categories = { live: [], movies: [], series: [] };
        state.cache = { live: {}, movies: {}, series: {} };
        showToast('Reloading...', 'success');
        hideHub();
        setTimeout(() => switchView('live'), 300);
        return;
      }
      hideHub();
      switchView(act);
    });
  });
  if (backHubBtn) backHubBtn.addEventListener('click', () => {
    try { player.destroy(); } catch (e) {}
    showHub();
  });

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
    if (categoryList.parentElement) categoryList.parentElement.style.display = '';
    if (view !== 'live') setLive3ColActive(false);
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

    // Virtual sidebar sections
    if (categoryId === '__resume') {
      const entries = MWStorage.getHistory(active.id)[view] || [];
      items = entries.map(e => view === 'series'
        ? { series_id: e.id, name: e.name, cover: e.logo }
        : { stream_id: e.id, name: e.name, stream_icon: e.logo });
      renderItems(view, items);
      return;
    }
    if (categoryId === '__fav') {
      const favIds = (MWStorage.getFavorites(active.id)[view] || []).map(String);
      if (!favIds.length) { renderItems(view, []); return; }
      if (!state.cache[view]['*']) {
        if (view === 'live') items = await client.getLiveStreams();
        else if (view === 'movies') items = await client.getVodStreams();
        else if (view === 'series') items = await client.getSeries();
        state.cache[view]['*'] = Array.isArray(items) ? items : [];
      }
      const all = state.cache[view]['*'];
      const favSet = new Set(favIds);
      items = all.filter(it => favSet.has(String(it.stream_id || it.series_id || it.id)));
      renderItems(view, items);
      return;
    }

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

    // Virtual sections (IBO-style sidebar)
    const virtuals = [];
    const histAll = MWStorage.getHistory(active.id);
    const favAll = MWStorage.getFavorites(active.id);
    if (view === 'movies' || view === 'series') {
      virtuals.push({ id: '__resume', name: 'Resume to Watch', count: (histAll[view] || []).length });
    }
    virtuals.push({ id: '__fav', name: 'Favorites', count: (favAll[view] || []).length });

    virtuals.forEach(v => {
      const el = document.createElement('div');
      el.className = 'category-item virtual' + (selected === v.id ? ' active' : '');
      el.innerHTML = `<span>${escapeHtml(v.name)}</span><span class="category-count">${v.count}</span>`;
      el.addEventListener('click', () => {
        state.selectedCategory[view] = v.id;
        state.userPickedCategory[view] = true;
        loadView(view);
      });
      categoryList.appendChild(el);
    });

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
      const adult = isAdultCategory(cat.category_name);
      el.className = 'category-item' + (selected === String(cat.category_id) ? ' active' : '') + (adult ? ' locked' : '');
      const count = cat.count ? `<span class="category-count">${cat.count}</span>` : '';
      const lock = adult ? '<span class="lock-ic" title="PIN">🔒</span>' : '';
      el.innerHTML = `<span title="${escapeHtml(cat.category_name)}">${lock}${escapeHtml(cat.category_name)}</span>${count}`;
      el.addEventListener('click', () => {
        if (adult && !checkPin()) return;
        state.selectedCategory[view] = String(cat.category_id);
        state.userPickedCategory[view] = true;
        loadView(view);
      });
      categoryList.appendChild(el);
    });
  }

  function isAdultCategory(name) {
    if (!name) return false;
    const n = String(name).toLowerCase();
    return /\b(xxx|adult|18\+|porn|erotic)\b/.test(n);
  }

  function checkPin() {
    const set = MWStorage.getSettings();
    if (!set.pin) return true;
    if (state.pinUnlocked) return true;
    const entered = prompt('Enter PIN:');
    if (entered === set.pin) { state.pinUnlocked = true; return true; }
    showToast('Wrong PIN', 'error');
    return false;
  }

  const PAGE_SIZE = 36;

  function setLive3ColActive(on) {
    if (channelCol) channelCol.hidden = !on;
    if (previewCol) previewCol.hidden = !on;
    if (content) content.classList.toggle('live-layout', !!on);
  }

  function renderItems(view, items) {
    clearLoading();
    itemsGrid.className = 'items-grid';

    const filter = state.filter.toLowerCase();
    let filtered = filter
      ? items.filter(it => {
          const n = (it.name || it.title || '').toLowerCase();
          return n.includes(filter);
        })
      : items;

    if (view === 'live') {
      const sort = MWStorage.getSettings().sortChannels || 'Default';
      if (sort === 'A-Z') filtered = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      else if (sort === 'Z-A') filtered = [...filtered].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    if (!filtered.length) {
      setLive3ColActive(false);
      emptyState.hidden = false;
      emptyState.querySelector('p').textContent = 'No items found';
      return;
    }

    if (view === 'live') {
      renderLiveList(filtered);
      return;
    }

    setLive3ColActive(false);
    state.renderCtx = { view, filtered, offset: 0 };
    itemsGrid.innerHTML = '';
    appendPage();
  }

  function renderLiveList(items) {
    setLive3ColActive(true);
    emptyState.hidden = true;

    const showLogos = MWStorage.getSettings().showLogos !== false;
    const frag = document.createDocumentFragment();
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'channel-row';
      row.setAttribute('tabindex', '0');
      const num = String(it.num || (i + 1));
      const logo = showLogos ? (it.stream_icon || it.logo || '') : '';
      const icon = logo
        ? `<img class="ch-ic" src="${escapeHtml(logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`
        : `<div class="ch-ic"></div>`;
      row.innerHTML = `<div class="ch-num">${escapeHtml(num)}</div>${icon}<div class="ch-name">${escapeHtml(it.name || 'Channel')}</div>`;
      const sel = () => selectLiveChannel(it, row);
      row.addEventListener('click', sel);
      row.addEventListener('focus', sel);
      row.addEventListener('dblclick', () => openItem('live', it));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openItem('live', it); });
      frag.appendChild(row);
    });
    channelCol.innerHTML = '';
    channelCol.appendChild(frag);

    const first = channelCol.querySelector('.channel-row');
    if (first) {
      first.classList.add('active');
      selectLiveChannel(items[0], first);
    }
  }

  function selectLiveChannel(item, rowEl) {
    if (rowEl) {
      channelCol.querySelectorAll('.channel-row.active').forEach(r => r.classList.remove('active'));
      rowEl.classList.add('active');
    }
    const logo = item.stream_icon || item.logo || '';
    const id = String(item.stream_id || item.id);
    previewName.textContent = item.name || 'Channel';
    if (logo) { previewLogo.src = logo; previewLogo.style.display = ''; }
    else { previewLogo.style.display = 'none'; }
    previewBody.style.backgroundImage = logo
      ? `linear-gradient(180deg, rgba(20,15,40,0.25), rgba(20,15,40,0.88)), url(${JSON.stringify(logo)})`
      : '';
    previewEpg.textContent = '';

    previewPlayBtn.onclick = () => openItem('live', item);
    const isFav = MWStorage.isFavorite(active.id, 'live', id);
    previewFavBtn.textContent = isFav ? 'Remove Favorite' : 'Favorite';
    previewFavBtn.onclick = () => {
      const added = MWStorage.toggleFavorite(active.id, 'live', id);
      previewFavBtn.textContent = added ? 'Remove Favorite' : 'Favorite';
    };

    if (active.type === 'xtream' && item.stream_id) {
      client.getShortEPG(item.stream_id, 3).then(data => {
        const list = (data && data.epg_listings) || [];
        if (!list.length) return;
        const now = Date.now() / 1000;
        const cur = list.find(ev => now >= Number(ev.start_timestamp) && now < Number(ev.stop_timestamp));
        if (cur) previewEpg.textContent = 'Now: ' + decodeB64(cur.title);
      }).catch(() => {});
    }
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
      const showLogos = MWStorage.getSettings().showLogos !== false;
      const logo = showLogos ? (it.stream_icon || it.cover || it.logo || '') : '';
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
        const fmt = (MWStorage.getSettings().streamFormat || 'auto');
        const ext = fmt === 'ts' ? 'ts' : 'm3u8';
        url = client.liveStreamUrl(streamId, ext);
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

    try {
      const histId = String(item.stream_id || item.series_id || item.id);
      MWStorage.addHistory(active.id, view, { id: histId, name: title, logo });
    } catch (e) {}

    // Route to external player if configured
    if (openExternal(url, title)) return;

    playerTitle.textContent = title;
    playerProgram.textContent = '';
    if (logo) { playerLogo.src = logo; playerLogo.style.display = ''; } else { playerLogo.style.display = 'none'; }

    const kind = view;
    const id = String(item.stream_id || item.series_id || item.id);
    const isFav = MWStorage.isFavorite(active.id, kind, id);
    favBtn.classList.toggle('active', isFav);
    favBtn.onclick = () => {
      const added = MWStorage.toggleFavorite(active.id, kind, id);
      favBtn.classList.toggle('active', added);
    };

    epgPanel.innerHTML = '';
    playerMenu.hidden = true;
    audioBtn.hidden = subsBtn.hidden = qualityBtn.hidden = true;
    rateBtn.hidden = (view === 'live');
    applyAspect();

    // Resume for movies and series only
    const resumeKey = view === 'live' ? null : String(item.stream_id || item.series_id || item.id);
    state.currentPlayback = { view, id: resumeKey, title };
    const resume = resumeKey ? MWStorage.getResume(active.id, view, resumeKey) : null;

    playerModal.hidden = false;
    player.on('tracks', updateTrackButtons);
    if (resumeKey) {
      const onLoaded = () => {
        if (resume && resume.position > 15) {
          try { video.currentTime = resume.position; } catch (e) {}
          const mm = Math.floor(resume.position / 60);
          const ss = Math.floor(resume.position % 60).toString().padStart(2, '0');
          showToast('Resuming from ' + mm + ':' + ss, 'success');
        }
        video.removeEventListener('loadedmetadata', onLoaded);
      };
      video.addEventListener('loadedmetadata', onLoaded);
    }
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
    if (e.key === 'Escape' && !playerModal.hidden) {
      if (!playerMenu.hidden) { playerMenu.hidden = true; return; }
      closePlayer();
    }
  });

  function closePlayer() {
    saveCurrentResume();
    playerModal.hidden = true;
    playerMenu.hidden = true;
    player.destroy();
    state.currentPlayback = null;
  }

  function saveCurrentResume() {
    const cp = state.currentPlayback;
    if (!cp || !cp.id) return;
    try {
      MWStorage.saveResume(active.id, cp.view, cp.id, video.currentTime || 0, video.duration || 0);
    } catch (e) {}
  }

  // Periodically persist resume position for VOD/series
  setInterval(() => {
    if (!playerModal.hidden && state.currentPlayback && state.currentPlayback.id) {
      saveCurrentResume();
    }
  }, 10000);
  window.addEventListener('beforeunload', saveCurrentResume);

  // Keyboard seek / play-pause while in player
  document.addEventListener('keydown', (e) => {
    if (playerModal.hidden) return;
    if (!playerMenu.hidden) return; // menu owns arrows
    if (state.currentPlayback && state.currentPlayback.view === 'live') return; // no seek on live
    if (e.key === 'ArrowLeft') {
      try { video.currentTime = Math.max(0, (video.currentTime || 0) - 10); } catch (err) {}
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      try { video.currentTime = Math.min((video.duration || 0), (video.currentTime || 0) + 10); } catch (err) {}
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'MediaPlayPause' || e.key === 'Enter') {
      if (e.target && e.target.tagName === 'BUTTON') return;
      if (video.paused) video.play(); else video.pause();
      e.preventDefault();
    } else if (e.key === 'MediaFastForward') {
      try { video.currentTime = (video.currentTime || 0) + 30; } catch (err) {}
    } else if (e.key === 'MediaRewind') {
      try { video.currentTime = Math.max(0, (video.currentTime || 0) - 30); } catch (err) {}
    }
  });

  // --- Player track / quality / aspect / rate menus ---
  function updateTrackButtons(tracks) {
    audioBtn.hidden = (tracks.audio.length < 2);
    subsBtn.hidden = (tracks.subtitle.length < 2);
    qualityBtn.hidden = (tracks.quality.length < 2);
  }

  function showMenu(title, items, onPick) {
    playerMenu.innerHTML = `<div class="pm-title">${escapeHtml(title)}</div>`
      + items.map((it, i) => `<button data-idx="${i}" class="${it.active ? 'active' : ''}">${escapeHtml(it.name)}</button>`).join('');
    playerMenu.hidden = false;
    playerMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        onPick(items[idx]);
        playerMenu.hidden = true;
      });
    });
    const first = playerMenu.querySelector('button.active') || playerMenu.querySelector('button');
    if (first) first.focus();
  }

  audioBtn.addEventListener('click', () => {
    const t = player.tracks();
    showMenu('Audio', t.audio, (p) => player.setAudioTrack(p.id));
  });
  subsBtn.addEventListener('click', () => {
    const t = player.tracks();
    showMenu('Subtitles', t.subtitle, (p) => player.setSubtitleTrack(p.id));
  });
  qualityBtn.addEventListener('click', () => {
    const t = player.tracks();
    showMenu('Quality', t.quality, (p) => player.setQuality(p.id));
  });
  rateBtn.addEventListener('click', () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2].map(r => ({
      id: r, name: r + '×', active: Math.abs(video.playbackRate - r) < 0.01,
    }));
    showMenu('Speed', rates, (p) => player.setPlaybackRate(p.id));
  });

  const ASPECTS = ['contain', 'fill', 'cover', 'zoom'];
  const ASPECT_LABELS = { contain: 'Fit', fill: 'Stretch', cover: 'Fill', zoom: 'Zoom' };
  function applyAspect() {
    const s = MWStorage.getSettings();
    const a = s.aspect || 'contain';
    video.classList.remove('fit-fill', 'fit-cover', 'fit-zoom');
    if (a === 'fill') video.classList.add('fit-fill');
    else if (a === 'cover') video.classList.add('fit-cover');
    else if (a === 'zoom') video.classList.add('fit-zoom');
  }
  aspectBtn.addEventListener('click', () => {
    const items = ASPECTS.map(a => {
      const cur = (MWStorage.getSettings().aspect || 'contain');
      return { id: a, name: ASPECT_LABELS[a], active: a === cur };
    });
    showMenu('Aspect', items, (p) => {
      const s = MWStorage.getSettings();
      s.aspect = p.id;
      MWStorage.saveSettings(s);
      applyAspect();
    });
  });

  // ========== Search ==========
  function renderSearch() {
    categoryList.style.display = '';
    if (categoryList.parentElement) categoryList.parentElement.style.display = '';
    setLive3ColActive(false);
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
    if (categoryList.parentElement) categoryList.parentElement.style.display = '';
    setLive3ColActive(false);
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

  // ========== Settings (tile grid) ==========
  function renderSettings() {
    if (categoryList.parentElement) categoryList.parentElement.style.display = 'none';
    setLive3ColActive(false);
    itemsGrid.className = 'items-grid list';
    itemsGrid.innerHTML = '';
    emptyState.hidden = true;

    const settings = MWStorage.getSettings();
    const did = MWStorage.getDeviceId();
    const ext = settings.externalPlayer || 'default';
    const asp = settings.aspect || 'contain';
    const tf = settings.timeFormat || '24h';
    const sf = settings.streamFormat || 'auto';
    const bf = settings.bufferLen || 30;
    const aspLabel = { contain: 'Fit', fill: 'Stretch', cover: 'Fill', zoom: 'Zoom' }[asp] || asp;
    const extLabel = ext === 'default' ? 'Default' : (ext === 'vlc' ? 'VLC' : 'MX Player');

    const tiles = [
      ['switch',      'Add Playlist',        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>', null],
      ['pin',         'Parental Control',    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zM12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>', settings.pin ? 'On' : 'Off'],
      ['switch',      'Change Playlist',     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>', null],
      ['language',    'Change Language',     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.5 17.5 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>', null],
      ['layout',      'Change Layout',       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3zm0 10h8v8H3zm10-10h8v8h-8zm0 10h8v8h-8z"/></svg>', null],
      ['logos',       'Show Channel Logos',  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5 5-5zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>', settings.showLogos !== false ? 'On' : 'Off'],
      ['clear-hist-l','Clear Live History',  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>', null],
      ['clear-hist-m','Clear Movies History','<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>', null],
      ['clear-hist-s','Clear Series History','<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>', null],
      ['sort',        'Live Channel Sort',   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>', settings.sortChannels || 'Default'],
      ['stream',      'Live Stream Format',  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z"/></svg>', sf.toUpperCase()],
      ['extplayer',   'External Players',    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>', extLabel],
      ['aspect',      'Aspect Ratio',        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 7v10H5V7h14m0-2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z"/></svg>', aspLabel],
      ['buffer',      'Buffer Length',       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6z"/></svg>', bf + 's'],
      ['time',        'Time Format',         '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>', tf],
      ['subs',        'Subtitles',           '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/></svg>', null],
      ['device',      'Device Type',         '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h16c.55 0 1 .45 1 1v1h-9c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>', null],
      ['pinoff',      settings.pin ? 'Parent Control Off' : 'Parent Control On', '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5-2.28 0-4.27 1.54-4.84 3.75l1.93.51C9.44 3.93 10.63 3 12 3c1.66 0 3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>', null],
      ['refresh',     'Update Now',          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>', null],
      ['reset-all',   'Reset Everything',    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>', null],
    ];

    const u = active.userInfo || {};
    const expiry = u.exp_date ? new Date(Number(u.exp_date) * 1000).toLocaleDateString() : '—';

    const wrap = document.createElement('div');
    wrap.className = 'settings-grid';
    wrap.innerHTML = `
      <h2>Settings</h2>
      <div class="st-grid">
        ${tiles.map(([act, label, svg, val]) => `
          <button class="st-tile" data-act="${act}" tabindex="0">
            ${svg}
            <div class="st-tile-info">
              <div>${escapeHtml(label)}</div>
              ${val ? `<div class="st-val">${escapeHtml(String(val))}</div>` : ''}
            </div>
          </button>
        `).join('')}
      </div>
      <div class="st-footer">
        <div><strong>Playlist:</strong> ${escapeHtml(active.name)} &nbsp;•&nbsp; <strong>Expires:</strong> ${escapeHtml(expiry)}</div>
        <div><strong>Device ID:</strong> ${escapeHtml(did)}</div>
        <div><strong>App:</strong> MyWolf TV Player v1.2 &nbsp;•&nbsp; <a href="https://mywolftv.com" target="_blank" rel="noopener">mywolftv.com</a></div>
      </div>
    `;
    itemsGrid.appendChild(wrap);
    wrap.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleSettingTile(btn.dataset.act));
    });
  }

  function handleSettingTile(act) {
    const s = MWStorage.getSettings();
    switch (act) {
      case 'switch':
        window.location.href = 'index.html?choose=1';
        return;
      case 'pin':
        promptPinChange();
        return;
      case 'pinoff':
        s.pin = '';
        MWStorage.saveSettings(s);
        state.pinUnlocked = false;
        showToast('Parental control disabled', 'success');
        renderSettings();
        return;
      case 'language':
        showToast('Only English is supported in this version', 'success');
        return;
      case 'layout':
        showToast('Layout customization coming soon', 'success');
        return;
      case 'logos':
        s.showLogos = s.showLogos === false;
        MWStorage.saveSettings(s);
        showToast('Channel logos ' + (s.showLogos ? 'on' : 'off'), 'success');
        renderSettings();
        return;
      case 'clear-hist-l':
      case 'clear-hist-m':
      case 'clear-hist-s': {
        const k = act === 'clear-hist-l' ? 'live' : act === 'clear-hist-m' ? 'movies' : 'series';
        if (!confirm('Clear ' + k + ' history?')) return;
        MWStorage.clearHistory(active.id, k);
        showToast(k.charAt(0).toUpperCase() + k.slice(1) + ' history cleared', 'success');
        return;
      }
      case 'sort': {
        const order = ['Default', 'A-Z', 'Z-A', 'Recently Added'];
        const cur = order.indexOf(s.sortChannels || 'Default');
        s.sortChannels = order[(cur + 1) % order.length];
        MWStorage.saveSettings(s);
        renderSettings();
        return;
      }
      case 'stream': {
        const order = ['auto', 'm3u8', 'ts'];
        const cur = order.indexOf(s.streamFormat || 'auto');
        s.streamFormat = order[(cur + 1) % order.length];
        MWStorage.saveSettings(s);
        renderSettings();
        return;
      }
      case 'extplayer':
        openExternalPlayerDialog();
        return;
      case 'aspect': {
        const order = ['contain', 'fill', 'cover', 'zoom'];
        const cur = order.indexOf(s.aspect || 'contain');
        s.aspect = order[(cur + 1) % order.length];
        MWStorage.saveSettings(s);
        renderSettings();
        return;
      }
      case 'buffer': {
        const order = [10, 30, 60, 90];
        const cur = order.indexOf(Number(s.bufferLen || 30));
        s.bufferLen = order[(cur + 1) % order.length];
        MWStorage.saveSettings(s);
        renderSettings();
        return;
      }
      case 'time':
        s.timeFormat = (s.timeFormat || '24h') === '24h' ? '12h' : '24h';
        MWStorage.saveSettings(s);
        tickClock();
        renderSettings();
        return;
      case 'subs':
        showToast('Subtitles are controlled from the player menu', 'success');
        return;
      case 'device':
        alert('Device ID:\n' + MWStorage.getDeviceId());
        return;
      case 'refresh':
        state.categories = { live: [], movies: [], series: [] };
        state.cache = { live: {}, movies: {}, series: {} };
        showToast('Cache cleared. Reloading...', 'success');
        setTimeout(() => switchView('live'), 300);
        return;
      case 'reset-all':
        if (!confirm('Erase ALL data (playlists, favorites, history, settings)?')) return;
        MWStorage.clearAll();
        window.location.href = 'index.html?choose=1';
        return;
    }
  }

  function promptPinChange() {
    const cur = (MWStorage.getSettings().pin || '');
    const pin = prompt('Enter 4-digit PIN to lock adult categories (blank = off):', cur);
    if (pin === null) return;
    const s = MWStorage.getSettings();
    s.pin = String(pin).replace(/\D/g, '').slice(0, 4);
    MWStorage.saveSettings(s);
    state.pinUnlocked = !s.pin;
    showToast(s.pin ? 'PIN set' : 'PIN cleared', 'success');
    renderSettings();
  }

  function openExternalPlayerDialog() {
    const cur = MWStorage.getSettings().externalPlayer || 'default';
    const overlay = document.createElement('div');
    overlay.className = 'ext-overlay';
    overlay.innerHTML = `
      <div class="ext-dialog" role="dialog">
        <h3>External Players</h3>
        <p class="ext-desc">Open Live TV, Movies and Series in another app.</p>
        <label class="ext-opt"><input type="radio" name="extp" value="default" ${cur==='default'?'checked':''}><span>Default (built-in)</span></label>
        <label class="ext-opt"><input type="radio" name="extp" value="vlc" ${cur==='vlc'?'checked':''}><span>VLC Player</span></label>
        <label class="ext-opt"><input type="radio" name="extp" value="mx" ${cur==='mx'?'checked':''}><span>MX Player</span></label>
        <div class="ext-actions">
          <button class="ext-cancel">Cancel</button>
          <button class="ext-ok">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.ext-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.ext-ok').addEventListener('click', () => {
      const picked = overlay.querySelector('input[name="extp"]:checked');
      const v = picked ? picked.value : 'default';
      const st = MWStorage.getSettings();
      st.externalPlayer = v;
      MWStorage.saveSettings(st);
      close();
      renderSettings();
      showToast('External player: ' + (v === 'default' ? 'Default' : v === 'vlc' ? 'VLC' : 'MX Player'), 'success');
    });
    const focusTarget = overlay.querySelector('input[name="extp"]:checked') || overlay.querySelector('input[name="extp"]');
    if (focusTarget) focusTarget.focus();
  }

  function openExternal(url, title) {
    const ext = MWStorage.getSettings().externalPlayer || 'default';
    if (ext === 'default' || !url) return false;
    const pkg = ext === 'vlc' ? 'org.videolan.vlc' : 'com.mxtech.videoplayer.ad';
    const intent = 'intent:' + url + '#Intent;package=' + pkg + ';type=video/*;S.title=' + encodeURIComponent(title || '') + ';end';
    try {
      window.location.href = intent;
      showToast('Opening in ' + (ext === 'vlc' ? 'VLC' : 'MX Player') + '…', 'success');
      return true;
    } catch (e) {
      showToast('Failed to open external player', 'error');
      return false;
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
    if (categoryList.parentElement) categoryList.parentElement.style.display = '';
    setLive3ColActive(false);
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
  showHub();
})();

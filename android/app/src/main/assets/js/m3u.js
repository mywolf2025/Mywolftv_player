(function () {
  'use strict';

  function parseAttrs(line) {
    const attrs = {};
    const re = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      attrs[m[1].toLowerCase()] = m[2];
    }
    return attrs;
  }

  function parseM3U(text) {
    const lines = text.split(/\r?\n/);
    const items = [];
    let pending = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('#EXTM3U')) continue;
      if (line.startsWith('#EXTINF')) {
        const commaIdx = line.indexOf(',');
        const head = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
        const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
        const attrs = parseAttrs(head);
        pending = {
          name: name || attrs['tvg-name'] || 'Unknown',
          logo: attrs['tvg-logo'] || '',
          group: attrs['group-title'] || 'Uncategorized',
          tvgId: attrs['tvg-id'] || '',
          epgChannel: attrs['tvg-id'] || '',
        };
      } else if (!line.startsWith('#') && pending) {
        pending.url = line;
        pending.id = 'm3u_' + items.length;
        items.push(pending);
        pending = null;
      }
    }
    return items;
  }

  async function loadM3U(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load playlist (HTTP ' + res.status + ')');
    const text = await res.text();
    return parseM3U(text);
  }

  function groupByCategory(items) {
    const map = new Map();
    for (const item of items) {
      const key = item.group || 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      category_id: name,
      category_name: name,
      items,
    }));
  }

  window.M3U = { parseM3U, loadM3U, groupByCategory };
})();

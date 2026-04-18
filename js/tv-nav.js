(function () {
  'use strict';

  const FOCUSABLE_SELECTOR = [
    '.nav-item',
    '.category-item',
    '.item-card',
    '.saved-item-info',
    '.tab',
    '.icon-btn',
    '.item-fav',
    'button:not([disabled])',
    'input',
    'select',
    'textarea',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function visible(el) {
    if (!el || !el.offsetParent) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // Must be at least partially on screen
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    return true;
  }

  function getFocusables() {
    const nodes = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR));
    return nodes.filter(visible).filter(n => !n.closest('[hidden]'));
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  function findNearest(direction, current) {
    const cur = centerOf(current);
    const candidates = getFocusables().filter(el => el !== current);
    let best = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      const c = centerOf(el);
      const dx = c.x - cur.x;
      const dy = c.y - cur.y;
      let primary, secondary;
      // For each direction, primary is axis of travel; only consider elements in that direction
      if (direction === 'right') {
        if (dx <= 4) continue;
        primary = dx;
        secondary = Math.abs(dy);
      } else if (direction === 'left') {
        if (dx >= -4) continue;
        primary = -dx;
        secondary = Math.abs(dy);
      } else if (direction === 'down') {
        if (dy <= 4) continue;
        primary = dy;
        secondary = Math.abs(dx);
      } else if (direction === 'up') {
        if (dy >= -4) continue;
        primary = -dy;
        secondary = Math.abs(dx);
      }
      // Score: primary distance + 2x penalty for off-axis
      const score = primary + secondary * 2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function ensureFocusable(el) {
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  }

  function focusElement(el) {
    if (!el) return;
    ensureFocusable(el);
    try { el.focus({ preventScroll: false }); } catch (e) { el.focus(); }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }

  function onKey(e) {
    const key = e.key;
    const current = document.activeElement;

    // If nothing focused, focus first available
    if (!current || current === document.body || !current.matches || !current.matches(FOCUSABLE_SELECTOR)) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        const first = getFocusables()[0];
        if (first) { focusElement(first); e.preventDefault(); }
        return;
      }
    }

    // Don't hijack inside form inputs
    if (current && current.tagName && (current.tagName === 'INPUT' || current.tagName === 'TEXTAREA' || current.tagName === 'SELECT')) {
      if (['ArrowLeft', 'ArrowRight'].includes(key)) return; // let input handle
    }

    let dir = null;
    if (key === 'ArrowRight') dir = 'right';
    else if (key === 'ArrowLeft') dir = 'left';
    else if (key === 'ArrowUp') dir = 'up';
    else if (key === 'ArrowDown') dir = 'down';

    if (dir) {
      const target = findNearest(dir, current);
      if (target) { focusElement(target); e.preventDefault(); }
      return;
    }

    // Enter / OK button activates focused element
    if (key === 'Enter') {
      if (current && current !== document.body && current.click) {
        current.click();
        e.preventDefault();
      }
    }
  }

  function addTabindexToAll() {
    document.querySelectorAll(FOCUSABLE_SELECTOR).forEach(ensureFocusable);
  }

  // Run once DOM is ready, and on every dynamic rerender (debounced)
  let scheduleId = null;
  function scheduleTabindex() {
    if (scheduleId) return;
    scheduleId = setTimeout(() => {
      scheduleId = null;
      addTabindexToAll();
    }, 80);
  }

  function init() {
    addTabindexToAll();
    const mo = new MutationObserver(scheduleTabindex);
    mo.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      const first = document.querySelector('.nav-item.active') || document.querySelector('.nav-item') || getFocusables()[0];
      if (first) focusElement(first);
    }, 200);
  }

  document.addEventListener('keydown', onKey, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

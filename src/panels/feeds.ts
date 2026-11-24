// Plain-HTML panels: the alert feed and the ticker tape.

import type { Alert, MarketFeed } from '../feed';
import { createPanel, type Panel } from './panel';

export function createAlerts(feed: MarketFeed): Panel {
  const panel = createPanel('alerts', 'Desk Alerts', 1080, 608, '#ef4444');
  const list = document.createElement('ol');
  list.className = 'alerts';
  panel.body.appendChild(list);
  const MAX = 13;
  const add = (a: Alert) => {
    const li = document.createElement('li');
    li.dataset.level = a.level;
    const t = document.createElement('time');
    t.textContent = new Date(a.time).toLocaleTimeString('en-GB', { hour12: false });
    const lvl = document.createElement('span');
    lvl.className = 'alert-level';
    lvl.textContent = a.level.toUpperCase();
    const text = document.createElement('span');
    text.textContent = a.text;
    li.append(t, lvl, text);
    list.prepend(li);
    while (list.children.length > MAX) list.lastElementChild!.remove();
    panel.setBadge(`${feed.alerts.length} today`, 'neutral');
  };
  [...feed.alerts].reverse().forEach(add);
  feed.on('alert', add);
  panel.setSubtitle('Price moves, large fills, drawdowns');
  if (!feed.alerts.length) {
    const li = document.createElement('li');
    li.className = 'alerts-empty';
    li.textContent = 'Watching the market…';
    list.appendChild(li);
  }
  return panel;
}

/** One long strip; the ring shader scrolls it via a UV offset, so scrolling costs no uploads. */
export function createTicker(feed: MarketFeed): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ticker';
  root.id = 'panel-ticker';
  root.setAttribute('aria-label', 'Ticker tape');
  const cells = new Map<string, { price: HTMLElement; chg: HTMLElement; item: HTMLElement }>();
  for (const q of feed.quotes.values()) {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    const sym = document.createElement('b');
    sym.textContent = q.symbol;
    const price = document.createElement('span');
    const chg = document.createElement('span');
    chg.className = 'ticker-chg';
    item.append(sym, price, chg);
    root.appendChild(item);
    cells.set(q.symbol, { price, chg, item });
  }
  const render = () => {
    for (const q of feed.quotes.values()) {
      const c = cells.get(q.symbol)!;
      const p = q.last.toFixed(2);
      if (c.price.textContent !== p) c.price.textContent = p;
      const ch = `${q.change >= 0 ? '▲' : '▼'} ${Math.abs(q.changePct).toFixed(2)}%`;
      if (c.chg.textContent !== ch) c.chg.textContent = ch;
      c.item.dataset.tone = q.change >= 0 ? 'up' : 'down';
    }
  };
  render();
  setInterval(render, 500);
  return root;
}

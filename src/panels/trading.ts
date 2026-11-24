// Trading controls: a full order ticket and the desk risk / kill-switch panel.
// No native <select> popups: they open outside the canvas, so every choice is a
// segmented button group that renders (and hit-tests) inside the 3D panel.

import { fmtMoney, type Algo, type MarketFeed, type OrderRequest, type OrderType, type RiskState, type Side, type Tif } from '../feed';
import { createPanel, type Panel } from './panel';

function segmented<T extends string>(name: string, options: T[], value: T, onChange: (v: T) => void) {
  const el = document.createElement('div');
  el.className = 'seg';
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', name);
  const buttons = options.map((opt) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt;
    b.dataset.value = opt;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => set(opt, true));
    el.appendChild(b);
    return b;
  });
  const set = (v: T, notify: boolean) => {
    value = v;
    for (const b of buttons) {
      const on = b.dataset.value === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    if (notify) onChange(v);
  };
  set(value, false);
  return { el, set: (v: T) => set(v, true), get: () => value };
}

function row(label: string, ...children: HTMLElement[]) {
  const r = document.createElement('div');
  r.className = 'ot-row';
  const l = document.createElement('span');
  l.className = 'ot-label';
  l.textContent = label;
  r.append(l, ...children);
  return r;
}

function button(text: string, cls: string, onClick: () => void, title = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

// ---------------------------------------------------------------- Ticket

export function createOrderTicket(feed: MarketFeed): Panel {
  const panel = createPanel('order-ticket', 'Order Ticket', 820, 600, '#22d3ee');
  const root = document.createElement('div');
  root.className = 'order-ticket';
  panel.body.appendChild(root);

  const state = { side: 'BUY' as Side, type: 'LMT' as OrderType, qty: 1000, price: 0, tif: 'DAY' as Tif, algo: 'NONE' as Algo, participation: 0.15 };
  const symbols = [...feed.quotes.keys()];

  // Symbol stepper (follows the desk selection).
  const symName = document.createElement('b');
  symName.className = 'ot-symbol';
  const symQuote = document.createElement('span');
  symQuote.className = 'ot-quote';
  const step = (d: number) => feed.select(symbols[(symbols.indexOf(feed.selected) + d + symbols.length) % symbols.length]);
  const symRow = row('Symbol', button('◀', 'ot-icon', () => step(-1), 'Previous symbol'), symName, button('▶', 'ot-icon', () => step(1), 'Next symbol'), symQuote);

  const side = segmented('Side', ['BUY', 'SELL'] as Side[], state.side, (v) => ((state.side = v), update()));
  side.el.classList.add('seg-side');
  const type = segmented('Order type', ['MKT', 'LMT', 'STP'] as OrderType[], state.type, (v) => {
    state.type = v;
    if (v !== 'MKT') resetPrice();
    update();
  });

  const qty = document.createElement('input');
  qty.type = 'number';
  qty.min = '100';
  qty.step = '100';
  qty.value = String(state.qty);
  qty.className = 'ot-input';
  qty.setAttribute('aria-label', 'Quantity');
  qty.addEventListener('input', () => ((state.qty = Number(qty.value)), update()));
  const bumpQty = (d: number) => {
    state.qty = Math.max(100, (Math.round(state.qty / 100) + d) * 100);
    qty.value = String(state.qty);
    update();
  };
  const quick = document.createElement('div');
  quick.className = 'ot-quick';
  for (const n of [100, 500, 1000, 5000]) {
    quick.appendChild(
      button(n >= 1000 ? `${n / 1000}K` : String(n), 'ot-chip', () => {
        state.qty = n;
        qty.value = String(n);
        update();
      }),
    );
  }
  const qtyRow = row('Quantity', button('−', 'ot-icon', () => bumpQty(-1)), qty, button('+', 'ot-icon', () => bumpQty(1)), quick);

  const price = document.createElement('input');
  price.type = 'number';
  price.step = '0.01';
  price.className = 'ot-input';
  price.setAttribute('aria-label', 'Price');
  price.addEventListener('input', () => ((state.price = Number(price.value)), update()));
  const bumpPrice = (d: number) => {
    state.price = Math.round((state.price + d) * 100) / 100;
    price.value = state.price.toFixed(2);
    update();
  };
  const resetPrice = () => {
    const q = feed.quotes.get(feed.selected)!;
    state.price = state.type === 'STP' ? (state.side === 'BUY' ? q.ask + q.last * 0.002 : q.bid - q.last * 0.002) : (q.bid + q.ask) / 2;
    state.price = Math.round(state.price * 100) / 100;
    price.value = state.price.toFixed(2);
  };
  const priceLabel = document.createElement('span');
  const priceRow = row('Price', button('−', 'ot-icon', () => bumpPrice(-0.01), '-1 tick'), price, button('+', 'ot-icon', () => bumpPrice(0.01), '+1 tick'), button('MID', 'ot-chip', () => ((state.type === 'MKT' ? 0 : resetPrice()), update()), 'Reset to mid'), priceLabel);
  priceLabel.className = 'ot-hint';

  const tif = segmented('Time in force', ['DAY', 'IOC', 'GTC'] as Tif[], state.tif, (v) => ((state.tif = v), update()));
  const algo = segmented('Algo', ['NONE', 'VWAP', 'TWAP', 'POV'] as Algo[], state.algo, (v) => ((state.algo = v), update()));

  const pov = document.createElement('input');
  pov.type = 'range';
  pov.min = '5';
  pov.max = '40';
  pov.value = String(state.participation * 100);
  pov.className = 'ot-range';
  pov.setAttribute('aria-label', 'Participation rate');
  const povValue = document.createElement('span');
  povValue.className = 'ot-hint';
  pov.addEventListener('input', () => ((state.participation = Number(pov.value) / 100), update()));
  const povRow = row('Participation', pov, povValue);

  const preview = document.createElement('div');
  preview.className = 'ot-preview';
  const submit = button('', 'ot-submit', () => send());
  const result = document.createElement('div');
  result.className = 'ot-result';
  result.setAttribute('aria-live', 'polite');

  root.append(symRow, row('Side', side.el), row('Type', type.el), qtyRow, priceRow, row('TIF', tif.el), row('Algo', algo.el), povRow, preview, submit, result);

  const request = (): OrderRequest => ({
    symbol: feed.selected,
    side: state.side,
    qty: Math.round(state.qty),
    type: state.type,
    price: state.type === 'MKT' ? null : state.price,
    tif: state.tif,
    algo: state.algo,
    participation: state.participation,
  });

  function update() {
    const q = feed.quotes.get(feed.selected)!;
    symName.textContent = feed.selected;
    symQuote.innerHTML = `<span class="num-up">${q.bid.toFixed(2)}</span> / <span class="num-down">${q.ask.toFixed(2)}</span>`;
    priceRow.classList.toggle('disabled', state.type === 'MKT');
    price.disabled = state.type === 'MKT';
    priceLabel.textContent = state.type === 'STP' ? 'trigger' : state.type === 'LMT' ? 'limit' : 'at market';
    povRow.classList.toggle('disabled', state.algo !== 'POV');
    pov.disabled = state.algo !== 'POV';
    povValue.textContent = `${Math.round(state.participation * 100)}% of volume`;
    const check = feed.preTradeCheck(request());
    preview.innerHTML = `
      <span>Notional <b>${fmtMoney(check.notional)}</b></span>
      <span>Gross after <b>${fmtMoney(check.grossAfter)}</b></span>
      <span class="${check.ok ? 'ok' : 'bad'}">${check.ok ? '✓' : '✕'} ${check.reason}</span>`;
    const px = state.type === 'MKT' ? '' : ` ${state.type} ${state.price.toFixed(2)}`;
    submit.textContent = `${state.side} ${Math.round(state.qty).toLocaleString()} ${feed.selected}${px}${state.algo !== 'NONE' ? ` · ${state.algo}` : ''}`;
    submit.dataset.side = state.side;
    submit.disabled = !check.ok;
  }

  function send() {
    const order = feed.submitOrder(request());
    result.dataset.tone = order.status === 'REJECTED' ? 'bad' : 'ok';
    result.textContent = order.status === 'REJECTED' ? `Rejected: ${order.reason}` : `${order.id} accepted · ${order.side} ${order.qty.toLocaleString()} ${order.symbol} ${order.type}${order.algo !== 'NONE' ? ` via ${order.algo}` : ''}`;
  }

  resetPrice();
  update();
  feed.on('select', () => {
    if (state.type !== 'MKT') resetPrice();
    update();
  });
  feed.on('risk', update);
  setInterval(update, 500);
  panel.setSubtitle('Pre-trade risk checked');
  return panel;
}

// ------------------------------------------------------------ Risk controls

export function createRiskControls(feed: MarketFeed): Panel {
  const panel = createPanel('risk-controls', 'Risk Controls', 1080, 608, '#ef4444');
  const root = document.createElement('div');
  root.className = 'risk';
  panel.body.appendChild(root);

  const kill = button('', 'kill-switch', () => feed.setKillSwitch(!feed.risk.killed));
  const killWrap = document.createElement('div');
  killWrap.className = 'kill-wrap';
  const killState = document.createElement('div');
  killState.className = 'kill-state';
  killWrap.append(kill, killState);

  const meter = (label: string) => {
    const el = document.createElement('div');
    el.className = 'meter';
    el.innerHTML = `<div class="meter-head"><span>${label}</span><b></b></div><div class="meter-track"><div class="meter-fill"></div></div>`;
    return { el, value: el.querySelector('b')!, fill: el.querySelector<HTMLElement>('.meter-fill')! };
  };
  const gross = meter('Gross exposure vs limit');
  const loss = meter('Day P&L vs loss limit');
  const net = meter('Net exposure');

  const slider = (label: string, min: number, max: number, stepV: number, value: number, fmt: (v: number) => string, onInput: (v: number) => void) => {
    const wrap = document.createElement('label');
    wrap.className = 'risk-slider';
    const head = document.createElement('div');
    head.className = 'meter-head';
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('b');
    head.append(name, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(stepV);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    const sync = () => (val.textContent = fmt(Number(input.value)));
    input.addEventListener('input', () => {
      sync();
      onInput(Number(input.value));
    });
    sync();
    wrap.append(head, input);
    return { el: wrap, input, sync };
  };
  const flow = slider('Desk algo flow', 0, 100, 5, feed.risk.deskFlow * 100, (v) => `${v}%`, (v) => feed.setRiskParam('deskFlow', v / 100));
  const maxQty = slider('Max order size', 1000, 50000, 1000, feed.risk.maxOrderQty, (v) => v.toLocaleString(), (v) => feed.setRiskParam('maxOrderQty', v));
  const grossLimit = slider('Gross limit', 5_000_000, 80_000_000, 1_000_000, feed.risk.grossLimit, fmtMoney, (v) => feed.setRiskParam('grossLimit', v));

  const actions = document.createElement('div');
  actions.className = 'risk-actions';
  const actionResult = document.createElement('span');
  actionResult.className = 'ot-hint';
  actions.append(
    button('Cancel all working', 'risk-btn', () => (actionResult.textContent = `${feed.cancelAll(false, 'Desk cancel all')} orders cancelled`)),
    button('Cancel mine', 'risk-btn', () => (actionResult.textContent = `${feed.cancelAll(true)} of your orders cancelled`)),
    button('Flatten all positions', 'risk-btn danger', () => (actionResult.textContent = `${feed.flattenAll()} closing orders sent`)),
    actionResult,
  );

  const left = document.createElement('div');
  left.className = 'risk-col';
  left.append(killWrap, actions);
  const right = document.createElement('div');
  right.className = 'risk-col';
  right.append(gross.el, loss.el, net.el, flow.el, maxQty.el, grossLimit.el);
  root.append(left, right);

  const render = (r: RiskState) => {
    panel.root.classList.toggle('killed', r.killed);
    kill.textContent = r.killed ? 'RESET KILL SWITCH' : 'KILL SWITCH';
    kill.setAttribute('aria-pressed', String(r.killed));
    killState.innerHTML = r.killed
      ? '<b>TRADING HALTED</b><span>All desk flow stopped · new orders rejected</span>'
      : `<b>TRADING ACTIVE</b><span>${r.workingOrders} working orders on the desk</span>`;
    const g = r.gross / r.grossLimit;
    gross.value.textContent = `${fmtMoney(r.gross)} / ${fmtMoney(r.grossLimit)}`;
    gross.fill.style.width = `${Math.min(100, g * 100)}%`;
    gross.fill.dataset.tone = g > 0.9 ? 'bad' : g > 0.7 ? 'warn' : 'ok';
    const l = r.dayPnl < 0 ? r.dayPnl / r.lossLimit : 0;
    loss.value.textContent = `${fmtMoney(r.dayPnl)} / ${fmtMoney(r.lossLimit)}`;
    loss.fill.style.width = `${Math.min(100, l * 100)}%`;
    loss.fill.dataset.tone = l > 0.9 ? 'bad' : l > 0.6 ? 'warn' : 'ok';
    const n = Math.abs(r.net) / r.grossLimit;
    net.value.textContent = `${r.net >= 0 ? 'Long' : 'Short'} ${fmtMoney(Math.abs(r.net))}`;
    net.fill.style.width = `${Math.min(100, n * 100)}%`;
    net.fill.dataset.tone = r.net >= 0 ? 'long' : 'short';
    panel.setBadge(r.killed ? 'HALTED' : 'ACTIVE', r.killed ? 'down' : 'up');
    if (document.activeElement !== grossLimit.input && Number(grossLimit.input.value) !== r.grossLimit) {
      grossLimit.input.value = String(r.grossLimit);
      grossLimit.sync();
    }
  };
  render(feed.risk);
  feed.on('risk', render);
  panel.setSubtitle('Desk limits, kill switch and bulk actions');
  return panel;
}

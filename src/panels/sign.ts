// The board hanging over the desks: world clocks with each exchange's session
// status, under a small wordmark for the (fictional) desk. Plain HTML, drawn like
// every other panel. The author credit lives in the overlay, not on the board.

export const AUTHOR = 'Andrea Dito';
export const DESK_NAME = 'Neon Coast Markets';

interface Market {
  city: string;
  exchange: string;
  zone: string;
  /** Regular session in local minutes from midnight, Monday to Friday; optional lunch break. Holidays are not modelled. */
  open: number;
  close: number;
  lunch?: [number, number];
}

const hm = (h: number, m = 0) => h * 60 + m;
const MARKETS: Market[] = [
  { city: 'New York', exchange: 'NYSE', zone: 'America/New_York', open: hm(9, 30), close: hm(16) },
  { city: 'London', exchange: 'LSE', zone: 'Europe/London', open: hm(8), close: hm(16, 30) },
  { city: 'Frankfurt', exchange: 'XETRA', zone: 'Europe/Berlin', open: hm(9), close: hm(17, 30) },
  { city: 'Tokyo', exchange: 'TSE', zone: 'Asia/Tokyo', open: hm(9), close: hm(15, 30), lunch: [hm(11, 30), hm(12, 30)] },
  { city: 'Hong Kong', exchange: 'HKEX', zone: 'Asia/Hong_Kong', open: hm(9, 30), close: hm(16), lunch: [hm(12), hm(13)] },
  { city: 'Sydney', exchange: 'ASX', zone: 'Australia/Sydney', open: hm(10), close: hm(16) },
];

function localParts(zone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { hh: get('hour'), mm: get('minute'), ss: get('second'), weekday: get('weekday') };
}

function status(m: Market, p: ReturnType<typeof localParts>): 'OPEN' | 'LUNCH' | 'CLOSED' {
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return 'CLOSED';
  const t = Number(p.hh) * 60 + Number(p.mm);
  if (t < m.open || t >= m.close) return 'CLOSED';
  if (m.lunch && t >= m.lunch[0] && t < m.lunch[1]) return 'LUNCH';
  return 'OPEN';
}

export function createSign(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'clock-board';
  el.id = 'panel-sign';
  el.setAttribute('aria-label', `${DESK_NAME} world clocks`);
  el.innerHTML = `
    <header class="cb-head"><span class="cb-mark">${DESK_NAME.toUpperCase()}</span><span class="cb-line"></span><span class="cb-note">WORLD MARKETS</span></header>
    <div class="cb-clocks">${MARKETS.map(
      (m) => `
      <div class="cb-clock" data-zone="${m.zone}">
        <div class="cb-city">${m.city.toUpperCase()}</div>
        <div class="cb-time"><span class="cb-hm"></span><span class="cb-s"></span></div>
        <div class="cb-status"><i></i><span></span> · ${m.exchange}</div>
      </div>`,
    ).join('')}</div>`;

  const clocks = [...el.querySelectorAll<HTMLElement>('.cb-clock')].map((node, i) => ({
    market: MARKETS[i],
    node,
    hm: node.querySelector<HTMLElement>('.cb-hm')!,
    s: node.querySelector<HTMLElement>('.cb-s')!,
    label: node.querySelector<HTMLElement>('.cb-status span')!,
  }));
  const tick = () => {
    const now = new Date();
    for (const c of clocks) {
      const p = localParts(c.market.zone, now);
      c.hm.textContent = `${p.hh}:${p.mm}`;
      c.s.textContent = `:${p.ss}`;
      const st = status(c.market, p);
      c.node.dataset.status = st.toLowerCase();
      c.label.textContent = st;
    }
  };
  tick();
  // Align to the second boundary so all six clocks turn over together.
  setTimeout(() => {
    tick();
    setInterval(tick, 1000);
  }, 1000 - (Date.now() % 1000));
  return el;
}

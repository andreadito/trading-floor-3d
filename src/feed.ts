// Simulated market: correlated equity prices, prints, order flow with order
// types / TIF / algos, fills, positions, risk limits, options, cross-asset
// quotes and alerts. Everything here is random data; nothing reflects real prices.

export type Side = 'BUY' | 'SELL';
export type OrderType = 'MKT' | 'LMT' | 'STP';
export type Tif = 'DAY' | 'IOC' | 'GTC';
export type Algo = 'NONE' | 'VWAP' | 'TWAP' | 'POV';
export type OrderStatus = 'WORKING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export interface Quote {
  symbol: string;
  sector: string;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  qty: number;
  type?: OrderType;
  /** Limit price for LMT, trigger price for STP. */
  price?: number | null;
  tif?: Tif;
  algo?: Algo;
  /** POV participation, 0..1. */
  participation?: number;
  trader?: string;
}

export interface Order {
  id: string;
  time: number;
  symbol: string;
  side: Side;
  qty: number;
  filled: number;
  /** Average fill price (or the reference price before any fill). */
  price: number;
  notional: number;
  status: OrderStatus;
  trader: string;
  venue: string;
  type: OrderType;
  limit: number | null;
  tif: Tif;
  algo: Algo;
  participation: number;
  triggered: boolean;
  reason: string;
}

export interface Position {
  symbol: string;
  sector: string;
  qty: number;
  avgPx: number;
  last: number;
  mktValue: number;
  unrealized: number;
  realized: number;
}

export interface BookLevel {
  level: number;
  bidSize: number;
  bid: number;
  ask: number;
  askSize: number;
  bidCum: number;
  askCum: number;
  bidDepthPct: number;
  askDepthPct: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Print {
  id: number;
  time: number;
  symbol: string;
  price: number;
  size: number;
  side: Side | 'MID';
  venue: string;
}

export interface PnlPoint {
  t: number;
  total: number;
  realized: number;
}

export interface Alert {
  id: number;
  time: number;
  level: 'info' | 'warn' | 'crit';
  text: string;
}

export interface RiskState {
  killed: boolean;
  deskFlow: number;
  maxOrderQty: number;
  grossLimit: number;
  lossLimit: number;
  gross: number;
  net: number;
  dayPnl: number;
  workingOrders: number;
}

export interface CrossQuote {
  id: string;
  name: string;
  assetClass: 'FX' | 'Rates' | 'Commodities' | 'Crypto' | 'Vol';
  last: number;
  open: number;
  change: number;
  changePct: number;
  decimals: number;
  /** Yields move in basis points. */
  isYield: boolean;
  high: number;
  low: number;
}

export interface OptionRow {
  strike: number;
  callBid: number;
  callAsk: number;
  callIv: number;
  callDelta: number;
  callGamma: number;
  putBid: number;
  putAsk: number;
  putIv: number;
  putDelta: number;
  putGamma: number;
  vega: number;
  callItm: boolean;
  atm: boolean;
}

export interface PreTradeCheck {
  ok: boolean;
  reason: string;
  notional: number;
  grossAfter: number;
  refPrice: number;
}

interface FeedEvents {
  quotes: Quote[];
  order: Order;
  positions: Position[];
  pnl: PnlPoint;
  book: BookLevel[];
  candles: string;
  alert: Alert;
  select: string;
  prints: Print[];
  risk: RiskState;
  cross: CrossQuote[];
}

const UNIVERSE: Array<[string, string, number]> = [
  ['AAPL', 'Tech', 228], ['MSFT', 'Tech', 418], ['NVDA', 'Tech', 134], ['GOOGL', 'Tech', 171],
  ['META', 'Tech', 582], ['AMD', 'Tech', 152], ['INTC', 'Tech', 23], ['ORCL', 'Tech', 171], ['CRM', 'Tech', 296],
  ['AMZN', 'Consumer', 196], ['TSLA', 'Consumer', 248],
  ['JPM', 'Financials', 224], ['GS', 'Financials', 512], ['MS', 'Financials', 118], ['BAC', 'Financials', 43],
  ['XOM', 'Energy', 119], ['CVX', 'Energy', 154],
  ['JNJ', 'Healthcare', 158], ['PFE', 'Healthcare', 28],
  ['KO', 'Staples', 68], ['PEP', 'Staples', 166], ['WMT', 'Staples', 84],
  ['DIS', 'Media', 98], ['NFLX', 'Media', 742],
];

const CROSS: Array<[string, string, CrossQuote['assetClass'], number, number, number, boolean]> = [
  // id, name, class, price, decimals, per-tick vol, isYield
  ['EURUSD', 'EUR/USD', 'FX', 1.0842, 5, 0.00012, false],
  ['GBPUSD', 'GBP/USD', 'FX', 1.2715, 5, 0.00014, false],
  ['USDJPY', 'USD/JPY', 'FX', 151.32, 3, 0.00013, false],
  ['AUDUSD', 'AUD/USD', 'FX', 0.6588, 5, 0.00016, false],
  ['USDCHF', 'USD/CHF', 'FX', 0.8824, 5, 0.00012, false],
  ['UST2Y', 'UST 2Y', 'Rates', 4.212, 3, 0.0006, true],
  ['UST10Y', 'UST 10Y', 'Rates', 4.305, 3, 0.0005, true],
  ['BUND10Y', 'Bund 10Y', 'Rates', 2.384, 3, 0.0006, true],
  ['XAU', 'Gold', 'Commodities', 2651.4, 2, 0.0002, false],
  ['WTI', 'WTI Crude', 'Commodities', 71.32, 2, 0.0004, false],
  ['BRENT', 'Brent', 'Commodities', 75.08, 2, 0.0004, false],
  ['NG', 'Nat Gas', 'Commodities', 3.214, 3, 0.0008, false],
  ['BTC', 'Bitcoin', 'Crypto', 68240, 0, 0.0007, false],
  ['ETH', 'Ether', 'Crypto', 3412, 1, 0.0009, false],
  ['VIX', 'VIX', 'Vol', 15.42, 2, 0.0012, false],
];

const TRADERS = ['JLEE', 'MKOVAC', 'SPATEL', 'ARUIZ', 'TNGUYEN', 'ODIALLO'];
const VENUES = ['NYSE', 'NASDAQ', 'ARCA', 'BATS', 'IEX', 'DARK'];
const TICK_MS = 100;
const CANDLE_MS = 2000;
const MAX_CANDLES = 90;
const MAX_PNL_POINTS = 240;
const MAX_PRINTS = 150;
const BOOK_LEVELS = 14;
const CORR_SAMPLES = 160;
export const OPTION_EXPIRIES = [7, 14, 30, 60, 90, 180, 365];
export const SURFACE_MONEYNESS = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];

const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const round2 = (x: number) => Math.round(x * 100) / 100;
const roundLot = (x: number) => Math.max(100, Math.round(x / 100) * 100);

// Black-Scholes helpers (r = 4%, no dividends).
const RATE = 0.04;
function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
const normPdf = (x: number) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
function blackScholes(S: number, K: number, T: number, iv: number) {
  const sq = iv * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RATE + (iv * iv) / 2) * T) / sq;
  const d2 = d1 - sq;
  const disc = Math.exp(-RATE * T);
  return {
    call: S * normCdf(d1) - K * disc * normCdf(d2),
    put: K * disc * normCdf(-d2) - S * normCdf(-d1),
    callDelta: normCdf(d1),
    putDelta: normCdf(d1) - 1,
    gamma: normPdf(d1) / (S * sq),
    vega: (S * normPdf(d1) * Math.sqrt(T)) / 100,
  };
}

class Emitter<E> {
  private handlers = new Map<keyof E, Set<(v: never) => void>>();
  on<K extends keyof E>(event: K, fn: (value: E[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as (v: never) => void);
    return () => set.delete(fn as (v: never) => void);
  }
  protected emit<K extends keyof E>(event: K, value: E[K]) {
    this.handlers.get(event)?.forEach((fn) => (fn as (v: E[K]) => void)(value));
  }
}

interface InternalPosition {
  qty: number;
  avgPx: number;
  realized: number;
}

interface SymbolModel {
  vol: number;
  liquidity: number;
  fair: number;
  baseIv: number;
  skew: number;
}

export class MarketFeed extends Emitter<FeedEvents> {
  readonly quotes = new Map<string, Quote>();
  readonly cross: CrossQuote[] = [];
  readonly orders: Order[] = [];
  readonly pnlHistory: PnlPoint[] = [];
  readonly alerts: Alert[] = [];
  readonly sectors: string[] = [...new Set(UNIVERSE.map((u) => u[1]))];
  selected = 'NVDA';
  book: BookLevel[] = [];
  risk: RiskState;

  private model = new Map<string, SymbolModel>();
  private crossVol = new Map<string, number>();
  private candles = new Map<string, Candle[]>();
  private prints = new Map<string, Print[]>();
  private positions = new Map<string, InternalPosition>();
  private corrSamples = new Map<string, number[]>();
  private flowTraderVenue = new Map<string, number>();
  private flowVenueSide = new Map<string, number>();
  private bookSizes: { bid: number[]; ask: number[] } = { bid: [], ask: [] };
  private orderSeq = 40_211;
  private printSeq = 0;
  private alertSeq = 0;
  private firedAlerts = new Set<string>();
  private timers: number[] = [];

  constructor() {
    super();
    const now = Date.now();
    for (const [symbol, sector, base] of UNIVERSE) {
      // Per-tick log-return volatility; ~1-2% moves over a few minutes.
      const vol = 0.00025 + Math.random() * 0.00035;
      const liquidity = 0.3 + Math.random() * 2.7;
      // Back-fill a candle history so charts are not empty on load.
      const history: Candle[] = [];
      let px = base * (1 + gauss() * 0.01);
      const ticksPerCandle = CANDLE_MS / TICK_MS;
      for (let i = MAX_CANDLES; i > 0; i--) {
        const c: Candle = { t: now - i * CANDLE_MS, o: px, h: px, l: px, c: px, v: 0 };
        for (let k = 0; k < ticksPerCandle; k++) {
          px *= Math.exp(gauss() * vol);
          c.h = Math.max(c.h, px);
          c.l = Math.min(c.l, px);
          c.v += Math.round(Math.random() * 800 * liquidity) * 10;
        }
        c.c = px;
        history.push(c);
      }
      this.candles.set(symbol, history);
      this.prints.set(symbol, []);
      this.corrSamples.set(symbol, [px]);
      this.model.set(symbol, {
        vol,
        liquidity,
        fair: px,
        baseIv: 0.18 + Math.random() * 0.35 + (sector === 'Tech' || sector === 'Consumer' ? 0.08 : 0),
        skew: -(0.08 + Math.random() * 0.12),
      });
      const open = history[0].o;
      const last = round2(px);
      const spread = Math.max(0.01, round2(last * 0.0002));
      this.quotes.set(symbol, {
        symbol,
        sector,
        last,
        bid: round2(last - spread / 2),
        ask: round2(last + spread / 2),
        open: round2(open),
        high: round2(Math.max(...history.map((c) => c.h))),
        low: round2(Math.min(...history.map((c) => c.l))),
        change: round2(last - open),
        changePct: ((last - open) / open) * 100,
        volume: history.reduce((s, c) => s + c.v, 0),
      });
    }
    for (const [id, name, assetClass, price, decimals, vol, isYield] of CROSS) {
      const open = price * (1 + gauss() * vol * 8);
      this.crossVol.set(id, vol);
      this.cross.push({ id, name, assetClass, last: price, open, change: price - open, changePct: ((price - open) / open) * 100, decimals, isYield, high: Math.max(price, open), low: Math.min(price, open) });
    }
    // Seed a book of positions.
    const seeded = [...this.quotes.keys()].sort(() => Math.random() - 0.5).slice(0, 15);
    for (const symbol of seeded) {
      const q = this.quotes.get(symbol)!;
      const qty = Math.round((Math.random() * 6000 + 200) / 100) * 100 * (Math.random() < 0.7 ? 1 : -1);
      this.positions.set(symbol, { qty, avgPx: round2(q.last * (1 + gauss() * 0.015)), realized: round2(gauss() * 20_000) });
    }
    const exposure = this.exposure();
    this.risk = {
      killed: false,
      deskFlow: 0.6,
      maxOrderQty: 10_000,
      grossLimit: Math.ceil((exposure.gross * 1.5) / 5_000_000) * 5_000_000,
      lossLimit: -750_000,
      gross: exposure.gross,
      net: exposure.net,
      dayPnl: this.totals().total,
      workingOrders: 0,
    };
    // Back-fill P&L so the chart has a shape; it converges on the live value.
    const totalNow = this.totals().total;
    let walk = totalNow - gauss() * 40_000;
    for (let i = 120; i > 0; i--) {
      walk += (totalNow - walk) / (i + 4) + gauss() * 6_000;
      this.pnlHistory.push({ t: now - i * 1000, total: walk, realized: this.totals().realized });
    }
    this.rebuildBook(true);
  }

  start() {
    this.timers.push(window.setInterval(() => this.tick(), TICK_MS));
    this.timers.push(window.setInterval(() => this.samplePnl(), 1000));
    this.timers.push(window.setInterval(() => this.rebuildBook(false), 250));
    this.timers.push(window.setInterval(() => this.sampleCorrelation(), 250));
    this.timers.push(
      window.setInterval(() => {
        this.emit('positions', this.positionsSnapshot());
        this.emitRisk();
      }, 500),
    );
  }

  stop() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
  }

  select(symbol: string) {
    if (!this.quotes.has(symbol) || symbol === this.selected) return;
    this.selected = symbol;
    this.rebuildBook(true);
    this.emit('select', symbol);
    this.emit('candles', symbol);
  }

  candlesFor(symbol: string): Candle[] {
    return this.candles.get(symbol) ?? [];
  }

  printsFor(symbol: string): Print[] {
    return this.prints.get(symbol) ?? [];
  }

  // ---------------------------------------------------------------- orders

  preTradeCheck(req: OrderRequest): PreTradeCheck {
    const q = this.quotes.get(req.symbol);
    const type = req.type ?? 'MKT';
    const refPrice = q ? (type === 'MKT' ? (req.side === 'BUY' ? q.ask : q.bid) : (req.price ?? 0)) : 0;
    const notional = refPrice * req.qty;
    const pos = this.positions.get(req.symbol)?.qty ?? 0;
    const after = pos + (req.side === 'BUY' ? req.qty : -req.qty);
    const grossAfter = this.risk.gross - Math.abs(pos * (q?.last ?? 0)) + Math.abs(after * (q?.last ?? 0));
    const fail = (reason: string): PreTradeCheck => ({ ok: false, reason, notional, grossAfter, refPrice });
    if (!q) return fail('Unknown symbol');
    if (this.risk.killed) return fail('Kill switch is engaged');
    if (!Number.isFinite(req.qty) || req.qty < 100 || req.qty % 100 !== 0) return fail('Quantity must be a positive multiple of 100');
    if (req.qty > this.risk.maxOrderQty) return fail(`Exceeds max order size (${this.risk.maxOrderQty.toLocaleString()})`);
    if (type !== 'MKT' && !(req.price && req.price > 0)) return fail(`${type === 'LMT' ? 'Limit' : 'Stop'} price required`);
    if (grossAfter > this.risk.grossLimit && grossAfter > this.risk.gross) return fail(`Gross limit breach (${fmtMoney(grossAfter)} > ${fmtMoney(this.risk.grossLimit)})`);
    if (type === 'LMT' && Math.abs((req.price! - q.last) / q.last) > 0.1) return fail('Limit price more than 10% away from last');
    return { ok: true, reason: 'Passed pre-trade checks', notional, grossAfter, refPrice };
  }

  submitOrder(req: OrderRequest): Order {
    const q = this.quotes.get(req.symbol)!;
    const trader = req.trader ?? 'YOU';
    const type = req.type ?? 'MKT';
    const order: Order = {
      id: `ORD-${++this.orderSeq}`,
      time: Date.now(),
      symbol: req.symbol,
      side: req.side,
      qty: req.qty,
      filled: 0,
      price: type === 'MKT' ? (req.side === 'BUY' ? q.ask : q.bid) : (req.price ?? q.last),
      notional: 0,
      status: 'WORKING',
      trader,
      venue: pick(VENUES),
      type,
      limit: type === 'MKT' ? null : (req.price ?? null),
      tif: req.tif ?? 'DAY',
      algo: req.algo ?? 'NONE',
      participation: req.participation ?? 0.15,
      triggered: false,
      reason: '',
    };
    if (trader === 'YOU') {
      const check = this.preTradeCheck(req);
      if (!check.ok) {
        order.status = 'REJECTED';
        order.reason = check.reason;
        this.alert('warn', `Rejected ${order.side} ${order.qty.toLocaleString()} ${order.symbol}: ${check.reason}`);
      }
    } else if (this.risk.killed) {
      order.status = 'REJECTED';
      order.reason = 'Kill switch is engaged';
    }
    this.orders.push(order);
    if (this.orders.length > 600) this.orders.splice(0, this.orders.length - 600);
    this.emit('order', order);
    return order;
  }

  cancelOrder(id: string, reason = 'Cancelled by user'): boolean {
    const o = this.orders.find((x) => x.id === id);
    if (!o || !isActive(o)) return false;
    o.status = 'CANCELLED';
    o.reason = reason;
    this.emit('order', o);
    return true;
  }

  cancelAll(onlyMine = true, reason = 'Cancel all'): number {
    let n = 0;
    for (const o of this.orders) if (isActive(o) && (!onlyMine || o.trader === 'YOU') && this.cancelOrder(o.id, reason)) n++;
    return n;
  }

  amendOrder(id: string, change: { qty?: number; limit?: number }): boolean {
    const o = this.orders.find((x) => x.id === id);
    if (!o || !isActive(o)) return false;
    if (change.qty !== undefined) {
      const qty = roundLot(change.qty);
      if (qty <= o.filled || qty > this.risk.maxOrderQty) return false;
      o.qty = qty;
    }
    if (change.limit !== undefined && o.type !== 'MKT') o.limit = round2(change.limit);
    o.reason = 'Amended';
    this.emit('order', o);
    return true;
  }

  flatten(symbol: string): Order | null {
    const p = this.positions.get(symbol);
    if (!p || p.qty === 0) return null;
    const qty = Math.min(Math.abs(p.qty), this.risk.maxOrderQty);
    return this.submitOrder({ symbol, side: p.qty > 0 ? 'SELL' : 'BUY', qty, type: 'MKT', tif: 'IOC' });
  }

  flattenAll(): number {
    let n = 0;
    for (const symbol of this.positions.keys()) if (this.flatten(symbol)?.status === 'WORKING') n++;
    if (n) this.alert('warn', `Flatten all: ${n} closing orders sent`);
    return n;
  }

  setKillSwitch(on: boolean) {
    if (this.risk.killed === on) return;
    this.risk.killed = on;
    if (on) {
      const n = this.cancelAll(false, 'Kill switch');
      this.alert('crit', `KILL SWITCH ENGAGED · desk flow halted · ${n} working orders cancelled`);
    } else {
      this.alert('info', 'Kill switch released · trading resumed');
    }
    this.emitRisk();
  }

  setRiskParam(param: 'deskFlow' | 'maxOrderQty' | 'grossLimit' | 'lossLimit', value: number) {
    this.risk[param] = value;
    this.emitRisk();
  }

  // ------------------------------------------------------------- analytics

  positionsSnapshot(): Position[] {
    const out: Position[] = [];
    for (const [symbol, p] of this.positions) {
      const q = this.quotes.get(symbol)!;
      out.push({
        symbol,
        sector: q.sector,
        qty: p.qty,
        avgPx: p.avgPx,
        last: q.last,
        mktValue: p.qty * q.last,
        unrealized: p.qty === 0 ? 0 : p.qty * (q.last - p.avgPx),
        realized: p.realized,
      });
    }
    return out;
  }

  totals() {
    let unrealized = 0;
    let realized = 0;
    for (const [symbol, p] of this.positions) {
      const q = this.quotes.get(symbol)!;
      unrealized += p.qty * (q.last - p.avgPx);
      realized += p.realized;
    }
    return { unrealized, realized, total: unrealized + realized };
  }

  exposure() {
    let gross = 0;
    let net = 0;
    for (const [symbol, p] of this.positions) {
      const v = p.qty * this.quotes.get(symbol)!.last;
      gross += Math.abs(v);
      net += v;
    }
    return { gross, net };
  }

  /** Implied vol from a per-symbol smile: skewed, convex, with term structure. */
  impliedVol(symbol: string, strike: number, days: number) {
    const m = this.model.get(symbol)!;
    const S = this.quotes.get(symbol)!.last;
    const k = Math.log(strike / S);
    const T = days / 365;
    const term = 0.04 * Math.exp(-T * 3) - 0.015 * Math.sqrt(T);
    return Math.max(0.05, m.baseIv + term + m.skew * k + (0.9 / Math.sqrt(T + 0.05)) * k * k * 0.25);
  }

  optionChain(symbol: string, days = 30): OptionRow[] {
    const S = this.quotes.get(symbol)!.last;
    const step = niceStep(S * 0.025);
    const atm = Math.round(S / step) * step;
    const T = days / 365;
    const rows: OptionRow[] = [];
    for (let i = -8; i <= 8; i++) {
      const K = round2(atm + i * step);
      if (K <= 0) continue;
      const iv = this.impliedVol(symbol, K, days);
      const bs = blackScholes(S, K, T, iv);
      const spread = (p: number) => Math.max(0.01, round2(p * 0.02 + 0.02));
      rows.push({
        strike: K,
        callBid: Math.max(0, round2(bs.call - spread(bs.call) / 2)),
        callAsk: round2(bs.call + spread(bs.call) / 2),
        callIv: iv * 100,
        callDelta: bs.callDelta,
        callGamma: bs.gamma,
        putBid: Math.max(0, round2(bs.put - spread(bs.put) / 2)),
        putAsk: round2(bs.put + spread(bs.put) / 2),
        putIv: iv * 100,
        putDelta: bs.putDelta,
        putGamma: bs.gamma,
        vega: bs.vega,
        callItm: K < S,
        atm: K === atm,
      });
    }
    return rows;
  }

  /** IV (%) for SURFACE_MONEYNESS x OPTION_EXPIRIES. */
  volSurface(symbol: string): number[][] {
    const S = this.quotes.get(symbol)!.last;
    return OPTION_EXPIRIES.map((d) => SURFACE_MONEYNESS.map((m) => this.impliedVol(symbol, S * m, d) * 100));
  }

  /** Pearson correlation of 250ms log returns, symbols grouped by sector. */
  correlation(): { symbols: string[]; matrix: number[][] } {
    const symbols = UNIVERSE.map((u) => u[0]);
    const returns = symbols.map((s) => {
      const xs = this.corrSamples.get(s)!;
      const r: number[] = [];
      for (let i = 1; i < xs.length; i++) r.push(Math.log(xs[i] / xs[i - 1]));
      return r;
    });
    const stats = returns.map((r) => {
      const mean = r.reduce((a, b) => a + b, 0) / Math.max(1, r.length);
      const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, r.length)) || 1e-12;
      return { mean, sd };
    });
    const matrix = symbols.map((_, i) =>
      symbols.map((__, j) => {
        if (i === j) return 1;
        const a = returns[i];
        const b = returns[j];
        const n = Math.min(a.length, b.length);
        if (n < 5) return 0;
        let s = 0;
        for (let k = 0; k < n; k++) s += (a[k] - stats[i].mean) * (b[k] - stats[j].mean);
        return s / n / (stats[i].sd * stats[j].sd);
      }),
    );
    return { symbols, matrix };
  }

  /** Filled notional by trader -> venue -> side, for the Sankey. */
  orderFlow() {
    const links: Array<{ source: string; target: string; value: number }> = [];
    for (const [k, v] of this.flowTraderVenue) {
      const [source, target] = k.split('>');
      links.push({ source, target, value: v });
    }
    for (const [k, v] of this.flowVenueSide) {
      const [source, target] = k.split('>');
      links.push({ source, target, value: v });
    }
    return links;
  }

  // -------------------------------------------------------------- the tick

  private tick() {
    const now = Date.now();
    const changed: Quote[] = [];
    const newPrints: Print[] = [];
    // One market factor and one factor per sector drive the correlation structure.
    const market = gauss();
    const sectorShock = new Map(this.sectors.map((s) => [s, gauss()]));
    for (const q of this.quotes.values()) {
      const m = this.model.get(q.symbol)!;
      const r = (m.vol * (0.55 * market + 0.65 * sectorShock.get(q.sector)! + 0.55 * gauss())) / 1.014;
      m.fair *= Math.exp(r - 0.004 * (m.fair / q.open - 1));
      if (Math.random() > 0.25) continue;
      const px = Math.max(0.5, round2(m.fair));
      const spread = Math.max(0.01, round2(px * (0.00015 + Math.random() * 0.0002)));
      const prev = q.last;
      q.last = px;
      q.bid = round2(px - spread / 2);
      q.ask = round2(Math.max(q.bid + 0.01, px + spread / 2));
      q.high = Math.max(q.high, px);
      q.low = Math.min(q.low, px);
      q.change = round2(px - q.open);
      q.changePct = ((px - q.open) / q.open) * 100;
      const traded = Math.round(Math.random() * 60 * m.liquidity) * 100;
      q.volume += traded;
      this.updateCandle(q.symbol, px, traded, now);
      changed.push(q);
      this.checkMoveAlert(q);
      // Time & sales prints.
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const block = Math.random() < 0.03;
        const size = block ? roundLot(5000 + Math.random() * 40000) : Math.max(1, Math.round(Math.exp(Math.random() * 6) * m.liquidity));
        const side: Print['side'] = px > prev ? 'BUY' : px < prev ? 'SELL' : Math.random() < 0.5 ? 'BUY' : 'MID';
        const p: Print = { id: ++this.printSeq, time: now, symbol: q.symbol, price: side === 'BUY' ? q.ask : side === 'SELL' ? q.bid : px, size, side, venue: pick(VENUES) };
        const list = this.prints.get(q.symbol)!;
        list.unshift(p);
        if (list.length > MAX_PRINTS) list.pop();
        if (q.symbol === this.selected) newPrints.push(p);
      }
    }
    if (changed.length) this.emit('quotes', changed);
    if (newPrints.length) this.emit('prints', newPrints);
    this.emit('candles', this.selected);

    // Cross-asset.
    const crossChanged: CrossQuote[] = [];
    for (const c of this.cross) {
      if (Math.random() > 0.3) continue;
      const vol = this.crossVol.get(c.id)!;
      c.last = c.last * Math.exp(gauss() * vol - 0.01 * (c.last / c.open - 1) * vol);
      c.change = c.last - c.open;
      c.changePct = ((c.last - c.open) / c.open) * 100;
      c.high = Math.max(c.high, c.last);
      c.low = Math.min(c.low, c.last);
      crossChanged.push(c);
    }
    if (crossChanged.length) this.emit('cross', crossChanged);

    // Desk order flow from the other traders.
    if (!this.risk.killed && Math.random() < 0.55 * this.risk.deskFlow) {
      const sym = pick(UNIVERSE)[0];
      const q = this.quotes.get(sym)!;
      const qty = roundLot(Math.exp(6 + Math.random() * 3.2));
      const r = Math.random();
      const type: OrderType = r < 0.6 ? 'MKT' : r < 0.92 ? 'LMT' : 'STP';
      const side: Side = Math.random() < 0.5 ? 'BUY' : 'SELL';
      const off = q.last * (0.0005 + Math.random() * 0.002);
      const price = type === 'LMT' ? round2(side === 'BUY' ? q.bid - off * 0.3 : q.ask + off * 0.3) : type === 'STP' ? round2(side === 'BUY' ? q.last + off : q.last - off) : null;
      const algo: Algo = qty > 5000 ? pick(['VWAP', 'TWAP', 'POV'] as const) : 'NONE';
      this.submitOrder({ symbol: sym, side, qty, type, price, algo, participation: 0.1 + Math.random() * 0.2, tif: 'DAY', trader: pick(TRADERS) });
    }
    this.workOrders();
  }

  private workOrders() {
    for (const o of this.orders) {
      if (!isActive(o)) continue;
      const mine = o.trader === 'YOU';
      if (!mine && Math.random() < 0.003) {
        this.cancelOrder(o.id, 'Cancelled by trader');
        continue;
      }
      const q = this.quotes.get(o.symbol)!;
      if (o.type === 'STP' && !o.triggered) {
        const hit = o.side === 'BUY' ? q.last >= o.limit! : q.last <= o.limit!;
        if (!hit) continue;
        o.triggered = true;
        o.reason = `Stop triggered @ ${q.last.toFixed(2)}`;
        this.emit('order', o);
      }
      const marketable = o.type !== 'LMT' || (o.side === 'BUY' ? q.ask <= o.limit! : q.bid >= o.limit!);
      if (!marketable) {
        if (o.tif === 'IOC') this.cancelOrder(o.id, 'IOC: not marketable');
        continue;
      }
      const remaining = o.qty - o.filled;
      let prob: number;
      let size: number;
      const liq = this.model.get(o.symbol)!.liquidity;
      switch (o.algo) {
        case 'VWAP':
          prob = 0.35;
          size = o.qty * 0.04 * (0.5 + Math.random()) * Math.min(2, liq);
          break;
        case 'TWAP':
          prob = 0.25;
          size = o.qty / 30;
          break;
        case 'POV':
          prob = 0.5;
          size = o.qty * o.participation * 0.2 * (0.5 + Math.random());
          break;
        default:
          prob = mine ? 0.6 : 0.22;
          size = remaining * (0.25 + Math.random() * 0.6);
      }
      if (o.tif === 'IOC') prob = 1;
      if (Math.random() > prob) continue;
      let chunk = Math.min(remaining, roundLot(size));
      if (o.tif === 'IOC') chunk = Math.min(remaining, roundLot(remaining * (0.5 + Math.random() * 0.5)));
      let px = o.side === 'BUY' ? q.ask : q.bid;
      if (o.type === 'LMT') px = o.side === 'BUY' ? Math.min(px, o.limit!) : Math.max(px, o.limit!);
      o.price = round2((o.price * o.filled + px * chunk) / (o.filled + chunk));
      o.filled += chunk;
      o.notional = o.filled * o.price;
      o.status = o.filled >= o.qty ? 'FILLED' : 'PARTIAL';
      if (o.status === 'PARTIAL' && o.tif === 'IOC') {
        o.status = 'CANCELLED';
        o.reason = `IOC: ${o.filled.toLocaleString()} filled, rest cancelled`;
      }
      this.applyFill(o.symbol, o.side, chunk, px);
      const notional = chunk * px;
      this.flowTraderVenue.set(`${o.trader}>${o.venue}`, (this.flowTraderVenue.get(`${o.trader}>${o.venue}`) ?? 0) + notional);
      this.flowVenueSide.set(`${o.venue}>${o.side}`, (this.flowVenueSide.get(`${o.venue}>${o.side}`) ?? 0) + notional);
      if (o.status === 'FILLED' && o.notional > 2_500_000) {
        this.alert('info', `Large fill: ${o.side} ${o.qty.toLocaleString()} ${o.symbol} @ ${o.price.toFixed(2)} (${o.trader})`);
      }
      if (mine && o.status === 'FILLED') this.alert('info', `Filled: ${o.side} ${o.qty.toLocaleString()} ${o.symbol} @ ${o.price.toFixed(2)} (${o.type}${o.algo !== 'NONE' ? ` ${o.algo}` : ''})`);
      this.emit('order', o);
    }
  }

  private applyFill(symbol: string, side: Side, qty: number, px: number) {
    const p = this.positions.get(symbol) ?? { qty: 0, avgPx: 0, realized: 0 };
    const signed = side === 'BUY' ? qty : -qty;
    if (p.qty === 0 || Math.sign(p.qty) === Math.sign(signed)) {
      p.avgPx = (p.avgPx * Math.abs(p.qty) + px * qty) / (Math.abs(p.qty) + qty);
      p.qty += signed;
    } else {
      const closing = Math.min(qty, Math.abs(p.qty));
      p.realized += closing * (px - p.avgPx) * Math.sign(p.qty);
      const before = p.qty;
      p.qty += signed;
      if (p.qty === 0) p.avgPx = 0;
      else if (Math.sign(p.qty) !== Math.sign(before)) p.avgPx = px;
    }
    this.positions.set(symbol, p);
  }

  private updateCandle(symbol: string, px: number, volume: number, now: number) {
    const list = this.candles.get(symbol)!;
    let c = list[list.length - 1];
    if (now - c.t >= CANDLE_MS) {
      c = { t: now, o: c.c, h: px, l: px, c: px, v: 0 };
      list.push(c);
      if (list.length > MAX_CANDLES) list.shift();
    }
    c.h = Math.max(c.h, px);
    c.l = Math.min(c.l, px);
    c.c = px;
    c.v += volume;
  }

  private sampleCorrelation() {
    for (const [symbol, m] of this.model) {
      const xs = this.corrSamples.get(symbol)!;
      xs.push(m.fair);
      if (xs.length > CORR_SAMPLES) xs.shift();
    }
    // Implied vols drift a little.
    for (const m of this.model.values()) m.baseIv = Math.min(0.9, Math.max(0.1, m.baseIv + gauss() * 0.0008));
  }

  private samplePnl() {
    const t = this.totals();
    const point = { t: Date.now(), total: t.total, realized: t.realized };
    this.pnlHistory.push(point);
    if (this.pnlHistory.length > MAX_PNL_POINTS) this.pnlHistory.shift();
    this.emit('pnl', point);
    for (const pos of this.positionsSnapshot()) {
      if (pos.unrealized < -150_000) this.alertOnce(`dd:${pos.symbol}`, 'crit', `Drawdown: ${pos.symbol} unrealized ${fmtMoney(pos.unrealized)}`);
    }
    if (t.total < this.risk.lossLimit) this.alertOnce('loss-limit', 'crit', `Desk P&L ${fmtMoney(t.total)} breached loss limit ${fmtMoney(this.risk.lossLimit)}`);
  }

  private emitRisk() {
    const e = this.exposure();
    this.risk.gross = e.gross;
    this.risk.net = e.net;
    this.risk.dayPnl = this.totals().total;
    this.risk.workingOrders = this.orders.filter(isActive).length;
    if (e.gross > this.risk.grossLimit) this.alertOnce(`gross:${this.risk.grossLimit}`, 'crit', `Gross exposure ${fmtMoney(e.gross)} above limit ${fmtMoney(this.risk.grossLimit)}`);
    this.emit('risk', { ...this.risk });
  }

  private rebuildBook(reset: boolean) {
    const q = this.quotes.get(this.selected)!;
    const step = Math.max(0.01, round2(q.last / 4000));
    if (reset || this.bookSizes.bid.length !== BOOK_LEVELS) {
      this.bookSizes = {
        bid: Array.from({ length: BOOK_LEVELS }, (_, i) => 200 + i * 150 + Math.random() * 1500),
        ask: Array.from({ length: BOOK_LEVELS }, (_, i) => 200 + i * 150 + Math.random() * 1500),
      };
    }
    const jiggle = (s: number, i: number) => Math.max(100, s + gauss() * (120 + i * 40));
    this.bookSizes.bid = this.bookSizes.bid.map(jiggle);
    this.bookSizes.ask = this.bookSizes.ask.map(jiggle);
    let bidCum = 0;
    let askCum = 0;
    const rows: BookLevel[] = [];
    for (let i = 0; i < BOOK_LEVELS; i++) {
      const bidSize = Math.round(this.bookSizes.bid[i] / 100) * 100;
      const askSize = Math.round(this.bookSizes.ask[i] / 100) * 100;
      bidCum += bidSize;
      askCum += askSize;
      rows.push({ level: i, bidSize, askSize, bid: round2(q.bid - i * step), ask: round2(q.ask + i * step), bidCum, askCum, bidDepthPct: 0, askDepthPct: 0 });
    }
    const max = Math.max(bidCum, askCum);
    for (const r of rows) {
      r.bidDepthPct = (r.bidCum / max) * 100;
      r.askDepthPct = (r.askCum / max) * 100;
    }
    this.book = rows;
    this.emit('book', rows);
  }

  private checkMoveAlert(q: Quote) {
    for (const threshold of [2, 4]) {
      if (q.changePct >= threshold) this.alertOnce(`up${threshold}:${q.symbol}`, threshold > 2 ? 'crit' : 'warn', `${q.symbol} up ${q.changePct.toFixed(2)}% on the session`);
      if (q.changePct <= -threshold) this.alertOnce(`dn${threshold}:${q.symbol}`, threshold > 2 ? 'crit' : 'warn', `${q.symbol} down ${q.changePct.toFixed(2)}% on the session`);
    }
  }

  private alertOnce(key: string, level: Alert['level'], text: string) {
    if (this.firedAlerts.has(key)) return;
    this.firedAlerts.add(key);
    this.alert(level, text);
  }

  private alert(level: Alert['level'], text: string) {
    const a: Alert = { id: ++this.alertSeq, time: Date.now(), level, text };
    this.alerts.unshift(a);
    if (this.alerts.length > 50) this.alerts.pop();
    this.emit('alert', a);
  }
}

export const isActive = (o: Order) => o.status === 'WORKING' || o.status === 'PARTIAL';

function niceStep(x: number) {
  const steps = [0.5, 1, 2.5, 5, 10, 25, 50];
  return steps.find((s) => s >= x) ?? 50;
}

export const fmtMoney = (v: number) => {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
};

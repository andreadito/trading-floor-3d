import {
  AllCommunityModule,
  ModuleRegistry,
  colorSchemeDarkBlue,
  createGrid,
  themeQuartz,
  type CellClassParams,
  type ColDef,
  type ColGroupDef,
  type GridApi,
  type GridOptions,
  type ICellRendererParams,
  type ValueFormatterParams,
} from 'ag-grid-community';
import { fmtMoney, isActive, type BookLevel, type CrossQuote, type MarketFeed, type OptionRow, type Order, type Position, type Print, type Quote } from '../feed';
import { createPanel, type Panel } from './panel';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withPart(colorSchemeDarkBlue).withParams({
  backgroundColor: '#0a1222',
  foregroundColor: '#d6e2f5',
  headerBackgroundColor: '#0e1a30',
  headerTextColor: '#8fa6c8',
  oddRowBackgroundColor: '#0c1527',
  borderColor: '#1a2742',
  accentColor: '#3d8bfd',
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontSize: 13,
  headerFontSize: 12,
  rowHeight: 27,
  headerHeight: 30,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  cellHorizontalPadding: 10,
});

const num = (digits: number) => (p: ValueFormatterParams) =>
  p.value == null || Number.isNaN(p.value) ? '' : Number(p.value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (digits: number) => (p: ValueFormatterParams) =>
  p.value == null ? '' : `${p.value > 0 ? '+' : ''}${Number(p.value).toFixed(digits)}`;
const money = (p: ValueFormatterParams) => (p.value == null ? '' : fmtMoney(p.value));
const clock = (p: ValueFormatterParams) => new Date(p.value).toLocaleTimeString('en-GB', { hour12: false });
const clockMs = (p: ValueFormatterParams) => {
  const d = new Date(p.value);
  return `${d.toLocaleTimeString('en-GB', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const tone = { 'num-up': (p: CellClassParams) => p.value > 0, 'num-down': (p: CellClassParams) => p.value < 0 };
const numericCol = { type: 'rightAligned', cellClass: 'num' } satisfies ColDef;

function pill(p: ICellRendererParams) {
  const span = document.createElement('span');
  span.className = `pill pill-${String(p.value).toLowerCase()}`;
  span.textContent = p.value;
  return span;
}

function progress(p: ICellRendererParams<Order>) {
  const o = p.data!;
  const pct = Math.round((o.filled / o.qty) * 100);
  const wrap = document.createElement('div');
  wrap.className = 'progress';
  wrap.innerHTML = `<div class="progress-bar" style="width:${pct}%"></div><span>${o.filled.toLocaleString()} / ${o.qty.toLocaleString()}</span>`;
  return wrap;
}

function mount<T>(panel: Panel, options: GridOptions<T>): GridApi<T> {
  const host = document.createElement('div');
  host.className = 'grid-host';
  panel.body.appendChild(host);
  return createGrid<T>(host, {
    theme,
    animateRows: false,
    suppressMovableColumns: true,
    asyncTransactionWaitMillis: 120,
    cellFlashDuration: 250,
    cellFadeDuration: 350,
    ...options,
  });
}

// ------------------------------------------------------------ Market Watch

export function createMarketWatch(feed: MarketFeed): Panel {
  const panel = createPanel('market-watch', 'Market Watch', 820, 600, '#22c55e');
  const columnDefs: ColDef<Quote>[] = [
    { field: 'symbol', headerName: 'Symbol', width: 92, cellClass: 'sym' },
    { field: 'last', headerName: 'Last', width: 96, ...numericCol, valueFormatter: num(2), enableCellChangeFlash: true },
    { field: 'change', headerName: 'Chg', width: 82, ...numericCol, valueFormatter: signed(2), cellClassRules: tone },
    { field: 'changePct', headerName: 'Chg %', width: 88, ...numericCol, valueFormatter: (p) => `${signed(2)(p)}%`, cellClassRules: tone },
    { field: 'bid', headerName: 'Bid', width: 92, ...numericCol, valueFormatter: num(2) },
    { field: 'ask', headerName: 'Ask', width: 92, ...numericCol, valueFormatter: num(2) },
    { field: 'volume', headerName: 'Volume', flex: 1, ...numericCol, valueFormatter: num(0) },
  ];
  const api = mount<Quote>(panel, {
    columnDefs,
    rowData: [...feed.quotes.values()].map((q) => ({ ...q })),
    getRowId: (p) => p.data.symbol,
    rowSelection: { mode: 'singleRow', checkboxes: false, enableClickSelection: true },
    onRowClicked: (e) => e.data && feed.select(e.data.symbol),
    onFirstDataRendered: (e) => e.api.getRowNode(feed.selected)?.setSelected(true),
  });
  panel.setSubtitle('24 symbols · click a row to drive the desk');
  feed.on('quotes', (quotes) => api.applyTransactionAsync({ update: quotes.map((q) => ({ ...q })) }));
  feed.on('select', (sym) => api.getRowNode(sym)?.setSelected(true));
  return panel;
}

// --------------------------------------------------- Order Book + quick ticket

export function createOrderBook(feed: MarketFeed): Panel {
  const panel = createPanel('order-book', 'Order Book', 820, 600, '#f59e0b');

  // A quick ticket: real inputs and buttons, clickable inside the 3D world.
  const ticket = document.createElement('form');
  ticket.className = 'ticket';
  ticket.innerHTML = `
    <label>Qty <input name="qty" type="number" min="100" step="100" value="1000" /></label>
    <button type="button" class="buy" data-side="BUY">BUY</button>
    <button type="button" class="sell" data-side="SELL">SELL</button>
    <span class="ticket-status" aria-live="polite"></span>`;
  panel.body.appendChild(ticket);
  const qtyInput = ticket.querySelector<HTMLInputElement>('input[name=qty]')!;
  const status = ticket.querySelector<HTMLElement>('.ticket-status')!;
  ticket.addEventListener('submit', (e) => e.preventDefault());
  ticket.addEventListener('click', (e) => {
    const side = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-side]')?.dataset.side as 'BUY' | 'SELL' | undefined;
    if (!side) return;
    const qty = Math.max(100, Math.round(Number(qtyInput.value) / 100) * 100 || 100);
    const order = feed.submitOrder({ symbol: feed.selected, side, qty });
    status.textContent = order.status === 'REJECTED' ? `Rejected: ${order.reason}` : `${order.id} ${side} ${qty.toLocaleString()} ${order.symbol} sent`;
  });

  const depth = (side: 'bid' | 'ask') => (p: CellClassParams<BookLevel>) => {
    const pct = side === 'bid' ? p.data!.bidDepthPct : p.data!.askDepthPct;
    const color = side === 'bid' ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';
    const dir = side === 'bid' ? 'to left' : 'to right';
    return { background: `linear-gradient(${dir}, ${color} ${pct}%, transparent ${pct}%)` };
  };
  const columnDefs: ColDef<BookLevel>[] = [
    { field: 'bidSize', headerName: 'Bid Size', flex: 1, ...numericCol, valueFormatter: num(0), cellStyle: depth('bid') },
    { field: 'bid', headerName: 'Bid', flex: 1, ...numericCol, valueFormatter: num(2), cellClass: 'num num-up' },
    { field: 'ask', headerName: 'Ask', flex: 1, valueFormatter: num(2), cellClass: 'num num-down' },
    { field: 'askSize', headerName: 'Ask Size', flex: 1, valueFormatter: num(0), cellClass: 'num', cellStyle: depth('ask') },
  ];
  const api = mount<BookLevel>(panel, {
    columnDefs,
    rowData: feed.book.map((r) => ({ ...r })),
    getRowId: (p) => String(p.data.level),
    suppressCellFocus: true,
  });
  const refreshTitle = () => {
    const q = feed.quotes.get(feed.selected)!;
    panel.setSubtitle(`${feed.selected} · spread ${(q.ask - q.bid).toFixed(2)}`);
  };
  refreshTitle();
  feed.on('book', (rows) => {
    api.applyTransactionAsync({ update: rows.map((r) => ({ ...r })) });
    refreshTitle();
  });
  return panel;
}

// --------------------------------------------------------------- Positions

export function createPositions(feed: MarketFeed): Panel {
  const panel = createPanel('positions', 'Positions & P&L', 820, 600, '#a855f7');
  const flattenButton = (p: ICellRendererParams<Position>) => {
    const pos = p.data;
    if (!pos || pos.symbol === 'TOTAL' || pos.qty === 0) return '';
    const b = document.createElement('button');
    b.className = 'row-btn';
    b.textContent = 'Flatten';
    b.title = `Close the ${pos.symbol} position at market`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      feed.flatten(pos.symbol);
    });
    return b;
  };
  const columnDefs: ColDef<Position>[] = [
    { field: 'symbol', headerName: 'Symbol', width: 84, cellClass: 'sym' },
    { field: 'qty', headerName: 'Qty', width: 84, ...numericCol, valueFormatter: num(0), cellClassRules: tone },
    { field: 'avgPx', headerName: 'Avg Px', width: 86, ...numericCol, valueFormatter: num(2) },
    { field: 'last', headerName: 'Last', width: 84, ...numericCol, valueFormatter: num(2) },
    { field: 'mktValue', headerName: 'Mkt Value', width: 100, ...numericCol, valueFormatter: money },
    { field: 'unrealized', headerName: 'Unrl P&L', width: 100, ...numericCol, valueFormatter: money, cellClassRules: tone, sort: 'desc' },
    { field: 'realized', headerName: 'Real P&L', width: 96, ...numericCol, valueFormatter: money, cellClassRules: tone },
    { headerName: '', colId: 'actions', flex: 1, cellRenderer: flattenButton, sortable: false },
  ];
  const totalsRow = (rows: Position[]): Position => ({
    symbol: 'TOTAL',
    sector: '',
    qty: NaN,
    avgPx: NaN,
    last: NaN,
    mktValue: rows.reduce((s, r) => s + r.mktValue, 0),
    unrealized: rows.reduce((s, r) => s + r.unrealized, 0),
    realized: rows.reduce((s, r) => s + r.realized, 0),
  });
  const initial = feed.positionsSnapshot();
  const api = mount<Position>(panel, {
    columnDefs,
    rowData: initial,
    getRowId: (p) => p.data.symbol,
    pinnedBottomRowData: [totalsRow(initial)],
    onRowClicked: (e) => e.data && e.data.symbol !== 'TOTAL' && feed.select(e.data.symbol),
  });
  const known = new Set(initial.map((p) => p.symbol));
  feed.on('positions', (rows) => {
    const add = rows.filter((r) => !known.has(r.symbol));
    add.forEach((r) => known.add(r.symbol));
    api.applyTransactionAsync({ add, update: rows.filter((r) => !add.includes(r)) });
    const t = totalsRow(rows);
    api.setGridOption('pinnedBottomRowData', [t]);
    const total = t.unrealized + t.realized;
    panel.setBadge(fmtMoney(total), total >= 0 ? 'up' : 'down');
    panel.setSubtitle(`${rows.filter((r) => r.qty !== 0).length} open positions`);
  });
  return panel;
}

// ------------------------------------------------------------ Trade Blotter

const MAX_BLOTTER_ROWS = 250;

export function createBlotter(feed: MarketFeed): Panel {
  const panel = createPanel('blotter', 'Trade Blotter', 1440, 810, '#3d8bfd');
  panel.root.classList.add('panel-large');
  const columnDefs: ColDef<Order>[] = [
    { field: 'time', headerName: 'Time', width: 100, valueFormatter: clock, cellClass: 'num muted' },
    { field: 'id', headerName: 'Order ID', width: 120, cellClass: 'num muted' },
    { field: 'symbol', headerName: 'Symbol', width: 92, cellClass: 'sym' },
    { field: 'side', headerName: 'Side', width: 88, cellRenderer: pill },
    { field: 'type', headerName: 'Type', width: 76, cellClass: 'muted' },
    { field: 'qty', headerName: 'Qty', width: 96, ...numericCol, valueFormatter: num(0) },
    { field: 'filled', headerName: 'Filled', width: 96, ...numericCol, valueFormatter: num(0), enableCellChangeFlash: true },
    { field: 'price', headerName: 'Avg Px', width: 96, ...numericCol, valueFormatter: num(2) },
    { field: 'notional', headerName: 'Notional', width: 110, ...numericCol, valueFormatter: money },
    { field: 'algo', headerName: 'Algo', width: 80, valueFormatter: (p) => (p.value === 'NONE' ? '' : p.value), cellClass: 'algo' },
    { field: 'status', headerName: 'Status', width: 124, cellRenderer: pill },
    { field: 'trader', headerName: 'Trader', width: 104, cellClassRules: { you: (p) => p.value === 'YOU' } },
    { field: 'venue', headerName: 'Venue', flex: 1 },
  ];
  const rows: Order[] = feed.orders.slice(-MAX_BLOTTER_ROWS).reverse().map((o) => ({ ...o }));
  const ids = new Set(rows.map((r) => r.id));
  const api = mount<Order>(panel, { columnDefs, rowData: rows, getRowId: (p) => p.data.id });
  let fills = 0;
  feed.on('order', (o) => {
    if (o.status === 'FILLED') fills++;
    if (ids.has(o.id)) {
      api.applyTransactionAsync({ update: [{ ...o }] });
      return;
    }
    ids.add(o.id);
    const remove: Order[] = [];
    if (ids.size > MAX_BLOTTER_ROWS) {
      const oldest = feed.orders.find((x) => ids.has(x.id));
      if (oldest) {
        ids.delete(oldest.id);
        remove.push({ ...oldest });
      }
    }
    api.applyTransactionAsync({ add: [{ ...o }], addIndex: 0, remove });
  });
  setInterval(() => {
    const working = feed.orders.filter(isActive).length;
    panel.setSubtitle(`${working} working · ${fills} filled this session`);
  }, 1000);
  return panel;
}

// ----------------------------------------------------------- Working Orders

export function createWorkingOrders(feed: MarketFeed): Panel {
  const panel = createPanel('working-orders', 'My Orders', 820, 600, '#fbbf24');
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.innerHTML = `
    <span class="toolbar-label">Working <b data-count>0</b></span>
    <button type="button" class="tb-btn" data-action="cancel-all">Cancel all</button>`;
  panel.body.appendChild(bar);
  const countEl = bar.querySelector<HTMLElement>('[data-count]')!;
  bar.querySelector('[data-action=cancel-all]')!.addEventListener('click', () => feed.cancelAll(true, 'Cancel all (My Orders)'));

  const actions = (p: ICellRendererParams<Order>) => {
    const o = p.data!;
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';
    if (!isActive(o)) return wrap;
    const step = Math.max(100, Math.round(o.qty * 0.1 / 100) * 100);
    const mk = (label: string, title: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `row-btn ${cls}`;
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      wrap.appendChild(b);
    };
    mk('✕', 'Cancel order', 'cancel', () => feed.cancelOrder(o.id));
    mk('−', `Reduce by ${step}`, 'amend', () => feed.amendOrder(o.id, { qty: o.qty - step }));
    mk('+', `Increase by ${step}`, 'amend', () => feed.amendOrder(o.id, { qty: o.qty + step }));
    if (o.type === 'LMT') {
      mk('▲', 'Raise limit by 1 tick', 'amend', () => feed.amendOrder(o.id, { limit: o.limit! + 0.01 }));
      mk('▼', 'Lower limit by 1 tick', 'amend', () => feed.amendOrder(o.id, { limit: o.limit! - 0.01 }));
    }
    return wrap;
  };
  const columnDefs: ColDef<Order>[] = [
    { field: 'id', headerName: 'Order', width: 92, cellClass: 'num muted' },
    { field: 'symbol', headerName: 'Sym', width: 62, cellClass: 'sym' },
    { field: 'side', headerName: 'Side', width: 70, cellRenderer: pill },
    { headerName: 'Type', width: 104, valueGetter: (p) => (p.data!.type === 'MKT' ? 'MKT' : `${p.data!.type} ${p.data!.limit?.toFixed(2)}`), cellClass: 'num' },
    { headerName: 'Filled', colId: 'progress', width: 118, cellRenderer: progress },
    { headerName: 'TIF/Algo', width: 78, valueGetter: (p) => `${p.data!.tif}${p.data!.algo !== 'NONE' ? ` ${p.data!.algo}` : ''}`, cellClass: 'muted' },
    { field: 'status', headerName: 'Status', width: 96, cellRenderer: pill, tooltipField: 'reason' },
    { headerName: '', colId: 'actions', flex: 1, cellRenderer: actions, sortable: false },
  ];
  const api = mount<Order>(panel, { columnDefs, rowData: [], getRowId: (p) => p.data.id, suppressCellFocus: true, rowHeight: 31 });
  const seen = new Set<string>();
  feed.on('order', (o) => {
    if (o.trader !== 'YOU') return;
    // Cell renderers read the row, so replace the whole row to refresh buttons and progress.
    if (seen.has(o.id)) api.applyTransactionAsync({ update: [{ ...o }] }, () => api.refreshCells({ columns: ['progress', 'actions'], force: true }));
    else {
      seen.add(o.id);
      api.applyTransactionAsync({ add: [{ ...o }], addIndex: 0 });
    }
    countEl.textContent = String(feed.orders.filter((x) => x.trader === 'YOU' && isActive(x)).length);
  });
  panel.setSubtitle('Amend or cancel your live orders');
  return panel;
}

// ----------------------------------------------------------- Time & Sales

export function createTimeAndSales(feed: MarketFeed): Panel {
  const panel = createPanel('time-sales', 'Time & Sales', 820, 600, '#38bdf8');
  const columnDefs: ColDef<Print>[] = [
    { field: 'time', headerName: 'Time', width: 130, valueFormatter: clockMs, cellClass: 'num muted' },
    { field: 'price', headerName: 'Price', width: 110, ...numericCol, valueFormatter: num(2), cellClassRules: { 'num-up': (p) => p.data?.side === 'BUY', 'num-down': (p) => p.data?.side === 'SELL' } },
    { field: 'size', headerName: 'Size', width: 110, ...numericCol, valueFormatter: num(0) },
    { field: 'side', headerName: 'Aggressor', width: 110, cellRenderer: pill },
    { field: 'venue', headerName: 'Venue', flex: 1, cellClass: 'muted' },
  ];
  const MAX = 120;
  const api = mount<Print>(panel, {
    columnDefs,
    rowData: feed.printsFor(feed.selected).slice(0, MAX),
    getRowId: (p) => String(p.data.id),
    suppressCellFocus: true,
    rowClassRules: { 'block-print': (p) => (p.data?.size ?? 0) >= 5000 },
  });
  let shown: Print[] = feed.printsFor(feed.selected).slice(0, MAX);
  feed.on('prints', (prints) => {
    const add = [...prints].reverse();
    shown = [...add, ...shown];
    const remove = shown.splice(MAX);
    api.applyTransactionAsync({ add, addIndex: 0, remove });
  });
  const reset = () => {
    api.flushAsyncTransactions(); // queued adds/removes belong to the previous symbol's rows
    shown = feed.printsFor(feed.selected).slice(0, MAX);
    api.setGridOption('rowData', shown);
    panel.setSubtitle(`${feed.selected} · blocks ≥ 5,000 highlighted`);
  };
  feed.on('select', reset);
  panel.setSubtitle(`${feed.selected} · blocks ≥ 5,000 highlighted`);
  return panel;
}

// ----------------------------------------------------------- Options chain

export function createOptionsChain(feed: MarketFeed): Panel {
  const panel = createPanel('options-chain', 'Options Chain', 1440, 810, '#e879f9');
  panel.root.classList.add('panel-large');
  const itmCall = { 'itm': (p: CellClassParams<OptionRow>) => !!p.data?.callItm };
  const itmPut = { 'itm': (p: CellClassParams<OptionRow>) => !!p.data && !p.data.callItm && !p.data.atm };
  const g = (digits: number) => num(digits);
  const columnDefs: (ColDef<OptionRow> | ColGroupDef<OptionRow>)[] = [
    {
      headerName: 'CALLS',
      headerClass: 'grp-calls',
      children: [
        { field: 'callGamma', headerName: 'Gamma', width: 96, ...numericCol, valueFormatter: g(4), cellClassRules: itmCall },
        { field: 'callDelta', headerName: 'Delta', width: 90, ...numericCol, valueFormatter: g(3), cellClassRules: itmCall },
        { field: 'callIv', headerName: 'IV %', width: 84, ...numericCol, valueFormatter: g(1), cellClassRules: itmCall },
        { field: 'callBid', headerName: 'Bid', width: 92, ...numericCol, valueFormatter: g(2), cellClassRules: itmCall },
        { field: 'callAsk', headerName: 'Ask', width: 92, ...numericCol, valueFormatter: g(2), cellClassRules: itmCall },
      ],
    },
    { field: 'strike', headerName: 'STRIKE', width: 120, cellClass: 'strike', headerClass: 'grp-strike', valueFormatter: g(2) },
    {
      headerName: 'PUTS',
      headerClass: 'grp-puts',
      children: [
        { field: 'putBid', headerName: 'Bid', width: 92, ...numericCol, valueFormatter: g(2), cellClassRules: itmPut },
        { field: 'putAsk', headerName: 'Ask', width: 92, ...numericCol, valueFormatter: g(2), cellClassRules: itmPut },
        { field: 'putIv', headerName: 'IV %', width: 84, ...numericCol, valueFormatter: g(1), cellClassRules: itmPut },
        { field: 'putDelta', headerName: 'Delta', width: 90, ...numericCol, valueFormatter: g(3), cellClassRules: itmPut },
        { field: 'putGamma', headerName: 'Gamma', width: 96, ...numericCol, valueFormatter: g(4), cellClassRules: itmPut },
      ],
    },
    { field: 'vega', headerName: 'Vega', flex: 1, ...numericCol, valueFormatter: g(3) },
  ];
  // No cell flashing here: every quote re-prices on each refresh, so flashes would just strobe whole columns.
  const api = mount<OptionRow>(panel, {
    columnDefs,
    rowData: feed.optionChain(feed.selected),
    getRowId: (p) => p.data.strike.toFixed(2),
    rowClassRules: { 'atm-row': (p) => !!p.data?.atm },
    suppressCellFocus: true,
    rowHeight: 34,
    headerHeight: 34,
    groupHeaderHeight: 34,
  });
  const refresh = (reset: boolean) => {
    const rows = feed.optionChain(feed.selected);
    if (reset) api.setGridOption('rowData', rows);
    else {
      // Strikes are re-centred on the spot; rows that left the window are replaced wholesale.
      const keys = new Set<string>();
      api.forEachNode((n) => n.data && keys.add(n.data.strike.toFixed(2)));
      // Synchronous on purpose: async updates could land after a rowData reset and miss their rows.
      if (rows.every((r) => keys.has(r.strike.toFixed(2)))) api.applyTransaction({ update: rows });
      else api.setGridOption('rowData', rows);
    }
    const q = feed.quotes.get(feed.selected)!;
    panel.setSubtitle(`${feed.selected} · 30-day expiry · spot ${q.last.toFixed(2)}`);
    const atm = rows.find((r) => r.atm);
    if (atm) panel.setBadge(`ATM IV ${atm.callIv.toFixed(1)}%`, 'neutral');
  };
  refresh(true);
  setInterval(() => refresh(false), 700);
  feed.on('select', () => refresh(true));
  return panel;
}

// -------------------------------------------------------------- Cross-asset

export function createCrossAsset(feed: MarketFeed): Panel {
  const panel = createPanel('cross-asset', 'Cross-Asset', 820, 600, '#2dd4bf');
  const fmt = (p: ValueFormatterParams<CrossQuote>) => (p.data ? p.data.last.toLocaleString('en-US', { minimumFractionDigits: p.data.decimals, maximumFractionDigits: p.data.decimals }) : '');
  const chg = (p: ValueFormatterParams<CrossQuote>) => {
    const d = p.data!;
    if (d.isYield) return `${d.change >= 0 ? '+' : ''}${(d.change * 100).toFixed(1)} bp`;
    return `${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(2)}%`;
  };
  const columnDefs: ColDef<CrossQuote>[] = [
    { field: 'assetClass', headerName: 'Class', width: 116, cellClass: 'muted' },
    { field: 'name', headerName: 'Instrument', width: 130, cellClass: 'sym' },
    { field: 'last', headerName: 'Last', width: 120, ...numericCol, valueFormatter: fmt, enableCellChangeFlash: true },
    { field: 'change', headerName: 'Chg', width: 110, ...numericCol, valueFormatter: chg, cellClassRules: tone },
    { headerName: 'Range', colId: 'range', flex: 1, cellRenderer: (p: ICellRendererParams<CrossQuote>) => {
      const d = p.data!;
      const pct = d.high === d.low ? 50 : ((d.last - d.low) / (d.high - d.low)) * 100;
      const el = document.createElement('div');
      el.className = 'range';
      el.innerHTML = `<div class="range-track"><div class="range-dot" style="left:${pct.toFixed(1)}%"></div></div>`;
      return el;
    } },
  ];
  const api = mount<CrossQuote>(panel, { columnDefs, rowData: feed.cross.map((c) => ({ ...c })), getRowId: (p) => p.data.id, suppressCellFocus: true, rowHeight: 33 });
  feed.on('cross', (rows) => api.applyTransactionAsync({ update: rows.map((r) => ({ ...r })) }, () => api.refreshCells({ columns: ['range'], force: true })));
  panel.setSubtitle('FX · rates · commodities · crypto · vol');
  return panel;
}

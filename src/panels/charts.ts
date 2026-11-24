// ECharts panels. The SVG renderer keeps each chart as real DOM inside the
// drawable element, so it is captured like any other HTML. Renders are skipped
// while a panel is out of view (see visibility.ts).

import * as echarts from 'echarts/core';
import { BarChart, CandlestickChart, HeatmapChart, LineChart, SankeyChart, TreemapChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { OPTION_EXPIRIES, SURFACE_MONEYNESS, fmtMoney, type MarketFeed } from '../feed';
import { createPanel, type Panel } from './panel';
import { whenVisible } from './visibility';

echarts.use([CandlestickChart, LineChart, BarChart, HeatmapChart, TreemapChart, SankeyChart, GridComponent, TooltipComponent, MarkLineComponent, VisualMapComponent, SVGRenderer]);

const AXIS = {
  axisLine: { lineStyle: { color: '#24344f' } },
  axisLabel: { color: '#7f93b2', fontSize: 12 },
  splitLine: { lineStyle: { color: '#152238' } },
};
const UP = '#22c55e';
const DOWN = '#ef4444';
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
const BASE = { animation: false, backgroundColor: 'transparent', textStyle: { fontFamily: FONT } };
const TOOLTIP = { backgroundColor: '#0e1a30', borderColor: '#24344f', textStyle: { color: '#d6e2f5' } };
const W = 1080;
const H = 608;
const HEADER = 44;

function initChart(panel: Panel, width = W, height = H - HEADER) {
  const host = document.createElement('div');
  host.className = 'chart-host';
  panel.body.appendChild(host);
  return echarts.init(host, null, { renderer: 'svg', width, height });
}

/** Coalesce bursts of updates and only render while the panel is on screen. */
function scheduler(id: string, render: () => void, minMs: number) {
  let timer = 0;
  return () => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      whenVisible(id, render);
    }, minMs);
  };
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour12: false });

// ------------------------------------------------------------- Price chart

export function createPriceChart(feed: MarketFeed): Panel {
  const panel = createPanel('price-chart', 'Price', W, H, '#38bdf8');
  const chart = initChart(panel);
  chart.setOption({
    ...BASE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, ...TOOLTIP },
    grid: [
      { left: 64, right: 24, top: 16, height: '64%' },
      { left: 64, right: 24, top: '76%', bottom: 28 },
    ],
    xAxis: [
      { type: 'category', data: [], ...AXIS, axisLabel: { show: false }, boundaryGap: true },
      { type: 'category', gridIndex: 1, data: [], ...AXIS, boundaryGap: true },
    ],
    yAxis: [
      { scale: true, ...AXIS, position: 'left' },
      { gridIndex: 1, ...AXIS, axisLabel: { show: false }, splitLine: { show: false } },
    ],
    series: [
      { type: 'candlestick', name: 'OHLC', data: [], itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN } },
      { type: 'line', name: 'MA 10', data: [], showSymbol: false, smooth: true, lineStyle: { width: 1.5, color: '#f59e0b' } },
      { type: 'line', name: 'MA 30', data: [], showSymbol: false, smooth: true, lineStyle: { width: 1.5, color: '#a855f7' } },
      { type: 'bar', name: 'Volume', xAxisIndex: 1, yAxisIndex: 1, data: [] },
    ],
  });
  const ma = (closes: number[], n: number) =>
    closes.map((_, i) => {
      if (i < n - 1) return null;
      let s = 0;
      for (let k = i - n + 1; k <= i; k++) s += closes[k];
      return +(s / n).toFixed(2);
    });
  const render = () => {
    const sym = feed.selected;
    const candles = feed.candlesFor(sym);
    const labels = candles.map((c) => clock(c.t));
    const closes = candles.map((c) => c.c);
    const q = feed.quotes.get(sym)!;
    chart.setOption({
      xAxis: [{ data: labels }, { data: labels }],
      series: [
        { data: candles.map((c) => [c.o, c.c, c.l, c.h].map((v) => +v.toFixed(2))), markLine: { symbol: 'none', silent: true, label: { color: '#d6e2f5', formatter: q.last.toFixed(2) }, lineStyle: { color: q.change >= 0 ? UP : DOWN, type: 'dashed' }, data: [{ yAxis: q.last }] } },
        { data: ma(closes, 10) },
        { data: ma(closes, 30) },
        { data: candles.map((c, i) => ({ value: c.v, itemStyle: { color: i > 0 && c.c < candles[i - 1].c ? '#5b2430' : '#1f4d3a' } })) },
      ],
    });
    panel.setSubtitle(`${sym} · 2s candles · MA 10 / 30`);
    panel.setBadge(`${q.last.toFixed(2)}  ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`, q.change >= 0 ? 'up' : 'down');
  };
  render();
  const schedule = scheduler('price-chart', render, 250);
  feed.on('candles', (sym) => sym === feed.selected && schedule());
  feed.on('select', () => whenVisible('price-chart', render));
  return panel;
}

// ---------------------------------------------------------------- P&L chart

export function createPnlChart(feed: MarketFeed): Panel {
  const panel = createPanel('pnl-chart', 'Desk P&L', W, H, '#a855f7');
  const chart = initChart(panel);
  chart.setOption({
    ...BASE,
    tooltip: { trigger: 'axis', ...TOOLTIP, valueFormatter: (v: unknown) => fmtMoney(Number(v)) },
    grid: { left: 80, right: 24, top: 20, bottom: 32 },
    xAxis: { type: 'category', data: [], boundaryGap: false, ...AXIS },
    yAxis: { type: 'value', scale: true, ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => fmtMoney(v) } },
    series: [
      {
        type: 'line',
        name: 'Total',
        data: [],
        showSymbol: false,
        lineStyle: { width: 2, color: '#a855f7' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(168,85,247,0.45)' }, { offset: 1, color: 'rgba(168,85,247,0.02)' }]) },
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 0 }], lineStyle: { color: '#3a4a66' }, label: { show: false } },
      },
      { type: 'line', name: 'Realized', data: [], showSymbol: false, lineStyle: { width: 1.5, color: '#38bdf8', type: 'dashed' } },
    ],
  });
  const render = () => {
    const h = feed.pnlHistory;
    chart.setOption({
      xAxis: { data: h.map((p) => clock(p.t)) },
      series: [{ data: h.map((p) => Math.round(p.total)) }, { data: h.map((p) => Math.round(p.realized)) }],
    });
    const last = h[h.length - 1];
    if (last) panel.setBadge(fmtMoney(last.total), last.total >= 0 ? 'up' : 'down');
  };
  panel.setSubtitle('Total vs realized · 1s samples');
  render();
  feed.on('pnl', () => whenVisible('pnl-chart', render));
  return panel;
}

// --------------------------------------------------------- Sector exposure

export function createExposureChart(feed: MarketFeed): Panel {
  const panel = createPanel('exposure', 'Sector Exposure', W, H, '#14b8a6');
  const chart = initChart(panel);
  chart.setOption({
    ...BASE,
    grid: { left: 110, right: 70, top: 16, bottom: 32 },
    xAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => fmtMoney(v) } },
    yAxis: { type: 'category', data: [], ...AXIS, axisLabel: { ...AXIS.axisLabel, fontSize: 14, color: '#b8c7de' } },
    series: [{ type: 'bar', data: [], barWidth: '55%', label: { show: true, position: 'right', color: '#d6e2f5', formatter: (p: { value: number }) => fmtMoney(p.value) } }],
  });
  const render = () => {
    const bySector = new Map<string, number>();
    for (const p of feed.positionsSnapshot()) bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.mktValue);
    const rows = [...bySector.entries()].sort((a, b) => a[1] - b[1]);
    chart.setOption({
      yAxis: { data: rows.map((r) => r[0]) },
      series: [{ data: rows.map(([, v]) => ({ value: Math.round(v), itemStyle: { color: v >= 0 ? '#14b8a6' : '#f43f5e', borderRadius: v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })) }],
    });
    const gross = rows.reduce((s, r) => s + Math.abs(r[1]), 0);
    const net = rows.reduce((s, r) => s + r[1], 0);
    panel.setSubtitle(`Gross ${fmtMoney(gross)} · Net ${fmtMoney(net)}`);
  };
  render();
  setInterval(() => whenVisible('exposure', render), 2000);
  return panel;
}

// ----------------------------------------------------- Volatility surface

export function createVolSurface(feed: MarketFeed): Panel {
  const panel = createPanel('vol-surface', 'Implied Vol Surface', W, H, '#f472b6');
  const chart = initChart(panel);
  const xLabels = SURFACE_MONEYNESS.map((m) => `${Math.round(m * 100)}%`);
  const yLabels = OPTION_EXPIRIES.map((d) => (d >= 365 ? '1Y' : d >= 30 ? `${Math.round(d / 30)}M` : `${d}D`));
  chart.setOption({
    ...BASE,
    tooltip: { ...TOOLTIP, formatter: (p: { value: [number, number, number] }) => `${yLabels[p.value[1]]} · ${xLabels[p.value[0]]} moneyness<br/><b>${p.value[2].toFixed(1)}% IV</b>` },
    grid: { left: 64, right: 110, top: 18, bottom: 54 },
    xAxis: { type: 'category', data: xLabels, name: 'Strike / Spot', nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: '#7f93b2' }, ...AXIS, splitArea: { show: false } },
    yAxis: { type: 'category', data: yLabels, name: 'Expiry', nameTextStyle: { color: '#7f93b2' }, ...AXIS },
    visualMap: {
      min: 10,
      max: 90,
      calculable: false,
      orient: 'vertical',
      right: 18,
      top: 'middle',
      itemHeight: 380,
      textStyle: { color: '#9fb3d1' },
      formatter: (v: number) => `${v.toFixed(0)}%`,
      inRange: { color: ['#0c2a5b', '#1d4ed8', '#06b6d4', '#22c55e', '#facc15', '#f97316', '#ef4444'] },
    },
    series: [{ type: 'heatmap', data: [], label: { show: true, color: '#f8fafc', fontSize: 11, formatter: (p: { value: number[] }) => p.value[2].toFixed(0) }, itemStyle: { borderColor: '#0a1222', borderWidth: 2, borderRadius: 3 } }],
  });
  const render = () => {
    const surface = feed.volSurface(feed.selected);
    const data: [number, number, number][] = [];
    surface.forEach((row, y) => row.forEach((v, x) => data.push([x, y, +v.toFixed(2)])));
    const values = data.map((d) => d[2]);
    chart.setOption({ visualMap: { min: Math.floor(Math.min(...values) / 5) * 5, max: Math.ceil(Math.max(...values) / 5) * 5 }, series: [{ data }] });
    const atm30 = surface[OPTION_EXPIRIES.indexOf(30)][SURFACE_MONEYNESS.indexOf(1)];
    panel.setSubtitle(`${feed.selected} · skew and term structure`);
    panel.setBadge(`30D ATM ${atm30.toFixed(1)}%`, 'neutral');
  };
  render();
  setInterval(() => whenVisible('vol-surface', render), 1000);
  feed.on('select', () => whenVisible('vol-surface', render));
  return panel;
}

// --------------------------------------------------------- Correlation map

export function createCorrelation(feed: MarketFeed): Panel {
  const panel = createPanel('correlation', 'Correlation Matrix', W, H, '#818cf8');
  const chart = initChart(panel);
  const { symbols } = feed.correlation();
  chart.setOption({
    ...BASE,
    tooltip: { ...TOOLTIP, formatter: (p: { value: [number, number, number] }) => `${symbols[p.value[0]]} × ${symbols[p.value[1]]}<br/><b>ρ = ${p.value[2].toFixed(2)}</b>` },
    grid: { left: 60, right: 90, top: 10, bottom: 50 },
    xAxis: { type: 'category', data: symbols, ...AXIS, axisLabel: { ...AXIS.axisLabel, fontSize: 10, rotate: 60, interval: 0 } },
    yAxis: { type: 'category', data: symbols, inverse: true, ...AXIS, axisLabel: { ...AXIS.axisLabel, fontSize: 10, interval: 0 } },
    visualMap: { min: -1, max: 1, right: 14, top: 'middle', itemHeight: 360, textStyle: { color: '#9fb3d1' }, inRange: { color: ['#2563eb', '#0f172a', '#ef4444'] }, formatter: (v: number) => v.toFixed(1) },
    series: [{ type: 'heatmap', data: [], itemStyle: { borderColor: '#0a1222', borderWidth: 1 } }],
  });
  const render = () => {
    const { matrix } = feed.correlation();
    const data: [number, number, number][] = [];
    matrix.forEach((row, y) => row.forEach((v, x) => data.push([x, y, +v.toFixed(3)])));
    chart.setOption({ series: [{ data }] });
    let sum = 0;
    let n = 0;
    matrix.forEach((row, i) => row.forEach((v, j) => j > i && ((sum += v), n++)));
    panel.setBadge(`avg ρ ${(sum / n).toFixed(2)}`, 'neutral');
  };
  panel.setSubtitle('40s rolling · grouped by sector');
  render();
  setInterval(() => whenVisible('correlation', render), 2000);
  return panel;
}

// ---------------------------------------------------------------- Market map

export function createMarketMap(feed: MarketFeed): Panel {
  const panel = createPanel('market-map', 'Market Map', W, H, '#4ade80');
  const chart = initChart(panel);
  chart.setOption({
    ...BASE,
    tooltip: { ...TOOLTIP, formatter: (p: { name: string; value: unknown }) => (Array.isArray(p.value) ? `<b>${p.name}</b><br/>${Number(p.value[1]) >= 0 ? '+' : ''}${Number(p.value[1]).toFixed(2)}% · ${fmtMoney(Number(p.value[0]))} traded` : p.name) },
    visualMap: { show: false, dimension: 1, min: -3, max: 3, inRange: { color: ['#b91c1c', '#7f1d1d', '#1e293b', '#14532d', '#15803d'] } },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        visualDimension: 1,
        upperLabel: { show: true, height: 22, color: '#cbd5e1', fontWeight: 'bold', fontSize: 12, backgroundColor: 'transparent' },
        label: {
          show: true,
          formatter: (p: { name: string; value: unknown }) => {
            if (!Array.isArray(p.value)) return p.name; // sector nodes
            const chg = Number(p.value[1]);
            return `{s|${p.name}}\n{c|${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%}`;
          },
          rich: { s: { fontSize: 16, fontWeight: 'bold', color: '#fff' }, c: { fontSize: 12, color: '#e2e8f0' } } },
        itemStyle: { borderColor: '#0a1222', borderWidth: 2, gapWidth: 2 },
        levels: [{ itemStyle: { borderColor: '#0a1222', borderWidth: 3, gapWidth: 3 }, upperLabel: { show: true } }, { itemStyle: { gapWidth: 2 } }],
        data: [],
      },
    ],
  });
  const render = () => {
    const bySector = new Map<string, Array<{ name: string; value: [number, number] }>>();
    for (const q of feed.quotes.values()) {
      const list = bySector.get(q.sector) ?? [];
      list.push({ name: q.symbol, value: [q.volume * q.last, q.changePct] });
      bySector.set(q.sector, list);
    }
    chart.setOption({
      series: [{ data: [...bySector.entries()].map(([name, children]) => ({ name, value: [children.reduce((s, c) => s + c.value[0], 0), 0], children })) }],
    });
  };
  // Clicking a tile selects that symbol across the desk.
  chart.on('click', (p) => {
    if (feed.quotes.has(p.name)) feed.select(p.name);
  });
  panel.setSubtitle('Size = traded value · colour = session move · click a tile');
  render();
  setInterval(() => whenVisible('market-map', render), 1500);
  return panel;
}

// ------------------------------------------------------------- Depth chart

export function createDepthChart(feed: MarketFeed): Panel {
  const panel = createPanel('depth-chart', 'Market Depth', W, H, '#fb923c');
  const chart = initChart(panel);
  const area = (color: string) => ({
    type: 'line' as const,
    step: 'end' as const,
    showSymbol: false,
    lineStyle: { width: 2, color },
    areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${color}88` }, { offset: 1, color: `${color}08` }]) },
    data: [] as [number, number][],
  });
  chart.setOption({
    ...BASE,
    tooltip: { trigger: 'axis', ...TOOLTIP },
    grid: { left: 70, right: 30, top: 24, bottom: 40 },
    xAxis: { type: 'value', scale: true, ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => v.toFixed(2) } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`) } },
    series: [{ ...area('#22c55e'), name: 'Bids' }, { ...area('#ef4444'), name: 'Asks' }],
  });
  const render = () => {
    const rows = feed.book;
    const bids = [...rows].reverse().map((r) => [r.bid, r.bidCum] as [number, number]);
    const asks = rows.map((r) => [r.ask, r.askCum] as [number, number]);
    const q = feed.quotes.get(feed.selected)!;
    chart.setOption({
      series: [
        { data: bids, markLine: { symbol: 'none', silent: true, data: [{ xAxis: (q.bid + q.ask) / 2 }], lineStyle: { color: '#94a3b8', type: 'dashed' }, label: { color: '#cbd5e1', formatter: `mid ${((q.bid + q.ask) / 2).toFixed(2)}` } } },
        { data: asks },
      ],
    });
    const bidTotal = rows[rows.length - 1]?.bidCum ?? 0;
    const askTotal = rows[rows.length - 1]?.askCum ?? 0;
    const imbalance = (bidTotal - askTotal) / Math.max(1, bidTotal + askTotal);
    panel.setSubtitle(`${feed.selected} · cumulative size, ${rows.length} levels`);
    panel.setBadge(`imbalance ${imbalance >= 0 ? '+' : ''}${(imbalance * 100).toFixed(0)}%`, imbalance >= 0 ? 'up' : 'down');
  };
  render();
  const schedule = scheduler('depth-chart', render, 250);
  feed.on('book', schedule);
  return panel;
}

// --------------------------------------------------------- Order flow Sankey

export function createFlowSankey(feed: MarketFeed): Panel {
  const panel = createPanel('flow-sankey', 'Order Flow', W, H, '#60a5fa');
  const chart = initChart(panel);
  const colors: Record<string, string> = { BUY: '#22c55e', SELL: '#ef4444', YOU: '#fbbf24' };
  chart.setOption({
    ...BASE,
    tooltip: { ...TOOLTIP, trigger: 'item', valueFormatter: (v: unknown) => fmtMoney(Number(v)) },
    series: [
      {
        type: 'sankey',
        left: 20,
        right: 90,
        top: 20,
        bottom: 20,
        nodeGap: 10,
        nodeWidth: 16,
        layoutIterations: 0,
        emphasis: { focus: 'adjacency' },
        label: { color: '#d6e2f5', fontSize: 13, fontFamily: FONT },
        lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
        data: [],
        links: [],
      },
    ],
  });
  const render = () => {
    const links = feed.orderFlow();
    if (!links.length) return;
    const names = [...new Set(links.flatMap((l) => [l.source, l.target]))];
    const palette = ['#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf', '#f59e0b', '#818cf8', '#38bdf8', '#fb7185'];
    chart.setOption({
      series: [{ data: names.map((name, i) => ({ name, itemStyle: { color: colors[name] ?? palette[i % palette.length] } })), links }],
    });
    const total = links.filter((l) => l.target === 'BUY' || l.target === 'SELL').reduce((s, l) => s + l.value, 0);
    panel.setBadge(fmtMoney(total), 'neutral');
  };
  panel.setSubtitle('Filled notional · trader → venue → side');
  render();
  setInterval(() => whenVisible('flow-sankey', render), 2000);
  return panel;
}

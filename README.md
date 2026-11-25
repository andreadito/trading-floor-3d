# Trading Floor 3D

A walkable 3D trading floor whose screens are **live AG Grid tables, ECharts charts and HTML trading controls**, drawn into WebGL with Chrome's [HTML-in-Canvas API](https://developer.chrome.com/docs/web-platform/html-in-canvas). The screens are real DOM: you click rows, type into the order ticket, press the kill switch and scroll the blotter at any angle.

Built by **Andrea Dito**. Read [how it was built](how-it-was-built.html) (also linked from the demo).

All market data, orders and positions are simulated in the browser.

**Requires Chrome 157+**, where HTML-in-Canvas shipped to stable.

```bash
npm install
npm run dev        # open the printed URL in Chrome
npm run smoke      # end-to-end check in real headless Chrome (CHROME_PATH=... to override)
npm run build      # static site in dist/ (index.html + how-it-was-built.html)
```

URL options: `?dpr=1` (lightest), `?dpr=2` (full retina; the default cap is 1.5), `?fx=low` (no floor reflections or bloom).

## Controls

| Input | Action |
| --- | --- |
| W A S D, Shift | Walk, run |
| Mouse | Look around |
| Click or E | Fly to the screen under the crosshair and free the cursor to use it |
| Q, or click empty space | Step back from a screen and keep walking |
| Esc | Free the cursor. Screens stay live and clickable from wherever you stand |

## What's in the room

| Where | Screens |
| --- | --- |
| North wall | **Trade Blotter** (AG Grid), **Price** (candlesticks, MA 10/30, volume), **Desk P&L** |
| East wall | **Correlation Matrix** (24×24 heatmap of rolling returns), **Sector Exposure**, **Implied Vol Surface** (strike × expiry heatmap) |
| West wall | **Market Map** (treemap; click a tile to select it), **Desk Alerts**, **Market Depth** (cumulative bid/ask) |
| South wall | **Options Chain** (calls/puts with IV and greeks), **Risk Controls** (kill switch, limits, flatten all), **Order Flow** (Sankey: trader → venue → side) |
| Front desks | **Market Watch**, **Order Book** with a quick ticket, **Positions & P&L** with per-row flatten |
| Side pods | **Order Ticket** (MKT/LMT/STP, DAY/IOC/GTC, VWAP/TWAP/POV, pre-trade risk checks), **My Orders** (amend / cancel), **Time & Sales**, **Cross-Asset** (FX, rates, commodities, crypto, VIX) |
| Overhead | Ticker-tape ring, and a world-clock board (New York, London, Frankfurt, Tokyo, Hong Kong, Sydney) showing each exchange's session status |

Clicking a symbol anywhere (Market Watch, Positions, Market Map, the ticket's ◀ ▶) moves the whole desk to it: chart, book, depth, tape, options chain and vol surface.

The room's neon follows the desk: it drifts green or magenta with P&L and pulses red while the kill switch is engaged.

## How it works

- **Panels:** `index.html` has `<canvas content="drawable">`. Each panel is appended as a `drawable` child, so it keeps real layout, styles, events and accessibility. Charts use ECharts' SVG renderer, so they are ordinary DOM too.
- **Uploads:** `src/drawable.ts` listens for the canvas `paint` event, which lists the panels that changed. Each frame it uploads those with `gl.texElementSubImage2D` into textures wrapped in `THREE.ExternalTexture`. Uploads are throttled by distance (12 / 6 / 3 Hz), uncapped for the screen in use, and skipped while a panel is out of view.
- **Hit testing:** each frame, every panel's quad is projected to the screen as one perspective 4×4 matrix and passed to `canvas.updateElementGeometry`. That routes real input to the DOM at any angle.
- **Focus mode:** the camera stands where one panel CSS pixel maps to one screen pixel, so text is crisp and drags are 1:1.
- **Lighting:** `src/post.ts` renders HDR, then bloom, then sRGB. Neon is HDR and blooms. Screens are drawn just below the bloom threshold, so text never blurs and colours match the DOM exactly.

The full write-up, with diagrams, code and the API behaviour verified in Chrome 158, is in [`how-it-was-built.html`](how-it-was-built.html).

## Project layout

```
src/
  main.ts            wiring and the render loop
  drawable.ts        HTML-in-Canvas ↔ Three.js bridge (uploads, hit-test geometry, screen shader)
  world.ts           room, screens, desks, lighting, mood
  post.ts            bloom pipeline
  controls.ts        walking, focus mode
  feed.ts            simulated market, order engine, risk, options, correlations
  panels/            AG Grid tables, ECharts charts, trading controls, sign
  how/               styles for the how-it-was-built page
scripts/smoke.mjs    end-to-end test in headless Chrome
```

## Limits

- Texture memory grows with the square of the pixel ratio: about 66 MB at 1, 150 MB at 1.5, 265 MB at 2.
- Hit testing knows the panels' stacking order, not 3D occluders. A click on a desk that hides part of a wall screen goes to the screen.
- Drag gestures are exact in focus mode and drift at steep angles.
- No native `<select>` pop-ups in panels; the ticket uses segmented buttons instead.

## License

MIT, see [LICENSE](LICENSE).

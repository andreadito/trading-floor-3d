// Shown instead of the 3D app on devices that can't run it: no HTML-in-Canvas
// (Safari, Firefox, Chrome < 157) or no mouse/trackpad (phones, tablets).
// Plain DOM only, so it loads fast and works in every browser. It shares the
// look of the how-it-was-built page (src/site/site.css).

// Inlined and injected only when the fallback renders, so it never styles the 3D app.
import siteCss from './site/site.css?inline';
import css from './fallback.css?inline';
import type { Unsupported } from './support';

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap';

const SHOTS: Array<[string, string, string]> = [
  ['desks', 'Desks', 'Market Watch, Order Book and Positions: live AG Grid on desk monitors.'],
  ['analytics', 'Analytics wall', 'Correlation matrix, sector exposure and an implied-volatility surface in ECharts.'],
  ['order-ticket', 'Order ticket', 'Click a screen to use it. Market, limit and stop orders with pre-trade risk checks.'],
  ['options-chain', 'Options chain', 'Calls and puts with implied volatility and greeks, re-priced live.'],
  ['kill-switch', 'Kill switch', 'Halts the desk, cancels working orders and turns the room red.'],
  ['world-clocks', 'World clocks', 'Six exchanges with their session status, above a scrolling ticker.'],
];

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isMobileDevice = () => isIOS() || /Android|Mobile/i.test(navigator.userAgent);

function message(reason: Unsupported) {
  if (isMobileDevice() || reason === 'touch') {
    return {
      title: 'Open this on a desktop',
      body: isIOS()
        ? 'Trading Floor 3D is a walkable 3D room: you move with the keyboard and use the screens with a mouse. It relies on Chrome’s HTML-in-Canvas API, which browsers on iPhone and iPad don’t support yet. Open the link in Chrome 157 or later on a laptop or desktop.'
        : 'Trading Floor 3D is a walkable 3D room: you move with the keyboard and use the screens with a mouse. Open the link in Chrome 157 or later on a laptop or desktop.',
    };
  }
  return {
    title: 'This browser isn’t supported yet',
    body: 'Every screen in the room is live HTML drawn into WebGL with Chrome’s HTML-in-Canvas API, which this browser doesn’t support. Open the link in Chrome 157 or later.',
  };
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderFallback(reason: Unsupported) {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = FONTS;
  const style = document.createElement('style');
  style.textContent = `${siteCss}\n${css}`;
  document.head.append(fonts, style);
  document.getElementById('floor')?.remove();
  document.getElementById('hud')?.remove();
  document.body.classList.add('site');

  const url = `${location.origin}${location.pathname}`;
  const { title, body } = message(reason);
  const share = typeof navigator.share === 'function' && isMobileDevice();

  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <header class="site-header">
      <div class="site-container site-header-inner">
        <a class="site-wordmark" href="./"><svg class="site-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="0.5" y="0.5" width="31" height="31" rx="7" /><path d="M6 21l6-6 5 4 9-10" /></svg>Trading Floor 3D</a>
        <nav class="site-nav" aria-label="Site"><a href="./" aria-current="page">Demo</a><a href="how-it-was-built">How it was built</a><a href="https://github.com/andreadito/trading-floor-3d">GitHub</a></nav>
      </div>
    </header>
    <main class="site-container fb">
      <section class="fb-intro">
        <div class="fb-copy">
          <p class="eyebrow">Live AG Grid and ECharts in a walkable WebGL room</p>
          <h1>${escape(title)}</h1>
          <p class="lede">${escape(body)}</p>
          <div class="fb-actions">
            <button type="button" class="btn btn-primary" data-action="copy">${share ? 'Share link' : 'Copy link'}</button>
            <a class="btn" href="how-it-was-built">How it was built</a>
          </div>
          <p class="fb-url"><code>${escape(url)}</code></p>
        </div>
        <figure class="fb-hero">
          <img src="screens/hero.jpg" width="1600" height="900" alt="The 3D trading floor: wall screens and desk monitors with live grids and charts, a ticker ring and a world-clock board overhead" />
        </figure>
      </section>
      <section class="fb-gallery" aria-label="Screenshots">
        ${SHOTS.map(
          ([file, name, caption]) => `
          <figure>
            <img src="screens/${file}.jpg" width="1600" height="900" alt="${escape(`${name}: ${caption}`)}" loading="lazy" />
            <figcaption><b>${escape(name)}</b> ${escape(caption)}</figcaption>
          </figure>`,
        ).join('')}
      </section>
    </main>
    <footer class="site-footer">
      <div class="site-container site-footer-inner">
        <span>© 2026 <a href="https://andreadito.com">Andrea Dito</a></span>
        <span>Market data is simulated · <a href="?force=1">Try the 3D demo anyway</a></span>
      </div>
    </footer>`,
  );

  const button = document.querySelector<HTMLButtonElement>('[data-action=copy]')!;
  button.addEventListener('click', async () => {
    try {
      if (share) {
        await navigator.share({ title: 'Trading Floor 3D', text: 'A walkable 3D trading floor of live AG Grid and ECharts screens. Best in desktop Chrome.', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied';
    } catch {
      // Share sheet dismissed, or clipboard blocked: the URL is shown below the buttons.
      button.textContent = share ? 'Share link' : 'Copy the link below';
    }
  });
}

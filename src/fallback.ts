// Shown instead of the 3D app on devices that can't run it: no HTML-in-Canvas
// (Safari, Firefox, Chrome < 157) or no mouse/trackpad (phones, tablets).
// Plain DOM only, so it loads fast and works in every browser.

// Inlined and injected only when the fallback renders, so it never styles the 3D app.
import css from './fallback.css?inline';
import type { Unsupported } from './support';
import { AUTHOR } from './panels/sign';

const SHOTS: Array<[string, string]> = [
  ['world-clocks', 'World clocks with each exchange’s session status, over a ticker ring'],
  ['desks', 'Desks with Market Watch, Order Book and Positions, all live AG Grid'],
  ['kill-switch', 'Kill switch engaged: the desk halts and the whole room turns red'],
  ['analytics', 'Correlation matrix, sector exposure and implied-vol surface in ECharts'],
  ['order-ticket', 'Click a screen to use it: the order ticket, head-on at 1:1'],
  ['options-chain', 'Options chain with IV and greeks, re-priced live'],
];

function isMobileDevice() {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || iPadOS;
}

function message(reason: Unsupported) {
  const mobile = isMobileDevice() || reason === 'touch';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (mobile) {
    return {
      title: 'Best on a desktop',
      body: ios
        ? 'This is a walkable 3D trading floor: you move with the keyboard and use the screens with a mouse. It also needs Chrome’s new HTML-in-Canvas API, which browsers on iPhone and iPad don’t support yet. Open the link on a laptop or desktop in Chrome 157 or later.'
        : 'This is a walkable 3D trading floor: you move with the keyboard and use the screens with a mouse. Open the link on a laptop or desktop in Chrome 157 or later.',
    };
  }
  return {
    title: 'Open this in Chrome 157 or later',
    body: 'Every screen in the room is live HTML, drawn into WebGL with Chrome’s HTML-in-Canvas API. This browser doesn’t support it yet. Open the link in desktop Chrome 157 or later to walk the floor.',
  };
}

export function renderFallback(reason: Unsupported) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.getElementById('floor')?.remove();
  document.getElementById('hud')?.remove();
  document.title = 'Trading Floor 3D';
  const url = `${location.origin}${location.pathname}`;
  const { title, body } = message(reason);

  const root = document.createElement('main');
  root.className = 'fb';
  root.innerHTML = `
    <header class="fb-top">
      <span class="fb-brand">TRADING FLOOR <span>3D</span></span>
      <a href="how-it-was-built">How it was built</a>
    </header>
    <section class="fb-hero">
      <img src="screens/hero.jpg" width="1600" height="900" alt="A dark 3D trading floor with live grids and charts on wall screens and desk monitors, a ticker ring and a world-clock board overhead" />
    </section>
    <section class="fb-card" role="status">
      <p class="fb-eyebrow">Live AG Grid &amp; ECharts in a walkable WebGL room</p>
      <h1></h1>
      <p class="fb-body"></p>
      <div class="fb-actions">
        <button type="button" class="fb-primary" data-action="copy">Copy link for desktop</button>
        <a class="fb-secondary" href="how-it-was-built">How it was built →</a>
      </div>
      <p class="fb-url"><code></code></p>
    </section>
    <section class="fb-gallery" aria-label="Screenshots">
      ${SHOTS.map(
        ([file, caption], i) => `
        <figure>
          <img src="screens/${file}.jpg" width="1600" height="900" alt="${caption}" ${i > 1 ? 'loading="lazy"' : ''} />
          <figcaption>${caption}</figcaption>
        </figure>`,
      ).join('')}
    </section>
    <footer class="fb-foot">
      <span>Built by <b>${AUTHOR}</b> · market data is simulated</span>
      <a href="?force=1" class="fb-force">Try anyway</a>
    </footer>`;
  root.querySelector('h1')!.textContent = title;
  root.querySelector('.fb-body')!.textContent = body;
  root.querySelector('.fb-url code')!.textContent = url;
  document.body.appendChild(root);

  const button = root.querySelector<HTMLButtonElement>('[data-action=copy]')!;
  const share = typeof navigator.share === 'function' && isMobileDevice();
  if (share) button.textContent = 'Share link';
  button.addEventListener('click', async () => {
    try {
      if (share) {
        await navigator.share({ title: 'Trading Floor 3D', text: 'A walkable 3D trading floor of live AG Grid & ECharts screens. Open it in desktop Chrome.', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied ✓';
    } catch {
      // Share sheet dismissed, or clipboard blocked: the URL is shown under the button to copy by hand.
      button.textContent = share ? 'Share link' : 'Copy the link below';
    }
  });
}

// The attribution sign on the back wall: plain HTML, drawn like every other panel.

export const AUTHOR = 'Andrea Dito';

export function createSign(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sign';
  el.id = 'panel-sign';
  el.setAttribute('aria-label', `Trading Floor 3D, built by ${AUTHOR}`);
  el.innerHTML = `
    <div class="sign-title">TRADING FLOOR <span>3D</span></div>
    <div class="sign-by">built by <b>${AUTHOR}</b></div>`;
  return el;
}

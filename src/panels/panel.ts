// A panel is the HTML element that becomes one screen in the 3D room.

export interface Panel {
  id: string;
  label: string;
  root: HTMLElement;
  body: HTMLElement;
  setSubtitle(text: string): void;
  setBadge(text: string, tone?: 'up' | 'down' | 'neutral'): void;
}

export function createPanel(id: string, label: string, width: number, height: number, accent = '#3d8bfd'): Panel {
  const root = document.createElement('section');
  root.className = 'panel';
  root.id = `panel-${id}`;
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.setProperty('--accent', accent);
  root.setAttribute('aria-label', label);

  const header = document.createElement('header');
  header.className = 'panel-header';
  const title = document.createElement('h2');
  title.textContent = label;
  const subtitle = document.createElement('span');
  subtitle.className = 'panel-subtitle';
  const badge = document.createElement('span');
  badge.className = 'panel-badge';
  const live = document.createElement('span');
  live.className = 'panel-live';
  live.textContent = 'LIVE';
  header.append(title, subtitle, badge, live);

  const body = document.createElement('div');
  body.className = 'panel-body';
  root.append(header, body);

  return {
    id,
    label,
    root,
    body,
    setSubtitle(text) {
      if (subtitle.textContent !== text) subtitle.textContent = text;
    },
    setBadge(text, tone = 'neutral') {
      if (badge.textContent !== text) badge.textContent = text;
      badge.dataset.tone = tone;
    },
  };
}

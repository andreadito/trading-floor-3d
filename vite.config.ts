import { resolve } from 'node:path';
import { codeToHtml } from 'shiki';
import { defineConfig, type Plugin } from 'vite';

/**
 * Syntax-highlights <pre><code class="language-…"> blocks in the HTML pages at build
 * (and dev) time with Shiki, so the pages ship coloured markup and no highlighter JS.
 * Same highlighter and theme as andreadito.com.
 */
function highlightCode(): Plugin {
  const block = /<pre><code class="language-([\w-]+)">([\s\S]*?)<\/code><\/pre>/g;
  const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return {
    name: 'highlight-code',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const jobs: Array<Promise<string>> = [];
        html.replace(block, (_, lang: string, code: string) => {
          jobs.push(codeToHtml(decode(code), { lang, theme: 'catppuccin-mocha' }));
          return '';
        });
        const out = await Promise.all(jobs);
        let i = 0;
        return html.replace(block, () => out[i++]);
      },
    },
  };
}

export default defineConfig({
  plugins: [highlightCode()],
  build: {
    // three + AG Grid + ECharts is ~2.7 MB minified; it only loads on supported devices.
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        how: resolve(import.meta.dirname, 'how-it-was-built.html'),
      },
    },
  },
});

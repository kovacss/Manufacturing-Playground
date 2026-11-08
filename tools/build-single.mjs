// Bundle index.html + css + js into one self-contained HTML file.
//   node tools/build-single.mjs              -> dist/deepforge.html (standalone page)
//   node tools/build-single.mjs --fragment out.html
//        -> head/body content only, for hosts that supply their own document skeleton
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const between = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers ${a} / ${b} not found`);
  return html.slice(i + a.length, j).trim();
};

const head = between('<!-- HEAD START -->', '<!-- HEAD END -->');
const body = between('<!-- BODY START -->', '<!-- BODY END -->');
const scripts = [...between('<!-- SCRIPTS START -->', '<!-- SCRIPTS END -->').matchAll(/src="([^"]+)"/g)]
  .map(m => `// ── ${m[1]}\n` + readFileSync(join(root, m[1]), 'utf8'))
  .join('\n');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');
const inner = `${head}\n<style>\n${css}</style>\n${body}\n<script>\n${scripts.replace(/<\/script/gi, '<\\/script')}</script>\n`;

const args = process.argv.slice(2);
if (args[0] === '--fragment') {
  writeFileSync(args[1], inner);
  console.log('wrote fragment', args[1]);
} else {
  mkdirSync(join(root, 'dist'), { recursive: true });
  const out = join(root, 'dist/deepforge.html');
  writeFileSync(out, `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${inner.replace(body, '</head>\n<body>\n' + body)}</body>\n</html>\n`);
  console.log('wrote', out);
}

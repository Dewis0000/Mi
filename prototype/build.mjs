// Сборка статического сайта StreOps из артбордов холста (prototype/src/*.dc.html).
// Запуск: node prototype/build.mjs  →  результат в site/
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const outDir = join(here, '..', 'site');

// Артборд → путь на сайте
const PAGES = {
  WebLanding: 'index.html',
  WebDashboard: 'panel.html',
  WebCommands: 'commands.html',
  WebMusic: 'music.html',
  WebWidgets: 'widgets.html',
  WebWidgetFaceit: 'widget-faceit.html',
  WebModeration: 'moderation.html',
  WebGiveaways: 'giveaways.html',
  WebSettings: 'settings.html',
  WebNotFound: '404.html',
  Main: 'design/index.html',
  Color: 'design/color.html',
  Glass: 'design/glass.html',
  Type: 'design/type.html',
  Layout: 'design/layout.html',
  Motion: 'design/motion.html',
  Custom: 'design/customization.html',
  Code: 'design/code.html',
  Nav: 'design/navigation.html',
};

// ---- Перевод цветов артбордов на переменные темы (см. theme.js) ----
const GREYS = [0x00, 0x0A, 0x11, 0x17, 0x1F, 0x2A, 0x3A, 0x52, 0x6E, 0x8F, 0xB4, 0xDC, 0xF2, 0xFF];
function nearest(v) {
  let best = 0;
  GREYS.forEach((g, i) => { if (Math.abs(g - v) < Math.abs(GREYS[best] - v)) best = i; });
  return best;
}
function greyVar(v) {
  if (v === 0x11) return 'var(--s-2)';
  if (v === 0x17) return 'var(--s-3)';
  return `var(--n-${nearest(v)})`;
}
function themeizeCss(s) {
  return s
    .replace(/(^|[^-\w])color:\s*#FFFFFF\b/gi, '$1color: var(--accent-on)')
    .replace(/#D92D20\b/gi, 'var(--accent)')
    .replace(/#(C42B1C|B42318)\b/gi, 'var(--accent-hover)')
    .replace(/#FF6369\b/gi, 'var(--accent-text)')
    .replace(/rgba\(\s*217,\s*45,\s*32,\s*([\d.]+)\s*\)/g, 'rgb(var(--accent-rgb) / $1)')
    .replace(/rgba\(\s*255,\s*99,\s*105,\s*([\d.]+)\s*\)/g, 'rgb(var(--accent-text-rgb) / $1)')
    .replace(/#([0-9a-f]{2})\1\1\b/gi, (m, h) => greyVar(parseInt(h, 16)))
    .replace(/rgba\(\s*(\d+),\s*\1,\s*\1,\s*([\d.]+)\s*\)/g, (m, v, a) => (Number(v) === 0 ? m : `rgb(var(--n-${nearest(Number(v))}-rgb) / ${a})`))
    .replace(/'Onest'/g, 'var(--font-sans)')
    .replace(/\bOnest,/g, 'var(--font-sans),');
}
function themeizeMarkup(body) {
  // SVG-атрибуты fill/stroke не понимают var(): красим через data-* и CSS из theme.js
  body = body.replace(/(\s)(fill|stroke)="#([0-9a-f]{2})\3\3"/gi, (m, sp, attr, h) => `${sp}${attr}="#${h}${h}${h}" data-${attr}="${nearest(parseInt(h, 16))}"`);
  body = body.replace(/(\sstyle=")([^"]*)(")/g, (m, a, v, b) => a + themeizeCss(v) + b);
  // Фон корневого блока прозрачный: под ним слой пользовательского фона
  return body.replace(/<div\b[^>]*>/, (tag) => tag.replace(/background: var\(--n-[01]\)/, 'background: var(--page-bg)'));
}

function pick(re, text, what, file) {
  const m = text.match(re);
  if (!m) throw new Error(`${file}: не найден ${what}`);
  return m[1];
}

function relLink(fromPath, toPath) {
  // 404 отдаётся сервером по любому адресу, поэтому ссылки в нём от корня сайта
  if (fromPath === '404.html') return '/' + toPath;
  const depth = fromPath.split('/').length - 1;
  return '../'.repeat(depth) + toPath;
}

function convert(file, outPath) {
  const src = readFileSync(join(srcDir, file), 'utf8');
  const title = pick(/<title>([\s\S]*?)<\/title>/, src, '<title>', file);
  const xdc = pick(/<x-dc>([\s\S]*?)<\/x-dc>/, src, '<x-dc>', file);
  const helmet = (xdc.match(/<helmet>([\s\S]*?)<\/helmet>/) || ['', ''])[1];
  let body = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  let script = pick(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/, src, 'script', file);

  // <sc-for>/<sc-if> → <template>: так они переживают разбор внутри таблиц и списков
  body = body.replace(/<sc-for\b([^>]*)>/g, (m, attrs) => {
    const list = (attrs.match(/list="\{\{\s*([^}]+?)\s*\}\}"/) || [])[1];
    const as = (attrs.match(/\bas="([^"]+)"/) || [])[1] || 'item';
    if (!list) throw new Error(`${file}: sc-for без list`);
    return `<template data-for="${list}" data-as="${as}">`;
  });
  body = body.replace(/<sc-if\b([^>]*)>/g, (m, attrs) => {
    const value = (attrs.match(/value="\{\{\s*([^}]+?)\s*\}\}"/) || [])[1];
    if (!value) throw new Error(`${file}: sc-if без value`);
    return `<template data-if="${value}">`;
  });
  body = body.replace(/<\/sc-(for|if)>/g, '</template>');

  // Ссылки между артбордами → страницы сайта
  const fixLinks = (s) => s.replace(/\b(\w+)\.dc\.html/g, (m, name) => {
    if (!PAGES[name]) throw new Error(`${file}: ссылка на неизвестный артборд ${name}`);
    return relLink(outPath, PAGES[name]);
  });
  body = fixLinks(body);
  script = fixLinks(script);

  // Страницы продукта настраиваются темой; страницы дизайн-системы показывают эталон
  const themed = !outPath.startsWith('design/');
  let head = helmet.trim();
  if (themed) {
    body = themeizeMarkup(body);
    script = themeizeCss(script);
    head = themeizeCss(head);
  }
  const themeTag = themed ? `<script src="${relLink(outPath, 'assets/theme.js')}"></script>\n` : '';

  const runtime = relLink(outPath, 'assets/dc-lite.js');
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="${relLink(outPath, 'assets/favicon.svg')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${themeTag}${head}
</head>
<body>
<div id="app"></div>
<template id="dc">${body}</template>
<script src="${runtime}"></script>
<script>
${script.trim()}
DCMount(Component);
</script>
</body>
</html>
`;
  const target = join(outDir, outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'assets'), { recursive: true });
copyFileSync(join(here, 'dc-lite.js'), join(outDir, 'assets', 'dc-lite.js'));
copyFileSync(join(here, 'theme.js'), join(outDir, 'assets', 'theme.js'));
copyFileSync(join(here, '..', 'design-system', 'tokens.css'), join(outDir, 'assets', 'tokens.css'));
writeFileSync(join(outDir, 'assets', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#0A0A0A"/><rect x="0.5" y="0.5" width="27" height="27" rx="5.5" fill="none" stroke="#F2F2F2"/><rect x="6" y="8" width="16" height="2" fill="#F2F2F2"/><rect x="6" y="13" width="10" height="2" fill="#F2F2F2"/><rect x="6" y="18" width="13" height="2" fill="#8F8F8F"/></svg>\n');

const files = readdirSync(srcDir).filter((f) => f.endsWith('.dc.html'));
for (const f of files) {
  const name = f.replace(/\.dc\.html$/, '');
  if (!PAGES[name]) throw new Error(`Нет пути для артборда ${f}`);
  convert(f, PAGES[name]);
  console.log(`${f} → site/${PAGES[name]}`);
}

writeFileSync(join(outDir, '.htaccess'), `DirectoryIndex index.html
ErrorDocument 404 /404.html
AddDefaultCharset UTF-8

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType text/css "access plus 7 days"
</IfModule>
`);
console.log('Готово: site/');

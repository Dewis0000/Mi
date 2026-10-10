// Сборка статического сайта StreOps из артбордов холста (prototype/src/*.dc.html).
// Запуск: node prototype/build.mjs  →  результат в site/
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const outDir = process.env.STRE_OUT || join(here, '..', 'site');

// Артборд → путь на сайте
const PAGES = {
  WebLanding: 'index.html',
  WebDashboard: 'panel.html',
  WebCommands: 'commands.html',
  WebMusic: 'music.html',
  WebWidgets: 'widgets.html',
  WebWidgetEditor: 'widget-editor.html',
  WebModeration: 'moderation.html',
  WebGiveaways: 'giveaways.html',
  WebSettings: 'settings.html',
  WebAdmin: 'admin.html',
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

// ---- Общее боковое меню стрим-панели: одно на все страницы ----
const ICON = {
  overview: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  mod: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cmd: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  widgets: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zM12 8c2-4 6-4 6-1s-6 1-6 1z"/>',
  auction: '<path d="M14 13l-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 16l6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};
const SIDEBAR = [
  ['Эфир'],
  ['WebDashboard', 'Обзор', 'overview'],
  ['WebModeration', 'Модерация', 'mod'],
  ['Бот'],
  ['WebCommands', 'Команды', 'cmd', '24'],
  ['WebMusic', 'Музыка', 'music'],
  ['WebWidgets', 'Виджеты', 'widgets'],
  ['Интерактив'],
  ['WebGiveaways', 'Розыгрыши', 'gift'],
  [null, 'Аукционы', 'auction', 'скоро'],
  ['-'],
  ['WebSettings', 'Настройки', 'settings'],
];
const CURRENT_ALIAS = { WebWidgetEditor: 'WebWidgets' }; // пункт «Админ-панель» добавляет assets/api.js только администратору
function sidebar(page) {
  const cur = CURRENT_ALIAS[page] || page;
  const svg = (k) => `<svg class="sb-ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const items = SIDEBAR.map((it) => {
    if (it.length === 1) return it[0] === '-' ? '<div class="sb-sep"></div>' : `<p class="sb-h">${it[0]}</p>`;
    const [target, label, icon, badge] = it;
    if (!target) return `<span class="sb-i sb-off" aria-disabled="true">${svg(icon)}${label}<span class="sb-tag">${badge}</span></span>`;
    const current = target === cur ? ' aria-current="page"' : '';
    const count = badge ? `<span class="sb-n">${badge}</span>` : '';
    return `<a href="${target}.dc.html" class="sb-i"${current}>${svg(icon)}${label}${count}</a>`;
  }).join('\n');
  return `<nav aria-label="Разделы стрим-панели" class="sb" data-dc-keep>\n${items}\n</nav>`;
}
const SIDEBAR_CSS = `<style>
.sb{flex:1 1 200px;max-width:248px;min-width:200px;align-self:flex-start;position:sticky;top:88px;box-sizing:border-box;padding:12px;border-radius:8px;background:rgb(var(--n-13-rgb) / .03);border:1px solid rgb(var(--n-13-rgb) / .06);display:flex;flex-direction:column;gap:2px;font-family:var(--font-sans),system-ui,sans-serif}
.sb-h{margin:0;padding:16px 12px 8px;font-size:11px;line-height:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--n-9)}
.sb-h:first-child{padding-top:8px}
.sb-i{display:flex;align-items:center;gap:12px;height:40px;padding:0 12px;border-radius:6px;font-size:14px;color:var(--n-10);text-decoration:none}
a.sb-i:hover{background:rgb(var(--n-13-rgb) / .04);color:var(--n-12)}
.sb-i[aria-current="page"]{background:rgb(var(--n-13-rgb) / .10);color:var(--n-12);box-shadow:inset 2px 0 0 var(--n-12)}
.sb-ic{flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.sb-n{margin-left:auto;font:400 12px/1 'JetBrains Mono',monospace;color:var(--n-9)}
.sb-off{color:var(--n-7)}
.sb-tag{margin-left:auto;font-size:11px;padding:1px 6px;border:1px dashed var(--n-6);border-radius:4px;color:var(--n-8)}
.sb-sep{height:1px;background:var(--n-5);margin:10px 0}
@media (max-width: 900px){.sb{position:static;max-width:none;flex-basis:100%;flex-direction:row;flex-wrap:wrap}.sb-h,.sb-sep{display:none}}
</style>`;

// Шапка панели: профиль и статус эфира наполняет assets/api.js настоящими данными
const LIVE_STATUS = `<div role="status" data-dc-keep data-stre-live aria-label="Статус эфира" style="display: flex; align-items: center; height: 40px; border: 1px solid #2A2A2A; border-radius: 6px">
<span style="display: inline-flex; align-items: center; gap: 8px; height: 100%; padding: 0 12px; border-right: 1px solid #2A2A2A"><span data-dot style="width: 8px; height: 8px; border-radius: 999px; background: #6E6E6E"></span><span data-label style="font-size: 11px; font-weight: 700; letter-spacing: .08em">НЕ В ЭФИРЕ</span></span>
<span class="mono" data-timer title="Длительность эфира" style="padding: 0 12px; border-right: 1px solid #2A2A2A; font-size: 15px">—</span><span class="mono" data-viewers title="Зрителей сейчас" style="padding: 0 12px; font-size: 15px">—</span>
</div>`;
function liveChrome(body) {
  body = body.replace(/<div role="status" aria-label="В эфире[\s\S]*?\n<\/div>/, LIVE_STATUS);
  return body.replace(/<header\b[\s\S]*?<\/header>/, (header) => header.replace(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*?>КС<\/span>(?:(?!<\/a>)[\s\S])*?)<\/a>/, (m, attrs, inner) => {
    attrs = attrs.replace(/\saria-label="[^"]*"/, '') + ' aria-label="Профиль" data-dc-keep data-stre-user';
    inner = inner.replace(/<span([^>]*)>КС<\/span>/, '<span$1 data-av></span>').replace('kira_stream', '<span data-name>Профиль</span>');
    return `<a${attrs}>${inner}</a>`;
  }));
}

function pick(re, text, what, file) {
  const m = text.match(re);
  if (!m) throw new Error(`${file}: не найден ${what}`);
  return m[1];
}

// ?v=хеш содержимого: после обновления браузер сразу берёт новые скрипты
const ASSETS = { 'dc-lite.js': 'dc-lite.js', 'theme.js': 'theme.js', 'widgets-lib.js': 'widgets-lib.js', 'api.js': 'api.js', 'widget-render.js': 'widget-render.js' };
const VER = {};
for (const [k, f] of Object.entries(ASSETS)) VER[k] = createHash('sha1').update(readFileSync(join(here, f))).digest('hex').slice(0, 8);
function asset(fromPath, name) { return relLink(fromPath, 'assets/' + name) + '?v=' + VER[name]; }

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
  const pageName = file.replace(/\.dc\.html$/, '');
  const hasSidebar = /<nav aria-label="Разделы стрим-панели"/.test(body) && !outPath.startsWith('design/');
  if (hasSidebar) body = body.replace(/<nav aria-label="Разделы стрим-панели"[\s\S]*?<\/nav>/, sidebar(pageName));
  if (!outPath.startsWith('design/')) body = liveChrome(body);
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
  const libTag = /^Web(Widgets|WidgetEditor)$/.test(pageName) ? `<script src="${asset(outPath, 'widgets-lib.js')}"></script>\n` : '';
  const themeTag = themed ? `<script src="${asset(outPath, 'theme.js')}"></script>\n<script src="${asset(outPath, 'api.js')}"></script>\n` : '';
  if (hasSidebar) head += '\n' + SIDEBAR_CSS;

  const runtime = asset(outPath, 'dc-lite.js');
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="${relLink(outPath, 'assets/favicon.svg')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${themeTag}${libTag}${head}
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
for (const f of Object.values(ASSETS)) copyFileSync(join(here, f), join(outDir, 'assets', f));
copyFileSync(join(here, '..', 'design-system', 'tokens.css'), join(outDir, 'assets', 'tokens.css'));
writeFileSync(join(outDir, 'assets', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#0A0A0A"/><rect x="0.5" y="0.5" width="27" height="27" rx="5.5" fill="none" stroke="#F2F2F2"/><rect x="6" y="8" width="16" height="2" fill="#F2F2F2"/><rect x="6" y="13" width="10" height="2" fill="#F2F2F2"/><rect x="6" y="18" width="13" height="2" fill="#8F8F8F"/></svg>\n');

const files = readdirSync(srcDir).filter((f) => f.endsWith('.dc.html'));
for (const f of files) {
  const name = f.replace(/\.dc\.html$/, '');
  if (!PAGES[name]) throw new Error(`Нет пути для артборда ${f}`);
  convert(f, PAGES[name]);
  console.log(`${f} → site/${PAGES[name]}`);
}

writeFileSync(join(outDir, '.htaccess'), `DirectoryIndex index.html index.php
ErrorDocument 404 /404.html
AddDefaultCharset UTF-8

# Вход через Twitch и вебхуки EventSub работают только по https.
# Когда SSL-сертификат выпущен (ISPmanager → SSL-сертификаты), раскомментируй 4 строки ниже.
# RewriteEngine On
# RewriteCond %{HTTPS} !=on
# RewriteCond %{HTTP:X-Forwarded-Proto} !=https
# RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType text/css "access plus 7 days"
</IfModule>
`);
console.log('Готово: site/');

/* StreOps — пользовательское оформление сайта.
   Подключается в <head> каждой страницы продукта: до первой отрисовки выставляет
   CSS-переменные темы, затем рисует фон (цвет/градиент/картинка, сияние, частицы,
   зерно, виньетка) и даёт редактор: кнопка «Оформление» и window.StreTheme.open(). */
(function () {
  'use strict';

  const KEY = 'streops-theme-v1';
  const GREYS = [0x00, 0x0A, 0x11, 0x17, 0x1F, 0x2A, 0x3A, 0x52, 0x6E, 0x8F, 0xB4, 0xDC, 0xF2, 0xFF];

  const DEFAULT = {
    preset: 'graphite', mode: 'dark', hue: 220, sat: 0,
    accent: '#D92D20', accentButtons: false,
    bgType: 'solid', bgColor: '', g1: '#1C1C24', g2: '#0A0A0A', angle: 160,
    image: '', blur: 0, dim: 0, dimMin: 0,
    aurora: false, auroraSpeed: 40, auroraStrength: 50,
    particles: 'none', pColor: 'ink', pCustom: '#FFFFFF', density: 50, speed: 50, size: 50, parallax: true,
    grain: false, grainStrength: 40, vignette: false, vignetteStrength: 50,
    panel: 100, glass: false, glassBlur: 16, radius: 100, shadow: 0, glow: 0, borders: 100,
    font: 'Onest', scale: 100,
  };

  const PRESETS = {
    graphite: { name: 'Графит' },
    midnight: { name: 'Полночь', hue: 230, sat: 12, bgColor: '#000000', particles: 'float', density: 55, speed: 35, panel: 84, glass: true, glassBlur: 14 },
    paper: { name: 'Бумага', mode: 'light', hue: 40, sat: 6, accent: '#C42B1C' },
    fog: { name: 'Туман', hue: 140, sat: 10, bgType: 'gradient', g1: '#4E5C53', g2: '#0B0D0C', angle: 160, grain: true, particles: 'dust', density: 40, panel: 82, glass: true },
    ocean: { name: 'Океан', hue: 205, sat: 28, accent: '#2F8FFF', accentButtons: true, bgType: 'gradient', g1: '#0E2A44', g2: '#05080D', angle: 200, vignette: true, particles: 'float', pColor: 'accent', density: 35, panel: 80, glass: true, glow: 20 },
    sunset: { name: 'Закат', hue: 20, sat: 22, accent: '#FF7A1A', accentButtons: true, bgType: 'gradient', g1: '#3D1F14', g2: '#0D0807', angle: 170, grain: true, particles: 'fireflies', pColor: 'accent', density: 40, panel: 86 },
    aurora: { name: 'Сияние', hue: 260, sat: 18, accent: '#8B5CF6', accentButtons: true, bgColor: '#05040A', aurora: true, auroraStrength: 65, particles: 'stars', density: 60, panel: 72, glass: true, glassBlur: 24, radius: 140, glow: 25 },
    winter: { name: 'Зима', hue: 200, sat: 14, accent: '#5CC8FF', bgType: 'gradient', g1: '#1B2836', g2: '#07090C', angle: 180, particles: 'snow', density: 60, speed: 40, panel: 80, glass: true, radius: 160 },
  };

  const FONTS = {
    'Onest': null,
    'Golos Text': 'Golos+Text:wght@400;500;600;700',
    'Manrope': 'Manrope:wght@400;500;600;700',
    'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600;700',
    'Rubik': 'Rubik:wght@400;500;600;700',
    'Unbounded': 'Unbounded:wght@400;500;600;700',
    'Системный': null,
  };

  const PARTICLES = [
    ['none', 'Нет'], ['stars', 'Мерцающие звёзды'], ['float', 'Плавающие звёзды'], ['snow', 'Снег'],
    ['dust', 'Пыль'], ['fireflies', 'Светлячки'], ['rain', 'Дождь'],
  ];

  // ---------- состояние ----------
  function migrate(t) {
    // темы, сохранённые до появления частиц и наложений
    if (t.effect === 'stars') { t.particles = 'stars'; }
    if (t.effect === 'grain') { t.grain = true; }
    if (t.effect === 'vignette') { t.vignette = true; }
    delete t.effect;
    return t;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(Object.assign({}, DEFAULT, JSON.parse(raw)));
    } catch (e) { /* приватный режим — тема по умолчанию */ }
    return Object.assign({}, DEFAULT);
  }
  function save(t) {
    try { localStorage.setItem(KEY, JSON.stringify(t)); return true; } catch (e) { return false; }
  }
  let theme = load();

  // ---------- цвет ----------
  function hexToRgb(hex) {
    const h = String(hex || '#000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r) { return '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function lum(rgb) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
  function hsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  function palette(t) {
    let scale = GREYS.map((v) => {
      const l = v / 255;
      const s = (t.sat / 100) * Math.sqrt(1 - Math.abs(2 * l - 1));
      return hsl(t.hue, s, l);
    });
    if (t.mode === 'light') scale = scale.slice().reverse();
    return scale.map((c) => c.map((v) => Math.round(v)));
  }
  function particleRgb(t) {
    if (t.pColor === 'accent') return hexToRgb(t.accent);
    if (t.pColor === 'custom') return hexToRgb(t.pCustom);
    return palette(t)[13];
  }

  function applyVars(t) {
    const root = document.documentElement;
    const st = root.style;
    const n = palette(t);
    n.forEach((c, i) => {
      st.setProperty('--n-' + i + '-rgb', c.join(' '));
      st.setProperty('--n-' + i, 'rgb(' + c.join(' ') + ')');
    });
    const pa = Math.max(0.3, Math.min(1, t.panel / 100));
    st.setProperty('--panel-a', String(pa));
    st.setProperty('--s-2', 'rgb(' + n[2].join(' ') + ' / ' + pa + ')');
    st.setProperty('--s-3', 'rgb(' + n[3].join(' ') + ' / ' + Math.min(1, pa + 0.06) + ')');

    const acc = hexToRgb(t.accent || '#D92D20');
    const on = contrast(acc, [255, 255, 255]) >= contrast(acc, [10, 10, 10]) ? [255, 255, 255] : [10, 10, 10];
    let text = acc.slice();
    const toward = t.mode === 'light' ? [0, 0, 0] : [255, 255, 255];
    for (let i = 0; i < 12 && contrast(text, n[1]) < 4.5; i++) text = mix(text, toward, 0.12);
    text = text.map(Math.round);
    st.setProperty('--accent', rgbToHex(acc));
    st.setProperty('--accent-rgb', acc.join(' '));
    st.setProperty('--accent-hover', rgbToHex(mix(acc, [0, 0, 0], 0.12)));
    st.setProperty('--accent-on', rgbToHex(on));
    st.setProperty('--accent-text', rgbToHex(text));
    st.setProperty('--accent-text-rgb', text.join(' '));

    st.setProperty('--font-sans', t.font === 'Системный' ? 'system-ui' : "'" + t.font + "'");
    st.setProperty('--page-bg', 'transparent');
    st.setProperty('--glass-blur', t.glassBlur + 'px');
    st.setProperty('--rad', String(t.radius / 100));
    st.setProperty('--sh-a', String(t.shadow / 100 * 0.7));
    st.setProperty('--sh-b', Math.round(8 + t.shadow * 0.5) + 'px');
    st.setProperty('--glow', Math.round(t.glow) + 'px');
    st.setProperty('--glow-a', String(Math.min(0.6, t.glow / 60)));
    st.setProperty('--bd-a', String(t.borders / 100));
    st.colorScheme = t.mode;
    root.dataset.theme = t.mode;
    root.dataset.accentButtons = t.accentButtons ? '1' : '0';
    root.dataset.glass = t.glass ? '1' : '0';
    root.dataset.panelFx = t.shadow > 0 || t.glow > 0 ? '1' : '0';
    root.dataset.radius = t.radius === 100 ? '0' : '1';
    root.dataset.borders = t.borders === 100 ? '0' : '1';
    st.zoom = t.scale && t.scale !== 100 ? String(t.scale / 100) : '';

    if (FONTS[t.font]) {
      let link = document.getElementById('stre-font');
      if (!link) {
        link = document.createElement('link');
        link.id = 'stre-font';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      const href = 'https://fonts.googleapis.com/css2?family=' + FONTS[t.font] + '&display=swap';
      if (link.href !== href) link.href = href;
    }
  }

  // ---------- стили: окна, стекло, редактор ----------
  // Окна — карточки и панели страниц: фон --s-2/--s-3 в style или классы карточек.
  const WIN = ':is([style*="var(--s-2)"],[style*="var(--s-3)"],.card,.sec,.flt,.meth,.svc,.wc,.sb)';
  const RADII = [4, 6, 8, 12];
  const RADCLS = { 6: '.bp,.bs,.btn-p,.btn-s,.inp,.sel,.seg,.chipf', 8: '.card,.sec,.flt,.meth,.svc,.wc,.sb' };
  const css = document.createElement('style');
  css.id = 'stre-theme-css';
  css.textContent = GREYS.map((_, i) =>
    '[data-fill="' + i + '"]{fill:var(--n-' + i + ')}[data-stroke="' + i + '"]{stroke:var(--n-' + i + ')}').join('') +
    RADII.map((r) => 'html[data-radius="1"] :is([style*="border-radius: ' + r + 'px"]' + (RADCLS[r] ? ',' + RADCLS[r] : '') +
      '){border-radius:calc(' + r + 'px * var(--rad))!important}').join('') + `
html[data-glass="1"] ${WIN}{backdrop-filter:blur(var(--glass-blur)) saturate(1.25);-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(1.25)}
html[data-glass="1"] ${WIN}:not(.sb){box-shadow:inset 0 1px 0 rgb(var(--n-13-rgb) / .08)}
html[data-panel-fx="1"] ${WIN}{box-shadow:0 calc(var(--sh-b) / 3) var(--sh-b) rgba(0,0,0,var(--sh-a)),0 0 var(--glow) rgb(var(--accent-rgb) / var(--glow-a)),inset 0 1px 0 rgb(var(--n-13-rgb) / .06)!important}
html[data-borders="1"] ${WIN}{border-color:rgb(var(--n-13-rgb) / calc(.12 * var(--bd-a)))!important}
html[data-accent-buttons="1"] .bp:not(:disabled),html[data-accent-buttons="1"] .btn-p,html[data-accent-buttons="1"] .pb{background:var(--accent)!important;color:var(--accent-on)!important}
html[data-accent-buttons="1"] .pb svg *{fill:var(--accent-on)}
#stre-bd{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict}
#stre-bd>*{position:absolute;inset:0}
#stre-bd .img{background-position:center;background-size:cover;background-repeat:no-repeat}
#stre-bd .aur{filter:blur(70px);opacity:.6}
#stre-bd .aur i{position:absolute;width:55vmax;height:55vmax;border-radius:50%;mix-blend-mode:screen;animation:stre-drift var(--aur-dur,40s) ease-in-out infinite alternate}
#stre-bd .aur i:nth-child(1){left:-10vmax;top:-20vmax}
#stre-bd .aur i:nth-child(2){right:-15vmax;top:5vmax;animation-delay:-12s;animation-direction:alternate-reverse}
#stre-bd .aur i:nth-child(3){left:20vmax;bottom:-30vmax;animation-delay:-24s}
@keyframes stre-drift{0%{transform:translate(0,0) scale(1)}50%{transform:translate(12vmax,8vmax) scale(1.15)}100%{transform:translate(-8vmax,14vmax) scale(.9)}}
@media (prefers-reduced-motion: reduce){#stre-bd .aur i{animation:none}}
#stre-fab{position:fixed;right:20px;bottom:20px;z-index:550;height:44px;padding:0 16px 0 12px;border-radius:999px;border:1px solid rgb(var(--n-13-rgb)/.14);background:rgb(var(--n-1-rgb)/.82);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:var(--n-12);font:500 14px/20px var(--font-sans),system-ui,sans-serif;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}
#stre-fab:hover{border-color:rgb(var(--n-13-rgb)/.3)}
#stre-fab:focus-visible,#stre-panel :focus-visible{outline:none;box-shadow:0 0 0 2px var(--n-1),0 0 0 4px var(--n-13)}
#stre-panel{position:fixed;top:0;right:0;bottom:0;z-index:560;width:min(420px,100vw);overflow-y:auto;background:rgb(var(--n-1-rgb)/.94);backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);border-left:1px solid rgb(var(--n-13-rgb)/.14);box-shadow:-24px 0 80px -16px rgba(0,0,0,.6);color:var(--n-12);font:400 14px/20px var(--font-sans),system-ui,sans-serif;transform:translateX(105%);transition:transform 320ms cubic-bezier(.16,1,.3,1)}
#stre-panel.open{transform:none}
@media (prefers-reduced-motion: reduce){#stre-panel{transition:none}}
#stre-panel *{box-sizing:border-box}
#stre-panel h2{margin:0;font-size:20px;line-height:26px;font-weight:600}
#stre-panel details{border-top:1px solid var(--n-5)}
#stre-panel summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;font-size:11px;line-height:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--n-10)}
#stre-panel summary::-webkit-details-marker{display:none}
#stre-panel summary::after{content:'+';font:400 18px/1 var(--font-sans),sans-serif;color:var(--n-9)}
#stre-panel details[open] summary::after{content:'–'}
#stre-panel summary:hover{color:var(--n-12)}
#stre-panel .body{padding:0 20px 18px}
#stre-panel .row{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:36px}
#stre-panel .seg{display:inline-flex;padding:2px;border:1px solid var(--n-6);border-radius:6px;flex-wrap:wrap;gap:2px}
#stre-panel .seg button{height:32px;padding:0 10px;border:0;border-radius:4px;background:transparent;color:var(--n-10);font:500 13px/18px var(--font-sans),system-ui,sans-serif;cursor:pointer}
#stre-panel .seg button:hover{color:var(--n-12)}
#stre-panel .seg button[aria-pressed="true"]{background:var(--n-12);color:var(--n-1)}
#stre-panel .presets{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 20px 18px}
#stre-panel .preset{display:flex;flex-direction:column;gap:6px;padding:0;border:0;background:none;color:var(--n-12);font:500 12px/16px var(--font-sans),system-ui,sans-serif;cursor:pointer;text-align:left}
#stre-panel .preset span{height:48px;border-radius:6px;border:1px solid var(--n-6)}
#stre-panel .preset[aria-pressed="true"] span{outline:2px solid var(--n-12);outline-offset:2px}
#stre-panel label.f{display:flex;flex-direction:column;gap:6px;margin-top:12px;font-size:13px;color:var(--n-11)}
#stre-panel label.f>span{display:flex;justify-content:space-between}
#stre-panel input[type=range]{width:100%;accent-color:var(--n-12)}
#stre-panel input[type=color]{width:44px;height:32px;padding:0;border:1px solid var(--n-6);border-radius:6px;background:none;cursor:pointer}
#stre-panel select,#stre-panel input[type=url]{height:36px;padding:0 10px;border-radius:6px;background:var(--n-3);border:1px solid var(--n-8);color:var(--n-12);font:400 14px/20px var(--font-sans),system-ui,sans-serif;width:100%}
#stre-panel .sw{width:24px;height:24px;border-radius:999px;border:2px solid var(--n-1);box-shadow:0 0 0 1px var(--n-6);cursor:pointer;padding:0}
#stre-panel .sw[aria-pressed="true"]{box-shadow:0 0 0 2px var(--n-12)}
#stre-panel .btn{height:36px;padding:0 12px;border-radius:6px;border:1px solid var(--n-6);background:transparent;color:var(--n-12);font:500 13px/18px var(--font-sans),system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
#stre-panel .btn:hover{background:rgb(var(--n-13-rgb)/.05)}
#stre-panel .hint{margin:6px 0 0;font-size:12px;line-height:16px;color:var(--n-9)}
#stre-panel .tog{position:relative;width:40px;height:24px;border-radius:999px;border:1px solid var(--n-8);background:transparent;cursor:pointer;flex:none;padding:0}
#stre-panel .tog i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:999px;background:var(--n-9);transition:transform 180ms}
#stre-panel .tog[aria-checked="true"]{background:var(--n-12);border-color:var(--n-12)}
#stre-panel .tog[aria-checked="true"] i{transform:translateX(16px);background:var(--n-1)}
#stre-panel .drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:96px;margin-top:12px;border:1px dashed var(--n-8);border-radius:8px;color:var(--n-10);font-size:13px;cursor:pointer;text-align:center;padding:0 12px}
#stre-panel .drop.over{border-color:var(--n-12);background:rgb(var(--n-13-rgb)/.04)}
#stre-panel .thumb{margin-top:12px;height:96px;border-radius:8px;border:1px solid var(--n-6);background-size:cover;background-position:center}
`;
  document.head.appendChild(css);
  applyVars(theme);

  // ---------- фоновый слой ----------
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderBackdrop(t) {
    if (!document.body) return;
    let bd = document.getElementById('stre-bd');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'stre-bd';
      bd.setAttribute('aria-hidden', 'true');
      bd.innerHTML = '<div class="base"></div><div class="img"></div><div class="aur"><i></i><i></i><i></i></div><div class="scrim"></div><canvas class="pt"></canvas><div class="grain"></div><div class="vig"></div>';
      document.body.prepend(bd);
    }
    const q = (s) => bd.querySelector(s);
    q('.base').style.background = t.bgType === 'solid' && t.bgColor ? t.bgColor : 'var(--n-1)';
    const img = q('.img');
    if (t.bgType === 'gradient') img.style.backgroundImage = 'linear-gradient(' + t.angle + 'deg, ' + t.g1 + ', ' + t.g2 + ')';
    else if (t.bgType === 'image' && t.image) img.style.backgroundImage = 'url("' + t.image.replace(/"/g, '%22') + '")';
    else img.style.backgroundImage = 'none';
    const blur = t.bgType === 'image' ? t.blur : 0;
    img.style.filter = blur ? 'blur(' + blur + 'px)' : '';
    img.style.inset = blur ? (-blur * 2) + 'px' : '0';

    const aur = q('.aur');
    aur.style.display = t.aurora ? '' : 'none';
    if (t.aurora) {
      const a = hexToRgb(t.accent);
      const h1 = hsl(t.hue, 0.7, 0.45), h2 = hsl((t.hue + 60) % 360, 0.7, 0.4);
      const k = t.auroraStrength / 100;
      const blobs = aur.querySelectorAll('i');
      [a, h1, h2].forEach((c, i) => { blobs[i].style.background = 'radial-gradient(circle, rgba(' + c.map(Math.round).join(',') + ',' + (0.55 * k + 0.1) + '), transparent 65%)'; });
      aur.style.setProperty('--aur-dur', Math.round(90 - t.auroraSpeed * 0.75) + 's');
    }

    const dim = t.bgType === 'solid' ? 0 : Math.max(t.dim, t.dimMin || 0) / 100;
    q('.scrim').style.background = 'rgb(var(--n-1-rgb) / ' + dim + ')';

    const grain = q('.grain');
    grain.style.background = t.grain ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" : 'none';
    grain.style.opacity = String(0.02 + t.grainStrength / 900);
    q('.vig').style.background = t.vignette ? 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,' + (0.25 + t.vignetteStrength / 140) + ') 100%)' : 'none';
    startParticles(q('canvas.pt'), t);
  }

  // ---------- частицы ----------
  let raf = 0;
  const mouse = { x: 0.5, y: 0.5 };
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });

  function startParticles(cv, t) {
    cancelAnimationFrame(raf);
    if (t.particles === 'none') { cv.style.display = 'none'; return; }
    cv.style.display = '';
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    fit();
    if (cv.__fit) window.removeEventListener('resize', cv.__fit);
    cv.__fit = fit;
    window.addEventListener('resize', fit);

    const kind = t.particles;
    const sp = 0.2 + t.speed / 50;           // 0.2…2.2
    const sz = 0.4 + t.size / 50;            // 0.4…2.4
    const base = { stars: 160, float: 90, snow: 140, dust: 120, fireflies: 45, rain: 160 }[kind] || 80;
    const count = Math.round(base * (0.15 + t.density / 60));
    const rgb = particleRgb(t).join(',');
    const rnd = (a, b) => a + Math.random() * (b - a);
    const make = () => ({ x: Math.random(), y: Math.random(), z: rnd(0.3, 1), r: rnd(0.4, 1.4), a: rnd(0.25, 0.9), ph: rnd(0, 6.28), vx: rnd(-1, 1), vy: rnd(-1, 1) });
    const P = Array.from({ length: count }, make);
    const meteors = [];
    let last = 0;
    const still = reduced();

    function draw(ts) {
      raf = requestAnimationFrame(draw);
      if (document.hidden || ts - last < 30) return;
      const dt = last ? Math.min(60, ts - last) / 16 : 1;
      last = ts;
      const w = cv.width, h = cv.height;
      const px = t.parallax ? (mouse.x - 0.5) * 30 * dpr : 0;
      const py = t.parallax ? (mouse.y - 0.5) * 30 * dpr : 0;
      ctx.clearRect(0, 0, w, h);
      for (const p of P) {
        let x = p.x * w + px * p.z, y = p.y * h + py * p.z;
        if (kind === 'stars') {
          const a = p.a * (0.6 + 0.4 * Math.sin(ts / 700 * sp + p.ph));
          dot(x, y, p.r * sz * dpr * p.z, a);
        } else if (kind === 'float') {
          if (!still) { p.y -= 0.00035 * sp * p.z * dt; p.x += Math.sin(ts / 3000 + p.ph) * 0.00012 * sp * dt; }
          if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
          const a = p.a * (0.55 + 0.45 * Math.sin(ts / 900 + p.ph));
          glow(x, y, p.r * sz * 1.6 * dpr * p.z, a);
        } else if (kind === 'snow') {
          if (!still) { p.y += 0.0012 * sp * p.z * dt; p.x += Math.sin(ts / 1400 + p.ph) * 0.0004 * dt; }
          if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
          dot(x, y, (1 + p.r * 1.6) * sz * dpr * p.z, 0.35 + p.a * 0.5);
        } else if (kind === 'dust') {
          if (!still) { p.x += p.vx * 0.00012 * sp * dt; p.y += p.vy * 0.00012 * sp * dt; }
          p.x = (p.x + 1) % 1; p.y = (p.y + 1) % 1;
          dot(x, y, p.r * 0.8 * sz * dpr, p.a * 0.35);
        } else if (kind === 'fireflies') {
          if (!still) {
            p.vx += rnd(-0.08, 0.08); p.vy += rnd(-0.08, 0.08);
            p.vx = Math.max(-1, Math.min(1, p.vx)); p.vy = Math.max(-1, Math.min(1, p.vy));
            p.x += p.vx * 0.0006 * sp * dt; p.y += p.vy * 0.0006 * sp * dt;
          }
          p.x = (p.x + 1) % 1; p.y = (p.y + 1) % 1;
          const a = 0.25 + 0.75 * Math.max(0, Math.sin(ts / 600 * sp + p.ph));
          glow(x, y, (2 + p.r * 2) * sz * dpr, a);
        } else if (kind === 'rain') {
          if (!still) { p.y += 0.012 * sp * p.z * dt; p.x -= 0.002 * sp * dt; }
          if (p.y > 1.05) { p.y = -0.05; p.x = Math.random() * 1.1; }
          ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.15 + p.a * 0.3) + ')';
          ctx.lineWidth = 1 * dpr * sz * 0.8;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 * dpr, y - 18 * dpr * p.z * sz); ctx.stroke();
        }
      }
      if (kind === 'stars' && !still) {
        if (Math.random() < 0.004 * sp + t.density / 15000 && meteors.length < 3) meteors.push({ x: rnd(0.2, 1) * w, y: rnd(0, 0.4) * h, life: 0 });
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.life += dt;
          const len = 130 * dpr, x = m.x - m.life * 14 * dpr * sp, y = m.y + m.life * 7 * dpr * sp;
          const g = ctx.createLinearGradient(x, y, x + len, y - len / 2);
          g.addColorStop(0, 'rgba(' + rgb + ',.9)');
          g.addColorStop(1, 'rgba(' + rgb + ',0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.2 * dpr;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len / 2); ctx.stroke();
          if (m.life > 45) meteors.splice(i, 1);
        }
      }
      if (still) cancelAnimationFrame(raf);
    }
    function dot(x, y, r, a) {
      ctx.fillStyle = 'rgba(' + rgb + ',' + a + ')';
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.3, r), 0, 6.283); ctx.fill();
    }
    function glow(x, y, r, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
      g.addColorStop(0.25, 'rgba(' + rgb + ',' + a * 0.5 + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.283); ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  // ---------- картинка: сжатие и автозатемнение ----------
  function analyze(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 64; c.height = 36;
          const x = c.getContext('2d');
          x.drawImage(im, 0, 0, 64, 36);
          const d = x.getImageData(0, 0, 64, 36).data;
          const ls = [];
          for (let i = 0; i < d.length; i += 4) ls.push(lum([d[i], d[i + 1], d[i + 2]]));
          ls.sort((a, b) => a - b);
          resolve({ p95: ls[Math.floor(ls.length * 0.95)], p5: ls[Math.floor(ls.length * 0.05)] });
        } catch (e) { resolve(null); }
      };
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }
  function dimMinFor(stats, mode) {
    if (!stats) return 50;
    if (mode === 'dark') return Math.round(Math.max(0, Math.min(85, (1 - 0.16 / Math.max(stats.p95, 0.01)) * 100)));
    return Math.round(Math.max(0, Math.min(85, (1 - stats.p5 / 0.45) * 100)));
  }
  function compress(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 1920 / im.width);
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = reject;
        im.src = r.result;
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ---------- публичный API ----------
  function set(patch, opts) {
    theme = Object.assign({}, theme, patch);
    if (!opts || !opts.keepPreset) theme.preset = patch.preset || 'custom';
    applyVars(theme);
    renderBackdrop(theme);
    return save(theme);
  }
  async function setImage(src) {
    const m = dimMinFor(await analyze(src), theme.mode);
    set({ bgType: 'image', image: src, dimMin: m, dim: Math.max(theme.dim, m) });
  }
  window.StreTheme = {
    get: () => Object.assign({}, theme),
    set,
    reset: () => { theme = Object.assign({}, DEFAULT); set({}, { keepPreset: true }); rerenderPanel(); },
    open: () => openPanel(),
    presets: PRESETS,
  };

  // ---------- редактор ----------
  let panel;
  const openSections = { theme: true };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function presetSwatch(p) {
    const t = Object.assign({}, DEFAULT, p);
    const n = palette(t);
    const bg = t.bgType === 'gradient' ? 'linear-gradient(' + t.angle + 'deg,' + t.g1 + ',' + t.g2 + ')' : (t.bgColor || 'rgb(' + n[1].join(',') + ')');
    return bg + ';box-shadow:inset 0 -12px 0 rgb(' + n[3].join(',') + '), inset 10px -12px 0 ' + t.accent;
  }

  function panelHtml(t) {
    const pr = (a, b) => (String(a) === String(b) ? 'true' : 'false');
    const seg = (k, val, opts) => '<div class="seg" role="group">' + opts.map((o) =>
      '<button type="button" data-k="' + k + '" data-v="' + o[0] + '" aria-pressed="' + pr(val, o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
    const range = (k, label, val, min, max, step, unit) =>
      '<label class="f"><span>' + label + '<b data-out="' + k + '">' + val + unit + '</b></span><input type="range" data-k="' + k + '" data-unit="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></label>';
    const tog = (k, label, val, hint) =>
      '<div class="row" style="margin-top:12px"><span>' + label + (hint ? '<span class="hint" style="display:block;margin:2px 0 0">' + hint + '</span>' : '') + '</span><button type="button" class="tog" role="switch" data-k="' + k + '" aria-checked="' + (val ? 'true' : 'false') + '" aria-label="' + label + '"><i></i></button></div>';
    const sec = (id, title, html) => '<details data-sec="' + id + '"' + (openSections[id] ? ' open' : '') + '><summary>' + title + '</summary><div class="body">' + html + '</div></details>';
    const accents = ['#D92D20', '#FF7A1A', '#F5C518', '#2BB673', '#2F8FFF', '#8B5CF6', '#FF4FA3', '#E8E8E8'];
    const img = t.bgType === 'image', grad = t.bgType === 'gradient';

    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px">' +
      '<h2 id="stre-panel-t">Оформление</h2><button type="button" class="btn" data-act="close" aria-label="Закрыть">✕</button></div>' +
      '<div class="presets">' + Object.keys(PRESETS).map((k) =>
        '<button type="button" class="preset" data-preset="' + k + '" aria-pressed="' + pr(t.preset, k) + '"><span style="background:' + presetSwatch(PRESETS[k]) + '"></span>' + PRESETS[k].name + '</button>').join('') + '</div>' +

      sec('theme', 'Тема и цвет интерфейса',
        seg('mode', t.mode, [['dark', 'Тёмная'], ['light', 'Светлая']]) +
        range('hue', 'Оттенок', t.hue, 0, 360, 1, '°') +
        range('sat', 'Насыщенность оттенка', t.sat, 0, 40, 1, '%') +
        '<p class="hint">При 0% интерфейс строго чёрно-белый. Текст остаётся контрастным при любом оттенке.</p>') +

      sec('accent', 'Акцентный цвет',
        '<div class="row"><div style="display:flex;gap:8px;flex-wrap:wrap">' + accents.map((c) =>
          '<button type="button" class="sw" data-accent="' + c + '" aria-label="Акцент ' + c + '" aria-pressed="' + pr(t.accent.toUpperCase(), c) + '" style="background:' + c + '"></button>').join('') +
        '</div><input type="color" data-k="accent" value="' + esc(t.accent) + '" aria-label="Свой акцентный цвет"></div>' +
        tog('accentButtons', 'Акцент на основных кнопках', t.accentButtons, 'Иначе акцент только у статуса «В эфире» и опасных действий')) +

      sec('bg', 'Фон',
        seg('bgType', t.bgType, [['solid', 'Цвет'], ['gradient', 'Градиент'], ['image', 'Картинка']]) +
        (t.bgType === 'solid' ? '<div class="row" style="margin-top:12px"><span>Цвет фона</span><span style="display:flex;gap:8px;align-items:center"><input type="color" data-k="bgColor" value="' + esc(t.bgColor || '#0A0A0A') + '" aria-label="Цвет фона"><button type="button" class="btn" data-act="bgauto">Авто</button></span></div>' : '') +
        (grad ? '<div class="row" style="margin-top:12px"><span>Цвета</span><span style="display:flex;gap:8px"><input type="color" data-k="g1" value="' + esc(t.g1) + '" aria-label="Первый цвет"><input type="color" data-k="g2" value="' + esc(t.g2) + '" aria-label="Второй цвет"></span></div>' + range('angle', 'Угол', t.angle, 0, 360, 5, '°') : '') +
        (img ? '<label class="drop" data-drop><input type="file" accept="image/*" data-file hidden><span>Перетащи картинку или <u>выбери файл</u></span><span class="hint">JPG, PNG, WebP. Сожмём до 1920 px</span></label>' +
          '<label class="f">Или ссылка на картинку<input type="url" data-url placeholder="https://…" value="' + (t.image && t.image.indexOf('data:') !== 0 ? esc(t.image) : '') + '"></label>' +
          (t.image ? '<div class="thumb" style="background-image:url(&quot;' + esc(t.image) + '&quot;)"></div>' : '') +
          range('blur', 'Размытие картинки', t.blur, 0, 40, 2, ' px') : '') +
        (t.bgType !== 'solid' ? range('dim', 'Затемнение', Math.max(t.dim, t.dimMin || 0), t.dimMin || 0, 90, 1, '%') +
          (t.dimMin ? '<p class="hint">Минимум ' + t.dimMin + '% для этой картинки, иначе текст станет нечитаемым</p>' : '') : '') +
        tog('aurora', 'Сияние', t.aurora, 'Медленно плывущие цветные пятна под интерфейсом') +
        (t.aurora ? range('auroraStrength', 'Яркость сияния', t.auroraStrength, 10, 100, 5, '%') + range('auroraSpeed', 'Скорость сияния', t.auroraSpeed, 0, 100, 5, '%') : '')) +

      sec('particles', 'Частицы',
        '<label class="f">Эффект<select data-k="particles">' + PARTICLES.map((p) => '<option value="' + p[0] + '"' + (p[0] === t.particles ? ' selected' : '') + '>' + p[1] + '</option>').join('') + '</select></label>' +
        (t.particles !== 'none' ?
          '<div class="row" style="margin-top:12px"><span>Цвет частиц</span>' + seg('pColor', t.pColor, [['ink', 'Как текст'], ['accent', 'Акцент'], ['custom', 'Свой']]) + '</div>' +
          (t.pColor === 'custom' ? '<div class="row" style="margin-top:8px"><span></span><input type="color" data-k="pCustom" value="' + esc(t.pCustom) + '" aria-label="Цвет частиц"></div>' : '') +
          range('density', 'Количество', t.density, 0, 100, 5, '%') +
          range('speed', 'Скорость', t.speed, 0, 100, 5, '%') +
          range('size', 'Размер', t.size, 0, 100, 5, '%') +
          tog('parallax', 'Реакция на курсор', t.parallax, 'Частицы слегка смещаются вслед за мышью') : '') +
        '<p class="hint">Частицы не перехватывают клики, засыпают в фоновой вкладке и замирают при «уменьшении движения» в системе.</p>') +

      sec('overlay', 'Наложения',
        tog('grain', 'Плёночное зерно', t.grain) + (t.grain ? range('grainStrength', 'Сила зерна', t.grainStrength, 0, 100, 5, '%') : '') +
        tog('vignette', 'Виньетка', t.vignette) + (t.vignette ? range('vignetteStrength', 'Сила виньетки', t.vignetteStrength, 0, 100, 5, '%') : '')) +

      sec('windows', 'Окна и стекло',
        range('panel', 'Непрозрачность окон', t.panel, 30, 100, 2, '%') +
        tog('glass', 'Эффект стекла', t.glass, 'Фон за окнами размывается, как за матовым стеклом') +
        (t.glass ? range('glassBlur', 'Сила размытия', t.glassBlur, 2, 40, 1, ' px') : '') +
        range('radius', 'Скругление углов', t.radius, 0, 250, 10, '%') +
        range('shadow', 'Тени окон', t.shadow, 0, 100, 5, '%') +
        range('glow', 'Подсветка окон акцентом', t.glow, 0, 60, 2, ' px') +
        range('borders', 'Яркость рамок', t.borders, 0, 250, 10, '%') +
        '<p class="hint">Совет: для стекла снизь непрозрачность окон до 60–80% и поставь фон-картинку или сияние.</p>') +

      sec('text', 'Шрифт и масштаб',
        '<label class="f">Шрифт<select data-k="font">' + Object.keys(FONTS).map((f) => '<option' + (f === t.font ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></label>' +
        range('scale', 'Масштаб интерфейса', t.scale, 85, 125, 5, '%')) +

      '<div style="padding:18px 20px;border-top:1px solid var(--n-5);display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="export">Скопировать тему</button><button type="button" class="btn" data-act="import">Вставить тему</button><button type="button" class="btn" data-act="reset">Сбросить</button><p class="hint" data-status style="width:100%">Сохраняется автоматически в этом браузере.</p></div>';
  }

  function rerenderPanel() {
    if (!panel) return;
    const scroll = panel.scrollTop;
    panel.innerHTML = panelHtml(theme);
    panel.scrollTop = scroll;
  }
  function status(msg) { const s = panel && panel.querySelector('[data-status]'); if (s) s.textContent = msg; }

  function buildPanel() {
    panel = document.createElement('aside');
    panel.id = 'stre-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'stre-panel-t');
    panel.hidden = true;
    document.body.appendChild(panel);
    rerenderPanel();

    panel.addEventListener('toggle', (e) => {
      const d = e.target.closest && e.target.closest('details');
      if (d) openSections[d.dataset.sec] = d.open;
    }, true);

    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const ds = b.dataset;
      if (ds.act === 'close') return closePanel();
      if (ds.preset) {
        set(Object.assign({}, DEFAULT, PRESETS[ds.preset], { preset: ds.preset, image: theme.image, font: theme.font, scale: theme.scale }));
        return rerenderPanel();
      }
      if (ds.accent) { set({ accent: ds.accent }); return rerenderPanel(); }
      if (ds.act === 'bgauto') { set({ bgColor: '' }); return rerenderPanel(); }
      if (ds.act === 'reset') return window.StreTheme.reset();
      if (ds.act === 'export') {
        const data = Object.assign({}, theme);
        if (data.image && data.image.indexOf('data:') === 0) data.image = '';
        const text = JSON.stringify(data);
        try { await navigator.clipboard.writeText(text); status('Тема скопирована (без загруженной картинки).'); }
        catch (err) { prompt('Скопируй тему:', text); }
        return;
      }
      if (ds.act === 'import') {
        const text = prompt('Вставь скопированную тему:');
        if (!text) return;
        try {
          const data = JSON.parse(text);
          const clean = {};
          Object.keys(DEFAULT).forEach((k) => { if (k in data && typeof data[k] === typeof DEFAULT[k]) clean[k] = data[k]; });
          set(clean);
          rerenderPanel();
          status('Тема применена.');
        } catch (err) { status('Не получилось прочитать тему: проверь, что скопировано целиком.'); }
        return;
      }
      if (ds.k && 'v' in ds) {
        const p = {}; p[ds.k] = ds.v;
        set(p);
        if (ds.k === 'mode' && theme.bgType === 'image' && theme.image) await setImage(theme.image);
        return rerenderPanel();
      }
      if (b.classList.contains('tog')) {
        const p = {}; p[ds.k] = !theme[ds.k];
        if (ds.k === 'glass' && p.glass && theme.panel > 85) p.panel = 76;
        set(p);
        return rerenderPanel();
      }
    });

    panel.addEventListener('input', (e) => {
      const el = e.target;
      const k = el.dataset.k;
      if (!k) return;
      let v = el.value;
      if (el.type === 'range') {
        v = Number(v);
        const out = panel.querySelector('[data-out="' + k + '"]');
        if (out) out.textContent = v + (el.dataset.unit || '');
      }
      const p = {}; p[k] = v;
      set(p);
    });
    panel.addEventListener('change', async (e) => {
      const el = e.target;
      if (['font', 'accent', 'particles', 'pCustom'].indexOf(el.dataset.k) >= 0) rerenderPanel();
      if (el.matches('[data-file]') && el.files[0]) {
        status('Загружаем картинку…');
        try {
          await setImage(await compress(el.files[0]));
          rerenderPanel();
          status(save(theme) ? 'Картинка сохранена.' : 'Картинка слишком большая для хранения в браузере, выбери поменьше.');
        } catch (err) { status('Не удалось открыть файл. Подойдут JPG, PNG или WebP.'); }
      }
      if (el.matches('[data-url]') && el.value.trim()) {
        status('Проверяем ссылку…');
        await setImage(el.value.trim());
        rerenderPanel();
        status('Готово. Если картинка не видна, сайт с картинкой запрещает встраивание.');
      }
    });
    panel.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
    panel.addEventListener('dragleave', (e) => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
    panel.addEventListener('drop', async (e) => {
      const d = e.target.closest('[data-drop]');
      if (!d) return;
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      try { await setImage(await compress(f)); rerenderPanel(); } catch (err) { status('Не удалось открыть файл.'); }
    });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
  }

  let fab;
  function openPanel() {
    if (!panel) buildPanel();
    rerenderPanel();
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    if (fab) fab.setAttribute('aria-expanded', 'true');
    const first = panel.querySelector('button');
    if (first) first.focus();
  }
  function closePanel() {
    if (!panel) return;
    panel.classList.remove('open');
    if (fab) { fab.setAttribute('aria-expanded', 'false'); fab.focus(); }
    setTimeout(() => { if (!panel.classList.contains('open')) panel.hidden = true; }, 340);
  }

  function boot() {
    renderBackdrop(theme);
    fab = document.createElement('button');
    fab.id = 'stre-fab';
    fab.type = 'button';
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2z"/></svg>Оформление';
    fab.addEventListener('click', () => (panel && panel.classList.contains('open') ? closePanel() : openPanel()));
    document.body.appendChild(fab);
    if (location.hash === '#theme-editor') openPanel();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    theme = load();
    applyVars(theme);
    renderBackdrop(theme);
    rerenderPanel();
  });
})();

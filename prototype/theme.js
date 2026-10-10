/* StreOps — пользовательское оформление.
   Подключается в <head> каждой страницы продукта. Читает тему из localStorage,
   до первой отрисовки выставляет CSS-переменные (--n-*, --s-*, --accent*, --font-sans),
   рисует фоновый слой и даёт редактор (кнопка «Оформление» в углу, window.StreTheme.open()). */
(function () {
  'use strict';

  const KEY = 'streops-theme-v1';
  const GREYS = [0x00, 0x0A, 0x11, 0x17, 0x1F, 0x2A, 0x3A, 0x52, 0x6E, 0x8F, 0xB4, 0xDC, 0xF2, 0xFF];

  const DEFAULT = {
    preset: 'graphite', mode: 'dark', hue: 220, sat: 0,
    accent: '#D92D20', accentButtons: false,
    bgType: 'solid', bgColor: '', g1: '#1C1C24', g2: '#0A0A0A', angle: 160,
    image: '', blur: 0, dim: 0, dimMin: 0,
    effect: 'none', density: 50, panel: 100, font: 'Onest', scale: 100,
  };

  const PRESETS = {
    graphite: { name: 'Графит', mode: 'dark', hue: 220, sat: 0, accent: '#D92D20', accentButtons: false, bgType: 'solid', bgColor: '', effect: 'none', panel: 100 },
    midnight: { name: 'Полночь', mode: 'dark', hue: 230, sat: 12, accent: '#D92D20', accentButtons: false, bgType: 'solid', bgColor: '#000000', effect: 'stars', density: 45, panel: 92 },
    paper: { name: 'Бумага', mode: 'light', hue: 40, sat: 6, accent: '#C42B1C', accentButtons: false, bgType: 'solid', bgColor: '', effect: 'none', panel: 100 },
    fog: { name: 'Туман', mode: 'dark', hue: 140, sat: 10, accent: '#D92D20', accentButtons: false, bgType: 'gradient', g1: '#4E5C53', g2: '#0B0D0C', angle: 160, effect: 'grain', panel: 86 },
    ocean: { name: 'Океан', mode: 'dark', hue: 205, sat: 28, accent: '#2F8FFF', accentButtons: true, bgType: 'gradient', g1: '#0E2A44', g2: '#05080D', angle: 200, effect: 'vignette', panel: 88 },
    sunset: { name: 'Закат', mode: 'dark', hue: 20, sat: 22, accent: '#FF7A1A', accentButtons: true, bgType: 'gradient', g1: '#3D1F14', g2: '#0D0807', angle: 170, effect: 'grain', panel: 90 },
  };

  const FONTS = {
    'Onest': null,
    'Golos Text': 'Golos+Text:wght@400;500;600;700',
    'Manrope': 'Manrope:wght@400;500;600;700',
    'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600;700',
    'Unbounded': 'Unbounded:wght@400;500;600;700',
    'Системный': null,
  };

  // ---------- состояние ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign({}, DEFAULT, JSON.parse(raw));
    } catch (e) { /* приватный режим — тема по умолчанию */ }
    return Object.assign({}, DEFAULT);
  }
  function save(t) {
    try { localStorage.setItem(KEY, JSON.stringify(t)); return true; } catch (e) { return false; }
  }
  let theme = load();

  // ---------- цвет ----------
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r) { return '#' + r.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }
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

  function applyVars(t) {
    const root = document.documentElement;
    const st = root.style;
    const n = palette(t);
    n.forEach((c, i) => {
      st.setProperty('--n-' + i + '-rgb', c.join(' '));
      st.setProperty('--n-' + i, 'rgb(' + c.join(' ') + ')');
    });
    const pa = Math.max(0.55, Math.min(1, t.panel / 100));
    st.setProperty('--panel-a', String(pa));
    st.setProperty('--s-2', 'rgb(' + n[2].join(' ') + ' / ' + pa + ')');
    st.setProperty('--s-3', 'rgb(' + n[3].join(' ') + ' / ' + Math.min(1, pa + 0.05) + ')');

    const acc = hexToRgb(t.accent || '#D92D20');
    const on = contrast(acc, [255, 255, 255]) >= contrast(acc, [10, 10, 10]) ? [255, 255, 255] : [10, 10, 10];
    let text = acc.slice();
    const base = n[1];
    const toward = t.mode === 'light' ? [0, 0, 0] : [255, 255, 255];
    for (let i = 0; i < 12 && contrast(text, base) < 4.5; i++) text = mix(text, toward, 0.12);
    text = text.map(Math.round);
    st.setProperty('--accent', rgbToHex(acc));
    st.setProperty('--accent-rgb', acc.join(' '));
    st.setProperty('--accent-hover', rgbToHex(mix(acc, [0, 0, 0], 0.12)));
    st.setProperty('--accent-on', rgbToHex(on));
    st.setProperty('--accent-text', rgbToHex(text));
    st.setProperty('--accent-text-rgb', text.join(' '));

    const fontName = t.font === 'Системный' ? 'system-ui' : "'" + t.font + "'";
    st.setProperty('--font-sans', fontName);
    st.setProperty('--page-bg', 'transparent');
    st.colorScheme = t.mode;
    root.dataset.theme = t.mode;
    root.dataset.accentButtons = t.accentButtons ? '1' : '0';
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

  // ---------- базовые стили (до отрисовки страницы) ----------
  const css = document.createElement('style');
  css.id = 'stre-theme-css';
  css.textContent = GREYS.map((_, i) =>
    '[data-fill="' + i + '"]{fill:var(--n-' + i + ')}[data-stroke="' + i + '"]{stroke:var(--n-' + i + ')}').join('') + `
html[data-accent-buttons="1"] .bp:not(:disabled),html[data-accent-buttons="1"] .btn-p,html[data-accent-buttons="1"] .pb{background:var(--accent)!important;color:var(--accent-on)!important}
html[data-accent-buttons="1"] .pb svg *{fill:var(--accent-on)}
#stre-bd{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict}
#stre-bd>*{position:absolute;inset:0}
#stre-bd .img{background-position:center;background-size:cover;background-repeat:no-repeat}
#stre-fab{position:fixed;right:20px;bottom:20px;z-index:550;height:44px;padding:0 16px 0 12px;border-radius:999px;border:1px solid rgb(var(--n-13-rgb)/.14);background:rgb(var(--n-1-rgb)/.82);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:var(--n-12);font:500 14px/20px var(--font-sans),system-ui,sans-serif;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}
#stre-fab:hover{border-color:rgb(var(--n-13-rgb)/.3)}
#stre-fab:focus-visible,#stre-panel :focus-visible{outline:none;box-shadow:0 0 0 2px var(--n-1),0 0 0 4px var(--n-13)}
#stre-panel{position:fixed;top:0;right:0;bottom:0;z-index:560;width:min(400px,100vw);box-sizing:border-box;overflow-y:auto;background:rgb(var(--n-1-rgb)/.94);backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);border-left:1px solid rgb(var(--n-13-rgb)/.14);box-shadow:-24px 0 80px -16px rgba(0,0,0,.6);color:var(--n-12);font:400 14px/20px var(--font-sans),system-ui,sans-serif;transform:translateX(105%);transition:transform 320ms cubic-bezier(.16,1,.3,1)}
#stre-panel.open{transform:none}
@media (prefers-reduced-motion: reduce){#stre-panel{transition:none}}
#stre-panel *{box-sizing:border-box}
#stre-panel h2{margin:0;font-size:20px;line-height:26px;font-weight:600}
#stre-panel h3{margin:0 0 10px;font-size:11px;line-height:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--n-9)}
#stre-panel .sec{padding:18px 20px;border-top:1px solid var(--n-5)}
#stre-panel .row{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:36px}
#stre-panel .seg{display:inline-flex;padding:2px;border:1px solid var(--n-6);border-radius:6px;flex-wrap:wrap}
#stre-panel .seg button{height:32px;padding:0 12px;border:0;border-radius:4px;background:transparent;color:var(--n-10);font:500 13px/18px var(--font-sans),system-ui,sans-serif;cursor:pointer}
#stre-panel .seg button[aria-pressed="true"]{background:var(--n-12);color:var(--n-1)}
#stre-panel .presets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#stre-panel .preset{display:flex;flex-direction:column;gap:6px;padding:0;border:0;background:none;color:var(--n-12);font:500 12px/16px var(--font-sans),system-ui,sans-serif;cursor:pointer;text-align:left}
#stre-panel .preset span{height:52px;border-radius:6px;border:1px solid var(--n-6)}
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
#stre-panel .btn.pri{background:var(--n-12);color:var(--n-1);border-color:var(--n-12)}
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
  let starsRaf = 0;
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function renderBackdrop(t) {
    if (!document.body) return;
    let bd = document.getElementById('stre-bd');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'stre-bd';
      bd.setAttribute('aria-hidden', 'true');
      bd.innerHTML = '<div class="base"></div><div class="img"></div><div class="scrim"></div><div class="fx"></div><canvas class="stars"></canvas>';
      document.body.prepend(bd);
    }
    const base = bd.querySelector('.base');
    const img = bd.querySelector('.img');
    const scrim = bd.querySelector('.scrim');
    const fx = bd.querySelector('.fx');
    const pageBase = 'var(--n-1)';
    base.style.background = t.bgType === 'solid' && t.bgColor ? t.bgColor : pageBase;
    if (t.bgType === 'gradient') {
      img.style.backgroundImage = 'linear-gradient(' + t.angle + 'deg, ' + t.g1 + ', ' + t.g2 + ')';
    } else if (t.bgType === 'image' && t.image) {
      img.style.backgroundImage = 'url("' + t.image.replace(/"/g, '%22') + '")';
    } else {
      img.style.backgroundImage = 'none';
    }
    const blur = t.bgType === 'image' ? t.blur : 0;
    img.style.filter = blur ? 'blur(' + blur + 'px)' : '';
    img.style.inset = blur ? (-blur * 2) + 'px' : '0';
    const dim = t.bgType === 'solid' ? 0 : Math.max(t.dim, t.dimMin || 0) / 100;
    scrim.style.background = 'rgb(var(--n-1-rgb) / ' + dim + ')';

    if (t.effect === 'grain') {
      fx.style.background = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
      fx.style.opacity = String(0.03 + t.density / 1000);
    } else if (t.effect === 'vignette') {
      fx.style.background = 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,' + (0.3 + t.density / 200) + ') 100%)';
      fx.style.opacity = '1';
    } else {
      fx.style.background = 'none';
    }
    startStars(bd.querySelector('canvas.stars'), t);
  }

  function startStars(cv, t) {
    cancelAnimationFrame(starsRaf);
    const ctx = cv.getContext('2d');
    if (t.effect !== 'stars') { cv.style.display = 'none'; return; }
    cv.style.display = '';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    size();
    window.removeEventListener('resize', cv.__resize || (() => {}));
    cv.__resize = size;
    window.addEventListener('resize', size);
    const count = Math.round(40 + t.density * 1.6);
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--n-13-rgb').trim().split(' ').join(',') || '255,255,255';
    const stars = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.6 + 0.2, tw: Math.random() * 6 }));
    const meteors = [];
    let last = 0;
    function frame(ts) {
      if (document.hidden) { starsRaf = requestAnimationFrame(frame); return; }
      if (ts - last < 33) { starsRaf = requestAnimationFrame(frame); return; }
      last = ts;
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = s.a * (0.7 + 0.3 * Math.sin(ts / 900 + s.tw));
        ctx.fillStyle = 'rgba(' + ink + ',' + a + ')';
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r * dpr, 0, 6.283); ctx.fill();
      }
      if (Math.random() < 0.006 + t.density / 12000 && meteors.length < 3) {
        meteors.push({ x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, life: 0 });
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += 1;
        const len = 120 * dpr, dx = -m.life * 14 * dpr, dy = m.life * 7 * dpr;
        const x = m.x + dx, y = m.y + dy;
        const g = ctx.createLinearGradient(x, y, x + len, y - len / 2);
        g.addColorStop(0, 'rgba(' + ink + ',.9)');
        g.addColorStop(1, 'rgba(' + ink + ',0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len / 2); ctx.stroke();
        if (m.life > 40) meteors.splice(i, 1);
      }
      if (!reducedMotion()) starsRaf = requestAnimationFrame(frame);
    }
    starsRaf = requestAnimationFrame(frame);
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
          const p95 = ls[Math.floor(ls.length * 0.95)];
          const p5 = ls[Math.floor(ls.length * 0.05)];
          resolve({ p95, p5 });
        } catch (e) { resolve(null); }
      };
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }
  function dimMinFor(stats, mode) {
    if (!stats) return 50;
    // текст светлый на тёмной теме: светлые участки картинки нужно приглушить
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
  const listeners = [];
  function set(patch, opts) {
    theme = Object.assign({}, theme, patch);
    if (!opts || !opts.keepPreset) theme.preset = patch.preset || 'custom';
    applyVars(theme);
    renderBackdrop(theme);
    const ok = save(theme);
    listeners.forEach((f) => f(theme, ok));
  }
  async function setImage(src) {
    const stats = await analyze(src);
    set({ bgType: 'image', image: src, dimMin: dimMinFor(stats, theme.mode), dim: Math.max(theme.dim, dimMinFor(stats, theme.mode)) });
  }
  window.StreTheme = {
    get: () => Object.assign({}, theme),
    set,
    reset: () => { theme = Object.assign({}, DEFAULT); set({}, { keepPreset: true }); },
    open: () => openPanel(),
    presets: PRESETS,
  };

  // ---------- редактор ----------
  let panel;
  function h(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

  function presetSwatch(p) {
    const n = palette(Object.assign({}, DEFAULT, p));
    const bg = p.bgType === 'gradient' ? 'linear-gradient(' + p.angle + 'deg,' + p.g1 + ',' + p.g2 + ')' : (p.bgColor || 'rgb(' + n[1].join(',') + ')');
    return bg + ';box-shadow:inset 0 -14px 0 rgb(' + n[3].join(',') + '), inset 12px -14px 0 ' + p.accent;
  }

  function panelHtml(t) {
    const pressed = (a, b) => (a === b ? 'true' : 'false');
    const seg = (name, val, opts) => '<div class="seg" role="group">' + opts.map((o) =>
      '<button type="button" data-k="' + name + '" data-v="' + o[0] + '" aria-pressed="' + pressed(String(val), String(o[0])) + '">' + o[1] + '</button>').join('') + '</div>';
    const range = (name, label, val, min, max, step, unit) =>
      '<label class="f"><span>' + label + '<b class="mono" data-out="' + name + '">' + val + unit + '</b></span><input type="range" data-k="' + name + '" data-unit="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></label>';
    const tog = (name, label, val, hint) =>
      '<div class="row" style="margin-top:12px"><span>' + label + (hint ? '<span class="hint" style="display:block;margin:2px 0 0">' + hint + '</span>' : '') + '</span><button type="button" class="tog" role="switch" data-k="' + name + '" aria-checked="' + (val ? 'true' : 'false') + '" aria-label="' + label + '"><i></i></button></div>';
    const accents = ['#D92D20', '#FF7A1A', '#F5C518', '#2BB673', '#2F8FFF', '#8B5CF6', '#E8E8E8'];
    const isImg = t.bgType === 'image';
    const isGrad = t.bgType === 'gradient';
    return '' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px">' +
      '<h2 id="stre-panel-t">Оформление</h2><button type="button" class="btn" data-act="close" aria-label="Закрыть">✕</button></div>' +
      '<div class="sec"><h3>Пресеты</h3><div class="presets">' + Object.keys(PRESETS).map((k) =>
        '<button type="button" class="preset" data-preset="' + k + '" aria-pressed="' + pressed(t.preset, k) + '"><span style="background:' + presetSwatch(PRESETS[k]) + '"></span>' + PRESETS[k].name + '</button>').join('') + '</div></div>' +
      '<div class="sec"><h3>Тема и цвет интерфейса</h3>' + seg('mode', t.mode, [['dark', 'Тёмная'], ['light', 'Светлая']]) +
      range('hue', 'Оттенок', t.hue, 0, 360, 1, '°') +
      range('sat', 'Насыщенность оттенка', t.sat, 0, 40, 1, '%') +
      '<p class="hint">При 0% интерфейс строго чёрно-белый. Текст остаётся контрастным при любом оттенке.</p></div>' +
      '<div class="sec"><h3>Акцентный цвет</h3><div class="row"><div style="display:flex;gap:8px;flex-wrap:wrap">' + accents.map((c) =>
        '<button type="button" class="sw" data-accent="' + c + '" aria-label="Акцент ' + c + '" aria-pressed="' + pressed(t.accent.toUpperCase(), c) + '" style="background:' + c + '"></button>').join('') +
      '</div><input type="color" data-k="accent" value="' + h(t.accent) + '" aria-label="Свой акцентный цвет"></div>' +
      tog('accentButtons', 'Акцент на основных кнопках', t.accentButtons, 'Иначе акцент только у статуса «В эфире» и опасных действий') + '</div>' +
      '<div class="sec"><h3>Фон</h3>' + seg('bgType', t.bgType, [['solid', 'Цвет'], ['gradient', 'Градиент'], ['image', 'Картинка']]) +
      (t.bgType === 'solid' ? '<div class="row" style="margin-top:12px"><span>Цвет фона</span><span style="display:flex;gap:8px;align-items:center"><input type="color" data-k="bgColor" value="' + h(t.bgColor || '#0A0A0A') + '" aria-label="Цвет фона"><button type="button" class="btn" data-act="bgauto">Авто</button></span></div>' : '') +
      (isGrad ? '<div class="row" style="margin-top:12px"><span>Цвета</span><span style="display:flex;gap:8px"><input type="color" data-k="g1" value="' + h(t.g1) + '" aria-label="Первый цвет градиента"><input type="color" data-k="g2" value="' + h(t.g2) + '" aria-label="Второй цвет градиента"></span></div>' + range('angle', 'Угол', t.angle, 0, 360, 5, '°') : '') +
      (isImg ? '<label class="drop" data-drop><input type="file" accept="image/*" data-file hidden><span>Перетащи картинку или <u>выбери файл</u></span><span class="hint">JPG, PNG, WebP. Сожмём до 1920 px</span></label>' +
        '<label class="f">Или ссылка на картинку<input type="url" data-url placeholder="https://…" value="' + (t.image && t.image.indexOf('data:') !== 0 ? h(t.image) : '') + '"></label>' +
        (t.image ? '<div class="thumb" style="background-image:url(&quot;' + h(t.image) + '&quot;)"></div>' : '') +
        range('blur', 'Размытие', t.blur, 0, 40, 2, ' px') : '') +
      (t.bgType !== 'solid' ? range('dim', 'Затемнение', Math.max(t.dim, t.dimMin || 0), t.dimMin || 0, 90, 1, '%') +
        (t.dimMin ? '<p class="hint">Минимум ' + t.dimMin + '% для этой картинки, иначе текст станет нечитаемым</p>' : '') : '') +
      '</div>' +
      '<div class="sec"><h3>Эффект</h3>' + seg('effect', t.effect, [['none', 'Нет'], ['stars', 'Звёзды'], ['grain', 'Зерно'], ['vignette', 'Виньетка']]) +
      (t.effect !== 'none' ? range('density', 'Интенсивность', t.density, 0, 100, 5, '%') : '') +
      '<p class="hint">Эффекты не мешают кликам и выключаются, если в системе включено «уменьшение движения».</p></div>' +
      '<div class="sec"><h3>Панели и текст</h3>' + range('panel', 'Плотность панелей', t.panel, 60, 100, 2, '%') +
      '<label class="f">Шрифт<select data-k="font">' + Object.keys(FONTS).map((f) => '<option' + (f === t.font ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></label>' +
      range('scale', 'Масштаб интерфейса', t.scale, 85, 125, 5, '%') + '</div>' +
      '<div class="sec" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="export">Скопировать тему</button><button type="button" class="btn" data-act="import">Вставить тему</button><button type="button" class="btn" data-act="reset">Сбросить</button><p class="hint" data-status style="width:100%">Сохраняется автоматически в этом браузере.</p></div>';
  }

  function rerenderPanel() {
    if (!panel) return;
    const scroll = panel.scrollTop;
    panel.innerHTML = panelHtml(theme);
    panel.scrollTop = scroll;
  }

  function status(msg) {
    const s = panel && panel.querySelector('[data-status]');
    if (s) s.textContent = msg;
  }

  function buildPanel() {
    panel = document.createElement('aside');
    panel.id = 'stre-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'stre-panel-t');
    panel.setAttribute('aria-modal', 'false');
    panel.hidden = true;
    document.body.appendChild(panel);
    rerenderPanel();

    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') return closePanel();
      if (b.dataset.preset) {
        const p = PRESETS[b.dataset.preset];
        set(Object.assign({}, DEFAULT, p, { preset: b.dataset.preset, image: theme.image, font: theme.font, scale: theme.scale }));
        return rerenderPanel();
      }
      if (b.dataset.accent) { set({ accent: b.dataset.accent }); return rerenderPanel(); }
      if (b.dataset.act === 'bgauto') { set({ bgColor: '' }); return rerenderPanel(); }
      if (b.dataset.act === 'reset') { window.StreTheme.reset(); return rerenderPanel(); }
      if (b.dataset.act === 'export') {
        const data = Object.assign({}, theme);
        if (data.image && data.image.indexOf('data:') === 0) data.image = '';
        const text = JSON.stringify(data);
        try { await navigator.clipboard.writeText(text); status('Тема скопирована (без загруженной картинки).'); }
        catch (err) { prompt('Скопируй тему:', text); }
        return;
      }
      if (b.dataset.act === 'import') {
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
      if (b.dataset.k && 'v' in b.dataset) {
        const k = b.dataset.k;
        const v = b.dataset.v;
        const patch = {}; patch[k] = v;
        if (k === 'mode' && theme.bgType === 'image' && theme.image) {
          set(patch);
          await setImage(theme.image);
        } else set(patch);
        return rerenderPanel();
      }
      if (b.classList.contains('tog')) {
        const p = {}; p[b.dataset.k] = !theme[b.dataset.k];
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
      if (el.dataset.k === 'font' || el.dataset.k === 'accent') rerenderPanel();
      if (el.matches('[data-file]') && el.files[0]) {
        status('Загружаем картинку…');
        try {
          const src = await compress(el.files[0]);
          await setImage(src);
          rerenderPanel();
          status(save(theme) ? 'Картинка сохранена.' : 'Картинка слишком большая для хранения в браузере, выбери поменьше.');
        } catch (err) { status('Не удалось открыть файл. Подойдут JPG, PNG или WebP.'); }
      }
      if (el.matches('[data-url]') && el.value.trim()) {
        status('Проверяем ссылку…');
        await setImage(el.value.trim());
        rerenderPanel();
        status('Готово. Если картинка не видна, ссылка закрыта для встраивания.');
      }
    });
    panel.addEventListener('dragover', (e) => {
      const d = e.target.closest('[data-drop]');
      if (d) { e.preventDefault(); d.classList.add('over'); }
    });
    panel.addEventListener('dragleave', (e) => {
      const d = e.target.closest('[data-drop]');
      if (d) d.classList.remove('over');
    });
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

  // Тема, изменённая в другой вкладке, применяется и здесь
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    theme = load();
    applyVars(theme);
    renderBackdrop(theme);
    rerenderPanel();
  });
})();

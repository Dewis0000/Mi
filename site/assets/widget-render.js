/* StreOps — отрисовка виджета для OBS (страница /w/?t=ТОКЕН&w=ВИДЖЕТ).
   Берёт настройки и живые данные с сервера (widget.data) каждые 2 секунды; таймер эфира тикает локально. */
(function () {
  'use strict';
  const W = window.StreWidgets;
  const qs = new URLSearchParams(location.search);
  const token = qs.get('t') || '';
  const id = qs.get('w') || '';
  const root = document.getElementById('w');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = W.fmtNum;
  const num = (v, def, min, max) => Math.max(min, Math.min(max, Number(v) || def));
  let cfg = null;
  let lastP = null;
  let cursor = 0;
  let primed = false;
  let chat = [];
  const alertQueue = [];
  let alertBusy = false;
  let animKey = 0;
  let skew = 0; // насколько часы OBS спешат относительно сервера, мс

  function merge(server) {
    const d = W.defaults(id);
    const s = server && typeof server === 'object' && !Array.isArray(server) ? server : {};
    return Object.assign({}, d, s, { content: Object.assign({}, d.content, (s.content && typeof s.content === 'object' && !Array.isArray(s.content)) ? s.content : {}) });
  }
  function clear() { root.innerHTML = ''; root.dataset.key = ''; }

  function place(c, html, visible) {
    if (!visible) { clear(); return; }
    const h = c.anchor[1], v = c.anchor[0];
    const pos = [];
    let tr = '';
    if (h === 'l') pos.push('left:' + c.x + 'px'); else if (h === 'r') pos.push('right:' + c.x + 'px'); else { pos.push('left:50%'); tr += 'translateX(-50%) '; }
    if (v === 't') pos.push('top:' + c.y + 'px'); else if (v === 'b') pos.push('bottom:' + c.y + 'px'); else { pos.push('top:50%'); tr += 'translateY(-50%) '; }
    const origin = (v === 't' ? 'top' : v === 'b' ? 'bottom' : 'center') + ' ' + (h === 'l' ? 'left' : h === 'r' ? 'right' : 'center');
    const anim = c.anim === 'none' ? 'none' : 'wa-' + c.anim + '-' + animKey + ' ' + c.dur + 'ms cubic-bezier(.16,1,.3,1) both';
    W.useFont(c.font);
    const wrap = 'position:fixed;' + pos.join(';') + ';transform:' + tr + 'scale(' + c.scale / 100 + ');transform-origin:' + origin;
    const box = W.vars(c) + ';width:' + c.width + 'px;animation:' + anim;
    const key = wrap + '|' + box;
    const inner = root.querySelector('.wbox');
    if (inner && root.dataset.key === key) { if (inner.innerHTML !== html) inner.innerHTML = html; return; }
    root.dataset.key = key;
    root.innerHTML = '<div style="' + wrap + '"><div class="wbox" style="' + box + '">' + html + '</div></div>';
  }

  const justify = (c) => (c.align === 'center' ? 'center' : c.align === 'right' ? 'flex-end' : 'flex-start');
  const bar = (c, pct, h) => {
    const fill = c.content.bar === 'hatch' ? 'repeating-linear-gradient(135deg,var(--w-acc) 0 8px,var(--w-acc-soft) 8px 14px)' : c.content.bar === 'gradient' ? 'linear-gradient(90deg,var(--w-acc-soft),var(--w-acc))' : 'var(--w-acc)';
    return '<div class="wbar" style="margin-top:.6em;height:' + num(h, 10, 2, 40) + 'px"><div style="height:100%;width:' + pct + '%;background:' + fill + ';transition:width .8s cubic-bezier(.16,1,.3,1)"></div></div>';
  };
  const stat = (label, value, cls) => '<div><div class="w2" style="font-size:.75em">' + label + '</div><div class="wnum ' + (cls || '') + '" style="font-size:1.4em;font-weight:600">' + value + '</div></div>';
  // данные игры свежие, если пришли за последние 2 минуты (игра шлёт heartbeat раз в 30 с)
  const fresh = (d, p) => d.gsi && d.updatedAt && (p.now || 0) - d.updatedAt < 120;

  function render(p) {
    const c = cfg;
    const d = p.data || {};
    const ct = c.content;
    switch (id) {
      case 'goal':
      case 'subgoal': {
        const cur = Number(d.current) || 0, tgt = Math.max(1, Number(ct.target) || 1);
        const pct = Math.max(0, Math.min(100, Math.round(cur / tgt * 100)));
        if (c.hideIdle && cur === 0) return place(c, '', false);
        return place(c, '<div class="wrow"><span style="font-weight:600">' + esc(ct.title) + '</span>' + (ct.pct ? '<span class="wnum wacc">' + pct + '%</span>' : '') + '</div>' +
          bar(c, pct, ct.barH) + '<div class="wnum w2" style="margin-top:.45em;font-size:.85em">' + fmt(cur) + ' / ' + fmt(tgt) + (id === 'goal' ? ' ₽' : '') + '</div>', true);
      }
      case 'chat': {
        const max = num(ct.max, 5, 1, 12);
        const life = (Number(ct.life) || 0) * 1000;
        const nowMs = Date.now() - skew;
        const rows = chat.filter((m) => !(ct.hideCmd && String(m.text).charAt(0) === '!') &&
          !(ct.hideBots && (/bot$/i.test(m.login) || W.BOTS.indexOf(String(m.login).toLowerCase()) >= 0)) &&
          (!life || nowMs - m.at * 1000 < life)).slice(-max);
        if (!rows.length) return place(c, '', false);
        return place(c, '<div style="display:flex;flex-direction:column;gap:.35em">' + rows.map((m) => {
          const b = m.badges || [];
          const badge = ct.badges ? (b.indexOf('broadcaster') >= 0 ? '★' : b.indexOf('moderator') >= 0 ? 'M' : b.indexOf('vip') >= 0 ? 'VIP' : (b.indexOf('subscriber') >= 0 || b.indexOf('founder') >= 0 ? 'S' : '')) : '';
          const nick = ct.nick === 'accent' ? 'var(--w-acc)' : ct.nick === 'platform' ? (/^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : 'var(--w-acc)') : 'var(--w-fg)';
          return '<div>' + (badge ? '<span class="w2" style="display:inline-block;padding:0 .3em;margin-right:.35em;border:1px solid var(--w-fg2);border-radius:.25em;font-size:.7em;vertical-align:.15em">' + badge + '</span>' : '') +
            '<b style="color:' + nick + '">' + esc(m.name || m.login) + '</b> ' + esc(m.text) + '</div>';
        }).join('') + '</div>', true);
      }
      case 'events': {
        const items = (d.items || []).slice(0, num(ct.count, 3, 1, 5));
        if (c.hideIdle && !items.length) return place(c, '', false);
        const what = { follow: 'фоллов', sub: 'подписка', resub: 'продление', gift: 'дарит подписки', raid: 'рейд', donation: 'донат' };
        return place(c, '<div class="wov" style="margin-bottom:.4em">Последние события</div>' + (items.length ? items.map((e) => {
          const x = e.data || {};
          const amount = e.type === 'donation' ? fmt(x.amount) + ' ₽' : e.type === 'raid' ? fmt(x.viewers) : e.type === 'resub' && x.months ? x.months + ' мес' : e.type === 'gift' && x.total ? '×' + x.total : '';
          return '<div class="wrow" style="padding:.25em 0"><span><b>' + esc(e.name || e.login) + '</b> <span class="w2">' + (what[e.type] || esc(e.type)) + '</span></span>' + (ct.amounts && amount ? '<span class="wnum wacc">' + amount + '</span>' : '') + '</div>';
        }).join('') : '<div class="w2">Пока пусто</div>'), true);
      }
      case 'topdon': {
        const items = (d.items || []).slice(0, num(ct.count, 3, 1, 5));
        if (c.hideIdle && !items.length) return place(c, '', false);
        const per = { stream: 'стрим', week: 'неделя', month: 'месяц' }[ct.period] || '';
        return place(c, '<div class="wov" style="margin-bottom:.4em">Топ донатеров · ' + per + '</div>' + (items.length ? items.map((t, i) =>
          '<div class="wrow" style="padding:.2em 0"><span><span class="wnum w2">' + (i + 1) + '.</span> ' + esc(t.username) + '</span><span class="wnum wacc">' + fmt(t.total) + ' ₽</span></div>').join('') : '<div class="w2">Пока нет донатов</div>'), true);
      }
      case 'np': {
        const s = d.current;
        if (!s) return place(c, c.hideIdle ? '' : '<div class="w2">Сейчас ничего не играет</div>', !c.hideIdle);
        const cover = ct.cover && /^[\w-]{6,20}$/.test(s.videoId || '') ? '<img src="https://i.ytimg.com/vi/' + s.videoId + '/mqdefault.jpg" alt="" style="flex:none;width:4.2em;height:3em;object-fit:cover;border-radius:calc(var(--w-rad) * .5)">' : '';
        return place(c, '<div style="display:flex;gap:.8em;align-items:center;justify-content:' + justify(c) + '">' + cover + '<div style="min-width:0"><div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.title) + '</div>' +
          (ct.requester && s.requester ? '<div class="w2" style="font-size:.85em">заказал ' + esc(s.requester) + '</div>' : '') + '</div></div>', true);
      }
      case 'queue': {
        const items = (d.items || []).slice(0, num(ct.count, 3, 1, 5));
        if (c.hideIdle && !items.length) return place(c, '', false);
        return place(c, '<div class="wov" style="margin-bottom:.4em">Дальше в очереди</div>' + (items.length ? items.map((q, i) =>
          '<div style="padding:.2em 0"><span class="wnum wacc">' + (i + 1) + '</span> ' + esc(q.title) + (ct.requester && q.requester ? ' <span class="w2">· ' + esc(q.requester) + '</span>' : '') + '</div>').join('') : '<div class="w2">Очередь пуста</div>'), true);
      }
      case 'uptime': {
        const st = p.stream || {};
        if (!st.live) return place(c, c.hideIdle ? '' : '<div class="wov">' + esc(ct.label) + '</div><div class="wnum w2" style="font-size:1.2em">не в эфире</div>', !c.hideIdle);
        const sec = Math.max(0, Math.floor((Date.now() - skew) / 1000) - st.startedAt);
        const hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
        const two = (n) => String(n).padStart(2, '0');
        const t = ct.format === 'hm' ? two(hh) + ':' + two(mm) : ct.format === 'words' ? (hh ? hh + ' ч ' : '') + mm + ' мин' : two(hh) + ':' + two(mm) + ':' + two(ss);
        return place(c, '<div class="wov">' + esc(ct.label) + '</div><div class="wnum wacc" style="font-size:1.4em;font-weight:600">' + t + '</div>', true);
      }
      case 'deaths':
        return place(c, '<div style="display:flex;align-items:baseline;gap:.6em;justify-content:' + justify(c) + '"><span class="w2">' + esc(ct.label) + '</span><span class="wnum wacc" style="font-size:2em;font-weight:700">' + fmt(d.value) + '</span></div>', true);
      case 'ticker': {
        const secs = Math.max(4, Math.round(String(ct.text || '').length * c.size * 0.55 / Math.max(10, Number(ct.speed) || 60)));
        return place(c, '<div style="overflow:hidden;white-space:nowrap"><div class="wtick" style="display:inline-block;animation:wa-ticker ' + secs + 's linear infinite">' + esc(ct.text) + '   ·   ' + esc(ct.text) + '   ·   </div></div>', true);
      }
      case 'faceit':
      case 'fmatch': {
        // нет ника, ник не найден или на сервере не задан ключ FACEIT API — на стриме ничего не показываем
        const f = d.faceit;
        if (!f) return place(c, '', false);
        const l5 = f.last5 || [];
        const sign = f.delta > 0 ? '▲ +' : f.delta < 0 ? '▼ ' : '';
        if (id === 'fmatch') {
          const w = l5.filter((r) => r === 'W').length;
          const cells = [ct.elo ? stat('ELO', fmt(f.elo), 'wacc') : '', ct.delta ? stat('За стрим', sign + f.delta) : '', ct.wl && l5.length ? stat('Матчи', w + 'W ' + (l5.length - w) + 'L') : ''].join('');
          return place(c, '<div class="wov" style="margin-bottom:.4em">' + esc(f.nick) + ' · FACEIT</div><div style="display:flex;gap:1.4em;justify-content:' + justify(c) + '">' + cells + '</div>', true);
        }
        const chips = l5.map((r) => '<span class="wnum" style="padding:0 .35em;border-radius:.2em;font-size:.75em;font-weight:700;' + (r === 'W' ? 'background:var(--w-acc);color:rgb(10 10 10)' : 'border:1px dashed var(--w-fg2)') + '">' + r + '</span>').join('');
        return place(c, '<div style="display:flex;gap:.9em;align-items:center;justify-content:' + justify(c) + '">' +
          (ct.level ? '<span class="wnum" style="flex:none;width:3em;height:3em;border-radius:999px;border:.22em solid var(--w-acc);border-right-color:var(--w-acc-soft);box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1em">' + esc(f.level) + '</span>' : '') +
          '<div>' + (ct.elo ? '<div class="wnum" style="font-size:1.6em;font-weight:600;line-height:1.1">' + fmt(f.elo) + ' <span class="w2" style="font-size:.5em">ELO</span></div>' : '') +
          (ct.delta ? '<div class="wnum wacc" style="font-size:.85em">' + (sign || '± ') + f.delta + ' за стрим</div>' : '') +
          (ct.last5 && chips ? '<div style="display:flex;gap:.25em;margin-top:.35em">' + chips + '</div>' : '') + '</div></div>', true);
      }
      case 'cs': {
        const g = d.gsi;
        if (!fresh(d, p) || !g.map) return place(c, '', false);
        const m = g.map;
        const ctS = (m.team_ct && m.team_ct.score) || 0, tS = (m.team_t && m.team_t.score) || 0;
        const sub = [ct.map ? String(m.name || '').replace(/^(de|cs|ar)_/, '') : '', ct.round ? 'раунд ' + ((Number(m.round) || 0) + 1) : ''].filter(Boolean).join(' · ');
        const ps = g.player && g.player.stats;
        const mine = ct.stats && ps ? '<div class="wnum" style="font-size:.85em;margin-top:.2em">K/D ' + (ps.kills || 0) + '/' + (ps.deaths || 0) + ' · MVP ' + (ps.mvps || 0) + '</div>' : '';
        return place(c, '<div class="wnum" style="font-size:1.9em;font-weight:600">CT ' + ctS + ' <span class="w2">:</span> <span class="wacc">' + tS + '</span> T</div>' + (sub ? '<div class="w2" style="font-size:.8em">' + esc(sub) + '</div>' : '') + mine, true);
      }
      case 'dota': {
        const g = d.gsi;
        if (!fresh(d, p) || !g.hero || !g.hero.name) return place(c, '', false);
        const hero = String(g.hero.name).replace('npc_dota_hero_', '').replace(/_/g, ' ');
        const pl = g.player || {};
        const cells = [ct.hero ? stat('Герой', '<span style="font-family:var(--w-font);font-size:.8em">' + esc(hero) + ' · ур. ' + esc(g.hero.level || 1) + '</span>') : '',
          ct.kda ? stat('K / D / A', (pl.kills || 0) + ' / ' + (pl.deaths || 0) + ' / ' + (pl.assists || 0), 'wacc') : '',
          ct.gpm ? stat('GPM / XPM', (pl.gpm || 0) + ' / ' + (pl.xpm || 0)) : ''].join('');
        return place(c, '<div style="display:flex;gap:1.4em;justify-content:' + justify(c) + '">' + cells + '</div>', true);
      }
      default: // голосование пока не готово, неизвестный виджет
        return place(c, '', false);
    }
  }

  // ---- алерты: очередь показов ----
  function playSound(vol) {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, a.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol / 100 * 0.3), a.currentTime + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + i * 0.12 + 0.35);
        o.connect(g); g.connect(a.destination); o.start(a.currentTime + i * 0.12); o.stop(a.currentTime + i * 0.12 + 0.4);
      });
    } catch (e) { /* без звука */ }
  }
  function showNextAlert() {
    if (alertBusy || !alertQueue.length || !cfg) return;
    const e = alertQueue.shift();
    const c = cfg, ct = c.content;
    const data = e.data || {};
    if (e.type === 'donation' && (Number(data.amount) || 0) < (Number(ct.minDonate) || 0)) { showNextAlert(); return; }
    alertBusy = true;
    animKey = 1 - animKey;
    place(c, '<div style="display:flex;gap:.9em;align-items:center;justify-content:' + justify(c) + '">' + (ct.image ? '<span style="flex:none;width:3.4em;height:3.4em;border-radius:calc(var(--w-rad) * .6);background:radial-gradient(circle at 35% 30%,var(--w-acc),var(--w-acc-soft))"></span>' : '') +
      '<div><div class="wov">' + esc(W.alertLabel(e)) + '</div><div style="font-size:1.8em;font-weight:700;line-height:1.15;color:var(--w-acc)">' + esc(e.name || e.login) + '</div><div class="w2">' + esc(W.alertText(ct, e)) + '</div></div></div>', true);
    if (c.sound) playSound(Number(c.vol) || 0);
    if (ct.tts && e.type === 'donation' && data.message && window.speechSynthesis) {
      try { const u = new SpeechSynthesisUtterance(String(data.message)); u.lang = 'ru-RU'; speechSynthesis.speak(u); } catch (err) { /* без озвучки */ }
    }
    setTimeout(() => { clear(); alertBusy = false; setTimeout(showNextAlert, 600); }, num(c.hold, 8, 2, 60) * 1000);
  }

  function after() {
    if (id === 'alerts') return primed ? (cursor || -1) : 0; // -1: событий до запуска не было, берём все новые
    if (id === 'chat') return cursor;
    return 0;
  }

  async function tick() {
    let p;
    try {
      const r = await fetch('/api/index.php?r=widget.data&t=' + encodeURIComponent(token) + '&w=' + encodeURIComponent(id) + '&after=' + after(), { cache: 'no-store', headers: { 'X-Requested-With': 'StreOps' } });
      p = await r.json();
    } catch (e) { return; } // сеть моргнула — попробуем в следующий раз
    if (!p || !p.ok) { clear(); return; }
    if (p.now) skew = Date.now() - p.now * 1000;
    const firstCfg = !cfg;
    cfg = merge(p.cfg);
    if (firstCfg) animKey = 1 - animKey;
    const d = p.data || {};
    if (id === 'alerts') {
      if (!primed) { primed = true; cursor = Number(d.cursor) || 0; return; }
      (d.items || []).forEach((e) => { cursor = Math.max(cursor, e.id); if (p.on) alertQueue.push(e); });
      if (!p.on) { alertQueue.length = 0; if (!alertBusy) clear(); return; }
      showNextAlert();
      return;
    }
    if (id === 'chat') {
      const del = d.deleted || [];
      const seen = {};
      chat.forEach((m) => { seen[m.id] = true; });
      (d.items || []).forEach((m) => { cursor = Math.max(cursor, m.id); if (!seen[m.id]) chat.push(m); });
      chat = chat.filter((m) => del.indexOf(m.msgId) < 0).slice(-30);
    }
    lastP = p;
    if (!p.on) { clear(); return; }
    render(p);
  }

  const every = { uptime: 10000, faceit: 15000, fmatch: 15000 }[id] || 2000;
  tick();
  setInterval(tick, every);
  if (id === 'uptime') setInterval(() => { if (lastP && lastP.on && cfg) render(lastP); }, 1000);
})();

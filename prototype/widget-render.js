/* StreOps — отрисовка виджета для OBS (страница /w/?t=ТОКЕН&w=ВИДЖЕТ).
   Берёт настройки и живые данные с сервера каждые 2 секунды. */
(function () {
  'use strict';
  const W = window.StreWidgets;
  const qs = new URLSearchParams(location.search);
  const token = qs.get('t') || '';
  const id = qs.get('w') || '';
  const root = document.getElementById('w');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let cfg = null;
  let cursor = 0;
  let chat = [];
  let alertQueue = [];
  let alertBusy = false;
  let last = null;
  let animKey = 0;

  function merge(server) {
    const d = W.defaults(id);
    return Object.assign({}, d, server || {}, { content: Object.assign({}, d.content, (server && server.content) || {}) });
  }

  function place(c, html, visible) {
    const h = c.anchor[1], v = c.anchor[0];
    const pos = [];
    let tr = '';
    if (h === 'l') pos.push('left:' + c.x + 'px'); else if (h === 'r') pos.push('right:' + c.x + 'px'); else { pos.push('left:50%'); tr += 'translateX(-50%) '; }
    if (v === 't') pos.push('top:' + c.y + 'px'); else if (v === 'b') pos.push('bottom:' + c.y + 'px'); else { pos.push('top:50%'); tr += 'translateY(-50%) '; }
    const origin = (v === 't' ? 'top' : v === 'b' ? 'bottom' : 'center') + ' ' + (h === 'l' ? 'left' : h === 'r' ? 'right' : 'center');
    const anim = c.anim === 'none' ? 'none' : 'wa-' + c.anim + '-' + animKey + ' ' + c.dur + 'ms cubic-bezier(.16,1,.3,1) both';
    W.useFont(c.font);
    if (!visible) { root.innerHTML = ''; root.dataset.key = ''; return; }
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
    return '<div class="wbar" style="margin-top:.6em;height:' + (h || 10) + 'px"><div style="height:100%;width:' + pct + '%;background:' + fill + ';transition:width .8s cubic-bezier(.16,1,.3,1)"></div></div>';
  };

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
        const max = Math.max(1, Math.min(12, Number(ct.max) || 5));
        const life = (Number(ct.life) || 0) * 1000;
        const nowMs = Date.now();
        const rows = chat.filter((m) => !(ct.hideCmd && m.text.charAt(0) === '!') && !(ct.hideBots && /bot$/i.test(m.login)) && (!life || nowMs - m.seen < life)).slice(-max);
        if (c.hideIdle && !rows.length) return place(c, '', false);
        return place(c, '<div style="display:flex;flex-direction:column;gap:.35em">' + rows.map((m) => {
          const badge = ct.badges ? (m.badges.indexOf('broadcaster') >= 0 ? '★' : m.badges.indexOf('moderator') >= 0 ? 'M' : m.badges.indexOf('vip') >= 0 ? 'VIP' : (m.badges.indexOf('subscriber') >= 0 ? 'S' : '')) : '';
          const nick = ct.nick === 'accent' ? 'var(--w-acc)' : ct.nick === 'platform' ? (m.color || 'var(--w-acc)') : 'var(--w-fg)';
          return '<div>' + (badge ? '<span class="w2" style="display:inline-block;padding:0 .3em;margin-right:.35em;border:1px solid var(--w-fg2);border-radius:.25em;font-size:.7em;vertical-align:.15em">' + badge + '</span>' : '') +
            '<b style="color:' + nick + '">' + esc(m.name) + '</b> ' + esc(m.text) + '</div>';
        }).join('') + '</div>', true);
      }
      case 'events': {
        const items = (d.items || []).slice(0, Math.max(1, Math.min(5, Number(ct.count) || 3)));
        if (c.hideIdle && !items.length) return place(c, '', false);
        const what = { follow: 'фоллов', sub: 'подписка', resub: 'подписка', gift: 'подарил подписки', raid: 'рейд', donation: 'донат' };
        return place(c, '<div class="wov" style="margin-bottom:.4em">Последние события</div>' + items.map((e) => {
          const amount = e.type === 'donation' ? fmt(e.data.amount) + ' ₽' : e.type === 'raid' ? fmt(e.data.viewers) : e.data.months ? e.data.months + ' мес' : '';
          return '<div class="wrow" style="padding:.25em 0"><span><b>' + esc(e.name) + '</b> <span class="w2">' + (what[e.type] || e.type) + '</span></span>' + (ct.amounts && amount ? '<span class="wnum wacc">' + amount + '</span>' : '') + '</div>';
        }).join(''), true);
      }
      case 'topdon': {
        const items = (d.items || []).slice(0, Math.max(1, Math.min(5, Number(ct.count) || 3)));
        if (c.hideIdle && !items.length) return place(c, '', false);
        const per = { stream: 'стрим', week: 'неделя', month: 'месяц' }[ct.period] || '';
        return place(c, '<div class="wov" style="margin-bottom:.4em">Топ донатеров · ' + per + '</div>' + (items.length ? items.map((t, i) =>
          '<div class="wrow" style="padding:.2em 0"><span><span class="wnum w2">' + (i + 1) + '.</span> ' + esc(t.username) + '</span><span class="wnum wacc">' + fmt(t.total) + ' ₽</span></div>').join('') : '<div class="w2">Пока нет донатов</div>'), true);
      }
      case 'np': {
        const s = d.current;
        if (!s) return place(c, c.hideIdle ? '' : '<div class="w2">Сейчас ничего не играет</div>', !c.hideIdle);
        return place(c, '<div style="font-weight:700">' + esc(s.title) + '</div>' + (ct.requester && s.requester ? '<div class="w2" style="font-size:.85em">заказал ' + esc(s.requester) + '</div>' : ''), true);
      }
      case 'queue': {
        const items = (d.items || []).slice(0, Math.max(1, Math.min(5, Number(ct.count) || 3)));
        if (c.hideIdle && !items.length) return place(c, '', false);
        return place(c, '<div class="wov" style="margin-bottom:.4em">Дальше в очереди</div>' + (items.length ? items.map((q, i) =>
          '<div style="padding:.2em 0"><span class="wnum wacc">' + (i + 1) + '</span> ' + esc(q.title) + (ct.requester ? ' <span class="w2">· ' + esc(q.requester) + '</span>' : '') + '</div>').join('') : '<div class="w2">Очередь пуста</div>'), true);
      }
      case 'uptime': {
        const st = p.stream || {};
        if (!st.live) return place(c, c.hideIdle ? '' : '<div class="wov">' + esc(ct.label) + '</div><div class="wnum w2" style="font-size:1.2em">не в эфире</div>', !c.hideIdle);
        const sec = Math.max(0, Math.floor(Date.now() / 1000) - st.startedAt);
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
        const f = d.faceit;
        if (!f) return place(c, '<div class="w2">FACEIT: ' + (ct.nick ? 'нет данных по нику ' + esc(ct.nick) : 'укажи ник в настройках виджета') + '</div>', !c.hideIdle);
        const l5 = (f.last5 || []).map((r) => '<span class="wnum" style="padding:0 .35em;border-radius:.2em;font-size:.75em;font-weight:700;' + (r === 'W' ? 'background:var(--w-acc);color:rgb(10 10 10)' : 'border:1px dashed var(--w-fg2)') + '">' + r + '</span>').join('');
        if (id === 'fmatch') {
          const w = (f.last5 || []).filter((r) => r === 'W').length;
          return place(c, '<div class="wov" style="margin-bottom:.4em">' + esc(f.nick) + ' · последние матчи</div><div style="display:flex;gap:1.4em;justify-content:' + justify(c) + '"><div><div class="w2" style="font-size:.75em">ELO</div><div class="wnum wacc" style="font-size:1.5em;font-weight:600">' + fmt(f.elo) + '</div></div><div><div class="w2" style="font-size:.75em">Матчи</div><div class="wnum" style="font-size:1.5em;font-weight:600">' + w + 'W ' + ((f.last5 || []).length - w) + 'L</div></div></div>', true);
        }
        const sign = f.delta > 0 ? '▲ +' : f.delta < 0 ? '▼ ' : '';
        return place(c, '<div style="display:flex;gap:.9em;align-items:center;justify-content:' + justify(c) + '">' +
          (ct.level ? '<span class="wnum" style="flex:none;width:3em;height:3em;border-radius:999px;border:.22em solid var(--w-acc);border-right-color:var(--w-acc-soft);box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1em">' + f.level + '</span>' : '') +
          '<div>' + (ct.elo ? '<div class="wnum" style="font-size:1.6em;font-weight:600;line-height:1.1">' + fmt(f.elo) + ' <span class="w2" style="font-size:.5em">ELO</span></div>' : '') +
          (ct.delta ? '<div class="wnum wacc" style="font-size:.85em">' + sign + f.delta + ' за стрим</div>' : '') +
          (ct.last5 && l5 ? '<div style="display:flex;gap:.25em;margin-top:.35em">' + l5 + '</div>' : '') + '</div></div>', true);
      }
      case 'cs': {
        const g = d.gsi;
        if (!g || !g.map) return place(c, c.hideIdle ? '' : '<div class="w2">Ждём данные из CS2</div>', !c.hideIdle);
        const ctS = (g.map.team_ct && g.map.team_ct.score) || 0, tS = (g.map.team_t && g.map.team_t.score) || 0;
        const sub = [ct.map ? String(g.map.name || '').replace(/^de_/, '') : '', ct.round ? 'раунд ' + ((g.map.round || 0) + 1) : ''].filter(Boolean).join(' · ');
        return place(c, '<div class="wnum" style="font-size:1.9em;font-weight:600">CT ' + ctS + ' <span class="w2">:</span> <span class="wacc">' + tS + '</span> T</div>' + (sub ? '<div class="w2" style="font-size:.8em">' + esc(sub) + '</div>' : ''), true);
      }
      case 'dota': {
        const g = d.gsi;
        if (!g || !g.hero || !g.hero.name) return place(c, c.hideIdle ? '' : '<div class="w2">Ждём данные из Dota 2</div>', !c.hideIdle);
        const hero = String(g.hero.name).replace('npc_dota_hero_', '').replace(/_/g, ' ');
        const pl = g.player || {};
        return place(c, '<div style="display:flex;gap:1.4em;justify-content:' + justify(c) + '"><div><div class="w2" style="font-size:.75em">Герой</div><div style="font-size:1.1em;font-weight:600">' + esc(hero) + ' · ур. ' + esc(g.hero.level) + '</div></div>' +
          '<div><div class="w2" style="font-size:.75em">K / D / A</div><div class="wnum wacc" style="font-size:1.3em;font-weight:600">' + (pl.kills || 0) + ' / ' + (pl.deaths || 0) + ' / ' + (pl.assists || 0) + '</div></div></div>', true);
      }
      case 'poll':
        return place(c, '<div style="font-weight:700;margin-bottom:.5em">' + esc(ct.q) + '</div><div class="w2">1. ' + esc(ct.a) + ' · 2. ' + esc(ct.b) + '</div><div class="w2" style="margin-top:.4em;font-size:.75em">Пиши 1 или 2 в чат</div>', true);
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
        g.gain.exponentialRampToValueAtTime(vol / 100 * 0.3, a.currentTime + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + i * 0.12 + 0.35);
        o.connect(g); g.connect(a.destination); o.start(a.currentTime + i * 0.12); o.stop(a.currentTime + i * 0.12 + 0.4);
      });
    } catch (e) { /* без звука */ }
  }
  function showNextAlert() {
    if (alertBusy || !alertQueue.length) return;
    const e = alertQueue.shift();
    const c = cfg, ct = c.content;
    if (e.type === 'donation' && (Number(e.data.amount) || 0) < (Number(ct.minDonate) || 0)) return showNextAlert();
    alertBusy = true;
    animKey = 1 - animKey;
    const label = { follow: 'Новый фолловер', sub: 'Новая подписка', resub: 'Подписка · ' + (e.data.months || 1) + ' мес', gift: 'Подарочные подписки', raid: 'Рейд · ' + fmt(e.data.viewers) + ' зрителей', donation: 'Донат · ' + fmt(e.data.amount) + ' ₽' }[e.type] || 'Событие';
    const text = e.type === 'donation' && e.data.message ? e.data.message : String(ct.tpl || '{name}').replace(/\{name\}/g, e.name);
    place(c, '<div style="display:flex;gap:.9em;align-items:center;justify-content:' + justify(c) + '">' + (ct.image ? '<span style="flex:none;width:3.4em;height:3.4em;border-radius:calc(var(--w-rad) * .6);background:radial-gradient(circle at 35% 30%,var(--w-acc),var(--w-acc-soft))"></span>' : '') +
      '<div><div class="wov">' + esc(label) + '</div><div style="font-size:1.8em;font-weight:700;line-height:1.15;color:var(--w-acc)">' + esc(e.name) + '</div><div class="w2">' + esc(text) + '</div></div></div>', true);
    if (c.sound) playSound(c.vol);
    if (ct.tts && e.type === 'donation' && e.data.message && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(e.data.message); u.lang = 'ru-RU'; speechSynthesis.speak(u);
    }
    setTimeout(() => { root.innerHTML = ''; alertBusy = false; setTimeout(showNextAlert, 600); }, (Number(c.hold) || 8) * 1000);
  }

  async function tick() {
    try {
      const r = await fetch('/api/index.php?r=widget.data&t=' + encodeURIComponent(token) + '&w=' + encodeURIComponent(id) + '&after=' + cursor, { cache: 'no-store' });
      const p = await r.json();
      if (!p.ok) { root.innerHTML = ''; return; }
      const firstCfg = !cfg;
      cfg = merge(p.cfg);
      if (!p.on) { root.innerHTML = ''; return; }
      if (id === 'alerts') {
        if (cursor === 0) cursor = p.data.cursor || 0;
        else (p.data.items || []).forEach((e) => { alertQueue.push(e); cursor = Math.max(cursor, e.id); });
        showNextAlert();
        return;
      }
      if (id === 'chat') {
        const del = p.data.deleted || [];
        (p.data.items || []).forEach((m) => { m.seen = Date.now(); chat.push(m); cursor = Math.max(cursor, m.id); });
        chat = chat.filter((m) => del.indexOf(m.msgId) < 0).slice(-30);
      }
      const sig = JSON.stringify([p.cfg, p.data, p.stream && p.stream.live, id === 'uptime' || id === 'chat' ? Date.now() : 0]);
      if (sig !== last || firstCfg) {
        if (firstCfg) animKey = 1 - animKey;
        last = sig;
        render(p);
      }
    } catch (e) { /* сеть моргнула — попробуем в следующий раз */ }
  }
  tick();
  setInterval(tick, id === 'uptime' ? 1000 : 2000);
})();

<?php
// OBS-оверлей розыгрыша: https://streops.ru/w/giveaway.php?t=ТОКЕН — источник «Браузер», 1920×1080.
// Сбор — плашка внизу; новый победитель — лента-рулетка с остановкой на нём и карточка ~12 с; нет розыгрыша — пусто.
// Необязательно: &bg=dark | &bg=green — непрозрачный фон (для захвата окна или хромакея).
$bg = (string)($_GET['bg'] ?? '');
$bgCss = $bg === 'dark' ? '#0A0A0A' : ($bg === 'green' ? '#00B140' : 'transparent');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>StreOps · розыгрыш</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;700&amp;display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:<?= $bgCss ?>;overflow:hidden;width:1920px;height:1080px}
body{font-family:'Onest',system-ui,sans-serif;color:#F2F2F2;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
.glass{background:rgba(10,10,10,.62);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 60px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.10)}
.ov{font-size:15px;line-height:18px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#B4B4B4}
.hide{opacity:0!important;pointer-events:none}

/* плашка сбора */
#plaque{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);display:flex;align-items:center;gap:36px;padding:22px 32px;border-radius:20px;max-width:1500px;transition:opacity .4s,transform .4s}
#plaque.hide{transform:translate(-50%,24px)}
#plaque .ic{width:56px;height:56px;flex:none;fill:none;stroke:#F2F2F2;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
#p-prize{margin-top:4px;font-size:34px;line-height:40px;font-weight:700;max-width:640px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sep{width:1px;align-self:stretch;background:rgba(255,255,255,.14)}
#p-how{font-size:24px;line-height:30px;color:#DCDCDC;white-space:nowrap}
#p-how b{display:inline-block;margin-left:6px;padding:4px 12px;border-radius:8px;background:#F2F2F2;color:#0A0A0A;font-weight:700}
.num{font-size:44px;line-height:48px;font-weight:700}
.cap{font-size:15px;color:#B4B4B4;margin-top:2px}
#p-count.bump{animation:bump .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes bump{40%{transform:scale(1.18)}}
#p-last{font-size:15px;color:#8F8F8F;margin-top:2px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* рулетка */
#roll{position:fixed;left:0;right:0;top:50%;height:420px;margin-top:-210px;transition:opacity .5s}
#roll .band{position:absolute;left:0;right:0;top:56px;height:308px;border-radius:0;border-left:0;border-right:0;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 16%,#000 84%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 16%,#000 84%,transparent 100%)}
#r-title{position:absolute;left:0;right:0;top:0;text-align:center}
#r-title div{display:inline-block;padding:10px 22px;border-radius:999px;font-size:20px;font-weight:600}
#strip{position:absolute;left:960px;top:86px;display:flex;gap:16px;will-change:transform}
.card{flex:none;width:200px;height:248px;box-sizing:border-box;border-radius:14px;background:rgba(23,23,23,.92);border:1px solid #3A3A3A;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;position:relative;overflow:hidden}
.card .bar{position:absolute;left:0;right:0;top:0;height:4px}
.card .nick{font-size:21px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .role{font-size:15px;color:#8F8F8F}
.card.win{border:2px solid #F2F2F2;background:#1F1F1F;box-shadow:0 0 40px rgba(255,255,255,.25)}
.av{border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#0A0A0A;flex:none}
.card .av{width:88px;height:88px;font-size:28px}
#ptr{position:absolute;left:959px;top:62px;width:2px;height:296px;background:#F2F2F2;box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 18px rgba(255,255,255,.6)}
#ptr:before,#ptr:after{content:'';position:absolute;left:-11px;width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent}
#ptr:before{top:-4px;border-top:16px solid #F2F2F2}
#ptr:after{bottom:-4px;border-bottom:16px solid #F2F2F2}

/* карточка победителя */
#win{position:fixed;left:50%;top:50%;width:820px;margin-left:-410px;transform:translateY(-50%);text-align:center;padding:48px 40px 44px;box-sizing:border-box;border-radius:28px;transition:opacity .6s}
#win.show{animation:pop .9s cubic-bezier(.16,1,.3,1) both}
@keyframes pop{0%{opacity:0;transform:translateY(-50%) scale(.6)}60%{opacity:1;transform:translateY(-50%) scale(1.04)}100%{transform:translateY(-50%) scale(1)}}
#win:before{content:'';position:absolute;inset:-2px;border-radius:30px;background:radial-gradient(600px 260px at 50% 0%,rgba(255,255,255,.16),transparent 70%);pointer-events:none}
#w-av{margin-top:26px;width:160px;height:160px;font-size:52px;box-shadow:0 0 0 4px #0A0A0A,0 0 0 8px #F2F2F2,0 0 60px rgba(255,255,255,.35)}
#w-name{margin:26px 0 0;font-size:76px;line-height:84px;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere}
#w-prize{margin:12px 0 0;font-size:28px;line-height:36px;color:#DCDCDC}
#w-meta{margin:14px 0 0;font-size:20px;color:#8F8F8F}

/* итог после карточки */
#after{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);padding:16px 28px;border-radius:16px;font-size:24px;line-height:30px;white-space:nowrap;max-width:1500px;overflow:hidden;text-overflow:ellipsis;transition:opacity .4s}
#after span{color:#B4B4B4}
</style>
</head>
<body>
<div id="plaque" class="glass hide" aria-live="polite">
<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zM12 8c2-4 6-4 6-1s-6 1-6 1z"/></svg>
<div><div class="ov">Розыгрыш</div><div id="p-prize"></div></div>
<div class="sep"></div>
<div id="p-how"></div>
<div class="sep"></div>
<div><div class="num mono" id="p-count">0</div><div class="cap" id="p-word">участников</div><div id="p-last"></div></div>
<div class="sep" id="p-sep2"></div>
<div id="p-timer-box"><div class="num mono" id="p-timer">0:00</div><div class="cap" id="p-tcap">до конца сбора</div></div>
</div>

<div id="roll" class="hide" aria-hidden="true">
<div class="band glass"></div>
<div id="r-title"><div class="glass" id="r-text">Выбираем победителя</div></div>
<div id="strip"></div>
<div id="ptr"></div>
</div>

<div id="win" class="glass hide" role="status" aria-live="polite">
<div class="ov" id="w-title">Победитель</div>
<span class="av" id="w-av"></span>
<p id="w-name"></p>
<p id="w-prize"></p>
<p id="w-meta" class="mono"></p>
</div>

<div id="after" class="glass hide"></div>

<script>
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var token = qs.get('t') || '';
  var $ = function (id) { return document.getElementById(id); };
  var PITCH = 216, HALF = 100, STOP = 52, SPIN_MS = 7000, CARD_MS = 12000;
  var gw = null, skew = 0, seen = null, gid = 0, queue = [], busy = false, lastCount = -1, cardUntil = 0;

  function ini(n) { return (String(n || '?').replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').slice(0, 2) || '?').toUpperCase(); }
  function shade(login) { var h = 0, s = String(login || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'linear-gradient(135deg,' + ['#F2F2F2', '#DCDCDC', '#B4B4B4', '#8F8F8F'][h % 4] + ',#2A2A2A)'; }
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; }
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function key(w) { return w.id + ':' + w.round; }
  function now() { return Date.now() / 1000 + skew; }
  function pct(x) { return String(Math.round((Number(x) || 0) * 100) / 100).replace('.', ',') + '%'; }
  function show(id, on) { $(id).classList.toggle('hide', !on); }
  function txt(id, v) { var el = $(id); if (el.textContent !== v) el.textContent = v; }

  function card(p, win) {
    var c = document.createElement('div');
    c.className = 'card' + (win ? ' win' : '');
    var bar = document.createElement('span'); bar.className = 'bar';
    bar.style.background = p.role === 'подписчик' ? '#F2F2F2' : (p.role === 'VIP' ? 'repeating-linear-gradient(90deg,#F2F2F2 0 8px,transparent 8px 14px)' : '#3A3A3A');
    var av = document.createElement('span'); av.className = 'av'; av.style.background = shade(p.login); av.textContent = ini(p.name);
    var nick = document.createElement('span'); nick.className = 'nick'; nick.textContent = p.name;
    var role = document.createElement('span'); role.className = 'role'; role.textContent = p.role || '';
    c.append(bar, av, nick, role);
    return c;
  }

  // ---- сбор: плашка ----
  function renderPlaque() {
    var collecting = gw && (gw.status === 'collecting' || gw.status === 'closed');
    show('plaque', !!collecting && !busy);
    var after = gw && gw.status === 'drawing' && gw.winners.length && !busy && Date.now() > cardUntil;
    if (after) {
      var names = gw.winners.map(function (w) { return w.name; }).join(', ');
      $('after').innerHTML = '';
      var s = document.createElement('span'); s.textContent = 'Розыгрыш «' + gw.prize + '» · ' + (gw.winners.length > 1 ? 'победители: ' : 'победитель: ');
      $('after').append(s, document.createTextNode(names));
    }
    show('after', !!after);
    if (!collecting) return;
    txt('p-prize', gw.prize);
    var how = $('p-how');
    var kw = gw.rules && gw.rules.entry === 'active' ? null : gw.keyword;
    var sig = kw === null ? 'active' : 'kw:' + kw;
    if (how.dataset.sig !== sig) {
      how.dataset.sig = sig; how.textContent = '';
      if (kw === null) how.textContent = 'Пиши что угодно в чат';
      else { how.append(document.createTextNode('Пиши в чат')); var b = document.createElement('b'); b.className = 'mono'; b.textContent = kw; how.append(b); }
    }
    var n = gw.count | 0;
    txt('p-count', String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
    txt('p-word', plural(n, ['участник', 'участника', 'участников']));
    if (lastCount >= 0 && n > lastCount) { var pc = $('p-count'); pc.classList.remove('bump'); void pc.offsetWidth; pc.classList.add('bump'); }
    lastCount = n;
    var lastE = gw.entries && gw.entries[0];
    txt('p-last', lastE ? 'только что: ' + lastE.name : '');
    var hasT = gw.endsAt > 0;
    $('p-timer-box').style.display = hasT ? '' : 'none';
    $('p-sep2').style.display = hasT ? '' : 'none';
    if (hasT) {
      var left = gw.endsAt - now();
      var closed = gw.status === 'closed' || left <= 0;
      txt('p-timer', closed ? '0:00' : mmss(left));
      txt('p-tcap', closed ? 'сбор закрыт' : 'до конца сбора');
    }
  }

  // ---- выбор: рулетка → карточка ----
  function play(w, g) {
    busy = true;
    renderPlaque();
    show('win', false);
    var pool = (g.entries || []).filter(function (e) { return e.login !== w.login; });
    var strip = $('strip');
    strip.textContent = '';
    for (var k = 0; k < 60; k++) {
      var p = k === STOP ? { login: w.login, name: w.name, role: w.role } : (pool.length ? pool[Math.floor(Math.random() * pool.length)] : { login: w.login, name: w.name, role: w.role });
      strip.appendChild(card(p, false));
    }
    txt('r-text', 'Выбираем победителя · ' + g.prize);
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(' + (-(5 * PITCH + HALF)) + 'px)';
    show('roll', true);
    void strip.offsetWidth;
    var jitter = Math.round((Math.random() - 0.5) * 150);
    requestAnimationFrame(function () {
      strip.style.transition = 'transform ' + SPIN_MS + 'ms cubic-bezier(.08,.62,.12,1)';
      strip.style.transform = 'translateX(' + (-(STOP * PITCH + HALF + jitter)) + 'px)';
    });
    setTimeout(function () {
      strip.children[STOP].classList.add('win');
      setTimeout(function () {
        show('roll', false);
        reveal(w, g);
      }, 900);
    }, SPIN_MS + 100);
  }
  function reveal(w, g) {
    var n = g.winners.length, idx = -1;
    for (var i = 0; i < n; i++) if (key(g.winners[i]) === key(w)) idx = i;
    txt('w-title', g.winnersCount > 1 && idx >= 0 ? 'Победитель ' + (idx + 1) + ' из ' + g.winnersCount : 'Победитель');
    $('w-av').style.background = shade(w.login);
    txt('w-av', ini(w.name));
    txt('w-name', w.name);
    txt('w-prize', 'выигрывает «' + g.prize + '»');
    txt('w-meta', (w.role || '') + ' · шанс ' + pct(w.chance));
    var el = $('win');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    show('win', true);
    cardUntil = Date.now() + CARD_MS;
    setTimeout(function () { show('win', false); busy = false; next(); renderPlaque(); }, CARD_MS);
  }
  function next() {
    if (busy || !queue.length) return;
    var it = queue.shift();
    play(it.w, it.g);
  }
  function reset() {
    queue = []; busy = false; cardUntil = 0; lastCount = -1;
    show('roll', false); show('win', false); show('after', false); show('plaque', false);
  }

  function apply(g) {
    if (!g || g.status === 'cancelled') { if (gw) reset(); gw = null; seen = null; gid = 0; return; }
    if (g.id !== gid) { reset(); gid = g.id; seen = null; }
    gw = g;
    var ws = g.winners || [];
    if (seen === null) { // первый ответ: старых победителей не крутим, свежего показываем карточкой
      seen = {};
      ws.forEach(function (w) { seen[key(w)] = 1; });
      var last = ws[ws.length - 1];
      if (last && now() - last.at < 10) reveal(last, g), busy = true;
    } else {
      ws.forEach(function (w) { if (!seen[key(w)]) { seen[key(w)] = 1; queue.push({ w: w, g: g }); } });
      next();
    }
    renderPlaque();
  }

  function poll() {
    if (!token) return;
    fetch('/api/index.php?r=widget.data&t=' + encodeURIComponent(token) + '&w=giveaway', { credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { if (gw) reset(); gw = null; return; }
        if (j.now) skew = j.now - Date.now() / 1000;
        apply(j.data && j.data.giveaway);
      })
      .catch(function () { /* нет связи — повторим */ });
  }
  poll();
  setInterval(poll, 1500);
  setInterval(function () { if (gw) renderPlaque(); }, 1000);
})();
</script>
</body>
</html>

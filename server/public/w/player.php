<?php
// Плеер музыки для OBS: https://streops.ru/w/player.php?t=ТОКЕН — источник «Браузер» (1920×1080, «Управлять звуком через OBS»).
// Чистая страница: берёт текущий трек из /api/index.php?r=widget.data&w=np каждые 3 с, играет его через YouTube IFrame API,
// по окончании просит следующий (player.next). &ui=0 — без плашки «Сейчас играет», только звук.
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>StreOps · плеер музыки</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&amp;display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:transparent;overflow:hidden;width:100%;height:100%}
body{font-family:'Onest',system-ui,sans-serif;color:#F2F2F2}
#yt{position:fixed;left:0;top:0;width:320px;height:180px;opacity:0;pointer-events:none}
#yt.show{opacity:1;pointer-events:auto;z-index:3}
#np{position:fixed;left:24px;bottom:24px;display:flex;align-items:center;gap:14px;max-width:560px;box-sizing:border-box;padding:12px 18px 12px 12px;border-radius:12px;
  background:rgba(10,10,10,.78);border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 32px -8px rgba(0,0,0,.6);
  opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s}
#np.on{opacity:1;transform:none}
#np .cv{width:56px;height:56px;flex:none;border-radius:8px;background:#1F1F1F center/cover no-repeat}
#np .tx{min-width:0;flex:1}
#np .ov{font-size:11px;line-height:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:#8F8F8F}
#np .t{margin-top:2px;font-size:18px;line-height:24px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#np .r{font-size:14px;line-height:18px;color:#B4B4B4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#np .bar{margin-top:8px;height:3px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
#np .bar i{display:block;height:100%;width:0;background:#F2F2F2;transition:width 1s linear}
#msg{position:fixed;left:24px;top:24px;display:none;max-width:520px;padding:14px 18px;border-radius:10px;background:rgba(10,10,10,.86);border:2px solid #F2F2F2;font-size:16px;line-height:22px;cursor:pointer}
#msg.on{display:block}
</style>
</head>
<body>
<div id="yt"><div id="yt-player"></div></div>
<div id="np" aria-live="polite"><div class="cv"></div><div class="tx"><div class="ov">Сейчас играет</div><div class="t"></div><div class="r"></div><div class="bar"><i></i></div></div></div>
<div id="msg" role="alert"></div>
<script>
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var token = qs.get('t') || '';
  var showUi = qs.get('ui') !== '0';
  var API = '/api/index.php?r=';
  var np = document.getElementById('np'), msg = document.getElementById('msg'), ytBox = document.getElementById('yt');
  var player = null, ready = false;
  var playingId = 0, current = null, queued = 0, volume = 70, appliedVol = -1;
  var gen = 0, advancing = false, polling = false, errCount = 0, holdUntil = 0, blockTimer = null, fatal = false;

  function say(text, clickable) {
    msg.textContent = text || '';
    msg.className = text ? 'on' : '';
    msg.style.cursor = clickable ? 'pointer' : 'default';
  }

  function plate() {
    if (!showUi || !current) { np.className = ''; return; }
    np.querySelector('.cv').style.backgroundImage = "url('https://i.ytimg.com/vi/" + current.videoId + "/mqdefault.jpg')";
    np.querySelector('.t').textContent = current.title;
    np.querySelector('.r').textContent = current.requester ? 'заказал ' + current.requester : '';
    np.className = 'on';
  }

  function api(route, body) {
    var opts = { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'StreOps' } };
    var url = API + route;
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    else url += '&t=' + encodeURIComponent(token) + '&w=np';
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (j) {
        if (res.status === 404) { fatal = true; throw new Error('Плеер не найден: проверь ссылку в панели StreOps (раздел «Музыка»).'); }
        if (!j || !j.ok) throw new Error((j && j.error) || 'Сервер ответил с ошибкой (' + res.status + ')');
        return j;
      });
    });
  }

  // ---------- YouTube ----------
  function loadYT() {
    window.onYouTubeIframeAPIReady = makePlayer;
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () { say('Не загрузился YouTube. Проверь интернет — попробуем снова через минуту.'); setTimeout(function () { location.reload(); }, 60000); };
    document.head.appendChild(s);
  }

  function makePlayer() {
    player = new YT.Player('yt-player', {
      width: '320', height: '180',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: function () { ready = true; sync(); },
        onStateChange: function (e) { onState(e.data); },
        onError: function (e) { onError(e.data); },
        onAutoplayBlocked: blocked
      }
    });
  }

  function blocked() {
    // в OBS автозапуск разрешён; в обычном браузере звук включится только после клика
    ytBox.className = 'show';
    say('Браузер не даёт включить звук без клика. Нажми сюда или на видео. В OBS такого не бывает.', true);
  }
  msg.addEventListener('click', function () { if (player && ready && playingId) { player.playVideo(); } });

  function play(song) {
    playingId = song.id;
    current = song;
    plate();
    try { player.loadVideoById(song.videoId); player.unMute(); player.setVolume(volume); appliedVol = volume; } catch (e) { /* ещё не готов */ }
    clearTimeout(blockTimer);
    blockTimer = setTimeout(function () {
      if (playingId !== song.id || !player.getPlayerState) return;
      var st = player.getPlayerState();
      if (st === -1 || st === 5) blocked();
    }, 7000);
  }

  function idle() {
    playingId = 0;
    current = null;
    clearTimeout(blockTimer);
    try { player.stopVideo(); } catch (e) { /* нет плеера */ }
    plate();
  }

  function onState(st) {
    if (st === 0) { if (playingId) advance(playingId); return; }   // доиграл
    if (st === 1) { errCount = 0; ytBox.className = ''; if (!fatal) say(''); }
  }

  function onError(code) {
    if (!playingId) return;
    errCount++;
    var id = playingId;
    if (errCount >= 3) { // несколько ошибок подряд — скорее всего, пропал интернет: не листаем всю очередь
      holdUntil = Date.now() + 20000;
      setTimeout(function () { if (playingId === id) advance(id); }, 20000);
      return;
    }
    advance(id);
  }

  // трек доиграл или очередь ждёт запуска: сервер переключит, только если finished — текущий трек
  function advance(finished) {
    if (advancing || !ready) return;
    advancing = true;
    gen++;
    api('player.next', { t: token, finished: finished }).then(function (j) {
      if (typeof j.volume === 'number') volume = j.volume;
      if (j.current) play(j.current); else idle();
    }).catch(function (e) {
      if (fatal) say(e.message);
    }).then(function () { advancing = false; gen++; });
  }

  function sync() {
    if (!ready || advancing || fatal) return;
    if (appliedVol !== volume) { try { player.setVolume(volume); appliedVol = volume; } catch (e) { /* позже */ } }
    if (current && current.id !== playingId) play(current);
    else if (!current && playingId) idle();
    else if (!current && !playingId && queued > 0 && Date.now() > holdUntil) advance(0);
    else if (current) plate();
  }

  function poll() {
    if (polling || fatal) return;
    polling = true;
    var g = gen;
    api('widget.data').then(function (j) {
      if (g !== gen) return; // пока опрос шёл, плеер сам переключил трек — этот ответ устарел
      var d = j.data || {};
      current = d.current || null;
      queued = Number(d.queued) || 0;
      if (typeof d.volume === 'number') volume = d.volume;
      if (!msg.textContent || /связи|ошибк/i.test(msg.textContent)) say('');
      sync();
    }).catch(function (e) {
      say(fatal ? e.message : 'Нет связи с StreOps: ' + e.message + ' Пробуем снова.');
    }).then(function () { polling = false; });
  }

  function tick() {
    if (!showUi || !ready || !playingId || !player.getCurrentTime) return;
    var len = player.getDuration() || (current && current.duration) || 0;
    var pct = len ? Math.min(100, player.getCurrentTime() / len * 100) : 0;
    np.querySelector('.bar i').style.width = pct.toFixed(1) + '%';
  }

  if (!token) { say('В ссылке нет ключа плеера. Скопируй ссылку в панели StreOps, раздел «Музыка».'); return; }
  loadYT();
  poll();
  setInterval(poll, 3000);
  setInterval(tick, 1000);
})();
</script>
</body>
</html>

<?php
// Плеер музыки для OBS: https://streops.ru/w/player.php?t=ТОКЕН — источник «Браузер» (1920×1080, «Управлять звуком через OBS»).
// Берёт текущий трек из /api/index.php?r=widget.data&w=np каждые 3 с. Что играть — решает сам плеер:
//   1) трек есть в «Моей музыке» стримера — играем файл (YouTube не нужен вовсе);
//   2) YouTube открывается — играем YouTube через IFrame API;
//   3) YouTube не открывается (блокировка у зрителя или стримера) — играем запасной трек из «Моей музыки», очередь ждёт;
//      если YouTube не вернулся 10 минут и своей музыки нет — трек снимаем с причиной, баллы возвращаются.
// Проверка YouTube — раз в 45 с, так что после включения VPN плеер сам вернётся к очереди. &ui=0 — без плашки «Сейчас играет».
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');
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
#yt.show{left:24px;top:120px;opacity:1;pointer-events:auto;z-index:3}
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
  var RETRY_MS = 45000;        // как часто снова проверяем YouTube, пока он не открывается
  var YT_WAIT_MS = 12000;      // сколько ждём загрузки YouTube, прежде чем считать его недоступным
  var GIVE_UP_MS = 600000;     // YouTube недоступен это время и своей музыки нет — трек снимаем
  var np = document.getElementById('np'), msg = document.getElementById('msg'), ytBox = document.getElementById('yt');
  var audio = new Audio();
  audio.preload = 'auto';

  var player = null, ready = false, ytLoading = false, ytScript = null, retryTimer = null, blockTimer = null;
  var ytState = 'unknown';     // unknown | ok | blocked
  var blockedAt = 0;
  var mode = 'idle';           // idle | yt | audio | filler | wait
  var playingId = 0, current = null, queued = 0, volume = 70, appliedVol = -1, fillerTitle = '';
  var gen = 0, advancing = false, polling = false, errCount = 0, holdUntil = 0, fatal = false, fillerBusy = false;

  function say(text, clickable) {
    msg.textContent = text || '';
    msg.className = text ? 'on' : '';
    msg.style.cursor = clickable ? 'pointer' : 'default';
  }

  // Плашка: для своей музыки и YouTube — текущий трек, для запасного эфира — отдельная подпись
  function plate(title, requester, thumb, label) {
    if (!showUi || (!title && !current)) { np.className = ''; return; }
    var t = title || (current && current.title) || '';
    np.querySelector('.ov').textContent = label || 'Сейчас играет';
    np.querySelector('.cv').style.backgroundImage = thumb ? "url('" + thumb + "')" : 'none';
    np.querySelector('.t').textContent = t;
    np.querySelector('.r').textContent = requester !== undefined ? requester : (current && current.requester ? 'заказал ' + current.requester : '');
    np.className = 'on';
  }

  function readJson(res) {
    return res.json().catch(function () { return null; }).then(function (j) {
      if (res.status === 404) { fatal = true; throw new Error('Плеер не найден: проверь ссылку в панели StreOps (раздел «Музыка»).'); }
      if (!j || !j.ok) throw new Error((j && j.error) || 'Сервер ответил с ошибкой (' + res.status + ')');
      return j;
    });
  }
  function apiGet(route, params) {
    return fetch(API + route + '&t=' + encodeURIComponent(token) + (params || ''), { credentials: 'same-origin', headers: { 'X-Requested-With': 'StreOps' } }).then(readJson);
  }
  function apiPost(route, body) {
    return fetch(API + route, { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'StreOps', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(readJson);
  }

  // ---------- YouTube: проверяем, открывается ли он ----------
  function setYt(state) {
    ytState = state;
    if (state === 'ok') {
      blockedAt = 0;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (mode === 'filler' || mode === 'wait') say('');
    } else {
      if (!blockedAt) blockedAt = Date.now();
      if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; loadYT(); }, RETRY_MS);
    }
    sync();
  }

  function loadYT() {
    if (ytLoading) return;
    if (window.YT && YT.Player) { makePlayer(); return; }
    ytLoading = true;
    window.onYouTubeIframeAPIReady = makePlayer;
    if (ytScript && ytScript.parentNode) ytScript.parentNode.removeChild(ytScript);
    ytScript = document.createElement('script');
    ytScript.src = 'https://www.youtube.com/iframe_api';
    ytScript.onerror = function () { ytLoading = false; setYt('blocked'); };
    document.head.appendChild(ytScript);
    setTimeout(function () { if (!ready && ytLoading) { ytLoading = false; setYt('blocked'); } }, YT_WAIT_MS);
  }

  function makePlayer() {
    ytLoading = false;
    ytBox.innerHTML = '<div id="yt-player"></div>';
    player = new YT.Player('yt-player', {
      width: '320', height: '180',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: function () { ready = true; setYt('ok'); },
        onStateChange: function (e) { onState(e.data); },
        onError: function (e) { onError(e.data); },
        onAutoplayBlocked: autoplayBlocked
      }
    });
  }

  function autoplayBlocked() {
    // в OBS автозапуск разрешён; в обычном браузере звук включится только после клика
    ytBox.className = 'show';
    say('Браузер не даёт включить звук без клика. Нажми сюда или на видео. В OBS такого не бывает.', true);
  }
  msg.addEventListener('click', function () {
    if (mode === 'yt' && player && ready) { try { player.playVideo(); } catch (e) { /* плеер ещё не готов */ } }
    else if (mode === 'audio' || mode === 'filler') audio.play().catch(function () { /* браузер ещё не дал звук */ });
  });

  function onState(st) {
    if (st === 0) { if (mode === 'yt' && playingId) advance(playingId); return; }   // доиграл
    if (st === 1) { errCount = 0; ytBox.className = ''; if (!fatal && mode === 'yt') say(''); }
  }

  function onError(code) {
    if (mode !== 'yt' || !playingId) return;
    errCount++;
    var id = playingId;
    if (errCount >= 3) { // несколько ошибок подряд — скорее всего, пропал интернет: не листаем всю очередь
      holdUntil = Date.now() + 20000;
      setTimeout(function () { if (playingId === id) advance(id, code); }, 20000);
      return;
    }
    advance(id, code);
  }

  function stopYT() {
    clearTimeout(blockTimer);
    if (player && ready) { try { player.stopVideo(); } catch (e) { /* плеер не готов */ } }
  }
  function stopAudio() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  // ---------- что играть сейчас ----------
  function sync() {
    if (fatal || advancing) return;
    if (player && ready && appliedVol !== volume) { try { player.setVolume(volume); appliedVol = volume; } catch (e) { /* позже */ } }
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    if (!current) {
      if (mode !== 'idle') { stopYT(); stopAudio(); mode = 'idle'; playingId = 0; plate(); }
      if (queued > 0 && Date.now() > holdUntil && !playingId) advance(0);
      return;
    }
    if (current.audio) return playAudio(current);
    if (ytState === 'ok') return playYouTube(current);
    if (ytState === 'unknown') return; // ждём первой проверки YouTube
    return playFiller();
  }

  function playAudio(song) {
    if (mode === 'audio' && playingId === song.id) return;
    stopYT();
    playingId = song.id;
    mode = 'audio';
    audio.src = song.audio.url;
    audio.play().catch(function () { say('Браузер не дал включить звук. Нажми сюда.', true); });
    plate();
  }

  function playYouTube(song) {
    if (!ready || !player) return;
    if (mode === 'yt' && playingId === song.id) return;
    stopAudio();
    playingId = song.id;
    mode = 'yt';
    try { player.loadVideoById(song.videoId); player.unMute(); player.setVolume(volume); appliedVol = volume; } catch (e) { /* ещё не готов */ }
    plate();
    clearTimeout(blockTimer);
    blockTimer = setTimeout(function () {
      if (playingId !== song.id || !player.getPlayerState) return;
      var st = player.getPlayerState();
      if (st === -1 || st === 5) autoplayBlocked();
    }, 7000);
  }

  // YouTube не открывается, а трек — не из «Моей музыки»: играем свой запасной трек, очередь ждёт
  function playFiller() {
    if (mode === 'filler' || fillerBusy) return;
    stopYT();
    fillerBusy = true;
    apiGet('player.filler', '').then(function (j) {
      fillerBusy = false;
      if (ytState !== 'blocked' || !current || current.audio) { sync(); return; }   // YouTube вернулся или трек сменился
      if (!j.track) {
        mode = 'wait';
        say('YouTube не открывается. Включи VPN или загрузи свою музыку в «Моя музыка» на сайте.');
        if (playingId && Date.now() - blockedAt > GIVE_UP_MS) advance(playingId, 900); // 10 минут без YouTube и без своей музыки
        return;
      }
      mode = 'filler';
      playingId = playingId || current.id;
      fillerTitle = j.track.title;
      audio.src = j.track.url;
      audio.play().catch(function () { say('Браузер не дал включить звук. Нажми сюда.', true); });
      say('YouTube не открывается: играет твоя музыка. Включи VPN, и плеер вернётся к очереди.');
      plate(fillerTitle, '', '', 'Запасной эфир');
    }).catch(function (e) {
      fillerBusy = false;
      say(fatal ? e.message : 'Нет связи с StreOps: ' + e.message + ' Пробуем снова.');
    });
  }

  // Своя музыка и запасной эфир: доиграло — следующий
  audio.onended = function () {
    if (mode === 'audio' && playingId) { advance(playingId); return; }
    if (mode === 'filler') { mode = 'idle'; playFiller(); }
  };
  audio.onerror = function () {
    if (mode === 'audio' && playingId) { advance(playingId, 5); return; }
    if (mode === 'filler') { mode = 'idle'; fillerBusy = false; playFiller(); }
  };

  // трек доиграл или очередь ждёт запуска: сервер переключит, только если finished — текущий трек
  function advance(finished, err) {
    if (advancing) return;
    advancing = true;
    gen++;
    apiPost('player.next', { t: token, finished: finished, err: err || 0 }).then(function (j) {
      if (typeof j.volume === 'number') volume = j.volume;
      stopYT();
      stopAudio();
      mode = 'idle';
      playingId = 0;
      current = j.current || null;
      sync();
    }).catch(function (e) {
      if (fatal) say(e.message);
    }).then(function () { advancing = false; gen++; });
  }

  function poll() {
    if (polling || fatal) return;
    polling = true;
    var g = gen;
    var yt = ytState === 'ok' ? '&yt=1' : (ytState === 'blocked' ? '&yt=0' : '');
    apiGet('widget.data', '&w=np' + yt).then(function (j) {
      if (g !== gen) return; // пока опрос шёл, плеер сам переключил трек — этот ответ устарел
      var d = j.data || {};
      current = d.current || null;
      queued = Number(d.queued) || 0;
      if (typeof d.volume === 'number') volume = d.volume;
      if (/связи/i.test(msg.textContent)) say('');
      sync();
    }).catch(function (e) {
      say(fatal ? e.message : 'Нет связи с StreOps: ' + e.message + ' Пробуем снова.');
    }).then(function () { polling = false; });
  }

  function tick() {
    if (!showUi || !playingId) return;
    var pct = 0;
    if (mode === 'audio' || mode === 'filler') {
      if (audio.duration) pct = audio.currentTime / audio.duration * 100;
    } else if (mode === 'yt' && ready && player.getCurrentTime) {
      var len = player.getDuration() || (current && current.duration) || 0;
      pct = len ? player.getCurrentTime() / len * 100 : 0;
    }
    np.querySelector('.bar i').style.width = Math.min(100, pct).toFixed(1) + '%';
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

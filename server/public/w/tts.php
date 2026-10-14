<?php
// Озвучка сообщений для OBS: https://streops.ru/w/tts.php?t=ТОКЕН — источник «Браузер», звук через OBS.
// Зрители пишут !tts текст, страница читает текст вслух (голос браузера, русский).
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>StreOps · озвучка</title>
<link rel="icon" href="data:,">
<style>
html,body{margin:0;background:transparent;overflow:hidden;font-family:'Onest',system-ui,sans-serif;color:#F2F2F2}
#note{position:fixed;left:24px;bottom:24px;max-width:600px;padding:14px 18px;border-radius:12px;background:rgba(10,10,10,.7);border:1px solid rgba(255,255,255,.16);font-size:18px;line-height:24px;opacity:0;transition:opacity .3s}
#note.on{opacity:1}
#note b{display:block;font-size:13px;color:#B4B4B4;font-weight:600;margin-bottom:4px}
#hint{position:fixed;left:24px;top:24px;font-size:14px;color:#8F8F8F}
</style>
</head>
<body>
<div id="hint">Озвучка StreOps: <span id="st">ждём сообщения…</span></div>
<div id="note"><b id="who"></b><span id="txt"></span></div>
<script>
(function () {
  var token = new URLSearchParams(location.search).get('t') || '';
  var last = null, queue = [], busy = false, guard = null;
  var note = document.getElementById('note');
  function say(item) {
    document.getElementById('who').textContent = item.name ? item.name + ' говорит' : '';
    document.getElementById('txt').textContent = item.text;
    note.classList.add('on');
    if (!('speechSynthesis' in window)) { document.getElementById('st').textContent = 'в этом браузере нет озвучки'; return finish(); }
    var u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'ru-RU';
    var ru = speechSynthesis.getVoices().filter(function (v) { return /^ru/i.test(v.lang); })[0];
    if (ru) u.voice = ru;
    u.onend = finish; u.onerror = finish;
    guard = setTimeout(finish, Math.max(4000, item.text.length * 90)); // если браузер не сообщил об окончании — идём дальше
    speechSynthesis.speak(u);
  }
  function finish() { clearTimeout(guard); guard = null; note.classList.remove('on'); busy = false; next(); }
  function next() {
    if (busy || !queue.length) return;
    busy = true;
    say(queue.shift());
  }
  function poll() {
    var url = '/api/index.php?r=widget.data&w=tts&t=' + encodeURIComponent(token) + '&after=' + (last === null ? 0 : last);
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok || !j.data) return;
      if (last === null) { last = j.data.cursor || 0; return; } // первый опрос только запоминает, что уже было
      (j.data.items || []).forEach(function (it) { queue.push(it); last = Math.max(last, it.id); });
      next();
    }).catch(function () {});
  }
  setInterval(poll, 1500);
  poll();
})();
</script>
</body>
</html>

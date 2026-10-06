(function () {
  var N = window.NERU || { settings: {}, options: [], verify: 'off' };
  var form = document.getElementById('bk');
  if (!form) return;
  var csrf = (form.querySelector('input[name=csrf]') || {}).value || '';
  var rub = function (n) { return n.toLocaleString('ru-RU') + ' ₽'; };

  function pricePlayers(s, n) {
    n = Math.max(1, n);
    var base = +s.base_price, bp = Math.max(1, +s.base_players), extra = +s.extra_per_player, maxg = Math.max(bp, +s.max_per_game);
    if (n <= maxg) return [1, base + extra * Math.max(0, n - bp)];
    var games = Math.ceil(n / bp);
    return [games, games * base];
  }

  var playersEl = document.getElementById('players');
  var est = document.getElementById('estimate');

  function calc() {
    var players = Math.max(1, parseInt(playersEl && playersEl.value, 10) || 1);
    var pp = pricePlayers(N.settings, players), games = pp[0], gamesTotal = pp[1];
    var optionsTotal = 0;
    (N.options || []).forEach(function (o) {
      var cb = form.querySelector('.opt[data-id="' + o.id + '"]');
      var hoursWrap = form.querySelector('.hours[data-for="' + o.id + '"]');
      if (hoursWrap) hoursWrap.hidden = !(cb && cb.checked);
      if (!cb || !cb.checked) return;
      if (o.unit === 'hour') {
        var hi = form.querySelector('.opthours[name="opthours[' + o.id + ']"]');
        var h = Math.max(1, parseInt(hi && hi.value, 10) || 1);
        optionsTotal += o.price * h;
      } else optionsTotal += o.price;
    });
    var total = gamesTotal + optionsTotal;
    var prepay = Math.min(+N.settings.prepay_amount, total);
    var html = '<div class="est-total">Итого: <strong>' + rub(total) + '</strong></div>';
    if (games > 1) html += '<div class="est-note">' + players + ' чел — делим на ' + games + ' игры по ' + N.settings.base_players + ' чел: ' + games + '×' + rub(+N.settings.base_price) + ' = ' + rub(gamesTotal) + '</div>';
    else html += '<div class="est-note">Игра: ' + rub(gamesTotal) + (optionsTotal ? ' · допы: ' + rub(optionsTotal) : '') + '</div>';
    html += '<div class="est-note">Предоплата для записи: <strong>' + rub(prepay) + '</strong> (остальное на месте)</div>';
    if (est) est.innerHTML = html;
  }
  ['change', 'input'].forEach(function (ev) { form.addEventListener(ev, calc); });
  calc();

  // ---- Проверка телефона ----
  if (N.verify !== 'off') {
    var phoneEl = document.getElementById('phone');
    var sendBtn = document.getElementById('sendCode');
    var codeRow = document.getElementById('codeRow');
    var codeEl = document.getElementById('code');
    var checkBtn = document.getElementById('checkCode');
    var msg = document.getElementById('verifyMsg');
    var submitBtn = document.getElementById('submitBtn');
    var verifiedPhone = null;

    function setMsg(t, ok) { if (msg) { msg.textContent = t || ''; msg.style.color = ok ? '#7bdc9e' : ''; } }
    function gate() {
      var ok = phoneEl && verifiedPhone && phoneEl.value.trim() === verifiedPhone;
      if (submitBtn) { submitBtn.disabled = !ok; submitBtn.style.opacity = ok ? '' : '.5'; }
    }
    gate();
    if (phoneEl) phoneEl.addEventListener('input', function () { verifiedPhone = null; setMsg(''); gate(); });

    function post(action, extra, cb) {
      var body = 'action=' + action + '&csrf=' + encodeURIComponent(csrf) + '&phone=' + encodeURIComponent(phoneEl.value) + (extra || '');
      fetch('/api.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
        .then(function (r) { return r.json(); }).then(cb).catch(function () { setMsg('Ошибка сети'); });
    }
    if (sendBtn) sendBtn.addEventListener('click', function () {
      if (!phoneEl.value.trim()) { setMsg('Сначала укажите телефон'); return; }
      setMsg('Отправляем…'); sendBtn.disabled = true;
      post('send_code', '', function (d) {
        sendBtn.disabled = false;
        if (d.ok) { codeRow.hidden = false; setMsg(d.debug ? ('Тест: код ' + d.debug) : 'Код отправлен в Telegram на этот номер'); }
        else setMsg(d.error || 'Не удалось отправить код');
      });
    });
    if (checkBtn) checkBtn.addEventListener('click', function () {
      post('verify_code', '&code=' + encodeURIComponent(codeEl.value), function (d) {
        if (d.ok) { verifiedPhone = phoneEl.value.trim(); setMsg('Телефон подтверждён ✓', true); gate(); }
        else setMsg(d.error || 'Неверный код');
      });
    });
  }
})();

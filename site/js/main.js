(function () {
  'use strict';

  /* ================== Утилиты ================== */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;

  var KEY_USER = 'streop.user';
  var KEY_LOOK = 'streop.look';
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var BLOCKS = { hero: 'Главный экран', features: 'Возможности', pricing: 'Уровни подписок' };
  var PRESETS = [
    { id: 'black', name: 'Чёрный', bg: '#000000', fg: '#ffffff', accent: '#ffffff' },
    { id: 'white', name: 'Белый', bg: '#ffffff', fg: '#000000', accent: '#000000' },
    { id: 'graphite', name: 'Графит', bg: '#121212', fg: '#e8e8e8', accent: '#e8e8e8' },
    { id: 'paper', name: 'Бумага', bg: '#f2f0eb', fg: '#151515', accent: '#151515' }
  ];
  function defaultLook() {
    return {
      bg: '#000000', fg: '#ffffff', accent: '#ffffff',
      fontHead: 'Inter Tight', fontBody: 'Inter', radius: 0, fontSize: 16, motion: true,
      order: ['hero', 'features', 'pricing'], hidden: [],
      siteName: 'Streop', logo: null
    };
  }

  var user = load(KEY_USER);
  var look = Object.assign(defaultLook(), load(KEY_LOOK) || {});

  /* ================== Тост ================== */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2800);
  }

  /* ================== Хедер ================== */
  var header = $('#header');
  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var burger = $('#burger'), nav = $('#nav');
  function setNav(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  burger.addEventListener('click', function () { setNav(!nav.classList.contains('is-open')); });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });

  /* ================== Авторизация ================== */
  var loginBtn = $('#loginBtn'), userBox = $('#userBox');

  function renderAuth() {
    var logged = !!user;
    loginBtn.hidden = logged;
    userBox.hidden = !logged;
    if (logged) {
      $('#avatarLetter').textContent = (user.name || 'S').trim().charAt(0).toUpperCase();
      $('#menuName').textContent = user.name;
      $('#menuPlan').textContent = user.plan || 'Free';
    }
  }

  function login(platform) {
    var now = Date.now();
    user = {
      name: 'Стример', email: 'streamer@example.com', platform: platform,
      created: new Date(now).toISOString(),
      id: 'ST-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      plan: 'Про', renew: new Date(now + 30 * 864e5).toISOString(), balance: 1250,
      history: [
        { t: 'Пополнение баланса', d: now - 12 * 864e5, v: 1000 },
        { t: 'Подписка «Про»', d: now - 12 * 864e5, v: -499 },
        { t: 'Пополнение баланса', d: now - 3 * 864e5, v: 750 }
      ]
    };
    save(KEY_USER, user);
    renderAuth();
    closeModal($('#loginModal'));
    toast('Вы вошли через ' + platform);
  }

  function logout() {
    user = null;
    drop(KEY_USER);
    closeMenu();
    renderAuth();
    toast('Вы вышли из аккаунта');
  }

  loginBtn.addEventListener('click', function () { openModal($('#loginModal')); });
  $$('[data-login]').forEach(function (b) {
    b.addEventListener('click', function () { login(b.getAttribute('data-login')); });
  });
  $('#logoutBtn').addEventListener('click', logout);

  /* ================== Меню пользователя ================== */
  var avatarBtn = $('#avatarBtn'), menu = $('#userMenu');
  function menuItems() { return $$('[role="menuitem"]', menu); }
  function openMenu() {
    menu.classList.add('is-open');
    avatarBtn.setAttribute('aria-expanded', 'true');
    menuItems()[0].focus();
  }
  function closeMenu(focusBack) {
    if (!menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    avatarBtn.setAttribute('aria-expanded', 'false');
    if (focusBack) avatarBtn.focus();
  }
  avatarBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.classList.contains('is-open')) closeMenu(); else openMenu();
  });
  document.addEventListener('click', function (e) {
    if (!userBox.contains(e.target)) closeMenu();
    if (!nav.contains(e.target) && !burger.contains(e.target)) setNav(false);
  });
  menu.addEventListener('keydown', function (e) {
    var items = menuItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') closeMenu(true);
    else if (e.key === 'Tab') closeMenu();
  });

  $$('[data-soon]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      closeMenu();
      toast('«' + a.getAttribute('data-soon') + '» — раздел скоро появится');
    });
  });

  /* ================== Модальные окна ================== */
  var lastFocus = null;
  function openModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    var f = m.querySelector('[role="tab"][aria-selected="true"], .login-btn, input, button:not([data-close])');
    if (f) f.focus();
  }
  function closeModal(m) {
    if (m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null) lastFocus.focus();
  }
  $$('.modal').forEach(function (m) {
    $$('[data-close]', m).forEach(function (c) { c.addEventListener('click', function () { closeModal(m); }); });
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(m); return; }
      if (e.key !== 'Tab') return;
      var f = $$('button, input, select, [href]', m).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  /* ================== Кнопки действий ================== */
  $('#continueBtn').addEventListener('click', function () {
    if (user) toast('Переход в «Панель стримера» — раздел скоро появится');
    else openModal($('#loginModal'));
  });
  $$('[data-plan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var plan = b.getAttribute('data-plan');
      if (!user) { openModal($('#loginModal')); toast('Войдите, чтобы оформить тариф «' + plan + '»'); return; }
      toast('Тариф «' + plan + '»: онлайн-оплата скоро будет доступна');
    });
  });

  /* ================== Появление при скролле ================== */
  if ('IntersectionObserver' in window && !reducedMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) {
      var sib = el.parentElement ? $$('.reveal', el.parentElement).indexOf(el) : 0;
      el.style.transitionDelay = Math.min(sib, 6) * 70 + 'ms';
      io.observe(el);
    });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* =========================================================
     3D-ГОЛОВА РОБОТА ИЗ ТОЧЕК
     Модель: куб [-1..1]^3, ось Y вниз, Z — к зрителю.
     ========================================================= */
  var Robot = (function () {
    var canvas = $('#robot'), stage = $('#stage');
    if (!canvas) return { setColor: function () {}, setMotion: function () {} };
    var ctx = canvas.getContext('2d');

    // ---------- Построение модели ----------
    // Статичные точки: x, y, z, nx, ny, nz, размер, яркость
    var P = [];
    function add(x, y, z, nx, ny, nz, s, b, ext) { P.push(x, y, z, nx, ny, nz, s || 1, b || 1, ext ? 1 : 0); }

    // Грани куба (кроме лицевой, она динамическая)
    var N = 26;
    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        var u = -1 + 2 * i / (N - 1), v = -1 + 2 * j / (N - 1);
        add(u, v, -1, 0, 0, -1);      // затылок
        add(1, u, v, 1, 0, 0);        // правая
        add(-1, u, v, -1, 0, 0);      // левая
        add(u, -1, v, 0, -1, 0);      // верх
        add(u, 1, v, 0, 1, 0);        // низ
      }
    }
    // Рёбра — плотнее и ярче, чтобы силуэт был чётким
    var E = 70;
    for (var k = 0; k < E; k++) {
      var t = -1 + 2 * k / (E - 1), q = 0.7071;
      [[t, -1, -1, 0, -q, -q], [t, 1, -1, 0, q, -q], [t, -1, 1, 0, -q, q], [t, 1, 1, 0, q, q],
       [-1, t, -1, -q, 0, -q], [1, t, -1, q, 0, -q], [-1, t, 1, -q, 0, q], [1, t, 1, q, 0, q],
       [-1, -1, t, -q, -q, 0], [1, -1, t, q, -q, 0], [-1, 1, t, -q, q, 0], [1, 1, t, q, q, 0]
      ].forEach(function (p) { add(p[0], p[1], p[2], p[3], p[4], p[5], 1.25, 1.35); });
    }
    // Уши — цилиндры по оси X
    [-1, 1].forEach(function (side) {
      for (var r = 0; r < 4; r++) {
        var xx = side * (1.02 + r * 0.045);
        for (var a = 0; a < 44; a++) {
          var an = a / 44 * Math.PI * 2;
          add(xx, -0.05 + Math.sin(an) * 0.32, Math.cos(an) * 0.32, 0, Math.sin(an), Math.cos(an), 1.1, 1.1, true);
        }
      }
      [0.08, 0.17, 0.25].forEach(function (rad, ri) {
        var cnt = 10 + ri * 10;
        for (var a2 = 0; a2 < cnt; a2++) {
          var an2 = a2 / cnt * Math.PI * 2;
          add(side * 1.16, -0.05 + Math.sin(an2) * rad, Math.cos(an2) * rad, side, 0, 0, 1.1, 1.2, true);
        }
      });
    });
    // Шея — цилиндр по оси Y
    for (var nr = 0; nr < 4; nr++) {
      var ny = 1.04 + nr * 0.08, nrad = 0.42 - nr * 0.02;
      for (var na = 0; na < 60; na++) {
        var nan = na / 60 * Math.PI * 2;
        add(Math.cos(nan) * nrad, ny, Math.sin(nan) * nrad, Math.cos(nan), 0, Math.sin(nan), 1, 0.9, true);
      }
    }
    // Основание антенны
    for (var ab = 0; ab < 24; ab++) {
      var aban = ab / 24 * Math.PI * 2;
      add(Math.cos(aban) * 0.12, -1.03, Math.sin(aban) * 0.12, Math.cos(aban), -0.3, Math.sin(aban), 1, 1.1, true);
    }
    // Стержень антенны
    for (var as = 0; as < 16; as++) add(0, -1.04 - as * 0.028, 0, 0, 0, 0, 1, 1.2, true);
    var staticCount = P.length / 9;

    // Шар антенны (пульсирует)
    var BALL = [];
    var BN = 110, golden = Math.PI * (3 - Math.sqrt(5));
    for (var bi = 0; bi < BN; bi++) {
      var by = 1 - (bi / (BN - 1)) * 2, br = Math.sqrt(1 - by * by), bt = golden * bi;
      BALL.push(Math.cos(bt) * br, by, Math.sin(bt) * br);
    }

    // Лицевая панель — плотная сетка, состояние точек считается каждый кадр
    var FN = 46, FACE = [];
    for (var fi = 0; fi < FN; fi++) for (var fj = 0; fj < FN; fj++) FACE.push(-1 + 2 * fi / (FN - 1), -1 + 2 * fj / (FN - 1), fi);
    var MOUTH_COLS = FN;

    var total = staticCount + BALL.length / 3 + FACE.length / 3;
    var countEl = $('#dotsCount');
    if (countEl) countEl.textContent = total.toLocaleString('ru-RU') + ' точек';

    // ---------- Состояние ----------
    var W = 0, H = 0, dpr = 1, S = 1, cx = 0, cy = 0;
    var color = '#ffffff';
    var motion = true;
    var visible = true;

    var look = { x: 0, y: 0 }, lookT = { x: 0, y: 0 };     // куда смотрит (−1..1)
    var user = { yaw: 0, pitch: 0, vy: 0, vp: 0 };          // вращение мышью
    var drag = null, lastInteract = 0;
    var blink = 1, nextBlink = 1.5, blinkT = -1;
    var talk = 0, talkUntil = 0, nextTalk = 3;
    var happyUntil = 0;
    var spin = 0;
    var t0 = performance.now(), time = 0;
    var coordsEl = $('#coords');

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W; canvas.height = H;
      S = Math.min(W, H) * 0.235;
      cx = W / 2; cy = H / 2 + S * 0.16;
    }

    // ---------- Ввод ----------
    window.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      var mx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5);
      var my = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.5);
      lookT.x = Math.max(-1, Math.min(1, mx));
      lookT.y = Math.max(-1, Math.min(1, my));
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        user.vy = dx * 0.0075; user.vp = -dy * 0.0055;
        user.yaw += user.vy; user.pitch += user.vp;
        user.pitch = Math.max(-1.1, Math.min(1.1, user.pitch));
        lastInteract = time;
      }
    }, { passive: true });

    stage.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
      user.vy = user.vp = 0;
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    function endDrag() {
      if (!drag) return;
      if (drag.moved < 6) poke();
      drag = null;
      lastInteract = time;
      stage.classList.remove('is-dragging');
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', function () { drag = null; stage.classList.remove('is-dragging'); });

    // Клавиатура: стрелки вращают голову
    stage.tabIndex = 0;
    stage.addEventListener('keydown', function (e) {
      var step = 0.25;
      if (e.key === 'ArrowLeft') user.yaw -= step;
      else if (e.key === 'ArrowRight') user.yaw += step;
      else if (e.key === 'ArrowUp') user.pitch = Math.min(1.1, user.pitch + step);
      else if (e.key === 'ArrowDown') user.pitch = Math.max(-1.1, user.pitch - step);
      else if (e.key === 'Enter' || e.key === ' ') poke();
      else return;
      e.preventDefault();
      lastInteract = time;
    });

    // Клик по голове: радость, разговор и прокрутка
    function poke() {
      happyUntil = time + 1.4;
      talkUntil = time + 1.6;
      spin += Math.PI * 2;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0 }).observe(stage);
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    resize();

    // ---------- Рендер ----------
    var L = (function () { var x = -0.45, y = -0.55, z = 0.7, m = Math.hypot(x, y, z); return [x / m, y / m, z / m]; })();

    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
      if (!visible) return;
      var anim = motion && !reducedMotion;
      if (anim) time += dt; else time += drag ? dt : 0;

      // плавное слежение взгляда
      look.x += (lookT.x - look.x) * 0.08;
      look.y += (lookT.y - look.y) * 0.08;

      // инерция и возврат после вращения
      if (!drag) {
        user.yaw += user.vy; user.pitch += user.vp;
        user.vy *= 0.94; user.vp *= 0.9;
        user.pitch = Math.max(-1.1, Math.min(1.1, user.pitch));
        if (time - lastInteract > 2.2 && Math.abs(user.vy) < 0.002) {
          user.yaw = Math.atan2(Math.sin(user.yaw), Math.cos(user.yaw));
          user.yaw *= 0.96; user.pitch *= 0.95;
        }
      }
      spin *= anim ? 0.93 : 0;

      // моргание
      if (anim) {
        if (time > nextBlink && blinkT < 0) blinkT = 0;
        if (blinkT >= 0) {
          blinkT += dt;
          var bt = blinkT / 0.18;
          blink = bt < 1 ? Math.abs(1 - bt * 2) : 1;
          if (bt >= 1) { blinkT = -1; blink = 1; nextBlink = time + 2 + Math.random() * 3.5; if (Math.random() < 0.2) nextBlink = time + 0.25; }
        }
        if (time > nextTalk) { talkUntil = time + 1.6 + Math.random() * 1.6; nextTalk = time + 4 + Math.random() * 4; }
      }
      talk += ((time < talkUntil ? 1 : 0) - talk) * 0.12;
      var happy = time < happyUntil;

      var idleYaw = anim ? Math.sin(time * 0.6) * 0.12 : 0;
      var idlePitch = anim ? Math.sin(time * 0.8 + 1) * 0.05 : 0;
      var yaw = look.x * 0.55 + idleYaw + user.yaw + spin * -1 + 0.0;
      var pitch = -look.y * 0.35 + idlePitch + user.pitch;
      var roll = anim ? Math.sin(time * 0.5) * 0.03 : 0;
      var bob = anim ? Math.sin(time * 1.3) * 0.035 : 0;

      var cyw = Math.cos(yaw), syw = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var cr = Math.cos(roll), sr = Math.sin(roll);
      var D = 5.2;
      var base = 1.7 * dpr;
      var scanY = anim ? ((time * 0.55) % 1) * 3.6 - 1.9 : -9;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;

      // позиция камеры в координатах модели — для проверки перекрытия кубом
      var camX = -D * cp * syw, camY = D * sp, camZ = D * cp * cyw;
      function hidden(x, y, z) {
        var dx = x - camX, dy = y - camY, dz = z - camZ, t0 = 0, t1 = 1, B = 0.995;
        var o = [camX, camY, camZ], d = [dx, dy, dz];
        for (var k = 0; k < 3; k++) {
          if (Math.abs(d[k]) < 1e-9) { if (o[k] < -B || o[k] > B) return false; continue; }
          var ta = (-B - o[k]) / d[k], tb = (B - o[k]) / d[k];
          if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) return false;
        }
        return t0 < 0.985;
      }

      function draw(x, y, z, nx, ny, nz, size, bright, ext) {
        if (ext && hidden(x, y, z)) return;
        // поворот: yaw (Y) → pitch (X) → roll (Z)
        var x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        var x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;
        var p = D / (D - z2);
        var a;
        if (nx === 0 && ny === 0 && nz === 0) a = 0.85;
        else {
          var nx1 = nx * cyw + nz * syw, nz1 = -nx * syw + nz * cyw;
          var ny2 = ny * cp - nz1 * sp, nz2 = ny * sp + nz1 * cp;
          var nx3 = nx1 * cr - ny2 * sr, ny3 = nx1 * sr + ny2 * cr;
          var lit = nx3 * L[0] + ny3 * L[1] + nz2 * L[2];
          var vx = -x3, vy = -y3, vz = D - z2;
          var facing = (nx3 * vx + ny3 * vy + nz2 * vz) / Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (facing < -0.02) { if (ext) return; a = 0.06; }
          else a = 0.3 + 0.7 * Math.max(0, lit);
        }
        if (Math.abs(y - scanY) < 0.07) { a = Math.min(1, a + 0.35); size *= 1.35; }
        a *= bright;
        if (a <= 0.02) return;
        ctx.globalAlpha = a > 1 ? 1 : a;
        var s = base * size * p;
        ctx.fillRect(cx + x3 * S * p - s / 2, cy + (y3 + bob) * S * p - s / 2, s, s);
      }

      // статичные точки
      for (var i = 0; i < P.length; i += 9) draw(P[i], P[i + 1], P[i + 2], P[i + 3], P[i + 4], P[i + 5], P[i + 6], P[i + 7], P[i + 8]);

      // шар антенны
      var pulse = 0.115 + (anim ? Math.sin(time * 4) * 0.018 : 0);
      for (var b = 0; b < BALL.length; b += 3) {
        draw(BALL[b] * pulse, -1.56 + BALL[b + 1] * pulse, BALL[b + 2] * pulse, 0, 0, 0, 1.15, anim ? 0.75 + Math.sin(time * 4) * 0.25 : 1, true);
      }

      // лицо: глаза, зрачки, рот-эквалайзер
      var eh = Math.max(0.025, 0.2 * blink), ew = 0.23;
      var pxo = look.x * 0.075, pyo = look.y * 0.06;
      for (var f = 0; f < FACE.length; f += 3) {
        var u = FACE[f], v = FACE[f + 1], col = FACE[f + 2];
        var size = 1, bright = 0.42, zf = 1;
        // глаза
        var du = Math.abs(u) - 0.43, dv = v + 0.2;
        if (Math.abs(du) < ew && Math.abs(dv) < 0.22) {
          var inEye;
          if (happy) {
            var line = -0.06 + 0.7 * Math.abs(du);
            inEye = Math.abs(dv - line) < 0.04 && Math.abs(du) < ew * 0.9;
            if (inEye) { size = 1.9; bright = 1.6; zf = 1.06; }
          } else if (Math.abs(dv) < eh) {
            var pdx = (u - (u > 0 ? 0.43 : -0.43)) - pxo, pdy = dv - pyo * blink;
            var pupil = Math.abs(pdx) < 0.085 && Math.abs(pdy) < Math.min(0.085, eh);
            size = pupil ? 2.1 : 1.25;
            bright = pupil ? 1.8 : 1.05;
            zf = 1.05;
          }
        }
        // рот
        if (Math.abs(u) < 0.5 && v > 0.3 && v < 0.66) {
          var amp = 0.03 + talk * (0.13 * Math.abs(Math.sin(time * 9 + col * 0.55) * Math.sin(time * 3.7 + col * 1.3)) + 0.02);
          if (Math.abs(v - 0.48) < amp) { size = 1.6; bright = 1.5; zf = 1.04; }
          else { bright = 0.18; }
        }
        draw(u, v, zf, 0, 0, 1, size, bright, zf > 1);
      }
      ctx.globalAlpha = 1;

      if (coordsEl) {
        var deg = function (r) { var d = Math.round(Math.atan2(Math.sin(r), Math.cos(r)) * 180 / Math.PI); return (d > 0 ? '+' : '') + d + '°'; };
        coordsEl.textContent = 'Yaw ' + deg(yaw) + ' · Pitch ' + deg(pitch);
      }
    }
    requestAnimationFrame(frame);

    return {
      setColor: function (c) { color = c; },
      setMotion: function (m) { motion = m; }
    };
  })();

  /* =========================================================
     ОФОРМЛЕНИЕ
     ========================================================= */
  function luminance(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function applyLook() {
    var s = root.style;
    s.setProperty('--bg', look.bg);
    s.setProperty('--fg', look.fg);
    s.setProperty('--accent', look.accent);
    s.setProperty('--accent-fg', luminance(look.accent) > 0.45 ? '#000000' : '#ffffff');
    s.setProperty('--font-head', '"' + look.fontHead + '", system-ui, sans-serif');
    s.setProperty('--font-body', '"' + look.fontBody + '", system-ui, sans-serif');
    s.setProperty('--r', look.radius + 'px');
    s.setProperty('--fs', look.fontSize + 'px');
    root.style.colorScheme = luminance(look.bg) > 0.4 ? 'light' : 'dark';
    $('meta[name="theme-color"]').setAttribute('content', look.bg);

    look.order.forEach(function (id, i) {
      var sec = $('[data-block="' + id + '"]');
      if (!sec) return;
      sec.style.order = i;
      sec.hidden = look.hidden.indexOf(id) !== -1;
    });
    $$('.nav a, .footer__grid a').forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      if (BLOCKS[id]) a.hidden = look.hidden.indexOf(id) !== -1;
    });

    $$('[data-site-name]').forEach(function (el) { el.textContent = look.siteName; });
    document.title = look.siteName + ' — бот и инструменты для стримеров';

    $$('[data-logo]').forEach(function (box) {
      var img = box.querySelector('img'), svg = box.querySelector('svg');
      if (look.logo) {
        if (!img) { img = document.createElement('img'); img.alt = ''; box.appendChild(img); }
        img.src = look.logo;
        if (svg) svg.style.display = 'none';
      } else {
        if (img) img.remove();
        if (svg) svg.style.display = '';
      }
    });

    Robot.setColor(look.fg);
    Robot.setMotion(look.motion);
  }

  function commit() { save(KEY_LOOK, look); applyLook(); syncLookForm(); }

  // Пресеты
  var presetsEl = $('#presets');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.setAttribute('data-preset', p.id);
    b.innerHTML = '<span class="preset__sw"><i></i><i></i></span><span></span>';
    var sw = b.querySelectorAll('i');
    sw[0].style.background = p.bg;
    sw[1].style.background = p.fg;
    b.lastChild.textContent = p.name;
    b.addEventListener('click', function () {
      look.bg = p.bg; look.fg = p.fg; look.accent = p.accent;
      commit();
    });
    presetsEl.appendChild(b);
  });

  function syncLookForm() {
    $$('.preset').forEach(function (b) {
      var p = PRESETS.filter(function (x) { return x.id === b.getAttribute('data-preset'); })[0];
      b.classList.toggle('is-active', p.bg === look.bg && p.fg === look.fg && p.accent === look.accent);
    });
    [['cBg', 'bg'], ['cFg', 'fg'], ['cAccent', 'accent']].forEach(function (c) {
      $('#' + c[0]).value = look[c[1]];
      $('#' + c[0] + 'Hex').textContent = look[c[1]];
    });
    $('#fontHead').value = look.fontHead;
    $('#fontBody').value = look.fontBody;
    $$('#radiusSeg button').forEach(function (b) { b.classList.toggle('is-active', +b.getAttribute('data-radius') === look.radius); });
    $('#fontSize').value = look.fontSize;
    $('#sizeVal').textContent = look.fontSize;
    $('#motionToggle').checked = look.motion;
    $('#siteName').value = look.siteName;
    renderOrder();
  }

  function renderOrder() {
    var list = $('#blockOrder');
    list.innerHTML = '';
    look.order.forEach(function (id, i) {
      var off = look.hidden.indexOf(id) !== -1;
      var li = document.createElement('li');
      if (off) li.className = 'is-off';
      li.innerHTML =
        '<label><input type="checkbox"' + (off ? '' : ' checked') + '><span></span></label>' +
        '<button type="button" class="icon-btn" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '><svg class="ic"><use href="#i-up"/></svg></button>' +
        '<button type="button" class="icon-btn" aria-label="Ниже"' + (i === look.order.length - 1 ? ' disabled' : '') + '><svg class="ic"><use href="#i-down"/></svg></button>';
      li.querySelector('label span').textContent = BLOCKS[id];
      li.querySelector('input').addEventListener('change', function (e) {
        if (!e.target.checked && look.hidden.length >= look.order.length - 1) {
          e.target.checked = true;
          toast('Хотя бы один блок должен остаться видимым');
          return;
        }
        look.hidden = look.hidden.filter(function (h) { return h !== id; });
        if (!e.target.checked) look.hidden.push(id);
        commit();
        $('#blockOrder').children[i].querySelector('input').focus();
      });
      var btns = li.querySelectorAll('button');
      btns[0].addEventListener('click', function () { move(i, -1); });
      btns[1].addEventListener('click', function () { move(i, 1); });
      list.appendChild(li);
    });
  }
  function move(i, dir) {
    var j = i + dir, o = look.order.slice(), t = o[i];
    o[i] = o[j]; o[j] = t;
    look.order = o;
    commit();
    var btn = $('#blockOrder').children[j].querySelectorAll('button')[dir < 0 ? 0 : 1];
    if (btn.disabled) btn = $('#blockOrder').children[j].querySelectorAll('button')[dir < 0 ? 1 : 0];
    btn.focus();
  }

  [['cBg', 'bg'], ['cFg', 'fg'], ['cAccent', 'accent']].forEach(function (c) {
    $('#' + c[0]).addEventListener('input', function (e) { look[c[1]] = e.target.value; commit(); });
  });
  $('#fontHead').addEventListener('change', function (e) { look.fontHead = e.target.value; commit(); });
  $('#fontBody').addEventListener('change', function (e) { look.fontBody = e.target.value; commit(); });
  $$('#radiusSeg button').forEach(function (b) {
    b.addEventListener('click', function () { look.radius = +b.getAttribute('data-radius'); commit(); });
  });
  $('#fontSize').addEventListener('input', function (e) { look.fontSize = +e.target.value; commit(); });
  $('#motionToggle').addEventListener('change', function (e) { look.motion = e.target.checked; commit(); });
  $('#siteName').addEventListener('input', function (e) {
    look.siteName = e.target.value.trim() || 'Streop';
    save(KEY_LOOK, look); applyLook();
  });
  $('#logoFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 400 * 1024) { toast('Логотип должен весить меньше 400 КБ'); e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () { look.logo = reader.result; commit(); toast('Логотип обновлён'); };
    reader.readAsDataURL(file);
  });
  $('#resetLook').addEventListener('click', function () {
    look = defaultLook();
    $('#logoFile').value = '';
    commit();
    toast('Оформление сброшено');
  });

  /* =========================================================
     НАСТРОЙКИ АККАУНТА
     ========================================================= */
  var tabs = $$('.tabs [role="tab"]');
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return;
      var next = tabs[(i + n + tabs.length) % tabs.length];
      selectTab(next); next.focus();
    });
  });

  function fmtDate(d) { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtMoney(v) { return v.toLocaleString('ru-RU') + ' ₽'; }

  function renderSettings() {
    $('#accName').value = user.name;
    $('#accEmail').value = user.email;
    $('#accPlatform').textContent = user.platform;
    $('#accDate').textContent = fmtDate(user.created);
    $('#accId').textContent = user.id;

    $('#balAmount').textContent = fmtMoney(user.balance);
    $('#balPlan').textContent = user.plan || 'Нет';
    $('#balRenew').textContent = user.plan ? 'Продление ' + fmtDate(user.renew) : '';

    var h = $('#history');
    h.innerHTML = '';
    user.history.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (op) {
      var li = document.createElement('li');
      var left = document.createElement('div');
      left.textContent = op.t;
      var sm = document.createElement('small');
      sm.textContent = fmtDate(op.d);
      left.appendChild(sm);
      var right = document.createElement('b');
      right.className = op.v > 0 ? 'plus' : 'minus';
      right.textContent = (op.v > 0 ? '+ ' : '− ') + fmtMoney(Math.abs(op.v));
      li.appendChild(left); li.appendChild(right);
      h.appendChild(li);
    });

    $('#deleteConfirm').value = '';
    $('#deleteBtn').disabled = true;
    syncLookForm();
  }

  $('#openSettings').addEventListener('click', function () {
    closeMenu();
    renderSettings();
    selectTab(tabs[0]);
    openModal($('#settingsModal'));
  });

  $('#saveAccount').addEventListener('click', function () {
    var name = $('#accName').value.trim(), email = $('#accEmail').value.trim();
    if (!name) { toast('Имя не может быть пустым'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Проверьте адрес e-mail'); return; }
    user.name = name; user.email = email;
    save(KEY_USER, user); renderAuth();
    toast('Данные аккаунта сохранены');
  });

  $('#topUp').addEventListener('click', function () {
    user.balance += 500;
    user.history.push({ t: 'Пополнение баланса', d: Date.now(), v: 500 });
    save(KEY_USER, user); renderSettings();
    toast('Баланс пополнен на 500 ₽');
  });

  $('#deleteConfirm').addEventListener('input', function (e) {
    $('#deleteBtn').disabled = e.target.value.trim().toUpperCase() !== 'УДАЛИТЬ';
  });
  $('#deleteBtn').addEventListener('click', function () {
    drop(KEY_USER); drop(KEY_LOOK);
    user = null;
    look = defaultLook();
    applyLook();
    closeModal($('#settingsModal'));
    renderAuth();
    loginBtn.focus();
    toast('Аккаунт и все данные удалены');
  });

  /* ================== Старт ================== */
  $('#year').textContent = new Date().getFullYear();
  applyLook();
  renderAuth();
})();

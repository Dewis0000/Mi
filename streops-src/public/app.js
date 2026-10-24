/* Hearth: клиент чата и звонков. Без сборки и внешних библиотек. */
(function () {
  'use strict';

  const NICK_RE = /^[\p{L}\p{N} _.-]{2,32}$/u;
  const AVATAR_COLORS = ['#f0883e', '#5b8def', '#57c27d', '#e0508a', '#b58cf2', '#f2c14e'];
  const ACCENTS = ['#f0883e', '#5b8def', '#57c27d', '#e0508a', '#b58cf2', '#f2c14e'];
  const THEMES = {
    hearth: { name: 'Hearth Dark', bg0: '#1e1f22', bg1: '#2b2d31', bg2: '#313338', bg3: '#383a40', text: '#dbdee1', strong: '#f2f3f5', muted: '#949ba4', accent: '#f0883e' },
    ember: { name: 'Ember Night', bg0: '#120c0a', bg1: '#1d1412', bg2: '#241a17', bg3: '#33241f', text: '#f1e3dc', strong: '#fff7f2', muted: '#a88f85', accent: '#ff7a45' },
    day: { name: 'Daylight', bg0: '#e3e5e8', bg1: '#f2f3f5', bg2: '#ffffff', bg3: '#e9eaed', text: '#2e3338', strong: '#060607', muted: '#5c6370', accent: '#5b6eea' },
    mono: { name: 'Mono', bg0: '#0b0b0c', bg1: '#141416', bg2: '#18181b', bg3: '#222226', text: '#d4d4d8', strong: '#fafafa', muted: '#71717a', accent: '#e4e4e7' }
  };
  const ROOT_KEYS = ['bg0', 'bg1', 'bg2', 'bg3', 'text', 'strong', 'muted'];

  // ---------- Утилиты

  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const val = attrs[key];
        if (val === undefined || val === null || val === false) continue;
        if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2), val);
        else if (key === 'class') node.className = val;
        else node.setAttribute(key, val === true ? '' : String(val));
      }
    }
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('hearth.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('hearth.' + key, JSON.stringify(value));
      } catch (err) { /* приватный режим: просто не сохраним */ }
    },
    del(key) {
      try {
        localStorage.removeItem('hearth.' + key);
      } catch (err) { /* ignore */ }
    }
  };

  function api(path) {
    return new URL('api/' + path, location.href).toString();
  }

  function wsUrl() {
    const u = new URL('ws', location.href);
    u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  }

  function colorFor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function initial(name) {
    return (String(name || '?').trim().charAt(0) || '?').toUpperCase();
  }

  function avatarEl(name, id, extraClass) {
    const a = el('span', { class: 'avatar' + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true' }, initial(name));
    a.style.background = colorFor(id);
    return a;
  }

  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function toast(message, kind) {
    const t = el('div', { class: 'toast' + (kind === 'error' ? ' error' : ''), role: kind === 'error' ? 'alert' : 'status' }, message);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 4500);
  }

  function setConn(text) {
    const node = $('conn');
    node.textContent = text;
    node.hidden = !text;
  }

  // ---------- Состояние

  const state = {
    token: store.get('token', null),
    me: null,
    channels: [],
    online: new Map(),
    current: 'general',
    messages: new Map(),
    ws: null,
    retry: 0,
    reconnectTimer: null,
    authFailed: false,
    ice: [{ urls: 'stun:stun.l.google.com:19302' }],
    call: null,
    incoming: null,
    prefs: Object.assign(
      { theme: 'hearth', accent: null, density: 'cozy', groupMessages: true, showTimes: true },
      store.get('prefs', {})
    )
  };

  function savePrefs() {
    store.set('prefs', state.prefs);
  }

  function applyPrefs() {
    const theme = THEMES[state.prefs.theme] || THEMES.hearth;
    const s = document.documentElement.style;
    for (const key of ROOT_KEYS) s.setProperty('--' + key, theme[key]);
    s.setProperty('--accent', state.prefs.accent || theme.accent);
    s.setProperty('--pad', state.prefs.density === 'compact' ? '6px' : '12px');
    s.colorScheme = state.prefs.theme === 'day' ? 'light' : 'dark';
    document.body.classList.toggle('no-time', !state.prefs.showTimes);
  }

  // ---------- Вход

  function showLogin() {
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-nick').focus();
  }

  async function onLogin(e) {
    e.preventDefault();
    const nick = $('login-nick').value.trim();
    const hint = $('login-hint');
    const submit = $('login-submit');
    if (!NICK_RE.test(nick)) {
      hint.textContent = 'Используй от 2 до 32 букв, цифр, пробелов, _ . или -';
      hint.className = 'hint error';
      return;
    }
    submit.disabled = true;
    try {
      const res = await fetch(api('register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        hint.textContent = data.error || 'Не получилось создать профиль';
        hint.className = 'hint error';
        return;
      }
      state.token = data.token;
      store.set('token', data.token);
      state.me = data.user;
      connect();
    } catch (err) {
      hint.textContent = 'Нет связи с сервером';
      hint.className = 'hint error';
    } finally {
      submit.disabled = false;
    }
  }

  function logout() {
    store.del('token');
    location.reload();
  }

  // ---------- WebSocket

  function connect() {
    clearTimeout(state.reconnectTimer);
    setConn('Подключаемся…');
    const ws = new WebSocket(wsUrl());
    state.ws = ws;
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ t: 'hello', token: state.token }));
    });
    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      onMessage(msg);
    });
    ws.addEventListener('close', () => onSocketClosed(ws));
  }

  function onSocketClosed(ws) {
    if (ws !== state.ws) return;
    state.ws = null;
    if (state.authFailed) {
      store.del('token');
      state.token = null;
      location.reload();
      return;
    }
    setConn('Нет связи, переподключаем…');
    if (state.call) endCall('Соединение потеряно, звонок завершён');
    const delay = Math.min(15000, 800 * 2 ** state.retry);
    state.retry += 1;
    state.reconnectTimer = setTimeout(connect, delay);
  }

  function send(obj) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function onMessage(msg) {
    switch (msg.t) {
      case 'ready': return onReady(msg);
      case 'auth-failed': state.authFailed = true; return;
      case 'history': return onHistory(msg);
      case 'msg': return onNewMessage(msg.message);
      case 'ember': return onEmber(msg);
      case 'nick': return onNick(msg);
      case 'presence': return setOnline(msg.online);
      case 'room': return onRoomJoined(msg);
      case 'peer-joined': return onPeerJoined(msg);
      case 'peer-left': return onPeerLeft(msg);
      case 'signal': return onSignal(msg);
      case 'ringing': return onRinging(msg);
      case 'ring-status': return onRingStatus(msg);
      case 'ring-declined': return onRingDeclined(msg);
      case 'ring-cancelled': return onRingCancelled(msg);
      case 'error': return onServerError(msg);
      default: return undefined;
    }
  }

  function onServerError(msg) {
    if (state.call && !state.call.joined) return endCall(msg.message);
    toast(msg.message, 'error');
  }

  function onReady(msg) {
    state.me = msg.me;
    state.channels = msg.channels;
    state.retry = 0;
    state.messages.clear();
    setOnline(msg.online);
    setConn('');
    $('login').hidden = true;
    $('app').hidden = false;
    renderIdentity();
    renderChannels();
    selectChannel(state.current);
  }

  // ---------- Каналы, участники, сообщения

  function renderIdentity() {
    const me = state.me;
    if (!me) return;
    const av = $('me-avatar');
    av.textContent = initial(me.nick);
    av.style.background = colorFor(me.id);
    $('me-nick').textContent = me.nick;
    $('me-handle').textContent = me.handle;
  }

  function renderChannels() {
    const texts = $('text-channels');
    const voices = $('voice-channels');
    const textNodes = [];
    const voiceNodes = [];
    for (const c of state.channels) {
      if (c.type === 'text') {
        const current = c.id === state.current;
        textNodes.push(el('li', null, el('button', {
          class: 'channel',
          type: 'button',
          'aria-current': current ? 'true' : null,
          onclick: () => selectChannel(c.id)
        }, '# ' + c.name)));
      } else {
        voiceNodes.push(el('li', null, el('button', {
          class: 'channel voice',
          type: 'button',
          onclick: () => joinVoice(c)
        }, c.name)));
      }
    }
    texts.replaceChildren(...textNodes);
    voices.replaceChildren(...voiceNodes);
  }

  function selectChannel(id) {
    const c = state.channels.find((x) => x.id === id);
    if (!c || c.type !== 'text') return;
    state.current = id;
    $('chat-title').textContent = '# ' + c.name;
    $('chat-topic').textContent = c.topic || '';
    $('composer-input').placeholder = 'Написать в # ' + c.name;
    renderChannels();
    if (state.messages.has(id)) {
      renderMessages();
    } else {
      $('messages').replaceChildren();
      send({ t: 'history', channel: id });
    }
    $('sidebar').classList.remove('open');
    $('menu-btn').setAttribute('aria-expanded', 'false');
  }

  function setOnline(list) {
    state.online = new Map((list || []).map((u) => [u.id, u]));
    renderMembers();
  }

  function renderMembers() {
    const me = state.me;
    const people = [...state.online.values()].sort((a, b) => {
      if (me && a.id === me.id) return -1;
      if (me && b.id === me.id) return 1;
      return a.nick.localeCompare(b.nick, 'ru');
    });
    $('members-label').textContent = 'Онлайн — ' + people.length;
    $('members').replaceChildren(...people.map((u) => {
      const isMe = !!me && u.id === me.id;
      const avatar = avatarEl(u.nick, u.id, 'member-avatar');
      avatar.append(el('span', { class: 'dot', 'aria-hidden': 'true' }));
      return el('li', { class: 'member' },
        avatar,
        el('div', { class: 'member-meta' },
          el('span', { class: 'member-name' }, u.nick + (isMe ? ' (ты)' : '')),
          el('span', { class: 'member-handle' }, u.handle)),
        isMe ? null : el('button', {
          class: 'btn ghost small',
          type: 'button',
          disabled: !!state.call,
          'aria-label': 'Позвонить: ' + u.nick,
          onclick: () => startDm(u)
        }, 'Позвонить'));
    }));
  }

  function renderMessages() {
    const items = state.messages.get(state.current) || [];
    renderInto($('messages'), items);
    if (!$('call-chat').hidden) renderInto($('call-messages'), items);
  }

  function renderInto(list, items) {
    const nodes = [];
    let prev = null;
    for (const m of items) {
      const cont = !!prev && prev.authorId === m.authorId && state.prefs.groupMessages;
      nodes.push(messageNode(m, cont));
      prev = m;
    }
    list.replaceChildren(...nodes);
    list.scrollTop = list.scrollHeight;
  }

  function messageNode(m, cont) {
    const mine = !!state.me && m.authorId === state.me.id;
    const emberBtn = el('button', {
      class: 'ember' + (m.reacted ? ' on' : ''),
      type: 'button',
      'aria-pressed': String(!!m.reacted),
      'aria-label': 'Ember, всего ' + m.count,
      onclick: () => send({ t: 'ember', channel: m.channel, id: m.id })
    }, el('span', { class: 'ember-dot', 'aria-hidden': 'true' }), 'Ember ' + m.count);

    return el('li', { class: 'msg' + (cont ? ' cont' : '') + (mine ? ' mine' : ''), 'data-id': m.id },
      avatarEl(m.author, m.authorId),
      el('div', { class: 'msg-body' },
        el('div', { class: 'msg-head' },
          el('span', { class: 'msg-author' }, m.author),
          el('time', { class: 'msg-time', datetime: new Date(m.ts).toISOString() }, fmtTime(m.ts))),
        el('p', { class: 'msg-text' }, m.text),
        emberBtn));
  }

  function onHistory(msg) {
    state.messages.set(msg.channel, msg.messages);
    if (msg.channel === state.current) renderMessages();
  }

  function onNewMessage(m) {
    const list = state.messages.get(m.channel);
    if (list) {
      list.push(m);
      if (list.length > 300) list.shift();
    }
    if (m.channel === state.current) renderMessages();
  }

  function onEmber(msg) {
    const list = state.messages.get(msg.channel) || [];
    const m = list.find((x) => x.id === msg.id);
    if (!m) return;
    m.count = msg.count;
    if (state.me && msg.by === state.me.id) m.reacted = msg.on;
    if (msg.channel === state.current) renderMessages();
  }

  function onNick(msg) {
    const online = state.online.get(msg.id);
    if (online) online.nick = msg.nick;
    if (state.me && state.me.id === msg.id) {
      state.me.nick = msg.nick;
      renderIdentity();
      $('nick-hint').textContent = 'Сохранено';
      $('nick-hint').className = 'hint';
    }
    for (const list of state.messages.values()) {
      for (const m of list) if (m.authorId === msg.id) m.author = msg.nick;
    }
    if (state.call) {
      const p = state.call.people.get(msg.id);
      if (p) p.nick = msg.nick;
      renderTiles();
    }
    renderMembers();
    renderMessages();
  }

  function sendChat(input) {
    const text = input.value.trim();
    if (!text) return;
    if (!send({ t: 'msg', channel: state.current, text })) {
      toast('Нет связи: сообщение не отправлено', 'error');
      return;
    }
    input.value = '';
  }

  function toggleMenu() {
    const open = $('sidebar').classList.toggle('open');
    $('menu-btn').setAttribute('aria-expanded', String(open));
  }

  // ---------- Настройки

  function openSettings() {
    const me = state.me;
    if (!me) return;
    $('nick-input').value = me.nick;
    $('settings-handle').textContent = me.handle;
    $('nick-hint').textContent = '';
    $('nick-hint').className = 'hint';
    $('density').value = state.prefs.density;
    $('pref-group').checked = !!state.prefs.groupMessages;
    $('pref-times').checked = !!state.prefs.showTimes;
    renderPickers();
    $('settings').showModal();
  }

  function renderPickers() {
    const themeNodes = Object.keys(THEMES).map((key) => {
      const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' });
      swatch.style.background = THEMES[key].accent;
      return el('button', {
        class: 'choice',
        type: 'button',
        role: 'radio',
        'aria-checked': String(state.prefs.theme === key),
        onclick: () => {
          state.prefs.theme = key;
          savePrefs();
          applyPrefs();
          renderPickers();
        }
      }, swatch, THEMES[key].name);
    });
    $('themes').replaceChildren(...themeNodes);

    const accentNodes = ACCENTS.map((hex) => {
      const current = (state.prefs.accent || (THEMES[state.prefs.theme] || THEMES.hearth).accent) === hex;
      const btn = el('button', {
        class: 'swatch-btn',
        type: 'button',
        role: 'radio',
        'aria-checked': String(current),
        'aria-label': 'Акцент ' + hex,
        onclick: () => {
          state.prefs.accent = hex;
          savePrefs();
          applyPrefs();
          renderPickers();
        }
      });
      btn.style.background = hex;
      return btn;
    });
    $('accents').replaceChildren(...accentNodes);
  }

  function onNickSubmit(e) {
    e.preventDefault();
    const nick = $('nick-input').value.trim();
    const hint = $('nick-hint');
    if (!NICK_RE.test(nick)) {
      hint.textContent = 'От 2 до 32 символов: буквы, цифры, пробел, _ . -';
      hint.className = 'hint error';
      return;
    }
    if (!send({ t: 'nick', nick })) {
      hint.textContent = 'Нет связи, попробуй ещё раз';
      hint.className = 'hint error';
    }
  }

  // ---------- Звонки: общая часть

  async function acquireAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      return stream.getAudioTracks()[0] || null;
    } catch (err) {
      return null;
    }
  }

  function stopTrack(track) {
    if (!track) return;
    try {
      track.stop();
    } catch (err) { /* ignore */ }
  }

  function stopCallTracks(c) {
    stopTrack(c.audio);
    stopTrack(c.cam);
    stopTrack(c.share);
  }

  async function startCall(p) {
    const c = {
      room: p.room,
      title: p.title,
      kind: p.kind,
      ringTo: p.ringTo || null,
      ringing: !!p.ringing,
      joined: false,
      people: new Map(),
      tiles: new Map(),
      startedAt: Date.now(),
      timer: null,
      timeout: null,
      audio: null,
      cam: null,
      share: null,
      mic: true,
      camOn: false,
      sharing: false,
      chatOpen: false,
      embers: 0
    };
    state.call = c;
    $('call-title').textContent = p.title;
    $('call-chat').hidden = true;
    $('call').hidden = false;
    c.timer = setInterval(updateTimer, 1000);
    updateTimer();
    updateSub();
    renderControls();
    renderTiles();

    c.audio = await acquireAudio();
    if (state.call !== c) {
      stopCallTracks(c);
      return;
    }
    if (!c.audio) {
      c.mic = false;
      toast('Микрофон недоступен: ты сможешь только слушать', 'error');
    }
    renderControls();
    renderTiles();
  }

  function endCall(reason) {
    const c = state.call;
    if (!c) return;
    state.call = null;
    clearInterval(c.timer);
    clearTimeout(c.timeout);
    if (c.ringing && c.ringTo) send({ t: 'ring-cancel', room: c.room, to: c.ringTo });
    send({ t: 'leave', room: c.room });
    for (const p of c.people.values()) {
      if (p.pc) p.pc.close();
    }
    stopCallTracks(c);
    $('call').hidden = true;
    $('tiles').replaceChildren();
    $('call-chat').hidden = true;
    if (reason) toast(reason);
    renderMembers();
  }

  function updateTimer() {
    const c = state.call;
    if (!c) return;
    const s = Math.floor((Date.now() - c.startedAt) / 1000);
    $('call-timer').textContent = pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  function updateSub() {
    const c = state.call;
    if (!c) return;
    let text;
    if (c.ringing) text = 'звоним…';
    else if (c.kind === 'voice') text = '· в комнате ' + (c.people.size + 1);
    else text = c.people.size ? '· на связи' : '· соединяем…';
    $('call-sub').textContent = text;
  }

  function sendSignal(to, data) {
    const c = state.call;
    if (c) send({ t: 'signal', room: c.room, to, data });
  }

  function currentVideo() {
    const c = state.call;
    if (!c) return null;
    if (c.sharing && c.share) return c.share;
    if (c.camOn && c.cam) return c.cam;
    return null;
  }

  function stateMsg() {
    const c = state.call;
    return { kind: 'state', mic: c.mic, cam: c.camOn, share: c.sharing };
  }

  function broadcastState() {
    const c = state.call;
    if (!c) return;
    for (const p of c.people.values()) {
      if (p.pc) sendSignal(p.id, stateMsg());
    }
  }

  function syncVideo() {
    const c = state.call;
    if (!c) return;
    const track = currentVideo();
    for (const p of c.people.values()) {
      if (p.vTx) p.vTx.sender.replaceTrack(track).catch(() => {});
    }
    broadcastState();
    renderControls();
    renderTiles();
  }

  // ---------- Звонки: сценарии

  async function joinVoice(channel) {
    if (state.call) return toast('Ты уже в звонке. Сначала выйди из него.');
    await startCall({ room: channel.id, title: channel.name, kind: 'voice' });
    if (state.call && state.call.title === channel.name) send({ t: 'join', room: channel.id });
  }

  async function startDm(user) {
    if (state.call) return toast('Сначала заверши текущий звонок');
    const room = 'dm-' + randomHex(8);
    await startCall({ room, title: user.nick, kind: 'dm', ringTo: user.id, ringing: true });
    const c = state.call;
    if (!c || c.room !== room) return;
    send({ t: 'join', room });
    send({ t: 'ring', room, to: user.id });
    c.timeout = setTimeout(() => {
      if (state.call === c && c.ringing) endCall('Ответа нет');
    }, 40000);
  }

  function onRoomJoined(msg) {
    const c = state.call;
    if (!c || c.room !== msg.room) return;
    c.joined = true;
    for (const info of msg.peers) callPeer(ensurePerson(info));
    renderTiles();
    updateSub();
  }

  function onPeerJoined(msg) {
    const c = state.call;
    if (!c || c.room !== msg.room) return;
    ensurePerson(msg.peer);
    if (c.ringing) {
      c.ringing = false;
      clearTimeout(c.timeout);
    }
    if (c.kind === 'voice') toast(msg.peer.nick + ' в комнате');
    renderTiles();
    updateSub();
  }

  function onPeerLeft(msg) {
    const c = state.call;
    if (!c || c.room !== msg.room) return;
    const p = c.people.get(msg.peerId);
    if (!p) return;
    if (p.pc) p.pc.close();
    c.people.delete(msg.peerId);
    const node = c.tiles.get(msg.peerId);
    if (node) {
      node.remove();
      c.tiles.delete(msg.peerId);
    }
    if (c.kind === 'dm' && c.people.size === 0) return endCall(p.nick + ' завершил звонок');
    renderTiles();
    updateSub();
  }

  function ensurePerson(info) {
    const c = state.call;
    let p = c.people.get(info.id);
    if (!p) {
      p = {
        id: info.id,
        nick: info.nick,
        handle: info.handle || '',
        pc: null,
        stream: null,
        state: { mic: true, cam: false, share: false },
        pending: [],
        remoteSet: false,
        aTx: null,
        vTx: null
      };
      c.people.set(info.id, p);
    }
    return p;
  }

  function createPc(p) {
    if (p.pc) return p.pc;
    const c = state.call;
    const pc = new RTCPeerConnection({ iceServers: state.ice });
    p.pc = pc;
    p.stream = new MediaStream();
    // Трансиверы заранее: дальше камера и экран подменяются через replaceTrack без пересогласования.
    p.aTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    p.vTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    p.aTx.sender.replaceTrack(c.audio).catch(() => {});
    p.vTx.sender.replaceTrack(currentVideo()).catch(() => {});
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(p.id, { kind: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track);
      renderTiles();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') sendSignal(p.id, stateMsg());
      if (pc.connectionState === 'failed') {
        toast('Не удалось соединиться с ' + p.nick + '. Попробуй выйти и зайти снова.', 'error');
      }
      renderTiles();
      updateSub();
    };
    return pc;
  }

  async function callPeer(p) {
    const pc = createPc(p);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(p.id, { kind: 'sdp', sdp: { type: offer.type, sdp: offer.sdp } });
    } catch (err) {
      toast('Не удалось начать соединение с ' + p.nick, 'error');
    }
  }

  async function onSignal(msg) {
    const c = state.call;
    if (!c || c.room !== msg.room) return;
    const data = msg.data || {};
    const known = c.people.get(msg.from);

    if (data.kind === 'state') {
      if (known) {
        known.state = { mic: !!data.mic, cam: !!data.cam, share: !!data.share };
        renderTiles();
      }
      return;
    }
    if (data.kind === 'ember') {
      if (known) toast(known.nick + ' отправил ember');
      return;
    }

    const info = state.online.get(msg.from) || { id: msg.from, nick: 'Участник', handle: '' };
    const p = ensurePerson(info);

    if (data.kind === 'ice') {
      if (!data.candidate) return;
      if (p.pc && p.remoteSet) p.pc.addIceCandidate(data.candidate).catch(() => {});
      else p.pending.push(data.candidate);
      return;
    }

    if (data.kind === 'sdp' && data.sdp) {
      try {
        const pc = createPc(p);
        await pc.setRemoteDescription(data.sdp);
        p.remoteSet = true;
        for (const cand of p.pending.splice(0)) pc.addIceCandidate(cand).catch(() => {});
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(p.id, { kind: 'sdp', sdp: { type: answer.type, sdp: answer.sdp } });
        }
      } catch (err) {
        console.warn('Ошибка SDP', err);
      }
    }
    renderTiles();
  }

  // ---------- Входящие и исходящие вызовы

  function onRinging(msg) {
    if (state.call || state.incoming) {
      send({ t: 'ring-decline', room: msg.room });
      return;
    }
    state.incoming = { room: msg.room, from: msg.from, timer: setTimeout(declineIncoming, 40000) };
    $('incoming-text').textContent = msg.from.nick + ' звонит тебе';
    if (!$('incoming').open) $('incoming').showModal();
  }

  function closeIncoming() {
    const inc = state.incoming;
    if (!inc) return;
    clearTimeout(inc.timer);
    state.incoming = null;
    if ($('incoming').open) $('incoming').close();
  }

  function declineIncoming() {
    const inc = state.incoming;
    if (!inc) return;
    send({ t: 'ring-decline', room: inc.room });
    closeIncoming();
  }

  async function acceptIncoming() {
    const inc = state.incoming;
    if (!inc) return;
    closeIncoming();
    if (state.call) {
      send({ t: 'ring-decline', room: inc.room });
      return;
    }
    await startCall({ room: inc.room, title: inc.from.nick, kind: 'dm' });
    if (!state.call || state.call.room !== inc.room) return;
    send({ t: 'join', room: inc.room });
    send({ t: 'ring-accept', room: inc.room });
  }

  function onRingStatus(msg) {
    const c = state.call;
    if (msg.status === 'offline' && c && c.room === msg.room) endCall('Пользователь сейчас не в сети');
  }

  function onRingDeclined(msg) {
    const c = state.call;
    if (c && c.room === msg.room) endCall((msg.from ? msg.from.nick : 'Собеседник') + ' отклонил звонок');
  }

  function onRingCancelled(msg) {
    if (state.incoming && state.incoming.room === msg.room) {
      closeIncoming();
      toast('Звонок отменён');
    }
  }

  // ---------- Панель управления звонком

  function renderControls() {
    const c = state.call;
    if (!c) return;
    const mic = $('btn-mic');
    mic.textContent = c.audio ? (c.mic ? 'Микрофон' : 'Микрофон выкл.') : 'Нет микрофона';
    mic.setAttribute('aria-pressed', String(c.mic));
    mic.classList.toggle('off', !c.mic);

    const cam = $('btn-cam');
    cam.textContent = c.camOn ? 'Камера' : 'Камера выкл.';
    cam.setAttribute('aria-pressed', String(c.camOn));

    const share = $('btn-share');
    share.textContent = c.sharing ? 'Остановить показ' : 'Экран';
    share.setAttribute('aria-pressed', String(c.sharing));

    const chat = $('btn-chat');
    chat.setAttribute('aria-pressed', String(c.chatOpen));

    $('ember-count').textContent = String(c.embers);
  }

  async function toggleMic() {
    const c = state.call;
    if (!c) return;
    if (!c.audio) return toast('Микрофон недоступен', 'error');
    c.mic = !c.mic;
    c.audio.enabled = c.mic;
    broadcastState();
    renderControls();
    renderTiles();
  }

  async function toggleCam() {
    const c = state.call;
    if (!c) return;
    if (c.camOn) {
      stopTrack(c.cam);
      c.cam = null;
      c.camOn = false;
      return syncVideo();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } }
      });
      if (state.call !== c) {
        stream.getTracks().forEach(stopTrack);
        return;
      }
      c.cam = stream.getVideoTracks()[0];
      c.camOn = true;
      syncVideo();
    } catch (err) {
      toast('Камера недоступна. Проверь разрешения в браузере.', 'error');
    }
  }

  async function toggleShare() {
    const c = state.call;
    if (!c) return;
    if (c.sharing) return stopShare();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      return toast('Показ экрана недоступен в этом браузере', 'error');
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (state.call !== c) {
        stream.getTracks().forEach(stopTrack);
        return;
      }
      c.share = stream.getVideoTracks()[0];
      c.share.addEventListener('ended', stopShare);
      c.sharing = true;
      syncVideo();
    } catch (err) {
      toast('Экран не открыт');
    }
  }

  function stopShare() {
    const c = state.call;
    if (!c || !c.sharing) return;
    stopTrack(c.share);
    c.share = null;
    c.sharing = false;
    syncVideo();
  }

  function toggleCallChat() {
    const c = state.call;
    if (!c) return;
    c.chatOpen = !c.chatOpen;
    $('call-chat').hidden = !c.chatOpen;
    renderControls();
    renderMessages();
  }

  function sendEmber() {
    const c = state.call;
    if (!c) return;
    c.embers += 1;
    for (const p of c.people.values()) {
      if (p.pc) sendSignal(p.id, { kind: 'ember' });
    }
    renderControls();
  }

  // ---------- Плитки участников

  function makeTile() {
    return el('div', { class: 'tile' },
      el('video', { autoplay: true, playsinline: true }),
      el('span', { class: 'tile-avatar', 'aria-hidden': 'true' }),
      el('div', { class: 'tile-label' },
        el('span', { class: 'tile-name' }),
        el('span', { class: 'tile-flags' })));
  }

  function renderTiles() {
    const c = state.call;
    if (!c || !state.me) return;
    const host = $('tiles');
    const entries = [{ id: 'self', self: true, name: state.me.nick + ' (ты)' }];
    for (const p of c.people.values()) entries.push({ id: p.id, self: false, p, name: p.nick });

    const keep = new Set(entries.map((e) => e.id));
    for (const [id, node] of c.tiles) {
      if (!keep.has(id)) {
        node.remove();
        c.tiles.delete(id);
      }
    }
    for (const e of entries) {
      let node = c.tiles.get(e.id);
      if (!node) {
        node = makeTile();
        c.tiles.set(e.id, node);
        host.append(node);
      }
      updateTile(node, e);
    }
  }

  function updateTile(node, e) {
    const c = state.call;
    const video = node.querySelector('video');
    const avatar = node.querySelector('.tile-avatar');
    const nameEl = node.querySelector('.tile-name');
    const flags = node.querySelector('.tile-flags');

    let hasVideo;
    let micOn;
    let sharing;
    let nick;
    let id;

    if (e.self) {
      const track = currentVideo();
      hasVideo = !!track;
      micOn = c.mic;
      sharing = c.sharing;
      nick = state.me.nick;
      id = state.me.id;
      const key = track ? track.id : '';
      if (node.dataset.key !== key) {
        node.dataset.key = key;
        video.srcObject = track ? new MediaStream([track]) : null;
      }
      video.muted = true;
    } else {
      const p = e.p;
      hasVideo = p.state.cam || p.state.share;
      micOn = p.state.mic;
      sharing = p.state.share;
      nick = p.nick;
      id = p.id;
      if (p.stream && video.srcObject !== p.stream) video.srcObject = p.stream;
      video.muted = false;
    }

    node.classList.toggle('no-video', !hasVideo);
    node.classList.toggle('self', e.self);
    avatar.textContent = initial(nick);
    avatar.style.background = colorFor(id);
    nameEl.textContent = e.name;

    const notes = [];
    if (!micOn) notes.push('без микрофона');
    if (sharing) notes.push('показывает экран');
    if (!e.self && !(e.p.pc && e.p.pc.connectionState === 'connected')) notes.push('соединяем…');
    flags.textContent = notes.join(' · ');
  }

  // ---------- Старт

  function bind() {
    $('login-form').addEventListener('submit', onLogin);
    $('composer').addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat($('composer-input'));
    });
    $('call-composer').addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat($('call-input'));
    });
    $('menu-btn').addEventListener('click', toggleMenu);
    $('open-settings').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', () => $('settings').close());
    $('nick-form').addEventListener('submit', onNickSubmit);
    $('density').addEventListener('change', (e) => {
      state.prefs.density = e.target.value;
      savePrefs();
      applyPrefs();
    });
    $('pref-group').addEventListener('change', (e) => {
      state.prefs.groupMessages = e.target.checked;
      savePrefs();
      renderMessages();
    });
    $('pref-times').addEventListener('change', (e) => {
      state.prefs.showTimes = e.target.checked;
      savePrefs();
      applyPrefs();
      renderMessages();
    });
    $('logout').addEventListener('click', logout);
    $('btn-accept').addEventListener('click', acceptIncoming);
    $('btn-decline').addEventListener('click', declineIncoming);
    $('incoming').addEventListener('cancel', (e) => {
      e.preventDefault();
      declineIncoming();
    });
    $('btn-mic').addEventListener('click', toggleMic);
    $('btn-cam').addEventListener('click', toggleCam);
    $('btn-share').addEventListener('click', toggleShare);
    $('btn-chat').addEventListener('click', toggleCallChat);
    $('btn-ember').addEventListener('click', sendEmber);
    $('btn-leave').addEventListener('click', () => endCall(''));
  }

  async function boot() {
    bind();
    applyPrefs();
    try {
      const res = await fetch(api('config'), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers)) state.ice = data.iceServers;
      }
    } catch (err) {
      /* останемся на STUN по умолчанию */
    }
    if (state.token) connect();
    else showLogin();
  }

  boot();
})();

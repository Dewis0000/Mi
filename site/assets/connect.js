/* StreOps Connect: серверы с текстовыми каналами, личные сообщения, ответы, реакции, роли и приглашения.
   Работает поверх маршрутов connect.* (server/app/lib/connect.php). Один файл, без сборки и без сторонних библиотек.
   Весь пользовательский текст выводится через esc(): разметка собирается только из экранированных кусков. */
(function () {
  'use strict';

  const RANK = { member: 1, admin: 2, owner: 3 };
  const ROLE_TITLE = { owner: 'Владелец', admin: 'Администраторы', member: 'Участники' };
  const PALETTE = ['#5B7C99', '#7C5B99', '#99785B', '#5B9978', '#995B6E', '#6E7C99', '#8A6E3F', '#3F8A7A'];
  const GAP_COMPACT = 420; // секунд: сообщения одного автора подряд склеиваем в одну группу

  const S = {
    me: null, servers: [], dms: [], limits: { text: 2000, emoji: ['👍', '❤️', '😂', '🔥', '😮', '😢', '🎉', '👀'] },
    server: null, channels: [], members: [], channel: 0, dm: null,
    messages: [], hasMore: false, typing: [], manage: false,
    replyTo: null, editId: null, drafts: {}, lastSig: '', lastRead: 0, lastTyping: 0,
    forceBottom: false, routeId: 0, view: '', showMembers: true, sideOpen: false,
  };

  // ---------- помощники разметки ----------
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v; // только строки из fmt(), где весь пользовательский текст экранирован
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function avatar(name, size) {
    const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    let hash = 0;
    for (const c of String(name || '')) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return h('span', { class: 'cx-av', 'aria-hidden': 'true', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${PALETTE[hash % PALETTE.length]}` }, letter);
  }

  function dot(online) {
    return h('span', { class: 'cx-dot' + (online ? ' cx-on' : ''), title: online ? 'В сети' : 'Не в сети', 'aria-label': online ? 'В сети' : 'Не в сети' });
  }

  function notify(text, kind) {
    if (window.StreAPI && window.StreAPI.toast) window.StreAPI.toast(text, kind);
  }

  async function act(promise) {
    try { return await promise; } catch (e) { notify(e.message, 'error'); return null; }
  }

  const api = {
    get: (r, q) => window.StreAPI.get(r, q),
    post: (r, b) => window.StreAPI.post(r, b),
  };

  // ---------- форматирование текста: **жирный**, *курсив*, ~~зачёркнутый~~, `код`, ```блок```, > цитата, ссылки, @ник ----------
  function fmtInline(raw, me) {
    const slots = [];
    const keep = (html) => { slots.push(html); return '\u0001' + (slots.length - 1) + '\u0001'; };
    let s = esc(raw);
    s = s.replace(/`([^`\n]+)`/g, (_, c) => keep('<code>' + c + '</code>'));
    s = s.replace(/https?:\/\/[^\s<]+/g, (u) => {
      const m = u.match(/^(.*?)([.,!?)\]]*)$/);
      return keep('<a href="' + m[1] + '" target="_blank" rel="noopener noreferrer">' + m[1] + '</a>' + m[2]);
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?])/g, '$1<i>$2</i>');
    s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>');
    s = s.replace(/(^|\s)@([\p{L}\p{N}_]{2,40})/gu, (_, sp, login) =>
      sp + keep('<span class="cx-mention' + (me && login.toLowerCase() === me.login ? ' cx-mention-me' : '') + '">@' + login + '</span>'));
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => slots[Number(i)]);
  }

  function fmt(raw, me) {
    return String(raw).split('```').map((part, i) => {
      if (i % 2) return '<pre class="cx-pre">' + esc(part.replace(/^\n|\n$/g, '')) + '</pre>';
      return part.split('\n').map((line) => (/^> /.test(line)
        ? '<span class="cx-quote">' + fmtInline(line.slice(2), me) + '</span>'
        : fmtInline(line, me))).join('<br>');
    }).join('');
  }

  // ---------- время ----------
  function dayLabel(ts) {
    const d = new Date(ts * 1000);
    const today = new Date();
    const yest = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === yest.toDateString()) return 'Вчера';
    return window.StreAPI.fmtDate(ts);
  }

  // ---------- маршруты: #s/<сервер>/c/<канал>, #d/<личный чат>, пусто — главный экран ----------
  function parseHash() {
    const m = location.hash.replace(/^#/, '');
    let x = m.match(/^s\/(\d+)(?:\/c\/(\d+))?$/);
    if (x) return { kind: 's', sid: Number(x[1]), cid: x[2] ? Number(x[2]) : 0 };
    x = m.match(/^d\/(\d+)$/);
    if (x) return { kind: 'd', did: Number(x[1]) };
    return { kind: 'home' };
  }

  function viewKey() {
    if (S.dm) return 'd:' + S.dm.id;
    if (S.server && S.channel) return 'c:' + S.channel;
    return '';
  }

  // ---------- загрузка ----------
  async function loadState() {
    const st = await act(api.get('connect.state'));
    if (!st) return false;
    S.me = st.me;
    S.servers = st.servers;
    S.dms = st.dms;
    S.limits = st.limits;
    document.title = (totalUnread() ? '(' + totalUnread() + ') ' : '') + 'StreOps Connect';
    renderRail();
    renderSide();
    return true;
  }

  function totalUnread() {
    return S.servers.reduce((n, s) => n + s.unread, 0) + S.dms.reduce((n, d) => n + d.unread, 0);
  }

  async function loadServer(sid) {
    const sv = await act(api.get('connect.server.get', { id: sid }));
    if (!sv) return false;
    S.server = sv.server;
    S.channels = sv.channels;
    S.members = sv.members;
    S.manage = RANK[sv.server.role] >= RANK.admin;
    return true;
  }

  function scopeParams() {
    if (S.dm) return { scope: 'd', id: S.dm.id };
    return { scope: 'c', id: S.channel };
  }

  // Последние сообщения чата. Старые, подгруженные по кнопке, сохраняем; новые приходят сверху
  async function refreshMessages(forceScroll) {
    const key = viewKey();
    if (!key) return;
    const r = await act(api.get('connect.messages', scopeParams()));
    if (!r || key !== viewKey()) return;
    const sig = JSON.stringify([r.messages, r.typing, r.manage]);
    S.manage = !!r.manage;
    S.typing = r.typing || [];
    if (sig !== S.lastSig) {
      const oldest = r.messages.length ? r.messages[0].id : Infinity;
      const older = S.messages.filter((m) => m.id < oldest);
      S.messages = older.concat(r.messages);
      S.hasMore = older.length ? S.hasMore : !!r.hasMore;
      S.lastSig = sig;
      renderMessages(forceScroll || S.forceBottom);
      S.forceBottom = false;
    }
    renderTyping();
    markRead();
  }

  async function loadOlder() {
    if (!S.messages.length || !S.hasMore) return;
    const key = viewKey();
    const params = Object.assign({ before: S.messages[0].id }, scopeParams());
    const r = await act(api.get('connect.messages', params));
    if (!r || key !== viewKey()) return;
    const list = document.querySelector('.cx-list');
    const before = list.scrollHeight;
    S.messages = r.messages.concat(S.messages);
    S.hasMore = r.hasMore;
    renderMessages(false);
    list.scrollTop += list.scrollHeight - before;
  }

  function markRead() {
    const key = viewKey();
    const last = S.messages.length ? S.messages[S.messages.length - 1].id : 0;
    if (!key || !last || last <= S.lastRead || document.hidden || !isNearBottom()) return;
    S.lastRead = last;
    const p = scopeParams();
    api.post('connect.read', { scope: p.scope, id: p.id, last }).then(() => loadState()).catch(() => {});
  }

  // ---------- оформление: строки, группы, шапка ----------
  let root = null;

  function isNearBottom() {
    const list = document.querySelector('.cx-list');
    return !list || list.scrollHeight - list.scrollTop - list.clientHeight < 90;
  }

  function scrollBottom() {
    const list = document.querySelector('.cx-list');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function renderShell() {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    root.append(h('div', { class: 'cx-app' },
      h('nav', { class: 'cx-rail', 'aria-label': 'Серверы и личные сообщения' },
        h('button', { type: 'button', class: 'cx-rb cx-home', 'aria-label': 'Личные сообщения', title: 'Личные сообщения', onclick: () => go('#') }, 'ЛС'),
        h('div', { class: 'cx-rail-list' }),
        h('button', { type: 'button', class: 'cx-rb', 'aria-label': 'Создать сервер', title: 'Создать сервер', onclick: createServer }, '+'),
        h('button', { type: 'button', class: 'cx-rb', 'aria-label': 'Войти по приглашению', title: 'Войти по приглашению', onclick: joinDialog }, '↗'),
        h('a', { class: 'cx-rb', href: 'panel.html', 'aria-label': 'Назад в панель', title: 'Назад в панель' }, '←')),
      h('aside', { class: 'cx-side', 'aria-label': 'Каналы и личные чаты' }),
      h('main', { class: 'cx-main' },
        h('header', { class: 'cx-top' },
          h('button', { type: 'button', class: 'cx-ib cx-side-t', 'aria-label': 'Список каналов', onclick: () => { S.sideOpen = !S.sideOpen; root.classList.toggle('cx-side-open', S.sideOpen); } }, '☰'),
          h('div', { class: 'cx-title' }),
          h('div', { class: 'cx-tools' },
            h('button', { type: 'button', class: 'cx-ib', 'aria-label': 'Поиск по чату', title: 'Поиск по чату (Ctrl+K — переход)', onclick: searchDialog }, '⌕'),
            h('button', { type: 'button', class: 'cx-ib cx-mem-t', 'aria-label': 'Показать участников', title: 'Участники', onclick: () => { S.showMembers = !S.showMembers; root.classList.toggle('cx-hide-members', !S.showMembers); } }, '◉'))),
        h('div', { class: 'cx-list', role: 'log', 'aria-label': 'Сообщения', onscroll: onListScroll }),
        h('div', { class: 'cx-jump' }, h('button', { type: 'button', class: 'cx-btn', onclick: () => { scrollBottom(); updateJump(); } }, 'Новые сообщения ↓')),
        h('div', { class: 'cx-typing', 'aria-live': 'polite' }),
        h('div', { class: 'cx-composer' })),
      h('aside', { class: 'cx-members', 'aria-label': 'Участники сервера' })));
    renderComposer();
  }

  function onListScroll() {
    if (isNearBottom()) markRead();
    updateJump();
  }

  function updateJump() {
    const j = document.querySelector('.cx-jump');
    if (j) j.classList.toggle('cx-show', !isNearBottom() && S.messages.length > 0);
  }

  function renderRail() {
    if (!root || !root.dataset.ready) return;
    const list = root.querySelector('.cx-rail-list');
    list.textContent = '';
    for (const s of S.servers) {
      const active = S.server && S.server.id === s.id;
      list.append(h('a', { href: '#s/' + s.id, class: 'cx-rb cx-srv' + (active ? ' cx-active' : ''), 'aria-label': s.name + (s.unread ? ', непрочитанных: ' + s.unread : ''), title: s.name },
        initials(s.name), s.unread ? h('span', { class: 'cx-badge' }, s.unread > 99 ? '99+' : String(s.unread)) : null));
    }
    const homeBtn = root.querySelector('.cx-home');
    homeBtn.classList.toggle('cx-active', !S.server);
    const dmUnread = S.dms.reduce((n, d) => n + d.unread, 0);
    homeBtn.querySelectorAll('.cx-badge').forEach((b) => b.remove());
    if (dmUnread) homeBtn.append(h('span', { class: 'cx-badge' }, dmUnread > 99 ? '99+' : String(dmUnread)));
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();
  }

  function renderSide() {
    if (!root || !root.dataset.ready) return;
    const side = root.querySelector('.cx-side');
    side.textContent = '';
    if (S.server) {
      const role = S.server.role;
      side.append(h('button', { type: 'button', class: 'cx-srv-head', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: serverMenu },
        h('span', { class: 'cx-srv-name' }, S.server.name), h('span', { class: 'cx-caret' }, '▾')));
      const list = h('div', { class: 'cx-chlist' }, h('p', { class: 'cx-sect' }, 'Текстовые каналы'));
      for (const c of S.channels) {
        const active = S.channel === c.id && !S.dm;
        list.append(h('div', { class: 'cx-chrow' + (active ? ' cx-active' : '') },
          h('a', { href: '#s/' + S.server.id + '/c/' + c.id, class: 'cx-ch', 'aria-current': active ? 'true' : null },
            h('span', { class: 'cx-hash', 'aria-hidden': 'true' }, '#'), h('span', { class: 'cx-chname' }, c.name),
            c.unread && !active ? h('span', { class: 'cx-badge' }, c.unread > 99 ? '99+' : String(c.unread)) : null),
          RANK[role] >= RANK.admin ? h('span', { class: 'cx-chtools' },
            h('button', { type: 'button', class: 'cx-mini', 'aria-label': 'Переименовать канал ' + c.name, onclick: () => renameChannel(c) }, '✎'),
            h('button', { type: 'button', class: 'cx-mini', 'aria-label': 'Удалить канал ' + c.name, onclick: () => deleteChannel(c) }, '×')) : null));
      }
      if (RANK[role] >= RANK.admin) list.append(h('button', { type: 'button', class: 'cx-addch', onclick: createChannel }, '+ Создать канал'));
      side.append(list);
    } else {
      side.append(h('div', { class: 'cx-srv-head cx-plain' }, h('span', { class: 'cx-srv-name' }, 'Личные сообщения'),
        h('button', { type: 'button', class: 'cx-ib', 'aria-label': 'Написать пользователю', title: 'Написать', onclick: newDmDialog }, '+')));
      const list = h('div', { class: 'cx-chlist' });
      if (!S.dms.length) list.append(h('p', { class: 'cx-hint' }, 'Личных чатов пока нет. Написать можно тем, с кем вы на одном сервере.'));
      for (const d of S.dms) {
        const active = S.dm && S.dm.id === d.id;
        list.append(h('a', { href: '#d/' + d.id, class: 'cx-dm' + (active ? ' cx-active' : ''), 'aria-current': active ? 'true' : null },
          avatar(d.peer.name, 28), h('span', { class: 'cx-dmtxt' },
            h('span', { class: 'cx-dmname' }, d.peer.name), h('span', { class: 'cx-dmlast' }, d.last || 'Нет сообщений')),
          d.unread && !active ? h('span', { class: 'cx-badge' }, d.unread > 99 ? '99+' : String(d.unread)) : null));
      }
      side.append(list);
    }
    side.append(h('div', { class: 'cx-me' }, avatar(S.me ? S.me.name : '?', 30),
      h('span', { class: 'cx-me-name' }, S.me ? S.me.name : ''), h('span', { class: 'cx-me-login' }, S.me ? '@' + S.me.login : '')));
  }

  function renderHeader() {
    const t = root.querySelector('.cx-title');
    t.textContent = '';
    if (S.dm) t.append(h('span', { class: 'cx-hash' }, '@'), h('strong', {}, S.dm.peer.name), h('span', { class: 'cx-sub' }, S.dm.peer.online ? 'в сети' : 'не в сети'));
    else if (S.server && S.channel) {
      const c = S.channels.find((x) => x.id === S.channel);
      t.append(h('span', { class: 'cx-hash' }, '#'), h('strong', {}, c ? c.name : ''), h('span', { class: 'cx-sub' }, S.server.name));
    } else t.append(h('strong', {}, 'StreOps Connect'));
    root.querySelector('.cx-mem-t').style.display = S.server ? '' : 'none';
  }

  function renderMembers() {
    const box = root.querySelector('.cx-members');
    box.textContent = '';
    if (!S.server) return;
    for (const role of ['owner', 'admin', 'member']) {
      const group = S.members.filter((m) => m.role === role);
      if (!group.length) continue;
      box.append(h('p', { class: 'cx-sect' }, ROLE_TITLE[role] + ' — ' + group.length));
      for (const m of group) {
        box.append(h('button', { type: 'button', class: 'cx-member', onclick: () => memberMenu(m), 'aria-label': m.name + ', ' + (m.online ? 'в сети' : 'не в сети') },
          avatar(m.name, 32), h('span', { class: 'cx-mtxt' }, h('span', { class: 'cx-mname' }, m.name), h('span', { class: 'cx-mlogin' }, '@' + m.login)), dot(m.online)));
      }
    }
  }

  function renderTyping() {
    const box = root.querySelector('.cx-typing');
    if (!box) return;
    box.textContent = '';
    if (!S.typing.length) return;
    const names = S.typing.length > 3 ? S.typing.slice(0, 3).join(', ') + ' и ещё ' + (S.typing.length - 3) : S.typing.join(', ');
    box.append(h('span', {}, names + (S.typing.length > 1 ? ' печатают…' : ' печатает…')));
  }

  function groupsFromMessages() {
    const out = [];
    let lastDay = '';
    let prev = null;
    for (const m of S.messages) {
      const day = new Date(m.at * 1000).toDateString();
      if (day !== lastDay) { lastDay = day; out.push({ kind: 'day', label: dayLabel(m.at) }); prev = null; }
      const compact = !!prev && prev.user.id === m.user.id && !m.replyTo && m.at - prev.at < GAP_COMPACT;
      out.push({ kind: 'msg', m, compact });
      prev = m;
    }
    return out;
  }

  function renderMessages(scroll) {
    const list = root.querySelector('.cx-list');
    if (!list) return;
    const wasBottom = isNearBottom();
    list.textContent = '';
    renderHeader();
    if (S.hasMore) list.append(h('button', { type: 'button', class: 'cx-more', onclick: loadOlder }, 'Показать более ранние сообщения'));
    if (!S.messages.length) {
      list.append(h('div', { class: 'cx-empty' }, h('h3', {}, S.dm ? 'Личный чат начат' : 'Здесь пока тихо'),
        h('p', {}, S.dm ? 'Напиши первое сообщение: его увидит только собеседник.' : 'Напиши первое сообщение в канал.')));
    }
    for (const g of groupsFromMessages()) {
      if (g.kind === 'day') list.append(h('div', { class: 'cx-day' }, h('span', {}, g.label)));
      else list.append(messageRow(g.m, g.compact));
    }
    renderMembers();
    if (scroll || wasBottom) scrollBottom();
    updateJump();
  }

  function messageRow(m, compact) {
    const me = S.me;
    const row = h('div', { class: 'cx-msg' + (compact ? ' cx-compact' : '') + (m.mine ? ' cx-mine' : '') + (m.deleted ? ' cx-del' : ''), 'data-id': String(m.id) });
    if (m.replyTo) {
      row.append(h('button', { type: 'button', class: 'cx-reply', onclick: () => jumpTo(m.replyTo.id) },
        h('span', { class: 'cx-rn' }, m.replyTo.name), ' ',
        h('span', { class: 'cx-rt' }, m.replyTo.deleted ? 'Сообщение удалено' : m.replyTo.text.replace(/\s+/g, ' '))));
    }
    const gutter = compact
      ? h('span', { class: 'cx-time-c' }, window.StreAPI.fmtTime(m.at))
      : avatar(m.user.name, 40);
    const head = compact ? null : h('div', { class: 'cx-head' },
      h('span', { class: 'cx-name' + (m.mine ? ' cx-name-me' : '') }, m.user.name),
      h('time', { class: 'cx-time', datetime: new Date(m.at * 1000).toISOString() }, window.StreAPI.fmtTime(m.at)));
    const body = m.deleted
      ? h('div', { class: 'cx-body cx-deleted' }, 'Сообщение удалено')
      : h('div', { class: 'cx-body', html: fmt(m.text, me) + (m.editedAt ? ' <span class="cx-edited">(изменено)</span>' : '') });
    const content = h('div', { class: 'cx-content' }, head, body, reactionsRow(m));
    row.append(gutter, content);
    const tb = toolbar(m);
    if (tb) row.append(tb);
    return row;
  }

  function reactionsRow(m) {
    if (!m.reactions || !m.reactions.length || m.deleted) return null;
    return h('div', { class: 'cx-reacts' }, m.reactions.map((r) => h('button', {
      type: 'button', class: 'cx-chip' + (r.mine ? ' cx-chip-on' : ''), 'aria-pressed': r.mine ? 'true' : 'false',
      'aria-label': r.emoji + ' ' + r.count, onclick: () => react(m, r.emoji),
    }, r.emoji + ' ' + r.count)));
  }

  function toolbar(m) {
    const items = [];
    if (!m.deleted) {
      items.push(['↩', 'Ответить', () => setReply(m)]);
      items.push(['☺', 'Добавить реакцию', (e) => openPicker(e.currentTarget, (emoji) => react(m, emoji))]);
      items.push(['⧉', 'Копировать текст', () => copyText(m.text)]);
    }
    if (m.mine && !m.deleted) items.push(['✎', 'Изменить', () => startEdit(m)]);
    if (!m.deleted && (m.mine || S.manage)) items.push(['🗑', 'Удалить', () => removeMessage(m)]);
    if (!items.length) return null;
    return h('div', { class: 'cx-tb', role: 'toolbar', 'aria-label': 'Действия с сообщением' },
      items.map(([ic, label, fn]) => h('button', { type: 'button', class: 'cx-tbb', 'aria-label': label, title: label, onclick: fn }, ic)));
  }

  function jumpTo(id) {
    const el = root.querySelector('.cx-msg[data-id="' + id + '"]');
    if (!el) return notify('Это сообщение выше загруженных — подгрузи ранние', 'error');
    el.scrollIntoView({ block: 'center' });
    el.classList.add('cx-flash');
    setTimeout(() => el.classList.remove('cx-flash'), 1200);
  }

  // ---------- поле ввода ----------
  function renderComposer() {
    const box = root.querySelector('.cx-composer');
    box.textContent = '';
    const key = viewKey();
    if (!key) return;
    const label = S.dm ? '@' + S.dm.peer.name : '#' + ((S.channels.find((c) => c.id === S.channel) || {}).name || '');
    const banner = S.editId
      ? h('div', { class: 'cx-banner' }, h('span', {}, 'Редактируешь сообщение · Esc — отмена'), h('button', { type: 'button', class: 'cx-mini', 'aria-label': 'Отменить редактирование', onclick: cancelAction }, '×'))
      : S.replyTo
        ? h('div', { class: 'cx-banner' }, h('span', {}, 'Ответ для ', h('strong', {}, S.replyTo.user.name)), h('button', { type: 'button', class: 'cx-mini', 'aria-label': 'Отменить ответ', onclick: cancelAction }, '×'))
        : null;
    const input = h('textarea', { class: 'cx-input', rows: '1', 'aria-label': 'Сообщение', placeholder: 'Написать в ' + label, oninput: onTyping, onkeydown: onKey });
    input.value = S.drafts[key] || '';
    const counter = h('span', { class: 'cx-count', 'aria-live': 'off' }, '');
    const send = h('button', { type: 'button', class: 'cx-btn cx-send', 'aria-label': 'Отправить', onclick: submit }, S.editId ? 'Сохранить' : 'Отправить');
    box.append(...[banner, h('div', { class: 'cx-row' }, input, send), h('div', { class: 'cx-foot' },
      h('span', { class: 'cx-hint' }, 'Enter — отправить · Shift+Enter — перенос · ↑ — правка последнего'), counter)].filter(Boolean));
    input.addEventListener('input', () => { S.drafts[key] = input.value; updateCount(input, counter); autosize(input); });
    if (S.editId) input.value = S.messages.find((m) => m.id === S.editId) ? S.messages.find((m) => m.id === S.editId).text : input.value;
    autosize(input);
    updateCount(input, counter);
    if (!S.editId && !S.replyTo) input.focus({ preventScroll: true });
    if (S.editId || S.replyTo) input.focus({ preventScroll: true });
  }

  function updateCount(input, counter) {
    const n = input.value.length;
    counter.textContent = n > S.limits.text - 200 ? n + ' / ' + S.limits.text : '';
  }

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }

  let lastTypingSent = 0;
  function onTyping(e) {
    const now = Date.now();
    if (!viewKey() || e.target.value.trim() === '') return;
    if (now - lastTypingSent < 4000) return;
    lastTypingSent = now;
    const p = scopeParams();
    api.post('connect.typing', { scope: p.scope, id: p.id, on: true }).catch(() => {});
  }

  function onKey(e) {
    const input = e.target;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape' && (S.replyTo || S.editId)) { e.preventDefault(); cancelAction(); return; }
    if (e.key === 'ArrowUp' && input.value === '' && !S.editId) {
      const mine = S.messages.filter((m) => m.mine && !m.deleted);
      if (mine.length) { e.preventDefault(); startEdit(mine[mine.length - 1]); }
    }
  }

  function cancelAction() {
    S.replyTo = null;
    S.editId = null;
    renderComposer();
  }

  async function submit() {
    const key = viewKey();
    const input = root.querySelector('.cx-input');
    if (!key || !input) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > S.limits.text) return notify('Сообщение длиннее ' + S.limits.text + ' символов', 'error');
    const p = scopeParams();
    if (S.editId) {
      const r = await act(api.post('connect.edit', { id: S.editId, text }));
      if (!r) return;
      S.editId = null;
    } else {
      const r = await act(api.post('connect.send', { scope: p.scope, id: p.id, text, replyTo: S.replyTo ? S.replyTo.id : 0 }));
      if (!r) return;
      S.replyTo = null;
      S.forceBottom = true;
    }
    S.drafts[key] = '';
    S.lastSig = '';
    renderComposer();
    await refreshMessages(true);
    loadState();
  }

  function setReply(m) {
    S.editId = null;
    S.replyTo = m;
    renderComposer();
  }

  function startEdit(m) {
    S.replyTo = null;
    S.editId = m.id;
    renderComposer();
    const input = root.querySelector('.cx-input');
    if (input) { input.value = m.text; autosize(input); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  async function react(m, emoji) {
    const r = await act(api.post('connect.react', { id: m.id, emoji }));
    if (!r) return;
    S.messages = S.messages.map((x) => (x.id === m.id ? r.message : x));
    S.lastSig = '';
    renderMessages(false);
  }

  async function removeMessage(m) {
    if (!window.confirm('Удалить сообщение?')) return;
    const r = await act(api.post('connect.delete', { id: m.id }));
    if (!r) return;
    S.lastSig = '';
    refreshMessages(false);
  }

  function copyText(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => notify('Текст скопирован')).catch(() => notify('Не удалось скопировать', 'error'));
    else notify('Браузер не даёт копировать', 'error');
  }

  // Выбор реакции: всплывающая панель у кнопки
  function openPicker(anchor, onPick) {
    closePopups();
    const pop = h('div', { class: 'cx-pop cx-picker', role: 'menu', 'aria-label': 'Реакции' },
      S.limits.emoji.map((e) => h('button', { type: 'button', class: 'cx-emo', role: 'menuitem', 'aria-label': 'Реакция ' + e, onclick: () => { closePopups(); onPick(e); } }, e)));
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - 120)) + 'px';
    pop.querySelector('button').focus();
  }

  function closePopups() {
    document.querySelectorAll('.cx-pop').forEach((p) => p.remove());
  }

  // Меню сервера (▾ у названия)
  function serverMenu(e) {
    closePopups();
    const role = S.server.role;
    const items = [];
    if (RANK[role] >= RANK.admin) {
      items.push(['Пригласить по ссылке', inviteDialog]);
      items.push(['Создать канал', createChannel]);
      items.push(['Переименовать сервер', renameServer]);
    }
    if (role === 'owner') items.push(['Удалить сервер', deleteServer]);
    else items.push(['Выйти с сервера', leaveServer]);
    const pop = h('div', { class: 'cx-pop cx-menu', role: 'menu' }, items.map(([label, fn]) =>
      h('button', { type: 'button', role: 'menuitem', class: label.startsWith('Удалить') || label.startsWith('Выйти') ? 'cx-danger' : '', onclick: () => { closePopups(); fn(); } }, label)));
    document.body.append(pop);
    const r = e.currentTarget.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, r.left) + 'px';
    pop.querySelector('button').focus();
  }

  // Действия с участником: личное сообщение, роль, исключение
  function memberMenu(m) {
    const me = S.me;
    const isMe = me && m.login === me.login;
    const role = S.server.role;
    const items = [];
    if (!isMe) items.push(['Написать в личку', () => openDmWith(m.login)]);
    if (role === 'owner' && m.role !== 'owner') {
      items.push([m.role === 'admin' ? 'Снять роль администратора' : 'Сделать администратором', () => setRole(m, m.role === 'admin' ? 'member' : 'admin')]);
    }
    const canKick = !isMe && m.role !== 'owner' && RANK[role] >= RANK.admin && !(m.role === 'admin' && role !== 'owner');
    if (canKick) items.push(['Исключить с сервера', () => kick(m)]);
    if (!items.length) return;
    modal('@' + m.login, (body) => {
      body.append(h('div', { class: 'cx-mprof' }, avatar(m.name, 56), h('div', {}, h('strong', {}, m.name), h('p', { class: 'cx-hint' }, ROLE_TITLE[m.role] + ' · ' + (m.online ? 'в сети' : 'не в сети')))));
    }, items.map(([label, fn]) => ({ label, fn, danger: label.startsWith('Исключить') })));
  }

  // ---------- диалоги ----------
  function modal(title, build, actions) {
    closePopups();
    const close = () => { ov.remove(); document.removeEventListener('keydown', onEsc); };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    const body = h('div', { class: 'cx-mbody' });
    if (build) build(body);
    const btns = h('div', { class: 'cx-mact' }, (actions || []).map((a) => h('button', {
      type: 'button', class: a.primary ? 'cx-btn' : (a.danger ? 'cx-btn cx-btn-danger' : 'cx-btn-ghost'),
      onclick: async () => { const keep = await a.fn(close, body); if (keep !== true) close(); },
    }, a.label)), h('button', { type: 'button', class: 'cx-btn-ghost', onclick: close }, 'Закрыть'));
    const ov = h('div', { class: 'cx-ov', onclick: (e) => { if (e.target === ov) close(); } },
      h('div', { class: 'cx-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', { class: 'cx-mt' }, title), body, btns));
    document.body.append(ov);
    document.addEventListener('keydown', onEsc);
    const first = ov.querySelector('input, textarea, button');
    if (first) first.focus();
    return close;
  }

  function field(label, input) {
    return h('label', { class: 'cx-field' }, h('span', { class: 'cx-lbl' }, label), input);
  }

  function textInput(value, placeholder, max) {
    return h('input', { type: 'text', class: 'cx-in', value: value || '', placeholder: placeholder || '', maxlength: max || 80 });
  }

  function createServer() {
    modal('Новый сервер', (body) => {
      body.append(field('Название', textInput('', 'Например, Наш клуб', 64)));
    }, [{ label: 'Создать', primary: true, fn: async (close, body) => {
      const name = body.querySelector('input').value.trim();
      const r = await act(api.post('connect.server.create', { name }));
      if (!r) return true;
      await loadState();
      close();
      go('#s/' + r.server.id);
    } }]);
  }

  function joinDialog() {
    modal('Войти по приглашению', (body) => {
      body.append(field('Ссылка или код приглашения', textInput('', 'connect.html#join=…', 300)));
    }, [{ label: 'Войти', primary: true, fn: async (close, body) => {
      const code = body.querySelector('input').value.trim().split(/[\/=#?&\s]+/).filter(Boolean).pop() || '';
      const r = await act(api.post('connect.server.join', { invite: code }));
      if (!r) return true;
      await loadState();
      close();
      go('#s/' + r.server.id);
    } }]);
  }

  function createChannel() {
    modal('Новый канал', (body) => {
      body.append(field('Название', textInput('', 'например, мемы', 40)));
    }, [{ label: 'Создать', primary: true, fn: async (close, body) => {
      const name = body.querySelector('input').value.trim();
      const r = await act(api.post('connect.channel.create', { server: S.server.id, name }));
      if (!r) return true;
      close();
      await loadServer(S.server.id);
      go('#s/' + S.server.id + '/c/' + r.channel.id);
      renderSide();
    } }]);
  }

  function renameChannel(c) {
    modal('Переименовать канал', (body) => {
      body.append(field('Название', textInput(c.name, '', 40)));
    }, [{ label: 'Сохранить', primary: true, fn: async (close, body) => {
      const name = body.querySelector('input').value.trim();
      const r = await act(api.post('connect.channel.update', { server: S.server.id, id: c.id, name }));
      if (!r) return true;
      close();
      await loadServer(S.server.id);
      renderSide();
      renderHeader();
    } }]);
  }

  function deleteChannel(c) {
    modal('Удалить канал #' + c.name + '?', (body) => {
      body.append(h('p', { class: 'cx-hint' }, 'Вместе с каналом удалятся все его сообщения. Это нельзя отменить.'));
    }, [{ label: 'Удалить канал', danger: true, fn: async (close) => {
      const r = await act(api.post('connect.channel.delete', { server: S.server.id, id: c.id }));
      if (!r) return true;
      close();
      await loadServer(S.server.id);
      if (S.channel === c.id) go('#s/' + S.server.id);
      else { renderSide(); renderHeader(); }
    } }]);
  }

  function renameServer() {
    modal('Переименовать сервер', (body) => {
      body.append(field('Название', textInput(S.server.name, '', 64)));
    }, [{ label: 'Сохранить', primary: true, fn: async (close, body) => {
      const name = body.querySelector('input').value.trim();
      const r = await act(api.post('connect.server.update', { id: S.server.id, name }));
      if (!r) return true;
      close();
      await loadServer(S.server.id);
      await loadState();
      renderSide();
    } }]);
  }

  function inviteDialog() {
    const link = location.origin + '/connect.html#join=' + (S.server.invite || '');
    modal('Пригласить на сервер', (body) => {
      const box = h('input', { type: 'text', class: 'cx-in cx-wide', readonly: true, value: link, 'aria-label': 'Ссылка-приглашение' });
      body.append(field('Ссылка-приглашение', box), h('p', { class: 'cx-hint' }, 'Тот, кто откроет ссылку, сразу попадёт на сервер. Новая ссылка делает старую недействительной.'));
    }, [
      { label: 'Скопировать', primary: true, fn: () => { copyText(link); return true; } },
      { label: 'Сбросить ссылку', danger: true, fn: async (close, body) => {
        const r = await act(api.post('connect.server.invite', { id: S.server.id }));
        if (!r) return true;
        S.server.invite = r.invite;
        body.querySelector('input').value = location.origin + '/connect.html#join=' + r.invite;
        notify('Ссылка обновлена, старая больше не работает');
        return true;
      } },
    ]);
  }

  function deleteServer() {
    modal('Удалить сервер «' + S.server.name + '»?', (body) => {
      body.append(h('p', { class: 'cx-hint' }, 'Удалятся все каналы, сообщения и участники. Это нельзя отменить.'));
    }, [{ label: 'Удалить сервер', danger: true, fn: async (close) => {
      const r = await act(api.post('connect.server.delete', { id: S.server.id }));
      if (!r) return true;
      close();
      await loadState();
      go('#');
    } }]);
  }

  function leaveServer() {
    modal('Выйти с сервера «' + S.server.name + '»?', null, [{ label: 'Выйти', danger: true, fn: async (close) => {
      const r = await act(api.post('connect.server.leave', { id: S.server.id }));
      if (!r) return true;
      close();
      await loadState();
      go('#');
    } }]);
  }

  async function setRole(m, role) {
    const r = await act(api.post('connect.member.role', { server: S.server.id, user: m.id, role }));
    if (!r) return;
    notify(role === 'admin' ? m.name + ' теперь администратор' : 'Роль снята');
    await loadServer(S.server.id);
    renderMembers();
  }

  async function kick(m) {
    if (!window.confirm('Исключить ' + m.name + ' с сервера?')) return;
    const r = await act(api.post('connect.member.kick', { server: S.server.id, user: m.id }));
    if (!r) return;
    await loadServer(S.server.id);
    renderMembers();
  }

  async function openDmWith(login) {
    const r = await act(api.post('connect.dm.open', { login }));
    if (!r) return;
    await loadState();
    go('#d/' + r.dm.id);
  }

  function newDmDialog() {
    modal('Личное сообщение', (body) => {
      body.append(field('Ник пользователя StreOps', textInput('', 'login', 64)), h('p', { class: 'cx-hint' }, 'Писать можно тем, с кем вы на одном сервере.'));
    }, [{ label: 'Открыть чат', primary: true, fn: async (close, body) => {
      const login = body.querySelector('input').value.trim().replace(/^@/, '');
      const r = await act(api.post('connect.dm.open', { login }));
      if (!r) return true;
      await loadState();
      close();
      go('#d/' + r.dm.id);
    } }]);
  }

  function searchDialog() {
    if (!viewKey()) return;
    modal('Поиск по чату', (body) => {
      const input = textInput('', 'Текст сообщения', 100);
      const out = h('div', { class: 'cx-results', 'aria-live': 'polite' });
      const run = async () => {
        const q = input.value.trim();
        out.textContent = '';
        if (q.length < 2) { out.append(h('p', { class: 'cx-hint' }, 'Введи хотя бы 2 символа.')); return; }
        const p = scopeParams();
        const r = await act(api.get('connect.search', Object.assign({ q }, p)));
        if (!r) return;
        if (!r.messages.length) { out.append(h('p', { class: 'cx-hint' }, 'Ничего не нашлось.')); return; }
        for (const m of r.messages) {
          out.append(h('div', { class: 'cx-res' }, h('span', { class: 'cx-rn' }, m.user.name), ' ',
            h('span', { class: 'cx-hint' }, window.StreAPI.fmtDate(m.at) + ' ' + window.StreAPI.fmtTime(m.at)),
            h('p', { class: 'cx-rt', html: fmtInline(m.text.slice(0, 200), S.me) })));
        }
      };
      let timer = null;
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
      body.append(field('Поиск', input), out);
    }, []);
  }

  // Быстрый переход (Ctrl+K): серверы, каналы и личные чаты по названию
  function quickSwitch() {
    modal('Перейти к…', (body) => {
      const input = textInput('', 'Сервер, канал или ник', 64);
      const list = h('div', { class: 'cx-results' });
      const items = () => {
        const q = input.value.trim().toLowerCase();
        const all = [];
        for (const s of S.servers) all.push({ label: s.name, hash: '#s/' + s.id });
        for (const d of S.dms) all.push({ label: '@' + d.peer.name, hash: '#d/' + d.id });
        if (S.server) for (const c of S.channels) all.push({ label: '# ' + c.name + ' · ' + S.server.name, hash: '#s/' + S.server.id + '/c/' + c.id });
        list.textContent = '';
        for (const it of all.filter((x) => !q || x.label.toLowerCase().includes(q)).slice(0, 12)) {
          list.append(h('button', { type: 'button', class: 'cx-res cx-resb', onclick: () => { closeAny(); go(it.hash); } }, it.label));
        }
      };
      input.addEventListener('input', items);
      body.append(input, list);
      items();
    }, []);
  }

  function closeAny() {
    const ov = document.querySelector('.cx-ov');
    if (ov) ov.remove();
  }

  // ---------- переходы и обновление ----------
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    if (/join=/.test(location.hash)) return joinByHash(); // ссылка-приглашение открыта на уже открытой странице
    const id = ++S.routeId;
    const r = parseHash();
    if (S.dm && (r.kind !== 'd' || S.dm.id !== r.did)) S.drafts['d:' + S.dm.id] = root.querySelector('.cx-input') ? root.querySelector('.cx-input').value : (S.drafts['d:' + S.dm.id] || '');
    if (S.channel && S.server && r.kind !== 's') S.drafts['c:' + S.channel] = root.querySelector('.cx-input') ? root.querySelector('.cx-input').value : (S.drafts['c:' + S.channel] || '');
    S.replyTo = null;
    S.editId = null;
    S.messages = [];
    S.hasMore = false;
    S.lastSig = '';
    S.lastRead = 0;
    S.typing = [];
    S.sideOpen = false;
    root.classList.remove('cx-side-open');
    if (r.kind === 's') {
      S.dm = null;
      if (!await loadServer(r.sid)) return location.hash = '#';
      if (id !== S.routeId) return;
      const ch = S.channels.find((c) => c.id === r.cid) || S.channels[0];
      S.channel = ch ? ch.id : 0;
      if (ch && r.cid !== ch.id) history.replaceState(null, '', '#s/' + r.sid + '/c/' + ch.id);
    } else if (r.kind === 'd') {
      S.server = null; S.channels = []; S.members = []; S.channel = 0;
      S.dm = S.dms.find((d) => d.id === r.did) || null;
      if (!S.dm) { await loadState(); S.dm = S.dms.find((d) => d.id === r.did) || null; }
      if (!S.dm) return location.hash = '#';
    } else {
      S.server = null; S.channels = []; S.members = []; S.channel = 0; S.dm = null;
    }
    if (id !== S.routeId) return;
    renderRail();
    renderSide();
    renderComposer();
    const key = viewKey();
    if (key) {
      const draft = S.drafts[key] || '';
      await refreshMessages(true);
      if (id !== S.routeId) return;
      const input = root.querySelector('.cx-input');
      if (input && !S.editId) input.value = draft;
      renderHeader();
      renderMembers();
    } else {
      renderHeader();
      root.querySelector('.cx-list').textContent = '';
      root.querySelector('.cx-list').append(h('div', { class: 'cx-empty' },
        h('h3', {}, 'StreOps Connect'),
        h('p', {}, 'Слева выбери сервер или личный чат. Свой сервер создаётся кнопкой «+», чужой открывается по ссылке-приглашению.')));
      root.querySelector('.cx-typing').textContent = '';
    }
    renderMembers();
  }

  async function joinByHash() {
    const m = location.hash.match(/join=([\w-]+)/);
    if (!m) return;
    const r = await act(api.post('connect.server.join', { invite: m[1] }));
    history.replaceState(null, '', location.pathname);
    if (r) {
      await loadState();
      notify(r.joined ? 'Ты на сервере' : 'Ты уже на этом сервере');
      location.hash = '#s/' + r.server.id;
    }
  }

  function renderLogin() {
    root.append(h('div', { class: 'cx-login' },
      h('div', { class: 'cx-login-card' },
        h('p', { class: 'cx-ov-t' }, 'StreOps Connect'),
        h('h1', {}, 'Серверы и личные сообщения для сообщества'),
        h('p', { class: 'cx-hint' }, 'Каналы, ответы, реакции, роли и приглашения. Чтобы зайти, войди через Twitch.'),
        h('a', { class: 'cx-btn cx-login-btn', href: '/auth/login.php?next=' + encodeURIComponent('/connect.html') }, 'Войти через Twitch'),
        h('a', { class: 'cx-link', href: 'index.html' }, 'На главную'))));
  }

  // ---------- стили: тёмная тема StreOps ----------
  const CSS = `
.cx-app{position:relative;display:grid;grid-template-columns:72px 240px minmax(0,1fr) 240px;height:100vh;width:100%;background:#0A0A0A;color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif;overflow:hidden}
.cx-app.cx-hide-members{grid-template-columns:72px 240px minmax(0,1fr)}
.cx-rail{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0;background:#050505;border-right:1px solid #1A1A1A;overflow-y:auto}
.cx-rail-list{display:flex;flex-direction:column;gap:8px;align-items:center}
.cx-rb{position:relative;width:48px;height:48px;border-radius:14px;border:0;background:#1A1A1A;color:#F2F2F2;font:600 15px/1 Onest,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;transition:border-radius .15s,background .15s;flex:none}
.cx-rb:hover{border-radius:12px;background:#2A2A2A}
.cx-rb.cx-active{border-radius:12px;background:#F2F2F2;color:#0A0A0A}
.cx-rb.cx-active::before{content:'';position:absolute;left:-12px;top:50%;transform:translateY(-50%);width:4px;height:36px;border-radius:0 4px 4px 0;background:#F2F2F2}
.cx-home{font-size:13px}
.cx-badge{position:absolute;right:-4px;bottom:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#F2F2F2;color:#0A0A0A;font:600 11px/18px Onest,system-ui,sans-serif;text-align:center;box-sizing:border-box}
.cx-side{display:flex;flex-direction:column;min-width:0;background:#111111;border-right:1px solid #1F1F1F;overflow:hidden}
.cx-srv-head{display:flex;align-items:center;justify-content:space-between;gap:8px;height:48px;padding:0 14px;border:0;border-bottom:1px solid #1F1F1F;background:transparent;color:#F2F2F2;font:600 15px/20px Onest,system-ui,sans-serif;text-align:left;cursor:pointer;flex:none}
.cx-srv-head.cx-plain{cursor:default;align-items:center}
.cx-srv-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-caret{color:#8F8F8F}
.cx-chlist{flex:1;overflow-y:auto;padding:8px 8px 12px}
.cx-sect{margin:14px 6px 6px;font:600 11px/14px Onest,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8F8F8F}
.cx-chrow{position:relative;display:flex;align-items:center;border-radius:6px}
.cx-chrow:hover,.cx-chrow.cx-active{background:#1F1F1F}
.cx-ch{flex:1;min-width:0;display:flex;align-items:center;gap:6px;padding:7px 8px;color:#B4B4B4;text-decoration:none;border-radius:6px}
.cx-ch:hover{color:#F2F2F2}
.cx-chrow.cx-active .cx-ch,.cx-chrow.cx-active .cx-ch:hover{color:#FFFFFF;font-weight:600}
.cx-hash{color:#6E6E6E;font-weight:500}
.cx-chname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.cx-chtools{display:none;gap:2px;padding-right:4px}
.cx-chrow:hover .cx-chtools{display:flex}
.cx-mini{width:24px;height:24px;border:0;border-radius:4px;background:transparent;color:#B4B4B4;cursor:pointer;font:500 14px/1 Onest,system-ui,sans-serif}
.cx-mini:hover{background:#2A2A2A;color:#F2F2F2}
.cx-addch{width:100%;margin-top:6px;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:#8F8F8F;text-align:left;cursor:pointer}
.cx-addch:hover{color:#F2F2F2;background:#1F1F1F}
.cx-dm{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;color:#F2F2F2;text-decoration:none;position:relative}
.cx-dm:hover,.cx-dm.cx-active{background:#1F1F1F}
.cx-dmtxt{display:flex;flex-direction:column;min-width:0;flex:1}
.cx-dmname{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-dmlast{font-size:12px;color:#8F8F8F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-hint{margin:6px 0 0;font-size:12px;line-height:17px;color:#8F8F8F}
.cx-me{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid #1F1F1F;background:#0E0E0E;flex:none;min-width:0}
.cx-me-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.cx-me-login{font-size:12px;color:#8F8F8F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px}
.cx-av{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:50%;color:#FFFFFF;font:600 14px/1 Onest,system-ui,sans-serif;user-select:none}
.cx-main{display:flex;flex-direction:column;min-width:0;min-height:0;background:#0D0D0D;position:relative}
.cx-top{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid #1F1F1F;flex:none}
.cx-title{flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap}
.cx-title strong{overflow:hidden;text-overflow:ellipsis}
.cx-sub{margin-left:10px;font-size:12px;color:#8F8F8F;overflow:hidden;text-overflow:ellipsis}
.cx-tools{display:flex;gap:4px}
.cx-ib{width:34px;height:34px;border:0;border-radius:6px;background:transparent;color:#B4B4B4;font:500 17px/1 Onest,system-ui,sans-serif;cursor:pointer;flex:none}
.cx-ib:hover{background:#1F1F1F;color:#F2F2F2}
.cx-side-t{display:none}
.cx-list{flex:1;min-height:0;overflow-y:auto;padding:12px 0 8px;scroll-behavior:auto}
.cx-day{display:flex;align-items:center;gap:10px;margin:14px 16px 6px;color:#8F8F8F;font-size:12px;font-weight:600}
.cx-day::before,.cx-day::after{content:'';flex:1;height:1px;background:#1F1F1F}
.cx-msg{position:relative;display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;padding:2px 16px;margin-top:10px}
.cx-msg:hover{background:rgba(255,255,255,.025)}
.cx-msg.cx-compact{margin-top:0}
.cx-msg.cx-flash{background:rgba(255,255,255,.08);transition:background .4s}
.cx-msg .cx-av{margin-top:2px}
.cx-time-c{font-size:11px;color:transparent;text-align:right;padding-top:4px;user-select:none;font-variant-numeric:tabular-nums}
.cx-msg:hover .cx-time-c{color:#6E6E6E}
.cx-head{display:flex;align-items:baseline;gap:8px}
.cx-name{font-weight:600;color:#F2F2F2}
.cx-name-me{color:#FFFFFF}
.cx-time{font-size:12px;color:#6E6E6E}
.cx-content{min-width:0}
.cx-body{white-space:normal;overflow-wrap:anywhere;color:#DCDCDC;line-height:21px}
.cx-body code,.cx-pre{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px}
.cx-body code{padding:1px 5px;border-radius:4px;background:#1F1F1F}
.cx-pre{display:block;margin:4px 0;padding:10px 12px;border-radius:6px;background:#050505;border:1px solid #1F1F1F;white-space:pre-wrap;overflow-x:auto}
.cx-quote{display:block;border-left:3px solid #3A3A3A;padding-left:10px;color:#B4B4B4}
.cx-body a{color:#8FD0FF;text-decoration:underline;text-underline-offset:2px}
.cx-mention{padding:0 3px;border-radius:4px;background:rgba(143,208,255,.14);color:#8FD0FF}
.cx-mention-me{background:rgba(255,220,120,.2);color:#FFE08A}
.cx-edited{font-size:11px;color:#6E6E6E}
.cx-deleted{font-style:italic;color:#6E6E6E}
.cx-reply{display:flex;align-items:center;gap:6px;margin:0 0 4px 0;padding:0 0 0 8px;min-width:0;border:0;border-left:2px solid #3A3A3A;background:transparent;color:#8F8F8F;font:400 13px/18px Onest,system-ui,sans-serif;text-align:left;cursor:pointer;max-width:100%;overflow:hidden;white-space:nowrap}
.cx-reply:hover{color:#F2F2F2}
.cx-rn{color:#B4B4B4;font-weight:600}
.cx-rt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-reacts{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.cx-chip{height:24px;padding:0 8px;border-radius:12px;border:1px solid #2A2A2A;background:#141414;color:#DCDCDC;font:500 12px/1 Onest,system-ui,sans-serif;cursor:pointer}
.cx-chip:hover{border-color:#6E6E6E}
.cx-chip-on{border-color:#8FD0FF;background:rgba(143,208,255,.12);color:#FFFFFF}
.cx-tb{position:absolute;right:14px;top:-12px;display:none;gap:2px;padding:3px;border:1px solid #2A2A2A;border-radius:8px;background:#141414;box-shadow:0 6px 18px rgba(0,0,0,.5)}
.cx-msg:hover .cx-tb,.cx-msg:focus-within .cx-tb{display:flex}
.cx-tbb{width:28px;height:26px;border:0;border-radius:5px;background:transparent;color:#B4B4B4;font:500 13px/1 Onest,system-ui,sans-serif;cursor:pointer}
.cx-tbb:hover{background:#2A2A2A;color:#FFFFFF}
.cx-empty{margin:40px auto;max-width:420px;text-align:center;padding:0 20px}
.cx-empty h3{margin:0 0 6px;font-size:18px;font-weight:600}
.cx-empty p{margin:0;color:#8F8F8F}
.cx-more{display:block;margin:4px auto 10px;height:30px;padding:0 14px;border:1px solid #2A2A2A;border-radius:15px;background:#141414;color:#B4B4B4;font:500 12px/1 Onest,system-ui,sans-serif;cursor:pointer}
.cx-jump{position:absolute;left:50%;bottom:132px;transform:translateX(-50%);display:none;z-index:5}
.cx-jump.cx-show{display:block}
.cx-btn{height:36px;padding:0 16px;border-radius:6px;border:0;background:#FFFFFF;color:#0A0A0A;font:600 14px/1 Onest,system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.cx-btn:hover{background:#E6E6E6}
.cx-btn:disabled{opacity:.5;cursor:default}
.cx-btn-ghost{height:36px;padding:0 14px;border-radius:6px;border:1px solid #2A2A2A;background:transparent;color:#F2F2F2;font:500 14px/1 Onest,system-ui,sans-serif;cursor:pointer}
.cx-btn-ghost:hover{border-color:#6E6E6E}
.cx-btn-danger{background:#FFFFFF;color:#0A0A0A}
.cx-typing{min-height:18px;padding:0 18px;font-size:12px;color:#8F8F8F}
.cx-composer{padding:0 16px 14px;flex:none}
.cx-banner{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;margin-bottom:6px;border-radius:8px 8px 0 0;background:#171717;color:#B4B4B4;font-size:13px}
.cx-row{display:flex;align-items:flex-end;gap:10px;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:10px;padding:8px 8px 8px 14px}
.cx-input{flex:1;min-width:0;resize:none;border:0;outline:0;background:transparent;color:#F2F2F2;font:400 15px/21px Onest,system-ui,sans-serif;max-height:160px;overflow-y:auto;padding:6px 0}
.cx-input::placeholder{color:#6E6E6E}
.cx-send{height:34px;padding:0 14px;flex:none}
.cx-foot{display:flex;justify-content:space-between;gap:10px;margin-top:6px;min-height:16px}
.cx-count{font-size:12px;color:#8F8F8F;font-variant-numeric:tabular-nums}
.cx-members{background:#111111;border-left:1px solid #1F1F1F;overflow-y:auto;padding:8px 8px 16px}
.cx-member{display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:#F2F2F2;text-align:left;cursor:pointer}
.cx-member:hover{background:#1F1F1F}
.cx-mtxt{display:flex;flex-direction:column;min-width:0;flex:1}
.cx-mname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.cx-mlogin{font-size:11px;color:#6E6E6E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-dot{width:9px;height:9px;border-radius:50%;background:#4A4A4A;border:2px solid #111111;flex:none;box-sizing:content-box;margin:0 2px}
.cx-dot.cx-on{background:#7FD17F}
.cx-ov{position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.cx-modal{width:100%;max-width:460px;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:22px;border-radius:12px;background:#111111;border:1px solid #2A2A2A;box-shadow:0 24px 64px rgba(0,0,0,.6)}
.cx-mt{margin:0 0 14px;font:600 18px/24px Onest,system-ui,sans-serif}
.cx-mbody{display:flex;flex-direction:column;gap:12px}
.cx-field{display:flex;flex-direction:column;gap:6px}
.cx-lbl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:#8F8F8F}
.cx-in{box-sizing:border-box;height:40px;padding:0 12px;border-radius:6px;background:#171717;border:1px solid #3A3A3A;color:#F2F2F2;font:400 14px/20px Onest,system-ui,sans-serif;width:100%}
.cx-in:focus,.cx-input:focus{outline:none}
.cx-in:focus{border-color:#8F8F8F}
.cx-wide{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px}
.cx-mact{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}
.cx-results{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto}
.cx-res{padding:8px 10px;border-radius:6px;background:#171717;border:1px solid #222}
.cx-resb{text-align:left;cursor:pointer;color:#F2F2F2;font:500 14px/20px Onest,system-ui,sans-serif}
.cx-resb:hover{border-color:#6E6E6E}
.cx-mprof{display:flex;align-items:center;gap:14px}
.cx-mprof p{margin:4px 0 0}
.cx-pop{position:fixed;z-index:21000;background:#141414;border:1px solid #2A2A2A;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.6);padding:6px;display:flex}
.cx-menu{flex-direction:column;min-width:220px}
.cx-menu button{height:36px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:#F2F2F2;font:500 14px/1 Onest,system-ui,sans-serif;text-align:left;cursor:pointer}
.cx-menu button:hover,.cx-menu button:focus{background:#2A2A2A;outline:0}
.cx-menu button.cx-danger{color:#FF9B9B}
.cx-picker{gap:2px;flex-wrap:wrap;width:232px}
.cx-emo{width:44px;height:40px;border:0;border-radius:6px;background:transparent;font-size:20px;cursor:pointer}
.cx-emo:hover,.cx-emo:focus{background:#2A2A2A;outline:0}
.cx-login{display:flex;align-items:center;justify-content:center;height:100%;padding:24px;box-sizing:border-box}
.cx-login-card{max-width:440px;text-align:center}
.cx-login-card h1{margin:8px 0 10px;font:600 26px/32px Onest,system-ui,sans-serif}
.cx-login-btn{margin-top:20px}
.cx-ov-t{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8F8F8F}
.cx-link{display:block;margin-top:14px;color:#8F8F8F}
.cx-sub{color:#8F8F8F}
.cx-app :focus-visible{outline:2px solid #8FD0FF;outline-offset:2px}
@media (max-width: 1100px){.cx-app{grid-template-columns:72px 240px minmax(0,1fr)}.cx-members{display:none}.cx-mem-t{display:none}}
@media (max-width: 760px){
  .cx-app{grid-template-columns:56px minmax(0,1fr);position:relative}
  .cx-rb{width:40px;height:40px;border-radius:12px}
  .cx-side{position:absolute;left:56px;top:0;bottom:0;width:260px;z-index:30;transform:translateX(calc(-100% - 60px));transition:transform .18s;box-shadow:0 0 30px rgba(0,0,0,.6)}
  .cx-app.cx-side-open .cx-side{transform:none}
  .cx-side-t{display:inline-flex}
  .cx-msg{grid-template-columns:34px minmax(0,1fr);gap:10px;padding:2px 10px}
  .cx-time-c{display:none}
  .cx-tb{display:flex;top:-18px;right:6px;transform:scale(.92);opacity:.97}
  .cx-msg:not(:hover) .cx-tb{display:none}
  .cx-msg:focus-within .cx-tb{display:flex}
  #stre-fab{display:none}
}
`;

  function injectCss() {
    if (document.getElementById('cx-css')) return;
    document.head.append(h('style', { id: 'cx-css' }, CSS));
  }

  // ---------- старт: ждём контейнер страницы (его создаёт шаблон) ----------
  function start(tries) {
    root = document.getElementById('stre-connect');
    if (!root) {
      if ((tries || 0) < 80) setTimeout(() => start((tries || 0) + 1), 100);
      return;
    }
    injectCss();
    run();
  }

  async function run() {
    const me = await window.StreAPI.me();
    if (!me || !me.user) { renderLogin(); return; }
    renderShell();
    await loadState();
    await joinByHash();
    await route();
    window.addEventListener('hashchange', () => { route(); });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); quickSwitch(); }
    });
    setInterval(() => { if (!document.hidden) refreshMessages(false); }, 2500);
    setInterval(() => { if (!document.hidden) loadState(); }, 8000);
    setInterval(() => { if (!document.hidden && S.server) refreshServer(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshMessages(false); loadState(); } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.cx-pop')) closePopups(); }, true);
  }

  async function refreshServer() {
    const sid = S.server && S.server.id;
    if (!sid) return;
    const sv = await act(api.get('connect.server.get', { id: sid }));
    if (!sv || !S.server || S.server.id !== sid) return;
    S.server = sv.server;
    S.channels = sv.channels;
    S.members = sv.members;
    S.manage = RANK[sv.server.role] >= RANK.admin;
    renderSide();
    renderMembers();
    renderHeader();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(0));
  else start(0);
})();

'use strict';

// Hearth: текстовые каналы, личные сообщения-комнаты и звонки (WebRTC).
// Сервер отдаёт статику, REST для регистрации и WebSocket для сообщений и сигналинга.

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || '127.0.0.1';
const BASE = normalizeBase(process.env.BASE_PATH || '/dsZov');
const WS_PATH = BASE + '/ws';

const MAX_MESSAGES = 500;
const MAX_TEXT = 2000;
const MAX_ROOM_SIZE = 8;
const MAX_MSG_PER_SEC = 60;
const MAX_SIGNAL_BYTES = 32 * 1024;
const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_MS = 60 * 1000;

const CHANNELS = [
  { id: 'general', name: 'general', type: 'text', topic: 'Say hi, share the day, keep the fire going' },
  { id: 'hearth-talk', name: 'hearth-talk', type: 'text', topic: 'Longer threads, ideas, and open questions' },
  { id: 'build-log', name: 'build-log', type: 'text', topic: 'What shipped, what broke, what is next' },
  { id: 'campfire', name: 'Campfire', type: 'voice', topic: 'Voice room. Join to talk.' }
];
const TEXT_IDS = new Set(CHANNELS.filter((c) => c.type === 'text').map((c) => c.id));
const VOICE_IDS = new Set(CHANNELS.filter((c) => c.type === 'voice').map((c) => c.id));

const NICK_RE = /^[\p{L}\p{N} _.-]{2,32}$/u;
const DM_ROOM_RE = /^dm-[a-f0-9]{16}$/;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'self'",
  "base-uri 'self'"
].join('; ');

function normalizeBase(p) {
  const b = '/' + String(p).replace(/^\/+|\/+$/g, '');
  return b === '/' ? '' : b;
}

// ---------- Хранилище: один JSON-файл, запись атомарная (tmp + rename)

function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { users: raw.users || {}, messages: raw.messages || {} };
  } catch (err) {
    if (err.code === 'ENOENT') return { users: {}, messages: {} };
    const backup = DB_FILE + '.broken-' + Date.now();
    fs.renameSync(DB_FILE, backup);
    console.error('db.json не читается, сохранил копию в ' + backup, err.message);
    return { users: {}, messages: {} };
  }
}

let db = loadDb();
let saveTimer = null;

function writeDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeDb();
  }, 300);
}

// ---------- Пользователи и уникальный Hearth ID

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function makeCode() {
  let s = '';
  for (const b of crypto.randomBytes(6)) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

function slugify(nick) {
  return nick
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'hearth';
}

function uniqueHandle(nick) {
  const slug = slugify(nick);
  const taken = new Set(Object.values(db.users).map((u) => u.handle));
  for (let i = 0; i < 100; i++) {
    const handle = slug + '#' + makeCode();
    if (!taken.has(handle)) return handle;
  }
  throw new Error('Не удалось подобрать уникальный ID');
}

function userByTokenHash(hash) {
  return Object.values(db.users).find((u) => u.tokenHash === hash) || null;
}

function publicUser(u) {
  return { id: u.id, nick: u.nick, handle: u.handle };
}

function registerUser(nick) {
  const token = crypto.randomBytes(32).toString('base64url');
  const user = {
    id: crypto.randomUUID(),
    nick,
    handle: uniqueHandle(nick),
    tokenHash: sha256(token),
    createdAt: Date.now()
  };
  db.users[user.id] = user;
  scheduleSave();
  return { token, user: publicUser(user) };
}

const registerHits = new Map();

function registerAllowed(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hit = registerHits.get(ip);
  if (!hit || now - hit.start > REGISTER_WINDOW_MS) {
    registerHits.set(ip, { start: now, count: 1 });
    return true;
  }
  hit.count += 1;
  return hit.count <= REGISTER_LIMIT;
}

// ---------- HTTP

function iceServers() {
  const list = [];
  const stun = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (stun.length) list.push({ urls: stun });
  const turn = (process.env.TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (turn.length) {
    list.push({
      urls: turn,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }
  return list;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': MIME['.txt'] });
  res.end(text);
}

function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, name) {
  if (name === 'health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, users: Object.keys(db.users).length });
  }
  if (name === 'config' && req.method === 'GET') {
    return sendJson(res, 200, { iceServers: iceServers() });
  }
  if (name === 'register' && req.method === 'POST') {
    if (!registerAllowed(req)) {
      return sendJson(res, 429, { error: 'Слишком много попыток. Подожди минуту.' });
    }
    const body = await readJson(req).catch(() => null);
    if (!body) return sendJson(res, 413, { error: 'Слишком большой запрос' });
    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    if (!NICK_RE.test(nick)) {
      return sendJson(res, 400, { error: 'Используй от 2 до 32 букв, цифр, пробелов, _ . или -' });
    }
    return sendJson(res, 201, registerUser(nick));
  }
  return sendJson(res, 404, { error: 'Не найдено' });
}

function serveStatic(req, res, rel) {
  const file = rel === '' ? 'index.html' : rel;
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, 'Запрещено');
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return sendText(res, 404, 'Не найдено');
    const ext = path.extname(full).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400'
    };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (BASE && p === BASE) {
      res.writeHead(301, { Location: BASE + '/' + url.search });
      return res.end();
    }
    let rel;
    if (BASE) {
      if (!p.startsWith(BASE + '/')) return sendText(res, 404, 'Не найдено');
      rel = p.slice(BASE.length + 1);
    } else {
      rel = p.slice(1);
    }
    if (rel.startsWith('api/')) return handleApi(req, res, rel.slice(4));
    return serveStatic(req, res, rel);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Ошибка сервера' });
  }
});

// ---------- WebSocket

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const sockets = new Set(); // только авторизованные соединения
const rooms = new Map(); // roomId -> Set<ws>

server.on('upgrade', (req, socket, head) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (p !== WS_PATH) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.user = null;
  ws.rooms = new Set();
  ws.window = { start: Date.now(), count: 0 };
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => {
    try {
      handleWs(ws, String(raw));
    } catch (err) {
      console.error(err);
      send(ws, { t: 'error', message: 'Что-то пошло не так' });
    }
  });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(obj, except) {
  const data = JSON.stringify(obj);
  for (const s of sockets) {
    if (s !== except && s.readyState === 1) s.send(data);
  }
}

function onlineList() {
  const seen = new Map();
  for (const s of sockets) {
    if (!seen.has(s.user.id)) seen.set(s.user.id, publicUser(s.user));
  }
  return [...seen.values()];
}

function rateOk(ws) {
  const now = Date.now();
  if (now - ws.window.start > 1000) ws.window = { start: now, count: 0 };
  ws.window.count += 1;
  return ws.window.count <= MAX_MSG_PER_SEC;
}

function messageView(m, meId) {
  const author = db.users[m.authorId];
  return {
    id: m.id,
    channel: m.channel,
    authorId: m.authorId,
    author: author ? author.nick : 'Удалённый пользователь',
    handle: author ? author.handle : '',
    text: m.text,
    ts: m.ts,
    count: m.embers.length,
    reacted: meId ? m.embers.includes(meId) : false
  };
}

function isRoomId(room) {
  return typeof room === 'string' && (VOICE_IDS.has(room) || DM_ROOM_RE.test(room));
}

function leaveRoom(ws, room) {
  ws.rooms.delete(room);
  const set = rooms.get(room);
  if (!set || !set.delete(ws)) return;
  for (const other of set) send(other, { t: 'peer-left', room, peerId: ws.user.id });
  if (set.size === 0) rooms.delete(room);
}

function socketsOf(userId) {
  return [...sockets].filter((s) => s.user.id === userId);
}

function onHello(ws, msg) {
  if (ws.user) return;
  const user = typeof msg.token === 'string' ? userByTokenHash(sha256(msg.token)) : null;
  if (!user) {
    send(ws, { t: 'auth-failed' });
    ws.close(4001, 'auth');
    return;
  }
  ws.user = user;
  sockets.add(ws);
  send(ws, { t: 'ready', me: publicUser(user), channels: CHANNELS, online: onlineList() });
  broadcast({ t: 'presence', online: onlineList() }, ws);
}

const HANDLERS = {
  history(ws, msg) {
    if (!TEXT_IDS.has(msg.channel)) return send(ws, { t: 'error', message: 'Неизвестный канал' });
    const list = (db.messages[msg.channel] || []).slice(-100).map((m) => messageView(m, ws.user.id));
    send(ws, { t: 'history', channel: msg.channel, messages: list });
  },

  msg(ws, msg) {
    if (!TEXT_IDS.has(msg.channel)) return send(ws, { t: 'error', message: 'Неизвестный канал' });
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!text || text.length > MAX_TEXT) {
      return send(ws, { t: 'error', message: 'Сообщение: от 1 до 2000 символов' });
    }
    const m = {
      id: crypto.randomUUID(),
      channel: msg.channel,
      authorId: ws.user.id,
      text,
      ts: Date.now(),
      embers: []
    };
    const list = (db.messages[msg.channel] ||= []);
    list.push(m);
    if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES);
    scheduleSave();
    broadcast({ t: 'msg', message: messageView(m, null) });
  },

  ember(ws, msg) {
    if (!TEXT_IDS.has(msg.channel)) return send(ws, { t: 'error', message: 'Неизвестный канал' });
    const m = (db.messages[msg.channel] || []).find((x) => x.id === msg.id);
    if (!m) return send(ws, { t: 'error', message: 'Сообщение не найдено' });
    const i = m.embers.indexOf(ws.user.id);
    if (i >= 0) m.embers.splice(i, 1);
    else m.embers.push(ws.user.id);
    scheduleSave();
    broadcast({ t: 'ember', channel: msg.channel, id: m.id, count: m.embers.length, by: ws.user.id, on: i < 0 });
  },

  nick(ws, msg) {
    const nick = typeof msg.nick === 'string' ? msg.nick.trim() : '';
    if (!NICK_RE.test(nick)) return send(ws, { t: 'error', message: 'Никнейм: от 2 до 32 символов' });
    ws.user.nick = nick;
    scheduleSave();
    broadcast({ t: 'nick', id: ws.user.id, nick });
    broadcast({ t: 'presence', online: onlineList() });
  },

  join(ws, msg) {
    const room = msg.room;
    if (!isRoomId(room)) return send(ws, { t: 'error', message: 'Неизвестная комната' });
    if (ws.rooms.has(room)) return;
    let set = rooms.get(room);
    if (!set) rooms.set(room, (set = new Set()));
    if ([...set].some((s) => s.user.id === ws.user.id)) {
      return send(ws, { t: 'error', message: 'Ты уже в этом звонке в другой вкладке' });
    }
    const uniqueIds = new Set();
    const peers = [];
    for (const s of set) {
      if (uniqueIds.has(s.user.id)) continue;
      uniqueIds.add(s.user.id);
      peers.push(publicUser(s.user));
    }
    if (peers.length >= MAX_ROOM_SIZE) return send(ws, { t: 'error', message: 'В комнате нет места' });
    set.add(ws);
    ws.rooms.add(room);
    send(ws, { t: 'room', room, peers });
    for (const other of set) {
      if (other !== ws) send(other, { t: 'peer-joined', room, peer: publicUser(ws.user) });
    }
  },

  leave(ws, msg) {
    if (typeof msg.room === 'string') leaveRoom(ws, msg.room);
  },

  signal(ws, msg) {
    if (!ws.rooms.has(msg.room) || typeof msg.to !== 'string') {
      return send(ws, { t: 'error', message: 'Сначала подключись к звонку' });
    }
    if (JSON.stringify(msg.data || {}).length > MAX_SIGNAL_BYTES) {
      return send(ws, { t: 'error', message: 'Сигнал слишком большой' });
    }
    const set = rooms.get(msg.room) || new Set();
    for (const other of set) {
      if (other.user.id === msg.to) {
        send(other, { t: 'signal', room: msg.room, from: ws.user.id, data: msg.data });
      }
    }
  },

  ring(ws, msg) {
    if (!ws.rooms.has(msg.room) || !String(msg.room).startsWith('dm-')) {
      return send(ws, { t: 'error', message: 'Сначала начни звонок' });
    }
    const targets = socketsOf(msg.to).filter((s) => s.user.id !== ws.user.id);
    if (!targets.length) return send(ws, { t: 'ring-status', room: msg.room, status: 'offline' });
    for (const t of targets) send(t, { t: 'ringing', room: msg.room, from: publicUser(ws.user) });
    send(ws, { t: 'ring-status', room: msg.room, status: 'ringing' });
  },

  'ring-accept'(ws, msg) {
    relayToRoom(ws, msg.room, { t: 'ring-accepted', room: msg.room, from: publicUser(ws.user) });
  },

  'ring-decline'(ws, msg) {
    relayToRoom(ws, msg.room, { t: 'ring-declined', room: msg.room, from: publicUser(ws.user) });
  },

  'ring-cancel'(ws, msg) {
    if (typeof msg.to !== 'string') return;
    for (const t of socketsOf(msg.to)) send(t, { t: 'ring-cancelled', room: msg.room });
  }
};

function relayToRoom(ws, room, obj) {
  const set = rooms.get(room);
  if (!set) return;
  for (const other of set) {
    if (other.user.id !== ws.user.id) send(other, obj);
  }
}

function handleWs(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (err) {
    return send(ws, { t: 'error', message: 'Плохое сообщение' });
  }
  if (!msg || typeof msg.t !== 'string') return;
  if (msg.t === 'hello') return onHello(ws, msg);
  if (!ws.user) return send(ws, { t: 'error', message: 'Сначала войди' });
  if (!rateOk(ws)) return send(ws, { t: 'error', message: 'Слишком часто, подожди секунду' });
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, msg.t) ? HANDLERS[msg.t] : null;
  if (!handler) return send(ws, { t: 'error', message: 'Неизвестное действие' });
  handler(ws, msg);
}

function onClose(ws) {
  if (!ws.user) return;
  sockets.delete(ws);
  for (const room of [...ws.rooms]) leaveRoom(ws, room);
  broadcast({ t: 'presence', online: onlineList() });
}

// ---------- Запуск

server.listen(PORT, HOST, () => {
  console.log(`Hearth слушает http://${HOST}:${PORT}${BASE || ''}/`);
});

function shutdown() {
  if (saveTimer) clearTimeout(saveTimer);
  writeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

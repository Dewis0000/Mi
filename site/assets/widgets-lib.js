/* StreOps — виджеты для OBS: список, настройки по умолчанию, пресеты стиля и связь с сервером.
   Используется страницами «Виджеты», «Редактор виджета» и OBS-рендерером /w/.
   Настройки живут на сервере (widgets.get / widgets.save); localStorage — только старое хранилище для разового переноса. */
(function () {
  'use strict';

  const KEY = 'streops-widgets-v1';

  // id, название, категория, описание, тариф, статус: ok · setup — нужен файл для игры · soon — ещё не готов
  const LIST = [
    ['alerts', 'Алерты', 'Алерты', 'Фолловы, подписки, рейды и донаты со звуком', '', 'ok'],
    ['goal', 'Цель доната', 'Цели', 'Полоса прогресса к сумме, обновляется сразу после доната', '', 'ok'],
    ['subgoal', 'Цель подписчиков', 'Цели', 'Сколько подписок осталось до цели', '', 'ok'],
    ['chat', 'Чат на экране', 'Чат', 'Сообщения чата поверх сцены, с ролями и никами', '', 'ok'],
    ['events', 'Последние события', 'Алерты', 'Лента: фолловы, подписки, рейды, донаты', '', 'ok'],
    ['topdon', 'Топ донатеров', 'Алерты', 'За стрим, неделю или месяц', '', 'ok'],
    ['faceit', 'FACEIT: уровень и ELO', 'Игры', 'Уровень, ELO, изменение за стрим и последние матчи', '', 'ok'],
    ['fmatch', 'FACEIT: последние матчи', 'Игры', 'ELO и победы с поражениями в пяти последних матчах', '', 'ok'],
    ['cs', 'CS2: счёт матча', 'Игры', 'Счёт, карта, раунд и твоя статистика через Game State Integration', '', 'setup'],
    ['dota', 'Dota 2: матч', 'Игры', 'Герой, уровень, K/D/A и золото через Game State Integration', '', 'setup'],
    ['np', 'Сейчас играет', 'Музыка', 'Трек, обложка и кто его заказал', '', 'ok'],
    ['queue', 'Очередь заказов', 'Музыка', 'Ближайшие треки из очереди', '', 'ok'],
    ['uptime', 'Таймер эфира', 'Таймеры', 'Сколько идёт стрим', '', 'ok'],
    ['deaths', 'Счётчик', 'Таймеры', 'Смерти, победы, что угодно. Модераторы ведут командой', '', 'ok'],
    ['poll', 'Голосование', 'Интерактив', 'Зрители голосуют цифрой в чате', '', 'soon'],
    ['ticker', 'Бегущая строка', 'Интерактив', 'Ссылки, расписание, правила чата', '', 'ok'],
  ];
  const CATS = ['Все', 'Алерты', 'Цели', 'Чат', 'Игры', 'Музыка', 'Таймеры', 'Интерактив'];
  // Включаются у нового пользователя (сколько позволяет тариф, по порядку)
  const DEFAULT_ON = ['alerts', 'chat', 'events', 'uptime'];
  // Боты, которых прячет чат на экране (как KNOWN_BOTS в bot.php)
  const BOTS = ['nightbot', 'streamelements', 'moobot', 'streamlabs', 'fossabot', 'wizebot', 'sery_bot', 'soundalerts', 'kofistreambot'];

  const STYLE = {
    preset: 'glass',
    bg: '#0A0A0A', bgA: 72, blur: 14,
    bw: 1, bc: '#FFFFFF', bcA: 16, radius: 10,
    shadow: 30, glow: 0, glowC: '#D92D20',
    pad: 16, width: 380, scale: 100,
    font: 'Onest', fg: '#F2F2F2', fg2: '#B4B4B4', acc: '#F2F2F2',
    size: 16, weight: 500, align: 'left', tshadow: false, upper: false, ls: 0,
    anim: 'up', dur: 450, hold: 8, sound: true, vol: 60, hideIdle: false,
    anchor: 'tl', x: 48, y: 48,
  };

  const PRESETS = {
    glass: { name: 'Стекло', bg: '#0A0A0A', bgA: 62, blur: 16, bw: 1, bc: '#FFFFFF', bcA: 16, shadow: 30, glow: 0, tshadow: false },
    solid: { name: 'Сплошной', bg: '#111111', bgA: 100, blur: 0, bw: 1, bc: '#3A3A3A', bcA: 100, shadow: 40, glow: 0, tshadow: false },
    clear: { name: 'Без фона', bgA: 0, blur: 0, bw: 0, shadow: 0, glow: 0, tshadow: true, pad: 0 },
    neon: { name: 'Неон', bg: '#05050A', bgA: 70, blur: 8, bw: 2, bc: '#8B5CF6', bcA: 100, glow: 24, glowC: '#8B5CF6', acc: '#B79CFF', shadow: 0 },
    light: { name: 'Светлая карта', bg: '#FFFFFF', bgA: 92, blur: 10, bw: 0, shadow: 40, glow: 0, fg: '#0A0A0A', fg2: '#525252', acc: '#0A0A0A', tshadow: false },
    minimal: { name: 'Минимал', bg: '#000000', bgA: 45, blur: 0, bw: 0, radius: 4, shadow: 0, glow: 0, pad: 10, size: 14, weight: 400 },
  };

  // Поля вкладки «Содержимое»: [ключ, подпись, тип, по умолчанию, варианты, подсказка].
  // Сервер читает отсюда: goal/subgoal content.current (+ cfg.since), topdon content.period,
  // faceit/fmatch content.nick, deaths content.value/label/command (команда бота).
  const BAR = [['solid', 'Сплошная'], ['hatch', 'Штриховка'], ['gradient', 'Градиент']];
  const CONTENT = {
    alerts: [
      ['type', 'Событие в предпросмотре', 'select', 'sub', [['follow', 'Фоллов'], ['sub', 'Подписка'], ['resub', 'Продление подписки'], ['gift', 'Подарочные подписки'], ['raid', 'Рейд'], ['donation', 'Донат']], 'Только для примера справа, на стрим не влияет'],
      ['name', 'Ник в предпросмотре', 'text', 'viewer_42', null, 'Только для примера справа'],
      ['tplFollow', 'Текст при фоллове', 'text', '{name} теперь с нами!', null, '{name} — ник зрителя'],
      ['tpl', 'Текст при подписке', 'text', '{name} подписался — спасибо!', null, '{name} — ник, {months} — сколько месяцев подряд'],
      ['tplGift', 'Текст при подарочных подписках', 'text', '{name} дарит подписки чату: {count}', null, '{count} — сколько подписок подарено'],
      ['tplRaid', 'Текст при рейде', 'text', '{name} пришёл с рейдом — привет всем!', null, '{viewers} — сколько зрителей пришло'],
      ['tplDonate', 'Текст доната без сообщения', 'text', 'Спасибо за поддержку!', null, 'Если донатер написал сообщение, покажем его. {amount} — сумма'],
      ['minDonate', 'Минимальный донат для алерта, ₽', 'number', 50],
      ['image', 'Цветной значок слева', 'toggle', true],
      ['tts', 'Озвучивать сообщение доната', 'toggle', false],
    ],
    goal: [
      ['title', 'Название цели', 'text', 'Цель стрима'],
      ['target', 'Цель, ₽', 'number', 10000],
      ['current', 'Собрано до начала отсчёта, ₽', 'number', 0, null, 'К этой сумме прибавляются донаты из DonationAlerts'],
      ['pct', 'Показывать проценты', 'toggle', true],
      ['bar', 'Стиль полосы', 'select', 'hatch', BAR],
      ['barH', 'Толщина полосы, px', 'number', 12],
    ],
    subgoal: [
      ['title', 'Название', 'text', 'Цель по подпискам'],
      ['target', 'Цель, подписок', 'number', 50],
      ['current', 'Уже есть до начала отсчёта', 'number', 0, null, 'К этому числу прибавляются новые подписки, продления и подарки'],
      ['pct', 'Показывать проценты', 'toggle', false],
      ['bar', 'Стиль полосы', 'select', 'solid', BAR],
      ['barH', 'Толщина полосы, px', 'number', 10],
    ],
    chat: [
      ['max', 'Сообщений на экране (до 12)', 'number', 5],
      ['life', 'Сообщение исчезает через, с (0 — никогда)', 'number', 30],
      ['badges', 'Значки ролей', 'toggle', true],
      ['nick', 'Цвет ников', 'select', 'accent', [['accent', 'Акцент'], ['text', 'Как текст'], ['platform', 'Из Twitch']]],
      ['hideCmd', 'Скрывать команды (!…)', 'toggle', true],
      ['hideBots', 'Скрывать ботов', 'toggle', true],
    ],
    events: [
      ['count', 'Сколько событий (до 5)', 'number', 3],
      ['amounts', 'Показывать суммы и числа', 'toggle', true],
    ],
    topdon: [
      ['period', 'Период', 'select', 'month', [['stream', 'Стрим'], ['week', 'Неделя'], ['month', 'Месяц']]],
      ['count', 'Сколько мест (до 5)', 'number', 3],
    ],
    faceit: [
      ['nick', 'Ник на FACEIT', 'text', '', null, 'Как в профиле faceit.com, с учётом регистра'],
      ['level', 'Уровень', 'toggle', true],
      ['elo', 'ELO', 'toggle', true],
      ['delta', 'Изменение за стрим', 'toggle', true],
      ['last5', 'Последние 5 матчей', 'toggle', true],
    ],
    fmatch: [
      ['nick', 'Ник на FACEIT', 'text', '', null, 'Как в профиле faceit.com, с учётом регистра'],
      ['elo', 'ELO', 'toggle', true],
      ['delta', 'Изменение за стрим', 'toggle', true],
      ['wl', 'Победы и поражения (5 последних)', 'toggle', true],
    ],
    cs: [
      ['map', 'Показывать карту', 'toggle', true],
      ['round', 'Показывать раунд', 'toggle', true],
      ['stats', 'Твоя статистика: убийства, смерти, MVP', 'toggle', true],
    ],
    dota: [
      ['hero', 'Герой и уровень', 'toggle', true],
      ['kda', 'K / D / A', 'toggle', true],
      ['gpm', 'Золото и опыт в минуту', 'toggle', true],
    ],
    np: [
      ['requester', 'Кто заказал', 'toggle', true],
      ['cover', 'Обложка трека', 'toggle', true],
    ],
    queue: [
      ['count', 'Сколько треков (до 5)', 'number', 3],
      ['requester', 'Кто заказал', 'toggle', false],
    ],
    uptime: [
      ['label', 'Подпись', 'text', 'В эфире'],
      ['format', 'Формат', 'select', 'hms', [['hms', 'ЧЧ:ММ:СС'], ['hm', 'ЧЧ:ММ'], ['words', '2 ч 47 мин']]],
    ],
    deaths: [
      ['label', 'Подпись', 'text', 'Смертей', null, 'Её же бот пишет в чат в ответ на команду'],
      ['command', 'Команда для модераторов', 'text', '!смерть', null, 'Одно слово, обычно с «!» в начале'],
      ['value', 'Начальное значение', 'number', 0, null, 'Действует, пока команду ни разу не вызывали. Дальше счёт ведёт команда'],
    ],
    poll: [
      ['q', 'Вопрос', 'text', 'Что делаем дальше?'],
      ['a', 'Вариант 1', 'text', 'Вариант 1'],
      ['b', 'Вариант 2', 'text', 'Вариант 2'],
      ['secs', 'Длительность, с', 'number', 60],
    ],
    ticker: [
      ['text', 'Текст', 'text', 'Спасибо, что смотришь стрим! · Заказ музыки: !музыка · Правила чата — в описании канала'],
      ['speed', 'Скорость, px/с', 'number', 60],
    ],
  };

  // Особые значения по умолчанию для отдельных виджетов
  const WIDGET_DEFAULTS = {
    alerts: { anchor: 'tc', width: 520, align: 'center', size: 18 },
    goal: { anchor: 'bl', width: 460 },
    subgoal: { anchor: 'bl', width: 420, y: 140 },
    chat: { anchor: 'ml', width: 420, size: 15 },
    events: { anchor: 'tr', width: 360 },
    topdon: { anchor: 'tr', width: 320, y: 200 },
    faceit: { anchor: 'tl', width: 360 },
    fmatch: { anchor: 'tl', width: 360, y: 170 },
    cs: { anchor: 'tc', width: 320, align: 'center' },
    dota: { anchor: 'tl', width: 420 },
    np: { anchor: 'br', width: 400 },
    queue: { anchor: 'br', width: 380, y: 160 },
    uptime: { anchor: 'tr', width: 220, align: 'center', size: 28 },
    deaths: { anchor: 'tr', width: 240, size: 20 },
    poll: { anchor: 'mr', width: 380 },
    ticker: { anchor: 'bc', width: 1920, x: 0, y: 0, radius: 0, bw: 0, anim: 'fade' },
  };

  const has = (id) => LIST.some((w) => w[0] === id);
  const meta = (id) => LIST.find((w) => w[0] === id) || null;

  function contentDefaults(id) {
    const o = {};
    (CONTENT[id] || []).forEach((f) => { o[f[0]] = f[3]; });
    return o;
  }
  function defaults(id) {
    return Object.assign({}, STYLE, WIDGET_DEFAULTS[id] || {}, { content: contentDefaults(id) });
  }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  // Полные настройки виджета: значения по умолчанию + сохранённые
  function cfg(id, all) {
    const d = defaults(id);
    const saved = (all && all.cfg && isObj(all.cfg[id])) ? all.cfg[id] : {};
    return Object.assign({}, d, saved, { content: Object.assign({}, d.content, isObj(saved.content) ? saved.content : {}) });
  }

  // ---------- хранение на сервере ----------
  // PHP отдаёт пустые объекты как [] — приводим к {on:{id:true}, cfg:{id:{…}}}
  function norm(d) {
    const out = { on: {}, cfg: {} };
    if (d && d.on && typeof d.on === 'object') Object.keys(d.on).forEach((k) => { if (d.on[k] && has(k)) out.on[k] = true; });
    if (d && isObj(d.cfg)) Object.keys(d.cfg).forEach((k) => { const v = d.cfg[k]; if (v && typeof v === 'object') out.cfg[k] = JSON.parse(JSON.stringify(Array.isArray(v) ? {} : v)); });
    return out;
  }
  // У каждого включённого виджета на сервере должны лежать настройки: бот берёт из них команду счётчика,
  // а цели получают точку отсчёта (since) в момент включения, а не «все донаты за всё время».
  function prepare(d) {
    const out = norm(d);
    Object.keys(out.on).forEach((id) => { if (!isObj(out.cfg[id]) || !Object.keys(out.cfg[id]).length) out.cfg[id] = defaults(id); });
    return out;
  }
  function countOn(d) { return Object.keys((d && d.on) || {}).filter((k) => d.on[k]).length; }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && typeof d === 'object' ? norm(d) : null;
    } catch (e) { return null; }
  }
  function clearLocal() { try { localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ } }

  // Загрузка. Если на сервере пусто (null) — один раз переносим настройки из этого браузера, иначе берём стандартные.
  // Результат: {data:{on,cfg}, token, limit, migrated: '' | 'local' | 'defaults', dropped: [id выключенных из-за лимита]}
  async function load() {
    const r = await window.StreAPI.get('widgets.get');
    const limit = Number(r.limit) || 0;
    if (r.data) return { data: norm(r.data), token: r.token || '', limit, migrated: '', dropped: [] };
    const local = readLocal();
    const d = local || { on: {}, cfg: {} };
    if (!local) DEFAULT_ON.forEach((id) => { d.on[id] = true; });
    const dropped = [];
    let n = 0;
    LIST.forEach((w) => {
      if (!d.on[w[0]]) return;
      if (w[5] !== 'soon' && n < limit) n++; else { delete d.on[w[0]]; if (local) dropped.push(w[0]); }
    });
    await window.StreAPI.post('widgets.save', { data: prepare(d) });
    if (local) clearLocal();
    const r2 = await window.StreAPI.get('widgets.get');
    return { data: norm(r2.data), token: r2.token || r.token || '', limit: Number(r2.limit) || limit, migrated: local ? 'local' : 'defaults', dropped };
  }

  // Изменение: берём свежую копию с сервера (вдруг правили в другой вкладке), применяем mutate(d) и сохраняем.
  // Запросы идут строго по очереди. Возвращает сохранённые данные (с since у целей).
  let chain = Promise.resolve();
  function update(mutate) {
    const run = async () => {
      const r = await window.StreAPI.get('widgets.get');
      const d = norm(r.data);
      mutate(d);
      const out = prepare(d);
      await window.StreAPI.post('widgets.save', { data: out });
      const needSince = ['goal', 'subgoal'].some((g) => out.cfg[g] && !out.cfg[g].since);
      if (!needSince) return out;
      const r2 = await window.StreAPI.get('widgets.get');
      return norm(r2.data);
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  // ---------- ссылки ----------
  function obsUrl(token, id) { return location.origin + '/w/?t=' + encodeURIComponent(token || '') + '&w=' + encodeURIComponent(id); }
  // Game State Integration: адрес и параметры — строго как ждёт server/public/gsi/index.php (?t=токен&g=cs|dota)
  function gsiUrl(token, game) { return location.origin + '/gsi/index.php?t=' + encodeURIComponent(token || '') + '&g=' + game; }
  const GSI = {
    cs: {
      game: 'Counter-Strike 2',
      file: 'gamestate_integration_streops.cfg',
      folder: 'Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg',
      data: [['provider', 1], ['map', 1], ['round', 1], ['player_id', 1], ['player_match_stats', 1]],
    },
    dota: {
      game: 'Dota 2',
      file: 'gamestate_integration_streops.cfg',
      folder: 'Steam\\steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\gamestate_integration',
      data: [['provider', 1], ['map', 1], ['player', 1], ['hero', 1]],
    },
  };
  function gsiConfig(token, game) {
    const g = GSI[game];
    const pad = (k, n) => '"' + k + '"' + ' '.repeat(Math.max(1, n - k.length));
    return '"StreOps ' + g.game + '"\n{\n' +
      '\t' + pad('uri', 12) + '"' + gsiUrl(token, game) + '"\n' +
      '\t' + pad('timeout', 12) + '"5.0"\n' +
      '\t' + pad('buffer', 12) + '"0.1"\n' +
      '\t' + pad('throttle', 12) + '"0.5"\n' +
      '\t' + pad('heartbeat', 12) + '"30.0"\n' +
      '\t"data"\n\t{\n' + g.data.map((x) => '\t\t' + pad(x[0], 22) + '"' + x[1] + '"').join('\n') + '\n\t}\n}\n';
  }

  // ---------- тексты алертов ----------
  const fmtNum = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function plural(n, f) {
    n = Math.abs(Number(n) || 0) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return f[2];
    if (n1 > 1 && n1 < 5) return f[1];
    if (n1 === 1) return f[0];
    return f[2];
  }
  // e — событие как в event_row: {type, name, data:{amount, viewers, months, total, message}}
  function alertLabel(e) {
    const d = e.data || {};
    switch (e.type) {
      case 'follow': return 'Новый фолловер';
      case 'sub': return 'Новая подписка';
      case 'resub': return 'Подписка · ' + (d.months || 1) + ' ' + plural(d.months || 1, ['месяц', 'месяца', 'месяцев']) + ' подряд';
      case 'gift': return 'Подарочные подписки' + (d.total > 1 ? ' · ' + d.total : '');
      case 'raid': return 'Рейд · ' + fmtNum(d.viewers) + ' ' + plural(d.viewers, ['зритель', 'зрителя', 'зрителей']);
      case 'donation': return 'Донат · ' + fmtNum(d.amount) + ' ₽';
    }
    return 'Событие';
  }
  const TPL = { follow: 'tplFollow', sub: 'tpl', resub: 'tpl', gift: 'tplGift', raid: 'tplRaid', donation: 'tplDonate' };
  function alertText(ct, e) {
    const d = e.data || {};
    if (e.type === 'donation' && d.message) return String(d.message);
    const key = TPL[e.type] || 'tpl';
    const tpl = ct[key] != null ? ct[key] : (contentDefaults('alerts')[key] || '');
    return String(tpl).replace(/\{(name|amount|viewers|months|count)\}/g, (m, k) => (
      k === 'name' ? (e.name || '') : k === 'amount' ? fmtNum(d.amount) + ' ₽' : k === 'viewers' ? fmtNum(d.viewers) : k === 'months' ? String(d.months || 1) : String(d.total || 1)));
  }

  // ---------- оформление ----------
  function rgba(hex, a) {
    const h = String(hex || '#000').replace('#', '');
    const n = parseInt(h, 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (a / 100) + ')';
  }

  // CSS-переменные оформления виджета
  function vars(c) {
    const sh = [];
    if (c.shadow > 0) sh.push('0 ' + Math.round(c.shadow / 4) + 'px ' + Math.round(c.shadow * 0.8) + 'px rgba(0,0,0,' + (c.shadow / 140).toFixed(2) + ')');
    if (c.glow > 0) sh.push('0 0 ' + c.glow + 'px ' + rgba(c.glowC, 70));
    return [
      '--w-bg:' + rgba(c.bg, c.bgA),
      '--w-blur:' + c.blur + 'px',
      '--w-bd:' + (c.bw > 0 ? c.bw + 'px solid ' + rgba(c.bc, c.bcA) : '0 solid transparent'),
      '--w-rad:' + c.radius + 'px',
      '--w-shadow:' + (sh.length ? sh.join(',') : 'none'),
      '--w-pad:' + c.pad + 'px',
      '--w-font:' + (c.font === 'JetBrains Mono' ? "'JetBrains Mono', monospace" : "'" + c.font + "', system-ui, sans-serif"),
      '--w-fg:' + c.fg,
      '--w-fg2:' + c.fg2,
      '--w-acc:' + c.acc,
      '--w-acc-soft:' + rgba(c.acc, 22),
      '--w-size:' + c.size + 'px',
      '--w-weight:' + c.weight,
      '--w-align:' + c.align,
      '--w-ls:' + (c.ls / 100) + 'em',
      '--w-tshadow:' + (c.tshadow ? '0 1px 3px rgba(0,0,0,.85), 0 0 1px rgba(0,0,0,.9)' : 'none'),
      '--w-upper:' + (c.upper ? 'uppercase' : 'none'),
    ].join(';');
  }

  const FONTS = ['Onest', 'Golos Text', 'Manrope', 'Rubik', 'Unbounded', 'Montserrat', 'JetBrains Mono'];
  const FONT_URL = {
    'Golos Text': 'Golos+Text:wght@400;500;600;700;800',
    'Manrope': 'Manrope:wght@400;500;600;700;800',
    'Rubik': 'Rubik:wght@400;500;600;700;800',
    'Unbounded': 'Unbounded:wght@400;500;600;700;800',
    'Montserrat': 'Montserrat:wght@400;500;600;700;800',
  };
  function useFont(name) {
    if (!FONT_URL[name] || document.getElementById('wf-' + name)) return;
    const l = document.createElement('link');
    l.id = 'wf-' + name;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + FONT_URL[name] + '&display=swap';
    document.head.appendChild(l);
  }

  window.StreWidgets = {
    KEY, LIST, CATS, DEFAULT_ON, BOTS, STYLE, PRESETS, CONTENT, FONTS, GSI,
    meta, defaults, cfg, norm, countOn, load, update, readLocal,
    obsUrl, gsiUrl, gsiConfig, alertLabel, alertText, plural, fmtNum,
    vars, rgba, useFont,
  };
})();

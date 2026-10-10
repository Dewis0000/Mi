/* StreOps — виджеты для OBS: список, настройки по умолчанию, пресеты стиля и хранение.
   Используется страницами «Виджеты» и «Редактор виджета». Настройки лежат в localStorage. */
(function () {
  'use strict';

  const KEY = 'streops-widgets-v1';

  // id, название, категория, описание, тариф, статус
  const LIST = [
    ['alerts', 'Алерты', 'Алерты', 'Фолловы, подписки, рейды и донаты со звуком', '', 'ok'],
    ['goal', 'Цель доната', 'Цели', 'Полоса прогресса к сумме, обновляется сразу после доната', '', 'ok'],
    ['subgoal', 'Цель подписчиков', 'Цели', 'Сколько подписок осталось до цели', '', 'ok'],
    ['chat', 'Чат на экране', 'Чат', 'Сообщения чата поверх сцены, с ролями и никами', '', 'ok'],
    ['events', 'Последние события', 'Алерты', 'Лента: рейды, подписки, донаты', '', 'ok'],
    ['topdon', 'Топ донатеров', 'Алерты', 'За стрим, неделю или месяц', '', 'ok'],
    ['faceit', 'FACEIT: уровень и ELO', 'Игры', 'Уровень, ELO и изменение за стрим', '', 'ok'],
    ['fmatch', 'FACEIT: статистика стрима', 'Игры', 'K/D, хедшоты, победы и поражения', '', 'ok'],
    ['cs', 'CS2: счёт матча', 'Игры', 'Счёт и раунд через Game State Integration', '', 'setup'],
    ['dota', 'Dota 2: статистика', 'Игры', 'MMR, результат за стрим, уровень героя Dota Plus', '', 'setup'],
    ['np', 'Сейчас играет', 'Музыка', 'Трек и кто его заказал', '', 'ok'],
    ['queue', 'Очередь заказов', 'Музыка', 'Ближайшие треки из очереди', '', 'ok'],
    ['uptime', 'Таймер эфира', 'Таймеры', 'Сколько идёт стрим', '', 'ok'],
    ['deaths', 'Счётчик', 'Таймеры', 'Смерти, победы, что угодно. Модераторы ведут командой', '', 'ok'],
    ['poll', 'Голосование', 'Интерактив', 'Зрители голосуют цифрой в чате', 'Максимум', 'locked'],
    ['ticker', 'Бегущая строка', 'Интерактив', 'Ссылки, расписание, правила чата', '', 'ok'],
  ];
  const CATS = ['Все', 'Алерты', 'Цели', 'Чат', 'Игры', 'Музыка', 'Таймеры', 'Интерактив'];
  const DEFAULT_ON = { alerts: true, goal: true, chat: true, events: true, faceit: true, np: true, uptime: true };
  const LIMIT = 10;

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

  // Содержимое каждого виджета: поля для вкладки «Содержимое»
  const CONTENT = {
    alerts: [
      ['type', 'Пример события', 'select', 'sub', [['follow', 'Фоллов'], ['sub', 'Подписка'], ['donate', 'Донат'], ['raid', 'Рейд']]],
      ['name', 'Ник в примере', 'text', 'tixiy_bard'],
      ['tpl', 'Текст алерта', 'text', '{name} подписался — спасибо!'],
      ['minDonate', 'Минимальный донат для алерта, ₽', 'number', 50],
      ['image', 'Картинка или гифка', 'toggle', true],
      ['tts', 'Озвучивать сообщение доната', 'toggle', false],
    ],
    goal: [
      ['title', 'Название цели', 'text', 'Новая видеокарта'],
      ['current', 'Собрано, ₽', 'number', 12400],
      ['target', 'Цель, ₽', 'number', 30000],
      ['pct', 'Показывать проценты', 'toggle', true],
      ['bar', 'Стиль полосы', 'select', 'hatch', [['solid', 'Сплошная'], ['hatch', 'Штриховка'], ['gradient', 'Градиент']]],
      ['barH', 'Толщина полосы, px', 'number', 12],
    ],
    subgoal: [
      ['title', 'Название', 'text', 'Подписчики'],
      ['current', 'Сейчас', 'number', 186],
      ['target', 'Цель', 'number', 250],
      ['pct', 'Показывать проценты', 'toggle', false],
      ['bar', 'Стиль полосы', 'select', 'solid', [['solid', 'Сплошная'], ['hatch', 'Штриховка'], ['gradient', 'Градиент']]],
      ['barH', 'Толщина полосы, px', 'number', 10],
    ],
    chat: [
      ['max', 'Сообщений на экране', 'number', 5],
      ['life', 'Сообщение исчезает через, с (0 — никогда)', 'number', 30],
      ['badges', 'Значки ролей', 'toggle', true],
      ['nick', 'Цвет ников', 'select', 'accent', [['accent', 'Акцент'], ['text', 'Как текст'], ['platform', 'Из Twitch']]],
      ['hideCmd', 'Скрывать команды (!…)', 'toggle', true],
      ['hideBots', 'Скрывать ботов', 'toggle', true],
    ],
    events: [
      ['count', 'Сколько событий', 'number', 3],
      ['amounts', 'Показывать суммы', 'toggle', true],
    ],
    topdon: [
      ['period', 'Период', 'select', 'month', [['stream', 'Стрим'], ['week', 'Неделя'], ['month', 'Месяц']]],
      ['count', 'Сколько мест', 'number', 3],
    ],
    faceit: [
      ['nick', 'Ник на FACEIT', 'text', 'kira_cs'],
      ['level', 'Уровень', 'toggle', true],
      ['elo', 'ELO', 'toggle', true],
      ['delta', 'Изменение за стрим', 'toggle', true],
      ['last5', 'Последние 5 матчей', 'toggle', true],
    ],
    fmatch: [
      ['nick', 'Ник на FACEIT', 'text', 'kira_cs'],
      ['kd', 'K/D', 'toggle', true],
      ['hs', 'Хедшоты', 'toggle', true],
      ['wl', 'Победы и поражения', 'toggle', true],
    ],
    cs: [
      ['map', 'Показывать карту', 'toggle', true],
      ['round', 'Показывать раунд', 'toggle', true],
    ],
    dota: [
      ['steam', 'Steam ID', 'text', '76561198041234567'],
      ['mmr', 'MMR', 'toggle', true],
      ['wl', 'Результат за стрим', 'toggle', true],
      ['hero', 'Герой и уровень Dota Plus', 'toggle', true],
    ],
    np: [
      ['requester', 'Кто заказал', 'toggle', true],
      ['cover', 'Обложка', 'toggle', true],
      ['progress', 'Полоса прогресса', 'toggle', true],
    ],
    queue: [
      ['count', 'Сколько треков', 'number', 3],
      ['requester', 'Кто заказал', 'toggle', false],
    ],
    uptime: [
      ['label', 'Подпись', 'text', 'В эфире'],
      ['format', 'Формат', 'select', 'hms', [['hms', 'ЧЧ:ММ:СС'], ['hm', 'ЧЧ:ММ'], ['words', '2 ч 47 мин']]],
    ],
    deaths: [
      ['label', 'Подпись', 'text', 'Смертей'],
      ['value', 'Значение', 'number', 14],
      ['command', 'Команда для модераторов', 'text', '!смерть'],
    ],
    poll: [
      ['q', 'Вопрос', 'text', 'Какую карту дальше?'],
      ['a', 'Вариант 1', 'text', 'Mirage'],
      ['b', 'Вариант 2', 'text', 'Inferno'],
      ['secs', 'Длительность, с', 'number', 60],
    ],
    ticker: [
      ['text', 'Текст', 'text', 'Сервер Discord: discord.gg/kira · Заказ музыки: !музыка · Стрим каждый день с 21:00'],
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

  function contentDefaults(id) {
    const o = {};
    (CONTENT[id] || []).forEach((f) => { o[f[0]] = f[3]; });
    return o;
  }
  function defaults(id) {
    return Object.assign({}, STYLE, WIDGET_DEFAULTS[id] || {}, { content: contentDefaults(id) });
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { on: d.on || Object.assign({}, DEFAULT_ON), cfg: d.cfg || {} };
      }
    } catch (e) { /* хранилище недоступно */ }
    return { on: Object.assign({}, DEFAULT_ON), cfg: {} };
  }
  function saveAll(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  }
  function cfg(id, all) {
    const d = defaults(id);
    const saved = (all || loadAll()).cfg[id] || {};
    return Object.assign({}, d, saved, { content: Object.assign({}, d.content, saved.content || {}) });
  }

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

  function token(id) {
    let h = 0;
    for (const ch of id + 'kira_stream') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h.toString(16).padStart(8, '0') + 'e4b8';
  }

  window.StreWidgets = { KEY, LIST, CATS, LIMIT, STYLE, PRESETS, CONTENT, FONTS, defaults, loadAll, saveAll, cfg, vars, rgba, useFont, token };
})();

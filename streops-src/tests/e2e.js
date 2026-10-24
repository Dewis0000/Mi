// Сквозной тест: два браузера (и третий в комнате) проверяют сообщения, ember, звонок и голосовую комнату.
// Запуск: HEARTH_URL=http://127.0.0.1:3100/dsZov/ npm run test:e2e   (нужен playwright: npm i -D playwright)
const { chromium } = require('playwright');

const BASE = process.env.HEARTH_URL || 'http://127.0.0.1:3100/dsZov/';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
};

const TRACK_PCS = () => {
  window.__pcs = [];
  const Orig = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...args) {
    const pc = new Orig(...args);
    window.__pcs.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Orig.prototype;
};

async function login(page, nick) {
  await page.goto(BASE);
  await page.fill('#login-nick', nick);
  await page.click('#login-submit');
  await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
}

async function connectedCount(page) {
  return page.evaluate(() => window.__pcs.filter((p) => p.connectionState === 'connected').length);
}

(async () => {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const ctxA = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const ctxB = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errorsA = [];
  const errorsB = [];
  a.on('pageerror', (e) => errorsA.push(String(e)));
  b.on('pageerror', (e) => errorsB.push(String(e)));
  await a.addInitScript(TRACK_PCS);
  await b.addInitScript(TRACK_PCS);

  // 1. Регистрация
  await login(a, 'Anna');
  await login(b, 'Boris');
  const handleA = await a.textContent('#me-handle');
  check('регистрация выдаёт уникальный ID вида ник#КОД', /^anna#[A-Z2-9]{6}$/i.test(handleA), handleA);

  // 2. Присутствие
  await a.waitForFunction(() => document.querySelectorAll('#members .member').length === 2, null, { timeout: 8000 });
  check('онлайн-список видит обоих', true);

  // 3. Сообщения в реальном времени
  await a.fill('#composer-input', 'Привет, Борис! Костёр уже горит.');
  await a.click('#composer button[type=submit]');
  await b.waitForFunction(() => document.querySelector('#messages') && document.querySelector('#messages').textContent.includes('Костёр уже горит'), null, { timeout: 8000 });
  check('сообщение доходит до второго пользователя', true);

  // 4. Ember-реакция
  await b.click('#messages .msg:last-child .ember');
  await a.waitForFunction(() => /Ember 1/.test(document.querySelector('#messages .msg:last-child .ember')?.textContent || ''), null, { timeout: 8000 });
  check('ember-реакция синхронизируется', true);

  // 5. Смена ника
  await b.click('#open-settings');
  await b.fill('#nick-input', 'Boris Rivers');
  await b.click('#nick-form button[type=submit]');
  await a.waitForFunction(() => document.querySelector('#members').textContent.includes('Boris Rivers'), null, { timeout: 8000 });
  check('смена ника видна у других в списке участников', true);
  await b.click('#settings-close');

  // 6. Личный звонок (кольцо)
  await a.click('#members button[aria-label="Позвонить: Boris Rivers"]');
  await b.waitForSelector('#incoming[open]', { timeout: 8000 });
  check('входящий звонок показан собеседнику', true);
  await b.click('#btn-accept');
  await a.waitForSelector('#call:not([hidden])', { timeout: 8000 });
  await a.waitForFunction(() => window.__pcs.some((p) => p.connectionState === 'connected'), null, { timeout: 25000 });
  await b.waitForFunction(() => window.__pcs.some((p) => p.connectionState === 'connected'), null, { timeout: 25000 });
  check('личный звонок: WebRTC соединился у обоих', true);
  await a.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 2, null, { timeout: 8000 });
  await b.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 2, null, { timeout: 8000 });
  check('в звонке по две плитки у обоих', true);

  // 7. Микрофон выключен — видно у собеседника
  await a.click('#btn-mic');
  await b.waitForFunction(() => /без микрофона/.test(document.querySelectorAll('#tiles .tile')[1]?.textContent || ''), null, { timeout: 8000 });
  check('выключенный микрофон виден у собеседника', true);
  await a.click('#btn-mic');

  // 8. Камера включена — у собеседника появляется видео
  await a.click('#btn-cam');
  await b.waitForFunction(() => {
    const tile = document.querySelectorAll('#tiles .tile')[1];
    return tile && !tile.classList.contains('no-video');
  }, null, { timeout: 15000 });
  check('камера собеседника передаётся (видео вместо аватара)', true);

  // 9. Чат в звонке
  await a.click('#btn-chat');
  await a.fill('#call-input', 'Пишу из звонка');
  await a.click('#call-composer button[type=submit]');
  await b.waitForFunction(() => document.querySelector('#messages').textContent.includes('Пишу из звонка'), null, { timeout: 8000 });
  check('сообщение из окна звонка доходит в общий чат', true);

  // 10. Выход из звонка: собеседник видит завершение
  await a.click('#btn-leave');
  await a.waitForFunction(() => document.getElementById('call').hidden, null, { timeout: 5000 });
  await b.waitForFunction(() => document.getElementById('call').hidden, null, { timeout: 8000 });
  check('выход из звонка закрывает окно у обоих', true);

  // 11. Голосовая комната Campfire: два участника
  await a.click('#voice-channels button');
  await b.click('#voice-channels button');
  await a.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 2, null, { timeout: 10000 });
  await a.waitForFunction(() => window.__pcs.some((p) => p.connectionState === 'connected'), null, { timeout: 25000 });
  await b.waitForFunction(() => window.__pcs.some((p) => p.connectionState === 'connected'), null, { timeout: 25000 });
  check('голосовая комната Campfire: соединение установлено', true);

  // 12. Третий участник в той же комнате
  const ctxC = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const c = await ctxC.newPage();
  c.on('pageerror', (e) => errorsB.push('C: ' + String(e)));
  await c.addInitScript(TRACK_PCS);
  await login(c, 'Cora');
  await c.click('#voice-channels button');
  await a.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 3, null, { timeout: 15000 });
  await c.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 3, null, { timeout: 15000 });
  await c.waitForFunction(() => window.__pcs.filter((p) => p.connectionState === 'connected').length >= 2, null, { timeout: 30000 });
  check('три участника в Campfire видят друг друга', true);
  await c.click('#btn-leave');
  await a.waitForFunction(() => document.querySelectorAll('#tiles .tile').length === 2, null, { timeout: 10000 });
  check('уход третьего участника убирает его плитку', true);

  const jsErrors = [...errorsA, ...errorsB];
  check('нет необработанных ошибок в консоли страниц', jsErrors.length === 0, jsErrors.join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nИтог: ${results.length - failed} из ${results.length} проверок прошли`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('ТЕСТ УПАЛ:', err.message);
  process.exit(2);
});

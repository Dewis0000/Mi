import fs from 'node:fs';
import { config } from './config.js';
import { createApp } from './app.js';
import { startJobs } from './services/jobs.js';

const app = createApp();
const onReady = (where: string) => {
  console.log(`API: ${where} (TZ=${process.env.TZ ?? 'system'})`);
  startJobs();
};

// Хостинг на ispmanager запускает Node.js-сайт через Unix-сокет (SOCKET)
// или через выделенный порт (PORT + INSTANCE_HOST); локально — просто PORT.
const socket = process.env.SOCKET;
if (socket) {
  fs.rmSync(socket, { force: true });
  app.listen(socket, () => {
    fs.chmodSync(socket, 0o660);
    onReady(`unix:${socket}`);
  });
} else {
  const host = process.env.INSTANCE_HOST;
  if (host) app.listen(config.PORT, host, () => onReady(`http://${host}:${config.PORT}`));
  else app.listen(config.PORT, () => onReady(`http://localhost:${config.PORT}`));
}

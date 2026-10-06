import { config } from './config.js';
import { createApp } from './app.js';
import { startJobs } from './services/jobs.js';

createApp().listen(config.PORT, () => {
  console.log(`API: http://localhost:${config.PORT} (TZ=${process.env.TZ ?? 'system'})`);
  startJobs();
});

// Запасной вариант для случая, если у вас есть прямой доступ к pm2 по SSH
// (например, панель запускает процессы под вашим же пользователем, или
// вы на VPS с root). Основной путь на обычном хостинге reg.ru — через
// Node.js-проект в панели ISPmanager, см. вывод server/install.sh.
//
// Использование:  pm2 startOrReload server/ecosystem.config.cjs
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "quest-club",
      cwd: path.join(__dirname, "..", ".next", "standalone"),
      script: "server.js",
      env: { NODE_ENV: "production", PORT: process.env.PORT || "3000" },
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
    },
  ],
};

const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "quest-club",
      cwd: path.join(__dirname, ".."),
      script: "./node_modules/.bin/next",
      args: `start -p ${process.env.PORT || 3000}`,
      env: { NODE_ENV: "production" },
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
    },
  ],
};

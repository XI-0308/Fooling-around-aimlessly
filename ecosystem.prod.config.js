/** PM2 prod mode: run after npm run build */
const path = require("path");

const root = __dirname;

const WEB_ORIGIN =
  "http://localhost:3000,http://127.0.0.1:3000,http://100.127.1.64:3000,https://desktop-bsashk7.tail683db4.ts.net,https://itbelongstoxi.com,http://itbelongstoxi.com";

module.exports = {
  apps: [
    {
      name: "rp-agent-server",
      cwd: path.join(root, "apps/server"),
      script: path.join(root, "apps/server/dist/index.js"),
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
      max_restarts: 100,
      min_uptime: "10s",
      restart_delay: 4000,
      watch: false,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "3001",
        WEB_ORIGIN,
      },
    },
    {
      name: "rp-agent-web",
      cwd: path.join(root, "apps/web"),
      script: path.join(root, "node_modules/next/dist/bin/next"),
      args: "start -p 3000 -H 0.0.0.0",
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
      max_restarts: 100,
      min_uptime: "10s",
      restart_delay: 4000,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "cookiecloud",
      cwd: path.join(root, "services/cookiecloud-api"),
      script: "app.js",
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
      max_restarts: 100,
      min_uptime: "10s",
      restart_delay: 4000,
      watch: false,
      env: { PORT: "8088" },
    },
  ],
};

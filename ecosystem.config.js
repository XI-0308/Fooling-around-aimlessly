/** PM2 dev mode: auto-restart on crash */
const path = require("path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "rp-agent-server",
      cwd: path.join(root, "apps/server"),
      script: path.join(root, "node_modules/tsx/dist/cli.mjs"),
      args: "watch src/index.ts",
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
      max_restarts: 100,
      min_uptime: "10s",
      restart_delay: 4000,
      watch: false,
      env: {
        HOST: "0.0.0.0",
        PORT: "3001",
        // 手机经 Tailscale 打开时带 Origin，需放行，避免登录 cookie 被 CORS 挡
        WEB_ORIGIN:
          "http://localhost:3000,http://127.0.0.1:3000,http://100.127.1.64:3000,https://desktop-bsashk7.tail683db4.ts.net,https://itbelongstoxi.com,http://itbelongstoxi.com",
      },
    },
    {
      name: "rp-agent-web",
      cwd: path.join(root, "apps/web"),
      script: path.join(root, "node_modules/next/dist/bin/next"),
      args: "dev -p 3000 -H 0.0.0.0",
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
      max_restarts: 100,
      min_uptime: "10s",
      restart_delay: 4000,
      watch: false,
      env: {
        ALLOWED_DEV_ORIGINS:
          "100.127.1.64,desktop-bsashk7.tail683db4.ts.net,itbelongstoxi.com",
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

/** @type {import('next').NextConfig} */
const extraOrigins = (process.env.ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  devIndicators: false,
  // 手机经 Tailscale / 自定义域名访问时，消除跨域警告
  allowedDevOrigins: [
    "100.127.1.64",
    "127.0.0.1",
    "desktop-bsashk7.tail683db4.ts.net",
    "*.tail683db4.ts.net",
    "itbelongstoxi.com",
    "www.itbelongstoxi.com",
    ...extraOrigins,
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 明确允许本站使用麦克风，减少部分浏览器反复询问
          {
            key: "Permissions-Policy",
            value: "microphone=(self), autoplay=(self)",
          },
        ],
      },
    ];
  },
  // /api 由 app/api/[...path]/route.ts 流式转发，避免 rewrite 缓冲 SSE（iPhone 聊天流式）
};

module.exports = nextConfig;

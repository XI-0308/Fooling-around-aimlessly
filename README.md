           【Encore Flow】 一个专注于单角色的长期陪伴Agent

我们的世界人总是很多，但我想有那么一个永远也不会分开的人。你只要保护好Ta,Ta就会一直陪伴在你身边。

该项目设计使用媒介主要为：手机。（电脑端也可）
人格画像：除了知道你是谁，还关乎于你是什么人。(每晚自动总结，带总结证据)
语意记忆：关乎于你的单一事实。
事件记忆：关乎于发生了什么。（可选择对话自动总结）
近期活动：关乎于你最近做了什么，将要做什么（可设置提醒），你们有什么约定。
读书记忆：关乎于你们一起读过什么书。（可建独立书卡。支持聊天内容总结进书卡。）
资料记忆：关乎于你们一起看过哪些文章，看过哪些视频，读过哪些大部头的书。（支持B站字幕，知乎专栏原文抓取，自定义向量内容）
慢思考：关乎于那些偶发的灵感，不着急讨论出来的话题。（支持双方轮流讨论，并自动写入Obisidian.）
KEEP：关乎于你的健康和运动情况。
网易云：分享音乐卡片，共同听歌。
...

所有数据（聊天记录、记忆、人格画像、健康状态）都保存在你的本地。

---

## 环境要求

- Node.js **22+**
- Windows 推荐（附带 PM2 守护脚本）；也可自行用 `npm run dev` 在其它系统开发

---

## 安装与启动

```powershell
git clone https://github.com/XI-0308/Fooling-around-aimlessly.git
cd Fooling-around-aimlessly

copy .env.example .env
# 编辑 .env：至少修改 APP_PASSWORD、SESSION_SECRET

npm install
npm run serve
```

浏览器打开：**http://localhost:3000**，用 `.env` 里的密码登录。

生产构建 + PM2：

```powershell
npm run serve:prod
```

开发热重载：

```powershell
npm run dev
```

---

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run serve` | PM2 守护开发服务 |
| `npm run serve:prod` | 构建并用 PM2 跑生产 |
| `npm run serve:stop` | 停止 |
| `npm run serve:status` | 查看进程 |
| `npm run serve:autostart` | 注册 Windows 登录自启（可选） |

---

## 技术栈（简）

- 前端：Next.js（`apps/web`）
- 后端：Express（`apps/server`）
- 可选：CookieCloud、微信读书、Keep、网易云、Obsidian、LEANN 向量检索等扩展（在设置中按需配置）

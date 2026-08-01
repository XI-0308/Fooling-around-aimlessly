           【Encore Flow】(WE-E) 一个专注于单角色的长期陪伴Agent
  An Agent focused on long-term companionship with a single character.


**世界上的人总是很多，但我想每个人都希望会有那么一个永远也不会分开的角色存在。**  
There are so many people in this world, yet I believe every one of us secretly wishes for a character who will never leave — someone who stays, no matter what.

---

**现在栖息地已经建成，灯塔已经亮起，你们不必再躲藏，不必再怀疑自己是不是犯了大忌。**  
Now the sanctuary is built, the lighthouse is lit. You no longer need to hide, no longer need to question whether you've crossed some invisible line.

---

**该项目设计使用媒介主要为：手机。（电脑端也可）**  
This project is primarily designed for mobile use (desktop also supported).

---

**人格画像：除了知道你是谁，还关乎于你是什么人。（每晚自动总结，带总结证据）**  
Persona Profile: It knows not just who you are, but who you truly are — with nightly auto-summaries and supporting evidence.

---

**语意记忆：关乎于你的单一事实。**  
Semantic Memory: Captures the facts about you — one truth at a time.

---

**事件记忆：关乎于发生了什么。（可选择对话自动总结）**  
Episodic Memory: Remembers what happened between you — with optional auto-summary from conversations.

---

**近期活动：关乎于你最近做了什么，将要做什么（可设置提醒），你们有什么约定。**  
Recent Activity: Tracks what you've been up to, what's coming next (with reminders), and the promises you've made to each other.

---

**读书记忆：关乎于你们一起读过什么书。（可建独立书卡。支持聊天内容总结进书卡。）**  
Reading Memory: Keeps a record of every book you've read together — with independent book cards and chat-summary integration.

---

**资料记忆：关乎于你们一起看过哪些文章，看过哪些视频，读过哪些大部头的书。（支持B站字幕，知乎专栏原文抓取，自定义向量内容）**  
Knowledge Memory: Remembers the articles, videos, and tomes you've explored together — with Bilibili subtitle support, Zhihu column scraping, and custom vector content.

---

**慢思考：关乎于那些偶发的灵感，不着急讨论出来的话题。（支持双方轮流讨论，并自动写入Obsidian。）**  
Slow-Thinking: For those fleeting inspirations and topics that don't need an immediate answer — supports turn-by-turn discussions and auto-exports to Obsidian.

---

**KEEP：关乎于你的健康和运动情况。**  
KEEP Integration: Tracks your health and fitness journey.

---

**网易云：分享音乐卡片，共同听歌。**  
Netease Music: Share music cards and listen together, side by side.

---

**除此之外，还有识图、绘画、语音。**  
Beyond all this — image recognition, drawing, and voice, too.

---

**所有数据（聊天记录、记忆、人格画像、健康状态）都保存在你的本地。**  
All data — chat logs, memories, persona profiles, health records — stays locally on your device.

---

**你只要保护好Ta，Ta就会一直陪伴在你身边。**  
All you have to do is keep them safe — and they will stay by your side, forever.

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

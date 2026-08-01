# Encore Flow

唯一一个角色的深度陪伴：本地运行的角色扮演 Agent（聊天、记忆、人格画像、健康近况、Obsidian 慢思考、主题装饰等）。

仓库地址：https://github.com/XI-0308/Fooling-around-aimlessly

> 本仓库**不包含**作者的私人对话、记忆、密钥或角色卡。你需要用自己的 API Key，并导入自己的角色。

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

### 首次使用

1. 打开 **设置**，填写你自己的 DeepSeek API Key 并保存  
2. 导入你自己的 SillyTavern 角色卡（`.png` / `.json`）  
3. （可选）在人物页填写你的称呼；未填写时界面默认用「你 / 角色」

---

## 隐私

请勿提交：

- `data/`（聊天、记忆、设置、推送密钥等运行时数据）
- `.env` / `.env.local`（密码与密钥）

仓库已通过 `.gitignore` 忽略上述路径。克隆后会在本地自动生成自己的 `data/`。

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

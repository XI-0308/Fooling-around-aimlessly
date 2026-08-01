#!/usr/bin/env node
/**
 * 重置 WE-E 登录密码（写入 data/settings.json）
 * 用法：node scripts/reset-app-password.mjs "你的新密码"
 */
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const password = process.argv[2];
if (!password?.trim()) {
  console.error("用法：node scripts/reset-app-password.mjs \"你的新密码\"");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.join(root, "data", "settings.json");

if (!fs.existsSync(settingsPath)) {
  console.error("找不到 data/settings.json");
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
settings.appPasswordHash = bcrypt.hashSync(password.trim(), 10);
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
console.log("[reset-app-password] 登录密码已重置，请用新密码重新登录。");

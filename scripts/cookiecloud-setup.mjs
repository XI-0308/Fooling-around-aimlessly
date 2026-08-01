#!/usr/bin/env node
/** Safe CookieCloud setup: patch cookieCloud fields without wiping other settings */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.join(root, "data", "settings.json");

if (!fs.existsSync(settingsPath)) {
  console.error("[CookieCloud] data/settings.json not found. Log in to Encore Flow first.");
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const uuid = crypto.randomUUID();
const password = randomBytes(8).toString("hex");
const url = "http://127.0.0.1:8088";
const cc = { url, id: uuid, password };

settings.neteaseMusic = settings.neteaseMusic || {};
settings.weread = settings.weread || {};
settings.neteaseMusic.cookieCloud = { ...cc };
settings.weread.cookieCloud = { ...cc };

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

console.log("");
console.log("========== CookieCloud Ready ==========");
console.log("Server URL:", url);
console.log("UUID:      ", uuid);
console.log("Password:  ", password);
console.log("");
console.log("Saved to data/settings.json (NetEase + WeRead share same CookieCloud).");

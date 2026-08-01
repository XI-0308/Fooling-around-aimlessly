import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const storePath = pathToFileURL(path.join(root, "apps/server/dist/worldInfo/store.js")).href;
const { importStWorldInfo, loadWorldInfoBook } = await import(storePath);

const src = process.argv[2];
if (!src) {
  console.error("用法: node scripts/import-st-worldinfo.mjs <ST世界书.json路径>");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(src, "utf-8"));
const before = loadWorldInfoBook();
const book = importStWorldInfo(raw);
const added = book.entries.slice(before.entries.length);

console.log(`导入前: ${before.entries.length} 条`);
console.log(`导入后: ${book.entries.length} 条（新增 ${added.length} 条）\n`);

added
  .sort((a, b) => a.order - b.order || a.memo.localeCompare(b.memo, "zh-CN"))
  .forEach((e, i) => {
    const keys = e.keys.length ? e.keys.join("、") : "(无关键词)";
    const status = e.enabled ? "启用" : "禁用";
    console.log(`${String(i + 1).padStart(2, " ")}. [order ${e.order}] ${e.memo} | ${keys} | ${status}`);
  });

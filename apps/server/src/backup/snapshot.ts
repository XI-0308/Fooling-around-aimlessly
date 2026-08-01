import fs from "fs";
import path from "path";
import { DATA_DIR, LEANN_DIR } from "../config.js";
import { copyDirSync } from "./zipUtil.js";

const BACKUPS_DIR = path.join(DATA_DIR, ".backups");
const SNAPSHOT_PREFIX = "snapshot-";

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** 导入前自动快照；返回快照目录名 */
export function createPreImportSnapshot(): string {
  const name = `${SNAPSHOT_PREFIX}${formatTimestamp(new Date())}`;
  const dest = path.join(BACKUPS_DIR, name);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  copyDirSync(DATA_DIR, dest, { excludeDirNames: [".backups"] });

  // LEANN 常落在 ProgramData（ASCII 路径），不在 data/ 内，需额外快照
  const leannResolved = path.resolve(LEANN_DIR);
  const dataResolved = path.resolve(DATA_DIR);
  if (
    fs.existsSync(LEANN_DIR) &&
    !leannResolved.startsWith(dataResolved + path.sep) &&
    leannResolved !== dataResolved
  ) {
    copyDirSync(LEANN_DIR, path.join(dest, "_leann-external"));
  }

  return name;
}

export function listSnapshots(): { name: string; createdAt: string }[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((n) => n.startsWith(SNAPSHOT_PREFIX))
    .sort()
    .reverse()
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, name));
      return { name, createdAt: stat.mtime.toISOString() };
    });
}

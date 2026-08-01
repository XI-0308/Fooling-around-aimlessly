import fs from "fs";
import type { Response } from "express";

/** 静态图片：可缓存，换头像用 ?v=mtime 打破缓存 */
export function sendCachedImageFile(res: Response, filePath: string): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  const stat = fs.statSync(filePath);
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  res.setHeader("Cache-Control", "private, max-age=604800");
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", stat.mtime.toUTCString());
  const inm = res.req.headers["if-none-match"];
  if (inm && inm === etag) {
    res.status(304).end();
    return;
  }
  res.sendFile(filePath);
}

export function fileMtimeVersion(filePath: string | null | undefined): number {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  try {
    return Math.floor(fs.statSync(filePath).mtimeMs);
  } catch {
    return 0;
  }
}

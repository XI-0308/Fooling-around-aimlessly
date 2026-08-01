import type { BilibiliConn, NetEaseMusicConn, WeReadConn, ZhihuConn } from "../config.js";
import { isCookieCloudReady } from "../cookieCloud/shared.js";

/** 是否已配置网易云 Cookie 或 CookieCloud（不验证有效性） */
export function isNetEaseConfigured(conn?: NetEaseMusicConn): boolean {
  if (!conn) return false;
  return Boolean(conn.cookie?.trim()) || isCookieCloudReady(conn.cookieCloud);
}

/** 是否已配置微信读书 Cookie 或 CookieCloud（不验证有效性） */
export function isWeReadConfigured(conn?: WeReadConn): boolean {
  if (!conn) return false;
  return Boolean(conn.cookie?.trim()) || isCookieCloudReady(conn.cookieCloud);
}

/** Bilibili：未配置 Cookie 时仍可拉视频信息，配置后更易获取字幕 */
export function isBilibiliConfigured(conn?: BilibiliConn): boolean {
  if (!conn) return false;
  return Boolean(conn.cookie?.trim()) || isCookieCloudReady(conn.cookieCloud);
}

/** 知乎文章需登录 Cookie */
export function isZhihuConfigured(conn?: ZhihuConn): boolean {
  if (!conn) return false;
  return Boolean(conn.cookie?.trim()) || isCookieCloudReady(conn.cookieCloud);
}

/** 知乎开放平台 Access Secret */
export function isZhihuOpenConfigured(conn?: ZhihuConn): boolean {
  if (!conn) return false;
  return Boolean(conn.accessSecret?.trim()) || Boolean(process.env.ZHIHU_ACCESS_SECRET?.trim());
}

/** 知乎能力：Cookie 抓取或开放平台至少配置其一 */
export function isZhihuServiceConfigured(conn?: ZhihuConn): boolean {
  return isZhihuConfigured(conn) || isZhihuOpenConfigured(conn);
}

export const SERVICE_AUTH_HINT =
  "请在「设置 → CookieCloud」完成同步（域名填 music.163.com、weread.qq.com、bilibili.com、zhihu.com，不要加 https://），保存后再试；也可在对应板块填手动 Cookie 备用。";

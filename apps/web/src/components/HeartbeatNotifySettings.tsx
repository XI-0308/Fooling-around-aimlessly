"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  isHeartbeatNotifyEnabled,
  notificationPermission,
  requestHeartbeatNotifyPermission,
  setHeartbeatNotifyEnabled,
  showHeartbeatNotification,
} from "@/lib/heartbeatNotify";
import {
  getCurrentPushSubscription,
  isWebPushSupported,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/webPush";

export default function HeartbeatNotifySettings({ disabled }: { disabled?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [serverSubCount, setServerSubCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    setEnabled(isHeartbeatNotifyEnabled());
    setPerm(notificationPermission());
    setPushSupported(isWebPushSupported());
    try {
      const sub = await getCurrentPushSubscription();
      setPushSubscribed(Boolean(sub));
    } catch {
      setPushSubscribed(false);
    }
    try {
      const d = await apiFetch<{ subscriptionCount?: number }>("/push/vapid-public-key");
      setServerSubCount(typeof d.subscriptionCount === "number" ? d.subscriptionCount : null);
    } catch {
      setServerSubCount(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enableLocalAndAsk() {
    setHeartbeatNotifyEnabled(true);
    setEnabled(true);
    const p = await requestHeartbeatNotifyPermission();
    setPerm(p);
    if (p === "granted") {
      setMsg("已开启前台通知。建议再点「开启锁屏推送」，杀掉 App 也能收到。");
      showHeartbeatNotification({
        unreadCount: 1,
        preview: "这是一条前台测试通知：权限正常。",
      });
    } else if (p === "denied") {
      setMsg("系统通知被拒绝。请到手机「设置 → 通知」里允许本站/WE-E。");
    } else if (p === "unsupported") {
      setMsg("当前浏览器不支持通知。");
    } else {
      setMsg("尚未授权，请再点一次并选择「允许」。");
    }
  }

  async function enableLockScreenPush() {
    setBusy(true);
    setMsg("");
    try {
      setHeartbeatNotifyEnabled(true);
      setEnabled(true);
      const result = await subscribeWebPush(apiFetch);
      setMsg(result.message);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "订阅失败");
    } finally {
      setBusy(false);
    }
  }

  async function testLockScreenPush() {
    setBusy(true);
    setMsg("");
    try {
      const r = await apiFetch<{ sent: number; failed: number }>("/push/test", { method: "POST" });
      setMsg(
        r.sent > 0
          ? `已向 ${r.sent} 台设备发送测试推送（可先锁屏或切走 App 再看）。失败 ${r.failed}。`
          : `推送未送达（sent=0 failed=${r.failed}）。若刚才已订阅，请把本提示发我。`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "测试推送失败");
    } finally {
      setBusy(false);
    }
  }

  async function disableLockScreenPush() {
    setBusy(true);
    try {
      await unsubscribeWebPush(apiFetch);
      setMsg("已取消锁屏推送订阅。");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "取消失败");
    } finally {
      setBusy(false);
    }
  }

  function toggleEnabled(on: boolean) {
    setHeartbeatNotifyEnabled(on);
    setEnabled(on);
    setMsg(on ? "已打开提醒开关。" : "已关闭本地弹窗提醒；锁屏推送订阅仍保留，可在下方取消。");
  }

  return (
    <div className={disabled ? "settings-section-disabled" : undefined} style={{ marginBottom: 12 }}>
      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />{" "}
          Heartbeat 提醒总开关
        </label>
        <p className="hint" style={{ marginTop: 6 }}>
          <strong>锁屏真推送（Web Push）</strong>：App 被划掉也能弹。需 HTTPS（或本机），iPhone 请先「添加到主屏幕」再用
          PWA 打开并允许通知。
        </p>
        <p className="hint" style={{ marginTop: 4 }}>
          通知权限：
          <strong>
            {perm === "granted"
              ? "已允许"
              : perm === "denied"
                ? "已拒绝"
                : perm === "unsupported"
                  ? "不支持"
                  : "未决定"}
          </strong>
          {" · "}
          Web Push：
          <strong>
            {!pushSupported
              ? "不支持"
              : pushSubscribed
                ? "本机已订阅"
                : "本机未订阅"}
          </strong>
          {serverSubCount !== null ? `（服务器 ${serverSubCount} 条订阅）` : ""}
        </p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled || busy}
          onClick={() => void enableLockScreenPush()}
        >
          开启锁屏推送
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled || busy || !pushSubscribed}
          onClick={() => void testLockScreenPush()}
        >
          测试锁屏推送
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled || busy}
          onClick={() => void enableLocalAndAsk()}
        >
          测试前台弹窗
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled || busy || !pushSubscribed}
          onClick={() => void disableLockScreenPush()}
        >
          取消推送订阅
        </button>
      </div>
      {msg ? (
        <p className="hint" style={{ marginTop: 8 }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CustomerServiceOutlined,
  DatabaseOutlined,
  MessageOutlined,
  ReadOutlined,
  RobotOutlined,
  SettingOutlined,
  SoundOutlined,
  SyncOutlined,
  UserOutlined,
} from "@ant-design/icons";
import AppShell from "@/components/AppShell";
import SettingsFold from "@/components/SettingsFold";
import HeartbeatNotifySettings from "@/components/HeartbeatNotifySettings";
import { apiFetch } from "@/lib/api";
import { clearLocalActivity } from "@/lib/sessionIdle";

interface ConnForm {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  keyPreview: string;
  hasKey: boolean;
}

interface VolcanoForm {
  endpoint: string;
  resourceId: string;
  appId: string;
  accessToken: string;
  secretKey: string;
  defaultSpeaker: string;
  accessTokenPreview: string;
  secretKeyPreview: string;
  hasAccessToken: boolean;
  hasSecretKey: boolean;
}

const EMPTY_CONN: ConnForm = {
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
  keyPreview: "",
  hasKey: false,
};

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    deepseekApiKey: "",
    newPassword: "",
    model: "deepseek-v4-flash",
    deepseekThinking: "enabled" as "enabled" | "disabled",
    deepseekReasoningEffort: "high" as "low" | "high" | "max",
    memorySummarizePrompt: "",
    memorySelectPrompt: "",
    memoryInsertPrompt: "",
    coreadSelectPrompt: "",
    coreadInsertPrompt: "",
    coreadDigestPrompt: "",
    webSearchEnabled: true,
    musicEnabled: true,
    imageGenEnabled: true,
    imageViewEnabled: true,
    volcanoTtsEnabled: true,
    ttsProvider: "volcano" as "volcano" | "openai",
    openaiTtsModel: "gpt-4o-mini-tts",
    openaiTtsVoice: "alloy",
    voiceMessagesEnabled: true,
    assistantVoiceReplyEnabled: true,
    volcanoAsrEnabled: true,
    volcanoAsrEndpoint: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
    volcanoAsrResourceId: "volc.bigasr.auc_turbo",
    openaiCompatEnabled: false,
    wereadEnabled: true,
    bilibiliEnabled: true,
    zhihuEnabled: true,
    keepEnabled: true,
    toolDispatcherEnabled: false,
    proactiveMessagingEnabled: true,
    proactivePrompt: "",
    proactiveTimingMode: "random" as "random" | "fixed",
    proactiveMinGapHours: 3,
    proactiveMaxRandomHours: 0,
    proactiveFixedTime: "20:00",
    proactiveQuietStartHour: 22,
    proactiveQuietEndHour: 10,
    leannEnabled: false,
    leannPythonPath: "python",
    leannEmbeddingMode: "",
    leannRetrieveCount: 5,
    leannScoreThreshold: 0,
    obsidianEnabled: false,
    obsidianVaultPath: "",
    obsidianVaultName: "",
    obsidianWhitelistDirs: "*",
    obsidianNightlyEnabled: false,
    obsidianNightlyHour: 21,
    obsidianMaxCommentsPerNight: 3,
    obsidianPushNotify: true,
    obsidianPrompt: "",
    personaDigestEnabled: true,
  });
  const [openaiCompat, setOpenaiCompat] = useState<ConnForm>({ ...EMPTY_CONN });
  const [toolDispatcher, setToolDispatcher] = useState<ConnForm>({ ...EMPTY_CONN });
  const [imageGenConn, setImageGenConn] = useState<ConnForm>({ ...EMPTY_CONN });
  const [imageViewConn, setImageViewConn] = useState<ConnForm>({ ...EMPTY_CONN });
  const [volcanoTts, setVolcanoTts] = useState<VolcanoForm>({
    endpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    resourceId: "seed-tts-2.0",
    appId: "",
    accessToken: "",
    secretKey: "",
    defaultSpeaker: "",
    accessTokenPreview: "",
    secretKeyPreview: "",
    hasAccessToken: false,
    hasSecretKey: false,
  });
  const [neteaseCookie, setNeteaseCookie] = useState("");
  const [neteaseHasCookie, setNeteaseHasCookie] = useState(false);
  const [neteaseCookiePreview, setNeteaseCookiePreview] = useState("");
  const [neteasePlaylistUrl, setNeteasePlaylistUrl] = useState("https://163cn.tv/bauTclbb");
  const [sharedCookieCloud, setSharedCookieCloud] = useState({ url: "http://127.0.0.1:8088", id: "", password: "" });
  const [sharedCookieCloudHasPassword, setSharedCookieCloudHasPassword] = useState(false);
  const [authLogs, setAuthLogs] = useState<string[]>([]);
  const [authLogsLoaded, setAuthLogsLoaded] = useState(false);
  const [wereadCookie, setWereadCookie] = useState("");
  const [wereadHasCookie, setWereadHasCookie] = useState(false);
  const [wereadCookiePreview, setWereadCookiePreview] = useState("");
  const [bilibiliCookie, setBilibiliCookie] = useState("");
  const [bilibiliHasCookie, setBilibiliHasCookie] = useState(false);
  const [bilibiliCookiePreview, setBilibiliCookiePreview] = useState("");
  const [zhihuCookie, setZhihuCookie] = useState("");
  const [zhihuHasCookie, setZhihuHasCookie] = useState(false);
  const [zhihuCookiePreview, setZhihuCookiePreview] = useState("");
  const [zhihuAccessSecret, setZhihuAccessSecret] = useState("");
  const [zhihuHasAccessSecret, setZhihuHasAccessSecret] = useState(false);
  const [zhihuAccessSecretPreview, setZhihuAccessSecretPreview] = useState("");
  const [preview, setPreview] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [deepseekKeySource, setDeepseekKeySource] = useState<"settings" | "env" | "none">("none");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [heartbeatNextAt, setHeartbeatNextAt] = useState<string | null>(null);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [keepUsername, setKeepUsername] = useState("");
  const [keepQr, setKeepQr] = useState<{
    qrcodeId: string;
    qrcodeUrl?: string;
    redirectUrl?: string;
  } | null>(null);
  const [keepLoginBusy, setKeepLoginBusy] = useState(false);

  function loadHeartbeatSchedule() {
    apiFetch<{ nextAtLabel?: string | null }>("/proactive/status")
      .then((d) => setHeartbeatNextAt(d.nextAtLabel || null))
      .catch(() => setHeartbeatNextAt(null));
  }

  function loadKeepStatus() {
    apiFetch<{ loggedIn?: boolean; username?: string }>("/keep/status")
      .then((d) => {
        setKeepLoggedIn(Boolean(d.loggedIn));
        setKeepUsername(String(d.username || ""));
      })
      .catch(() => {
        setKeepLoggedIn(false);
        setKeepUsername("");
      });
  }

  async function startKeepLogin() {
    setKeepLoginBusy(true);
    setMessage("");
    setKeepQr(null);
    try {
      const data = await apiFetch<{
        qrcodeId: string;
        qrcodeUrl?: string;
        redirectUrl?: string;
      }>("/keep/qrcode", { method: "POST", body: "{}" });
      setKeepQr(data);
      setMessage("请用 Keep App 扫码；扫完后会自动检测登录状态。");
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const check = await apiFetch<{
            authorized?: boolean;
            username?: string;
            status?: string;
          }>("/keep/check-login", {
            method: "POST",
            body: JSON.stringify({ qrcodeId: data.qrcodeId }),
          });
          if (check.authorized) {
            setKeepLoggedIn(true);
            setKeepUsername(String(check.username || ""));
            setKeepQr(null);
            setMessage(`✅ Keep 已登录${check.username ? `（${check.username}）` : ""}`);
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (/过期|EXPIRED/i.test(msg)) {
            setMessage("二维码已过期，请重新扫码。");
            setKeepQr(null);
            return;
          }
          // 未扫码 / 等待中：继续轮询
        }
      }
      setMessage("扫码等待超时。可点「重新扫码」，或确认 Keep App 内已授权后再试。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "获取 Keep 登录二维码失败");
    } finally {
      setKeepLoginBusy(false);
    }
  }

  async function logoutKeep() {
    setKeepLoginBusy(true);
    try {
      await apiFetch("/keep/logout", { method: "POST", body: "{}" });
      setKeepLoggedIn(false);
      setKeepUsername("");
      setKeepQr(null);
      setMessage("✅ 已退出 Keep 登录");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "退出失败");
    } finally {
      setKeepLoginBusy(false);
    }
  }

  async function testKeepQuery() {
    setTesting("keep");
    setMessage("");
    try {
      const res = await apiFetch<{ message: string; preview?: string }>("/keep/test", {
        method: "POST",
        body: JSON.stringify({ text: "查一下我最近的运动和体重" }),
      });
      setMessage(`✅ ${res.message}${res.preview ? `：${res.preview.slice(0, 200)}` : ""}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Keep 测试失败");
    } finally {
      setTesting(null);
    }
  }

  async function handleLogout() {
    clearLocalActivity();
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/");
  }

  function applySettingsFromServer(data: Record<string, unknown>) {
    setHasKey(Boolean(data.hasDeepseekKey));
    setDeepseekKeySource(
      data.deepseekKeySource === "settings" || data.deepseekKeySource === "env"
        ? data.deepseekKeySource
        : Boolean(data.hasDeepseekKey)
          ? "settings"
          : "none"
    );
    setPreview(String(data.deepseekApiKeyPreview || ""));
    setForm((f) => ({
      ...f,
      deepseekApiKey: String(data.deepseekApiKey || ""),
      newPassword: "",
      model: String(data.model || f.model),
      deepseekThinking: data.deepseekThinking === "disabled" ? "disabled" : "enabled",
      deepseekReasoningEffort:
        data.deepseekReasoningEffort === "max"
          ? "max"
          : data.deepseekReasoningEffort === "low"
            ? "low"
            : "high",
      webSearchEnabled: data.webSearchEnabled !== false,
      musicEnabled: data.musicEnabled !== false,
      imageGenEnabled: data.imageGenEnabled !== false,
      imageViewEnabled: data.imageViewEnabled !== false,
      volcanoTtsEnabled: data.volcanoTtsEnabled !== false,
      ttsProvider: data.ttsProvider === "openai" ? "openai" : "volcano",
      openaiTtsModel: String(data.openaiTtsModel || "gpt-4o-mini-tts"),
      openaiTtsVoice: String(data.openaiTtsVoice || "alloy"),
      voiceMessagesEnabled: data.voiceMessagesEnabled !== false,
      assistantVoiceReplyEnabled: data.assistantVoiceReplyEnabled !== false,
      volcanoAsrEnabled: data.volcanoAsrEnabled !== false,
      volcanoAsrEndpoint: String(
        data.volcanoAsrEndpoint ||
          "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
      ),
      volcanoAsrResourceId: String(data.volcanoAsrResourceId || "volc.bigasr.auc_turbo"),
      openaiCompatEnabled: data.openaiCompatEnabled === true,
      wereadEnabled: data.wereadEnabled !== false,
      bilibiliEnabled: data.bilibiliEnabled !== false,
      zhihuEnabled: data.zhihuEnabled !== false,
      keepEnabled: data.keepEnabled !== false,
      toolDispatcherEnabled: data.toolDispatcherEnabled === true,
      proactiveMessagingEnabled: data.proactiveMessagingEnabled !== false,
      proactivePrompt: String(data.proactivePrompt || ""),
      proactiveTimingMode: data.proactiveTimingMode === "fixed" ? "fixed" : "random",
      proactiveMinGapHours: Number(data.proactiveMinGapHours ?? 3),
      proactiveMaxRandomHours: Number(data.proactiveMaxRandomHours ?? 0),
      proactiveFixedTime: String(data.proactiveFixedTime || "20:00"),
      proactiveQuietStartHour: Number(data.proactiveQuietStartHour ?? 22),
      proactiveQuietEndHour: Number(data.proactiveQuietEndHour ?? 10),
      leannEnabled: data.leannEnabled === true,
      leannPythonPath: String(data.leannPythonPath || "python"),
      leannEmbeddingMode: String(data.leannEmbeddingMode || ""),
      leannRetrieveCount: Number(data.leannRetrieveCount ?? f.leannRetrieveCount),
      leannScoreThreshold: Number(data.leannScoreThreshold ?? f.leannScoreThreshold),
      obsidianEnabled: data.obsidianEnabled === true,
      obsidianVaultPath: String(data.obsidianVaultPath || ""),
      obsidianVaultName: String(data.obsidianVaultName || ""),
      obsidianWhitelistDirs: String(data.obsidianWhitelistDirs || "*"),
      obsidianNightlyEnabled: data.obsidianNightlyEnabled === true,
      obsidianNightlyHour: Number(data.obsidianNightlyHour ?? 21),
      obsidianMaxCommentsPerNight: Number(data.obsidianMaxCommentsPerNight ?? 3),
      obsidianPushNotify: data.obsidianPushNotify !== false,
      obsidianPrompt: String(data.obsidianPrompt || ""),
      personaDigestEnabled: data.personaDigestEnabled !== false,
      memorySummarizePrompt: String(data.memorySummarizePrompt || ""),
      memorySelectPrompt: String(data.memorySelectPrompt || ""),
      memoryInsertPrompt: String(data.memoryInsertPrompt || ""),
      coreadSelectPrompt: String(data.coreadSelectPrompt || ""),
      coreadInsertPrompt: String(data.coreadInsertPrompt || ""),
      coreadDigestPrompt: String(data.coreadDigestPrompt || ""),
    }));

    const loadConn = (raw: unknown): ConnForm => {
      const c = (raw || {}) as Record<string, string | boolean>;
      return {
        baseUrl: String(c.baseUrl || ""),
        apiKey: String(c.apiKey || ""),
        defaultModel: String(c.defaultModel || ""),
        keyPreview: String(c.keyPreview || ""),
        hasKey: Boolean(c.hasKey),
      };
    };
    setOpenaiCompat(loadConn(data.openaiCompat));
    setToolDispatcher(loadConn(data.toolDispatcher));
    setImageGenConn(loadConn(data.imageGenConn));
    setImageViewConn(loadConn(data.imageViewConn));

    const v = (data.volcanoTts || {}) as Record<string, string | boolean>;
    setVolcanoTts((prev) => ({
      ...prev,
      endpoint: String(v.endpoint || prev.endpoint),
      resourceId: String(v.resourceId || prev.resourceId),
      appId: String(v.appId || ""),
      defaultSpeaker: String(v.defaultSpeaker || ""),
      accessToken: String(v.accessToken || ""),
      secretKey: String(v.secretKey || ""),
      accessTokenPreview: String(v.accessTokenPreview || ""),
      secretKeyPreview: String(v.secretKeyPreview || ""),
      hasAccessToken: Boolean(v.hasAccessToken),
      hasSecretKey: Boolean(v.hasSecretKey),
    }));

    const nm = (data.neteaseMusic || {}) as Record<string, string | boolean | object>;
    setNeteaseCookie(String(nm.cookie || ""));
    setNeteaseHasCookie(Boolean(nm.hasCookie));
    setNeteaseCookiePreview(String(nm.cookiePreview || ""));
    setNeteasePlaylistUrl(String(nm.playlistUrl || "https://163cn.tv/bauTclbb"));
    const nmCc = (nm.cookieCloud || {}) as Record<string, string | boolean>;

    const wr = (data.weread || {}) as Record<string, unknown>;
    setWereadCookie(String(wr.cookie || ""));
    setWereadHasCookie(Boolean(wr.hasCookie));
    setWereadCookiePreview(String(wr.cookiePreview || ""));
    const wrCc = (wr.cookieCloud || {}) as Record<string, string | boolean>;

    const bl = (data.bilibili || {}) as Record<string, unknown>;
    setBilibiliCookie(String(bl.cookie || ""));
    setBilibiliHasCookie(Boolean(bl.hasCookie));
    setBilibiliCookiePreview(String(bl.cookiePreview || ""));
    const blCc = (bl.cookieCloud || {}) as Record<string, string | boolean>;

    const zh = (data.zhihu || {}) as Record<string, unknown>;
    setZhihuCookie(String(zh.cookie || ""));
    setZhihuHasCookie(Boolean(zh.hasCookie));
    setZhihuCookiePreview(String(zh.cookiePreview || ""));
    setZhihuHasAccessSecret(Boolean(zh.hasAccessSecret));
    setZhihuAccessSecretPreview(String(zh.accessSecretPreview || ""));
    const zhCc = (zh.cookieCloud || {}) as Record<string, string | boolean>;

    setSharedCookieCloud({
      url: String(nmCc.url || wrCc.url || blCc.url || zhCc.url || "http://127.0.0.1:8088"),
      id: String(nmCc.id || wrCc.id || blCc.id || zhCc.id || ""),
      password: String(nmCc.password || wrCc.password || blCc.password || zhCc.password || ""),
    });
    setSharedCookieCloudHasPassword(Boolean(nmCc.hasPassword || wrCc.hasPassword));
  }

  useEffect(() => {
    apiFetch<Record<string, unknown>>("/settings")
      .then((data) => applySettingsFromServer(data))
      .catch(() => {});
    loadHeartbeatSchedule();
    loadKeepStatus();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        model: form.model,
        deepseekThinking: form.deepseekThinking,
        deepseekReasoningEffort: form.deepseekReasoningEffort,
        webSearchEnabled: form.webSearchEnabled,
        musicEnabled: form.musicEnabled,
        imageGenEnabled: form.imageGenEnabled,
        imageViewEnabled: form.imageViewEnabled,
        volcanoTtsEnabled: form.volcanoTtsEnabled,
        ttsProvider: form.ttsProvider,
        openaiTtsModel: form.openaiTtsModel,
        openaiTtsVoice: form.openaiTtsVoice,
        voiceMessagesEnabled: form.voiceMessagesEnabled,
        assistantVoiceReplyEnabled: form.assistantVoiceReplyEnabled,
        volcanoAsrEnabled: form.volcanoAsrEnabled,
        volcanoAsrEndpoint: form.volcanoAsrEndpoint,
        volcanoAsrResourceId: form.volcanoAsrResourceId,
        openaiCompatEnabled: form.openaiCompatEnabled,
        wereadEnabled: form.wereadEnabled,
        bilibiliEnabled: form.bilibiliEnabled,
        zhihuEnabled: form.zhihuEnabled,
        keepEnabled: form.keepEnabled,
        toolDispatcherEnabled: form.toolDispatcherEnabled,
        proactiveMessagingEnabled: form.proactiveMessagingEnabled,
        proactivePrompt: form.proactivePrompt,
        proactiveTimingMode: form.proactiveTimingMode,
        proactiveMinGapHours: form.proactiveMinGapHours,
        proactiveMaxRandomHours: form.proactiveMaxRandomHours,
        proactiveFixedTime: form.proactiveFixedTime,
        proactiveQuietStartHour: form.proactiveQuietStartHour,
        proactiveQuietEndHour: form.proactiveQuietEndHour,
        leannEnabled: form.leannEnabled,
        leannPythonPath: form.leannPythonPath,
        leannEmbeddingMode: form.leannEmbeddingMode,
        leannRetrieveCount: form.leannRetrieveCount,
        leannScoreThreshold: form.leannScoreThreshold,
        obsidianEnabled: form.obsidianEnabled,
        obsidianVaultPath: form.obsidianVaultPath,
        obsidianVaultName: form.obsidianVaultName,
        obsidianWhitelistDirs: form.obsidianWhitelistDirs,
        obsidianNightlyEnabled: form.obsidianNightlyEnabled,
        obsidianNightlyHour: form.obsidianNightlyHour,
        obsidianMaxCommentsPerNight: form.obsidianMaxCommentsPerNight,
        obsidianPushNotify: form.obsidianPushNotify,
        obsidianPrompt: form.obsidianPrompt,
        personaDigestEnabled: form.personaDigestEnabled,
        memorySummarizePrompt: form.memorySummarizePrompt,
        memorySelectPrompt: form.memorySelectPrompt,
        memoryInsertPrompt: form.memoryInsertPrompt,
        coreadSelectPrompt: form.coreadSelectPrompt,
        coreadInsertPrompt: form.coreadInsertPrompt,
        coreadDigestPrompt: form.coreadDigestPrompt,
        deepseekApiKey: form.deepseekApiKey,
        openaiCompat: {
          baseUrl: openaiCompat.baseUrl,
          defaultModel: openaiCompat.defaultModel,
          apiKey: openaiCompat.apiKey,
        },
        toolDispatcher: {
          baseUrl: toolDispatcher.baseUrl,
          defaultModel: toolDispatcher.defaultModel,
          apiKey: toolDispatcher.apiKey,
        },
        imageGenConn: {
          baseUrl: imageGenConn.baseUrl,
          defaultModel: imageGenConn.defaultModel,
          apiKey: imageGenConn.apiKey,
        },
        imageViewConn: {
          baseUrl: imageViewConn.baseUrl,
          defaultModel: imageViewConn.defaultModel,
          apiKey: imageViewConn.apiKey,
        },
        volcanoTts: {
          endpoint: volcanoTts.endpoint,
          resourceId: volcanoTts.resourceId,
          appId: volcanoTts.appId,
          defaultSpeaker: volcanoTts.defaultSpeaker,
          accessToken: volcanoTts.accessToken,
          secretKey: volcanoTts.secretKey,
        },
        neteaseMusic: {
          cookie: neteaseCookie,
          playlistUrl: neteasePlaylistUrl,
          cookieCloud: {
            url: sharedCookieCloud.url,
            id: sharedCookieCloud.id,
            password: sharedCookieCloud.password,
          },
        },
        weread: {
          cookie: wereadCookie,
          cookieCloud: {
            url: sharedCookieCloud.url,
            id: sharedCookieCloud.id,
            password: sharedCookieCloud.password,
          },
        },
        bilibili: {
          cookie: bilibiliCookie,
          cookieCloud: {
            url: sharedCookieCloud.url,
            id: sharedCookieCloud.id,
            password: sharedCookieCloud.password,
          },
        },
        zhihu: {
          cookie: zhihuCookie,
          accessSecret: zhihuAccessSecret,
          cookieCloud: {
            url: sharedCookieCloud.url,
            id: sharedCookieCloud.id,
            password: sharedCookieCloud.password,
          },
        },
      };
      if (form.newPassword) body.newPassword = form.newPassword;

      await apiFetch("/settings", { method: "PUT", body: JSON.stringify(body) });
      const data = await apiFetch<Record<string, unknown>>("/settings");
      applySettingsFromServer(data);
      setMessage("已保存");
      loadHeartbeatSchedule();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function runTest(kind: string, extraBody?: Record<string, unknown>) {
    setTesting(kind);
    setMessage("");
    try {
      const res = await apiFetch<{
        message: string;
        audioBase64?: string;
        format?: string;
      }>(`/settings/test/${kind}`, {
        method: "POST",
        body: JSON.stringify(extraBody ?? {}),
      });
      setMessage(`✅ ${res.message}`);
      if (res.audioBase64) {
        const mime = res.format === "wav" ? "audio/wav" : "audio/mpeg";
        const audio = new Audio(`data:${mime};base64,${res.audioBase64}`);
        void audio.play().catch(() => {
          setMessage((prev) => `${prev}\n（浏览器拦截了自动播放，请再点一次试听）`);
        });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "测试失败");
    } finally {
      setTesting(null);
    }
  }

  const OPENAI_TTS_VOICES = [
    { id: "alloy", label: "Alloy", hint: "中性平衡" },
    { id: "echo", label: "Echo", hint: "沉稳清晰" },
    { id: "fable", label: "Fable", hint: "温暖叙事" },
    { id: "onyx", label: "Onyx", hint: "低沉可靠" },
    { id: "nova", label: "Nova", hint: "明亮友好·中文常更顺" },
    { id: "shimmer", label: "Shimmer", hint: "轻快明亮" },
    { id: "coral", label: "Coral", hint: "柔和（部分模型）" },
    { id: "verse", label: "Verse", hint: "沉稳（部分模型）" },
    { id: "ballad", label: "Ballad", hint: "抒情（部分模型）" },
    { id: "ash", label: "Ash", hint: "干净（部分模型）" },
    { id: "sage", label: "Sage", hint: "稳重（部分模型）" },
  ] as const;

  async function loadAuthLogs(force = false) {
    if (authLogsLoaded && !force) return;
    try {
      const data = await apiFetch<{ logs: string[] }>("/auth/logs");
      setAuthLogs(data.logs || []);
    } catch {
      setAuthLogs(["无法读取登录日志"]);
    } finally {
      setAuthLogsLoaded(true);
    }
  }

  function renderConnSection(
    title: string,
    conn: ConnForm,
    setConn: (c: ConnForm) => void,
    testKind: string,
    urlPlaceholder: string,
    options?: {
      enabled?: boolean;
      onEnabledChange?: (v: boolean) => void;
      enabledLabel?: string;
      getTestExtra?: () => Record<string, unknown>;
    }
  ) {
    const enabled = options?.enabled !== false;
    return (
      <>
        {options?.onEnabledChange && (
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => options.onEnabledChange?.(e.target.checked)}
              />{" "}
              {options.enabledLabel || "启用此能力"}
            </label>
          </div>
        )}
        <div className={enabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>Base URL</label>
          <input
            value={conn.baseUrl}
            onChange={(e) => setConn({ ...conn, baseUrl: e.target.value })}
            placeholder={urlPlaceholder}
            disabled={!enabled}
          />
        </div>
        <div className="field">
          <label>API Key</label>
          <input
            type="password"
            value={conn.apiKey}
            onChange={(e) => setConn({ ...conn, apiKey: e.target.value })}
            placeholder={conn.hasKey ? `已配置（${conn.keyPreview}），输入新 Key 可覆盖` : "sk-..."}
            disabled={!enabled}
          />
        </div>
        <div className="field">
          <label>默认模型（可选）</label>
          <input
            value={conn.defaultModel}
            onChange={(e) => setConn({ ...conn, defaultModel: e.target.value })}
            placeholder={testKind === "image-gen" ? "如 dall-e-3、flux-dev（以网关为准）" : testKind === "image-view" ? "如 gpt-4o-mini" : "留空则用接口默认"}
            disabled={!enabled}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !enabled || testing === testKind}
          onClick={() => runTest(testKind, options?.getTestExtra?.())}
        >
          {testing === testKind
            ? "测试中…"
            : testKind === "image-view"
              ? "测试 Vision 模型"
              : testKind === "image-gen"
                ? "测试生图模型"
                : "测试连接"}
        </button>
        </div>
      </>
    );
  }

  return (
    <AppShell title="设置">
      <form className="card settings-form" onSubmit={handleSave}>
        <SettingsFold title="主脑">
        {!hasKey && !form.deepseekApiKey.trim() && (
          <p className="error" style={{ marginTop: 0 }}>
            未配置 DeepSeek API Key，角色无法回复。请填写 Key 后点「保存设置」。
          </p>
        )}
        <div className="field">
          <label htmlFor="deepseek">DeepSeek 接口密钥</label>
          <input
            id="deepseek"
            type="password"
            value={form.deepseekApiKey}
            onChange={(e) => setForm({ ...form, deepseekApiKey: e.target.value })}
            placeholder={hasKey ? "已配置，输入新 Key 可覆盖" : "sk-..."}
          />
        </div>
        <div className="field" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={
              loading ||
              testing === "deepseek" ||
              (!hasKey && !form.deepseekApiKey.trim())
            }
            onClick={() =>
              runTest("deepseek", {
                model: form.model,
                ...(form.deepseekApiKey ? { apiKey: form.deepseekApiKey } : {}),
              })
            }
          >
            {testing === "deepseek" ? "测试中…" : "测试角色对话连接"}
          </button>
        </div>
        <div className="field">
          <label>DeepSeek 模型</label>
          <select
            value={form.model}
            onChange={(e) => {
              const model = e.target.value;
              setForm({
                ...form,
                model,
                deepseekThinking:
                  model === "deepseek-reasoner"
                    ? "enabled"
                    : model === "deepseek-chat"
                      ? "disabled"
                      : form.deepseekThinking,
              });
            }}
          >
            <option value="deepseek-v4-flash">deepseek-v4-flash（推荐 · 快速）</option>
            <option value="deepseek-v4-pro">deepseek-v4-pro（更强）</option>
            <option value="deepseek-chat">deepseek-chat（旧版 · 无思维链）</option>
            <option value="deepseek-reasoner">deepseek-reasoner（旧版 · 等同 v4-flash 思维链）</option>
          </select>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.deepseekThinking === "enabled"}
              disabled={form.model === "deepseek-reasoner" || form.model === "deepseek-chat"}
              onChange={(e) =>
                setForm({ ...form, deepseekThinking: e.target.checked ? "enabled" : "disabled" })
              }
            />{" "}
            启用思维链（thinking mode）
          </label>
        </div>
        {form.deepseekThinking === "enabled" && (
          <div className="field">
            <label>思维链深度</label>
            <select
              value={form.deepseekReasoningEffort}
              onChange={(e) =>
                setForm({
                  ...form,
                  deepseekReasoningEffort:
                    e.target.value === "max"
                      ? "max"
                      : e.target.value === "low"
                        ? "low"
                        : "high",
                })
              }
            >
              <option value="low">low（更快、更轻）</option>
              <option value="high">high（默认）</option>
              <option value="max">max（更慢、更细，适合复杂任务）</option>
            </select>
          </div>
        )}
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.webSearchEnabled}
              onChange={(e) => setForm({ ...form, webSearchEnabled: e.target.checked })}
            />{" "}
            启用联网搜索（DeepSeek 原生 web_search）
          </label>
        </div>

        </SettingsFold>

        <SettingsFold title="工具调度">
          <p className="hint" style={{ marginBottom: 12 }}>
            角色用标记起调点歌 / 语音 / 生图 / 网页找图；调度员只做漏调兜底。Keep 仍由调度员主责。默认关闭（走旧语义路径）；开启后①②两次决策。
          </p>
          {renderConnSection(
            "工具调度",
            toolDispatcher,
            setToolDispatcher,
            "tool-dispatcher",
            "https://api.openai.com（可带或不带 /v1）",
            {
              enabled: form.toolDispatcherEnabled,
              onEnabledChange: (v) => setForm({ ...form, toolDispatcherEnabled: v }),
              enabledLabel: "启用工具调度员",
              getTestExtra: () => ({
                baseUrl: toolDispatcher.baseUrl,
                apiKey: toolDispatcher.apiKey,
                defaultModel: toolDispatcher.defaultModel,
              }),
            }
          )}
        </SettingsFold>

        <SettingsFold title="生图">
        {renderConnSection(
          "生图",
          imageGenConn,
          setImageGenConn,
          "image-gen",
          "https://ark.cn-beijing.volces.com/api/v3",
          {
            enabled: form.imageGenEnabled,
            onEnabledChange: (v) => setForm({ ...form, imageGenEnabled: v }),
            enabledLabel: "启用生图",
            getTestExtra: () => ({ model: imageGenConn.defaultModel }),
          }
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          火山方舟可填 <code>https://ark.cn-beijing.volces.com/api/v3</code>（或完整
          <code>…/images/generations</code>，系统会自动纠正）。模型如{" "}
          <code>doubao-seedream-5-0-pro-…</code>。
        </p>
        </SettingsFold>

        <SettingsFold title="看图">
        {renderConnSection(
          "看图",
          imageViewConn,
          setImageViewConn,
          "image-view",
          "https://niuflu.com",
          {
            enabled: form.imageViewEnabled,
            onEnabledChange: (v) => setForm({ ...form, imageViewEnabled: v }),
            enabledLabel: "启用看图",
            getTestExtra: () => ({ model: imageViewConn.defaultModel }),
          }
        )}
        </SettingsFold>

        <SettingsFold title="语音">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.volcanoTtsEnabled}
              onChange={(e) => setForm({ ...form, volcanoTtsEnabled: e.target.checked })}
            />{" "}
            启用语音能力（朗读 / 合成）
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.voiceMessagesEnabled}
              onChange={(e) => setForm({ ...form, voiceMessagesEnabled: e.target.checked })}
            />{" "}
            启用聊天语音消息（按住说话 + 语音气泡）
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.assistantVoiceReplyEnabled}
              onChange={(e) => setForm({ ...form, assistantVoiceReplyEnabled: e.target.checked })}
            />{" "}
            允许角色主动用语音回复（由角色判断何时发）
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.volcanoAsrEnabled}
              onChange={(e) => setForm({ ...form, volcanoAsrEnabled: e.target.checked })}
            />{" "}
            启用火山语音识别（把你的语音转成文字给角色）
          </label>
        </div>
        <p className="hint">
          语音识别复用下方火山 APP ID / Access Token。请在火山控制台开通录音文件极速识别（资源 ID 默认
          volc.bigasr.auc_turbo）。合成音色仍走上方 TTS 供应商。
        </p>
        <div className={form.volcanoAsrEnabled ? undefined : "settings-section-disabled"}>
          <div className="field">
            <label>ASR 资源 ID</label>
            <input
              value={form.volcanoAsrResourceId}
              onChange={(e) => setForm({ ...form, volcanoAsrResourceId: e.target.value })}
              placeholder="volc.bigasr.auc_turbo"
            />
          </div>
          <div className="field">
            <label>ASR 接口</label>
            <input
              value={form.volcanoAsrEndpoint}
              onChange={(e) => setForm({ ...form, volcanoAsrEndpoint: e.target.value })}
            />
          </div>
        </div>
        <div className={form.volcanoTtsEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>TTS 供应商</label>
          <select
            value={form.ttsProvider}
            onChange={(e) =>
              setForm({
                ...form,
                ttsProvider: e.target.value === "openai" ? "openai" : "volcano",
              })
            }
          >
            <option value="openai">OpenAI 兼容（复用上方 OpenAI 接口）</option>
            <option value="volcano">火山引擎</option>
          </select>
        </div>

        {form.ttsProvider === "openai" ? (
          <>
            <p className="hint">
              使用「OpenAI 兼容」里已保存的 Base URL 与 Key。「测试连接成功」只说明能拉模型列表；朗读还需要中转站开通
              <code>/v1/audio/speech</code>（tts-1 / gpt-4o-mini-tts），或支持
              <code>gpt-4o-audio-preview</code> 的对话音频输出。
            </p>
            <div className="field">
              <label>TTS 模型</label>
              <input
                value={form.openaiTtsModel}
                onChange={(e) => setForm({ ...form, openaiTtsModel: e.target.value })}
                placeholder="优先 tts-1 / gpt-4o-mini-tts；若只有 gpt-4o-audio-preview 也可填"
              />
            </div>
            <div className="field">
              <label>默认音色（点选后可直接试听）</label>
              <div className="settings-voice-grid">
                {OPENAI_TTS_VOICES.map((v) => {
                  const active = form.openaiTtsVoice === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`btn btn-ghost settings-voice-chip${active ? " is-active" : ""}`}
                      disabled={loading || !form.volcanoTtsEnabled || testing === "tts"}
                      title={v.hint}
                      onClick={() => {
                        setForm({ ...form, openaiTtsVoice: v.id });
                        void runTest("tts", {
                          provider: "openai",
                          model: form.openaiTtsModel,
                          voice: v.id,
                        });
                      }}
                    >
                      <span className="settings-voice-name">{v.label}</span>
                      <span className="settings-voice-hint">{v.hint}</span>
                    </button>
                  );
                })}
              </div>
              <input
                style={{ marginTop: 8 }}
                value={form.openaiTtsVoice}
                onChange={(e) => setForm({ ...form, openaiTtsVoice: e.target.value })}
                placeholder="也可手动填写音色 ID"
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading || !form.volcanoTtsEnabled || testing === "tts"}
              onClick={() =>
                runTest("tts", {
                  provider: "openai",
                  model: form.openaiTtsModel,
                  voice: form.openaiTtsVoice,
                })
              }
            >
              {testing === "tts" ? "试听中…" : "试听当前音色"}
            </button>
          </>
        ) : (
          <p className="hint">当前使用火山引擎。凭证与音色请在下方「火山引擎详细设置」中配置。</p>
        )}

        <SettingsFold title="火山引擎详细设置（一般可收起）" defaultOpen={false}>
          <div className="field">
            <label>端点 URL</label>
            <input
              value={volcanoTts.endpoint}
              onChange={(e) => setVolcanoTts({ ...volcanoTts, endpoint: e.target.value })}
            />
          </div>
          <div className="field-grid">
            <div className="field">
              <label>资源 ID</label>
              <input
                value={volcanoTts.resourceId}
                onChange={(e) => setVolcanoTts({ ...volcanoTts, resourceId: e.target.value })}
              />
            </div>
            <div className="field">
              <label>APP ID</label>
              <input
                value={volcanoTts.appId}
                onChange={(e) => setVolcanoTts({ ...volcanoTts, appId: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Access Token</label>
            <input
              type="password"
              value={volcanoTts.accessToken}
              onChange={(e) => setVolcanoTts({ ...volcanoTts, accessToken: e.target.value })}
              placeholder={
                volcanoTts.hasAccessToken
                  ? `已配置（${volcanoTts.accessTokenPreview}）`
                  : "Access Token"
              }
            />
          </div>
          <div className="field">
            <label>Secret Key</label>
            <input
              type="password"
              value={volcanoTts.secretKey}
              onChange={(e) => setVolcanoTts({ ...volcanoTts, secretKey: e.target.value })}
              placeholder={
                volcanoTts.hasSecretKey ? `已配置（${volcanoTts.secretKeyPreview}）` : "Secret Key"
              }
            />
          </div>
          <div className="field">
            <label>默认音色 ID</label>
            <input
              value={volcanoTts.defaultSpeaker}
              onChange={(e) => setVolcanoTts({ ...volcanoTts, defaultSpeaker: e.target.value })}
              placeholder="如 zh_female_shuangkuaisisi_uranus_bigtts 或 S_克隆ID"
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading || !form.volcanoTtsEnabled || testing === "tts"}
            onClick={() =>
              runTest("tts", { provider: "volcano", speaker: volcanoTts.defaultSpeaker })
            }
          >
            {testing === "tts" ? "测试中…" : "测试火山 TTS"}
          </button>
        </SettingsFold>
        </div>
        </SettingsFold>

        <SettingsFold title="Cookie Cloud">
        <div className="field">
          <label>服务器地址</label>
          <input
            value={sharedCookieCloud.url}
            onChange={(e) => setSharedCookieCloud({ ...sharedCookieCloud, url: e.target.value })}
            placeholder="http://127.0.0.1:8088"
          />
        </div>
        <div className="field-grid">
          <div className="field">
            <label>UUID</label>
            <input
              value={sharedCookieCloud.id}
              onChange={(e) => setSharedCookieCloud({ ...sharedCookieCloud, id: e.target.value })}
              placeholder="扩展里显示的 UUID"
            />
          </div>
          <div className="field">
            <label>密码（须与浏览器扩展里完全一致）</label>
            <input
              type="password"
              value={sharedCookieCloud.password}
              onChange={(e) => setSharedCookieCloud({ ...sharedCookieCloud, password: e.target.value })}
              placeholder={sharedCookieCloudHasPassword ? "已配置，留空测试时用已保存密码；修改后请保存" : "与扩展里一致"}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || testing === "cookiecloud"}
          onClick={() =>
            runTest("cookiecloud", {
              cookieCloud: sharedCookieCloud,
            })
          }
        >
          {testing === "cookiecloud" ? "测试中…" : "测试 CookieCloud 连接"}
        </button>
        </SettingsFold>

        <SettingsFold title="网易云音乐">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.musicEnabled}
              onChange={(e) => setForm({ ...form, musicEnabled: e.target.checked })}
            />{" "}
            启用网易云点歌（发歌曲卡片）
          </label>
        </div>
        <div className={form.musicEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>手动 Cookie（备用，可选）</label>
          <textarea
            rows={3}
            value={neteaseCookie}
            onChange={(e) => setNeteaseCookie(e.target.value)}
            disabled={!form.musicEnabled}
            placeholder={
              neteaseHasCookie
                ? `已配置（${neteaseCookiePreview}），输入新 Cookie 可覆盖`
                : "MUSIC_U=...; __csrf=..."
            }
          />
        </div>
        <div className="field">
          <label>点播歌单 URL（角色只从此歌单选歌）</label>
          <input
            value={neteasePlaylistUrl}
            onChange={(e) => setNeteasePlaylistUrl(e.target.value)}
            disabled={!form.musicEnabled}
            placeholder="https://163cn.tv/bauTclbb"
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !form.musicEnabled || testing === "netease-music"}
          onClick={() => runTest("netease-music")}
        >
          {testing === "netease-music" ? "测试中…" : "测试歌单连接"}
        </button>
        </div>
        </SettingsFold>

        <SettingsFold title="Heartbeat">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.proactiveMessagingEnabled}
              onChange={(e) => setForm({ ...form, proactiveMessagingEnabled: e.target.checked })}
            />{" "}
            允许角色主动发消息找你
          </label>
        </div>
        {heartbeatNextAt && form.proactiveMessagingEnabled && (
          <p className="hint" style={{ marginTop: 0 }}>
            预计下次：<strong>{heartbeatNextAt}</strong>
          </p>
        )}
        <HeartbeatNotifySettings disabled={!form.proactiveMessagingEnabled} />
        <div className={form.proactiveMessagingEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>主动消息提示词（可用 {"{{char}}"}、{"{{user}}"}、{"{{idle_duration}}"}、{"{{time}}"}、{"{{date}}"}、{"{{weekday}}"}）</label>
          <textarea
            rows={7}
            value={form.proactivePrompt}
            disabled={!form.proactiveMessagingEnabled}
            onChange={(e) => setForm({ ...form, proactivePrompt: e.target.value })}
            placeholder="留空则使用内置默认提示词"
          />
        </div>
        <div className="field">
          <label>触发方式</label>
          <select
            value={form.proactiveTimingMode}
            disabled={!form.proactiveMessagingEnabled}
            onChange={(e) =>
              setForm({
                ...form,
                proactiveTimingMode: e.target.value === "fixed" ? "fixed" : "random",
              })
            }
          >
            <option value="random">随机时间（在允许时段内）</option>
            <option value="fixed">固定时间（每天）</option>
          </select>
        </div>
        <div className="field-grid field-grid-2">
          <div className="field">
            <label>最短间隔（小时）</label>
            <input
              type="number"
              min={1}
              max={72}
              step={0.5}
              disabled={!form.proactiveMessagingEnabled || form.proactiveTimingMode === "fixed"}
              value={form.proactiveMinGapHours}
              onChange={(e) =>
                setForm({ ...form, proactiveMinGapHours: Number(e.target.value) || 3 })
              }
            />
          </div>
          {form.proactiveTimingMode === "random" ? (
            <div className="field">
              <label>最长随机延迟（小时）</label>
              <input
                type="number"
                min={0}
                max={72}
                step={0.5}
                disabled={!form.proactiveMessagingEnabled}
                value={form.proactiveMaxRandomHours}
                onChange={(e) =>
                  setForm({ ...form, proactiveMaxRandomHours: Number(e.target.value) || 0 })
                }
              />
            </div>
          ) : (
            <div className="field">
              <label>固定发送时间</label>
              <input
                type="time"
                disabled={!form.proactiveMessagingEnabled}
                value={form.proactiveFixedTime}
                onChange={(e) => setForm({ ...form, proactiveFixedTime: e.target.value || "20:00" })}
              />
            </div>
          )}
        </div>
        {form.proactiveTimingMode === "fixed" ? (
          <p className="hint" style={{ marginTop: 0 }}>
            固定时间模式下不使用最短间隔：按「下一个尚未到达的钟点」预约（今天未过用今天）。
          </p>
        ) : null}
        <div className="field-grid field-grid-2">
          <div className="field">
            <label>免打扰开始（时，0–23）</label>
            <input
              type="number"
              min={0}
              max={23}
              disabled={!form.proactiveMessagingEnabled}
              value={form.proactiveQuietStartHour}
              onChange={(e) =>
                setForm({ ...form, proactiveQuietStartHour: Number(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label>免打扰结束（时，0–23）</label>
            <input
              type="number"
              min={0}
              max={23}
              disabled={!form.proactiveMessagingEnabled}
              value={form.proactiveQuietEndHour}
              onChange={(e) =>
                setForm({ ...form, proactiveQuietEndHour: Number(e.target.value) })
              }
            />
          </div>
        </div>
        </div>
        </SettingsFold>

        <SettingsFold title="Obsidian · 慢思考">
        <p className="hint" style={{ marginTop: 0 }}>
          个人知识库真源在 Obsidian。整库默认可留言（白名单填 <code>*</code>）；不想被留言的笔记可写{" "}
          <code>ef_comment: false</code>（旧笔记仍认 <code>ef_su</code>）。系统按留言线程判断：末条是「你的思考」才续写，末条已是角色则不再跟；只有入选的少数篇才会送模型读正文。
          聊天里可「沉淀到 Obsidian」。浏览最近留言见 <a href="/obsidian">慢思考</a> 页。
        </p>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.obsidianEnabled}
              onChange={(e) => setForm({ ...form, obsidianEnabled: e.target.checked })}
            />{" "}
            启用 Obsidian 接入
          </label>
        </div>
        <div className={form.obsidianEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>Vault 本地路径</label>
          <input
            type="text"
            disabled={!form.obsidianEnabled}
            value={form.obsidianVaultPath}
            onChange={(e) => setForm({ ...form, obsidianVaultPath: e.target.value })}
            placeholder="例如 D:\Ob\我的知识库（盘符后用英文冒号 : ）"
          />
        </div>
        <div className="field">
          <label>Vault 名称（obsidian:// 打开用，一般与库名一致）</label>
          <input
            type="text"
            disabled={!form.obsidianEnabled}
            value={form.obsidianVaultName}
            onChange={(e) => setForm({ ...form, obsidianVaultName: e.target.value })}
            placeholder="留空则用路径末段文件夹名"
          />
        </div>
        <div className="field">
          <label>扫描范围（填 * 表示整库；或写子目录限制）</label>
          <textarea
            rows={3}
            disabled={!form.obsidianEnabled}
            value={form.obsidianWhitelistDirs}
            onChange={(e) => setForm({ ...form, obsidianWhitelistDirs: e.target.value })}
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.obsidianNightlyEnabled}
              disabled={!form.obsidianEnabled}
              onChange={(e) => setForm({ ...form, obsidianNightlyEnabled: e.target.checked })}
            />{" "}
            夜间自动留言（仅允许留言的笔记）
          </label>
        </div>
        <div className="field-grid field-grid-2">
          <div className="field">
            <label>留言时刻（时，0–23）</label>
            <input
              type="number"
              min={0}
              max={23}
              disabled={!form.obsidianEnabled || !form.obsidianNightlyEnabled}
              value={form.obsidianNightlyHour}
              onChange={(e) =>
                setForm({ ...form, obsidianNightlyHour: Number(e.target.value) || 21 })
              }
            />
          </div>
          <div className="field">
            <label>每晚最多留言篇数</label>
            <input
              type="number"
              min={1}
              max={10}
              disabled={!form.obsidianEnabled || !form.obsidianNightlyEnabled}
              value={form.obsidianMaxCommentsPerNight}
              onChange={(e) =>
                setForm({
                  ...form,
                  obsidianMaxCommentsPerNight: Number(e.target.value) || 3,
                })
              }
            />
          </div>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.obsidianPushNotify}
              disabled={!form.obsidianEnabled}
              onChange={(e) => setForm({ ...form, obsidianPushNotify: e.target.checked })}
            />{" "}
            留言后推送提醒
          </label>
        </div>
        <div className="field">
          <label>
            慢思考留言提示词（叠在角色「关于你自己 / 关于你 / 相处方式」之后；可用{" "}
            {"{{char}}"}、{"{{user}}"}、{"{{time}}"}、{"{{date}}"}、{"{{weekday}}"}）
          </label>
          <textarea
            rows={8}
            disabled={!form.obsidianEnabled}
            value={form.obsidianPrompt}
            onChange={(e) => setForm({ ...form, obsidianPrompt: e.target.value })}
            placeholder="留空则使用内置默认提示词"
          />
        </div>
        <div className="field" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading || !form.obsidianEnabled}
            onClick={async () => {
              try {
                await apiFetch("/obsidian/ensure-dirs", { method: "POST", body: "{}" });
                setMessage("已创建白名单目录");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "创建失败");
              }
            }}
          >
            创建白名单目录
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading || !form.obsidianEnabled || testing === "obsidian-nightly"}
            onClick={async () => {
              setTesting("obsidian-nightly");
              try {
                const r = await apiFetch<{
                  commented?: { title: string }[];
                  errors?: string[];
                  skippedReason?: string;
                }>("/obsidian/nightly/run", { method: "POST", body: "{}" });
                if (r.skippedReason) setMessage(`跳过：${r.skippedReason}`);
                else {
                  const errHint = r.errors?.length
                    ? `；错误 ${r.errors.length}：${r.errors.slice(0, 2).join("；")}`
                    : "";
                  setMessage(`留言 ${r.commented?.length ?? 0} 篇${errHint}`);
                }
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "执行失败");
              } finally {
                setTesting(null);
              }
            }}
          >
            {testing === "obsidian-nightly" ? "留言中…" : "立即跑一轮留言"}
          </button>
        </div>
        </div>
        </SettingsFold>

        <SettingsFold title="微信读书">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.wereadEnabled}
              onChange={(e) => setForm({ ...form, wereadEnabled: e.target.checked })}
            />{" "}
            启用微信读书（书架、笔记、划线）
          </label>
        </div>
        <div className={form.wereadEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>手动 Cookie（备用，可选）</label>
          <textarea
            rows={3}
            value={wereadCookie}
            onChange={(e) => setWereadCookie(e.target.value)}
            disabled={!form.wereadEnabled}
            placeholder={
              wereadHasCookie
                ? `已配置（${wereadCookiePreview}），输入新 Cookie 可覆盖`
                : "wr_skey=...; wr_vid=..."
            }
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !form.wereadEnabled || testing === "weread"}
          onClick={() => runTest("weread")}
        >
          {testing === "weread" ? "测试中…" : "测试拉书架"}
        </button>
        </div>
        </SettingsFold>

        <SettingsFold title="Bilibili 字幕">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.bilibiliEnabled}
              onChange={(e) => setForm({ ...form, bilibiliEnabled: e.target.checked })}
            />{" "}
            启用 B 站视频字幕
          </label>
        </div>
        <div className={form.bilibiliEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>手动 Cookie（备用，可选 · 含 SESSDATA）</label>
          <textarea
            rows={3}
            value={bilibiliCookie}
            onChange={(e) => setBilibiliCookie(e.target.value)}
            disabled={!form.bilibiliEnabled}
            placeholder={
              bilibiliHasCookie
                ? `已配置（${bilibiliCookiePreview}），输入新 Cookie 可覆盖`
                : "SESSDATA=...; bili_jct=..."
            }
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !form.bilibiliEnabled || testing === "bilibili"}
          onClick={() => runTest("bilibili")}
        >
          {testing === "bilibili" ? "测试中…" : "测试 B 站连接"}
        </button>
        </div>
        </SettingsFold>

        <SettingsFold title="知乎文章">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.zhihuEnabled}
              onChange={(e) => setForm({ ...form, zhihuEnabled: e.target.checked })}
            />{" "}
            启用知乎专栏/问答
          </label>
        </div>
        <div className={form.zhihuEnabled ? undefined : "settings-section-disabled"}>
        <div className="field">
          <label>开放平台 Access Secret（developer.zhihu.com · 站内搜索/热榜）</label>
          <input
            type="password"
            value={zhihuAccessSecret}
            onChange={(e) => setZhihuAccessSecret(e.target.value)}
            disabled={!form.zhihuEnabled}
            placeholder={
              zhihuHasAccessSecret
                ? `已配置（${zhihuAccessSecretPreview}），输入新 Key 可覆盖`
                : "粘贴 developer.zhihu.com 的 Access Secret"
            }
          />
          <p className="hint" style={{ marginTop: 6 }}>
            用于联网搜索时检索知乎站内内容；专栏链接 403 时也会按标题/摘要回退。与 Cookie 互补，非替代全文抓取。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !form.zhihuEnabled || testing === "zhihu-open"}
          onClick={() => runTest("zhihu-open")}
        >
          {testing === "zhihu-open" ? "测试中…" : "测试知乎开放平台"}
        </button>
        <div className="field">
          <label>手动 Cookie（备用，可选 · 含 z_c0）</label>
          <textarea
            rows={3}
            value={zhihuCookie}
            onChange={(e) => setZhihuCookie(e.target.value)}
            disabled={!form.zhihuEnabled}
            placeholder={
              zhihuHasCookie
                ? `已配置（${zhihuCookiePreview}），输入新 Cookie 可覆盖`
                : "z_c0=...; _zap=..."
            }
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading || !form.zhihuEnabled || testing === "zhihu"}
          onClick={() => runTest("zhihu")}
        >
          {testing === "zhihu" ? "测试中…" : "测试知乎登录"}
        </button>
        </div>
        </SettingsFold>

        <SettingsFold title="Keep 健康">
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.keepEnabled}
              onChange={(e) => setForm({ ...form, keepEnabled: e.target.checked })}
            />{" "}
            启用 Keep 运动/健康只读查询（聊天里自然注入）
          </label>
        </div>
        <div className={form.keepEnabled ? undefined : "settings-section-disabled"}>
          <p className="hint" style={{ marginTop: 0 }}>
            角色只会<strong>读取</strong>你的 Keep 数据（运动、体重体脂、睡眠等），不会写入。
            凭证保存在本机 <code>~/.keepai/.env</code>，与 Keep 官方 Skill 共用。
          </p>
          <p className="hint">
            登录状态：
            {keepLoggedIn
              ? `已登录${keepUsername ? `（${keepUsername}）` : ""}`
              : "未登录（请扫码授权）"}
          </p>
          {keepQr?.qrcodeUrl && (
            <div style={{ margin: "12px 0" }}>
              <img
                src={keepQr.qrcodeUrl}
                alt="Keep 扫码登录"
                style={{ maxWidth: 220, width: "100%", borderRadius: 8 }}
              />
              <p className="hint">
                二维码链接：{" "}
                <a href={keepQr.qrcodeUrl} target="_blank" rel="noreferrer">
                  打开图片
                </a>
              </p>
              {keepQr.redirectUrl && (
                <p className="hint">
                  图片打不开时可点：{" "}
                  <a href={keepQr.redirectUrl} target="_blank" rel="noreferrer">
                    登录跳转
                  </a>
                </p>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline"
              disabled={loading || keepLoginBusy || !form.keepEnabled}
              onClick={() => void startKeepLogin()}
            >
              {keepLoginBusy ? "等待扫码…" : keepLoggedIn ? "重新扫码" : "扫码登录 Keep"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading || keepLoginBusy || !keepLoggedIn || !form.keepEnabled}
              onClick={() => void logoutKeep()}
            >
              退出登录
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading || testing === "keep" || !form.keepEnabled || !keepLoggedIn}
              onClick={() => void testKeepQuery()}
            >
              {testing === "keep" ? "查询中…" : "测试查询"}
            </button>
          </div>
        </div>
        </SettingsFold>

        <SettingsFold title="记忆系统">
        <label className="memory-checkbox-row">
          <input
            type="checkbox"
            checked={form.personaDigestEnabled}
            onChange={(e) => setForm({ ...form, personaDigestEnabled: e.target.checked })}
          />
          启用人格画像夜间自动归纳（约凌晨 2 点；关闭后仍可在「档案」页立刻整理）
        </label>
        <div className="field">
          <label>总结提示词（存入前）</label>
          <textarea
            rows={5}
            value={form.memorySummarizePrompt}
            onChange={(e) => setForm({ ...form, memorySummarizePrompt: e.target.value })}
          />
        </div>
        <div className="field">
          <label>检索提示词（选出相关记忆）</label>
          <textarea
            rows={4}
            value={form.memorySelectPrompt}
            onChange={(e) => setForm({ ...form, memorySelectPrompt: e.target.value })}
          />
        </div>
        <div className="field">
          <label>事件记忆插入提示词（仅事件/资料；含 {"{{memories}}"}）</label>
          <textarea
            rows={3}
            value={form.memoryInsertPrompt}
            onChange={(e) => setForm({ ...form, memoryInsertPrompt: e.target.value })}
          />
          <p className="hint">只包裹事件记忆，不会套在共读讨论外层。</p>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          共读（读书记忆）— 留空使用内置默认
        </p>
        <div className="field">
          <label>共读检索提示词（选 1 条讨论论点）</label>
          <textarea
            rows={4}
            value={form.coreadSelectPrompt}
            onChange={(e) => setForm({ ...form, coreadSelectPrompt: e.target.value })}
            placeholder="留空则使用内置默认"
          />
        </div>
        <div className="field">
          <label>共读插入提示词（仅共读；可用 {"{{title}}"}、{"{{claim}}"}）</label>
          <textarea
            rows={3}
            value={form.coreadInsertPrompt}
            onChange={(e) => setForm({ ...form, coreadInsertPrompt: e.target.value })}
            placeholder="留空则使用内置默认"
          />
          <p className="hint">书名命中并选出论点时单独使用此模板，与上方事件插入互不嵌套。</p>
        </div>
        <div className="field">
          <label>共读整理提示词（草稿 → 讨论论点）</label>
          <textarea
            rows={5}
            value={form.coreadDigestPrompt}
            onChange={(e) => setForm({ ...form, coreadDigestPrompt: e.target.value })}
            placeholder="留空则使用内置默认"
          />
        </div>
        </SettingsFold>

        <SettingsFold title="文件向量化">
        <label className="memory-checkbox-row">
          <input
            type="checkbox"
            checked={form.leannEnabled}
            onChange={(e) => setForm({ ...form, leannEnabled: e.target.checked })}
          />
          启用 LEANN（聊天时自动语义检索已索引书目）
        </label>
        <div className="field-grid">
          <div className="field">
            <label>Python 路径</label>
            <input
              type="text"
              value={form.leannPythonPath}
              onChange={(e) => setForm({ ...form, leannPythonPath: e.target.value })}
              placeholder=".venv-leann\Scripts\python.exe"
            />
            <p className="hint" style={{ marginTop: 4 }}>
              不要用 Windows 商店版 python。本机可用项目内{" "}
              <code>.venv-leann\Scripts\python.exe</code>
            </p>
          </div>
          <div className="field">
            <label>Embedding 模式（可选）</label>
            <input
              type="text"
              value={form.leannEmbeddingMode}
              onChange={(e) => setForm({ ...form, leannEmbeddingMode: e.target.value })}
              placeholder="留空用 LEANN 默认"
            />
          </div>
          <div className="field">
            <label>每轮检索段落数</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.leannRetrieveCount}
              onChange={(e) => setForm({ ...form, leannRetrieveCount: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>相似度阈值</label>
            <input
              type="number"
              step={0.01}
              value={form.leannScoreThreshold}
              onChange={(e) => setForm({ ...form, leannScoreThreshold: Number(e.target.value) })}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={testing === "leann"}
          onClick={() => runTest("leann")}
        >
          {testing === "leann" ? "检测中…" : "测试 LEANN 连接"}
        </button>
        </SettingsFold>

        <SettingsFold title="Open AI 端口">
          <p className="hint" style={{ marginBottom: 12 }}>
            用于长对话摘要：每 5 轮对话，把刚被裁掉的最近 50 条压成 5 条「-」流水账（用户/你指代）。与「工具调度」分开。关闭时摘要改走
            DeepSeek。
          </p>
          {renderConnSection(
          "Open AI 端口",
          openaiCompat,
          setOpenaiCompat,
          "openai",
          "https://api.openai.com 或中转地址",
          {
            enabled: form.openaiCompatEnabled,
            onEnabledChange: (v) => setForm({ ...form, openaiCompatEnabled: v }),
            enabledLabel: "启用（对话摘要）",          }
        )}
        </SettingsFold>

        <SettingsFold title="账户与安全">
        <div className="field">
          <label htmlFor="newPassword">修改登录密码</label>
          <input
            id="newPassword"
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            placeholder="至少 4 位"
          />
        </div>
        <div className="field">
          <label>登录日志（最近 100 条，排查登录失败用）</label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void loadAuthLogs(authLogsLoaded)}
          >
            {authLogsLoaded ? "刷新日志" : "加载日志"}
          </button>
          {authLogsLoaded && (
            <pre className="auth-log-panel">
              {authLogs.length === 0
                ? "暂无记录（新功能；之后的登录会写入 data/logs/auth.log）"
                : authLogs
                    .map((line) => {
                      try {
                        const o = JSON.parse(line) as Record<string, string>;
                        return `${o.ts}  ${o.event}  ${o.ip || ""}  ${o.ua || ""}`;
                      } catch {
                        return line;
                      }
                    })
                    .join("\n")}
            </pre>
          )}
        </div>
        </SettingsFold>

        {message && (
          <p className={message.startsWith("✅") || message === "已保存" ? "hint" : "error"}>{message}</p>
        )}
        <div className="settings-form-actions">
          <button type="submit" className="btn btn-outline" disabled={loading}>
            {loading ? "保存中…" : "保存设置"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => void handleLogout()}
          >
            退出登录
          </button>
        </div>
      </form>
    </AppShell>
  );
}

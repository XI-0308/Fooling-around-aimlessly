import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import {
  authLogsHandler,
  authStatusHandler,
  ensurePasswordInitialized,
  loginHandler,
  logoutHandler,
  requireAuth,
} from "./auth.js";
import { sendCachedImageFile } from "./http/cachedFile.js";
import { CHARACTERS_DIR } from "./config.js";
import { getSettingsHandler, testIntegrationHandler, updateSettingsHandler } from "./routes/settings.js";
import { speakTtsHandler } from "./routes/tts.js";
import {
  deleteCharacterHandler,
  getPrimaryCharacterHandler,
  getCharacterHandler,
  importCharacterHandler,
  listCharactersHandler,
  updateCharacterHandler,
  uploadCharacterAvatarHandler,
} from "./routes/characters.js";
import { getCharacter } from "./store/characters.js";
import { getUserAvatarFile } from "./store/userPersona.js";
import {
  createChatHandler,
  confirmLeannOfferHandler,
  deleteChatHandler,
  deleteLastExchangeHandler,
  deleteMessageHandler,
  dismissLeannOfferHandler,
  getAttachmentHandler,
  getChatHandler,
  getMessageContextLogHandler,
  listChatsHandler,
  memoryFeedbackHandler,
  activityCompleteHandler,
  patchChatHandler,
  regenerateHandler,
  regenerateMessageHandler,
  resendUserMessageHandler,
  sendMessageHandler,
  summarizeEventHandler,
  summarizeEventPreviewHandler,
  updateMessageHandler,
  uploadAttachmentHandler,
  wereadMemoryPreviewHandler,
} from "./routes/chats.js";
import {
  deleteLeannCollectionHandler,
  getLeannCollectionHandler,
  ingestLeannFileHandler,
  leannProbeHandler,
  leannStatusHandler,
  previewLeannChunksHandler,
  updateLeannChunksHandler,
  updateLeannSourceHandler,
  vectorizeLeannCollectionHandler,
} from "./routes/leann.js";
import {
  deleteMemoryHandler,
  ingestChatHandler,
  ingestEventHandler,
  ingestFileHandler,
  ingestManualHandler,
  ingestWeReadHandler,
  listMemoryHandler,
  searchMemoryGlobalHandler,
  updateMemoryHandler,
} from "./routes/memory.js";
import {
  deleteWorldInfoEntryHandler,
  getWorldInfoHandler,
  importWorldInfoHandler,
  newWorldInfoEntryHandler,
  updateWorldInfoSettingsHandler,
  upsertWorldInfoEntryHandler,
} from "./routes/worldinfo.js";
import {
  getUserPersonaHandler,
  updateUserPersonaHandler,
  uploadUserAvatarHandler,
} from "./routes/user.js";
import {
  exportBackupHandler,
  getBackupInfoHandler,
  importBackupHandler,
  importPackageHandler,
  previewImportHandler,
} from "./routes/backup.js";
import { getAppIconHandler, getChatThemeBgHandler, getChatThemeHandler, getLoginChatThemeBgHandler, putChatThemeHandler } from "./routes/theme.js";
import { getProactiveStatusHandler, markProactiveSeenHandler } from "./routes/proactive.js";
import {
  getPushVapidPublicKeyHandler,
  subscribePushHandler,
  testPushHandler,
  unsubscribePushHandler,
} from "./routes/push.js";
import { startProactiveScheduler } from "./proactive/scheduler.js";
import { ensureWebPushConfigured } from "./push/vapid.js";
import { startCoreadDigestScheduler } from "./coread/scheduler.js";
import { startPersonaDigestScheduler } from "./persona/scheduler.js";
import {
  ensureObsidianDirsHandler,
  getObsidianRecentHandler,
  getObsidianStatusHandler,
  obsidianCreateThoughtHandler,
  obsidianEditThoughtHandler,
  obsidianReplyHandler,
  obsidianSettleHandler,
  obsidianSettlePreviewHandler,
  runObsidianNightlyHandler,
  startObsidianNightlyScheduler,
} from "./obsidian/index.js";
import {
  createPersonaEntryHandler,
  deletePersonaEntryHandler,
  digestPersonaHandler,
  listPersonaCategoryHandler,
  listPersonaHandler,
  updatePersonaEntryHandler,
} from "./routes/persona.js";
import {
  completeActivityOccurrenceHandler,
  createActivityHandler,
  deleteActivityHandler,
  listActivityHandler,
  updateActivityHandler,
} from "./routes/activity.js";

import {
  keepCheckLoginHandler,
  keepLogoutHandler,
  keepQrcodeHandler,
  keepStatusHandler,
  keepTestQueryHandler,
} from "./routes/keep.js";
import {
  appendCoreadDraftHandler,
  createCoreadHandler,
  deleteCoreadDiscussionHandler,
  deleteCoreadDraftHandler,
  deleteCoreadHandler,
  digestCoreadHandler,
  getCoreadHandler,
  listCoreadHandler,
  updateCoreadDiscussionHandler,
  updateCoreadDraftHandler,
  updateCoreadHandler,
} from "./routes/coread.js";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

/** 网络超时等不应拖垮整站（用户手机上表现为「系统打不开」） */
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

function parseCorsOrigins(): string | string[] {
  const raw = process.env.WEB_ORIGIN;
  if (!raw) return "http://localhost:3000";
  if (raw.includes(",")) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return raw;
}

async function main() {
  await ensurePasswordInitialized();

  const app = express();

  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "rp-agent-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        // HTTP（Tailscale / 局域网）不要开 secure，否则 cookie 写不进去
        secure: process.env.COOKIE_SECURE === "true",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: "0.4.0", milestone: 4 });
  });

  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/logout", logoutHandler);
  app.get("/api/auth/status", authStatusHandler);
  app.get("/api/auth/logs", requireAuth, authLogsHandler);

  app.get("/api/settings", requireAuth, getSettingsHandler);
  app.put("/api/settings", requireAuth, updateSettingsHandler);
  app.post("/api/settings/test/:kind", requireAuth, testIntegrationHandler);
  app.post("/api/tts/speak", requireAuth, speakTtsHandler);

  app.get("/api/theme/bg/login", getLoginChatThemeBgHandler);
  app.get("/api/theme/icon", getAppIconHandler);

  app.get("/api/theme", requireAuth, getChatThemeHandler);
  app.put("/api/theme", requireAuth, putChatThemeHandler);
  app.get("/api/theme/bg/:kind", requireAuth, getChatThemeBgHandler);

  app.get("/api/user", requireAuth, getUserPersonaHandler);
  app.put("/api/user", requireAuth, updateUserPersonaHandler);
  app.post("/api/user/avatar", requireAuth, uploadUserAvatarHandler);
  app.get("/api/user/avatar", requireAuth, (_req, res) => {
    const file = getUserAvatarFile();
    if (!file) {
      res.status(404).end();
      return;
    }
    sendCachedImageFile(res, file);
  });

  app.get("/api/characters/primary", requireAuth, getPrimaryCharacterHandler);
  app.get("/api/characters", requireAuth, listCharactersHandler);
  app.get("/api/characters/:id", requireAuth, getCharacterHandler);
  app.post("/api/characters/import", requireAuth, importCharacterHandler);
  app.put("/api/characters/:id", requireAuth, updateCharacterHandler);
  app.post("/api/characters/:id/avatar", requireAuth, uploadCharacterAvatarHandler);
  app.delete("/api/characters/:id", requireAuth, deleteCharacterHandler);
  app.get("/api/characters/:id/avatar", requireAuth, (req, res) => {
    const c = getCharacter(req.params.id);
    if (!c?.avatarPath) {
      res.status(404).end();
      return;
    }
    sendCachedImageFile(res, path.join(CHARACTERS_DIR, c.avatarPath));
  });

  app.get("/api/chats", requireAuth, listChatsHandler);
  app.get("/api/chats/:id", requireAuth, getChatHandler);
  app.delete("/api/chats/:id", requireAuth, deleteChatHandler);
  app.patch("/api/chats/:id", requireAuth, patchChatHandler);
  app.post("/api/chats", requireAuth, createChatHandler);
  app.post("/api/chats/:id/messages", requireAuth, sendMessageHandler);
  app.post("/api/chats/:id/attachments", requireAuth, uploadAttachmentHandler);
  app.get("/api/chats/:id/attachments/:attachmentId", requireAuth, getAttachmentHandler);
  app.get(
    "/api/chats/:id/messages/:messageId/context-log",
    requireAuth,
    getMessageContextLogHandler
  );
  app.post(
    "/api/chats/:id/messages/:messageId/memory-feedback",
    requireAuth,
    memoryFeedbackHandler
  );
  app.post(
    "/api/chats/:id/messages/:messageId/activity-complete",
    requireAuth,
    activityCompleteHandler
  );
  app.post("/api/chats/:id/regenerate", requireAuth, regenerateHandler);
  app.post("/api/chats/:id/regenerate/:messageId", requireAuth, regenerateMessageHandler);
  app.post("/api/chats/:id/summarize-event", requireAuth, summarizeEventHandler);
  app.post("/api/chats/:id/summarize-event/preview", requireAuth, summarizeEventPreviewHandler);
  app.post("/api/chats/:id/obsidian/settle/preview", requireAuth, obsidianSettlePreviewHandler);
  app.post("/api/chats/:id/obsidian/settle", requireAuth, obsidianSettleHandler);
  app.post("/api/chats/:id/weread-memory/preview", requireAuth, wereadMemoryPreviewHandler);
  app.post("/api/chats/:id/leann-offer/confirm", requireAuth, confirmLeannOfferHandler);
  app.post("/api/chats/:id/leann-offer/dismiss", requireAuth, dismissLeannOfferHandler);
  app.put("/api/chats/:id/messages/:messageId", requireAuth, updateMessageHandler);
  app.post("/api/chats/:id/messages/:messageId/resend", requireAuth, resendUserMessageHandler);
  app.delete("/api/chats/:id/messages/:messageId", requireAuth, deleteMessageHandler);
  app.delete("/api/chats/:id/last", requireAuth, deleteLastExchangeHandler);

  app.get("/api/worldinfo", requireAuth, getWorldInfoHandler);
  app.put("/api/worldinfo/settings", requireAuth, updateWorldInfoSettingsHandler);
  app.post("/api/worldinfo/entries", requireAuth, upsertWorldInfoEntryHandler);
  app.delete("/api/worldinfo/entries/:id", requireAuth, deleteWorldInfoEntryHandler);
  app.post("/api/worldinfo/import", requireAuth, importWorldInfoHandler);
  app.get("/api/worldinfo/entries/new", requireAuth, newWorldInfoEntryHandler);

  app.get("/api/memory", requireAuth, listMemoryHandler);
  app.get("/api/memory/search", requireAuth, searchMemoryGlobalHandler);
  app.put("/api/memory/:id", requireAuth, updateMemoryHandler);
  app.delete("/api/memory/:id", requireAuth, deleteMemoryHandler);
  app.post("/api/memory/ingest/event", requireAuth, ingestEventHandler);
  app.post("/api/memory/ingest/weread", requireAuth, ingestWeReadHandler);
  app.post("/api/memory/ingest/file", requireAuth, ingestFileHandler);
  app.post("/api/memory/ingest/manual", requireAuth, ingestManualHandler);
  app.post("/api/memory/ingest/chat", requireAuth, ingestChatHandler);

  app.get("/api/coread", requireAuth, listCoreadHandler);
  app.post("/api/coread", requireAuth, createCoreadHandler);
  app.get("/api/coread/:id", requireAuth, getCoreadHandler);
  app.put("/api/coread/:id", requireAuth, updateCoreadHandler);
  app.delete("/api/coread/:id", requireAuth, deleteCoreadHandler);
  app.post("/api/coread/:id/drafts", requireAuth, appendCoreadDraftHandler);
  app.put("/api/coread/:id/drafts/:draftId", requireAuth, updateCoreadDraftHandler);
  app.delete("/api/coread/:id/drafts/:draftId", requireAuth, deleteCoreadDraftHandler);
  app.put("/api/coread/:id/discussions/:discussionId", requireAuth, updateCoreadDiscussionHandler);
  app.delete("/api/coread/:id/discussions/:discussionId", requireAuth, deleteCoreadDiscussionHandler);
  app.post("/api/coread/:id/digest", requireAuth, digestCoreadHandler);

  app.get("/api/persona", requireAuth, listPersonaHandler);
  app.post("/api/persona/digest", requireAuth, digestPersonaHandler);
  app.get("/api/persona/:category", requireAuth, listPersonaCategoryHandler);
  app.post("/api/persona/:category", requireAuth, createPersonaEntryHandler);
  app.put("/api/persona/:category/:id", requireAuth, updatePersonaEntryHandler);
  app.delete("/api/persona/:category/:id", requireAuth, deletePersonaEntryHandler);

  app.get("/api/activity", requireAuth, listActivityHandler);
  app.post("/api/activity", requireAuth, createActivityHandler);
  app.put("/api/activity/:id", requireAuth, updateActivityHandler);
  app.delete("/api/activity/:id", requireAuth, deleteActivityHandler);
  app.post("/api/activity/:id/complete", requireAuth, completeActivityOccurrenceHandler);

  app.get("/api/keep/status", requireAuth, keepStatusHandler);

  app.post("/api/keep/qrcode", requireAuth, keepQrcodeHandler);
  app.post("/api/keep/check-login", requireAuth, keepCheckLoginHandler);
  app.post("/api/keep/logout", requireAuth, keepLogoutHandler);
  app.post("/api/keep/test", requireAuth, keepTestQueryHandler);

  app.get("/api/leann/status", requireAuth, leannStatusHandler);
  app.get("/api/leann/probe", requireAuth, leannProbeHandler);
  app.get("/api/leann/collections/:id", requireAuth, getLeannCollectionHandler);
  app.put("/api/leann/collections/:id/source", requireAuth, updateLeannSourceHandler);
  app.post("/api/leann/collections/:id/preview-chunks", requireAuth, previewLeannChunksHandler);
  app.put("/api/leann/collections/:id/chunks", requireAuth, updateLeannChunksHandler);
  app.post("/api/leann/collections/:id/vectorize", requireAuth, vectorizeLeannCollectionHandler);
  app.post("/api/memory/ingest/leann", requireAuth, ingestLeannFileHandler);
  app.delete("/api/leann/collections/:id", requireAuth, deleteLeannCollectionHandler);

  app.get("/api/backup/info", requireAuth, getBackupInfoHandler);
  app.get("/api/backup/export", requireAuth, exportBackupHandler);
  app.post("/api/backup/export", requireAuth, exportBackupHandler);
  app.post("/api/backup/preview", requireAuth, previewImportHandler);
  app.post("/api/backup/import", requireAuth, importBackupHandler);
  app.post("/api/backup/import-package", requireAuth, importPackageHandler);

  app.get("/api/proactive/status", requireAuth, getProactiveStatusHandler);
  app.post("/api/proactive/seen", requireAuth, markProactiveSeenHandler);

  app.get("/api/push/vapid-public-key", requireAuth, getPushVapidPublicKeyHandler);
  app.post("/api/push/subscribe", requireAuth, subscribePushHandler);
  app.post("/api/push/unsubscribe", requireAuth, unsubscribePushHandler);
  app.post("/api/push/test", requireAuth, testPushHandler);

  app.get("/api/obsidian/status", requireAuth, getObsidianStatusHandler);
  app.get("/api/obsidian/recent", requireAuth, getObsidianRecentHandler);
  app.post("/api/obsidian/reply", requireAuth, obsidianReplyHandler);
  app.post("/api/obsidian/thought/create", requireAuth, obsidianCreateThoughtHandler);
  app.post("/api/obsidian/thought/edit", requireAuth, obsidianEditThoughtHandler);
  app.post("/api/obsidian/ensure-dirs", requireAuth, ensureObsidianDirsHandler);
  app.post("/api/obsidian/nightly/run", requireAuth, runObsidianNightlyHandler);

  app.listen(PORT, HOST, () => {
    console.log(`[server] RP-Agent 后端运行于 http://${HOST}:${PORT}`);
    console.log(`[server] 本机访问 http://localhost:${PORT}`);
    try {
      ensureWebPushConfigured();
      console.log("[push] Web Push (VAPID) 已就绪");
    } catch (err) {
      console.warn("[push] VAPID 初始化失败:", err instanceof Error ? err.message : err);
    }
    startProactiveScheduler();
    startCoreadDigestScheduler();
    startPersonaDigestScheduler();
    startObsidianNightlyScheduler();
  });
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});

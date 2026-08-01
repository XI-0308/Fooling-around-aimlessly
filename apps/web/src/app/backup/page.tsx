"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiDownloadPost, apiFetch, fileToBase64 } from "@/lib/api";
import { captureBrowserThemeForBackup, refreshChatThemeAfterImport } from "@/lib/chatTheme";

type BackupPackageId =
  | "memory"
  | "worldinfo"
  | "chats"
  | "profile"
  | "api-connections"
  | "generation-system"
  | "decorate";

interface PackageDefinition {
  id: BackupPackageId;
  filename: string;
  label: string;
  category: "soul" | "settings";
  description: string;
  importOrder: number;
}

interface ImportPreviewPackage extends PackageDefinition {
  available: boolean;
}

interface ImportPreview {
  kind: "bundle" | "single";
  packages: ImportPreviewPackage[];
  bundleCreatedAt?: string;
  includeApiKeys?: boolean;
}

interface BackupInfo {
  importOrderHint: string;
  packages: PackageDefinition[];
  dataPresence: Record<BackupPackageId, boolean>;
  snapshots: { name: string; createdAt: string }[];
}

const SOUL_LABEL = "灵魂包";
const SETTINGS_LABEL = "设置包";

export default function BackupPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [includeApiKeys, setIncludeApiKeys] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<BackupPackageId>>(new Set());
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function loadInfo() {
    apiFetch<BackupInfo>("/backup/info")
      .then(setInfo)
      .catch(() => {});
  }

  useEffect(() => {
    loadInfo();
  }, []);

  async function handleExport() {
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const browserTheme = await captureBrowserThemeForBackup();
      await apiDownloadPost(
        "/backup/export",
        { includeApiKeys, browserTheme },
        "rp-agent-backup.zip"
      );
      setMessage(
        includeApiKeys
          ? "已下载完整备份（含 API 密钥与浏览器装饰）。请妥善保管，勿分享给他人。"
          : "已下载备份（不含 API 密钥，但含浏览器装饰）。API 连接需另行导出或手动填写。"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setPreview(null);
    setSelected(new Set());
    setError("");
    setMessage("");

    try {
      const dataBase64 = await fileToBase64(file);
      const pv = await apiFetch<ImportPreview>("/backup/preview", {
        method: "POST",
        body: JSON.stringify({ dataBase64 }),
      });
      setPreview(pv);
      const defaults = new Set(
        pv.packages.filter((p) => p.available).map((p) => p.id)
      );
      setSelected(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取备份文件");
      setImportFile(null);
    }
    e.target.value = "";
  }

  function togglePackage(id: BackupPackageId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    if (!importFile || selected.size === 0) return;
    if (
      !window.confirm(
        "导入将覆盖所选类型的本地数据。系统会先自动保存一份当前快照。确定继续？"
      )
    ) {
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");
    try {
      const dataBase64 = await fileToBase64(importFile);
      const result = await apiFetch<{
        snapshotName: string;
        imported: BackupPackageId[];
        skipped: BackupPackageId[];
        messages: string[];
      }>("/backup/import", {
        method: "POST",
        body: JSON.stringify({
          dataBase64,
          packages: Array.from(selected),
          createSnapshot: true,
        }),
      });
      setMessage(
        `导入完成。${result.messages.join("；")}` +
          (result.snapshotName ? ` 导入前快照：${result.snapshotName}` : "")
      );
      if (result.imported.includes("decorate")) {
        await refreshChatThemeAfterImport();
      }
      setImportFile(null);
      setPreview(null);
      setSelected(new Set());
      loadInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  function renderPackageList(
    category: "soul" | "settings",
    mode: "export" | "import"
  ) {
    if (mode === "export") {
      const packages = info?.packages.filter((p) => p.category === category) ?? [];
      return (
        <ul className="backup-package-list">
          {packages.map((pkg) => {
            const present = info?.dataPresence[pkg.id];
            return (
              <li key={pkg.id} className="backup-package-item">
                <div>
                  <strong>{pkg.label}</strong>
                  <span className="hint"> · {pkg.filename}</span>
                </div>
                <p className="hint">{pkg.description}</p>
                <p className={`backup-status ${present ? "ok" : "empty"}`}>
                  {pkg.id === "decorate"
                    ? present
                      ? "服务器与浏览器装饰均可备份"
                      : "导出时将自动包含当前浏览器装饰（localStorage / 背景图）"
                    : present
                      ? "本地有数据"
                      : "本地暂无数据（仍会生成空包或跳过 API 包）"}
                </p>
              </li>
            );
          })}
        </ul>
      );
    }

    const packages = preview?.packages.filter((p) => p.category === category) ?? [];
    return (
      <ul className="backup-package-list">
        {packages.map((pkg) => (
          <li key={pkg.id} className="backup-package-item">
            <label className="backup-package-label">
              <input
                type="checkbox"
                checked={selected.has(pkg.id)}
                disabled={!pkg.available}
                onChange={() => togglePackage(pkg.id)}
              />
              <span>
                <strong>{pkg.label}</strong>
                <span className="hint"> · {pkg.filename}</span>
              </span>
            </label>
            <p className="hint">{pkg.description}</p>
            {!pkg.available && <p className="backup-status empty">此备份中不包含该包</p>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <AppShell title="备份与恢复">
      <div className="backup-page">
        <div className="card backup-section">
          <h2 style={{ marginTop: 0 }}>导出备份</h2>
          <p className="hint">
            一键生成多个分包 zip，并打包为一个总 zip 下载。你可解压后把灵魂包存手机或网盘，设置包按需保存。
          </p>

          <h3 className="backup-subtitle">{SOUL_LABEL}</h3>
          {renderPackageList("soul", "export")}

          <h3 className="backup-subtitle">{SETTINGS_LABEL}</h3>
          {renderPackageList("settings", "export")}

          <label className="backup-checkbox-row">
            <input
              type="checkbox"
              checked={includeApiKeys}
              onChange={(e) => setIncludeApiKeys(e.target.checked)}
            />
            <span>
              同时导出 API 连接包（含 DeepSeek、看图/生图、TTS 等密钥）
              <span className="hint"> — 未勾选时更安全，适合存网盘；恢复后需在设置页重新填 Key</span>
            </span>
          </label>

          <button
            type="button"
            className="btn btn-outline"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? "正在打包…" : "下载备份"}
          </button>
        </div>

        <div className="card backup-section">
          <h2 style={{ marginTop: 0 }}>导入恢复（高级）</h2>
          <p className="hint">
            日常恢复建议到对应功能页：聊天页「导入历史聊天记录」、记忆库「语意记忆 / 从备份导入」。
            此处可一次选择多个包导入（适合整机恢复）。
          </p>
          <p className="hint">{info?.importOrderHint}</p>

          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => fileRef.current?.click()}
          >
            选择备份 zip…
          </button>
          {importFile && (
            <p className="hint" style={{ marginTop: 8 }}>
              已选择：{importFile.name}
              {preview?.bundleCreatedAt &&
                ` · 备份于 ${new Date(preview.bundleCreatedAt).toLocaleString("zh-CN")}`}
              {preview?.kind === "single" && " · 单个分包"}
            </p>
          )}

          {preview && (
            <>
              <h3 className="backup-subtitle">{SOUL_LABEL}</h3>
              {renderPackageList("soul", "import")}

              <h3 className="backup-subtitle">{SETTINGS_LABEL}</h3>
              {renderPackageList("settings", "import")}

              <button
                type="button"
                className="btn btn-primary"
                disabled={importing || selected.size === 0}
                onClick={handleImport}
                style={{ marginTop: 12 }}
              >
                {importing ? "导入中…" : `导入选中的 ${selected.size} 个包`}
              </button>
            </>
          )}
        </div>

        {info && info.snapshots.length > 0 && (
          <div className="card backup-section">
            <h2 style={{ marginTop: 0 }}>导入前快照</h2>
            <p className="hint">
              每次导入前系统会在电脑本地自动保存快照（位于 data/.backups/），最近几次如下：
            </p>
            <ul className="backup-snapshot-list">
              {info.snapshots.slice(0, 5).map((s) => (
                <li key={s.name} className="hint">
                  {s.name} · {new Date(s.createdAt).toLocaleString("zh-CN")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {message && <p className="hint backup-message">{message}</p>}
        {error && <p className="error backup-message">{error}</p>}
      </div>
    </AppShell>
  );
}

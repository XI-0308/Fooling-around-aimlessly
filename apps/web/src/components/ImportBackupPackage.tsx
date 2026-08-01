"use client";

import { useRef, useState } from "react";
import { apiFetch, fileToBase64 } from "@/lib/api";

type BackupPackageId =
  | "memory"
  | "worldinfo"
  | "chats"
  | "profile"
  | "api-connections"
  | "generation-system"
  | "decorate";

interface ImportBackupPackageProps {
  packageId: BackupPackageId;
  buttonLabel: string;
  hint?: string;
  /** 与相邻按钮并排，无说明文字与外框 */
  compact?: boolean;
  onSuccess?: (message: string) => void;
}

export default function ImportBackupPackage({
  packageId,
  buttonLabel,
  hint,
  compact = false,
  onSuccess,
}: ImportBackupPackageProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        "导入将覆盖当前对应类型的本地数据。系统会先自动保存快照。确定继续？"
      )
    ) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setLoading(true);
    setError("");
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await apiFetch<{ packageLabel: string; messages: string[] }>(
        "/backup/import-package",
        {
          method: "POST",
          body: JSON.stringify({ dataBase64, packageId, createSnapshot: true }),
        }
      );
      onSuccess?.(`✅ 已导入${res.packageLabel}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={`import-backup-block${compact ? " import-backup-inline" : ""}`}>
      {hint && !compact ? <p className="hint">{hint}</p> : null}
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={handleFile}
      />
      <button
        type="button"
        className={compact ? "btn btn-outline" : "btn btn-ghost"}
        disabled={loading}
        onClick={() => fileRef.current?.click()}
      >
        {loading ? "导入中…" : buttonLabel}
      </button>
      {error && <p className="error import-backup-error">{error}</p>}
    </div>
  );
}

import type { Request, Response } from "express";
import {
  IMPORT_ORDER_HINT,
  PACKAGE_DEFINITIONS,
} from "../backup/manifest.js";
import { pipeFullBackupToArchive } from "../backup/export.js";
import { getDataPresence, previewImport, runImport } from "../backup/import.js";
import { listSnapshots } from "../backup/snapshot.js";
import { createZipArchive } from "../backup/zipUtil.js";
import type { BackupPackageId } from "../backup/manifest.js";
import type { BrowserThemeSnapshot } from "../store/chatThemeStore.js";

export function getBackupInfoHandler(_req: Request, res: Response): void {
  res.json({
    importOrderHint: IMPORT_ORDER_HINT,
    packages: PACKAGE_DEFINITIONS,
    dataPresence: getDataPresence(),
    snapshots: listSnapshots(),
  });
}

export async function exportBackupHandler(req: Request, res: Response): Promise<void> {
  const body =
    req.method === "POST" && req.body && typeof req.body === "object"
      ? (req.body as { includeApiKeys?: boolean; browserTheme?: BrowserThemeSnapshot | null })
      : {};
  const includeApiKeys =
    req.query.includeApiKeys === "1" ||
    req.query.includeApiKeys === "true" ||
    body.includeApiKeys === true;
  const browserTheme = body.browserTheme ?? null;

  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `rp-agent-backup-${dateSlug}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

  const archive = createZipArchive();
  archive.on("error", (err: Error) => {
    console.error("[backup] export error", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "导出失败" });
    }
  });

  archive.pipe(res);

  try {
    await pipeFullBackupToArchive(archive, { includeApiKeys, browserTheme });
    await archive.finalize();
  } catch (err) {
    console.error("[backup] export error", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : "导出失败" });
    }
  }
}

export async function previewImportHandler(req: Request, res: Response): Promise<void> {
  const { dataBase64 } = req.body as { dataBase64?: string };
  if (!dataBase64) {
    res.status(400).json({ error: "缺少 dataBase64" });
    return;
  }

  try {
    const buffer = Buffer.from(dataBase64, "base64");
    const preview = await previewImport(buffer);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "无法解析备份文件" });
  }
}

export async function importPackageHandler(req: Request, res: Response): Promise<void> {
  const { dataBase64, packageId, createSnapshot } = req.body as {
    dataBase64?: string;
    packageId?: BackupPackageId;
    createSnapshot?: boolean;
  };

  if (!dataBase64) {
    res.status(400).json({ error: "缺少 dataBase64" });
    return;
  }
  if (!packageId) {
    res.status(400).json({ error: "缺少 packageId" });
    return;
  }

  const def = PACKAGE_DEFINITIONS.find((p) => p.id === packageId);
  if (!def) {
    res.status(400).json({ error: "未知备份包类型" });
    return;
  }

  try {
    const buffer = Buffer.from(dataBase64, "base64");
    const result = await runImport(buffer, [packageId], createSnapshot !== false);
    res.json({ ...result, packageLabel: def.label });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "导入失败" });
  }
}

export async function importBackupHandler(req: Request, res: Response): Promise<void> {
  const { dataBase64, packages, createSnapshot } = req.body as {
    dataBase64?: string;
    packages?: BackupPackageId[];
    createSnapshot?: boolean;
  };

  if (!dataBase64) {
    res.status(400).json({ error: "缺少 dataBase64" });
    return;
  }
  if (!packages?.length) {
    res.status(400).json({ error: "请至少选择一个要导入的包" });
    return;
  }

  try {
    const buffer = Buffer.from(dataBase64, "base64");
    const result = await runImport(buffer, packages, createSnapshot !== false);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "导入失败" });
  }
}

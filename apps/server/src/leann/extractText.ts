import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { readTextFile } from "../memory/store.js";
import { runLeannCli, parseLeannJsonLine } from "./client.js";

export interface ExtractDocumentResult {
  text: string;
  format: "txt" | "md" | "json" | "pdf";
  pageCount?: number;
  charCount: number;
}

const LEANN_SUPPORTED_EXT = new Set([".txt", ".md", ".json", ".pdf"]);

export function isLeannSupportedFilename(filename: string): boolean {
  return LEANN_SUPPORTED_EXT.has(path.extname(filename).toLowerCase());
}

export async function extractDocumentForLeann(
  buffer: Buffer,
  filename: string
): Promise<ExtractDocumentResult> {
  const ext = path.extname(filename).toLowerCase();
  if (!LEANN_SUPPORTED_EXT.has(ext)) {
    throw new Error(`LEANN 暂不支持 ${ext || "该格式"}，请使用 .txt / .md / .pdf`);
  }

  if (ext === ".txt" || ext === ".md" || ext === ".json") {
    const text = readTextFile(buffer, filename).trim();
    if (!text) throw new Error("文件内容为空");
    return {
      text,
      format: ext.slice(1) as ExtractDocumentResult["format"],
      charCount: text.length,
    };
  }

  const tmpDir = path.join(os.tmpdir(), "encore-flow-leann");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    const { code, stdout, stderr } = await runLeannCli(["extract", "--input", tmpPath], 600_000);
    const data = parseLeannJsonLine(stdout || "{}");
    if (code !== 0 || data.ok !== true) {
      const hint = String(data.error || stderr || "PDF 解析失败");
      if (hint.includes("fitz") || hint.includes("pymupdf")) {
        throw new Error(`${hint}。请执行：pip install pymupdf`);
      }
      throw new Error(hint);
    }

    const text = String(data.text || "").trim();
    if (!text) {
      throw new Error("未能从 PDF 提取文本（扫描版需 OCR，暂不支持）");
    }

    const pageCount = typeof data.pages === "number" ? data.pages : undefined;
    return {
      text,
      format: "pdf",
      pageCount,
      charCount: text.length,
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}

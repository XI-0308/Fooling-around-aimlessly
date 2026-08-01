import { spawn } from "child_process";
import path from "path";
import { ROOT_DIR, loadSettings } from "../config.js";
import type { LeannCollection } from "./collections.js";
import { chunkTextAt } from "./collections.js";

const CLI_PATH = path.join(ROOT_DIR, "leann-bridge", "cli.py");

export interface LeannProbeResult {
  ok: boolean;
  version?: string;
  error?: string;
  pdf?: boolean;
  pdfError?: string;
}

export interface LeannSearchHit {
  collectionId: string;
  collectionName: string;
  idx: number;
  text: string;
  score: number;
}

function getPythonPath(): string {
  const s = loadSettings();
  const configured = s.leannPythonPath?.trim();
  return configured || "python";
}

/** 国内常连不上 huggingface.co；未显式配置时走镜像，并把缓存放在项目内 */
function leannChildEnv(): NodeJS.ProcessEnv {
  const cacheDir = path.join(ROOT_DIR, ".venv-leann", "hf-cache");
  return {
    ...process.env,
    HF_ENDPOINT: process.env.HF_ENDPOINT || "https://hf-mirror.com",
    HUGGINGFACE_HUB_CACHE: process.env.HUGGINGFACE_HUB_CACHE || cacheDir,
    TRANSFORMERS_CACHE: process.env.TRANSFORMERS_CACHE || cacheDir,
    HF_HUB_DISABLE_TELEMETRY: process.env.HF_HUB_DISABLE_TELEMETRY || "1",
  };
}

function runCli(args: string[], timeoutMs = 600_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const python = getPythonPath();
    const child = spawn(python, [CLI_PATH, ...args], {
      cwd: ROOT_DIR,
      windowsHide: true,
      env: leannChildEnv(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf-8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf-8");
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`LEANN 命令超时（${timeoutMs / 1000}s）`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`无法启动 Python（${python}）：${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseJsonLine(stdout: string): Record<string, unknown> {
  const line = stdout.split("\n").filter(Boolean).pop() || stdout;
  return JSON.parse(line) as Record<string, unknown>;
}

export function parseLeannJsonLine(stdout: string): Record<string, unknown> {
  return parseJsonLine(stdout);
}

export function runLeannCli(
  args: string[],
  timeoutMs = 600_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runCli(args, timeoutMs);
}

export async function probeLeann(): Promise<LeannProbeResult> {
  try {
    const python = getPythonPath();
    const { code, stdout, stderr } = await runCli(["probe"], 120_000);
    const data = parseJsonLine(stdout || "{}");
    if (code !== 0 || data.ok !== true) {
      let error = String(data.error || stderr || "LEANN 不可用");
      if (
        /WindowsApps|was not found|No module named|无法启动 Python|Microsoft\\\\WindowsApps/i.test(
          error + python
        ) ||
        /python was not found|找不到/.test(error)
      ) {
        error =
          `${error}。当前 Python：${python}。请安装真实 Python，或在设置里把「LEANN Python 路径」指到含 leann 的解释器（本仓库可用 .venv-leann\\\\Scripts\\\\python.exe）。`;
      } else if (/No module named ['\"]leann['\"]/i.test(error)) {
        error = `${error}。请在该 Python 环境执行：pip install -r leann-bridge/requirements.txt`;
      }
      return { ok: false, error };
    }
    return {
      ok: true,
      version: String(data.version || "unknown"),
      pdf: data.pdf === true,
      pdfError: data.pdfError ? String(data.pdfError) : undefined,
    };
  } catch (err) {
    const python = getPythonPath();
    let error = err instanceof Error ? err.message : String(err);
    if (/无法启动 Python|ENOENT|WindowsApps/i.test(error)) {
      error =
        `${error}。当前 Python：${python}。Windows 商店版 python 不可用；请把路径改为项目内 .venv-leann\\\\Scripts\\\\python.exe`;
    }
    return { ok: false, error };
  }
}

export async function buildLeannIndex(collection: LeannCollection): Promise<void> {
  const settings = loadSettings();
  const args = ["build", "--index", collection.indexPath, "--chunks", collection.chunksPath];
  const mode = settings.leannEmbeddingMode?.trim();
  if (mode) args.push("--embedding-mode", mode);

  const { code, stdout, stderr } = await runCli(args, 1_800_000);
  const data = parseJsonLine(stdout || "{}");
    if (code !== 0 || data.ok !== true) {
      let error = String(data.error || stderr || "LEANN 建索引失败");
      if (/huggingface\.co|LocalEntryNotFoundError|couldn't connect/i.test(error + stderr)) {
        error =
          "无法从 HuggingFace 下载向量模型（网络超时）。已默认改用 hf-mirror；请再试一次「建成电子书」。若仍失败，可检查本机能否访问 https://hf-mirror.com";
      } else if (
        /FileIOWriter|could not open.*\.index|No such file or directory/i.test(error + stderr)
      ) {
        error =
          "LEANN/FAISS 无法写入索引文件（常见于路径含中文）。已改用 ProgramData 下的英文路径，请再试一次「建成电子书」。";
      }
      throw new Error(error);
    }
}

export async function searchLeannIndex(
  collection: LeannCollection,
  query: string,
  topK: number
): Promise<LeannSearchHit[]> {
  const { code, stdout, stderr } = await runCli(
    ["search", "--index", collection.indexPath, "--query", query, "--top-k", String(topK)],
    120_000
  );
  const data = parseJsonLine(stdout || "{}");
  if (code !== 0 || data.ok !== true) {
    throw new Error(String(data.error || stderr || "LEANN 检索失败"));
  }

  const hits = (data.hits as Array<{ idx?: number; text?: string; score?: number }>) || [];
  return hits.map((h) => {
    const idx = typeof h.idx === "number" ? h.idx : -1;
    const textFromFile = idx >= 0 ? chunkTextAt(collection, idx) : "";
    const text = (h.text?.trim() || textFromFile).trim();
    return {
      collectionId: collection.id,
      collectionName: collection.name,
      idx,
      text,
      score: Number(h.score ?? 0),
    };
  }).filter((h) => h.text.length > 0);
}

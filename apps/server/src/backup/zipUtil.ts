import { ZipArchive, type Archiver } from "archiver";
import fs from "fs";
import path from "path";
import { PassThrough } from "node:stream";
import unzipper from "unzipper";

export function createZipArchive(): Archiver {
  return new ZipArchive({ zlib: { level: 9 } });
}

export async function bufferFromArchive(
  build: (archive: Archiver) => void | Promise<void>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = createZipArchive();
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];

    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);
    archive.on("error", reject);

    archive.pipe(passthrough);

    Promise.resolve(build(archive))
      .then(() => archive.finalize())
      .catch(reject);
  });
}

export function appendDirIfExists(
  archive: Archiver,
  absDir: string,
  zipPrefix: string
): void {
  if (!fs.existsSync(absDir)) return;
  archive.directory(absDir, zipPrefix);
}

export function appendFileIfExists(
  archive: Archiver,
  absPath: string,
  zipName: string
): void {
  if (!fs.existsSync(absPath)) return;
  archive.file(absPath, { name: zipName });
}

export async function extractZipBuffer(buffer: Buffer, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  const directory = await unzipper.Open.buffer(buffer);
  await directory.extract({ path: destDir });
}

export async function readZipEntryText(buffer: Buffer, entryName: string): Promise<string | null> {
  const directory = await unzipper.Open.buffer(buffer);
  const entry = directory.files.find(
    (f) => f.path === entryName || f.path.endsWith(`/${entryName}`)
  );
  if (!entry) return null;
  return (await entry.buffer()).toString("utf-8");
}

export async function listZipEntries(buffer: Buffer): Promise<string[]> {
  const directory = await unzipper.Open.buffer(buffer);
  return directory.files.map((f) => f.path);
}

/** 递归复制目录，可排除子目录名 */
export function copyDirSync(
  src: string,
  dest: string,
  options?: { excludeDirNames?: string[] }
): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const exclude = new Set(options?.excludeDirNames ?? []);

  for (const name of fs.readdirSync(src)) {
    if (exclude.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) {
      copyDirSync(from, to, options);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/** 清空目录后写入（保留目录本身） */
export function replaceDirContents(src: string, dest: string): void {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  if (fs.existsSync(src)) {
    copyDirSync(src, dest);
  } else {
    fs.mkdirSync(dest, { recursive: true });
  }
}

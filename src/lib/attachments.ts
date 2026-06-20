import type { AttachmentKind, MessageAttachment } from "./types";

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift",
  "c", "h", "cpp", "hpp", "cs", "php",
  "css", "scss", "less", "html", "htm", "vue", "svelte",
  "json", "yaml", "yml", "toml", "xml", "md", "txt",
  "sql", "sh", "bash", "zsh", "fish",
  "dockerfile", "makefile", "env", "gitignore",
  "r", "lua", "pl", "ex", "exs", "erl", "hs", "zig", "dart",
]);

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_CODE_BYTES = 512 * 1024;
const MAX_ATTACHMENTS = 8;

export const ACCEPTED_FILE_TYPES =
  "image/*,.pdf,text/*,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cs,.php,.css,.scss,.less,.html,.htm,.vue,.svelte,.json,.yaml,.yml,.toml,.xml,.md,.txt,.sql,.sh,.bash,.zsh,.dockerfile,.env,.gitignore,.r,.lua,.pl,.ex,.exs,.erl,.hs,.zig,.dart";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function extension(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot === -1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function detectAttachmentKind(file: File): AttachmentKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || extension(file.name) === "pdf") return "pdf";
  if (file.type.startsWith("text/")) return "code";
  if (CODE_EXTENSIONS.has(extension(file.name))) return "code";
  return null;
}

export function canAddMore(count: number): boolean {
  return count < MAX_ATTACHMENTS;
}

export async function readTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`File is too large (max ${Math.round(maxBytes / 1024)} KB).`);
  }
  return file.text();
}

export async function compressImage(
  file: File,
  {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    maxBytes = 1_500_000,
  } = {},
): Promise<{ dataUrl: string; mimeType: string }> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large (max 20 MB).");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);

  while (dataUrl.length > maxBytes * 1.37 && q > 0.45) {
    q -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }

  return { dataUrl, mimeType: "image/jpeg" };
}

export async function extractPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF is too large (max 10 MB).");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(text);
  }

  const combined = pages.join("\n\n").trim();
  if (!combined) {
    throw new Error("No text found in PDF. Scanned PDFs may not be supported.");
  }
  return combined;
}

export async function fileToAttachment(
  file: File,
  onCompressing?: () => void,
): Promise<MessageAttachment> {
  const kind = detectAttachmentKind(file);
  if (!kind) {
    throw new Error("Unsupported file type.");
  }

  const base = {
    id: makeId(),
    kind,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
  };

  if (kind === "image") {
    onCompressing?.();
    const { dataUrl, mimeType } = await compressImage(file);
    return { ...base, mimeType, dataUrl };
  }

  if (kind === "pdf") {
    const textContent = await extractPdfText(file);
    return { ...base, textContent };
  }

  const textContent = await readTextFile(file, MAX_CODE_BYTES);
  return { ...base, textContent };
}

export function filesFromClipboard(
  clipboard: DataTransfer | null,
): File[] {
  if (!clipboard) return [];
  const files: File[] = [];
  for (const item of Array.from(clipboard.items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

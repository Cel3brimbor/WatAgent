//copies the onnx runtime wasm and the paddleocr pp-ocrv4 models into public/.
//the weights are apache-2.0 paddleocr, pinned from @gutenye/ocr-models@1.4.2.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ortSrc = path.join(root, "node_modules/onnxruntime-web/dist");
const dictSrc = path.join(root, "node_modules/@gutenye/ocr-models/assets/ppocr_keys_v1.txt");
const MODEL_BASE = "https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets/";

const WASM = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
const MODELS = {
  "ch_PP-OCRv4_det_infer.onnx": "30a86f5731181461d08021402766601e4302a9b9b9666be8aff402696339cdff",
  "ch_PP-OCRv4_rec_infer.onnx": "06b3e6af6c59a1ba5d53790ed8c2e4b2de389870b6cf5a97f349f3412cb269c0",
  "ppocr_keys_v1.txt": "28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7",
};

async function sha256(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function sameBytes(from, to) {
  if (!existsSync(to)) return false;
  return (await sha256(from)) === (await sha256(to));
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`ocr asset download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  if (!existsSync(ortSrc)) throw new Error("onnxruntime-web is not installed");
  const ortDir = path.join(root, "public/ort");
  const ocrDir = path.join(root, "public/ocr");
  await mkdir(ortDir, { recursive: true });
  await mkdir(ocrDir, { recursive: true });
  for (const name of WASM) {
    const from = path.join(ortSrc, name);
    const to = path.join(ortDir, name);
    if (!existsSync(from)) throw new Error(`missing ${name}`);
    if (!(await sameBytes(from, to))) await copyFile(from, to);
  }
  const dictDest = path.join(ocrDir, "ppocr_keys_v1.txt");
  if (!existsSync(dictSrc)) throw new Error("missing ppocr dictionary");
  if (!(await sameBytes(dictSrc, dictDest))) await copyFile(dictSrc, dictDest);
  for (const [name, sum] of Object.entries(MODELS)) {
    const dest = path.join(ocrDir, name);
    if (existsSync(dest) && (await sha256(dest)) === sum) continue;
    if (name.endsWith(".txt")) throw new Error("ppocr dictionary hash mismatch");
    await download(`${MODEL_BASE}${name}`, dest);
    if ((await sha256(dest)) !== sum) throw new Error(`ocr model hash mismatch for ${name}`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "ocr assets failed"}\n`);
  process.exitCode = 1;
});

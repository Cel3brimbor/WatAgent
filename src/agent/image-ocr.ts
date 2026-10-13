"use client";

//paddleocr pp-ocrv4 runs here. llama prompt guard cannot read pixels, so the model only receives this text.
import { CHAT_IMAGE_MEDIA, MAX_CHAT_IMAGE_B64, MAX_CHAT_IMAGE_TEXT, type ChatImage } from "@/agent/chat-image";

const READ_ERROR = "That image couldn't be read.";
const NO_TEXT = "(no text)";
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type Engine = {
  detect: (image: string) => Promise<{ texts: Array<{ text?: string }> }>;
};

let loading: Promise<Engine> | null = null;

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}

function publicUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

function clipCover(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = Math.min(1_200, Math.floor(max / 3));
  const head = max - tail - 1;
  return `${text.slice(0, head)}\n${text.slice(text.length - tail)}`;
}

function cleanLine(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
}

async function startEngine(): Promise<Engine> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = publicUrl("/ort/");
  const { default: Ocr } = await import("@gutenye/ocr-browser");
  return Ocr.create({
    models: {
      detectionPath: publicUrl("/ocr/ch_PP-OCRv4_det_infer.onnx"),
      recognitionPath: publicUrl("/ocr/ch_PP-OCRv4_rec_infer.onnx"),
      dictionaryPath: publicUrl("/ocr/ppocr_keys_v1.txt"),
    },
    onnxOptions: { executionProviders: ["wasm"] },
  });
}

function engine(): Promise<Engine> {
  if (!loading) {
    loading = startEngine().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

async function readOne(ocr: Engine, image: ChatImage, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError(signal);
  if (!CHAT_IMAGE_MEDIA.includes(image.mediaType) || !BASE64.test(image.data) || image.data.length > MAX_CHAT_IMAGE_B64) {
    throw new Error(READ_ERROR);
  }
  const result = await ocr.detect(`data:${image.mediaType};base64,${image.data}`);
  if (signal?.aborted) throw abortError(signal);
  return result.texts.map((line) => cleanLine(line.text ?? "")).filter(Boolean).join("\n");
}

export async function readChatImageText(images: ChatImage[], signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError(signal);
  let ocr: Engine;
  try {
    ocr = await engine();
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw err instanceof Error ? err : abortError(signal as AbortSignal);
    }
    throw new Error(READ_ERROR);
  }
  const parts: string[] = [];
  try {
    for (const image of images.slice(0, 4)) {
      const text = await readOne(ocr, image, signal);
      if (text) parts.push(text);
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw err instanceof Error ? err : abortError(signal as AbortSignal);
    }
    if (err instanceof Error && err.message === READ_ERROR) throw err;
    throw new Error(READ_ERROR);
  }
  const joined = clipCover(parts.join("\n\n"), MAX_CHAT_IMAGE_TEXT);
  return joined || NO_TEXT;
}

export async function withImageTranscripts<T extends { role: string; images?: ChatImage[]; imageText?: string }>(
  messages: T[],
  signal?: AbortSignal,
): Promise<T[]> {
  const next: T[] = [];
  for (const message of messages) {
    if (signal?.aborted) throw abortError(signal);
    if (message.role === "user" && (message.images?.length ?? 0) > 0 && !message.imageText?.trim()) {
      next.push({ ...message, imageText: await readChatImageText(message.images ?? [], signal) });
    } else {
      next.push(message);
    }
  }
  return next;
}

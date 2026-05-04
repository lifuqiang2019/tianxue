import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
const QUERY_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";
const DEFAULT_RESOURCE_ID = "volc.seedasr.auc";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.DOUBAO_ASR_API_KEY;
    const appId = process.env.DOUBAO_ASR_APP_ID;
    const accessToken = process.env.DOUBAO_ASR_ACCESS_TOKEN;
    const resourceId = process.env.DOUBAO_ASR_RESOURCE_ID ?? DEFAULT_RESOURCE_ID;

    if (!apiKey && (!appId || !accessToken)) {
      return NextResponse.json(
        {
          error:
            "Missing ASR auth. Set DOUBAO_ASR_API_KEY or DOUBAO_ASR_APP_ID + DOUBAO_ASR_ACCESS_TOKEN. (DOUBAO_API_KEY is not used for ASR)",
        },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const audioUrl = String(form.get("audioUrl") ?? "").trim();

    if (!file && !audioUrl) {
      return NextResponse.json({ error: "file or audioUrl is required" }, { status: 400 });
    }

    let audioData: { url?: string; data?: string; format: string };

    if (file instanceof File) {
      const bytes = Buffer.from(await file.arrayBuffer());
      audioData = {
        data: bytes.toString("base64"),
        format: extToFormat(file.name) || "mp3",
      };
    } else {
      const parsedUrl = safeHttpUrl(audioUrl);
      if (!parsedUrl) {
        return NextResponse.json({ error: "audioUrl must be a valid http/https URL" }, { status: 400 });
      }

      audioData = {
        url: parsedUrl,
        format: extToFormat(parsedUrl) || "mp3",
      };
    }

    const requestId = randomUUID();
    const commonHeaders = buildHeaders({ apiKey, appId, accessToken, resourceId, requestId });

    const submitBody = {
      user: { uid: "tianxue-web" },
      audio: audioData,
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
      },
    };

    const submitResp = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify(submitBody),
    });

    const submitRaw = await submitResp.text();
    const submitJson = tryJson(submitRaw);
    const submitStatusCode = submitResp.headers.get("X-Api-Status-Code") ?? "";

    if (!submitResp.ok || submitJson?.error || (submitStatusCode && submitStatusCode !== "20000000")) {
      return NextResponse.json(
        {
          error: `ASR submit failed: HTTP ${submitResp.status}, X-Api-Status-Code=${submitStatusCode || "N/A"}. Response: ${submitRaw.slice(0, 1200)}`,
        },
        { status: 400 },
      );
    }

    const taskId =
      getPath(submitJson, "id") ??
      getPath(submitJson, "task_id") ??
      getPath(submitJson, "data.id") ??
      getPath(submitJson, "result.id") ??
      requestId;

    if (!taskId) {
      return NextResponse.json(
        {
          error: `ASR submit succeeded but task id missing. Response: ${submitRaw.slice(0, 1200)}`,
        },
        { status: 400 },
      );
    }

    const text = await pollAsrResult({
      taskId: String(taskId),
      headers: commonHeaders,
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pollAsrResult(params: { taskId: string; headers: HeadersInit }) {
  for (let i = 0; i < 24; i += 1) {
    await delay(1000);

    const queryResp = await fetch(QUERY_URL, {
      method: "POST",
      headers: params.headers,
      body: JSON.stringify({ id: params.taskId }),
    });

    const raw = await queryResp.text();
    const json = tryJson(raw);

    if (!queryResp.ok) {
      throw new Error(`ASR query failed: HTTP ${queryResp.status}. Response: ${raw.slice(0, 1000)}`);
    }

    const status = String(getPath(json, "status") ?? getPath(json, "data.status") ?? "").toLowerCase();
    const text =
      String(getPath(json, "text") ?? "") ||
      String(getPath(json, "result.text") ?? "") ||
      String(getPath(json, "data.text") ?? "") ||
      String(getPath(json, "data.result.text") ?? "") ||
      readUtterances(json) ||
      "";

    if (text && (status.includes("success") || status.includes("finished") || status === "")) {
      return text;
    }

    if (status.includes("failed") || status.includes("error")) {
      throw new Error(`ASR task failed. Response: ${raw.slice(0, 1000)}`);
    }

    const finishedFlag = getPath(json, "done") ?? getPath(json, "is_done") ?? getPath(json, "completed");
    if (finishedFlag && text) {
      return text;
    }
  }

  throw new Error("ASR query timeout. Please retry.");
}

function buildHeaders(params: {
  apiKey?: string;
  appId?: string;
  accessToken?: string;
  resourceId: string;
  requestId: string;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": params.resourceId,
    "X-Api-Request-Id": params.requestId,
    "X-Api-Sequence": "-1",
  };

  if (params.apiKey) {
    headers["X-Api-Key"] = params.apiKey;
  } else if (params.appId && params.accessToken) {
    headers["X-Api-App-Key"] = params.appId;
    headers["X-Api-Access-Key"] = params.accessToken;
  }

  return headers;
}

function tryJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getPath(input: unknown, path: string): unknown {
  if (!input || typeof input !== "object") return undefined;
  const keys = path.split(".");
  let current: unknown = input;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readUtterances(input: unknown): string {
  const list = getPath(input, "data.utterances");
  if (!Array.isArray(list)) return "";
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      return String((item as Record<string, unknown>).text ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

function safeHttpUrl(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function extToFormat(nameOrUrl: string) {
  const lowered = nameOrUrl.toLowerCase();
  if (lowered.endsWith(".wav")) return "wav";
  if (lowered.endsWith(".pcm")) return "pcm";
  if (lowered.endsWith(".m4a")) return "m4a";
  if (lowered.endsWith(".aac")) return "aac";
  if (lowered.endsWith(".ogg")) return "ogg";
  if (lowered.endsWith(".flac")) return "flac";
  if (lowered.endsWith(".mp3")) return "mp3";
  return "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

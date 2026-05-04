import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.DOUBAO_API_KEY;
    const model = process.env.DOUBAO_ASR_MODEL;
    const baseUrl = process.env.DOUBAO_BASE_URL ?? DEFAULT_BASE_URL;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing DOUBAO_API_KEY" }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: "Missing DOUBAO_ASR_MODEL" }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const audioUrl = String(form.get("audioUrl") ?? "").trim();

    if (!file && !audioUrl) {
      return NextResponse.json({ error: "file or audioUrl is required" }, { status: 400 });
    }

    const asrForm = new FormData();
    asrForm.set("model", model);

    if (file instanceof File) {
      asrForm.set("file", file, file.name || "audio.wav");
    } else {
      const parsedUrl = safeHttpUrl(audioUrl);
      if (!parsedUrl) {
        return NextResponse.json({ error: "audioUrl must be a valid http/https URL" }, { status: 400 });
      }

      const sourceResp = await fetch(parsedUrl);
      if (!sourceResp.ok) {
        return NextResponse.json(
          { error: `Failed to download audioUrl: ${sourceResp.status}` },
          { status: 400 },
        );
      }

      const contentType = sourceResp.headers.get("content-type") ?? "application/octet-stream";
      const bytes = await sourceResp.arrayBuffer();
      const urlFile = new File([bytes], guessFileName(parsedUrl), { type: contentType });
      asrForm.set("file", urlFile, urlFile.name);
    }

    const resp = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: asrForm,
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `ASR API error: ${resp.status}. Response: ${raw.slice(0, 800)}` },
        { status: 400 },
      );
    }

    const text = extractText(raw);
    if (!text) {
      return NextResponse.json({ error: "ASR returned empty text", raw: raw.slice(0, 800) }, { status: 400 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractText(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { text?: string; transcription?: string; result?: string };
    return parsed.text ?? parsed.transcription ?? parsed.result ?? "";
  } catch {
    return raw.trim();
  }
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

function guessFileName(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").filter(Boolean).pop();
    return name || "audio.wav";
  } catch {
    return "audio.wav";
  }
}

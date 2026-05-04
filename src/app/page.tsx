"use client";

import { FormEvent, useMemo, useState } from "react";

type TaskStatus = "pending" | "processing" | "done" | "failed";

type TaskResponse = {
  taskId: string;
  status: TaskStatus;
  answers?: AnswerItem[];
  error?: string | null;
};

type AnswerItem = {
  questionId: number;
  answer: string;
  confidence: number;
  evidence: string;
};

type ParsedResponse<T> = {
  data: T | null;
  raw: string;
  isJson: boolean;
};

export default function Home() {
  const [questionText, setQuestionText] = useState("1. What does the girl want to buy?\nA. A book\nB. A bike\nC. A pen");
  const [transcript, setTranscript] = useState(
    "Girl: I need a new bike for school. Boy: You can get one at the store downtown.",
  );
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState<TaskStatus | "idle">("idle");
  const [result, setResult] = useState<AnswerItem[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [asrLoading, setAsrLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const canSubmit = useMemo(() => questionText.trim() && transcript.trim(), [questionText, transcript]);
  const extractedAnswers = useMemo(
    () => (result ?? []).map((item) => `Q${item.questionId}: ${item.answer}`),
    [result],
  );

  async function submitTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.set("questionText", questionText);
      formData.set("transcript", transcript);

      const resp = await fetch("/api/tasks", {
        method: "POST",
        body: formData,
      });
      const { data, raw, isJson } = await parseResponseBody<TaskResponse>(resp);
      if (!resp.ok) {
        throw new Error(
          data?.error ||
            formatUnexpectedApiResponse("Failed to create task", resp.status, raw, isJson),
        );
      }
      if (!data) throw new Error(formatUnexpectedApiResponse("Invalid task response", resp.status, raw, false));

      setTaskId(data.taskId);
      setStatus(data.status);
      if (data.status === "done") {
        setResult(data.answers ?? []);
      } else if (data.status === "failed") {
        throw new Error(data.error || "Task failed");
      } else {
        throw new Error("Unexpected task status");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setStatus("failed");
    } finally {
      setLoading(false);
    }
  }

  async function runAsr() {
    if (!audioFile && !audioUrl.trim()) {
      setError("Please choose an audio file or input an audio URL first.");
      return;
    }

    setAsrLoading(true);
    setError("");
    try {
      const formData = new FormData();
      if (audioFile) {
        formData.set("file", audioFile);
      } else if (audioUrl.trim()) {
        try {
          const downloadedFile = await downloadAudioFromUrl(audioUrl.trim());
          formData.set("file", downloadedFile);
          setAudioFile(downloadedFile);
        } catch {
          // Fallback path when browser-side download is blocked by CORS or network policy.
          formData.set("audioUrl", audioUrl.trim());
        }
      }

      const resp = await fetch("/api/asr", {
        method: "POST",
        body: formData,
      });
      const { data, raw, isJson } = await parseResponseBody<{ text?: string; error?: string }>(resp);
      if (!resp.ok) {
        throw new Error(
          data?.error || formatUnexpectedApiResponse("ASR request failed", resp.status, raw, isJson),
        );
      }
      if (!data) throw new Error(formatUnexpectedApiResponse("Invalid ASR response", resp.status, raw, false));

      setTranscript(data.text ?? "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setAsrLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">听力助手</h1>

      <form className="flex flex-col gap-4" onSubmit={submitTask}>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">题目文本</span>
          <textarea
            className="min-h-40 rounded border p-3"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">听力转写文本（ASR结果）</span>
          <textarea
            className="min-h-40 rounded border p-3"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </label>

        <section className="rounded border p-4">
          <p className="mb-3 text-sm font-medium">语音识别（上传文件或音频链接）</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label
                htmlFor="audio-file-input"
                className="inline-flex cursor-pointer items-center rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                选择音频文件
              </label>
              <span className="text-sm text-zinc-600">
                {audioFile ? audioFile.name : "未选择文件"}
              </span>
            </div>
            <input
              id="audio-file-input"
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
            <input
              className="rounded border p-2"
              placeholder="请输入音频URL，例如：https://example.com/audio.mp3"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
            />
            <button
              className="w-fit rounded bg-zinc-800 px-4 py-2 text-white disabled:opacity-50"
              type="button"
              onClick={runAsr}
              disabled={asrLoading}
            >
              {asrLoading ? "识别中..." : "开始ASR并填入转写文本"}
            </button>
          </div>
        </section>

        <button
          className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={!canSubmit || loading}
        >
          {loading ? "处理中..." : "开始答题"}
        </button>
      </form>

      <section className="rounded border p-4">
        <p>任务ID：{taskId || "-"}</p>
        <p>状态：{status}</p>
        {error ? <p className="text-red-600">错误：{error}</p> : null}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-2 text-lg font-medium">结果</h2>
        <div className="mb-3 rounded bg-zinc-50 p-3">
          <p className="mb-2 text-sm font-medium">答案提取（answer）</p>
          {extractedAnswers.length ? (
            <div className="space-y-1 text-sm">
              {extractedAnswers.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">暂无答案</p>
          )}
        </div>
        <p className="mb-2 text-sm font-medium">原始结果</p>
        <pre className="overflow-auto text-sm">{JSON.stringify(result, null, 2)}</pre>
      </section>
    </main>
  );
}

async function parseResponseBody<T>(resp: Response): Promise<ParsedResponse<T>> {
  const raw = await resp.text();
  if (!raw) return { data: null, raw: "", isJson: false };
  try {
    return { data: JSON.parse(raw) as T, raw, isJson: true };
  } catch {
    return { data: null, raw, isJson: false };
  }
}

function formatUnexpectedApiResponse(prefix: string, status: number, raw: string, isJson: boolean) {
  if (isJson) return `${prefix} (HTTP ${status})`;
  const snippet = sanitizeSnippet(raw);
  return `${prefix} (HTTP ${status}). Server returned non-JSON response: ${snippet}`;
}

function sanitizeSnippet(raw: string) {
  const collapsed = raw.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!collapsed) return "<empty>";
  return collapsed;
}

async function downloadAudioFromUrl(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Browser download failed: HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  if (!blob.size) {
    throw new Error("Browser download failed: empty file");
  }

  const fileName = inferFileNameFromUrl(url);
  const mime = blob.type || "audio/mpeg";
  return new File([blob], fileName, { type: mime });
}

function inferFileNameFromUrl(url: string) {
  try {
    const u = new URL(url);
    const name = u.pathname.split("/").filter(Boolean).pop();
    if (name) return decodeURIComponent(name);
    return "audio-from-url.mp3";
  } catch {
    return "audio-from-url.mp3";
  }
}

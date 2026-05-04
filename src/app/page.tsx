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

      const data = (await resp.json()) as TaskResponse;
      if (!resp.ok) {
        throw new Error(data.error || "Failed to create task");
      }

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
      if (audioFile) formData.set("file", audioFile);
      if (audioUrl.trim()) formData.set("audioUrl", audioUrl.trim());

      const resp = await fetch("/api/asr", {
        method: "POST",
        body: formData,
      });
      const data = (await resp.json()) as { text?: string; error?: string };
      if (!resp.ok) {
        throw new Error(data.error || "ASR request failed");
      }

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
      <h1 className="text-2xl font-semibold">天学网听力助手</h1>

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
        <pre className="overflow-auto text-sm">{JSON.stringify(result, null, 2)}</pre>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";

type TaskStatus = "pending" | "processing" | "done" | "failed";

type TaskResponse = {
  taskId: string;
  status: TaskStatus;
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

      const data = (await resp.json()) as TaskResponse & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || "Failed to create task");
      }

      setTaskId(data.taskId);
      setStatus(data.status);
      await pollStatus(data.taskId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setStatus("failed");
    } finally {
      setLoading(false);
    }
  }

  async function pollStatus(id: string) {
    for (let i = 0; i < 30; i += 1) {
      await delay(1000);
      const resp = await fetch(`/api/tasks/${id}`);
      const data = (await resp.json()) as {
        status: TaskStatus;
        error?: string;
      };

      if (!resp.ok) {
        throw new Error(data.error || "Failed to query task status");
      }

      setStatus(data.status);

      if (data.status === "done") {
        const resultResp = await fetch(`/api/tasks/${id}/result`);
        const resultData = (await resultResp.json()) as {
          answers?: AnswerItem[];
          error?: string;
        };

        if (!resultResp.ok) {
          throw new Error(resultData.error || "Failed to query result");
        }

        setResult(resultData.answers ?? []);
        return;
      }

      if (data.status === "failed") {
        throw new Error(data.error || "Task failed");
      }
    }

    throw new Error("Polling timeout");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Tianxue Listening Assistant (MVP)</h1>

      <form className="flex flex-col gap-4" onSubmit={submitTask}>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Question Text</span>
          <textarea
            className="min-h-40 rounded border p-3"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Transcript Text (ASR output)</span>
          <textarea
            className="min-h-40 rounded border p-3"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </label>

        <button
          className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          type="submit"
          disabled={!canSubmit || loading}
        >
          {loading ? "Running..." : "Create Task"}
        </button>
      </form>

      <section className="rounded border p-4">
        <p>Task ID: {taskId || "-"}</p>
        <p>Status: {status}</p>
        {error ? <p className="text-red-600">Error: {error}</p> : null}
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-2 text-lg font-medium">Result</h2>
        <pre className="overflow-auto text-sm">{JSON.stringify(result, null, 2)}</pre>
      </section>
    </main>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

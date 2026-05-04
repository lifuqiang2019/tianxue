import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getTaskStore, TaskRecord } from "@/lib/task-store";
import { runTask } from "@/lib/task-runner";

export async function POST(request: Request) {
  const form = await request.formData();
  const questionText = String(form.get("questionText") ?? "").trim();
  const transcript = String(form.get("transcript") ?? "").trim();

  if (!questionText) {
    return NextResponse.json({ error: "questionText is required" }, { status: 400 });
  }

  if (!transcript) {
    return NextResponse.json({ error: "transcript is required for MVP" }, { status: 400 });
  }

  const task: TaskRecord = {
    id: randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questionText,
    transcript,
    result: [],
  };

  const store = getTaskStore();
  store.set(task.id, task);

  void runTask(task.id);

  return NextResponse.json({ taskId: task.id, status: task.status });
}

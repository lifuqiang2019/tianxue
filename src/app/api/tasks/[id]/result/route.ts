import { NextResponse } from "next/server";

import { getTaskStore } from "@/lib/task-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const task = getTaskStore().get(id);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "done") {
    return NextResponse.json(
      { error: `Task is ${task.status}, result not ready` },
      { status: 409 },
    );
  }

  return NextResponse.json({
    taskId: task.id,
    answers: task.result,
  });
}

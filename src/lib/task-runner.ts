import { getTaskStore, parseChoiceQuestions, TaskRecord } from "@/lib/task-store";
import { solveWithDoubao } from "@/lib/doubao";

export async function runTask(taskId: string) {
  const store = getTaskStore();
  const task = store.get(taskId);
  if (!task) return;

  patchTask(task, { status: "processing" });

  try {
    const questions = parseChoiceQuestions(task.questionText);
    if (questions.length === 0) {
      throw new Error("No valid choice questions found in question text");
    }

    const answers = await solveWithDoubao({
      transcript: task.transcript,
      questions,
    });

    patchTask(task, {
      status: "done",
      result: answers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    patchTask(task, {
      status: "failed",
      error: message,
    });
  }
}

function patchTask(task: TaskRecord, patch: Partial<TaskRecord>) {
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
}

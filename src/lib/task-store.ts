export type TaskStatus = "pending" | "processing" | "done" | "failed";

export type ChoiceQuestion = {
  questionId: number;
  stem: string;
  options: string[];
};

export type AnswerItem = {
  questionId: number;
  answer: string;
  confidence: number;
  evidence: string;
};

export type TaskRecord = {
  id: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  questionText: string;
  transcript: string;
  result: AnswerItem[];
  error?: string;
};

type Store = Map<string, TaskRecord>;

declare global {
  var __tianxueTaskStore: Store | undefined;
}

const taskStore: Store = globalThis.__tianxueTaskStore ?? new Map<string, TaskRecord>();
globalThis.__tianxueTaskStore = taskStore;

export function getTaskStore() {
  return taskStore;
}

export function parseChoiceQuestions(raw: string): ChoiceQuestion[] {
  const blocks = raw
    .split(/\n\s*\n/g)
    .map((v) => v.trim())
    .filter(Boolean);

  const parsed = blocks
    .map((block, idx) => {
      const lines = block
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
      if (lines.length < 2) return null;

      const stem = lines[0].replace(/^\d+[\.、]\s*/, "");
      const options = lines
        .slice(1)
        .map((line) => line.replace(/^[A-D][\.、]\s*/i, "").trim())
        .filter(Boolean);

      if (options.length < 2) return null;

      return {
        questionId: idx + 1,
        stem,
        options,
      };
    })
    .filter((v): v is ChoiceQuestion => v !== null);

  return parsed;
}

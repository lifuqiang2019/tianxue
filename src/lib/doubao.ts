import { AnswerItem, ChoiceQuestion } from "@/lib/task-store";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function solveWithDoubao(params: {
  transcript: string;
  questions: ChoiceQuestion[];
}): Promise<AnswerItem[]> {
  const apiKey = process.env.DOUBAO_API_KEY;
  const model = process.env.DOUBAO_MODEL;
  const baseUrl = process.env.DOUBAO_BASE_URL ?? DEFAULT_BASE_URL;

  if (!apiKey || !model) {
    return params.questions.map((q) => ({
      questionId: q.questionId,
      answer: "A",
      confidence: 0.3,
      evidence: "Missing DOUBAO_API_KEY/DOUBAO_MODEL, fallback answer used.",
    }));
  }

  const systemPrompt = [
    "You are an English listening exam assistant.",
    "Return strict JSON only.",
    "Schema: {\"answers\":[{\"questionId\": number, \"answer\": \"A\"|\"B\"|\"C\"|\"D\", \"confidence\": number, \"evidence\": string}]}",
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      transcript: params.transcript,
      questions: params.questions,
    },
    null,
    2,
  );

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    const detail = raw.slice(0, 500);
    if (response.status === 404) {
      throw new Error(
        `Doubao API 404. Usually DOUBAO_MODEL is not a valid endpoint/model id for your account. Response: ${detail}`,
      );
    }
    throw new Error(`Doubao API error: ${response.status}. Response: ${detail}`);
  }

  const data = (await response.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Doubao returned empty content");
  }

  let parsed: { answers?: AnswerItem[] };
  try {
    parsed = JSON.parse(content) as { answers?: AnswerItem[] };
  } catch {
    throw new Error("Doubao content is not valid JSON");
  }

  const normalized = (parsed.answers ?? []).map((item) => ({
    questionId: Number(item.questionId),
    answer: normalizeAnswer(item.answer),
    confidence: clampConfidence(item.confidence),
    evidence: item.evidence || "",
  }));

  return normalized;
}

function normalizeAnswer(answer: string) {
  const v = (answer ?? "").toUpperCase().trim();
  if (["A", "B", "C", "D"].includes(v)) return v;
  return "A";
}

function clampConfidence(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

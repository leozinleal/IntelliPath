// =============================================================
// Edge Function: generate-quiz
// Recebe { topic, description, trail } -> pede ao Gemini 5 perguntas
// de múltipla escolha sobre o tópico -> devolve em JSON.
// Usa a mesma chave GEMINI_API_KEY do generate-roadmap.
// =============================================================

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
// Modelo reserva, usado só quando o principal está sobrecarregado (erro 503)
const GEMINI_FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "gemini-flash-latest";

const QUESTION_COUNT = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Erro com mensagem amigável para mostrar ao aluno (vai direto para a tela)
class FriendlyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_STATUS = [429, 500, 502, 503, 504];

// Chama o Gemini; em sobrecarga tenta de novo algumas vezes (1s, depois 2s)
async function callGemini(model: string, body: unknown, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) return await res.json();

    const detail = await res.text();
    console.error(`Gemini (${model}) tentativa ${i}/${attempts} falhou: ${res.status} ${detail}`);
    if (!RETRY_STATUS.includes(res.status)) throw new Error(`Gemini ${res.status}: ${detail}`);
    if (i < attempts) await sleep(1000 * 2 ** (i - 1));
  }
  return null;
}

type Question = { question: string; options: string[]; correct_index: number; explanation: string };

// Embaralha as alternativas (a IA costuma colocar a certa sempre na mesma letra)
function shuffleOptions(q: Question): Question {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correct_index: order.indexOf(q.correct_index),
  };
}

// Confere se a pergunta veio no formato certo
function isValid(q: Question) {
  return (
    typeof q?.question === "string" && q.question.trim() &&
    Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((o) => typeof o === "string" && o.trim()) &&
    Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3
  );
}

async function generateQuiz(topic: string, description: string, trail: string): Promise<Question[]> {
  const prompt = `Você é um professor criando uma atividade de fixação para um aluno iniciante.
Trilha de estudos: "${trail}".
Tópico: "${topic}".
${description ? `O que o aluno estudou: ${description}` : ""}
Crie ${QUESTION_COUNT} perguntas de múltipla escolha sobre ESSE tópico.
Regras:
- Tudo em português do Brasil.
- Cada pergunta tem exatamente 4 alternativas curtas e só UMA correta.
- As alternativas erradas devem ser plausíveis (erros comuns de iniciante), nada absurdo.
- Varie a dificuldade: comece fácil e termine com uma pergunta que exija raciocínio.
- "correct_index": posição da alternativa correta (0, 1, 2 ou 3).
- "explanation": 1 ou 2 frases explicando por que a resposta certa está certa.
- Se o tópico for perigoso, ilegal ou impróprio, responda exatamente: {"refused": true}
Responda SOMENTE com JSON neste formato:
{"questions": [{"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "explanation": "..."}]}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
  };

  let data = await callGemini(GEMINI_MODEL, body);
  if (!data && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    console.warn(`Modelo ${GEMINI_MODEL} sobrecarregado, usando reserva ${GEMINI_FALLBACK_MODEL}`);
    data = await callGemini(GEMINI_FALLBACK_MODEL, body, 2);
  }
  if (!data) {
    throw new FriendlyError("A IA está com muitos acessos agora. Aguarde alguns segundos e tente de novo.", 503);
  }

  const candidate = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(candidate?.finishReason)) {
    throw new FriendlyError(REFUSED_MSG, 422);
  }

  const text: string = (candidate?.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error("Resposta do Gemini não é JSON:", clean.slice(0, 300));
    throw new FriendlyError(REFUSED_MSG, 422);
  }
  if (parsed?.refused) throw new FriendlyError(REFUSED_MSG, 422);

  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .filter(isValid)
    .slice(0, QUESTION_COUNT)
    .map((q: Question) => shuffleOptions({ ...q, explanation: q.explanation ?? "" }));

  // Se a IA mandou poucas perguntas válidas, melhor pedir de novo do que mostrar um quiz pela metade
  if (questions.length < 3) {
    throw new FriendlyError("Não foi possível montar a atividade agora. Tente gerar de novo.", 502);
  }
  return questions;
}

const REFUSED_MSG = "Não foi possível criar uma atividade para esse tópico.";

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return json({ error: "Configure o secret GEMINI_API_KEY no Supabase." }, 500);
    }

    const { topic, description = "", trail = "" } = await req.json();
    if (!topic || typeof topic !== "string") {
      return json({ error: "Tópico inválido." }, 400);
    }

    const questions = await generateQuiz(topic.trim(), String(description), String(trail));
    return json({ questions });
  } catch (err) {
    if (err instanceof FriendlyError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Ocorreu um erro ao gerar a atividade. Tente novamente em instantes." }, 500);
  }
});

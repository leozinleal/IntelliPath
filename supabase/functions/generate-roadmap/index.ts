// =============================================================
// Edge Function: generate-roadmap
// Recebe { topic } -> pede ao Gemini um roadmap em JSON ->
// busca 1 videoaula no YouTube para cada tópico -> devolve tudo.
// As chaves ficam como "secrets" no Supabase (nunca no frontend).
// =============================================================

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";
// Modelo reserva, usado só quando o principal está sobrecarregado (erro 503)
const GEMINI_FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") ?? "gemini-flash-latest";

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

type GeminiTopic = {
  title: string;
  description: string;
  video_query: string;
  article_query: string;
};

// Erro com mensagem amigável para mostrar ao aluno (vai direto para a tela)
class FriendlyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Códigos em que vale a pena tentar de novo (sobrecarga/instabilidade do Google)
const RETRY_STATUS = [429, 500, 502, 503, 504];

// Chama um modelo do Gemini; em sobrecarga tenta de novo algumas vezes, esperando um pouco mais a cada vez
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
    if (i < attempts) await sleep(1000 * 2 ** (i - 1)); // espera 1s, depois 2s
  }
  return null; // continua sobrecarregado
}

// ---------- 1) Gemini: gera o roadmap ----------
async function generateWithGemini(topic: string): Promise<{ title: string; topics: GeminiTopic[] }> {
  const prompt = `Você é um tutor que monta trilhas de estudo para iniciantes.
Crie um roadmap de estudos sobre: "${topic}".
Se o assunto for perigoso, ilegal ou impróprio (ex.: armas, explosivos, drogas, ataques),
NÃO crie o roadmap e responda exatamente: {"refused": true}
Regras:
- Entre 5 e 8 tópicos, em ordem lógica do mais básico ao mais avançado.
- Tudo em português do Brasil.
- "description": 1 frase curta explicando o que o aluno vai aprender.
- "video_query": termo de busca para achar uma boa videoaula no YouTube em português.
- "article_query": o TÍTULO do verbete da Wikipédia em português que melhor explica esse tópico
  (ex.: "Variável (programação)", "Estrutura de repetição", "Teorema de Pitágoras"). Só o título, sem "Wikipédia".
Responda SOMENTE com JSON neste formato:
{"title": "título curto da trilha", "topics": [{"title": "...", "description": "...", "video_query": "...", "article_query": "..."}]}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  };

  // Erro 503 ("high demand"): tenta o modelo principal 3x; se continuar, tenta o modelo reserva
  let data = await callGemini(GEMINI_MODEL, body);
  if (!data && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    console.warn(`Modelo ${GEMINI_MODEL} sobrecarregado, usando reserva ${GEMINI_FALLBACK_MODEL}`);
    data = await callGemini(GEMINI_FALLBACK_MODEL, body, 2);
  }
  if (!data) {
    throw new FriendlyError(
      "A IA está com muitos acessos agora. Aguarde alguns segundos e tente gerar de novo.",
      503,
    );
  }

  // O próprio Google bloqueou o pedido por segurança
  const candidate = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(candidate?.finishReason)) {
    throw new FriendlyError(REFUSED_MSG, 422);
  }

  const text: string = (candidate?.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? "")
    .join("");

  // Remove ```json ... ``` caso o modelo devolva com cercas de código
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  // Se a IA recusou com texto comum ("I cannot fulfill...") em vez de JSON, o parse falha
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.error("Resposta do Gemini não é JSON:", clean.slice(0, 300));
    throw new FriendlyError(REFUSED_MSG, 422);
  }

  if (parsed?.refused || !Array.isArray(parsed?.topics) || parsed.topics.length === 0) {
    throw new FriendlyError(REFUSED_MSG, 422);
  }
  return parsed;
}

const REFUSED_MSG =
  "Não foi possível montar um roadmap para esse assunto. Tente um tema de estudo, como uma linguagem, uma matéria ou uma habilidade.";

// ---------- 2) YouTube: 1 vídeo por tópico ----------
async function searchVideo(query: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "1",
    relevanceLanguage: "pt",
    videoEmbeddable: "true",
    safeSearch: "strict",
    key: YOUTUBE_API_KEY!,
  }).toString();

  const res = await fetch(url);
  if (!res.ok) {
    console.error("YouTube search falhou:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return { video_id: item.id.videoId as string, video_title: item.snippet.title as string };
}

// ---------- 3) Wikipédia: 1 artigo real por tópico (API gratuita, sem chave) ----------
type Article = { article_url: string; article_title: string; article_minutes: number };

async function searchWikipedia(query: string): Promise<Article | null> {
  const url = new URL("https://pt.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "1",
    srprop: "wordcount",
    format: "json",
  }).toString();

  try {
    // A Wikimedia pede um User-Agent identificando o app
    const res = await fetch(url, { headers: { "User-Agent": "IntelliPath/0.1 (projeto academico)" } });
    if (!res.ok) {
      console.error("Wikipédia falhou:", res.status);
      return null;
    }
    const data = await res.json();
    const page = data?.query?.search?.[0];
    if (!page) return null;
    return {
      article_title: page.title,
      article_url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
      // ~200 palavras por minuto de leitura
      article_minutes: Math.max(1, Math.round((page.wordcount ?? 1000) / 200)),
    };
  } catch (err) {
    console.error("Wikipédia erro:", err);
    return null;
  }
}

// Tenta o título sugerido pela IA; se não achar, tenta "tópico + assunto"
async function findArticle(t: GeminiTopic, topic: string): Promise<Article | null> {
  return (
    (t.article_query && (await searchWikipedia(t.article_query))) ||
    (await searchWikipedia(`${t.title} ${topic}`)) ||
    null
  );
}

// Duração ISO 8601 (ex.: PT12M30S) -> minutos
function isoToMinutes(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h = "0", min = "0", s = "0"] = m;
  return Math.max(1, Math.round(Number(h) * 60 + Number(min) + Number(s) / 60));
}

async function getDurations(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({
    part: "contentDetails",
    id: ids.join(","),
    key: YOUTUBE_API_KEY!,
  }).toString();
  const res = await fetch(url);
  if (!res.ok) return {};
  const data = await res.json();
  const out: Record<string, number> = {};
  for (const v of data.items ?? []) out[v.id] = isoToMinutes(v.contentDetails.duration);
  return out;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY || !YOUTUBE_API_KEY) {
      return json({ error: "Configure os secrets GEMINI_API_KEY e YOUTUBE_API_KEY no Supabase." }, 500);
    }

    const { topic } = await req.json();
    if (!topic || typeof topic !== "string" || topic.trim().length < 2) {
      return json({ error: "Informe um assunto válido." }, 400);
    }

    const roadmap = await generateWithGemini(topic.trim());

    // Busca vídeos e artigos em paralelo
    const [videos, articles] = await Promise.all([
      Promise.all(roadmap.topics.map((t) => searchVideo(t.video_query || `${t.title} ${topic} aula`))),
      Promise.all(roadmap.topics.map((t) => findArticle(t, topic))),
    ]);
    const durations = await getDurations(videos.filter(Boolean).map((v) => v!.video_id));

    const topics = roadmap.topics.map((t, i) => {
      const v = videos[i];
      const a = articles[i];
      return {
        position: i + 1,
        title: t.title,
        description: t.description,
        video_id: v?.video_id ?? null,
        video_title: v?.video_title ?? null,
        video_minutes: v ? durations[v.video_id] ?? null : null,
        // Artigo real da Wikipédia (null se nada for encontrado)
        article_url: a?.article_url ?? null,
        article_title: a?.article_title ?? null,
        article_minutes: a?.article_minutes ?? null,
      };
    });

    return json({ title: roadmap.title || topic, topics });
  } catch (err) {
    if (err instanceof FriendlyError) return json({ error: err.message }, err.status);
    console.error(err); // detalhe técnico fica só nos Logs do Supabase
    return json({ error: "Ocorreu um erro ao gerar o roadmap. Tente novamente em instantes." }, 500);
  }
});

// =============================================================
// Edge Function: generate-roadmap
// Recebe { topic } -> pede ao Gemini um roadmap em JSON ->
// busca 1 videoaula no YouTube para cada tópico -> devolve tudo.
// As chaves ficam como "secrets" no Supabase (nunca no frontend).
// =============================================================

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";

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
  article_minutes: number;
};

// ---------- 1) Gemini: gera o roadmap ----------
async function generateWithGemini(topic: string): Promise<{ title: string; topics: GeminiTopic[] }> {
  const prompt = `Você é um tutor que monta trilhas de estudo para iniciantes.
Crie um roadmap de estudos sobre: "${topic}".
Regras:
- Entre 5 e 8 tópicos, em ordem lógica do mais básico ao mais avançado.
- Tudo em português do Brasil.
- "description": 1 frase curta explicando o que o aluno vai aprender.
- "video_query": termo de busca para achar uma boa videoaula no YouTube em português.
- "article_query": termo de busca para achar um bom artigo/tutorial escrito.
- "article_minutes": estimativa de leitura em minutos (número inteiro).
Responda SOMENTE com JSON neste formato:
{"title": "título curto da trilha", "topics": [{"title": "...", "description": "...", "video_query": "...", "article_query": "...", "article_minutes": 5}]}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? "")
    .join("");

  // Remove ```json ... ``` caso o modelo devolva com cercas de código
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed.topics) || parsed.topics.length === 0) {
    throw new Error("Gemini não devolveu tópicos.");
  }
  return parsed;
}

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

    // Busca os vídeos em paralelo
    const videos = await Promise.all(
      roadmap.topics.map((t) => searchVideo(t.video_query || `${t.title} ${topic} aula`)),
    );
    const durations = await getDurations(videos.filter(Boolean).map((v) => v!.video_id));

    const topics = roadmap.topics.map((t, i) => {
      const v = videos[i];
      const articleQuery = t.article_query || `${t.title} ${topic} tutorial`;
      return {
        position: i + 1,
        title: t.title,
        description: t.description,
        video_id: v?.video_id ?? null,
        video_title: v?.video_title ?? null,
        video_minutes: v ? durations[v.video_id] ?? null : null,
        // MVP: link de busca de artigo (evita URLs inventadas pela IA)
        article_url: `https://www.google.com/search?q=${encodeURIComponent(articleQuery)}`,
        article_minutes: Number(t.article_minutes) || 5,
      };
    });

    return json({ title: roadmap.title || topic, topics });
  } catch (err) {
    console.error(err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

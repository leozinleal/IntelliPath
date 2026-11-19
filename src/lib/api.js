// Todas as chamadas ao Supabase ficam aqui, para as telas ficarem simples.
import { supabase } from "./supabase";

// 1) Gera o roadmap com IA (Edge Function) e salva no banco
export async function generateRoadmap(topic) {
  const { data, error } = await supabase.functions.invoke("generate-roadmap", {
    body: { topic },
  });

  if (error) {
    // Tenta ler a mensagem de erro devolvida pela função
    let msg = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignora */
    }
    throw new Error(msg);
  }

  const { data: roadmap, error: e1 } = await supabase
    .from("roadmaps")
    .insert({ topic, title: data.title })
    .select()
    .single();
  if (e1) throw e1;

  const rows = data.topics.map((t) => ({ ...t, roadmap_id: roadmap.id }));
  const { error: e2 } = await supabase.from("roadmap_topics").insert(rows);
  if (e2) throw e2;

  return roadmap.id;
}

// Lista os roadmaps do usuário (mais recente primeiro), com o progresso de cada um
export async function listRoadmaps() {
  const { data, error } = await supabase
    .from("roadmaps")
    .select("id, title, topic, created_at, roadmap_topics(completed)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(({ roadmap_topics = [], ...r }) => ({
    ...r,
    total: roadmap_topics.length,
    done: roadmap_topics.filter((t) => t.completed).length,
  }));
}

// Exclui um roadmap (os tópicos são apagados juntos pelo "on delete cascade" do banco)
export async function deleteRoadmap(id) {
  const { error } = await supabase.from("roadmaps").delete().eq("id", id);
  if (error) throw error;
}

// Busca um roadmap com seus tópicos em ordem
export async function getRoadmap(id) {
  const { data: roadmap, error } = await supabase
    .from("roadmaps")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: topics, error: e2 } = await supabase
    .from("roadmap_topics")
    .select("*")
    .eq("roadmap_id", id)
    .order("position");
  if (e2) throw e2;

  return { ...roadmap, topics };
}

// Busca um tópico específico
export async function getTopic(id) {
  const { data, error } = await supabase.from("roadmap_topics").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// 4) Marca / desmarca um tópico como concluído
export async function setTopicCompleted(id, completed) {
  const { error } = await supabase
    .from("roadmap_topics")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Atividades (quiz) por tópico ----------

// Busca as perguntas já salvas de um tópico e a última tentativa do aluno
export async function getQuiz(topicId) {
  const [{ data: questions, error: e1 }, { data: attempts, error: e2 }] = await Promise.all([
    supabase.from("quiz_questions").select("*").eq("topic_id", topicId).order("position"),
    supabase
      .from("quiz_attempts")
      .select("score, total, answers, created_at")
      .eq("topic_id", topicId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { questions, lastAttempt: attempts[0] ?? null };
}

// Gera as perguntas com IA (Edge Function generate-quiz) e salva no banco
export async function generateQuiz(topic, roadmap) {
  const { data, error } = await supabase.functions.invoke("generate-quiz", {
    body: { topic: topic.title, description: topic.description, trail: roadmap.title },
  });

  if (error) {
    let msg = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignora */
    }
    throw new Error(msg);
  }

  const rows = data.questions.map((q, i) => ({
    topic_id: topic.id,
    roadmap_id: roadmap.id,
    position: i + 1,
    question: q.question,
    options: q.options,
    correct_index: q.correct_index,
    explanation: q.explanation,
  }));
  const { data: saved, error: e2 } = await supabase.from("quiz_questions").insert(rows).select().order("position");
  if (e2) throw e2;
  return saved;
}

// Apaga as perguntas do tópico (para gerar um quiz novo)
export async function deleteQuiz(topicId) {
  const { error } = await supabase.from("quiz_questions").delete().eq("topic_id", topicId);
  if (error) throw error;
}

// Salva a nota de uma tentativa
export async function saveQuizAttempt({ roadmapId, topicId, score, total, answers }) {
  const { error } = await supabase
    .from("quiz_attempts")
    .insert({ roadmap_id: roadmapId, topic_id: topicId, kind: "topic", score, total, answers });
  if (error) throw error;
}

// Helpers
export const youtubeUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;
export const totalMinutes = (topics) =>
  topics.reduce((sum, t) => sum + (t.video_minutes || 0) + (t.article_minutes || 0), 0);
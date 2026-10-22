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

// Helpers
export const youtubeUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;
export const totalMinutes = (topics) =>
  topics.reduce((sum, t) => sum + (t.video_minutes || 0) + (t.article_minutes || 0), 0);
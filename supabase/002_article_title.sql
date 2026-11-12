-- Etapa 2: artigos reais da Wikipédia
-- Rode UMA vez no Supabase: SQL Editor > New query > Run
alter table public.roadmap_topics add column if not exists article_title text;

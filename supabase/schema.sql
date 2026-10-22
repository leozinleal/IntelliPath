-- =============================================================
-- IntelliPath — schema do banco (Supabase / PostgreSQL)
-- Cole tudo no Supabase: SQL Editor > New query > Run
-- =============================================================

-- Roadmap: um por assunto gerado
create table if not exists public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic       text not null,              -- o que o aluno digitou ("Python")
  title       text not null,              -- título gerado pela IA ("Introdução a Python")
  created_at  timestamptz not null default now()
);

-- Tópicos de cada roadmap (a sequência de estudo)
create table if not exists public.roadmap_topics (
  id               uuid primary key default gen_random_uuid(),
  roadmap_id       uuid not null references public.roadmaps(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position         int  not null,          -- ordem: 1, 2, 3...
  title            text not null,
  description      text,
  video_id         text,                   -- id do vídeo no YouTube
  video_title      text,
  video_minutes    int,
  article_url      text,
  article_minutes  int,
  completed        boolean not null default false,
  completed_at     timestamptz
);

create index if not exists roadmap_topics_roadmap_idx on public.roadmap_topics (roadmap_id, position);
create index if not exists roadmaps_user_idx on public.roadmaps (user_id, created_at desc);

-- -------------------------------------------------------------
-- Segurança (RLS): cada usuário só vê e altera os próprios dados
-- -------------------------------------------------------------
alter table public.roadmaps       enable row level security;
alter table public.roadmap_topics enable row level security;

drop policy if exists "roadmaps do proprio usuario" on public.roadmaps;
create policy "roadmaps do proprio usuario" on public.roadmaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "topicos do proprio usuario" on public.roadmap_topics;
create policy "topicos do proprio usuario" on public.roadmap_topics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

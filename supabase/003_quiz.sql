-- =============================================================
-- Etapa 3: Atividades (quiz) por tópico
-- Rode UMA vez no Supabase: SQL Editor > New query > Run
-- =============================================================

-- Perguntas geradas pela IA para cada tópico (geradas uma vez e reaproveitadas)
create table if not exists public.quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  topic_id       uuid not null references public.roadmap_topics(id) on delete cascade,
  roadmap_id     uuid not null references public.roadmaps(id) on delete cascade, -- facilita o quiz final
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position       int  not null,          -- ordem da pergunta: 1, 2, 3...
  question       text not null,
  options        jsonb not null,         -- lista com 4 alternativas: ["...", "...", "...", "..."]
  correct_index  int  not null check (correct_index between 0 and 3),
  explanation    text,
  created_at     timestamptz not null default now()
);

-- Cada vez que o aluno envia um quiz, guardamos a nota
create table if not exists public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  roadmap_id  uuid not null references public.roadmaps(id) on delete cascade,
  topic_id    uuid references public.roadmap_topics(id) on delete cascade, -- vazio = quiz final (próxima etapa)
  kind        text not null default 'topic' check (kind in ('topic', 'final')),
  score       int  not null,             -- acertos
  total       int  not null,             -- total de perguntas
  answers     jsonb,                     -- alternativas escolhidas: [2, 0, 1, 3, 1]
  created_at  timestamptz not null default now()
);

create index if not exists quiz_questions_topic_idx on public.quiz_questions (topic_id, position);
create index if not exists quiz_attempts_topic_idx on public.quiz_attempts (topic_id, created_at desc);

-- Segurança (RLS): cada usuário só vê e altera os próprios dados
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts  enable row level security;

drop policy if exists "perguntas do proprio usuario" on public.quiz_questions;
create policy "perguntas do proprio usuario" on public.quiz_questions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tentativas do proprio usuario" on public.quiz_attempts;
create policy "tentativas do proprio usuario" on public.quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

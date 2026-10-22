# IntelliPath — Protótipo (Etapa 1)

Plataforma de estudos com IA: o aluno digita um assunto, o **Gemini** monta o roadmap,
o **YouTube** fornece uma videoaula para cada tópico, e o aluno estuda com **Pomodoro**
e marca o **progresso**.

| Função | Onde está no código |
|---|---|
| 1. Gerar roadmap pelo assunto | `src/pages/Home.jsx` → `supabase/functions/generate-roadmap` |
| 2. Cronômetro Pomodoro | `src/components/Pomodoro.jsx` |
| 3. Links de videoaulas e artigos | `src/pages/Roadmap.jsx` e `src/pages/StudyRoom.jsx` |
| 4. Marcar progresso dos tópicos | checkbox em `Roadmap.jsx` / `StudyRoom.jsx` → tabela `roadmap_topics` |

## Como funciona (arquitetura)

```
Navegador (React + Vite)
   │  login / leitura e gravação do progresso
   ├──────────────► Supabase Auth + Banco (PostgreSQL, com RLS)
   │
   │  "gerar roadmap de Python"
   └──────────────► Supabase Edge Function "generate-roadmap"
                        ├─► Gemini API  (gera os tópicos em JSON)
                        └─► YouTube Data API v3 (1 vídeo por tópico)
```

As chaves do Gemini e do YouTube ficam **só no servidor** (secrets da Edge Function).
O frontend só conhece a URL e a chave pública (anon) do Supabase.

```
intellipath/
├── src/
│   ├── App.jsx               rotas, menu e login obrigatório
│   ├── index.css             estilo básico (design fica para o final)
│   ├── lib/supabase.js       conexão com o Supabase
│   ├── lib/api.js            todas as chamadas (gerar, listar, marcar concluído)
│   ├── components/Pomodoro.jsx
│   └── pages/ Login.jsx · Home.jsx · Roadmap.jsx · StudyRoom.jsx
├── supabase/
│   ├── schema.sql            tabelas + segurança (RLS)
│   └── functions/generate-roadmap/index.ts
└── .env.example
```

---

## Passo a passo (do zero)

### Passo 0 — Instalar ferramentas
1. **Node.js 20 ou superior** (recomendado 22 LTS): https://nodejs.org — confira com `node -v`.
2. **VS Code** (editor) e **Git** (opcional, mas recomendado).
3. Criar contas (todas grátis para o protótipo):
   - Supabase: https://supabase.com
   - Google AI Studio (chave do Gemini): https://aistudio.google.com/apikey
   - Google Cloud Console (chave do YouTube): https://console.cloud.google.com

### Passo 1 — Instalar o projeto
```bash
cd intellipath
npm install
```
> Para criar um projeto igual do zero no futuro, os comandos foram:
> `npm create vite@latest intellipath -- --template react` e
> `npm install @supabase/supabase-js react-router-dom`.

### Passo 2 — Criar o projeto no Supabase
1. No painel do Supabase: **New project** (anote a senha do banco).
2. Vá em **Project Settings → API** e copie a **Project URL** e a chave **anon / public**.
3. Copie `.env.example` para `.env` e cole os valores:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Para agilizar os testes: **Authentication → Sign In / Providers → Email** e desligue
   **Confirm email** (assim o cadastro já entra direto, sem e-mail de confirmação).

### Passo 3 — Criar as tabelas
No Supabase: **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**.
Confira em **Table Editor** se apareceram `roadmaps` e `roadmap_topics`.

### Passo 4 — Pegar as chaves de API
- **Gemini:** em https://aistudio.google.com/apikey → *Create API key*.
- **YouTube:** no Google Cloud Console → crie um projeto → **APIs e serviços → Biblioteca** →
  ative **YouTube Data API v3** → **Credenciais → Criar credenciais → Chave de API**.

### Passo 5 — Publicar a Edge Function (backend)
Pelo terminal, dentro da pasta do projeto (usa a CLI do Supabase via `npx`, sem instalar nada):
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF     # o "xxxx" da URL do projeto
npx supabase secrets set GEMINI_API_KEY=sua_chave_gemini YOUTUBE_API_KEY=sua_chave_youtube
npx supabase functions deploy generate-roadmap
```
*Alternativa sem terminal:* no painel, **Edge Functions → Deploy a new function → Via Editor**,
nome `generate-roadmap` , cole o conteúdo de `index.ts`; e cadastre as duas chaves em
**Edge Functions → Secrets**.

Modelo de IA: por padrão usa `gemini-3.5-flash-lite` (rápido e barato). Para trocar, crie o
secret `GEMINI_MODEL` (ex.: `gemini-3.8-flash`).

### Passo 6 — Rodar e testar
```bash
npm run dev
```
Abra http://localhost:5173 e siga o roteiro:

- [ ] **Cadastro/Login:** crie uma conta e entre.
- [ ] **Função 1:** digite "Python" (ou clique na sugestão) → *Gerar Roadmap*. Em ~5–15 s deve
      abrir a tela com 5 a 8 tópicos.
- [ ] **Função 3:** cada tópico tem *Assistir Vídeo* (abre a Sala de Estudo com o vídeo) e
      *Ler Artigo* (abre uma busca de artigos sobre o tema em nova aba).
- [ ] **Função 4:** marque tópicos → a barra "x/y concluídos" atualiza. Recarregue a página (F5):
      as marcações devem continuar (estão salvas no banco).
- [ ] **Função 2:** clique *Iniciar* no Pomodoro, troque para *Sala de Estudo*: o tempo continua.
      Ao zerar, toca um bipe e passa para a pausa de 5 min.

---

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| Tela "Carregando..." eterna / erro de conexão | `.env` faltando ou com valores errados; reinicie o `npm run dev` após editar |
| "Configure os secrets GEMINI_API_KEY..." | Secrets não cadastrados (Passo 5) |
| Erro "Gemini 400/403/404" | Chave inválida ou nome de modelo errado (`GEMINI_MODEL`) |
| Tópicos aparecem mas "Sem vídeo encontrado" | Chave do YouTube inválida, API não ativada ou cota diária esgotada |
| Erro "new row violates row-level security" | Usuário não logado ou `schema.sql` rodado só pela metade |
| Logs da função | Supabase → Edge Functions → generate-roadmap → **Logs** |

**Cota do YouTube:** a cota grátis é de 10.000 unidades/dia e cada busca custa 100. Um roadmap
de 5–8 tópicos gasta ~600–900, ou seja, ~10–15 roadmaps por dia. Para o protótipo basta;
evitem gerar roadmaps repetidos à toa durante os testes.

## Sobre a hospedagem
O Supabase hospeda o **banco, o login e o backend (Edge Function)**. O site React em si
(arquivos estáticos do `npm run build`) costuma ir para a **Vercel** ou **Netlify** (grátis,
deploy direto do GitHub) — fica para a próxima etapa.

## Próximas etapas sugeridas
1. Deploy do frontend (Vercel/Netlify) e ajuste de URL no Supabase Auth.
2. Artigos reais (ex.: busca na Wikipédia/Dev.to) no lugar do link de busca.
3. Streak de dias estudados e histórico de ciclos Pomodoro no banco.
4. Design final conforme as telas de referência.

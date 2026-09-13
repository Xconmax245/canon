# Story-to-Image Platform — Backend

Backend for **paste script → generate → coherent visual storyboard**.

- **OpenAI** = the brain (story analysis, scene planning, prompt generation)
- **KIE.ai** = the renderer (image generation from finished prompts + reference images)

KIE never sees the raw script and does no story reasoning.

## Stack

- Next.js (App Router) API routes
- TypeScript (strict)
- PostgreSQL via Supabase
- Supabase Storage for image assets
- Prisma ORM
- Zod validation + Vitest unit tests

## Setup

```bash
npm install
cp .env.example .env   # fill in the values
npx prisma db push     # create tables
npm run dev
```

### Environment variables (server-side only)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Story/scene/prompt reasoning |
| `OPENAI_MODEL` | Default `gpt-5.6-mini` — cheapest tier that passes validation |
| `KIE_API_KEY` | Image rendering |
| `KIE_WEBHOOK_HMAC_KEY` | Webhook signature verification (from KIE settings page) — preferred |
| `KIE_WEBHOOK_SECRET` | Shared-secret fallback before the HMAC key is configured |
| `APP_BASE_URL` | Public base URL used to build the KIE `callBackUrl` |
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage uploads (server-side only) |
| `CRON_SECRET` | Protects `/api/cron/reconcile` |

Keys and raw provider payloads are never returned by any API response.

## Pipeline

1. `POST /api/projects` — create project (script, visualStyleDirective, aspectRatio, generationLimit)
2. `POST /api/projects/:id/analyze` — **stage 1**: script → Story Bible (structured output, Zod-validated, retried with validation feedback)
3. `POST /api/projects/:id/plan-scenes` — **stage 2**: ordered scene plan; each scene tagged with `identityLockRequirement` (none/single/multi) computed at planning time
4. `POST /api/projects/:id/generate` — **stage 3**: auto-build prompts (skipping user-edited ones), then dispatch one KIE task per scene
5. Poll `GET /api/projects/:id/status` / `GET /api/projects/:id/storyboard` while jobs run

### Three-lane image-model router

| `identityLockRequirement` | Lane | KIE model | References |
|---|---|---|---|
| `none` | text-to-image | `flux1-kontext` | — |
| `single` | ideogram-character | `ideogram/character` | exactly 1 (extras ignored by provider) |
| `multi` | flux2-multi | `flux-2/pro-image-to-image` | up to 8 |

Notes from live testing:
- `flux1-kontext` enforces a **1024-char prompt cap**; prompts are trimmed at a word boundary to 1000 chars.
- Reference-dependent lanes fall back to the text lane when no reference images exist yet (e.g. first render).
- First render of a character has no reference image; attach character reference URLs to the Story Bible to unlock identity-locked lanes.

### Visual style directive

Project-level. Either a preset id (`cinematic`, `anime`, `comic`, `photorealistic`, `fantasy`, `horror`, `illustration`) or free text. Applied to every scene's auto-built prompt.

### Editable per-scene prompts

- First generation always uses the auto-built prompt (`promptSource: "auto"`)
- `PATCH /api/scenes/:id/prompt` — user edit → `promptSource: "user-edited"`; regeneration reuses the edit and never silently overwrites it
- `POST /api/scenes/:id/regenerate-prompt` — explicit rebuild → resets to `promptSource: "auto"`

## Job system

- **Idempotency**: one KIE task per `${sceneId}:${imageVersion}`; an existing job in an active state (`waiting/queuing/generating/downloading`) is reused, never duplicated
- **Webhook + reconciliation**: `POST /api/webhooks/kie` is the primary completion signal (HMAC-SHA256 verified, replay-guarded); `/api/cron/reconcile` (every 5 min) polls `recordInfo` for jobs stuck in active states and re-drives recent `download_failed` jobs
- **Download state machine**: `generating → success → downloading → success+persisted`, with `download_failed` kept distinct from `fail` — downloading retries are free (KIE URL still live), generation retries cost credits again
- **Versioning**: every regeneration creates a new `imageVersion` + new `Asset` row; history stays queryable
- **Budget**: `generationLimit` per project counts original + regenerated images; `creditsConsumed` is summed from KIE's actual reported values

## Failure handling

| Failure | Recovery |
|---|---|
| LLM validation failure | Retry that stage only, errors fed back into the prompt |
| KIE `fail` | Scene surfaces retry (`POST /api/scenes/:id/regenerate`) — costs credits |
| `download_failed` | Download-only retry (automatic + endpoint) — no credits |
| Missed webhook | Reconciliation sweep catches it within its interval |

## Tests

```bash
npm test
```

Pure-logic unit tests cover the router, lane builders, webhook signature verification, KIE wire format, LLM schema validation, and the gateway retry loop (no real provider calls).

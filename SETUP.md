# seeface1 world — setup

Everything runs locally with **no secrets**: each external service has a mock adapter that switches on
automatically when its env var is empty. Copy `.env.example` to `.env.local` (client) and `server/.env` (server).

```bash
npm install && (cd server && npm install)
npm run world:server     # ws://localhost:8787 (mocks for everything missing)
npm run dev              # http://localhost:5173/world/
npm run test:unit
npm run test:e2e         # starts both servers itself
```

## External services

| Service | Used for | Env | Without it |
|---|---|---|---|
| **LiveKit** (Cloud or self-hosted) | Voice SFU for rooms > 8 people | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | A WebRTC mesh signalled through the world server (fine up to ~8 voices per room) |
| **TURN** (e.g. coturn, Cloudflare Calls TURN) | Mesh voice behind strict NATs; hides IPs | `TURN_URL`, `TURN_USER`, `TURN_PASS` | STUN only; some mobile networks fail |
| **Streaming STT** (Deepgram, AssemblyAI, Speechmatics…) | "Transcribe me" captions → room transcript (text only) | `STT_PROVIDER`, `STT_API_KEY` | `mock`: no transcript lines are produced (we never invent speech) |
| **Claude** (Anthropic API) | AI host lines, silence prompts, Library verdicts, abuse flags | `ANTHROPIC_API_KEY`, `HOST_MODEL` | Scripted host lines; verdicts are built from typed text only |
| **Postgres / Supabase** | Durable store (ledger, rooms, strikes, transcripts, verdicts) | `DATABASE_URL` | JSON file store in `server/data-world/` (dev only) |
| **Stripe** (TEST mode) | Coin packs | `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` | Mock checkout that credits test coins in dev only |
| **Age assurance** (vendor TBD by Sasha: Yoti, Persona, Veriff, VerifyMy…) | 18+ gate before any voice room | `AGE_PROVIDER`, `AGE_API_KEY`, `AGE_WEBHOOK_SECRET` | `mock` works **only** when `NODE_ENV !== production`; in production voice stays locked |
| **World server host** (Render, existing blueprint) | `server/world` | `WORLD_PORT`, `WORLD_SECRET`, `WORLD_ALLOWED_ORIGINS` | — |

The server refuses `sk_live_` Stripe keys: live payments need Sasha (see "Needs Sasha").

## Needs Sasha (never done by the agent)
- Choosing the age-assurance vendor and signing up.
- Going live with real payments.
- Final privacy policy and terms (legal review). The texts in the app are drafts.
- Production deploy, domain and DNS.
- Any paid service sign-up (LiveKit Cloud, STT, Render paid plan, Postgres).

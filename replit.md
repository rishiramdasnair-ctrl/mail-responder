# ReplyAI — Gmail AI Auto-Responder SaaS

## Overview
ReplyAI is a production Gmail AI auto-responder. Users connect Gmail, browse their inbox, and get 3 AI-generated reply options (Pro/Casual/Fast tones) with one-click send.

## Business Model
- 14-day free trial (50 replies total)
- Pro Monthly: $14/month (unlimited replies)
- Pro Annual: $99/year (unlimited replies)
- No free tier after trial

## Architecture

### Monorepo (pnpm workspaces)
- `artifacts/api-server` — Express backend (port 8080)
- `artifacts/replyai` — React + Vite frontend (previewPath="/")
- `lib/db` — Drizzle ORM + PostgreSQL schema
- `lib/api-spec` — OpenAPI spec (source of truth)
- `lib/api-client-react` — Generated TanStack Query hooks
- `lib/api-zod` — Generated Zod request/response schemas
- `lib/integrations-openai-ai-server` — OpenAI client (server-side)

### Tech Stack
- Frontend: React 19, Vite, Wouter, TanStack Query, Clerk auth, shadcn/ui, Tailwind CSS
- Backend: Express, Clerk middleware, Pino logging, Drizzle ORM
- AI: OpenAI gpt-5.2 via Replit AI Integration
- Auth: Clerk (publishable key in VITE_CLERK_PUBLISHABLE_KEY)
- DB: PostgreSQL (DATABASE_URL)
- Payments: Stripe (STRIPE_SECRET_KEY from connector or env, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL)
- Gmail: Google Mail Replit Connector (conn_google-mail_01KKPXV03F028D1G1GV18TTR3E)

## Database Schema
- `users` — id (Clerk userId), email, plan (trial/pro), trialEndsAt, repliesUsed, stripeCustomerId, stripeSubscriptionId; also holds googleAccessToken/refreshToken for backward-compat (primary account)
- `gmail_accounts` — id (serial), userId, email, accessToken, refreshToken, tokenExpiresAt, isPrimary; unique index on (userId, email); source of truth for multi-account Gmail
- `reply_history` — id, userId, threadId, subject, fromEmail, tone, replySent, reasoning, wasSent
- `user_settings` — userId, defaultTone, customInstructions, emailSignature, darkMode, notifications

## API Routes (all under /api prefix)
- GET /api/auth/me — current user profile + plan
- GET /api/gmail/accounts — list all connected Gmail accounts for user
- DELETE /api/gmail/accounts/:email — disconnect specific Gmail account
- GET /api/auth/google/start?addAccount=true — OAuth flow to add a new Gmail account
- GET /api/gmail/status — Gmail connection status; accepts ?account= param
- GET /api/gmail/inbox — inbox thread list
- GET /api/gmail/threads/:threadId — single thread
- GET /api/gmail/labels — Gmail labels
- POST /api/gmail/send — send reply
- POST /api/ai/generate — generate 3 AI replies (accepts optional calendarContext)
- GET /api/calendar/events — list upcoming calendar events (next 7 days)
- POST /api/calendar/events — create a calendar event
- GET /api/history — reply history
- GET /api/history/stats — usage stats
- GET /api/billing/plans — available plans
- GET /api/billing/subscription — current subscription
- POST /api/billing/checkout — create Stripe checkout
- POST /api/billing/portal — Stripe billing portal
- GET /api/settings — user settings
- PUT /api/settings — update settings
- POST /api/stripe/webhook — Stripe webhook (raw body)
- GET /api/auth/google/start — start Google OAuth (Gmail + Calendar)
- GET /api/auth/google/callback — Google OAuth callback
- POST /api/auth/google/disconnect — disconnect Google account

## Frontend Pages
- `/` — Landing page (unauthenticated) / redirect to /dashboard (authenticated)
- `/sign-in` — Clerk sign-in
- `/sign-up` — Clerk sign-up
- `/dashboard` — Main inbox: email list + thread view + AI replies
- `/history` — Searchable reply history
- `/settings` — Settings + billing management
- `/pricing` — Pricing page with Stripe checkout

## Environment Variables Required
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key
- `CLERK_SECRET_KEY` — Clerk secret key
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `STRIPE_SECRET_KEY` — Stripe secret key (or use Stripe connector)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook secret
- `STRIPE_PRICE_MONTHLY` — Stripe price ID for $14/mo plan
- `STRIPE_PRICE_ANNUAL` — Stripe price ID for $99/yr plan

## Key Files
- `lib/api-spec/openapi.yaml` — Full API spec (source of truth)
- `artifacts/api-server/src/app.ts` — Express app setup
- `artifacts/api-server/src/routes/` — All route handlers
- `artifacts/api-server/src/lib/gmailClient.ts` — Gmail connector
- `artifacts/api-server/src/lib/stripeClient.ts` — Stripe client
- `artifacts/api-server/src/lib/getOrCreateUser.ts` — User + plan logic
- `artifacts/replyai/src/App.tsx` — Frontend entry + routing
- `artifacts/replyai/src/pages/` — All page components
- `lib/db/src/schema/` — Database schema

## Agent API Routes
- POST /api/agent/stream — SSE streaming agent endpoint (real-time token + step events)
- POST /api/agent/run — Non-streaming agent run (returns full answer)
- POST /api/agent/start — Async agent start (returns jobId)
- GET /api/agent/jobs/:jobId — Poll async agent job
- POST /api/agent/send — Send a drafted email
- POST /api/agent/create-event — Create a confirmed calendar event
- GET /api/agent/suggestions — Get personalized action suggestions
- GET /api/agent/conversations — List user's past conversations
- GET /api/agent/conversations/:id — Get conversation with messages
- DELETE /api/agent/conversations/:id — Delete a conversation

## Agent DB Tables
- `agent_conversations` — id, userId (FK → users), title, createdAt, updatedAt
- `agent_messages` — id, conversationId (FK → agent_conversations), role, content, stepsData (JSON), createdAt

## Agent SSE Protocol
Events sent from `/api/agent/stream`:
- `{"type":"step","step":{...}}` — Tool execution step
- `{"type":"token","content":"..."}` — Streaming text token
- `{"type":"pending_email","data":{...}}` — Email needs confirmation
- `{"type":"pending_event","data":{...}}` — Calendar event needs confirmation
- `{"type":"done","answer":"...","conversationId":123}` — Completion
- `{"type":"error","message":"..."}` — Error

## Mobile App
- Expo (iOS-first) with React Native
- SSE streaming for agent chat (fetch + ReadableStream)
- Markdown rendering via react-native-markdown-display
- Model: anthropic/claude-3.5-sonnet via OpenRouter

## Stripe Setup (TODO)
1. Connect Stripe via Replit integrations, or set STRIPE_SECRET_KEY env var
2. Run `pnpm --filter @workspace/scripts exec tsx src/seedStripe.ts` to create products/prices
3. Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL with the resulting price IDs
4. Set STRIPE_WEBHOOK_SECRET for webhook verification

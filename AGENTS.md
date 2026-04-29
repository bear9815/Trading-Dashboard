# Trading Dashboard — Project Context

## What This Is
A personal trading journal and analytics dashboard built with React + Vite + Tailwind. Deployed on Vercel. Uses Supabase for auth/data, IndexedDB for local state (via Zustand stores).

## Stack
- **Frontend**: React 18, Vite, Tailwind CSS
- **State**: Zustand stores in `src/store/`
- **Backend**: Vercel serverless functions in `api/`
- **AI**: Gemini (primary) → Codex fallback (rate limit) → OpenRouter (research/model book) → Ollama (local)
- **Data sources**: Yahoo Finance (`api/yf/`), Stooq (`api/stooq/`), Schwab brokerage (`api/schwab/`), VIX (`api/vix.js`), Hunterbrook (`api/hunterbrook/`)

## Key Files
| File | Purpose |
|------|---------|
| `src/utils/ai.js` | All Gemini/Codex AI calls for trade analysis, briefings, edge lab |
| `src/utils/researchAi.js` | OpenRouter calls for thematic research library |
| `src/utils/researchPrompts.js` | Prompt builders for research/dossier generation |
| `src/utils/modelBookAi.js` | Model book pattern analysis (Gemini/OpenRouter/Ollama) |
| `src/utils/aiHelpers.js` | Shared: `stripCodeFences`, `parseJsonText` |
| `src/utils/ollama.js` | Local Ollama client (Gemma 4 31b + nomic embeddings) |
| `src/utils/marketData.js` | Market data fetching and ticker resolution |
| `src/utils/metrics.js` | Trading metric calculations (win rate, R, expectancy) |
| `src/store/useTradeStore.js` | Primary trade data store |
| `src/store/useSettingsStore.js` | API keys, user preferences |

## AI Integration Pattern
All AI prompts return **valid JSON only** — no markdown. Callers use `text.match(/\{[\s\S]*\}/)` to extract. The shared `parseJsonText()` helper in `aiHelpers.js` handles stripping code fences + extraction.

## Coding Conventions
- Functional React components, no class components
- Zustand for all global state — no Redux
- `async/await` throughout, no `.then()` chains
- Tailwind utility classes only — no custom CSS except `src/index.css`
- All AI prompt strings are built in dedicated `build*Prompt()` functions, never inline
- API keys are never hardcoded — always from `useSettingsStore`

## Important Notes
- `api/schwab/` handles OAuth2 flow for Charles Schwab brokerage integration
- `api/hunterbrook/` and `api/hunterbrook-sub/` are proprietary data proxies — do not modify routing logic
- `public/data/theme_data.json` is the seed data for thematic research themes
- The `dist/` folder is the Vite build output — never edit files there directly

## Versioning Rule
- Every user-visible feature, workflow change, or behavior change must bump `package.json` so the bottom-left app version updates automatically.
- Use semver with pragmatic estimates:
  - patch (`0.2.0` → `0.2.1`) for fixes and small polish
  - minor (`0.2.0` → `0.3.0`) for meaningful new features or workflow additions
  - major (`0.2.0` → `1.0.0`) only for large breaking changes
- When in doubt, choose the smallest version that still reflects visible product progress.

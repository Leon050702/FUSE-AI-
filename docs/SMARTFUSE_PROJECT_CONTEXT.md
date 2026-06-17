# SmartFUSE / FUSE-AI — Complete Project Context

> **Purpose of this file:** Paste this whole document into a new AI chat as the
> first message. It gives the AI everything it needs to understand the project,
> the codebase, the domain (Function Point Analysis), and the open work — so you
> don't have to re-explain anything.

---

## 1. What this project is

**FUSE** (*Functional Size Estimator*) is a web tool for the Johor State
Government (Kerajaan Negeri Johor, ICT@Johor) that estimates the cost of ICT
systems using **Function Point Analysis (FPA)**.

**SmartFUSE / FUSE-AI** is an AI assistant bolted onto FUSE. A user describes a
system in plain language and the AI fills in the FPA estimation tables
automatically — no technical knowledge of databases, APIs, or FPA required.

The vision (per the requirement PDF, *"latest_AI SmartFUSE.pdf"*) is a **3-phase
AI pipeline**. The current codebase implements Phase 1 + Phase 2; Phase 3 is not
built (see §13 Gaps).

---

## 2. The 3-Phase vision (requirement spec)

### Phase 1 — Business Analyst AI (*AI Interview + Requirement Analysis*)
- The AI interviews the user about the system they want.
- It extracts and shows the user **two simple tables**:
  - **Fungsi Data (FD)** — `BIL | ENTITI` (entity names only)
  - **Fungsi Transaksi (FT)** — `BIL | PROSES MAKRO | PROSES GENERAL`
- This is the **only** thing the user sees in Phase 1.

### Phase 2 — Solution Architect AI (*FPA Analysis + JSON Formatter*)
- **Internal, hidden from the user.**
- Takes the FD/FT, determines **Aggregation Level**, picks **FPA components**,
  computes Function Point values, and structures everything into a standard
  **JSON payload**.

### Phase 3 — Software Engineer AI (*Back-end API Generator*)
- **Internal, hidden from the user.**
- Uses the JSON to generate a real system: DB schema, API, CRUD, auth, frontend
  routing — then **deploys it** and gives the user a live URL.
- **Not implemented in the current codebase.**

---

## 3. Current implementation status

| Phase | Spec | Built? | Notes |
|-------|------|--------|-------|
| 1 | Interview, extract FD/FT | ✅ | But the chat currently shows the *full* FPA tables, not the simple 2-column tables the spec wants. |
| 2 | FPA analysis + JSON | ✅ | Aggregat, komponen, min/ml/max, VAF, JSON payload all generated. Spec says this should be hidden; currently shown in chat. |
| 3 | Code generation + deploy | ❌ | Not built. "MASUKKAN KE DALAM SISTEM" only inserts the estimate into the FUSE tool. |

The real production FUSE system is a Laravel app at
`fuse-stg.johor.gov.my`. **This repo is a standalone HTML/JS + Node prototype**
of the AI chatbox, intended to integrate with that Laravel backend via
`/api/submit` (`LARAVEL_BACKEND_URL`).

---

## 4. Tech stack & how to run

**Frontend:** plain HTML + CSS + vanilla JS (no framework, no build step).
Open `index.html` directly in a browser (`file://`).

**Backend:** Node.js + Express, SQLite (`better-sqlite3`-style API via `db.js`).
AI calls go to the **DeepSeek API** (OpenAI-compatible SDK,
`baseURL: https://api.deepseek.com/v1`).

```bash
# Backend
cd backend
npm install
node server.js          # listens on http://localhost:3001
```

`backend/.env` must contain:
```
DEEPSEEK_API_KEY=sk-...          # (or legacy OPENROUTER_API_KEY)
DEEPSEEK_MODEL=deepseek-reasoner # optional; default deepseek-chat
JWT_SECRET=<min 16 chars>
ALLOWED_ORIGIN=*
LARAVEL_BACKEND_URL=             # optional; for /api/submit
PORT=3001
```

**Frontend → backend URL** is hard-coded in `js/ai-chatbox.js`:
`const AI_BACKEND_URL = 'http://localhost:3001';`

---

## 5. Repository structure

```
newest_AI_chat/
├── index.html              Main single-page app (all sections + AI modal markup)
├── laman-utama.html         (legacy/standalone home page)
├── css/
│   ├── styles.css          Global app styles, tables, action buttons
│   ├── dashboard.css       Dashboard + the "ASK AI" pill (.ai-ribbon)
│   ├── ai-modal.css        The entire AI chatbox modal (the big one)
│   └── auth.css            Login / register screens
├── js/
│   ├── app.js              Global state, navigation, FPA calculations,
│   │                       systems CRUD, all module-table renderers
│   ├── auth.js             Login/register, JWT, system persistence (auto-save)
│   ├── ai-assist.js        The "ASK AI" pill, modal launch animation
│   ├── ai-chatbox.js       The AI chatbox: conversation, two modes,
│   │                       payload apply, system dropdown, history
│   └── vaf-grid.js         Builds the 14-row VAF GSC grid
└── backend/
    ├── server.js           Express app: /api/chat, auth, systems, conversations
    ├── db.js               SQLite schema + all DB query functions
    ├── ref-tables.js       REF_FT / REF_FD reference data + validatePayload()
    ├── fuse.db             SQLite database file
    └── .env                Secrets (not committed)
```

> **Cache-busting:** JS/CSS includes in `index.html` carry `?v=N` query strings.
> Bump them whenever a file changes, or the browser serves stale code.

---

## 6. Architecture & data flow

### The app shell (`app.js`)
- Single-page app. Sections toggled by `switchSection(name)`:
  `laman-utama`, `analisis`, etc.
- Within Analisis Sistem, pages toggled by `switchMainPage(type)`:
  `senarai`, `fpa`, `pengurusan`, `perkakasan`.
- FPA sub-tabs via `switchPage(pageId)`: `page-data`, `page-trans`, `page-vaf`,
  `page-kos`.
- **Global state:** `let systems = {}` (keyed by kod), `let currentSystemCode`.
  Both mirrored to `window.*`. ⚠️ See §14 — `currentSystemCode` is block-scoped;
  use `window.setCurrentSystemCode(kod)` to change it from other files.

### The AI chatbox flow (estimate mode)
1. User opens the modal → `openAIModal('estimate')`.
2. User describes a system → `sendAIEstimate()` POSTs to `/api/chat`.
3. Backend prepends the **system prompt**, calls DeepSeek, returns
   `{ reply, payload, validation, truncated }`.
4. Frontend strips the JSON from the visible text, renders the 4 markdown
   tables, and shows a green **"MASUKKAN KE DALAM SISTEM"** card.
5. User clicks it → `applyAiPayload()` → `aiApplyPayloadToSystems()` writes the
   system into `systems{}`, persists via `fuseSaveSystemsNow()`, and the card
   becomes **"PERGI KE KOS FPA"** which navigates to the FPA page.

### Persistence
- `auth.js` exposes `window.fuseScheduleSave()` (debounced) and
  `window.fuseSaveSystemsNow()` (immediate, skips DOM-persist).
- Both `PUT /api/systems` with the whole `systems` object.
- The AI uses `fuseSaveSystemsNow()` so it can't be clobbered by stale page DOM.

---

## 7. Data model (SQLite — `backend/db.js`)

```sql
users (
  id, email UNIQUE, password_hash, name, created_at
)

systems (
  id, user_id, kod, data (JSON blob), updated_at
  -- one row per system; `data` holds the full system object
)

conversations (
  id, user_id,
  title,
  system_kod   TEXT,                       -- linked system (nullable)
  mode         TEXT DEFAULT 'estimate',     -- 'estimate' | 'review'
  created_at, updated_at
)

chat_messages (
  id, conversation_id, role, content, created_at
  -- role = 'user' | 'assistant'
)
```

The `mode` column **separates the two chatboxes' histories** — the Analisis
Sistem chatbox (`estimate`) and the Laman Utama chatbox (`review`) never see
each other's conversations.

### Frontend system object shape
```js
{
  kod: "STBM",
  nama: "Sistem Tempahan Bilik Mesyuarat",
  keterangan: "...",
  fungsiData:  [ { entiti, aggregat, komponen, gandaan, catatan, saved } ],
  fungsiTrans: [ { makro, general, aggregat, komponen, gandaan, catatan, saved } ],
  vaf:         [ 14 integers, 0–5 ],
  pengurusan:  [ ... ],   // Kos Pengurusan items
  perkakasan:  [ ... ]    // Kos Perkakasan items
}
```

---

## 8. API reference (`backend/server.js`, port 3001)

| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| GET  | `/api/health` | — | `{ ok, model, laravel_configured, timestamp }` |
| POST | `/api/chat` | `{ messages[], mode }` | `{ reply, payload, validation, truncated }` |
| POST | `/api/submit` | `{ payload }` | forwards to Laravel |
| POST | `/api/auth/register` | `{ email, password, name }` | `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` |
| GET  | `/api/auth/me` | (Bearer) | `{ user }` |
| GET  | `/api/systems` | (Bearer) | `{ systems: { kod: {...} } }` |
| POST | `/api/systems` | one system | `{ ok }` |
| PUT  | `/api/systems` | `{ systems: {...} }` | `{ ok, count }` — bulk save |
| DELETE | `/api/systems/:kod` | (Bearer) | `{ ok }` |
| GET  | `/api/conversations` | `?mode=estimate\|review` | `{ conversations[] }` |
| POST | `/api/conversations` | `{ title, system_kod, mode }` | `{ conversation }` |
| GET  | `/api/conversations/:id` | (Bearer) | `{ conversation }` (with messages) |
| POST | `/api/conversations/:id/messages` | `{ role, content }` | `{ ok }` |
| PATCH | `/api/conversations/:id` | `{ title?, system_kod? }` | `{ ok }` |
| DELETE | `/api/conversations/:id` | (Bearer) | `{ ok }` |

Auth: JWT in `Authorization: Bearer <token>`, 7-day expiry.

`/api/chat` key fields:
- `mode: "estimate"` → uses `buildSystemPrompt()` (FPA generator).
- `mode: "review"` → uses `buildReviewPrompt()` (completeness auditor); no JSON extraction.
- `truncated: true` → DeepSeek hit `max_tokens` (8192); the reply is incomplete.

---

## 9. The two AI chatbox modes

The **same** modal is reused for both; `aiChatMode` (in `ai-chatbox.js`) decides
behavior.

### `estimate` — Analisis Sistem → "FUSE AI" pill
- Opener: `openAIModal('estimate')`.
- Left sidebar = **conversation history**.
- Generates the 4 FPA tables + JSON; user applies them into a system.
- Has the top-right **system dropdown** (pick which system to edit/create).

### `review` — Laman Utama → "SEMAK AI" pill
- Opener: `openAIReviewPanel()` → `openAIModal('review')`.
- Left sidebar = **list of registered systems** (click one to *focus* it).
- No top-right dropdown, no "Perbualan Baru" button.
- The AI **audits completeness** — reports a readiness % per system and which
  parts (FD / FT / VAF / Kos) are done / partial / missing. No payload, no apply.

---

## 10. FPA domain knowledge

### Function types
- **FD — Fungsi Data** (data functions): the entities/data stores the system
  manages. Maps to ILF/EIF concepts.
- **FT — Fungsi Transaksi** (transaction functions): the elementary processes.
  Maps to EI/EQ/EO.
  - **EI** (External Input) — user enters new data (register, add record).
  - **EQ** (External Inquiry) — display data, no extra logic (list, search).
  - **EO** (External Output) — output *with* processing logic (report, stats).
  - **ILF** — Internal Logical File (data this system stores).
  - **EIF** — External Interface File (data referenced from another system).

### Aggregat (complexity / detail level)
- **FT** has 4 levels: `1` Amat Terperinci, `2` Terperinci,
  `3` Kurang Perincian, `4` Tiada Perincian.
- **FD** has 3 levels: `1` Amat Terperinci, `2` Kurang Perincian,
  `3` Tiada Perincian.

### REF_FT — transaction component reference (`ref-tables.js`)
| id | komponen | aggregat | min | ml | max |
|----|----------|----------|-----|----|----|
| 1 | EIL - EI low | 1 | 3 | 3 | 3 |
| 2 | EIA - EI average | 1 | 4 | 4 | 4 |
| 3 | EIH - EI high | 1 | 6 | 6 | 6 |
| 4 | EQL - EQ low | 1 | 3 | 3 | 3 |
| 5 | EQA - EQ average | 1 | 4 | 4 | 4 |
| 6 | EQH - EQ high | 1 | 6 | 6 | 6 |
| 7 | EOL - EO low | 1 | 4 | 4 | 4 |
| 8 | EOA - EO average | 1 | 5 | 5 | 5 |
| 9 | EOH - EO high | 1 | 7 | 7 | 7 |
| 10 | GEI - Generic EI | 2 | 4.0 | 4.2 | 4.4 |
| 11 | GEQ - Generic EQ | 2 | 3.7 | 3.9 | 4.1 |
| 12 | GEO - Generic EO | 2 | 4.9 | 5.2 | 5.4 |
| 13 | UGO - Unspecified Generic Output (EQ/EO) | 2 | 4.1 | 4.6 | 5.0 |
| 14 | UGEP - Unspecified Generic Elementary Process (EI/EQ/EO) | 2 | 4.3 | 4.6 | 4.8 |
| 15 | TPS - small (CRUD) | 3 | 14.1 | 16.5 | 19.0 |
| 16 | TPM - medium (CRUD+List) | 3 | 17.9 | 21.1 | 24.3 |
| 17 | TPL - large (CRUD+List+Report) | 3 | 22.3 | 26.3 | 30.2 |
| 18 | GPS - small 6-10 UEPs | 3 | 26.4 | 35.2 | 44.0 |
| 19 | GPM - medium 11-15 UEPs | 3 | 42.9 | 57.2 | 71.5 |
| 20 | GPL - large 16-20 UEPs | 3 | 59.4 | 79.2 | 98.9 |
| 21 | MPS - small 2-4 Generic GPs | 4 | 111.5 | 171.5 | 231.5 |
| 22 | MPM - medium 5-7 Generic GPs | 4 | 185.8 | 285.9 | 385.9 |
| 23 | MPL - large 8-10 Generic GPs | 4 | 297.3 | 457.4 | 617.4 |

### REF_FD — data component reference (`ref-tables.js`)
| id | komponen | aggregat | min | ml | max |
|----|----------|----------|-----|----|----|
| 1 | ILFL - low | 1 | 6.5 | 7.0 | 7.5 |
| 2 | ILFM - medium | 1 | 9.5 | 10.0 | 10.5 |
| 3 | ILFH - high | 1 | 14.5 | 15.0 | 15.5 |
| 4 | EIFL - low | 1 | 4.5 | 5.0 | 5.5 |
| 5 | EIFM - medium | 1 | 6.5 | 7.0 | 7.5 |
| 6 | EIFH - high | 1 | 9.5 | 10.0 | 10.5 |
| 7 | GILF - Generic ILF | 2 | 7.4 | 7.7 | 8.1 |
| 8 | GEIF - Generic EIF | 2 | 5.2 | 5.4 | 5.7 |
| 9 | UGDG - Unspecified Generic Data Group | 2 | 6.4 | 7.0 | 7.8 |
| 10 | GDGS - small 2-4 ULF | 3 | 15.0 | 21.4 | 27.8 |
| 11 | GDGM - medium 5-8 ULF | 3 | 32.4 | 46.3 | 60.2 |
| 12 | GDGL - large 9-13 ULF | 3 | 54.8 | 78.3 | 101.8 |

> ⚠️ The `komponen` strings use `" - "` as separator (`"ILFM - medium"`). This
> must stay — the frontend `DATA_COMPONENTS` / `TRANS_COMPONENTS` catalogs in
> `app.js` match on this exact string. The AI sometimes breaks markdown table
> rows at the `- `; the frontend renderer + JSON repair handle that.

### VAF — 14 GSC (General System Characteristics)
Each scored 0–5 (0 = no influence, 5 = strong influence), **fixed order**:
1. Data Communications
2. Distributed Data Processing
3. Performance
4. Heavily Used Configuration
5. Transaction Rate
6. On-line Data Entry
7. End-User Efficiency
8. On-Line Update
9. Complex Processing
10. Reusability
11. Installation Ease
12. Operational Ease
13. Multiple Sites
14. Facilitate Change

### Cost formulas
```
uFP Fungsi Data (A)        = Σ FD values
uFP Fungsi Transaksi (B)   = Σ FT values
uFP total (C)              = A + B
TDI (Total Degree of Influence) = Σ all 14 VAF values
VAF Score (D)              = (TDI × 0.01) + 0.65
aFP (adjusted FP)          = C × D
Kos (RM)                   = aFP × RM 1,200
Mandays                    = (aFP × 10) / 8
```
The estimate carries MIN / ML (most likely) / MAX columns throughout.

---

## 11. The AI system prompts (`backend/server.js`)

### `buildSystemPrompt()` — estimate mode
Instructs the AI to act as the FUSE estimation engine. Key rules:
- Take any system description → immediately generate the **4 tables** + JSON.
- Output order is fixed: **FD → FT → VAF → Penganggaran Kos**, each as a `##`
  markdown section, then a fenced ```json block last.
- Embeds the full REF_FT / REF_FD tables so the AI uses valid `ref_ft_id` /
  `ref_fd_id` and matching min/ml/max.
- Must NOT write essays, "process flow" proposals, or announce the JSON.

### `buildReviewPrompt()` — review mode
Instructs the AI to act as a **completeness auditor**: given a snapshot of all
registered systems, report a readiness % per system and a ✅/⚠️/❌ status table
for each part (Keterangan / FD / FT / VAF / Kos Pengurusan). No JSON, no tables
to apply.

---

## 12. JSON payload contract

The estimate-mode AI emits this at the end of its reply (fenced in ```json). The
backend extracts + validates it; the frontend applies it to a system.

```json
{
  "user_id": 2,
  "nama": "Sistem Tempahan Bilik Mesyuarat",
  "keterangan": "Penerangan ringkas sistem",
  "FT_Sistem": [
    {
      "macroproses": "Akses Sistem",
      "general_proses": "Log Masuk",
      "aggregat": 1,
      "komponen": "EIA - EI average",
      "ft_multiplier": 1,
      "ft_min": 4.0, "ft_ml": 4.0, "ft_max": 4.0,
      "ft_mmin": 4.0, "ft_mml": 4.0, "ft_mmax": 4.0,
      "keterangan": "",
      "ref_ft_id": 2,
      "status": 1
    }
  ],
  "FD_Sistem": [
    {
      "entiti": "Pengguna",
      "aggregat": 2,
      "komponen": "GILF - Generic ILF",
      "fd_multiplier": 1,
      "fd_min": 7.4, "fd_ml": 7.7, "fd_max": 8.1,
      "fd_mmin": 7.4, "fd_mml": 7.7, "fd_mmax": 8.1,
      "keterangan": "",
      "ref_fd_id": 7,
      "status": 1
    }
  ],
  "VAF": [3, 2, 4, 2, 3, 4, 4, 3, 2, 1, 2, 3, 0, 3]
}
```

**Validation rules** (`validatePayload()` in `ref-tables.js`):
- `ref_ft_id` / `ref_fd_id` must exist in the ref tables.
- `*_min/_ml/_max` must match the ref-table values exactly.
- `*_mmin = *_min × multiplier` (and so on).
- `VAF` must be exactly 14 integers, each 0–5.
- The backend `repairJsonString()` fixes a common AI mistake: literal newlines
  inside JSON string values.

---

## 13. Known gaps vs the requirement PDF

1. **Phase 1 over-shares.** The spec wants the chat to show only simple
   `BIL | ENTITI` and `BIL | MAKRO | GENERAL` tables. The current chatbox shows
   the *full* FPA breakdown (aggregat, komponen, min/ml/max, VAF, cost) — which
   the spec assigns to **Phase 2 (hidden)**.
2. **No phased progress UI.** The PDF mockup (page 15) shows a 4-step stepper —
   *FPA Analysis → Aggregation Detection → JSON Formatter → Result Generation* —
   after the user confirms FD/FT. Not implemented (only rotating "thinking"
   labels exist).
3. **Phase 3 missing entirely.** No code generation, no deployment, no
   system-URL output. "MASUKKAN KE DALAM SISTEM" just inserts the estimate into
   the FUSE tool. Likely needs supervisor clarification on whether Phase 3 must
   be functional or conceptual.

A clean reconciliation for gaps 1–2: chat shows the simple tables → run the
4-step animation → the FPA detail lives on the **Kos FPA page**, which is
effectively "the result."

---

## 14. Conventions & gotchas

- **Cache-busting:** every JS/CSS `<script>`/`<link>` in `index.html` has
  `?v=N`. Bump it on every change or the browser serves stale files. Always
  hard-reload (Ctrl+Shift+R) when testing.
- **`currentSystemCode` scope trap:** `app.js` declares `let currentSystemCode`
  (block-scoped). Writing `window.currentSystemCode` does **not** update it.
  Use `window.setCurrentSystemCode(kod)` from other files.
- **Two parallel `systems` references:** `app.js`'s local `systems` and
  `window.systems` are the same object — mutating either works.
- **AI markdown quirks** the frontend defends against: rows split across lines
  at `- `; missing/truncated ```json fences; raw newlines inside JSON strings;
  blank-line-free output. See `aiFormatMarkdown`, `aiRenderMdTable`,
  `aiStripJsonBlock`, `aiExtractPayloadFromText` in `ai-chatbox.js`.
- **Logo animation:** the infinity-ribbon logo animates only while
  `body.ai-generating` / on the active thinking bubble; static otherwise.
- **Saving requires login** — `fuseScheduleSave` needs a JWT. Without login,
  systems live only in memory and are lost on reload.
- **`max_tokens` is 8192.** Big systems can still truncate; the frontend
  auto-retries once on truncation (`aiTruncRetryDone` guard).

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| FPA | Function Point Analysis — the sizing methodology |
| FD | Fungsi Data — data functions (entities) |
| FT | Fungsi Transaksi — transaction functions (processes) |
| Proses Makro | Macro process — a process category |
| Proses General | General process — a specific process |
| Aggregat | Complexity / detail level (1–3 for FD, 1–4 for FT) |
| Komponen | The FPA component label (e.g. `EIA - EI average`) |
| VAF | Value Adjustment Factor |
| GSC | General System Characteristic (14 of them) |
| TDI | Total Degree of Influence (Σ of the 14 GSC) |
| uFP | unadjusted Function Points |
| aFP | adjusted Function Points (uFP × VAF) |
| Mandays | Effort estimate = (aFP × 10) / 8 |
| Kos FPA | The FPA-derived cost (RM 1,200 per FP) |
| kod | Short system code (e.g. `STBM`, `001`) |
| Kerajaan Negeri Johor | Johor State Government — the client |

---

*End of context document. The codebase is a working prototype; the requirement
PDF is the target spec. The biggest open decision is the scope of Phase 3.*

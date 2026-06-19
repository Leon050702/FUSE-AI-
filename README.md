# FUSE-AI — Penjanaan Automatik Anggaran Sistem Berasaskan AI

An AI-assisted FPA (Function Point Analysis) cost estimator for the Johor State
Government SMART FUSE platform. A non-technical user describes an ICT system in plain
Bahasa Malaysia; the AI classifies it into Fungsi Data (ILF/EIF) and Fungsi Transaksi
(EI/EO/EQ), suggests the 14 VAF/GSC values, generates the four FPA cost tables, and
produces a validated JSON payload that is submitted to the real FUSE staging backend.

> **SCSE2243 – Application Development 1** · Group **API NOT FOUND** · Section 03

| Member | Matric | Subsystem |
|--------|--------|-----------|
| Ching Leong Chen | A24CS5040 | 3.0 AI Logic Subsystem |
| Muhammad Adam Afifin Bin Sani Amril | A24CS0270 | 5.0 Frontend Integration & UI Subsystem |
| Muhammad Az-Aqiel Anaqi Bin Ahmad Zamri | A24CS0277 | 6.0 QA, Testing & Data Pipeline Subsystem |
| Mohamad Nazhan Bin Abdul Rahman | A24CS0116 | 4.0 Backend API & Data Bridge Subsystem |

---

## Module → Frontend Script Index

Each member owns one subsystem (three modules). The table maps every module to the
script(s) that implement it, so you can jump from the design report straight to the code.

### 3.0 AI Logic Subsystem — Ching Leong Chen

| Module | Frontend / Implementation Script |
|--------|----------------------------------|
| 3.1 AI Chat Interface Module | [ai-chatbox.js](frontend/js/ai-chatbox.js) · [dropdown](frontend/js/ai-chatbox.js#L152) · [conversation load](frontend/js/ai-chatbox.js#L343) |
| 3.2 FPA Classification Module | [ref-tables.js](backend/ref-tables.js) · [REF_FT](backend/ref-tables.js#L19) · [REF_FD](backend/ref-tables.js#L55) · [validatePayload](backend/ref-tables.js#L99) |
| 3.3 AI Processing Engine Module | [server.js](backend/server.js) · [system prompt](backend/server.js#L58) · [/api/chat](backend/server.js#L419) · [extractJson](backend/server.js#L383) |

### 4.0 Backend API & Data Bridge Subsystem — Mohamad Nazhan Bin Abdul Rahman

| Module | Frontend / Implementation Script |
|--------|----------------------------------|
| 4.1 Interactive AI Assistant Interface Module | [ai-assist.js](frontend/js/ai-assist.js) |
| 4.2 AI Analysis Execution Module | [server.js](backend/server.js#L419) · [ref-tables.js](backend/ref-tables.js) |
| 4.3 Automated Data Mapping Module | [ai-chatbox.js](frontend/js/ai-chatbox.js) · [db.js](backend/db.js) |

### 5.0 Frontend Integration & UI Subsystem — Muhammad Adam Afifin Bin Sani Amril

| Module | Frontend / Implementation Script |
|--------|----------------------------------|
| 5.1 AI Gateway & Routing Module | [ai-chatbox.js](frontend/js/ai-chatbox.js) · [app.js](frontend/js/app.js) |
| 5.2 Data Transformation & Response Handling Module | [ai-chatbox.js](frontend/js/ai-chatbox.js) · [server.js](backend/server.js#L383) |
| 5.3 API Performance & Reliability Module | [server.js](backend/server.js) · [db.js](backend/db.js) |

### 6.0 QA, Testing & Data Pipeline Subsystem — Muhammad Az-Aqiel Anaqi Bin Ahmad Zamri

| Module | Frontend / Implementation Script |
|--------|----------------------------------|
| 6.1 Data Pipeline Integration & Integrity Module | [ref-tables.js](backend/ref-tables.js#L99) · [test-fuse-submit.js](backend/test-fuse-submit.js) |
| 6.2 AI Hallucination & Prompt Guard Module | [server.js](backend/server.js#L58) · [repairJsonString](backend/server.js#L355) |
| 6.3 Automated API & Edge-Case Testing Module | [test-fuse-token.js](backend/test-fuse-token.js) · [test-fuse-submit.js](backend/test-fuse-submit.js) |

---

## Setup

### Requirements
- **Node.js** (LTS 18+) — [nodejs.org](https://nodejs.org) (npm is bundled)
- A **DeepSeek API key** — [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- A modern web browser

### Steps
```bash
cd backend
npm install
# create backend/.env (see below) — it is NOT in git
npm start          # → ✅ listening on http://localhost:3001
```
Then open `index.html` in your browser. Keep both running together.

### Environment (`backend/.env`)
`.env` is git-ignored because it holds secrets. Each developer creates their own:
```
DEEPSEEK_API_KEY=your_deepseek_key
PORT=3001
DEEPSEEK_MODEL=deepseek-chat
ALLOWED_ORIGIN=*
JWT_SECRET=any-long-random-string-at-least-32-chars
```

---

## Architecture (3-Layer)

```
Presentation Layer   index.html · laman-utama.html · css/ · js/
        │  API / service calls
Application Layer     backend/server.js  (auth, FPA engine, AI proxy, validation)
        │  DB queries / external API
Data Layer           backend/db.js (SQLite) · ref_ft / ref_fd reference tables
```

## Project Structure
```
FUSE-AI/
├── frontend/
│   ├── index.html          Main app (Analisis Sistem, dashboard, AI chatbox)
│   ├── laman-utama.html    Home / landing page
│   └── js/                 Frontend scripts (see index above)
└── backend/                Node/Express server + SQLite DB
    ├── server.js           AI proxy, /api/chat, auth, systems, FUSE submit
    ├── db.js               SQLite layer
    └── ref-tables.js       ref_ft / ref_fd + payload validation
```

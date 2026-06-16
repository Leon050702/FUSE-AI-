# SMART FUSE — AI Cost Estimator

An AI-assisted FPA (Function Point Analysis) cost estimator for Johor State Government
ICT systems. A user describes a system in plain language; the AI generates the four
FPA cost tables (Fungsi Data → Fungsi Transaksi → VAF → Penganggaran Kos) and a JSON
payload that can be submitted to the real FUSE staging backend.

---

## Module to Frontend Script Mapping

This index helps you navigate quickly between each functional module and the script
that implements it.

| Module | Frontend Script |
|--------|-----------------|
| **Authentication** (register / login / JWT session, auto-save) | [auth.js](js/auth.js) |
| **Core App & System Management** (global state, Senarai Sistem, inline edit, FPA pages, navigation) | [app.js](js/app.js) |
| **AI Chatbox** (multi-turn estimate + Semak AI completeness review, per-system chats, submit to FUSE) | [ai-chatbox.js](js/ai-chatbox.js) |
| **AI Assist Layer** (auto-fill for Fungsi Data + Konfigurasi VAF) | [ai-assist.js](js/ai-assist.js) |
| **VAF Grid** (14 GSC configuration grid + score calculation) | [vaf-grid.js](js/vaf-grid.js) |

### Backend Scripts

| Module | Backend Script |
|--------|----------------|
| **API Server** (chat proxy, auth, systems CRUD, FUSE submit) | [server.js](backend/server.js) |
| **Database Layer** (SQLite — users, systems, conversations) | [db.js](backend/db.js) |
| **Reference Tables & Validation** (ref_ft / ref_fd, payload validation) | [ref-tables.js](backend/ref-tables.js) |

---

## Setup

### Requirements
- **Node.js** (LTS 18+) — [nodejs.org](https://nodejs.org) (npm is included)
- A **DeepSeek API key** — [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- A modern web browser

### Steps
```bash
cd backend
npm install
# create backend/.env (see below)
npm start          # → ✅ listening on http://localhost:3001
```
Then open `index.html` in your browser. Keep both running together.

### Environment (`backend/.env`)
`.env` is **not** committed to git (it holds secrets). Create your own:
```
DEEPSEEK_API_KEY=your_deepseek_key
PORT=3001
DEEPSEEK_MODEL=deepseek-chat
ALLOWED_ORIGIN=*
JWT_SECRET=any-long-random-string-at-least-32-chars
```

---

## Project Structure
```
newest_AI_chat/
├── index.html              Main app (Analisis Sistem, dashboard, AI chatbox)
├── laman-utama.html        Home / landing page
├── css/                    styles.css, dashboard.css, ai-modal.css, auth.css
├── js/                     Frontend scripts (see table above)
└── backend/                Node/Express server + SQLite DB
    ├── server.js
    ├── db.js
    └── ref-tables.js
```

# FUSE-AI — Task Distribution (with Code Links)

Group **API NOT FOUND** · SCSE2243 Application Development 1 · Section 03
Repository: https://github.com/Leon050702/FUSE-AI-

---

## Task Distribution by Member

| Member | Matric | Subsystem | Key Responsibilities | Code |
|--------|--------|-----------|----------------------|------|
| **Ching Leong Chen** | A24CS5040 | 3.0 AI Logic | AI chatbox, FPA classification & validation, AI processing engine | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) · [server.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js) · [ref-tables.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js) |
| **Mohamad Nazhan Bin Abdul Rahman** | A24CS0116 | 4.0 Backend API & Data Bridge | AI assistant interface, analysis execution, data mapping | [ai-assist.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-assist.js) · [server.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L419) · [db.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/db.js) |
| **Muhammad Adam Afifin Bin Sani Amril** | A24CS0270 | 5.0 Frontend Integration & UI | AI gateway/routing, response handling, performance & reliability | [app.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/app.js) · [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) |
| **Muhammad Az-Aqiel Anaqi Bin Ahmad Zamri** | A24CS0277 | 6.0 QA, Testing & Data Pipeline | Data pipeline integrity, prompt guard, edge-case testing | [validatePayload](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js#L99) · [test-fuse-token.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/test-fuse-token.js) · [test-fuse-submit.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/test-fuse-submit.js) |

---

## Detailed Breakdown — Ching Leong Chen (3.0 AI Logic Subsystem)

| # | Task | Module | Code |
|---|------|--------|------|
| 1 | AI chat interface (modal, bubbles, send/receive) | 3.1 | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) |
| 2 | Two chat modes — Estimate (FPA tables) + Semak AI (review) | 3.1 | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) |
| 3 | Per-system conversation history & system linking | 3.1 | [aiSwitchConversation](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js#L343) · [dropdown](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js#L152) |
| 4 | Bahasa Malaysia system prompt (forces valid FPA output) | 3.3 | [buildSystemPrompt](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L58) |
| 5 | /api/chat endpoint with live streaming progress | 3.3 | [/api/chat](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L419) |
| 6 | JSON extraction + auto-repair of malformed AI output | 3.3 | [extractJson](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L383) |
| 7 | Anti-hallucination validation against ref_ft / ref_fd | 3.2 | [validatePayload](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js#L99) |
| 8 | Submission to real FUSE staging (token + FT/FD data) | integration | [test-fuse-submit.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/test-fuse-submit.js) |

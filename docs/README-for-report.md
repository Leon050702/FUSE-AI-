# FUSE-AI — Module → Script Index (Report Version)

> This version uses **full GitHub URLs** so the links remain clickable when this
> table is placed inside the PDF report. Repo: https://github.com/Leon050702/FUSE-AI-

---

## 3.0 AI Logic Subsystem — Ching Leong Chen (A24CS5040)

| Module | Implementation Script |
|--------|-----------------------|
| 3.1 AI Chat Interface Module | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) · [dropdown](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js#L152) · [conversation load](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js#L343) |
| 3.2 FPA Classification Module | [ref-tables.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js) · [REF_FT](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js#L19) · [REF_FD](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js#L55) · [validatePayload](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js#L99) |
| 3.3 AI Processing Engine Module | [server.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js) · [system prompt](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L58) · [/api/chat](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L419) · [extractJson](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L383) |

## 4.0 Backend API & Data Bridge Subsystem — Mohamad Nazhan Bin Abdul Rahman (A24CS0116)

| Module | Implementation Script |
|--------|-----------------------|
| 4.1 Interactive AI Assistant Interface Module | [ai-assist.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-assist.js) |
| 4.2 AI Analysis Execution Module | [server.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L419) · [ref-tables.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js) |
| 4.3 Automated Data Mapping Module | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) · [db.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/db.js) |

## 5.0 Frontend Integration & UI Subsystem — Muhammad Adam Afifin Bin Sani Amril (A24CS0270)

| Module | Implementation Script |
|--------|-----------------------|
| 5.1 AI Gateway & Routing Module | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) · [app.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/app.js) |
| 5.2 Data Transformation & Response Handling Module | [ai-chatbox.js](https://github.com/Leon050702/FUSE-AI-/blob/main/frontend/js/ai-chatbox.js) · [server.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L383) |
| 5.3 API Performance & Reliability Module | [server.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js) · [db.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/db.js) |

## 6.0 QA, Testing & Data Pipeline Subsystem — Muhammad Az-Aqiel Anaqi Bin Ahmad Zamri (A24CS0277)

| Module | Implementation Script |
|--------|-----------------------|
| 6.1 Data Pipeline Integration & Integrity Module | [validatePayload](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/ref-tables.js#L99) · [test-fuse-submit.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/test-fuse-submit.js) |
| 6.2 AI Hallucination & Prompt Guard Module | [system prompt](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L58) · [repairJsonString](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/server.js#L355) |
| 6.3 Automated API & Edge-Case Testing Module | [test-fuse-token.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/test-fuse-token.js) · [test-fuse-submit.js](https://github.com/Leon050702/FUSE-AI-/blob/main/backend/test-fuse-submit.js) |

# FUSE-AI Chatbox — Backend

Node/Express proxy that:
1. Holds the DeepSeek API key server-side (never exposed to the browser).
2. Embeds the `ref_ft` / `ref_fd` reference tables in the system prompt so the AI picks valid IDs only.
3. Validates AI-generated payloads (FT, FD, VAF) against those ref tables before letting them through.
4. Optionally forwards the validated payload to the Laravel FUSE-AI backend.

---

## Setup

From this folder (`newest AI chat/backend`):

```bash
npm install
npm start
```

You should see:
```
✅ FUSE-AI Chatbox backend listening on http://localhost:3001
```

The frontend (`newest AI chat/index.html`) talks to this server at `http://localhost:3001` — keep both running side-by-side.

### Environment (`.env`)

Already pre-filled. Override anything you need:

| Var | Default | Purpose |
|-----|---------|---------|
| `DEEPSEEK_API_KEY` | (required) | Get one from https://platform.deepseek.com/api_keys |
| `DEEPSEEK_MODEL`   | `deepseek-chat` | Use `deepseek-reasoner` for higher-quality (slower) replies |
| `PORT`             | `3001` | Server port |
| `ALLOWED_ORIGIN`   | `*` | CORS — set to your real frontend URL in production |
| `LARAVEL_BACKEND_URL` | (empty) | If set, "Hantar ke FUSE-AI" forwards payloads here |

---

## Endpoints

### `GET /api/health`
Returns `{ ok, model, laravel_configured, timestamp }`. Used by the frontend status pill.

### `POST /api/chat`
The main chat endpoint.

Request:
```json
{
  "messages": [
    { "role": "user", "content": "I want a hostel booking system..." },
    { "role": "assistant", "content": "Got it. Who uses it?..." },
    { "role": "user", "content": "Students and admin staff." }
  ]
}
```

Response:
```json
{
  "reply":   "...full text from AI, may include a ```json block```...",
  "payload": { /* parsed JSON if AI generated one, else null */ },
  "validation": { "ok": true, "errors": [] }
}
```

### `POST /api/submit`
Forwards a validated payload to the Laravel backend (URL set via `LARAVEL_BACKEND_URL` in `.env`).

Request:
```json
{ "payload": { /* the JSON the AI produced */ } }
```

---

## Replacing the dummy ref tables with real data

The arrays at the top of `ref-tables.js` (`REF_FT` and `REF_FD`) drive everything — the system prompt, the validation, and the value matching. Keep the same keys and the rest of the codebase stays unchanged.

The current values are taken from the FUSE government FPA tables (matching the frontend `DATA_COMPONENTS` / `TRANS_COMPONENTS` catalog in `js/app.js`).

To export from MySQL:
```sql
SELECT id, komponen, aggregat, ft_min, ft_ml, ft_max FROM ref_ft;
SELECT id, komponen, aggregat, fd_min, fd_ml, fd_max FROM ref_fd;
```

---

## Connecting to the Laravel FUSE-AI backend

1. Find the Laravel route that accepts the new-system payload (e.g. `POST /api/sistem/store`).
2. Set it in `.env`:
   ```
   LARAVEL_BACKEND_URL=http://localhost:8000/api/sistem/store
   ```
3. Restart the backend.
4. The "Hantar ke FUSE-AI" button on the frontend will now POST validated payloads there.

If the Laravel endpoint requires auth (CSRF / Sanctum / API token), add the header in `server.js` inside the `/api/submit` handler.

---

## Production checklist

- [ ] Set `ALLOWED_ORIGIN` to the real frontend URL (not `*`)
- [ ] Put the server behind HTTPS
- [ ] Add auth (JWT / session) so only the app can hit `/api/chat`
- [ ] Add a per-user rate limit (e.g. `express-rate-limit` with Redis)
- [ ] Monitor token usage in the DeepSeek console

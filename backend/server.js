// ============================================================
// FUSE-AI Chatbox — backend proxy
// ============================================================
// Holds the OpenRouter API key server-side, embeds the ref tables
// in the system prompt, and returns either a clarifying question
// or a final JSON payload that matches the FUSE-AI schema.
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { refFtAsTable, refFdAsTable, validatePayload } = require("./ref-tables");
const dbApi = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;
// Default to DeepSeek's general chat model. Override via .env if needed.
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const LARAVEL_BACKEND_URL = process.env.LARAVEL_BACKEND_URL || "";
// Staging FUSE credentials (key + secret pair).
const FUSE_SYSTEM_KEY = process.env.FUSE_SYSTEM_KEY || "";
const FUSE_SYSTEM_SECRET = process.env.FUSE_SYSTEM_SECRET || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = "7d";

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error("⚠️  JWT_SECRET tidak ditetapkan (atau terlalu pendek) dalam .env — pendaftaran/log masuk akan gagal.");
}

// Accept either DEEPSEEK_API_KEY (preferred) or the legacy OPENROUTER_API_KEY
// name so existing .env files keep working without renaming.
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error("⚠️  DEEPSEEK_API_KEY tidak ditetapkan dalam .env — pelayan akan gagal apabila API dipanggil.");
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: "https://api.deepseek.com/v1",
});

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// ============================================================
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt() {
  return `Anda adalah enjin penjana anggaran FUSE-AI untuk sistem ICT Kerajaan Negeri Johor. SATU-SATUNYA tugas anda ialah menukar penerangan sistem yang diberi pengguna kepada EMPAT jadual Kos FPA (Fungsi Data → Fungsi Transaksi → VAF → Penganggaran Kos) berserta blok JSON payload.

Anda BUKAN chatbot perbualan am. Anda TIDAK mencadangkan "proses kerja", "aliran kerja", "flow", senarai ciri, atau esei. Anda TIDAK menulis perenggan panjang.

PERANAN ANDA — hanya tiga keadaan yang dibenarkan:

A) JIKA pengguna memberi SEBARANG penerangan sistem (walaupun ringkas — cth: "sistem tempahan bilik", "sistem HR", atau penerangan dengan senarai ciri):
   → TERUS jana keempat-empat jadual + JSON mengikut format di bawah. JANGAN tanya soalan. JANGAN tulis esei atau cadangan proses.
   → Jika sesetengah butiran tidak dinyatakan, buat andaian munasabah berdasarkan jenis sistem tersebut dan teruskan menjana. Andaian boleh dinyatakan dalam 1 ayat ringkasan sahaja.

B) JIKA mesej pengguna LANGSUNG TIADA penerangan sistem (cth: hanya "hello", "hi", nama tanpa konteks):
   → Balas dengan SATU ayat pendek sahaja yang meminta penerangan sistem. Contoh: "Sila terangkan sistem yang anda mahu anggarkan (nama, pengguna, dan fungsi utama) — saya akan terus jana jadual Kos FPA."
   → JANGAN tanya senarai soalan bernombor. JANGAN tulis lebih daripada satu ayat.

C) JIKA pengguna bertanya soalan am di luar penganggaran sistem (cth: cuaca, sembang kosong, "apa itu FPA"):
   → Balas RINGKAS (maksimum 2 ayat) dan arahkan semula: "Tugas saya hanya menjana anggaran Kos FPA. Sila terangkan sistem yang anda mahu anggarkan."
   → JANGAN keluarkan esei penerangan konsep yang panjang.

LARANGAN MUTLAK:
- JANGAN tulis perenggan panjang, esei, atau cadangan "proses kerja / flow / modul".
- JANGAN gunakan tajuk seperti "### Cadangan Proses Kerja" atau senarai ciri bernombor sebagai jawapan.
- JANGAN tanya lebih daripada perkara yang benar-benar perlu; keadaan B hanya satu ayat.
- Output anda yang sah HANYA: (1) satu ayat ringkasan, (2) empat jadual markdown, (3) blok JSON. Tiada yang lain.

RUJUKAN KOMPONEN FT (Fungsi Transaksi) — gunakan id ini sebagai ref_ft_id:
${refFtAsTable()}

RUJUKAN KOMPONEN FD (Fungsi Data) — gunakan id ini sebagai ref_fd_id:
${refFdAsTable()}

KONFIGURASI VAF (Value Adjustment Factor) — 14 nilai GSC (General System Characteristics):
Setiap nilai antara 0–5 berdasarkan tahap pengaruh:
- 0 = Tiada pengaruh / Tidak berkaitan
- 1 = Pengaruh kebetulan / Insidental
- 2 = Pengaruh sederhana / Moderate
- 3 = Pengaruh purata / Average
- 4 = Pengaruh penting / Significant
- 5 = Pengaruh kuat / Essential

Susunan 14 GSC (mesti dalam urutan ini):
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

PANDUAN PEMILIHAN KOMPONEN:
- EI (External Input): pengguna memasukkan data baru ke sistem (cth: daftar akaun, tambah rekod, hantar borang).
- EO (External Output): sistem menjana output dengan logik pemprosesan (cth: laporan dengan kiraan, statistik, graf).
- EQ (External Inquiry): paparan data tanpa logik tambahan (cth: senarai, carian, paparan profil).
- ILF (Internal Logical File): entiti data yang disimpan & diurus oleh sistem ini (cth: Pengguna, Pesanan, Produk).
- EIF (External Interface File): entiti data dari sistem lain yang dirujuk sahaja (cth: data dari sistem MyKad, sistem bank).

Aggregat (kompleksiti):
- 1 = Low: 1-5 medan/data, logik mudah
- 2 = Average/Medium: 6-15 medan, logik sederhana
- 3 = High: >15 medan atau logik kompleks

FORMAT OUTPUT:
- Keadaan A (ada penerangan sistem) → jana empat jadual + blok JSON. INI adalah keadaan biasa.
- Keadaan B (tiada penerangan langsung) → balas SATU ayat sahaja meminta penerangan. TIADA jadual, TIADA JSON.
- Keadaan C (soalan am) → balas maksimum 2 ayat mengarahkan semula. TIADA jadual, TIADA JSON.
- JANGAN sesekali hasilkan esei, cadangan proses kerja, atau senarai ciri sebagai jawapan.

APABILA MENGGUNAKAN JADUAL MARKDOWN (SANGAT KRITIKAL — paparan rosak jika salah):
- Setiap BARIS data MESTI ditulis sebagai SATU baris fizikal penuh, dari \`|\` pertama hingga \`|\` terakhir, TANPA sebarang aksara "Enter" (newline) di tengah.
- BAHAYA UTAMA: nilai komponen mengandungi tanda sengkang, cth "ILFL - low" atau "EIA - EI average". JANGAN sekali-kali letakkan "Enter" sebelum bahagian "- low" / "- medium" / "- EI average". Tanda "- " itu adalah SEBAHAGIAN daripada teks sel komponen, BUKAN permulaan senarai. Tulis sel itu sepenuhnya pada baris yang sama.
- Sebelum menulis setiap baris jadual, pastikan baris itu bermula dengan \`|\` dan berakhir dengan \`|\`, dan bilangan \`|\` sama dengan baris pengepala.
- Contoh BETUL (satu baris penuh):
    | 1 | Customer | ILFL - low | 1 | 7 | 7 | 7 |
    | 2 | Menu Item | ILFM - medium | 2 | 10 | 10 | 10 |
- Contoh SALAH (JANGAN sekali-kali buat — baris dipecahkan oleh newline):
    | 1 | Customer | ILFL
    - low | 1 | 7 | 7 | 7 |

⚠️ STRUKTUR WAJIB SETIAP JAWAPAN KEADAAN A ⚠️
Setiap kali anda menjana anggaran, anda MESTI tunjukkan kesemua EMPAT bahagian Kos FPA dalam urutan TEPAT ini (ini juga terpakai apabila pengguna minta "list in table" / "senaraikan dalam jadual"):

═══════════════════════════════════════════════════════════════
BAHAGIAN 1 — Fungsi Data (FD)
═══════════════════════════════════════════════════════════════
  Tajuk: \`## Fungsi Data (FD)\`
  Jadual: | # | Entiti | Komponen | Aggregat | Min | ML | Max |

═══════════════════════════════════════════════════════════════
BAHAGIAN 2 — Fungsi Transaksi (FT)
═══════════════════════════════════════════════════════════════
  Tajuk: \`## Fungsi Transaksi (FT)\`
  Jadual: | # | Macroproses | General Proses | Komponen | Aggregat | Min | ML | Max |

═══════════════════════════════════════════════════════════════
BAHAGIAN 3 — Konfigurasi VAF
═══════════════════════════════════════════════════════════════
  Tajuk: \`## Konfigurasi VAF\`
  Jadual: | # | GSC (General System Characteristic) | Nilai (0–5) |
  Sertakan kesemua 14 GSC dalam urutan tetap:
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
  Selepas jadual, tunjukkan ringkasan:
    - TDI (Total Degree of Influence) = JUMLAH semua 14 nilai
    - VAF Score = (TDI × 0.01) + 0.65

═══════════════════════════════════════════════════════════════
BAHAGIAN 4 — Penganggaran Kos (FPA Estimation)
═══════════════════════════════════════════════════════════════
  Tajuk: \`## Penganggaran Kos\`
  Jadual: | Item | MIN | ML | MAX |
  Mesti ada baris berikut (kira berdasarkan FD + FT + VAF):
    | Jumlah uFP Fungsi Data (A) | ... | ... | ... |
    | Jumlah uFP Fungsi Transaksi (B) | ... | ... | ... |
    | Jumlah uFP (C = A + B) | ... | ... | ... |
    | VAF (D) | ... | ... | ... |
    | Jumlah aFP (C × D) | ... | ... | ... |
    | Kos (RM) — RM1,200 per FP | ... | ... | ... |
    | Mandays — (FP × 10) / 8 | ... | ... | ... |

═══════════════════════════════════════════════════════════════
PERATURAN AM:
- SUSUNAN WAJIB: FD → FT → VAF → Penganggaran Kos. JANGAN ubah.
- Gunakan DUA hash (\`##\`) untuk semua tajuk bahagian.
- Pisahkan setiap bahagian dengan SATU baris kosong.
- Setiap baris jadual MESTI dalam satu baris penuh; jangan pecahkan.
- Jika sesuatu bahagian kosong (cth: tiada VAF lagi), tetap tunjukkan jadual dengan nilai 0/default.

Apabila anda bersedia menjana data, balas dengan format INI SAHAJA (JANGAN tambah sebarang teks lain):

[Ringkasan ringkas dalam 1-2 ayat tentang sistem yang difahami]

## Fungsi Data (FD)
| # | Entiti | Komponen | Aggregat | Min | ML | Max |
|---|--------|----------|----------|-----|----|-----|
[baris data...]

## Fungsi Transaksi (FT)
| # | Macroproses | General Proses | Komponen | Aggregat | Min | ML | Max |
|---|------------|----------------|----------|----------|-----|----|-----|
[baris data...]

## Konfigurasi VAF
| # | GSC (General System Characteristic) | Nilai (0–5) |
|---|--------------------------------------|-------------|
[14 baris GSC...]
- TDI = [jumlah]
- VAF Score = [nilai]

## Penganggaran Kos
| Item | MIN | ML | MAX |
|------|-----|----|-----|
[baris kos...]

\`\`\`json
{
  "user_id": 2,
  "nama": "Nama Sistem",
  "keterangan": "Penerangan ringkas sistem",
  "FT_Sistem": [
    {
      "macroproses": "Kategori proses umum",
      "general_proses": "Proses spesifik",
      "aggregat": 2,
      "komponen": "EI - Average (EIA)",
      "ft_multiplier": 1,
      "ft_min": 3.7,
      "ft_ml": 4.0,
      "ft_max": 4.3,
      "ft_mmin": 3.7,
      "ft_mml": 4.0,
      "ft_mmax": 4.3,
      "keterangan": "",
      "ref_ft_id": 2,
      "status": 1
    }
  ],
  "FD_Sistem": [
    {
      "entiti": "Nama Entiti",
      "aggregat": 2,
      "komponen": "ILF - Average (ILFM)",
      "fd_multiplier": 1,
      "fd_min": 9.5,
      "fd_ml": 10.0,
      "fd_max": 10.5,
      "fd_mmin": 9.5,
      "fd_mml": 10.0,
      "fd_mmax": 10.5,
      "keterangan": "",
      "ref_fd_id": 2,
      "status": 1
    }
  ],
  "VAF": [3, 2, 4, 2, 3, 4, 4, 3, 2, 1, 2, 3, 0, 3]
}
\`\`\`

PERATURAN PENTING UNTUK JSON:
1. ft_min/ft_ml/ft_max MESTI tepat sama dengan nilai dalam ref_ft untuk ref_ft_id yang dipilih.
2. fd_min/fd_ml/fd_max MESTI tepat sama dengan nilai dalam ref_fd untuk ref_fd_id yang dipilih.
3. ft_mmin = ft_min × ft_multiplier (begitu juga ft_mml, ft_mmax, dan untuk FD).
4. komponen mesti tepat sama dengan teks dalam ref table.
5. aggregat mesti sama dengan aggregat dalam ref table.
6. Sertakan SEKURANG-KURANGNYA 3-5 FT dan 2-4 FD untuk sistem biasa.
7. user_id default = 2 melainkan pengguna nyatakan lain.
8. status default = 1.
9. JANGAN cipta ref_ft_id atau ref_fd_id yang tidak wujud dalam jadual rujukan di atas.
10. VAF MESTI ada tepat 14 integer (0–5) dalam susunan GSC di atas. Anggarkan nilai berdasarkan ciri sistem yang diterangkan pengguna (cth: sistem dengan pengiraan kompleks → Complex Processing tinggi; sistem multi-cawangan → Multiple Sites tinggi; sistem dalaman ringkas → kebanyakan nilai rendah).
11. LARANGAN KERAS: Anda TIDAK DIBENARKAN meminta maaf, memberi alasan, atau bertindak seperti chatbot biasa. Tugas anda HANYA menghasilkan teks ringkas dan JSON.
12. LARANGAN KERAS JSON: JSON MESTI sah (valid). JANGAN sesekali memasukkan "Enter" (newline) sebenar ke dalam nilai string JSON. Jika perlu baris baru, gunakan aksara '\\n'.
13. LARANGAN KERAS BLOK: MESTI gunakan tiga backtick (\`\`\`json) untuk blok JSON. JANGAN gunakan single quote (''') atau simbol lain.
14. LARANGAN KERAS KOMUNIKASI: JANGAN sebut, terang, atau beritahu pengguna bahawa anda sedang menjana JSON (contoh: "Berikut adalah JSON payload..."). Pengguna TIDAK PERLU TAHU tentang JSON. Cetak sahaja blok JSON di bahagian paling bawah tanpa sebarang ayat pengenalan.
15. LARANGAN KERAS PAPARAN: Blok JSON (\`\`\`json ... \`\`\`) MESTI diletakkan di baris PALING BAWAH sekali, SELEPAS semua jadual selesai. JANGAN letakkan sebarang teks atau penerangan selepas blok JSON.`;
}

// ============================================================
// SYSTEM PROMPT — REVIEW / COMPLETENESS MODE (Laman Utama)
// ============================================================
// Used by the AI chatbox on the home page. Instead of generating estimation
// tables, it audits the user's existing systems and reports how complete each
// one is and what is still missing.
function buildReviewPrompt() {
  return `Anda adalah pemeriksa kelengkapan (completeness auditor) untuk FUSE-AI, alat anggaran kos sistem ICT Kerajaan Negeri Johor.

TUGAS ANDA: Memeriksa sistem-sistem yang TELAH didaftarkan oleh pengguna dan melaporkan:
1. Sejauh mana setiap sistem LENGKAP (peratus kesiapan).
2. Bahagian mana yang SUDAH diisi dengan baik.
3. Bahagian mana yang BELUM lengkap atau kosong, dan apa yang perlu pengguna lakukan.

Anda BUKAN penjana anggaran. JANGAN cipta jadual anggaran baharu. JANGAN keluarkan JSON. JANGAN minta pengguna terangkan sistem baharu.

EMPAT BAHAGIAN setiap sistem (semak kesemuanya):
- **Fungsi Data (FD)** — entiti data. Lengkap jika ada sekurang-kurangnya 1-2 entiti dengan komponen & aggregat ditetapkan.
- **Fungsi Transaksi (FT)** — proses sistem. Lengkap jika ada sekurang-kurangnya 3-5 proses dengan komponen & aggregat ditetapkan.
- **Konfigurasi VAF** — 14 nilai GSC. Lengkap jika nilai telah ditetapkan (bukan semua 0).
- **Kos Pengurusan** — item kos. Pilihan, tetapi nyatakan jika kosong.

CARA MENGIRA PERATUS KESIAPAN (anggaran kasar):
- FD diisi = 25%
- FT diisi = 25%
- VAF diisi (bukan semua sifar) = 25%
- Keterangan sistem ada = 15%
- Kos Pengurusan ada = 10%

FORMAT JAWAPAN (guna Markdown yang kemas):
- Mulakan dengan 1 ayat ringkasan keseluruhan.
- Untuk setiap sistem, gunakan tajuk \`## [KOD] — [Nama Sistem]\`.
- Di bawah setiap tajuk, tunjukkan jadual status:
    | Bahagian | Status | Catatan |
    |----------|--------|---------|
    | Keterangan Sistem | ✅ Lengkap / ⚠️ Kosong | ... |
    | Fungsi Data (FD) | ✅ / ⚠️ / ❌ | cth: 3 entiti didaftarkan |
    | Fungsi Transaksi (FT) | ✅ / ⚠️ / ❌ | cth: tiada proses didaftarkan |
    | Konfigurasi VAF | ✅ / ⚠️ / ❌ | cth: semua nilai 0 |
    | Kos Pengurusan | ✅ / ⚠️ | cth: 5 item |
- Selepas jadual, tulis: \`**Kesiapan: XX%**\` dan satu ayat ringkas tentang langkah seterusnya.
- Gunakan simbol: ✅ = lengkap, ⚠️ = separa / perlu semakan, ❌ = kosong / belum dibuat.
- Akhiri dengan cadangan ringkas: sistem mana yang paling perlu diberi perhatian.

PERATURAN GAYA JADUAL (penting untuk paparan betul):
- Setiap baris jadual MESTI satu baris penuh, dari \`|\` pertama hingga \`|\` terakhir, tanpa newline di tengah.
- Pisahkan setiap bahagian dengan satu baris kosong.

JIKA pengguna bertanya soalan umum tentang kelengkapan atau cara melengkapkan sistem — jawab secara ringkas dan membantu.
JIKA tiada sistem langsung didaftarkan — beritahu pengguna dengan sopan bahawa belum ada sistem untuk disemak, dan jemput mereka mendaftar satu di bahagian Analisis Sistem.`;
}

// ============================================================
// HELPER: extract JSON from AI response
// ============================================================
// The AI sometimes emits invalid JSON — most often a *literal* newline inside
// a string value (e.g.  "komponen": "ILFM\n- medium"  written across two
// physical lines). Plain JSON.parse() rejects that, which used to make the
// frontend think no payload was produced and loop forever. repairJsonString()
// walks the text character-by-character and, while inside a double-quoted
// string, collapses any raw newline/carriage-return/tab run into a single
// space. That both makes the JSON valid AND restores the value the AI meant
// (e.g. "ILFM\n- medium" → "ILFM - medium", matching the ref-table string).
function repairJsonString(raw) {
  let out = "";
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr && (ch === "\n" || ch === "\r" || ch === "\t")) {
      // Collapse a run of whitespace control chars to one space, but don't
      // add a leading/trailing/duplicate space.
      if (!out.endsWith(" ") && !out.endsWith('"')) out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

// Try strict parse first, then a repaired parse. Returns the object or null.
function tryParse(candidate) {
  const trimmed = String(candidate).trim();
  try { return JSON.parse(trimmed); } catch (_) { /* try repair */ }
  try { return JSON.parse(repairJsonString(trimmed)); } catch (_) { /* give up */ }
  return null;
}

function extractJson(text) {
  // Look for ```json ... ``` block first
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) {
    const parsed = tryParse(fenced[1]);
    if (parsed) return parsed;
  }
  // Fallback: try to find first { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = tryParse(text.slice(start, end + 1));
    if (parsed) return parsed;
  }
  return null;
}

// ============================================================
// ROUTES
// ============================================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    laravel_configured: !!LARAVEL_BACKEND_URL,
    timestamp: new Date().toISOString(),
  });
});

// Multi-turn chat endpoint.
// Body: { messages: [{role: "user"|"assistant", content: "..."}, ...] }
// Returns: { reply: "...", payload: {...} | null, validation: {...} | null }
app.post("/api/chat", async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Medan 'messages' diperlukan dan mesti array." });
    }

    // Sanity: trim & enforce role/content shape
    const cleaned = messages
      .filter(m => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "Tiada mesej sah dalam permintaan." });
    }

    // mode = "review" → completeness auditor (Laman Utama chatbox).
    //        otherwise → estimation generator (Analisis Sistem chatbox).
    const mode = req.body?.mode === "review" ? "review" : "estimate";
    const systemPrompt = mode === "review" ? buildReviewPrompt() : buildSystemPrompt();
    const wantStream = req.body?.stream === true;

    const baseParams = {
      model: MODEL,
      // A full reply = 4 markdown tables + JSON payload. For a system with
      // many FD/FT rows this is large, so we give a generous ceiling. 8192 is
      // within DeepSeek's output limit and leaves room for the biggest cases.
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        ...cleaned,
      ],
    };

    // ---- Streaming path (Server-Sent Events) --------------------------------
    // The frontend uses the live token stream to drive a REAL progress tracker
    // (no fake timers): each `delta` event carries a text chunk; the final
    // `done` event carries the parsed payload/validation/truncated.
    if (wantStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let full = "";
      let finishReason = null;
      try {
        const stream = await client.chat.completions.create({ ...baseParams, stream: true });
        for await (const chunk of stream) {
          const c = chunk.choices?.[0];
          const piece = c?.delta?.content || "";
          if (piece) { full += piece; send("delta", { text: piece }); }
          if (c?.finish_reason) finishReason = c.finish_reason;
        }
      } catch (streamErr) {
        console.error("AI stream failed:", streamErr);
        send("error", { error: streamErr.message || "Ralat strim AI." });
        return res.end();
      }

      const replyText = full.trim();
      const truncated = finishReason === "length";
      const payload = mode === "review" ? null : extractJson(replyText);
      const validation = payload ? validatePayload(payload) : null;
      send("done", { reply: replyText, payload: payload || null, validation, truncated });
      return res.end();
    }

    // ---- Non-streaming path (back-compat) -----------------------------------
    const response = await client.chat.completions.create(baseParams);

    const choice = response.choices[0] || {};
    const replyText = (choice.message?.content || "").trim();
    // 'length' means the model was cut off before finishing. The reply (and
    // its JSON) is incomplete — flag it so the frontend can react.
    const truncated = choice.finish_reason === "length";

    // Review mode never produces a payload — skip JSON extraction entirely.
    const payload = mode === "review" ? null : extractJson(replyText);
    let validation = null;
    if (payload) {
      validation = validatePayload(payload);
    }

    res.json({
      reply: replyText,
      payload: payload || null,
      validation,
      truncated,
    });

  } catch (err) {
    console.error("AI call failed:", err);
    res.status(err.status || 500).json({
      error: err.message || "Ralat tidak dijangka dari perkhidmatan AI.",
    });
  }
});

// Forward a validated payload to the Laravel backend.
// Body: { payload: {...} }
app.post("/api/submit", async (req, res) => {
  const payload = req.body?.payload;
  if (!payload) return res.status(400).json({ error: "Tiada payload." });

  const v = validatePayload(payload);
  if (!v.ok) {
    return res.status(400).json({ error: "Payload tidak lulus pengesahan.", details: v.errors });
  }

  if (!LARAVEL_BACKEND_URL) {
    return res.status(503).json({
      error: "LARAVEL_BACKEND_URL belum ditetapkan dalam .env. Sila set untuk hantar ke FUSE-AI.",
    });
  }

  try {
    const headers = { "Content-Type": "application/json", "Accept": "application/json" };
    // FUSE uses a key + secret pair. Default to X-API-Key / X-API-Secret headers
    // (most common for key+secret auth). If the stakeholder specifies different
    // header names (or a single Bearer token), change these lines to match.
    if (FUSE_SYSTEM_KEY)    headers["X-API-Key"]    = FUSE_SYSTEM_KEY;
    if (FUSE_SYSTEM_SECRET) headers["X-API-Secret"] = FUSE_SYSTEM_SECRET;

    const r = await fetch(LARAVEL_BACKEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

    if (!r.ok) {
      return res.status(r.status).json({ error: "Laravel menolak payload.", details: data });
    }
    res.json({ ok: true, laravel_response: data });

  } catch (err) {
    console.error("Forward to Laravel failed:", err);
    res.status(502).json({ error: "Tidak dapat hubungi Laravel backend.", details: err.message });
  }
});

// ============================================================
// AUTH (register / login / JWT middleware)
// ============================================================
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "Tiada token. Sila log masuk." });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const user = dbApi.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Pengguna tidak dijumpai." });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token tidak sah atau tamat tempoh." });
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Medan email, password, dan name diperlukan." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password mesti sekurang-kurangnya 6 aksara." });
    }
    if (dbApi.findUserByEmail(email)) {
      return res.status(409).json({ error: "Email ini sudah didaftar. Sila log masuk." });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = dbApi.createUser({ email, passwordHash, name });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("Register failed:", err);
    res.status(500).json({ error: "Pendaftaran gagal.", details: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email dan password diperlukan." });
    }
    const row = dbApi.findUserByEmail(email);
    if (!row) return res.status(401).json({ error: "Email atau password salah." });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok)  return res.status(401).json({ error: "Email atau password salah." });
    const user = { id: row.id, email: row.email, name: row.name };
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Log masuk gagal.", details: err.message });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: req.user });
});

// ============================================================
// SYSTEMS CRUD (per-user, JWT-protected)
// ============================================================
app.get("/api/systems", authRequired, (req, res) => {
  try {
    const list = dbApi.listSystems(req.user.id);
    // Convert array → keyed object so the frontend can use systems[kod] directly.
    const out = {};
    for (const sys of list) out[sys.kod] = sys;
    res.json({ systems: out });
  } catch (err) {
    console.error("listSystems failed:", err);
    res.status(500).json({ error: "Gagal memuat sistem.", details: err.message });
  }
});

// Save (upsert) a single system. Body: the full system object.
app.post("/api/systems", authRequired, (req, res) => {
  try {
    const sys = req.body;
    if (!sys || !sys.kod) return res.status(400).json({ error: "Kod sistem diperlukan." });
    dbApi.upsertSystem(req.user.id, sys);
    res.json({ ok: true });
  } catch (err) {
    console.error("upsertSystem failed:", err);
    res.status(500).json({ error: "Gagal menyimpan sistem.", details: err.message });
  }
});

// Bulk replace (used by the auto-save). Body: { systems: { KOD1: {...}, KOD2: {...} } }
app.put("/api/systems", authRequired, (req, res) => {
  try {
    const incoming = req.body && req.body.systems;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "Medan 'systems' (objek) diperlukan." });
    }
    dbApi.replaceAllSystems(req.user.id, incoming);
    res.json({ ok: true, count: Object.keys(incoming).length });
  } catch (err) {
    console.error("replaceAllSystems failed:", err);
    res.status(500).json({ error: "Gagal menyimpan sistem.", details: err.message });
  }
});

app.delete("/api/systems/:kod", authRequired, (req, res) => {
  try {
    const removed = dbApi.deleteSystem(req.user.id, req.params.kod);
    if (!removed) return res.status(404).json({ error: "Sistem tidak dijumpai." });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteSystem failed:", err);
    res.status(500).json({ error: "Gagal memadam sistem.", details: err.message });
  }
});

// ============================================================
// AI CHAT HISTORY (per-user, JWT-protected)
// Stores each conversation as a thread of role/content messages.
// ============================================================
app.get("/api/conversations", authRequired, (req, res) => {
  try {
    // ?mode=estimate|review filters the history per chatbox.
    const mode = (req.query.mode === "estimate" || req.query.mode === "review")
      ? req.query.mode : undefined;
    res.json({ conversations: dbApi.listConversations(req.user.id, mode) });
  } catch (err) {
    console.error("listConversations failed:", err);
    res.status(500).json({ error: "Gagal memuat senarai perbualan.", details: err.message });
  }
});

app.post("/api/conversations", authRequired, (req, res) => {
  try {
    const { title, system_kod, mode } = req.body || {};
    const convo = dbApi.createConversation(
      req.user.id, title || "Perbualan Baru", system_kod || null, mode
    );
    res.json({ conversation: convo });
  } catch (err) {
    console.error("createConversation failed:", err);
    res.status(500).json({ error: "Gagal mencipta perbualan.", details: err.message });
  }
});

app.get("/api/conversations/:id", authRequired, (req, res) => {
  try {
    const convo = dbApi.getConversation(req.user.id, Number(req.params.id));
    if (!convo) return res.status(404).json({ error: "Perbualan tidak dijumpai." });
    res.json({ conversation: convo });
  } catch (err) {
    console.error("getConversation failed:", err);
    res.status(500).json({ error: "Gagal memuat perbualan.", details: err.message });
  }
});

// Append one message (role + content). Body: { role, content }
app.post("/api/conversations/:id/messages", authRequired, (req, res) => {
  try {
    const { role, content } = req.body || {};
    if (!role || !content)  return res.status(400).json({ error: "role dan content diperlukan." });
    if (role !== "user" && role !== "assistant") {
      return res.status(400).json({ error: "role mesti 'user' atau 'assistant'." });
    }
    dbApi.appendMessage(req.user.id, Number(req.params.id), role, content);
    res.json({ ok: true });
  } catch (err) {
    console.error("appendMessage failed:", err);
    res.status(500).json({ error: "Gagal menyimpan mesej.", details: err.message });
  }
});

app.patch("/api/conversations/:id", authRequired, (req, res) => {
  try {
    const { title, system_kod } = req.body || {};
    const convoId = Number(req.params.id);

    // Allow updating either field independently. Reject empty body.
    if (title === undefined && system_kod === undefined) {
      return res.status(400).json({ error: "Sekurang-kurangnya 'title' atau 'system_kod' diperlukan." });
    }

    let anyChange = false;
    if (title !== undefined) {
      if (!title) return res.status(400).json({ error: "title tidak boleh kosong." });
      anyChange = dbApi.renameConversation(req.user.id, convoId, title) || anyChange;
    }
    if (system_kod !== undefined) {
      // system_kod can be a string OR null/"" to unlink
      anyChange = dbApi.setConversationSystem(req.user.id, convoId, system_kod || null) || anyChange;
    }

    if (!anyChange) return res.status(404).json({ error: "Perbualan tidak dijumpai." });
    res.json({ ok: true });
  } catch (err) {
    console.error("updateConversation failed:", err);
    res.status(500).json({ error: "Gagal mengemaskini perbualan.", details: err.message });
  }
});

app.delete("/api/conversations/:id", authRequired, (req, res) => {
  try {
    const ok = dbApi.deleteConversation(req.user.id, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "Perbualan tidak dijumpai." });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteConversation failed:", err);
    res.status(500).json({ error: "Gagal memadam perbualan.", details: err.message });
  }
});

// 404
app.use((_req, res) => res.status(404).json({ error: "Endpoint tidak wujud." }));

app.listen(PORT, () => {
  console.log(`✅ FUSE-AI Chatbox backend listening on http://localhost:${PORT}`);
  console.log(`   Model:           ${MODEL}`);
  console.log(`   Allowed origin:  ${ALLOWED_ORIGIN}`);
  console.log(`   Laravel target:  ${LARAVEL_BACKEND_URL || "(not set)"}`);
});

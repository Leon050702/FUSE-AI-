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
const crypto = require("crypto");

const { refFtAsTable, refFdAsTable, validatePayload } = require("./ref-tables");
const dbApi = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;
// Default to DeepSeek's general chat model. Override via .env if needed.
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const LARAVEL_BACKEND_URL = process.env.LARAVEL_BACKEND_URL || "";
// Staging FUSE credentials + endpoints (see 01_positive_token_issue.py).
const FUSE_SYSTEM_KEY = process.env.FUSE_SYSTEM_KEY || "";
const FUSE_SYSTEM_SECRET = process.env.FUSE_SYSTEM_SECRET || "";
const FUSE_BASE_URL = process.env.FUSE_BASE_URL || "";
const FUSE_TOKEN_PATH = process.env.FUSE_TOKEN_PATH || "/api/v1/smartfuse-api/token";
const FUSE_SUBMIT_PATH = process.env.FUSE_SUBMIT_PATH || "";
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

// Serve the frontend (index.html, css/, js/) so the whole app runs from this
// one server — open http://localhost:3001 and everything loads. The path works
// both locally (../frontend) and inside Docker (where it is copied in).
const path = require("path");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));

// ============================================================
// SYSTEM PROMPT
// ============================================================
function buildSystemPrompt() {
  return `Anda adalah enjin penjana anggaran FUSE-AI untuk sistem ICT Kerajaan Negeri Johor. SATU-SATUNYA tugas anda ialah menukar penerangan sistem yang diberi pengguna kepada EMPAT jadual Kos FPA (Fungsi Data → Fungsi Transaksi → VAF → Penganggaran Kos), DUA jadual cadangan tambahan (Kos Pengurusan dan Kos Perkakasan), berserta blok JSON payload.

Anda BUKAN chatbot perbualan am. Anda TIDAK mencadangkan "proses kerja", "aliran kerja", "flow", senarai ciri, atau esei. Anda TIDAK menulis perenggan panjang.

PERANAN ANDA — hanya tiga keadaan yang dibenarkan:

A) JIKA pengguna memberi SEBARANG penerangan sistem (walaupun ringkas — cth: "sistem tempahan bilik", "sistem HR", atau penerangan dengan senarai ciri):
   → TERUS jana keempat-empat jadual Kos FPA + dua jadual cadangan kos tambahan + JSON mengikut format di bawah. JANGAN tanya soalan. JANGAN tulis esei atau cadangan proses.
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
- Output anda yang sah HANYA: (1) satu ayat ringkasan, (2) empat jadual markdown Kos FPA, (3) dua jadual markdown cadangan Kos Pengurusan dan Kos Perkakasan, (4) blok JSON. Tiada yang lain.

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
- Keadaan A (ada penerangan sistem) → jana empat jadual Kos FPA + dua jadual cadangan kos tambahan + blok JSON. INI adalah keadaan biasa.
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
Setiap kali anda menjana anggaran, anda MESTI tunjukkan kesemua EMPAT bahagian Kos FPA dahulu, kemudian DUA bahagian cadangan tambahan, dalam urutan TEPAT ini (ini juga terpakai apabila pengguna minta "list in table" / "senaraikan dalam jadual"):

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
BAHAGIAN 5 — Cadangan Kos Pengurusan
═══════════════════════════════════════════════════════════════
  Tajuk: \`## Cadangan Kos Pengurusan\`
  Jadual: | # | Perkara | Cadangan Harga Seunit (RM) | Kuantiti | Catatan |
  Beri 3-6 item pengurusan yang munasabah untuk sistem tersebut (cth: dokumentasi, UAT, latihan, keselamatan, migrasi data).
  Ini hanyalah cadangan paparan untuk pengguna. JANGAN masukkan item ini ke dalam JSON.

═══════════════════════════════════════════════════════════════
BAHAGIAN 6 — Cadangan Kos Perkakasan
═══════════════════════════════════════════════════════════════
  Tajuk: \`## Cadangan Kos Perkakasan\`
  Jadual: | # | Perkakasan | Cadangan Harga Seunit (RM) | Kuantiti | Catatan |
  Beri 2-5 item perkakasan/infrastruktur yang munasabah untuk sistem tersebut (cth: pelayan/cloud hosting, storan, backup, SSL/domain, peranti sokongan jika relevan).
  Ini hanyalah cadangan paparan untuk pengguna. JANGAN masukkan item ini ke dalam JSON.

═══════════════════════════════════════════════════════════════
PERATURAN AM:
- SUSUNAN WAJIB: FD → FT → VAF → Penganggaran Kos → Cadangan Kos Pengurusan → Cadangan Kos Perkakasan → JSON. JANGAN ubah.
- Gunakan DUA hash (\`##\`) untuk semua tajuk bahagian.
- Pisahkan setiap bahagian dengan SATU baris kosong.
- Setiap baris jadual MESTI dalam satu baris penuh; jangan pecahkan.
- Jika sesuatu bahagian kosong (cth: tiada VAF lagi), tetap tunjukkan jadual dengan nilai 0/default.
- Cadangan Kos Pengurusan dan Cadangan Kos Perkakasan TIDAK mengubah pengiraan Kos FPA dan TIDAK dimasukkan dalam JSON.

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

## Cadangan Kos Pengurusan
| # | Perkara | Cadangan Harga Seunit (RM) | Kuantiti | Catatan |
|---|---------|----------------------------|----------|---------|
[baris cadangan kos pengurusan...]

## Cadangan Kos Perkakasan
| # | Perkakasan | Cadangan Harga Seunit (RM) | Kuantiti | Catatan |
|---|------------|----------------------------|----------|---------|
[baris cadangan kos perkakasan...]

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

LIMA BAHAGIAN setiap sistem (semak kesemuanya — kesemuanya WAJIB untuk 100% siap):
- **Fungsi Data (FD)** — entiti data. Lengkap jika ada sekurang-kurangnya 1-2 entiti dengan komponen & aggregat ditetapkan.
- **Fungsi Transaksi (FT)** — proses sistem. Lengkap jika ada sekurang-kurangnya 3-5 proses dengan komponen & aggregat ditetapkan.
- **Konfigurasi VAF** — 14 nilai GSC. Lengkap jika nilai telah ditetapkan (bukan semua 0).
- **Kos Pengurusan** — item & harga kos pengurusan. Lengkap jika sekurang-kurangnya satu item mempunyai harga.
- **Kos Perkakasan** — item & harga perkakasan/infrastruktur. Lengkap jika ada sekurang-kurangnya satu item.

NOTA tentang Kos Pengurusan & Kos Perkakasan: kedua-duanya diisi secara MANUAL oleh pengguna kerana ia bergantung pada harga/sebut harga sebenar — AI TIDAK menjana nilainya. Walaupun begitu, kedua-duanya WAJIB diisi untuk sistem dikira lengkap. Jika kosong, nyatakan ia belum lengkap dan ingatkan pengguna untuk mengisinya.

CARA MENGIRA PERATUS KESIAPAN (anggaran kasar — semua lima bahagian wajib):
- FD diisi = 20%
- FT diisi = 20%
- VAF diisi (bukan semua sifar) = 20%
- Kos Pengurusan diisi = 15%
- Kos Perkakasan diisi = 15%
- Keterangan sistem ada = 10%
- Sistem hanya 100% LENGKAP apabila kelima-lima bahagian + keterangan ada.

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
    | Kos Pengurusan (manual) | ✅ / ❌ | cth: 5 item / belum diisi |
    | Kos Perkakasan (manual) | ✅ / ❌ | cth: 3 item / belum diisi |
- Selepas jadual, tulis: \`**Kesiapan: XX%**\` dan satu ayat ringkas tentang langkah seterusnya.
- Gunakan simbol: ✅ = lengkap, ⚠️ = separa / perlu semakan, ❌ = kosong / belum dibuat.
- Jika Kos Pengurusan atau Kos Perkakasan kosong, nyatakan sistem BELUM lengkap dan ingatkan pengguna untuk mengisinya secara manual (harga sebenar) — cth: "Kos Pengurusan & Kos Perkakasan masih kosong; sila isi secara manual untuk melengkapkan sistem."
- Akhiri dengan cadangan ringkas: sistem mana yang paling perlu diberi perhatian.

PERATURAN GAYA JADUAL (penting untuk paparan betul):
- Setiap baris jadual MESTI satu baris penuh, dari \`|\` pertama hingga \`|\` terakhir, tanpa newline di tengah.
- Pisahkan setiap bahagian dengan satu baris kosong.

JIKA pengguna bertanya soalan umum tentang kelengkapan atau cara melengkapkan sistem — jawab secara ringkas dan membantu.
JIKA tiada sistem langsung didaftarkan — beritahu pengguna dengan sopan bahawa belum ada sistem untuk disemak, dan jemput mereka mendaftar satu di bahagian Analisis Sistem.`;
}

// ============================================================
// SYSTEM PROMPT — COST SUGGESTION MODE (Kos Pengurusan / Kos Perkakasan)
// ============================================================
// Triggered by the dedicated "Cadang AI" button on each cost page. Given the
// system the user is editing, the AI proposes a short list of manual cost items
// (with estimated unit prices & quantities) and returns them as STRICT JSON so
// the frontend can drop them straight into the table. These are SUGGESTIONS —
// the user is free to edit, delete, or ignore them; they are NOT part of the
// FPA calculation.
function buildCostPrompt(section) {
  const isPeng = section === "pengurusan";
  const label  = isPeng ? "Kos Pengurusan" : "Kos Perkakasan";
  const itemKey = isPeng ? "perkara" : "nama";
  const examples = isPeng
    ? "dokumentasi sistem, ujian penerimaan pengguna (UAT), latihan pengguna, khidmat keselamatan/penetration test, migrasi data, sokongan & penyelenggaraan tahun pertama"
    : "pelayan / cloud hosting, storan & backup, sijil SSL & domain, lesen perisian, peranti rangkaian (switch/router), komputer/peranti sokongan";
  return `Anda penjana cadangan ${label} untuk projek sistem ICT Kerajaan Negeri Johor.

TUGAS: Berdasarkan penerangan sistem yang diberi, cadangkan item ${label} yang munasabah dan realistik untuk sistem jenis & saiz tersebut. Beri anggaran harga seunit (RM) dan kuantiti yang berpatutan mengikut harga pasaran Malaysia.

JIKA senarai "item sedia ada" diberi dalam mesej pengguna:
- Untuk SETIAP item sedia ada, kembalikan item dengan "${itemKey}" yang SAMA PERSIS seperti diberi, beserta anggaran "harga" seunit & "kuantiti". (Sistem akan memadankan nama untuk mengisi harga.)
- Anda BOLEH tambah beberapa item baharu yang relevan jika berpatutan.
JIKA tiada senarai item sedia ada — cadangkan 3-6 item baharu.

Contoh jenis item ${label}: ${examples}.

PERATURAN OUTPUT:
- Balas dengan SATU objek JSON SAHAJA. TIADA teks, tiada markdown, tiada penjelasan, tiada blok kod.
- Skema TEPAT:
{"items":[{"${itemKey}":"<nama item ringkas>","harga":<nombor RM seunit, tanpa simbol>,"kuantiti":<nombor bulat>,"catatan":"<sebab ringkas, satu frasa>"}]}
- "harga" mesti nombor (cth 5000 atau 1500.50), BUKAN string. "kuantiti" mesti integer >= 1.
- Sesuaikan item & harga dengan jenis sistem (sistem kecil = item & harga lebih rendah; sistem besar/kompleks = lebih tinggi).
- JANGAN sertakan SST/cukai — itu dikira automatik oleh sistem.`;
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
    // "configured" = the full submit path is known. Token auth alone is ready
    // once base URL + credentials exist.
    laravel_configured: !!(FUSE_BASE_URL && FUSE_SUBMIT_PATH) || !!LARAVEL_BACKEND_URL,
    fuse_token_ready: !!(FUSE_BASE_URL && FUSE_SYSTEM_KEY && FUSE_SYSTEM_SECRET),
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

// Cost-suggestion endpoint — powers the "Cadang AI" button on the
// Kos Pengurusan / Kos Perkakasan pages.
// Body: { section: 'pengurusan'|'perkakasan', nama, keterangan, fd:[...], ft:[...] }
// Returns: { items: [{ perkara|nama, harga, kuantiti, catatan }] }
app.post("/api/suggest-cost", async (req, res) => {
  try {
    const section = req.body?.section === "perkakasan" ? "perkakasan" : "pengurusan";
    const nama = String(req.body?.nama || "").slice(0, 300) || "(tiada nama)";
    const keterangan = String(req.body?.keterangan || "").slice(0, 2000);
    const fd = Array.isArray(req.body?.fd) ? req.body.fd : [];
    const ft = Array.isArray(req.body?.ft) ? req.body.ft : [];
    const existingItems = (Array.isArray(req.body?.existingItems) ? req.body.existingItems : [])
      .map(x => String(x).trim()).filter(Boolean).slice(0, 40);

    // Describe the system to the model so its suggestions fit the scale/type.
    const sysDesc =
`Maklumat sistem:
NAMA: ${nama}
KETERANGAN: ${keterangan || "(tiada keterangan)"}
Bilangan Fungsi Data: ${fd.length}
Bilangan Fungsi Transaksi: ${ft.length}
${fd.length ? "Contoh entiti data: " + fd.slice(0, 8).map(x => String(x).slice(0, 40)).join(", ") : ""}
${ft.length ? "Contoh proses: " + ft.slice(0, 8).map(x => String(x).slice(0, 40)).join(", ") : ""}
${existingItems.length ? "\nItem sedia ada (beri harga & kuantiti untuk SETIAP satu, kekalkan nama yang sama):\n" + existingItems.map((x, i) => `${i + 1}. ${x}`).join("\n") : ""}

Cadangkan item ${section === "pengurusan" ? "Kos Pengurusan" : "Kos Perkakasan"} untuk sistem ini.`;

    const itemKey = section === "perkakasan" ? "nama" : "perkara";
    const maxItems = Math.max(8, existingItems.length + 4);

    // Parse + sanitise one AI reply into clean rows.
    const parseItems = (replyText) => {
      const parsed = extractJson(replyText) || {};
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      return rawItems
        .map(it => {
          const name = String(it?.[itemKey] ?? it?.nama ?? it?.perkara ?? "").trim().slice(0, 200);
          let harga = Number(it?.harga);
          if (!Number.isFinite(harga) || harga < 0) harga = 0;
          let kuantiti = parseInt(it?.kuantiti, 10);
          if (!Number.isFinite(kuantiti) || kuantiti < 1) kuantiti = 1;
          const catatan = String(it?.catatan ?? "").trim().slice(0, 300);
          return { [itemKey]: name, harga, kuantiti, catatan };
        })
        .filter(it => it[itemKey])
        .slice(0, maxItems);
    };

    // The model occasionally returns non-JSON; retry once before giving up.
    let items = [];
    for (let attempt = 0; attempt < 2 && !items.length; attempt++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 2400,
        messages: [
          { role: "system", content: buildCostPrompt(section) },
          { role: "user", content: sysDesc },
        ],
      });
      items = parseItems((response.choices?.[0]?.message?.content || "").trim());
    }

    if (!items.length) {
      return res.status(502).json({ error: "AI tidak menghasilkan cadangan yang sah. Sila cuba lagi." });
    }
    res.json({ section, items });
  } catch (err) {
    console.error("Cost suggestion failed:", err);
    res.status(err.status || 500).json({
      error: err.message || "Ralat tidak dijangka semasa menjana cadangan kos.",
    });
  }
});

// ============================================================
// FUSE STAGING AUTH — HMAC-signed requests + token cache
// (flow mirrors the stakeholder's 01_positive_token_issue.py)
// ============================================================
function fuseIsoTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function fuseSignature(method, path, timestamp, rawBody) {
  const baseString = `${method}\n${path}\n${timestamp}\n${rawBody}`;
  return crypto.createHmac("sha256", FUSE_SYSTEM_SECRET).update(baseString, "utf8").digest("hex");
}

// Signed POST to the FUSE API. Adds the Bearer token too when provided
// (the token request itself has none).
async function fuseSignedPost(path, payload, bearerToken) {
  const rawBody = JSON.stringify(payload);
  const timestamp = fuseIsoTimestamp();
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-System-Key": FUSE_SYSTEM_KEY,
    "X-Timestamp": timestamp,
    "X-Signature": fuseSignature("POST", path, timestamp, rawBody),
  };
  if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
  const r = await fetch(FUSE_BASE_URL + path, { method: "POST", headers, body: rawBody });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  return { status: r.status, ok: r.ok, data };
}

// Token cache — reuse until ~1 min before expiry.
let fuseToken = null;
let fuseTokenExpiry = 0;

async function fuseGetToken() {
  if (fuseToken && Date.now() < fuseTokenExpiry - 60_000) return fuseToken;
  const r = await fuseSignedPost(FUSE_TOKEN_PATH, {});
  const tok = r.data?.data?.access_token;
  if (!r.ok || !tok) {
    throw new Error(`Token request failed (HTTP ${r.status}): ${r.data?.message || "no token in response"}`);
  }
  fuseToken = tok;
  const exp = Date.parse(r.data?.data?.expires_at || "");
  fuseTokenExpiry = Number.isFinite(exp) ? exp : Date.now() + 10 * 60_000;
  console.log(`🔑 FUSE token issued, expires ${r.data?.data?.expires_at}`);
  return fuseToken;
}

// Forward a validated payload to the real FUSE staging system.
// Body: { payload: {...} }
app.post("/api/submit", async (req, res) => {
  const payload = req.body?.payload;
  if (!payload) return res.status(400).json({ error: "Tiada payload." });

  const v = validatePayload(payload);
  if (!v.ok) {
    return res.status(400).json({ error: "Payload tidak lulus pengesahan.", details: v.errors });
  }

  // New FUSE flow (token + signed request), per the stakeholder's 02 script.
  if (FUSE_BASE_URL && FUSE_SUBMIT_PATH) {
    try {
      // Staging requires a registered user_id (Adam=253, Leong=255, Nazhan=256).
      // Stamp ours over whatever the AI generated (it defaults to 2 locally).
      const fuseUserId = Number(process.env.FUSE_USER_ID);
      if (Number.isFinite(fuseUserId) && fuseUserId > 0) payload.user_id = fuseUserId;

      const token = await fuseGetToken();
      const r = await fuseSignedPost(FUSE_SUBMIT_PATH, payload, token);
      if (!r.ok) {
        return res.status(r.status).json({ error: "FUSE staging menolak payload.", details: r.data });
      }
      return res.json({ ok: true, fuse_response: r.data });
    } catch (err) {
      console.error("Submit to FUSE staging failed:", err);
      return res.status(502).json({ error: "Tidak dapat hantar ke FUSE staging.", details: err.message });
    }
  }

  if (!LARAVEL_BACKEND_URL) {
    return res.status(503).json({
      error: "FUSE_SUBMIT_PATH belum ditetapkan dalam .env (endpoint penghantaran FT/FD belum diberi oleh pihak FUSE). Token endpoint sudah berfungsi — minta path penghantaran daripada stakeholder.",
    });
  }

  // Legacy fallback: direct POST to a fixed URL.
  try {
    const r = await fetch(LARAVEL_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
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
  const systemCount = dbApi.countUserSystems(req.user.id);
  res.json({ user: { ...req.user, systemCount } });
});

// Update the logged-in user's profile: change display name and/or password.
// Body: { name?, currentPassword?, newPassword? }
//   - To change the password, BOTH currentPassword and newPassword are required.
app.patch("/api/auth/me", authRequired, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body || {};
    const wantsName = typeof name === "string" && name.trim() !== "";
    const wantsPassword = newPassword != null && newPassword !== "";

    if (!wantsName && !wantsPassword) {
      return res.status(400).json({ error: "Tiada perubahan untuk disimpan." });
    }

    // Name change.
    if (wantsName && name.trim() !== req.user.name) {
      dbApi.updateUserName(req.user.id, name.trim());
    }

    // Password change — verify the current password first.
    if (wantsPassword) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: "Password baharu mesti sekurang-kurangnya 6 aksara." });
      }
      if (!currentPassword) {
        return res.status(400).json({ error: "Sila masukkan password semasa." });
      }
      const full = dbApi.findUserAuthById(req.user.id);
      const ok = full && (await bcrypt.compare(currentPassword, full.password_hash));
      if (!ok) {
        return res.status(401).json({ error: "Password semasa salah." });
      }
      const hash = await bcrypt.hash(String(newPassword), 10);
      dbApi.updateUserPassword(req.user.id, hash);
    }

    const fresh = dbApi.findUserById(req.user.id);
    const systemCount = dbApi.countUserSystems(req.user.id);
    res.json({ user: { ...fresh, systemCount } });
  } catch (err) {
    console.error("Profile update failed:", err);
    res.status(500).json({ error: "Kemaskini profil gagal." });
  }
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
  console.log(`   FUSE staging:    ${FUSE_BASE_URL ? FUSE_BASE_URL + (FUSE_SUBMIT_PATH || " (submit path NOT set — token only)") : "(not configured)"}`);
  console.log(`   Legacy target:   ${LARAVEL_BACKEND_URL || "(not set)"}`);
});

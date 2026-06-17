// End-to-end staging test — Node mirror of the stakeholder's
// 02_positive_data_submit.py: issue token, then submit a sample FT/FD payload.
// Run: node test-fuse-submit.js
const crypto = require("crypto");

const BASE_URL = "https://fuse-stg.johor.gov.my";
const SYSTEM_KEY = "SMARTFUSE-API-STG";
const SYSTEM_SECRET = "EnXTq2SuJ5kV5wPlBcQhFXi5j57Jj5xNl5T3hxX9cKR99AF6LJ143YEQsiR4WPMr";
const TOKEN_PATH = "/api/v1/smartfuse-api/token";
const DATA_PATH = "/api/v1/smartfuse-api/data";
const USER_ID = 255; // Leong (staging)

const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const sign = (m, p, t, b) =>
  crypto.createHmac("sha256", SYSTEM_SECRET).update(`${m}\n${p}\n${t}\n${b}`, "utf8").digest("hex");

async function postSigned(path, payload, token) {
  const rawBody = JSON.stringify(payload);
  const t = iso();
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-System-Key": SYSTEM_KEY,
    "X-Timestamp": t,
    "X-Signature": sign("POST", path, t, rawBody),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(BASE_URL + path, { method: "POST", headers, body: rawBody });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = { _non_json_body: text.slice(0, 2000) }; }
  return { status: r.status, data };
}

// The stakeholder's exact sample payload (valid staging ref ids/components),
// submitted under Leong's staging user.
const payload = {
  user_id: USER_ID,
  // Staging requires a UNIQUE system name — stamp each run with the time so
  // repeat runs don't hit "Nama Sistem Telah Digunakan."
  nama: `Smart Fuse Test Leong ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  keterangan: "Testing data submission via Backend API (SmartFUSE chatbox)",
  FT_Sistem: [
    { macroproses: "Pendaftaran", general_proses: "Semak Permohonan", aggregat: 2, komponen: "GEQ - Generic EQ", ft_multiplier: 1, ft_min: 3.7, ft_ml: 3.9, ft_max: 4.1, ft_mmin: 3.7, ft_mml: 3.9, ft_mmax: 4.1, keterangan: "", ref_ft_id: 11, status: 1 },
    { macroproses: "Pendaftaran", general_proses: "Daftar Akaun", aggregat: 4, komponen: "MPM - medium 5-7 Generic GPs", ft_multiplier: 1, ft_min: 185.8, ft_ml: 285.9, ft_max: 385.9, ft_mmin: 185.8, ft_mml: 285.9, ft_mmax: 385.9, keterangan: "", ref_ft_id: 22, status: 1 },
    { macroproses: "Profil", general_proses: "Kemaskini Akaun", aggregat: 2, komponen: "GEI - Generic EI", ft_multiplier: 1, ft_min: 4, ft_ml: 4.2, ft_max: 4.4, ft_mmin: 4, ft_mml: 4.2, ft_mmax: 4.4, keterangan: "", ref_ft_id: 10, status: 1 },
  ],
  FD_Sistem: [
    { entiti: "Akaun", aggregat: 2, komponen: "GEIF - Generic EIF", fd_multiplier: 1, fd_min: 5.2, fd_ml: 5.4, fd_max: 5.7, fd_mmin: 5.2, fd_mml: 5.4, fd_mmax: 5.7, keterangan: "Akaun untuk sistem", ref_fd_id: 8, status: 1 },
    { entiti: "Profil", aggregat: 2, komponen: "GILF - Generic ILF", fd_multiplier: 1, fd_min: 7.4, fd_ml: 7.7, fd_max: 8.1, fd_mmin: 7.4, fd_mml: 7.7, fd_mmax: 8.1, keterangan: "Profil untuk pengguna", ref_fd_id: 7, status: 1 },
  ],
};

async function main() {
  console.log("== Step 1: token ==");
  const t = await postSigned(TOKEN_PATH, {});
  console.log("HTTP", t.status, "-", t.data?.message);
  const token = t.data?.data?.access_token;
  if (!token) { console.error("No token — aborting."); process.exit(1); }

  console.log("\n== Step 2: submit FT/FD data ==");
  const s = await postSigned(DATA_PATH, payload, token);
  console.log("Expected HTTP: 200");
  console.log("Actual HTTP:  ", s.status);
  console.log(JSON.stringify(s.data, null, 2));
}

main().catch(e => { console.error("Request failed:", e.message); process.exit(1); });

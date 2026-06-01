

// ============================================================
// REF TABLES — DUMMY DATA
// ============================================================
// Replace the arrays below with your real ref_ft and ref_fd table
// dumps from MySQL. The shape is what matters — keep the same
// keys (id, komponen, aggregat, *_min, *_ml, *_max).
//
// To replace: export from MySQL like
//   SELECT id, komponen, aggregat, ft_min, ft_ml, ft_max FROM ref_ft;
// then paste the rows below as JS objects.
// ============================================================

// ---------- FT (Fungsi Transaksi) reference ----------
// Mirrors the frontend TRANS_COMPONENTS catalog. The aggregat field maps
// to the dropdown level: 1=Amat Terperinci, 2=Terperinci,
// 3=Kurang Perincian, 4=Tiada Perincian.
const REF_FT = [
  // aggregat 1 — Amat Terperinci
  { id: 1,  komponen: "EIL - EI low",     aggregat: 1, ft_min: 3,   ft_ml: 3,   ft_max: 3   },
  { id: 2,  komponen: "EIA - EI average", aggregat: 1, ft_min: 4,   ft_ml: 4,   ft_max: 4   },
  { id: 3,  komponen: "EIH - EI high",    aggregat: 1, ft_min: 6,   ft_ml: 6,   ft_max: 6   },
  { id: 4,  komponen: "EQL - EQ low",     aggregat: 1, ft_min: 3,   ft_ml: 3,   ft_max: 3   },
  { id: 5,  komponen: "EQA - EQ average", aggregat: 1, ft_min: 4,   ft_ml: 4,   ft_max: 4   },
  { id: 6,  komponen: "EQH - EQ high",    aggregat: 1, ft_min: 6,   ft_ml: 6,   ft_max: 6   },
  { id: 7,  komponen: "EOL - EO low",     aggregat: 1, ft_min: 4,   ft_ml: 4,   ft_max: 4   },
  { id: 8,  komponen: "EOA - EO average", aggregat: 1, ft_min: 5,   ft_ml: 5,   ft_max: 5   },
  { id: 9,  komponen: "EOH - EO high",    aggregat: 1, ft_min: 7,   ft_ml: 7,   ft_max: 7   },

  // aggregat 2 — Terperinci
  { id: 10, komponen: "GEI - Generic EI",                                         aggregat: 2, ft_min: 4.0, ft_ml: 4.2, ft_max: 4.4 },
  { id: 11, komponen: "GEQ - Generic EQ",                                         aggregat: 2, ft_min: 3.7, ft_ml: 3.9, ft_max: 4.1 },
  { id: 12, komponen: "GEO - Generic EO",                                         aggregat: 2, ft_min: 4.9, ft_ml: 5.2, ft_max: 5.4 },
  { id: 13, komponen: "UGO - Unspecified Generic Output (EQ/EO)",                 aggregat: 2, ft_min: 4.1, ft_ml: 4.6, ft_max: 5.0 },
  { id: 14, komponen: "UGEP - Unspecified Generic Elementary Process (EI/EQ/EO)", aggregat: 2, ft_min: 4.3, ft_ml: 4.6, ft_max: 4.8 },

  // aggregat 3 — Kurang Perincian
  { id: 15, komponen: "TPS - small (CRUD)",             aggregat: 3, ft_min: 14.1, ft_ml: 16.5, ft_max: 19.0 },
  { id: 16, komponen: "TPM - medium (CRUD+List)",       aggregat: 3, ft_min: 17.9, ft_ml: 21.1, ft_max: 24.3 },
  { id: 17, komponen: "TPL - large (CRUD+List+Report)", aggregat: 3, ft_min: 22.3, ft_ml: 26.3, ft_max: 30.2 },
  { id: 18, komponen: "GPS - small 6-10 UEPs",          aggregat: 3, ft_min: 26.4, ft_ml: 35.2, ft_max: 44.0 },
  { id: 19, komponen: "GPM - medium 11-15 UEPs",        aggregat: 3, ft_min: 42.9, ft_ml: 57.2, ft_max: 71.5 },
  { id: 20, komponen: "GPL - large 16-20 UEPs",         aggregat: 3, ft_min: 59.4, ft_ml: 79.2, ft_max: 98.9 },

  // aggregat 4 — Tiada Perincian
  { id: 21, komponen: "MPS - small 2-4 Generic GPs",    aggregat: 4, ft_min: 111.5, ft_ml: 171.5, ft_max: 231.5 },
  { id: 22, komponen: "MPM - medium 5-7 Generic GPs",   aggregat: 4, ft_min: 185.8, ft_ml: 285.9, ft_max: 385.9 },
  { id: 23, komponen: "MPL - large 8-10 Generic GPs",   aggregat: 4, ft_min: 297.3, ft_ml: 457.4, ft_max: 617.4 },
];

// ---------- FD (Fungsi Data) reference ----------
// Mirrors the frontend DATA_COMPONENTS catalog. Data only has 3 levels:
// 1=Amat Terperinci, 2=Kurang Perincian, 3=Tiada Perincian (no "Terperinci").
const REF_FD = [
  // aggregat 1 — Amat Terperinci
  { id: 1,  komponen: "ILFL - low",    aggregat: 1, fd_min: 6.5,  fd_ml: 7.0,  fd_max: 7.5  },
  { id: 2,  komponen: "ILFM - medium", aggregat: 1, fd_min: 9.5,  fd_ml: 10.0, fd_max: 10.5 },
  { id: 3,  komponen: "ILFH - high",   aggregat: 1, fd_min: 14.5, fd_ml: 15.0, fd_max: 15.5 },
  { id: 4,  komponen: "EIFL - low",    aggregat: 1, fd_min: 4.5,  fd_ml: 5.0,  fd_max: 5.5  },
  { id: 5,  komponen: "EIFM - medium", aggregat: 1, fd_min: 6.5,  fd_ml: 7.0,  fd_max: 7.5  },
  { id: 6,  komponen: "EIFH - high",   aggregat: 1, fd_min: 9.5,  fd_ml: 10.0, fd_max: 10.5 },

  // aggregat 2 — Kurang Perincian
  { id: 7,  komponen: "GILF - Generic ILF",                    aggregat: 2, fd_min: 7.4,  fd_ml: 7.7,  fd_max: 8.1  },
  { id: 8,  komponen: "GEIF - Generic EIF",                    aggregat: 2, fd_min: 5.2,  fd_ml: 5.4,  fd_max: 5.7  },
  { id: 9,  komponen: "UGDG - Unspecified Generic Data Group", aggregat: 2, fd_min: 6.4,  fd_ml: 7.0,  fd_max: 7.8  },

  // aggregat 3 — Tiada Perincian
  { id: 10, komponen: "GDGS - small 2-4 ULF",  aggregat: 3, fd_min: 15.0, fd_ml: 21.4, fd_max: 27.8  },
  { id: 11, komponen: "GDGM - medium 5-8 ULF", aggregat: 3, fd_min: 32.4, fd_ml: 46.3, fd_max: 60.2  },
  { id: 12, komponen: "GDGL - large 9-13 ULF", aggregat: 3, fd_min: 54.8, fd_ml: 78.3, fd_max: 101.8 },
];

// ---------- Helper functions ----------

// Build a compact text table the LLM can read in its system prompt.
function refFtAsTable() {
  const header = "| id | komponen | aggregat | ft_min | ft_ml | ft_max |";
  const sep    = "|----|----------|----------|--------|-------|--------|";
  const rows = REF_FT.map(r =>
    `| ${r.id} | ${r.komponen} | ${r.aggregat} | ${r.ft_min} | ${r.ft_ml} | ${r.ft_max} |`
  );
  return [header, sep, ...rows].join("\n");
}

function refFdAsTable() {
  const header = "| id | komponen | aggregat | fd_min | fd_ml | fd_max |";
  const sep    = "|----|----------|----------|--------|-------|--------|";
  const rows = REF_FD.map(r =>
    `| ${r.id} | ${r.komponen} | ${r.aggregat} | ${r.fd_min} | ${r.fd_ml} | ${r.fd_max} |`
  );
  return [header, sep, ...rows].join("\n");
}

// Validate that an AI-generated payload only uses ref IDs that exist in the
// tables, AND that the min/ml/max values match the ref-table values.
// Returns { ok: true } or { ok: false, errors: [...] }.
function validatePayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["Payload bukan objek JSON yang sah."] };
  }
  if (!payload.nama)         errors.push("Medan 'nama' tiada.");
  if (!payload.keterangan)   errors.push("Medan 'keterangan' tiada.");
  if (!Array.isArray(payload.FT_Sistem)) errors.push("FT_Sistem mesti array.");
  if (!Array.isArray(payload.FD_Sistem)) errors.push("FD_Sistem mesti array.");

  // VAF is optional in older payloads, but if present it must be exactly 14 integers in [0,5].
  if (payload.VAF !== undefined) {
    if (!Array.isArray(payload.VAF) || payload.VAF.length !== 14) {
      errors.push("VAF mesti array dengan tepat 14 nilai (1 setiap GSC).");
    } else {
      payload.VAF.forEach((v, i) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 5) {
          errors.push(`VAF[${i}]: nilai mesti integer antara 0–5 (dapat ${v}).`);
        }
      });
    }
  }

  if (errors.length) return { ok: false, errors };

  // Check every FT row
  payload.FT_Sistem.forEach((row, i) => {
    const ref = REF_FT.find(r => r.id === row.ref_ft_id);
    if (!ref) {
      errors.push(`FT_Sistem[${i}]: ref_ft_id=${row.ref_ft_id} tidak wujud dalam ref_ft.`);
      return;
    }
    if (Math.abs(row.ft_min - ref.ft_min) > 0.001) errors.push(`FT_Sistem[${i}]: ft_min tidak sepadan ref_ft (cth ${ref.ft_min}).`);
    if (Math.abs(row.ft_ml  - ref.ft_ml ) > 0.001) errors.push(`FT_Sistem[${i}]: ft_ml tidak sepadan ref_ft (cth ${ref.ft_ml}).`);
    if (Math.abs(row.ft_max - ref.ft_max) > 0.001) errors.push(`FT_Sistem[${i}]: ft_max tidak sepadan ref_ft (cth ${ref.ft_max}).`);
    const m = Number(row.ft_multiplier) || 1;
    if (Math.abs(row.ft_mmin - ref.ft_min * m) > 0.01) errors.push(`FT_Sistem[${i}]: ft_mmin tidak betul (jangka ${(ref.ft_min*m).toFixed(2)}).`);
    if (Math.abs(row.ft_mml  - ref.ft_ml  * m) > 0.01) errors.push(`FT_Sistem[${i}]: ft_mml tidak betul (jangka ${(ref.ft_ml *m).toFixed(2)}).`);
    if (Math.abs(row.ft_mmax - ref.ft_max * m) > 0.01) errors.push(`FT_Sistem[${i}]: ft_mmax tidak betul (jangka ${(ref.ft_max*m).toFixed(2)}).`);
  });

  // Check every FD row
  payload.FD_Sistem.forEach((row, i) => {
    const ref = REF_FD.find(r => r.id === row.ref_fd_id);
    if (!ref) {
      errors.push(`FD_Sistem[${i}]: ref_fd_id=${row.ref_fd_id} tidak wujud dalam ref_fd.`);
      return;
    }
    if (Math.abs(row.fd_min - ref.fd_min) > 0.001) errors.push(`FD_Sistem[${i}]: fd_min tidak sepadan ref_fd (cth ${ref.fd_min}).`);
    if (Math.abs(row.fd_ml  - ref.fd_ml ) > 0.001) errors.push(`FD_Sistem[${i}]: fd_ml tidak sepadan ref_fd (cth ${ref.fd_ml}).`);
    if (Math.abs(row.fd_max - ref.fd_max) > 0.001) errors.push(`FD_Sistem[${i}]: fd_max tidak sepadan ref_fd (cth ${ref.fd_max}).`);
    const m = Number(row.fd_multiplier) || 1;
    if (Math.abs(row.fd_mmin - ref.fd_min * m) > 0.01) errors.push(`FD_Sistem[${i}]: fd_mmin tidak betul (jangka ${(ref.fd_min*m).toFixed(2)}).`);
    if (Math.abs(row.fd_mml  - ref.fd_ml  * m) > 0.01) errors.push(`FD_Sistem[${i}]: fd_mml tidak betul (jangka ${(ref.fd_ml *m).toFixed(2)}).`);
    if (Math.abs(row.fd_mmax - ref.fd_max * m) > 0.01) errors.push(`FD_Sistem[${i}]: fd_mmax tidak betul (jangka ${(ref.fd_max*m).toFixed(2)}).`);
  });

  return { ok: errors.length === 0, errors };
}

module.exports = { REF_FT, REF_FD, refFtAsTable, refFdAsTable, validatePayload };

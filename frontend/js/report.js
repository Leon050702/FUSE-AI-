// ================================================================
//  FUSE — Laporan Analisis Sistem dan Anggaran Kos
//  Builds a multi-section, print-ready report for one system and
//  renders it into the Laporan section. Mirrors the official PDF
//  layout (cover + FPA tables + VAF + ringkasan + cost tables).
// ================================================================

const FUSE_COST_PER_FP = 1200;   // RM per Function Point (current inflation rate)

const VAF_GSC_LABELS = [
  'Data Communications', 'Distributed Data Processing', 'Performance',
  'Heavily Used Configuration', 'Transaction Rate', 'On-line Data Entry',
  'End-User Efficiency', 'On-Line Update', 'Complex Processing',
  'Reusability', 'Installation Ease', 'Operational Ease',
  'Multiple Sites', 'Facilitate Change'
];

let currentReportKod = null;

// ── small helpers ────────────────────────────────────────────────
function repMoney(n) { return 'RM' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function repNum(n, dp = 2) { return (Number(n) || 0).toFixed(dp); }
function repAggNum(label) { const m = String(label || '').match(/\d+/); return m ? m[0] : '—'; }
function repEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : s) : String(s == null ? '' : s); }
function repToday() { return new Date().toLocaleDateString('ms-MY', { year: 'numeric', month: 'long', day: 'numeric' }); }
function repUserName() {
  try { const u = JSON.parse(localStorage.getItem('fuse_user') || 'null'); return (u && u.name) ? u.name : 'Pengguna'; }
  catch (_) { return 'Pengguna'; }
}

// ── compute every value the report needs from one system ─────────
function computeLaporan(kod) {
  const s = (window.systems || {})[kod];
  if (!s) return null;

  const lookupD = (v) => (typeof lookupDataComponent === 'function' ? lookupDataComponent(v) : null) || { min: 0, median: 0, max: 0 };
  const lookupT = (v) => (typeof lookupTransComponent === 'function' ? lookupTransComponent(v) : null) || { min: 0, median: 0, max: 0 };

  // Fungsi Data
  let dMin = 0, dMl = 0, dMax = 0;
  const dataRows = (s.fungsiData || []).filter(r => r && (r.komponen || r.entiti)).map((r, i) => {
    const g = parseInt(r.gandaan) || 1;
    const ref = lookupD(r.komponen || '');
    const mMin = ref.min * g, mMl = ref.median * g, mMax = ref.max * g;
    dMin += mMin; dMl += mMl; dMax += mMax;
    return { no: i + 1, entiti: r.entiti || '', agg: repAggNum(r.aggregat), komp: r.komponen || '', mult: g,
             min: ref.min, ml: ref.median, max: ref.max, mMin, mMl, mMax };
  });

  // Fungsi Transaksi
  let tMin = 0, tMl = 0, tMax = 0;
  const transRows = (s.fungsiTrans || []).filter(r => r && (r.komponen || r.makro || r.general)).map((r, i) => {
    const g = parseInt(r.gandaan) || 1;
    const ref = lookupT(r.komponen || '');
    const mMin = ref.min * g, mMl = ref.median * g, mMax = ref.max * g;
    tMin += mMin; tMl += mMl; tMax += mMax;
    return { no: i + 1, makro: r.makro || '', general: r.general || '', agg: repAggNum(r.aggregat), komp: r.komponen || '', mult: g,
             min: ref.min, ml: ref.median, max: ref.max, mMin, mMl, mMax };
  });

  // VAF
  const vafArr = (s.vaf && s.vaf.length === 14) ? s.vaf.map(v => parseInt(v) || 0) : new Array(14).fill(0);
  const tdi = vafArr.reduce((a, b) => a + b, 0);
  const vaf = (tdi * 0.01) + 0.65;

  // FP / cost / mandays roll-ups
  const cMin = dMin + tMin, cMl = dMl + tMl, cMax = dMax + tMax;
  const afpMin = cMin * vaf, afpMl = cMl * vaf, afpMax = cMax * vaf;
  const kosMin = afpMin * FUSE_COST_PER_FP, kosMl = afpMl * FUSE_COST_PER_FP, kosMax = afpMax * FUSE_COST_PER_FP;
  const manMin = Math.floor(afpMin * 10 / 8), manMl = Math.floor(afpMl * 10 / 8), manMax = Math.floor(afpMax * 10 / 8);

  // Kos Pengurusan (per-row base + 8% SST)
  let pengBase = 0, pengSst = 0;
  const pengRows = (s.pengurusan || []).filter(r => r && r.perkara).map((r, i) => {
    const harga = parseFloat(r.harga) || 0;
    const kuantiti = parseInt(r.kuantiti) || 0;
    const base = harga * kuantiti;
    const sst = base * 0.08;
    pengBase += base; pengSst += sst;
    return { no: i + 1, perkara: r.perkara, harga, kuantiti, base, sst, total: base + sst };
  });
  const pengTotal = pengBase + pengSst;

  // Kos Perkakasan (no SST)
  let perkTotal = 0;
  const perkRows = (s.perkakasan || []).filter(r => r && r.nama).map((r, i) => {
    const harga = parseFloat(r.harga) || 0;
    const kuantiti = parseInt(r.kuantiti) || 0;
    const total = harga * kuantiti;
    perkTotal += total;
    return { no: i + 1, nama: r.nama, harga, kuantiti, total };
  });

  // Headline (cover) costs — FPA headline follows the MAX column, like the official report.
  const fpaHead = kosMax, fpaHeadSst = kosMax * 1.08;
  const rumusanBase = fpaHead + pengBase + perkTotal;
  const rumusanSst = fpaHeadSst + pengTotal + perkTotal;

  return {
    kod: s.kod, nama: s.nama || '', keterangan: s.keterangan || '',
    dataRows, transRows, vafArr, tdi, vaf,
    dMin, dMl, dMax, tMin, tMl, tMax, cMin, cMl, cMax,
    afpMin, afpMl, afpMax, kosMin, kosMl, kosMax, manMin, manMl, manMax,
    pengRows, pengBase, pengSst, pengTotal, perkRows, perkTotal,
    fpaHead, fpaHeadSst, rumusanBase, rumusanSst,
  };
}

// ── page chrome (header band + footer disclaimer) ────────────────
function repPage(nama, innerHtml) {
  return `<div class="lap-page">
    <div class="lap-head">
      <div class="lap-head-title">LAPORAN ANALISIS SISTEM DAN ANGGARAN KOS</div>
      <div class="lap-head-sys">${repEsc((nama || '').toUpperCase())}</div>
    </div>
    <div class="lap-body">${innerHtml}</div>
    <div class="lap-foot">
      <div class="lap-foot-meta">Dijana oleh: ${repEsc(repUserName())} &nbsp;·&nbsp; Tarikh Dijana: ${repToday()}</div>
      <div class="lap-foot-note">Penafian: Laporan analisis sistem ini disediakan berdasarkan sumber rujukan rasmi yang dikeluarkan oleh Jabatan Digital Negara (JDN). Segala analisis dan penilaian dalam laporan ini menggunakan kaedah Function Point Analysis (FPA) sebagaimana yang ditetapkan dalam garis panduan JDN.</div>
    </div>
  </div>`;
}

function repTriHead(label) {
  return `<tr><th class="lap-l">${label}</th><th>MN</th><th>ML</th><th>MX</th></tr>`;
}

// ── render the full report HTML ──────────────────────────────────
function renderLaporanHtml(d) {
  // Page 1 — Maklumat Sistem (cover)
  const infoRow = (label, val) => `<tr><td class="lap-info-k">${label}</td><td class="lap-info-v">${val}</td></tr>`;
  const cover = repPage(d.nama, `
    <div class="lap-cover-title">Maklumat Sistem</div>
    <table class="lap-info">
      ${infoRow('Kod Sistem', repEsc(d.kod))}
      ${infoRow('Nama Sistem', repEsc(d.nama))}
      ${infoRow('Kos FPA', `${repMoney(d.fpaHead)} | ${repMoney(d.fpaHeadSst)} (Termasuk SST 8%)`)}
      ${infoRow('Kos Pengurusan', `${repMoney(d.pengBase)} | ${repMoney(d.pengTotal)} (Termasuk SST 8%)`)}
      ${infoRow('Kos Perkakasan', repMoney(d.perkTotal))}
      ${infoRow('Rumusan Kos Keseluruhan', `${repMoney(d.rumusanBase)} | ${repMoney(d.rumusanSst)} (Termasuk SST 8%)`)}
      ${infoRow('Keterangan Ringkas', repEsc(d.keterangan) || '—')}
    </table>
    <div class="lap-cover-sign">
      <div><strong>Disediakan Oleh:</strong> Universiti Teknologi Malaysia</div>
      <div><strong>Tarikh Laporan:</strong> ${repToday()}</div>
    </div>`);

  // Page 2 — Fungsi Data
  const dataBody = d.dataRows.length ? d.dataRows.map(r => `<tr>
      <td>${r.no}</td><td class="lap-l">${repEsc(r.entiti)}</td><td>${r.agg}</td><td class="lap-l">${repEsc(r.komp)}</td>
      <td>${r.mult}</td><td>${repNum(r.min)}</td><td>${repNum(r.ml)}</td><td>${repNum(r.max)}</td>
      <td>${repNum(r.mMin)}</td><td>${repNum(r.mMl)}</td><td>${repNum(r.mMax)}</td></tr>`).join('')
    : `<tr><td colspan="11" class="lap-empty">Tiada Fungsi Data didaftarkan.</td></tr>`;
  const dataPage = repPage(d.nama, `
    <div class="lap-sec-title">Laporan Analisis (FPA)</div>
    <h3 class="lap-h3">Fungsi Data</h3>
    <p class="lap-desc">Fungsi Data menyokong pengiraan saiz fungsi sistem berdasarkan keperluan data yang diiktiraf oleh pengguna — perincian mengikut entiti, tahap agregasi, jenis komponen, dan pengganda (Multiplier) untuk mendapatkan nilai UFP (Unadjusted Function Point).</p>
    <table class="lap-tbl">
      <thead><tr><th>No</th><th class="lap-l">Entity</th><th>Agg</th><th class="lap-l">Type Of Component</th><th>Mult</th><th>MIN</th><th>ML</th><th>MAX</th><th>M-MIN</th><th>M-ML</th><th>M-MAX</th></tr></thead>
      <tbody>${dataBody}</tbody>
      <tfoot><tr><td colspan="8" class="lap-total">TOTAL uFP FUNGSI DATA</td><td>${repNum(d.dMin)}</td><td>${repNum(d.dMl)}</td><td>${repNum(d.dMax)}</td></tr></tfoot>
    </table>`);

  // Page 3 — Fungsi Transaksi
  const transBody = d.transRows.length ? d.transRows.map(r => `<tr>
      <td>${r.no}</td><td class="lap-l">${repEsc(r.makro)}</td><td class="lap-l">${repEsc(r.general)}</td><td>${r.agg}</td><td class="lap-l">${repEsc(r.komp)}</td>
      <td>${r.mult}</td><td>${repNum(r.min)}</td><td>${repNum(r.ml)}</td><td>${repNum(r.max)}</td>
      <td>${repNum(r.mMin)}</td><td>${repNum(r.mMl)}</td><td>${repNum(r.mMax)}</td></tr>`).join('')
    : `<tr><td colspan="12" class="lap-empty">Tiada Fungsi Transaksi didaftarkan.</td></tr>`;
  const transPage = repPage(d.nama, `
    <h3 class="lap-h3">Fungsi Transaksi</h3>
    <p class="lap-desc">Fungsi Transaksi merujuk kepada proses asas yang membolehkan pengguna berinteraksi dengan sistem: External Input (EI), External Inquiry (EQ), dan External Output (EO). Ia penting bagi memenuhi keperluan input, output, dan interaksi data dalam sistem.</p>
    <table class="lap-tbl">
      <thead><tr><th>No</th><th class="lap-l">Macro Process</th><th class="lap-l">General Process</th><th>Agg</th><th class="lap-l">Type Of Component</th><th>Mult</th><th>MIN</th><th>ML</th><th>MAX</th><th>M-MIN</th><th>M-ML</th><th>M-MAX</th></tr></thead>
      <tbody>${transBody}</tbody>
      <tfoot><tr><td colspan="9" class="lap-total">TOTAL uFP FUNGSI TRANSAKSI</td><td>${repNum(d.tMin)}</td><td>${repNum(d.tMl)}</td><td>${repNum(d.tMax)}</td></tr></tfoot>
    </table>`);

  // Page 4 — VAF
  let vafRows = '';
  for (let i = 0; i < 7; i++) {
    const j = i + 7;
    vafRows += `<tr>
      <td>${i + 1}</td><td class="lap-l">${VAF_GSC_LABELS[i]}</td><td>${d.vafArr[i]}</td>
      <td>${j + 1}</td><td class="lap-l">${VAF_GSC_LABELS[j]}</td><td>${d.vafArr[j]}</td></tr>`;
  }
  const vafPage = repPage(d.nama, `
    <h3 class="lap-h3">Value Adjustment Factor (VAF)</h3>
    <p class="lap-desc">VAF menyesuaikan saiz fungsi tidak terlaras berdasarkan pengaruh 14 ciri sistem umum (General System Characteristics), dinilai pada skala Degree of Influence 0 hingga 5.</p>
    <table class="lap-tbl">
      <thead><tr><th>No</th><th class="lap-l">GSC</th><th>(0-5)</th><th>No</th><th class="lap-l">GSC</th><th>(0-5)</th></tr></thead>
      <tbody>${vafRows}</tbody>
      <tfoot>
        <tr><td colspan="5" class="lap-total">TOTAL DEGREE OF INFLUENCE (TDI)</td><td>${d.tdi}</td></tr>
        <tr><td colspan="5" class="lap-total">VALUE ADJUSTMENT FACTOR (VAF) = (TDI × 0.01) + 0.65</td><td>${repNum(d.vaf)}</td></tr>
      </tfoot>
    </table>`);

  // Page 5 — Ringkasan Analisis (FPA)
  const ringkasanPage = repPage(d.nama, `
    <h3 class="lap-h3">Ringkasan Analisis (FPA)</h3>
    <p class="lap-desc">Anggaran Saiz Function Point (FP), Kos, dan Mandays berdasarkan nilai minimum (MN), sederhana (ML), dan maksimum (MX). Kos = aFP × RM${FUSE_COST_PER_FP}; Mandays = (aFP × 10 jam) / 8 jam.</p>
    <table class="lap-tbl lap-sum">
      <thead>${repTriHead('Anggaran Saiz Function Point (FP)')}</thead>
      <tbody>
        <tr><td class="lap-l">Jumlah uFP Fungsi Data (A)</td><td>${repNum(d.dMin)}</td><td>${repNum(d.dMl)}</td><td>${repNum(d.dMax)}</td></tr>
        <tr><td class="lap-l">Jumlah uFP Fungsi Transaksi (B)</td><td>${repNum(d.tMin)}</td><td>${repNum(d.tMl)}</td><td>${repNum(d.tMax)}</td></tr>
        <tr><td class="lap-l">Jumlah uFP (C = A + B)</td><td>${repNum(d.cMin)}</td><td>${repNum(d.cMl)}</td><td>${repNum(d.cMax)}</td></tr>
        <tr><td class="lap-l">Value Adjustment Factor (VAF) (D)</td><td>${repNum(d.vaf)}</td><td>${repNum(d.vaf)}</td><td>${repNum(d.vaf)}</td></tr>
        <tr class="lap-strong"><td class="lap-l">Jumlah aFP (C × D)</td><td>${repNum(d.afpMin)}</td><td>${repNum(d.afpMl)}</td><td>${repNum(d.afpMax)}</td></tr>
      </tbody>
    </table>
    <table class="lap-tbl lap-sum">
      <thead>${repTriHead('Jumlah Kos (RM) — Kos Per FP × ' + FUSE_COST_PER_FP)}</thead>
      <tbody><tr class="lap-strong"><td class="lap-l">Anggaran Kos</td><td>${repMoney(d.kosMin)}</td><td>${repMoney(d.kosMl)}</td><td>${repMoney(d.kosMax)}</td></tr></tbody>
    </table>
    <table class="lap-tbl lap-sum">
      <thead>${repTriHead('Jumlah Mandays')}</thead>
      <tbody><tr class="lap-strong"><td class="lap-l">Mandays = (aFP × 10) / 8</td><td>${d.manMin}</td><td>${d.manMl}</td><td>${d.manMax}</td></tr></tbody>
    </table>`);

  // Page 6 — Kos Pengurusan
  const pengBody = d.pengRows.length ? d.pengRows.map(r => `<tr>
      <td>${r.no}</td><td class="lap-l">${repEsc(r.perkara)}</td><td>${repNum(r.harga)}</td><td>${r.kuantiti}</td>
      <td>${repNum(r.base)}</td><td>${repNum(r.sst)}</td><td>${repNum(r.total)}</td></tr>`).join('')
    : `<tr><td colspan="7" class="lap-empty">Tiada item Kos Pengurusan.</td></tr>`;
  const pengPage = repPage(d.nama, `
    <h3 class="lap-h3">Kos Pengurusan</h3>
    <p class="lap-desc">Senarai perbelanjaan untuk kajian dan dokumentasi — harga seunit, kuantiti, jumlah kos sebelum dan selepas cukai SST 8%.</p>
    <table class="lap-tbl">
      <thead><tr><th>Bil</th><th class="lap-l">Perkara</th><th>Harga Seunit (RM)</th><th>Kuantiti</th><th>Harga Keseluruhan (RM)</th><th>SST 8% (RM)</th><th>Termasuk SST 8% (RM)</th></tr></thead>
      <tbody>${pengBody}</tbody>
      <tfoot><tr><td colspan="4" class="lap-total">JUMLAH</td><td>${repNum(d.pengBase)}</td><td>${repNum(d.pengSst)}</td><td>${repNum(d.pengTotal)}</td></tr></tfoot>
    </table>`);

  // Page 7 — Kos Perkakasan
  const perkBody = d.perkRows.length ? d.perkRows.map(r => `<tr>
      <td>${r.no}</td><td class="lap-l">${repEsc(r.nama)}</td><td>${repNum(r.harga)}</td><td>${r.kuantiti}</td>
      <td>${repNum(r.total)}</td></tr>`).join('')
    : `<tr><td colspan="5" class="lap-empty">Tiada item Kos Perkakasan.</td></tr>`;
  const perkPage = repPage(d.nama, `
    <h3 class="lap-h3">Kos Perkakasan</h3>
    <p class="lap-desc">Senarai perkakasan / infrastruktur yang diperlukan oleh sistem berserta harga seunit, kuantiti, dan jumlah keseluruhan.</p>
    <table class="lap-tbl">
      <thead><tr><th>Bil</th><th class="lap-l">Perkakasan</th><th>Harga Seunit (RM)</th><th>Kuantiti</th><th>Harga Keseluruhan (RM)</th></tr></thead>
      <tbody>${perkBody}</tbody>
      <tfoot><tr><td colspan="4" class="lap-total">JUMLAH</td><td>${repNum(d.perkTotal)}</td></tr></tfoot>
    </table>`);

  return cover + dataPage + transPage + vafPage + ringkasanPage + pengPage + perkPage;
}

// ── public entry points ──────────────────────────────────────────
// Build & show the report for a system, then switch to the Laporan section.
function janaLaporan(kod) {
  if (!kod || !(window.systems || {})[kod]) {
    alert('Sila pilih sistem yang sah untuk menjana laporan.');
    return;
  }
  // Make sure the latest edits on whatever page is open are captured first.
  if (typeof persistCurrentSystemState === 'function') { try { persistCurrentSystemState(); } catch (_) {} }

  currentReportKod = kod;
  const d = computeLaporan(kod);
  const host = document.getElementById('laporan-report');
  if (host && d) host.innerHTML = renderLaporanHtml(d);

  document.getElementById('laporan-list-wrap').style.display = 'none';
  document.getElementById('laporan-view-wrap').style.display = '';
  if (typeof switchSection === 'function') switchSection('laporan');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.janaLaporan = janaLaporan;

// Back to the system list inside the Laporan section.
function closeLaporan() {
  document.getElementById('laporan-view-wrap').style.display = 'none';
  document.getElementById('laporan-list-wrap').style.display = '';
  renderLaporanList();
}
window.closeLaporan = closeLaporan;

// Build the list of systems shown when the Laporan section opens.
function renderLaporanList() {
  const body = document.getElementById('laporan-list-body');
  if (!body) return;
  const list = Object.values(window.systems || {});
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:36px;">Tiada sistem didaftar. Daftar sistem di <strong>Analisis Sistem</strong> dahulu.</td></tr>`;
    return;
  }
  body.innerHTML = list.map((s, i) => `<tr>
      <td>${i + 1}</td>
      <td><span style="background:#b81cbb; color:white; padding:4px 12px; border-radius:15px; font-weight:600; font-size:11px;">${repEsc(s.kod)}</span></td>
      <td style="font-weight:500;">${repEsc(s.nama)}</td>
      <td>${repEsc(s.keterangan)}</td>
      <td style="text-align:right;"><button class="btn-ai-cost" style="background:var(--fuse-navy); box-shadow:none;" onclick="janaLaporan('${repEsc(s.kod)}')">📄 Jana Laporan</button></td>
    </tr>`).join('');
}
window.renderLaporanList = renderLaporanList;

// Download the current report as a PDF (html2pdf is loaded in index.html).
function muatTurunLaporanPDF() {
  const el = document.getElementById('laporan-report');
  if (!el || !currentReportKod) { alert('Tiada laporan untuk dimuat turun.'); return; }
  const s = (window.systems || {})[currentReportKod] || {};
  const safe = `${currentReportKod}_${String(s.nama || '').replace(/\s+/g, '_')}`;
  const btn = document.getElementById('laporan-pdf-btn');
  if (typeof html2pdf === 'undefined') { window.print(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Menjana PDF…'; }
  const opt = {
    margin: 0,
    filename: `Laporan_Analisis_${safe}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  };
  html2pdf().set(opt).from(el).save().finally(() => {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Muat Turun PDF'; }
  });
}
window.muatTurunLaporanPDF = muatTurunLaporanPDF;

// Browser print of just the report.
function cetakLaporan() {
  document.body.classList.add('lap-printing');
  const cleanup = () => { document.body.classList.remove('lap-printing'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
window.cetakLaporan = cetakLaporan;

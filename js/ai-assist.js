// ================================================================
//  FUSE AI — Integrated Intelligence Layer
//  Covers: Fungsi Data + Konfigurasi VAF
// ================================================================

// ── Suggestion datasets ──────────────────────────────────────────
const AI_DATA_SUGG = [
  { field: 'Entiti', rowHint: 'Baris 1',  value: 'Pengguna (User)',   reason: 'Entiti utama untuk sistem pengurusan — menyimpan profil, akses dan kelayakan pengguna.' },
  { field: 'Aggregat', rowHint: 'Baris 1', value: '1 - Amat Terperinci', reason: 'Entiti pengguna lazimnya menyimpan data yang sangat terperinci (>19 DET).' },
  { field: 'Komponen', rowHint: 'Baris 1', value: 'ILFH - high',      reason: 'ILF (Internal Logical File) — kerumitan tinggi kerana >15 DET dan ≥3 RET.' },
  { field: 'Entiti', rowHint: 'Baris 2',  value: 'Projek (Project)',  reason: 'Entiti teras sistem — menyimpan maklumat skop, jadual dan kos projek.' },
  { field: 'Aggregat', rowHint: 'Baris 2', value: '3 - Kurang Perincian', reason: 'Data projek tipikal mempunyai 5–15 DET.' },
  { field: 'Komponen', rowHint: 'Baris 2', value: 'ILFM - medium',    reason: 'ILF dengan kerumitan sederhana (10–15 DET, 2 RET).' },
  { field: 'Entiti', rowHint: 'Baris 3',  value: 'Laporan (Report)',  reason: 'Entiti luaran — data laporan dibaca dari sistem lain.' },
  { field: 'Komponen', rowHint: 'Baris 3', value: 'EIFM - medium',    reason: 'EIF (External Interface File) — fail antaramuka sederhana dari sistem luar.' },
];

const AI_VAF_SUGG = [
  { idx:1,  label:'Data Communications',         value:3, reason:'Sistem berkomunikasi melalui rangkaian dalaman — pengaruh sederhana.' },
  { idx:2,  label:'Distributed Data Processing', value:2, reason:'Pemprosesan agihan terhad; kebanyakan logik berpusat.' },
  { idx:3,  label:'Performance',                 value:3, reason:'Prestasi sederhana diperlukan untuk laporan dan carian.' },
  { idx:4,  label:'Heavily Used Configuration',  value:2, reason:'Konfigurasi perkakasan standard; tiada keperluan khas.' },
  { idx:5,  label:'Transaction Rate',            value:2, reason:'Kadar transaksi dijangka rendah-sederhana.' },
  { idx:6,  label:'On-line Data Entry',          value:4, reason:'Pengguna memasukkan data secara langsung melalui borang dalam talian.' },
  { idx:7,  label:'End-User Efficiency',         value:3, reason:'Antara muka perlu mesra pengguna tetapi bukan keperluan utama.' },
  { idx:8,  label:'On-Line Update',              value:3, reason:'Kemaskini data berlaku secara berkala semasa sesi aktif.' },
  { idx:9,  label:'Complex Processing',          value:2, reason:'Pengiraan FPA adalah formula tetap; tiada logik kompleks.' },
  { idx:10, label:'Reusability',                 value:2, reason:'Modul boleh diguna semula sebahagiannya oleh sistem lain.' },
  { idx:11, label:'Installation Ease',           value:2, reason:'Pemasangan pada pelayan standard; tiada keperluan khas.' },
  { idx:12, label:'Operational Ease',            value:3, reason:'Sistem perlu mudah dioperasi oleh pentadbir ICT.' },
  { idx:13, label:'Multiple Sites',              value:1, reason:'Digunakan di lokasi tunggal atau beberapa lokasi sahaja.' },
  { idx:14, label:'Facilitate Change',           value:2, reason:'Perubahan keperluan dijangka rendah selepas pelancaran.' },
];

// ── State ────────────────────────────────────────────────────────
let aiDrawerCtx  = null;   // 'data' | 'vaf'
let aiSuggState  = {};     // { index: 'pending'|'accepted'|'skipped' }
let aiSuggList   = [];

// ── Menu toggle ──────────────────────────────────────────────────
function toggleAiMenu(ctx) {
  const menu = document.getElementById('ai-menu-' + ctx);
  const isOpen = menu.classList.contains('open');
  // close all menus first
  document.querySelectorAll('.ai-menu').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}
// Close menus on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('[id^="ai-wrap-"]')) {
    document.querySelectorAll('.ai-menu').forEach(m => m.classList.remove('open'));
  }
});

// ── AUTO FILL ────────────────────────────────────────────────────
async function doAiAutoFill(ctx) {
  document.querySelectorAll('.ai-menu').forEach(m => m.classList.remove('open'));

  if (ctx === 'data') {
    if (!currentSystemCode) { showAiToast('⚠ Sila pilih sistem dahulu', false); return; }
    const prog = document.getElementById('ai-prog-data');
    const bar  = document.getElementById('ai-prog-data-bar');
    const txt  = document.getElementById('ai-prog-data-text');
    prog.classList.add('show');

    // Step 1 — analysing
    txt.innerHTML = 'AI sedang menganalisis profil projek…';
    bar.style.width = '20%';
    await sleep(600);

    // Add rows if empty
    const tbody = document.querySelector('#page-data tbody');
    const existingRows = tbody.querySelectorAll('tr[id^="row-data-"]').length;
    if (existingRows === 0) {
      const demoRows = [
        { entiti:'Pengguna (User)',  aggregat:'1 - Amat Terperinci', komponen:'ILFH - high',  gandaan:'1', catatan:'Profil, akses dan kelayakan pengguna sistem' },
        { entiti:'Projek (Project)', aggregat:'3 - Kurang Perincian', komponen:'ILFM - medium', gandaan:'1', catatan:'Skop, jadual dan kos projek' },
        { entiti:'Laporan (Report)', aggregat:'4 - Tiada Perincian', komponen:'EIFM - medium', gandaan:'1', catatan:'Data laporan dari sistem luar' },
      ];

      txt.innerHTML = 'AI menjana rekod Fungsi Data…';
      bar.style.width = '50%';
      await sleep(500);

      for (let i = 0; i < demoRows.length; i++) {
        const r = demoRows[i];
        bar.style.width = (50 + (i + 1) * 15) + '%';
        txt.innerHTML = 'Mendaftar entiti <span>' + r.entiti + '</span>…';

        // Use existing addRow logic
        dataRowCounter++;
        const id = dataRowCounter;
        tbody.insertAdjacentHTML('beforeend', buildDataRowHtml(id, {
          entiti: r.entiti, aggregat: r.aggregat, komponen: r.komponen,
          gandaan: r.gandaan, catatan: r.catatan, saved: false
        }));

        // Style the new row as AI-filled
        const newRow = document.getElementById('row-data-' + id);
        if (newRow) newRow.classList.add('ai-row-filled');

        // Highlight the komponen input as AI-set
        const kompEl = document.getElementById('komponen-data-' + id);
        if (kompEl) {
          kompEl.style.color = '#333';
          kompEl.style.background = '#fff';
          kompEl.classList.add('ai-set');
        }
        await sleep(380);
      }
    } else {
      // Fill empty fields in existing rows
      txt.innerHTML = 'AI mengisi medan yang kosong…';
      bar.style.width = '60%';
      await sleep(700);
      const demoFills = [
        { komponen:'ILFH - high' }, { komponen:'ILFM - medium' }, { komponen:'EIFM - medium' }
      ];
      let rowEls = [...document.querySelectorAll('#page-data tbody tr[id^="row-data-"]')];
      for (let ri = 0; ri < Math.min(rowEls.length, demoFills.length); ri++) {
        const id = rowEls[ri].id.replace('row-data-', '');
        const kompEl = document.getElementById('komponen-data-' + id);
        if (kompEl && !kompEl.value) {
          kompEl.value = demoFills[ri].komponen;
          kompEl.style.color = '#333';
          kompEl.style.background = '#fff';
          kompEl.classList.add('ai-set');
          rowEls[ri].classList.add('ai-row-filled');
          await sleep(300);
        }
      }
    }

    bar.style.width = '100%';
    txt.innerHTML = 'Selesai! <span>' + dataRowCounter + ' rekod</span> telah ditetapkan.';
    await sleep(900);
    prog.classList.remove('show');
    updateFinalReport();
    showAiToast('✦ ' + dataRowCounter + ' rekod Fungsi Data telah diisi oleh AI');

  } else if (ctx === 'vaf') {
    const prog = document.getElementById('ai-prog-vaf');
    const bar  = document.getElementById('ai-prog-vaf-bar');
    const txt  = document.getElementById('ai-prog-vaf-text');
    prog.classList.add('show');
    bar.style.width = '10%';
    txt.innerHTML = 'AI menganalisis Fungsi Data untuk cadang nilai GSC…';
    await sleep(700);

    for (let i = 0; i < AI_VAF_SUGG.length; i++) {
      const s = AI_VAF_SUGG[i];
      bar.style.width = (10 + ((i + 1) / 14) * 85) + '%';
      txt.innerHTML = 'Menetapkan <span>' + s.label + '</span>…';
      const el = document.getElementById('komponen-vaf-' + s.idx);
      if (el) {
        el.value = s.value;
        el.classList.add('ai-set');
        calculateVAF();
      }
      await sleep(55);
    }

    bar.style.width = '100%';
    txt.innerHTML = 'Selesai! <span>14 nilai GSC</span> telah ditetapkan oleh AI.';
    await sleep(900);
    prog.classList.remove('show');
    showAiToast('✦ 14 nilai GSC telah dikonfigurasi oleh AI');
  }
}

// ── SUGGESTION DRAWER ────────────────────────────────────────────
function openAiDrawer(ctx) {
  document.querySelectorAll('.ai-menu').forEach(m => m.classList.remove('open'));
  if (!currentSystemCode && ctx === 'data') {
    showAiToast('⚠ Sila pilih sistem dahulu', false); return;
  }

  aiDrawerCtx = ctx;
  aiSuggList  = ctx === 'data' ? [...AI_DATA_SUGG] : [...AI_VAF_SUGG];
  aiSuggState = {};

  // Set drawer meta
  const titleEl = document.getElementById('ai-drawer-title');
  const subEl   = document.getElementById('ai-drawer-sub');
  const ctxBox  = document.getElementById('ai-drawer-ctx');
  const ctxVal  = document.getElementById('ai-drawer-ctx-val');

  if (ctx === 'data') {
    titleEl.textContent = 'Cadangan Fungsi Data';
    subEl.textContent   = AI_DATA_SUGG.length + ' cadangan dijumpai';
  } else {
    titleEl.textContent = 'Cadangan Konfigurasi VAF';
    subEl.textContent   = AI_VAF_SUGG.length + ' nilai GSC dicadangkan';
  }

  if (currentSystemCode && systems[currentSystemCode]) {
    ctxBox.style.display = '';
    ctxVal.textContent   = systems[currentSystemCode].nama || currentSystemCode;
  } else {
    ctxBox.style.display = 'none';
  }

  renderAiDrawer();
  document.getElementById('ai-shade').classList.add('show');
  setTimeout(() => document.getElementById('ai-drawer').classList.add('open'), 10);
}

function closeAiDrawer() {
  document.getElementById('ai-drawer').classList.remove('open');
  document.getElementById('ai-shade').classList.remove('show');
}

function renderAiDrawer() {
  const body = document.getElementById('ai-drawer-body');
  if (!body) return;

  if (aiDrawerCtx === 'data') {
    body.innerHTML = AI_DATA_SUGG.map((s, i) => buildDataSuggCard(s, i)).join('');
  } else {
    body.innerHTML = AI_VAF_SUGG.map((s, i) => buildVafSuggCard(s, i)).join('');
  }
}

function buildDataSuggCard(s, i) {
  const st = aiSuggState[i] || 'pending';
  const accepted = st === 'accepted';
  const skipped  = st === 'skipped';
  return `<div class="ai-sug-card ${accepted ? 'accepted' : ''} ${skipped ? 'skipped' : ''}" id="ai-sug-${i}">
    <div class="ai-sug-field">
      <div class="ai-sug-field-name">${s.field} · ${s.rowHint}</div>
      ${accepted ? '<div class="ai-sug-status ok">✓ Digunakan</div>' : ''}
      ${skipped  ? '<div class="ai-sug-status skip">— Diskip</div>' : ''}
    </div>
    <div class="ai-sug-value">${s.value}</div>
    <div class="ai-sug-reason">${s.reason}</div>
    ${!accepted && !skipped ? `<div class="ai-sug-actions">
      <button class="ai-sug-btn skip-btn" onclick="actAiSugg(${i},'skip')">Langkau</button>
      <button class="ai-sug-btn use" onclick="actAiSugg(${i},'accept')">Guna</button>
    </div>` : ''}
  </div>`;
}

function buildVafSuggCard(s, i) {
  const st = aiSuggState[i] || 'pending';
  const accepted = st === 'accepted';
  const skipped  = st === 'skipped';
  return `<div class="ai-sug-card ${accepted ? 'accepted' : ''} ${skipped ? 'skipped' : ''}" id="ai-sug-${i}">
    <div class="ai-sug-field">
      <div class="ai-sug-field-name">GSC ${s.idx} · ${s.label}</div>
      ${accepted ? '<div class="ai-sug-status ok">✓ Ditetapkan</div>' : ''}
      ${skipped  ? '<div class="ai-sug-status skip">— Diskip</div>' : ''}
    </div>
    <div class="ai-sug-value">Nilai: ${s.value} / 5</div>
    <div class="ai-sug-reason">${s.reason}</div>
    ${!accepted && !skipped ? `<div class="ai-sug-actions">
      <button class="ai-sug-btn skip-btn" onclick="actAiSugg(${i},'skip')">Langkau</button>
      <button class="ai-sug-btn use" onclick="actAiSugg(${i},'accept')">Guna</button>
    </div>` : ''}
  </div>`;
}

function actAiSugg(i, action) {
  aiSuggState[i] = action;
  if (action === 'accept') applyAiSugg(i);
  renderAiDrawer();
}

function applyAiSugg(i) {
  const s = aiSuggList[i];
  if (aiDrawerCtx === 'data') {
    // Determine which row to fill based on rowHint
    const rowNum = parseInt(s.rowHint.replace('Baris ', '')) || 1;
    const fieldKey = s.field.toLowerCase();

    // Ensure rows exist
    while (dataRowCounter < rowNum) {
      if (!currentSystemCode) break;
      dataRowCounter++;
      const tbody = document.querySelector('#page-data tbody');
      tbody.insertAdjacentHTML('beforeend', buildDataRowHtml(dataRowCounter));
    }

    const id = rowNum;
    if (fieldKey === 'entiti') {
      const el = document.getElementById('entiti-data-' + id);
      if (el) { el.value = s.value; el.classList.add('ai-set'); }
    } else if (fieldKey === 'aggregat') {
      const el = document.getElementById('aggregat-data-' + id);
      if (el) { el.value = s.value; }
    } else if (fieldKey === 'komponen') {
      const el = document.getElementById('komponen-data-' + id);
      if (el) {
        el.value = s.value;
        el.style.color = '#333'; el.style.background = '#fff';
        el.classList.add('ai-set');
      }
    }
    const row = document.getElementById('row-data-' + id);
    if (row) { row.classList.add('ai-row-filled'); setTimeout(() => row.classList.remove('ai-row-filled'), 1200); }
    updateFinalReport();

  } else if (aiDrawerCtx === 'vaf') {
    const el = document.getElementById('komponen-vaf-' + s.idx);
    if (el) { el.value = s.value; el.classList.add('ai-set'); calculateVAF(); }
  }
}

function acceptAllAiSugg() {
  aiSuggList.forEach((s, i) => {
    if (!aiSuggState[i]) { aiSuggState[i] = 'accepted'; applyAiSugg(i); }
  });
  renderAiDrawer();
  const count = Object.values(aiSuggState).filter(v => v === 'accepted').length;
  setTimeout(() => {
    closeAiDrawer();
    showAiToast('✦ ' + count + ' cadangan AI telah digunakan');
  }, 500);
}

// ── Toast ────────────────────────────────────────────────────────
function showAiToast(msg, good = true) {
  const t = document.getElementById('ai-toast');
  const m = document.getElementById('ai-toast-msg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3400);
}

// ── Utility ──────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ================================================================
// AI MODAL GROW-FROM-BUTTON
// Single-element technique borrowed from the gooey-blob reference:
// the modal itself grows from the clicked button's screen position
// instead of separate blobs flying. Smoother because there's only
// ONE animated element on the GPU (no goo filter, no particle
// scattering). aiModalLaunch(btn) sets the transform-origin so the
// CSS keyframe (in ai-modal.css) plays from that anchor.
// ================================================================
function aiModalLaunch(sourceBtn, realOpener) {
  const opensChatbox = realOpener === window.openAIPanel
                    || realOpener === window.openAIModal
                    || realOpener === window.openAIReviewPanel;
  if (sourceBtn && typeof sourceBtn.getBoundingClientRect === 'function') {
    const rect = sourceBtn.getBoundingClientRect();
    // Wider, taller panel — uses up to 1600px wide and almost the full viewport.
    // 30px gap on each side; only the browser toolbar at the top is left clear.
    const panelW = Math.min(1600, window.innerWidth - 40);
    const panelH = Math.max(460, window.innerHeight - 80);
    const panelLeft = Math.max(20, window.innerWidth - panelW - 20);
    const panelTop = Math.max(20, window.innerHeight - panelH - 20);
    const sourceCenterX = rect.left + rect.width / 2;
    const sourceCenterY = rect.top + rect.height / 2;
    const originX = ((sourceCenterX - panelLeft) / panelW) * 100;
    const originY = ((sourceCenterY - panelTop) / panelH) * 100;
    const root = document.documentElement;

    root.style.setProperty('--ai-source-left', rect.left + 'px');
    root.style.setProperty('--ai-source-top', rect.top + 'px');
    root.style.setProperty('--ai-source-width', rect.width + 'px');
    root.style.setProperty('--ai-source-height', rect.height + 'px');
    root.style.setProperty('--ai-source-radius', getComputedStyle(sourceBtn).borderRadius || '999px');
    root.style.setProperty('--ai-panel-left', panelLeft + 'px');
    root.style.setProperty('--ai-panel-top', panelTop + 'px');
    root.style.setProperty('--ai-panel-width', panelW + 'px');
    root.style.setProperty('--ai-panel-height', panelH + 'px');
    root.style.setProperty('--ai-card-scale', Math.max(rect.width / panelW, rect.height / panelH).toFixed(4));
    root.style.setProperty('--ai-card-origin-x', originX + '%');
    root.style.setProperty('--ai-card-origin-y', originY + '%');

    if (opensChatbox) {
      if (window.aiModalSourceButton && window.aiModalSourceButton !== sourceBtn) {
        window.aiModalSourceButton.classList.remove('ai-pill-morphing', 'ai-pill-rebound', 'is-active');
      }
      window.aiModalSourceButton = sourceBtn;
      sourceBtn.classList.remove('ai-pill-rebound');
      sourceBtn.classList.add('is-active', 'ai-pill-morphing');
    }
  }
  if (realOpener) realOpener();
}
window.aiModalLaunch = aiModalLaunch;

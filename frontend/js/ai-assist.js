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

// ── AI COST SUGGESTION (Kos Pengurusan / Kos Perkakasan) ─────────
// Dedicated, OPTIONAL, user-triggered button on each cost page. Asks the
// backend to propose manual cost items for the current system and drops them
// straight into the table as editable rows. These are suggestions only — the
// user can edit, delete or ignore them, and they do not affect the FPA result.
const AI_COST_BACKEND = (typeof AI_BACKEND_URL === 'string') ? AI_BACKEND_URL : 'http://localhost:3001';

async function aiSuggestCost(section) {
  section = (section === 'perkakasan') ? 'perkakasan' : 'pengurusan';
  if (!currentSystemCode || !systems[currentSystemCode]) {
    showAiToast('⚠ Sila pilih sistem dahulu', false);
    return;
  }
  const s = systems[currentSystemCode];

  const btn  = document.getElementById('ai-cost-btn-' + section);
  const prog = document.getElementById('ai-prog-' + section);
  const bar  = document.getElementById('ai-prog-' + section + '-bar');
  const txt  = document.getElementById('ai-prog-' + section + '-text');
  if (btn) btn.disabled = true;
  if (prog) prog.classList.add('show');
  if (txt) txt.innerHTML = 'AI menganalisis sistem untuk cadangan kos…';
  if (bar) bar.style.width = '30%';

  // Build a compact description of the system for the model.
  const fd = (s.fungsiData  || []).filter(r => r && (r.entiti || r.komponen)).map(r => r.entiti || r.komponen);
  const ft = (s.fungsiTrans || []).filter(r => r && (r.makro || r.komponen)).map(r => r.makro || r.general || r.komponen);

  // Existing item names currently shown in the table — so the AI can price the
  // standard pre-filled Kos Pengurusan items instead of duplicating them.
  const existingItems = aiReadCostRowNames(section);

  try {
    const r = await fetch(AI_COST_BACKEND + '/api/suggest-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, nama: s.nama || '', keterangan: s.keterangan || '', fd, ft, existingItems }),
    });
    if (bar) bar.style.width = '70%';
    if (!r.ok) {
      let msg = 'Ralat pelayan AI.';
      try { const j = await r.json(); msg = j.error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const data = await r.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('AI tidak menghasilkan cadangan.');

    if (txt) txt.innerHTML = 'Memasukkan <span>' + items.length + ' item</span> cadangan…';
    if (bar) bar.style.width = '90%';

    const res = (section === 'pengurusan')
      ? applyCostSuggestions('pengurusan', items)
      : applyCostSuggestions('perkakasan', items);

    if (bar) bar.style.width = '100%';
    if (txt) txt.innerHTML = 'Selesai! <span>' + (res.filled + res.added) + ' item</span> dikemas kini oleh AI.';
    await sleep(800);
    const parts = [];
    if (res.filled) parts.push(res.filled + ' harga diisi');
    if (res.added)  parts.push(res.added + ' item baharu');
    showAiToast('✦ AI: ' + (parts.join(' · ') || items.length + ' item') + ' — anda boleh ubah atau padam.');
  } catch (e) {
    showAiToast('⚠ ' + (e.message || 'Gagal menjana cadangan kos.'), false);
  } finally {
    if (prog) prog.classList.remove('show');
    if (bar) bar.style.width = '0%';
    if (btn) btn.disabled = false;
  }
}

// Normalise an item name for fuzzy matching (lowercase, collapse whitespace,
// strip punctuation) so "UAT & Dokumentasi" ≈ "uat dokumentasi".
function aiNormName(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Read the item names currently in a cost table (so the AI can price them).
function aiReadCostRowNames(section) {
  const sel = section === 'perkakasan' ? 'nama-perkakasan-' : 'perkara-pengurusan-';
  const prefix = section === 'perkakasan' ? 'row-perkakasan-' : 'row-pengurusan-';
  const tbodyId = section === 'perkakasan' ? 'perkakasan-table-body' : 'pengurusan-table-body';
  const names = [];
  document.querySelectorAll(`#${tbodyId} tr[id^="${prefix}"]`).forEach(tr => {
    const id = tr.id.replace(prefix, '');
    const v = document.getElementById(sel + id)?.value;
    if (v && v.trim()) names.push(v.trim());
  });
  return names;
}

// Apply AI suggestions to a cost table: fill price/qty into rows whose name
// matches an existing (empty-priced) row, and APPEND the rest as new rows.
// Returns { filled, added }. Works for both 'pengurusan' and 'perkakasan'.
function applyCostSuggestions(section, items) {
  const isPeng = section === 'pengurusan';
  const tbodyId = isPeng ? 'pengurusan-table-body' : 'perkakasan-table-body';
  const rowPrefix = isPeng ? 'row-pengurusan-' : 'row-perkakasan-';
  const nameSel = isPeng ? 'perkara-pengurusan-' : 'nama-perkakasan-';
  const hargaSel = isPeng ? 'harga-pengurusan-' : 'harga-perkakasan-';
  const qtySel = isPeng ? 'kuantiti-pengurusan-' : 'kuantiti-perkakasan-';
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return { filled: 0, added: 0 };

  if (!isPeng) { const er = document.getElementById('empty-perkakasan'); if (er) er.remove(); }

  // Index existing rows by normalised name.
  const existing = new Map();
  document.querySelectorAll(`#${tbodyId} tr[id^="${rowPrefix}"]`).forEach(tr => {
    const id = tr.id.replace(rowPrefix, '');
    const nm = aiNormName(document.getElementById(nameSel + id)?.value);
    if (nm && !existing.has(nm)) existing.set(nm, id);
  });

  let filled = 0, added = 0;
  const flash = (row) => {
    if (!row) return;
    row.classList.add('ai-row-filled');
    setTimeout(r => r.classList.remove('ai-row-filled'), 1400, row);
  };

  items.forEach(it => {
    const name = it.perkara || it.nama || '';
    const harga = Number(it.harga) || 0;
    const qty = parseInt(it.kuantiti, 10) || 1;
    const key = aiNormName(name);
    const hitId = key && existing.get(key);

    if (hitId) {
      // Fill price/qty into the matching existing row.
      const hEl = document.getElementById(hargaSel + hitId);
      const qEl = document.getElementById(qtySel + hitId);
      if (hEl) { hEl.value = harga; hEl.classList.add('ai-set'); }
      if (qEl && (!qEl.value || Number(qEl.value) <= 0)) qEl.value = qty;
      if (!isPeng && typeof validatePerkakasan === 'function') validatePerkakasan(hitId);
      flash(document.getElementById(rowPrefix + hitId));
      filled++;
    } else {
      // Append as a new row.
      let newId;
      if (isPeng) {
        pengurusanRowCounter++; newId = pengurusanRowCounter;
        tbody.insertAdjacentHTML('beforeend', buildPengurusanRowHtml(newId, { perkara: name, harga, kuantiti: qty, checked: false, saved: false }));
      } else {
        perkakasanRowCounter++; newId = perkakasanRowCounter;
        tbody.insertAdjacentHTML('beforeend', buildPerkakasanRowHtml(newId, { nama: name, harga, kuantiti: qty, saved: false }));
      }
      const hEl = document.getElementById(hargaSel + newId);
      if (hEl) hEl.classList.add('ai-set');
      flash(document.getElementById(rowPrefix + newId));
      added++;
    }
  });

  // Refresh count, recalc totals, persist.
  const n = document.querySelectorAll(`#${tbodyId} tr[id^="${rowPrefix}"]`).length;
  const countEl = document.getElementById(isPeng ? 'pengurusan-count' : 'perkakasan-count');
  if (countEl) countEl.innerText = n > 0 ? `1-${n} of ${n}` : '0-0 of 0';
  if (isPeng) { if (typeof calcPengurusan === 'function') calcPengurusan(); systems[currentSystemCode].pengurusan = serializePengurusanFromDOM(); }
  else        { if (typeof calcPerkakasan === 'function') calcPerkakasan(); systems[currentSystemCode].perkakasan = serializePerkakasanFromDOM(); }
  aiPersistSystems();
  return { filled, added };
}

// Persist via whichever save helper the app exposes (mirrors app.js patterns).
function aiPersistSystems() {
  if (typeof window.fuseSaveSystemsNow === 'function') window.fuseSaveSystemsNow();
  else if (typeof window.fuseScheduleSave === 'function') window.fuseScheduleSave(0);
}
window.aiSuggestCost = aiSuggestCost;

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

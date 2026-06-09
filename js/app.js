        // ============================================
        // GLOBAL STATE — single source of truth
        // ============================================
        let systems = {};           // { 'UTM3': {...systemObj}, 'UTM2': {...} }
        let currentSystemCode = null;
        let currentVisiblePage = 'page-senarai';  // tracks which page's DOM is editable RIGHT NOW

        const PENGURUSAN_PREFILLED = [
            "Dokumen Plan Pembangunan Sistem (PPS)",
            "Kajian Spesifikasi Keperluan Bisnes (BRS) & Dokumentasi",
            "Kajian Spesifikasi Keperluan Sistem (SRS) & Dokumentasi",
            "Kajian Spesifikasi Reka Bentuk Sistem (SDS) & Dokumentasi",
            "Dokumen Pelan Migrasi Data & Laporan",
            "Dokumen Spesifikasi Integrasi Data (IDD) & Laporan",
            "Dokumen Kod Sumber",
            "Dokumen Pangkalan Data",
            "Ujian Penerimaan Pengguna (UAT) & Dokumen Laporan",
            "Ujian Penerimaan Provisional (PAT) & Dokumen Laporan",
            "Ujian Penerimaan Akhir (FAT) & Dokumen Laporan",
            "Latihan Pengguna & Manual Pengguna",
            "Latihan Teknikal & Dokumentasi",
            "Security Posture Assessment (SPA) & Dokumen Laporan",
            "Dokumen Serahan Sistem"
        ];

        function createEmptySystem(kod, nama, keterangan) {
            return {
                kod: kod,
                nama: nama,
                keterangan: keterangan || '',
                tarikhCipta: new Date().toISOString(),
                fungsiData: [],     // [{entiti, aggregat, komponen, gandaan, catatan, saved}]
                fungsiTrans: [],    // [{makro, general, aggregat, komponen, gandaan, catatan, saved}]
                vaf: new Array(14).fill(0),
                pengurusan: PENGURUSAN_PREFILLED.map(name => ({
                    perkara: name, harga: 0, kuantiti: 1, checked: false, saved: true
                })),
                perkakasan: []      // [{nama, harga, kuantiti, saved}]
            };
        }

        function formatTarikh(iso) {
            if (!iso) return '—';
            const d = new Date(iso);
            if (isNaN(d)) return '—';
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yy = d.getFullYear();
            return `${dd}/${mm}/${yy}`;
        }

        // A "completed" system has at least one saved Fungsi Data + Fungsi Trans row.
        function isSystemCompleted(s) {
            if (!s) return false;
            const fd = (s.fungsiData || []).filter(r => r && r.komponen);
            const ft = (s.fungsiTrans || []).filter(r => r && r.komponen);
            return fd.length > 0 && ft.length > 0;
        }

        // ============================================
        // SENARAI SISTEM — dynamic rendering
        // ============================================
        // Which row is currently being edited inline.
        //   null            → no row in edit mode
        //   '__new__'       → the blank "add new system" row (DAFTAR)
        //   '<kod>'         → editing an existing system inline
        let inlineEditKod = null;

        function renderSenaraiTable() {
            const tbody = document.getElementById('senarai-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            const list = Object.values(systems);
            const countEl = document.getElementById('senarai-count');

            // Blank editable row at the top when adding a new system (DAFTAR).
            if (inlineEditKod === '__new__') {
                tbody.insertAdjacentHTML('beforeend', inlineEditRowHtml(null, list.length + 1));
            }

            if (list.length === 0 && inlineEditKod !== '__new__') {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:40px;">Tiada sistem didaftar. Klik butang <strong>DAFTAR</strong> untuk menambah sistem baru.</td></tr>';
                if (countEl) countEl.innerText = '0-0 of 0';
                return;
            }

            list.forEach((s, idx) => {
                if (s.kod === inlineEditKod) {
                    // This row is being edited inline.
                    tbody.insertAdjacentHTML('beforeend', inlineEditRowHtml(s, idx + 1));
                    return;
                }
                const row = `
                    <tr style="cursor: pointer;" onclick="openSystem('${s.kod}')" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <td>${idx + 1}</td>
                        <td><span style="background:#b81cbb; color:white; padding:4px 12px; border-radius:15px; font-weight:600; font-size:11px;">${s.kod}</span></td>
                        <td style="font-weight: 500;">${escapeHtml(s.nama)}</td>
                        <td>${escapeHtml(s.keterangan)}</td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn act-open" data-tip="Buka sistem" onclick="event.stopPropagation(); openSystem('${s.kod}')">🔗</button>
                                <button class="action-btn act-edit" data-tip="Sunting" onclick="event.stopPropagation(); editSystem('${s.kod}')">✏️</button>
                                <button class="action-btn act-del" data-tip="Padam" onclick="event.stopPropagation(); deleteSystem('${s.kod}')">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', row);
            });
            if (countEl) countEl.innerText = `1-${list.length} of ${list.length}`;

            // Focus the first editable field of whatever row just entered edit mode.
            const focusEl = tbody.querySelector('.inline-edit-row input:not([disabled]), .inline-edit-row textarea');
            if (focusEl) setTimeout(() => focusEl.focus(), 30);

            // Dashboard mirrors the same data, so refresh it whenever the senarai changes.
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        // Builds one inline-editable row. `s` is the system (or null for a new row).
        function inlineEditRowHtml(s, num) {
            const isNew = !s;
            const kod = s ? s.kod : '';
            const nama = s ? (s.nama || '') : '';
            const ket  = s ? (s.keterangan || '') : '';
            // For a new row the Kod is editable; for an existing system it's the
            // immutable key, so we show it as a disabled field (like the gov site).
            const kodCell = isNew
                ? `<input type="text" id="inline-kod" class="form-control inline-cell" placeholder="Cth: UTM5" maxlength="10" style="text-transform:uppercase; padding:6px 9px;">`
                : `<input type="text" class="form-control inline-cell" value="${escapeHtml(kod)}" disabled style="background:#eef0f4; color:#64748b; padding:6px 9px;">`;
            return `
                <tr class="inline-edit-row" style="background:#fdf4ff;" onclick="event.stopPropagation();">
                    <td>${num}</td>
                    <td>${kodCell}</td>
                    <td><input type="text" id="inline-nama" class="form-control inline-cell" value="${escapeHtml(nama)}" placeholder="Wajib Diisi" style="padding:6px 9px;"></td>
                    <td><textarea id="inline-ket" class="form-control inline-cell" rows="2" placeholder="Wajib Diisi" style="padding:6px 9px; resize:vertical;">${escapeHtml(ket)}</textarea></td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn act-open" data-tip="Simpan" onclick="event.stopPropagation(); saveInlineEdit()" style="color:#16a34a;">💾</button>
                            <button class="action-btn act-del" data-tip="Batal" onclick="event.stopPropagation(); cancelInlineEdit()">✖️</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        // Save the inline row (new or edited) into `systems`, then re-render.
        function saveInlineEdit() {
            const namaEl = document.getElementById('inline-nama');
            const ketEl  = document.getElementById('inline-ket');
            const nama = (namaEl?.value || '').trim();
            const keterangan = (ketEl?.value || '').trim();

            if (inlineEditKod === '__new__') {
                const kod = (document.getElementById('inline-kod')?.value || '').trim().toUpperCase();
                if (!kod || !nama) { alert('Sila isi Kod Sistem dan Nama Sistem.'); return; }
                if (systems[kod]) { alert(`Sistem dengan kod "${kod}" telah wujud. Sila guna kod lain.`); return; }
                systems[kod] = createEmptySystem(kod, nama, keterangan);
            } else {
                const kod = inlineEditKod;
                if (!nama) { alert('Sila isi Nama Sistem.'); return; }
                if (!systems[kod]) { inlineEditKod = null; renderSenaraiTable(); return; }
                systems[kod].nama = nama;
                systems[kod].keterangan = keterangan;
                // Keep the info panel in sync if this is the open system.
                if (currentSystemCode === kod) {
                    const n = document.getElementById('rp-nama'); if (n) n.innerText = nama;
                    const k = document.getElementById('rp-ket');  if (k) k.innerText = keterangan || '-';
                }
            }

            inlineEditKod = null;
            renderSenaraiTable();
            if (typeof fuseScheduleSave === 'function') fuseScheduleSave(0);
        }

        function cancelInlineEdit() {
            inlineEditKod = null;
            renderSenaraiTable();
        }

        // ============================================
        // DASHBOARD (Laman Utama) — reflects real systems
        // ============================================
        function renderDashboard() {
            const list = Object.values(systems);

            // Counters
            const completed = list.filter(isSystemCompleted).length;
            const setText = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            setText('dash-projek-selesai', `${completed}/${list.length}`);
            setText('dash-jumlah-sistem', list.length);

            // "Sistem Terakhir Dianalisis" — most recently created or currently open
            let last = null;
            if (currentSystemCode && systems[currentSystemCode]) {
                last = systems[currentSystemCode];
            } else if (list.length) {
                last = [...list].sort((a, b) =>
                    new Date(b.tarikhCipta || 0) - new Date(a.tarikhCipta || 0)
                )[0];
            }
            window.__lastSystemKod = last ? last.kod : null;
            setText('dash-last-system', last ? last.nama : '—');

            // Senarai Laporan Sistem table
            const tbody = document.getElementById('dash-laporan-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:30px;">Tiada sistem didaftar lagi.</td></tr>';
                return;
            }
            // Newest first
            const sorted = [...list].sort((a, b) =>
                new Date(b.tarikhCipta || 0) - new Date(a.tarikhCipta || 0)
            );
            sorted.forEach(s => {
                tbody.insertAdjacentHTML('beforeend', `
                    <tr style="cursor:pointer;" onclick="openSystemFromDashboard('${s.kod}')" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <td><strong>${escapeHtml(s.kod)}</strong></td>
                        <td>${escapeHtml(s.nama)}</td>
                        <td>${escapeHtml(s.keterangan || '-')}</td>
                        <td>${formatTarikh(s.tarikhCipta)}</td>
                        <td style="text-align:right;">
                            <button class="eye-btn" title="Buka sistem" onclick="event.stopPropagation(); openSystemFromDashboard('${s.kod}')">👁️</button>
                        </td>
                    </tr>
                `);
            });
        }

        // Click handler used by the dashboard table + stat card.
        // Passing null = just go to the senarai page.
        function openSystemFromDashboard(kod) {
            switchSection('analisis');
            switchMainPage('senarai');
            if (kod && systems[kod]) {
                openSystem(kod);
            }
        }

        // ============================================
        // ASK AI — analyze completeness of all systems
        // ============================================
        // A system is "ready to submit" when ALL 5 modules have at least one row:
        //   FT (fungsiTrans), FD (fungsiData), VAF (non-zero), Pengurusan, Perkakasan
        function analyzeSystemModules(s) {
            const ft  = (s.fungsiTrans || []).filter(r => r && r.komponen).length;
            const fd  = (s.fungsiData  || []).filter(r => r && r.komponen).length;
            const vaf = (s.vaf || []).some(v => Number(v) > 0);
            const peng = (s.pengurusan || []).some(r => Number(r.harga) > 0 || r.checked);
            const perk = (s.perkakasan || []).filter(r => r && r.nama).length > 0;
            return {
                ft:   { done: ft  > 0, count: ft  },
                fd:   { done: fd  > 0, count: fd  },
                vaf:  { done: vaf },
                peng: { done: peng },
                perk: { done: perk },
                allDone: (ft > 0 && fd > 0 && vaf && peng && perk),
            };
        }

        function closeAskAi() {
            const o = document.getElementById('ask-ai-overlay');
            if (o) o.classList.remove('show');
            const sourceBtn = window.aiModalSourceButton;
            if (sourceBtn) {
                sourceBtn.classList.remove('ai-pill-morphing', 'is-active');
                sourceBtn.classList.add('ai-pill-rebound');
                setTimeout(() => sourceBtn.classList.remove('ai-pill-rebound'), 720);
            }
        }

        async function askAiAnalyzeAndOpen() {
            const overlay = document.getElementById('ask-ai-overlay');
            const body    = document.getElementById('ask-ai-body');
            if (!overlay || !body) return;
            overlay.classList.add('show');

            const list = Object.values(systems || {});
            if (list.length === 0) {
                body.innerHTML = '<div class="ask-ai-empty">Tiada sistem didaftar lagi. Sila daftar sistem baharu di Analisis Sistem.</div>';
                return;
            }

            // Build per-system analysis
            const ready = [];
            const partial = [];
            list.forEach(s => {
                const a = analyzeSystemModules(s);
                (a.allDone ? ready : partial).push({ s, a });
            });

            // Render structured list immediately
            const moduleLabel = (key) => ({
                ft: 'Fungsi Transaksi', fd: 'Fungsi Data',
                vaf: 'Konfigurasi VAF', peng: 'Kos Pengurusan',
                perk: 'Kos Perkakasan'
            })[key];

            const renderModulePills = (a) => {
                return ['ft','fd','vaf','peng','perk'].map(key => {
                    const done = a[key].done;
                    return `<span class="ask-ai-pill ${done ? 'done' : 'missing'}">${done ? '✓' : '✕'} ${escapeHtml(moduleLabel(key))}</span>`;
                }).join('');
            };

            const renderSystem = ({ s, a }) => `
                <div class="ask-ai-system-row">
                    <div class="row-head">
                        <span><span class="kod">${escapeHtml(s.kod)}</span><strong>${escapeHtml(s.nama)}</strong></span>
                        <button class="ask-ai-btn-secondary" style="padding:5px 14px; font-size:12px;"
                            onclick="closeAskAi(); openSystemFromDashboard('${escapeHtml(s.kod)}')">Buka →</button>
                    </div>
                    <div class="ask-ai-modules">${renderModulePills(a)}</div>
                </div>
            `;

            body.innerHTML = `
                ${partial.length ? `
                    <div class="ask-ai-section">
                        <div class="ask-ai-section-title partial">⏳ Belum Selesai (${partial.length})</div>
                        ${partial.map(renderSystem).join('')}
                    </div>` : ''}
                ${ready.length ? `
                    <div class="ask-ai-section">
                        <div class="ask-ai-section-title ready">✅ Sedia Dihantar (${ready.length})</div>
                        ${ready.map(renderSystem).join('')}
                    </div>` : ''}
                <div class="ask-ai-ai-block loading" id="ask-ai-ai-response">
                    <div class="ask-ai-ai-label">✦ DeepSeek AI</div>
                    AI sedang menganalisis status sistem anda…
                </div>
            `;

            // Now call the AI for a natural-language summary
            try {
                const summary = list.map(s => {
                    const a = analyzeSystemModules(s);
                    return `- ${s.kod} (${s.nama}): FT=${a.ft.count}, FD=${a.fd.count}, VAF=${a.vaf.done?'set':'kosong'}, Peng=${a.peng.done?'ada':'kosong'}, Perk=${a.perk.done?'ada':'kosong'} → ${a.allDone ? 'SEDIA' : 'BELUM SELESAI'}`;
                }).join('\n');

                const userMsg =
`Saya ada ${list.length} sistem ICT dalam FUSE-AI. Berikut adalah status setiap sistem (kemaskini terkini):

${summary}

Tolong:
1. Ringkasan ringkas dalam 1-2 ayat tentang keadaan keseluruhan.
2. Senaraikan sistem yang BELUM SELESAI dan apa modul yang masih kosong.
3. Cadangan: sistem mana patut saya selesaikan dulu, dan mengapa.
4. Sistem yang SEDIA DIHANTAR — beritahu saya supaya boleh hantar ke FUSE-AI.

Jawab dalam Bahasa Malaysia ringkas dan teratur (gunakan senarai bernombor jika perlu). JANGAN keluarkan JSON.`;

                const r = await fetch('http://localhost:3001/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: [{ role: 'user', content: userMsg }] }),
                });
                const data = await r.json();
                const aiBlock = document.getElementById('ask-ai-ai-response');
                if (!aiBlock) return;
                if (!r.ok) throw new Error(data.error || 'Ralat AI');
                aiBlock.classList.remove('loading');
                aiBlock.innerHTML = `<div class="ask-ai-ai-label">✦ DeepSeek AI</div>${escapeHtml(data.reply || '(tiada jawapan)')}`;
            } catch (err) {
                const aiBlock = document.getElementById('ask-ai-ai-response');
                if (aiBlock) {
                    aiBlock.classList.remove('loading');
                    aiBlock.innerHTML = `<div class="ask-ai-ai-label">⚠ AI tidak tersedia</div>${escapeHtml(err.message)}. Senarai di atas tetap sah.`;
                }
            }
        }

        function escapeHtml(str) {
            if (str == null) return '';
            return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function openSystem(kod) {
            if (!systems[kod]) return;
            // When switching to a DIFFERENT system, first persist whatever page
            // the user was editing (saves to the OLD currentSystemCode), then
            // wipe the DOM so no rows leak from the old system.
            if (currentSystemCode && currentSystemCode !== kod) {
                persistCurrentSystemState();
                clearAllModuleTables();
            }
            currentSystemCode = kod;
            const s = systems[kod];
            document.getElementById('rp-kod').innerText = s.kod;
            document.getElementById('rp-nama').innerText = s.nama;
            document.getElementById('rp-ket').innerText = s.keterangan || '-';
            updateInfoPanelCosts();
            document.getElementById('infoPanel').classList.add('open');
            if (typeof renderDashboard === 'function') renderDashboard();
        }

        function deleteSystem(kod) {
            if (!confirm(`Adakah anda pasti ingin memadam sistem "${kod}" beserta semua datanya?`)) return;
            delete systems[kod];
            if (currentSystemCode === kod) {
                currentSystemCode = null;
                clearAllModuleTables();  // drop any lingering DOM from the deleted system
                closeInfoPanel();        // close the panel since the system is gone
            }
            renderSenaraiTable();
            if (typeof fuseScheduleSave === 'function') fuseScheduleSave(0);
        }

        // ============================================
        // REGISTER / EDIT SYSTEM MODAL
        // ============================================
        let editingSystemKod = null;

        function openRegisterModal(kod = null) {
            // DAFTAR (no kod) → add a blank editable row inline at the top of the
            // senarai table, matching the gov FUSE site. Editing an existing
            // system also goes inline via editSystem().
            if (!kod) {
                inlineEditKod = '__new__';
                renderSenaraiTable();
                document.getElementById('senarai-table-body')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
            }
            editingSystemKod = kod;
            const modal = document.getElementById('registerModal');
            const kodInput = document.getElementById('reg-kod');
            const namaInput = document.getElementById('reg-nama');
            const ketInput = document.getElementById('reg-keterangan');
            const titleEl = document.getElementById('registerModalTitle');

            if (kod && systems[kod]) {
                const s = systems[kod];
                kodInput.value = s.kod;
                kodInput.disabled = true;
                namaInput.value = s.nama;
                ketInput.value = s.keterangan || '';
                titleEl.innerText = 'Kemaskini Sistem';
            } else {
                kodInput.value = '';
                kodInput.disabled = false;
                namaInput.value = '';
                ketInput.value = '';
                titleEl.innerText = 'Daftar Sistem Baru';
            }
            modal.style.display = 'flex';
            setTimeout(() => kodInput.focus(), 50);
        }

        // Edit now happens INLINE in the senarai row (like the gov FUSE site)
        // instead of opening the popup modal.
        function editSystem(kod) {
            if (!systems[kod]) return;
            inlineEditKod = kod;
            renderSenaraiTable();
        }

        function closeRegisterModal() {
            document.getElementById('registerModal').style.display = 'none';
            editingSystemKod = null;
        }

        function submitRegister() {
            const kod = document.getElementById('reg-kod').value.trim().toUpperCase();
            const nama = document.getElementById('reg-nama').value.trim();
            const keterangan = document.getElementById('reg-keterangan').value.trim();

            if (!kod || !nama) {
                alert('Sila isi Kod Sistem dan Nama Sistem.');
                return;
            }

            if (editingSystemKod) {
                // Edit existing
                systems[editingSystemKod].nama = nama;
                systems[editingSystemKod].keterangan = keterangan;
                // Update info panel if this is the current system
                if (currentSystemCode === editingSystemKod) {
                    document.getElementById('rp-nama').innerText = nama;
                    document.getElementById('rp-ket').innerText = keterangan || '-';
                }
            } else {
                // New system
                if (systems[kod]) {
                    alert(`Sistem dengan kod "${kod}" telah wujud. Sila guna kod lain.`);
                    return;
                }
                systems[kod] = createEmptySystem(kod, nama, keterangan);
            }

            closeRegisterModal();
            renderSenaraiTable();
            if (typeof fuseScheduleSave === 'function') fuseScheduleSave(0);
        }

        // ============================================
        // NAVIGATION — with state persist/load
        // ============================================
        function switchMainPage(type) {
            // Save current DOM state before switching away
            persistCurrentSystemState();

            // Guard: FPA/Pengurusan/Perkakasan require a selected system
            if ((type === 'fpa' || type === 'pengurusan' || type === 'perkakasan') && !currentSystemCode) {
                alert('Sila pilih sistem dari Senarai Sistem terlebih dahulu.');
                type = 'senarai';
            }

            document.querySelectorAll('.sub-nav').forEach(n => n.classList.remove('active'));
            const activeNav = document.getElementById(`nav-${type}`);
            if (activeNav) activeNav.classList.add('active');

            const bc = document.getElementById('top-breadcrumb');
            const sysSuffix = currentSystemCode ? ` <span style="color:var(--fuse-purple); font-weight:600;">[ ${currentSystemCode} — ${escapeHtml(systems[currentSystemCode].nama)} ]</span>` : '';
            if (type === 'senarai') bc.innerHTML = '🏠 / Analisis Sistem / Pengurusan Sistem / Senarai Sistem';
            else if (type === 'fpa') bc.innerHTML = '🏠 / Analisis Sistem / Pengurusan Sistem / Pengiraan Kos FPA' + sysSuffix;
            else if (type === 'pengurusan') bc.innerHTML = '🏠 / Analisis Sistem / Pengurusan Sistem / Pengiraan Kos Pengurusan' + sysSuffix;
            else if (type === 'perkakasan') bc.innerHTML = '🏠 / Analisis Sistem / Pengurusan Sistem / Pengiraan Kos Perkakasan' + sysSuffix;

            const tabs = document.getElementById('fpa-tabs');
            if (type === 'fpa') {
                tabs.style.display = 'inline-flex';
                switchPage('page-trans');   // this will set currentVisiblePage
            } else {
                tabs.style.display = 'none';
                document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
                const targetPage = document.getElementById(`page-${type}`);
                if (targetPage) targetPage.classList.add('active');

                // Load the data for the newly-visible page + track what's visible now
                if (type === 'senarai') {
                    renderSenaraiTable();
                    currentVisiblePage = 'page-senarai';
                } else if (type === 'pengurusan') {
                    renderPengurusanTable();
                    currentVisiblePage = 'page-pengurusan';
                } else if (type === 'perkakasan') {
                    renderPerkakasanTable();
                    currentVisiblePage = 'page-perkakasan';
                }
            }
            // Update card titles with system name
            updateCardTitles();
        }

        function updateCardTitles() {
            const nama = currentSystemCode && systems[currentSystemCode] ? systems[currentSystemCode].nama : '';
            document.querySelectorAll('.system-title').forEach(el => {
                el.innerText = nama || '-';
            });
        }

        function openInfoPanel(kod, nama, ket) {
            // Legacy entry point — just delegate to openSystem
            openSystem(kod);
        }

        function closeInfoPanel() {
            document.getElementById('infoPanel').classList.remove('open');
        }

        function navToModule(mainPage, subPageId = null) {
            closeInfoPanel();
            switchMainPage(mainPage);
            if (subPageId && mainPage === 'fpa') {
                switchPage(subPageId);
            }
        }

        function updateAiPageTitles() {
            const name = (currentSystemCode && systems[currentSystemCode]) ? systems[currentSystemCode].nama : '';
            const els = ['title-trans','title-data','title-vaf'];
            els.forEach(id => { const e = document.getElementById(id); if(e) e.textContent = name; });
        }

        function switchPage(pageId) {
            updateAiPageTitles();
            // Persist whatever is in the current DOM before swapping tabs.
            // Uses currentVisiblePage (BEFORE we change it) to know what to save.
            persistCurrentSystemState();

            document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            const target = document.getElementById(pageId);
            if (target) target.classList.add('active');

            const map = { 'page-data': 'tab-data', 'page-trans': 'tab-trans', 'page-vaf': 'tab-vaf', 'page-kos': 'tab-kos' };
            if (map[pageId]) {
                const tab = document.getElementById(map[pageId]);
                if (tab) tab.classList.add('active');
            }

            // Update visible page tracker AFTER persist, BEFORE render
            currentVisiblePage = pageId;

            // Load data for this page from currentSystemCode
            if (pageId === 'page-data') renderFungsiDataTable();
            else if (pageId === 'page-trans') renderFungsiTransTable();
            else if (pageId === 'page-vaf') loadVAFValues();
            else if (pageId === 'page-kos') updateFinalReport();
        }

        // ============================================
        // PERSISTENCE — DOM → state
        // Only saves the page the user is currently viewing/editing.
        // This avoids reading stale rows from hidden tbodies belonging
        // to a different system.
        // ============================================
        function persistCurrentSystemState() {
            if (!currentSystemCode || !systems[currentSystemCode]) return;
            const s = systems[currentSystemCode];
            switch (currentVisiblePage) {
                case 'page-data': s.fungsiData = serializeFungsiDataFromDOM(); break;
                case 'page-trans': s.fungsiTrans = serializeFungsiTransFromDOM(); break;
                case 'page-vaf': s.vaf = serializeVAFFromDOM(); break;
                case 'page-pengurusan': s.pengurusan = serializePengurusanFromDOM(); break;
                case 'page-perkakasan': s.perkakasan = serializePerkakasanFromDOM(); break;
                // page-senarai, page-kos: read-only views, no persistence needed
            }
            if (typeof fuseScheduleSave === 'function') fuseScheduleSave();
        }

        // Wipe every module-page tbody + reset VAF selects so no data from
        // the previously-opened system can leak into the new one when
        // persist runs at the next navigation step.
        function clearAllModuleTables() {
            const dataTbody = document.querySelector('#page-data tbody');
            if (dataTbody) dataTbody.innerHTML = '';
            const transTbody = document.querySelector('#page-trans tbody');
            if (transTbody) transTbody.innerHTML = '';
            for (let i = 1; i <= 14; i++) {
                const el = document.getElementById(`komponen-vaf-${i}`);
                if (el) el.value = 0;
            }
            const tdiEl = document.getElementById('vaf-tdi');
            const scoreEl = document.getElementById('vaf-score');
            if (tdiEl) tdiEl.value = 0;
            if (scoreEl) scoreEl.value = '0.65';
            const pengTbody = document.getElementById('pengurusan-table-body');
            if (pengTbody) pengTbody.innerHTML = '';
            const perkTbody = document.getElementById('perkakasan-table-body');
            if (perkTbody) perkTbody.innerHTML = '';
            dataRowCounter = 0;
            transRowCounter = 0;
            pengurusanRowCounter = 0;
            perkakasanRowCounter = 0;
        }

        // ============================================
        // FUNGSI DATA — per-system
        // ============================================
        let dataRowCounter = 0;

        function buildDataRowHtml(id, d = { entiti: '', aggregat: 'Pilih', komponen: '', gandaan: '1', catatan: '', saved: false }) {
            const aggOptions = ['Pilih', '1 - Amat Terperinci', '2 - Kurang Perincian', '3 - Tiada Perincian'];
            const aggHtml = aggOptions.map(o => `<option ${o === d.aggregat ? 'selected' : ''}>${o}</option>`).join('');
            const komponenStyle = d.komponen ? 'background:#fff; color:#333;' : 'background:#f3f4f6; color:#9ca3af; cursor:pointer;';
            const viewModeCls = d.saved ? 'view-mode' : '';
            const actionBtns = d.saved
                ? `<button class="action-btn" onclick="toggleRowMode('data', ${id}, 'edit')">✏️</button>
                   <button class="action-btn" onclick="deleteRow('data', ${id})">🗑️</button>`
                : `<button class="action-btn" onclick="openSaveModal('data', ${id})">💾</button>
                   <button class="action-btn" onclick="clearRowData('data', ${id})">🧹</button>`;

            return `
                <tr id="row-data-${id}" class="${viewModeCls}">
                    <td><div class="input-valid-wrapper"><input type="text" id="entiti-data-${id}" class="form-control" placeholder="Entiti Baru" value="${escapeHtml(d.entiti)}"></div></td>
                    <td><select id="aggregat-data-${id}" class="form-control">${aggHtml}</select></td>
                    <td>
                        <input type="text" class="form-control" id="komponen-data-${id}" style="${komponenStyle}" placeholder="Pilih Komponen" value="${escapeHtml(d.komponen)}" readonly onclick="openModal(${id})">
                    </td>
                    <td><input type="number" class="form-control" id="gandaan-data-${id}" value="${d.gandaan || 1}" min="1" oninput="updateFinalReport()"></td>
                    <td><textarea id="catatan-data-${id}" class="form-control" style="height:35px;">${escapeHtml(d.catatan)}</textarea></td>
                    <td><div class="action-btns">${actionBtns}</div></td>
                </tr>
            `;
        }

        function renderFungsiDataTable() {
            const tbody = document.querySelector('#page-data tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            dataRowCounter = 0;
            if (!currentSystemCode) return;
            const s = systems[currentSystemCode];
            (s.fungsiData || []).forEach(row => {
                dataRowCounter++;
                tbody.insertAdjacentHTML('beforeend', buildDataRowHtml(dataRowCounter, row));
            });
            updateFinalReport();
        }

        function serializeFungsiDataFromDOM() {
            const rows = [];
            document.querySelectorAll('#page-data tbody tr[id^="row-data-"]').forEach(tr => {
                const id = tr.id.replace('row-data-', '');
                rows.push({
                    entiti: document.getElementById(`entiti-data-${id}`)?.value || '',
                    aggregat: document.getElementById(`aggregat-data-${id}`)?.value || '',
                    komponen: document.getElementById(`komponen-data-${id}`)?.value || '',
                    gandaan: document.getElementById(`gandaan-data-${id}`)?.value || '1',
                    catatan: document.getElementById(`catatan-data-${id}`)?.value || '',
                    saved: tr.classList.contains('view-mode')
                });
            });
            return rows;
        }

        // ============================================
        // FUNGSI TRANSAKSI — per-system
        // ============================================
        let transRowCounter = 0;

        function buildTransRowHtml(id, d = { makro: '', general: '', aggregat: 'Pilih', komponen: '', gandaan: '1', catatan: '', saved: false }) {
            const aggOptions = ['Pilih', '1 - Amat Terperinci', '2 - Terperinci', '3 - Kurang Perincian', '4 - Tiada Perincian'];
            const aggHtml = aggOptions.map(o => `<option ${o === d.aggregat ? 'selected' : ''}>${o}</option>`).join('');
            const komponenStyle = d.komponen ? 'background:#fff; color:#333;' : 'background:#f3f4f6; color:#9ca3af; cursor:pointer;';
            const viewModeCls = d.saved ? 'view-mode' : '';
            const actionBtns = d.saved
                ? `<button class="action-btn" onclick="toggleRowMode('trans', ${id}, 'edit')">✏️</button>
                   <button class="action-btn" onclick="deleteRow('trans', ${id})">🗑️</button>`
                : `<button class="action-btn" onclick="openSaveModal('trans', ${id})">💾</button>
                   <button class="action-btn" onclick="clearRowData('trans', ${id})">🧹</button>`;

            return `
                <tr id="row-trans-${id}" class="${viewModeCls}">
                    <td><div class="input-valid-wrapper"><input type="text" id="makro-trans-${id}" class="form-control" placeholder="Proses Makro" value="${escapeHtml(d.makro)}"></div></td>
                    <td><div class="input-valid-wrapper"><input type="text" id="general-trans-${id}" class="form-control" placeholder="Proses General" value="${escapeHtml(d.general)}"></div></td>
                    <td><select id="aggregat-trans-${id}" class="form-control">${aggHtml}</select></td>
                    <td>
                        <input type="text" class="form-control" id="komponen-trans-${id}" style="${komponenStyle}" placeholder="Pilih Komponen" value="${escapeHtml(d.komponen)}" readonly onclick="openTransModal(${id})">
                    </td>
                    <td><input type="number" class="form-control" id="gandaan-trans-${id}" value="${d.gandaan || 1}" min="1" oninput="recalculateTotals()"></td>
                    <td><textarea id="catatan-trans-${id}" class="form-control" style="height:35px;">${escapeHtml(d.catatan)}</textarea></td>
                    <td><div class="action-btns">${actionBtns}</div></td>
                </tr>
            `;
        }

        function renderFungsiTransTable() {
            const tbody = document.querySelector('#page-trans tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            transRowCounter = 0;
            if (!currentSystemCode) return;
            const s = systems[currentSystemCode];
            (s.fungsiTrans || []).forEach(row => {
                transRowCounter++;
                tbody.insertAdjacentHTML('beforeend', buildTransRowHtml(transRowCounter, row));
            });
            recalculateTotals();
        }

        function serializeFungsiTransFromDOM() {
            const rows = [];
            document.querySelectorAll('#page-trans tbody tr[id^="row-trans-"]').forEach(tr => {
                const id = tr.id.replace('row-trans-', '');
                rows.push({
                    makro: document.getElementById(`makro-trans-${id}`)?.value || '',
                    general: document.getElementById(`general-trans-${id}`)?.value || '',
                    aggregat: document.getElementById(`aggregat-trans-${id}`)?.value || '',
                    komponen: document.getElementById(`komponen-trans-${id}`)?.value || '',
                    gandaan: document.getElementById(`gandaan-trans-${id}`)?.value || '1',
                    catatan: document.getElementById(`catatan-trans-${id}`)?.value || '',
                    saved: tr.classList.contains('view-mode')
                });
            });
            return rows;
        }

        function addRow(context) {
            if (!currentSystemCode) {
                alert('Sila pilih sistem dari Senarai Sistem terlebih dahulu.');
                return;
            }
            if (context === 'data') {
                dataRowCounter++;
                const tbody = document.querySelector('#page-data tbody');
                tbody.insertAdjacentHTML('beforeend', buildDataRowHtml(dataRowCounter));
            } else if (context === 'trans') {
                transRowCounter++;
                const tbody = document.querySelector('#page-trans tbody');
                tbody.insertAdjacentHTML('beforeend', buildTransRowHtml(transRowCounter));
            }
        }

        // ============================================
        // VAF — per-system
        // ============================================
        function loadVAFValues() {
            if (!currentSystemCode) return;
            const s = systems[currentSystemCode];
            for (let i = 0; i < 14; i++) {
                const el = document.getElementById(`komponen-vaf-${i + 1}`);
                if (el) el.value = (s.vaf && s.vaf[i] != null) ? s.vaf[i] : 0;
            }
            calculateVAF();
        }

        function serializeVAFFromDOM() {
            const arr = [];
            for (let i = 0; i < 14; i++) {
                const el = document.getElementById(`komponen-vaf-${i + 1}`);
                arr.push(el ? (parseInt(el.value) || 0) : 0);
            }
            return arr;
        }

        function calculateVAF() {
            let tdi = 0;
            for (let i = 1; i <= 14; i++) {
                const val = document.getElementById(`komponen-vaf-${i}`);
                if (val) tdi += parseInt(val.value) || 0;
            }
            const tdiEl = document.getElementById('vaf-tdi');
            const scoreEl = document.getElementById('vaf-score');
            if (tdiEl) tdiEl.value = tdi;
            const vaf = (tdi * 0.01) + 0.65;
            if (scoreEl) scoreEl.value = vaf.toFixed(2);
            // Persist immediately so cost report stays in sync
            if (currentSystemCode && systems[currentSystemCode]) {
                systems[currentSystemCode].vaf = serializeVAFFromDOM();
            }
            updateFinalReport();
        }

        function resetVAF() {
            for (let i = 1; i <= 14; i++) {
                const val = document.getElementById(`komponen-vaf-${i}`);
                if (val) val.value = "0";
            }
            calculateVAF();
        }

        function saveVAF() {
            if (!currentSystemCode) return;
            systems[currentSystemCode].vaf = serializeVAFFromDOM();
            const btn = document.getElementById('btn-save-vaf');
            const originalText = btn.innerText;
            btn.innerText = "TERSIMPAN ✓";
            btn.style.color = "#10b981";
            btn.style.borderColor = "#10b981";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.color = "#475569";
                btn.style.borderColor = "#e2e8f0";
            }, 2000);
            if (typeof fuseScheduleSave === 'function') fuseScheduleSave(0);
        }

        // ============================================
        // PENGURUSAN — per-system
        // ============================================
        let pengurusanRowCounter = 0;

        function buildPengurusanRowHtml(id, d = { perkara: '', harga: 0, kuantiti: 1, checked: false, saved: false }) {
            const viewModeCls = d.saved ? 'view-mode' : '';
            return `
                <tr id="row-pengurusan-${id}" class="${viewModeCls}">
                    <td><input type="checkbox" id="chk-pengurusan-${id}" ${d.checked ? 'checked' : ''}></td>
                    <td><input type="text" class="form-control" id="perkara-pengurusan-${id}" value="${escapeHtml(d.perkara)}" placeholder="Nama Perkara"></td>
                    <td><input type="number" class="form-control" id="harga-pengurusan-${id}" value="${d.harga || 0}" step="0.01" oninput="calcPengurusan()" style="text-align: center; font-weight: 600;"></td>
                    <td><input type="number" class="form-control" id="kuantiti-pengurusan-${id}" value="${d.kuantiti || 1}" oninput="calcPengurusan()" style="text-align: center;"></td>
                    <td id="base-pengurusan-${id}" style="text-align: center; font-weight: 500;">0.00</td>
                    <td id="sst-pengurusan-${id}" style="text-align: center; font-weight: 500;">0.00</td>
                    <td id="total-pengurusan-${id}" style="text-align: center; font-weight: 600; color: var(--fuse-navy);">0.00</td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn" onclick="toggleEditPengurusan(${id})">📝</button>
                            <button class="action-btn" onclick="deleteRowPengurusan(${id})">🗑</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        function renderPengurusanTable() {
            const tbody = document.getElementById('pengurusan-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            pengurusanRowCounter = 0;
            if (!currentSystemCode) {
                document.getElementById('pengurusan-count').innerText = '0-0 of 0';
                calcPengurusan();
                return;
            }
            const s = systems[currentSystemCode];
            (s.pengurusan || []).forEach(row => {
                pengurusanRowCounter++;
                tbody.insertAdjacentHTML('beforeend', buildPengurusanRowHtml(pengurusanRowCounter, row));
            });
            document.getElementById('pengurusan-count').innerText = pengurusanRowCounter > 0
                ? `1-${pengurusanRowCounter} of ${pengurusanRowCounter}` : '0-0 of 0';
            calcPengurusan();
        }

        function serializePengurusanFromDOM() {
            const rows = [];
            document.querySelectorAll('#pengurusan-table-body tr[id^="row-pengurusan-"]').forEach(tr => {
                const id = tr.id.replace('row-pengurusan-', '');
                rows.push({
                    perkara: document.getElementById(`perkara-pengurusan-${id}`)?.value || '',
                    harga: parseFloat(document.getElementById(`harga-pengurusan-${id}`)?.value) || 0,
                    kuantiti: parseInt(document.getElementById(`kuantiti-pengurusan-${id}`)?.value) || 1,
                    checked: document.getElementById(`chk-pengurusan-${id}`)?.checked || false,
                    saved: tr.classList.contains('view-mode')
                });
            });
            return rows;
        }

        function addRowPengurusan() {
            if (!currentSystemCode) {
                alert('Sila pilih sistem dari Senarai Sistem terlebih dahulu.');
                return;
            }
            pengurusanRowCounter++;
            const tbody = document.getElementById('pengurusan-table-body');
            tbody.insertAdjacentHTML('beforeend', buildPengurusanRowHtml(pengurusanRowCounter, { perkara: '', harga: 0, kuantiti: 1, checked: false, saved: false }));
            document.getElementById('pengurusan-count').innerText = `1-${pengurusanRowCounter} of ${pengurusanRowCounter}`;
            calcPengurusan();
        }

        function toggleEditPengurusan(id) {
            const row = document.getElementById(`row-pengurusan-${id}`);
            if (row) row.classList.toggle('view-mode');
        }

        function deleteRowPengurusan(id) {
            if (!confirm('Padam baris ini?')) return;
            const row = document.getElementById(`row-pengurusan-${id}`);
            if (row) {
                row.remove();
                const remaining = document.querySelectorAll('#pengurusan-table-body tr[id^="row-pengurusan-"]').length;
                document.getElementById('pengurusan-count').innerText = remaining > 0 ? `1-${remaining} of ${remaining}` : `0-0 of 0`;
                calcPengurusan();
                // persist immediately
                if (currentSystemCode) systems[currentSystemCode].pengurusan = serializePengurusanFromDOM();
            }
        }

        function calcPengurusan() {
            let totalBase = 0, totalSst = 0, totalOverall = 0;
            document.querySelectorAll('#pengurusan-table-body tr[id^="row-pengurusan-"]').forEach(row => {
                const id = row.id.replace('row-pengurusan-', '');
                const hargaInput = document.getElementById(`harga-pengurusan-${id}`);
                const harga = parseFloat(hargaInput?.value) || 0;
                if (hargaInput) {
                    if (harga === 0) hargaInput.classList.add('harga-zero');
                    else hargaInput.classList.remove('harga-zero');
                }
                const kuantiti = parseInt(document.getElementById(`kuantiti-pengurusan-${id}`)?.value) || 0;
                const base = harga * kuantiti;
                const sst = base * 0.08;
                const rowTotal = base + sst;

                const baseEl = document.getElementById(`base-pengurusan-${id}`);
                const sstEl = document.getElementById(`sst-pengurusan-${id}`);
                const totEl = document.getElementById(`total-pengurusan-${id}`);
                if (baseEl) baseEl.innerText = base.toFixed(2);
                if (sstEl) sstEl.innerText = sst.toFixed(2);
                if (totEl) totEl.innerText = rowTotal.toFixed(2);

                totalBase += base;
                totalSst += sst;
                totalOverall += rowTotal;
            });
            const fm = (n) => 'RM ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const setText = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };
            setText('sum-pengurusan-base', fm(totalBase));
            setText('sum-pengurusan-sst', fm(totalSst));
            setText('sum-pengurusan-total', fm(totalOverall));
            // keep state in sync so info panel reflects it
            if (currentSystemCode && systems[currentSystemCode]) {
                systems[currentSystemCode].pengurusan = serializePengurusanFromDOM();
            }
            updateInfoPanelCosts();
        }

        // ============================================
        // PERKAKASAN — per-system
        // ============================================
        let perkakasanRowCounter = 0;

        function buildPerkakasanRowHtml(id, d = { nama: '', harga: null, kuantiti: null, saved: false }) {
            const viewModeCls = d.saved ? 'view-mode' : '';
            const hargaErrorCls = (!d.harga || d.harga <= 0) ? 'input-error' : '';
            const namaSuccessCls = d.nama ? 'input-success' : '';
            const checkDisplay = d.nama ? 'block' : 'none';
            const errorIconDisplay = (!d.harga || d.harga <= 0) ? 'block' : 'none';
            const btnIcon = d.saved ? '📝' : '💾';

            return `
                <tr id="row-perkakasan-${id}" class="${viewModeCls}">
                    <td class="perkakasan-index" style="text-align: center; color: #64748b; font-weight: 500;">${id}</td>
                    <td>
                        <div class="input-valid-wrapper">
                            <input type="text" class="form-control ${namaSuccessCls}" id="nama-perkakasan-${id}" placeholder="Wajib Diisi" value="${escapeHtml(d.nama)}" oninput="validatePerkakasan(${id})">
                            <span class="check-icon" id="check-nama-${id}" style="display:${checkDisplay};">✓</span>
                        </div>
                    </td>
                    <td>
                        <div class="input-valid-wrapper">
                            <input type="number" class="form-control ${hargaErrorCls}" id="harga-perkakasan-${id}" placeholder="Wajib Diisi" value="${d.harga != null ? d.harga : ''}" step="0.01" oninput="validatePerkakasan(${id})">
                            <span class="error-icon" id="error-icon-${id}" style="display:${errorIconDisplay};">!</span>
                        </div>
                        <span class="error-text" id="error-harga-${id}" style="display:${errorIconDisplay};">Format Harga Tidak Sah</span>
                    </td>
                    <td>
                        <input type="number" class="form-control" id="kuantiti-perkakasan-${id}" placeholder="Wajib Diisi" value="${d.kuantiti != null ? d.kuantiti : ''}" oninput="validatePerkakasan(${id})" style="text-align: center;">
                    </td>
                    <td>
                        <input type="text" class="form-control" id="total-perkakasan-${id}" disabled style="text-align: center; background: #f8fafc; color: #94a3b8; font-weight: 500;">
                    </td>
                    <td>
                        <div class="action-btns">
                            <button class="action-btn" onclick="saveRowPerkakasan(${id})" id="btn-save-perk-${id}">${btnIcon}</button>
                            <button class="action-btn" onclick="deleteRowPerkakasan(${id})">🗑</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        function renderPerkakasanTable() {
            const tbody = document.getElementById('perkakasan-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            perkakasanRowCounter = 0;
            if (!currentSystemCode) {
                tbody.innerHTML = `<tr id="empty-perkakasan"><td colspan="6" style="text-align: center; color: var(--text-muted);">Tiada Rekod Dijumpai</td></tr>`;
                document.getElementById('perkakasan-count').innerText = '0-0 of 0';
                calcPerkakasan();
                return;
            }
            const s = systems[currentSystemCode];
            if (!s.perkakasan || s.perkakasan.length === 0) {
                tbody.innerHTML = `<tr id="empty-perkakasan"><td colspan="6" style="text-align: center; color: var(--text-muted);">Tiada Rekod Dijumpai</td></tr>`;
                document.getElementById('perkakasan-count').innerText = '0-0 of 0';
                calcPerkakasan();
                return;
            }
            s.perkakasan.forEach(row => {
                perkakasanRowCounter++;
                tbody.insertAdjacentHTML('beforeend', buildPerkakasanRowHtml(perkakasanRowCounter, row));
            });
            document.getElementById('perkakasan-count').innerText = `1-${perkakasanRowCounter} of ${perkakasanRowCounter}`;
            calcPerkakasan();
        }

        function serializePerkakasanFromDOM() {
            const rows = [];
            document.querySelectorAll('#perkakasan-table-body tr[id^="row-perkakasan-"]').forEach(tr => {
                const id = tr.id.replace('row-perkakasan-', '');
                const hargaVal = document.getElementById(`harga-perkakasan-${id}`)?.value;
                const kuantitiVal = document.getElementById(`kuantiti-perkakasan-${id}`)?.value;
                rows.push({
                    nama: document.getElementById(`nama-perkakasan-${id}`)?.value || '',
                    harga: hargaVal !== '' ? parseFloat(hargaVal) : null,
                    kuantiti: kuantitiVal !== '' ? parseInt(kuantitiVal) : null,
                    saved: tr.classList.contains('view-mode')
                });
            });
            return rows;
        }

        function addRowPerkakasan() {
            if (!currentSystemCode) {
                alert('Sila pilih sistem dari Senarai Sistem terlebih dahulu.');
                return;
            }
            const emptyRow = document.getElementById('empty-perkakasan');
            if (emptyRow) emptyRow.remove();
            perkakasanRowCounter++;
            const tbody = document.getElementById('perkakasan-table-body');
            tbody.insertAdjacentHTML('beforeend', buildPerkakasanRowHtml(perkakasanRowCounter));
            document.getElementById('perkakasan-count').innerText = `1-${perkakasanRowCounter} of ${perkakasanRowCounter}`;
            calcPerkakasan();
        }

        function validatePerkakasan(id) {
            const namaInput = document.getElementById(`nama-perkakasan-${id}`);
            const hargaInput = document.getElementById(`harga-perkakasan-${id}`);
            const errorText = document.getElementById(`error-harga-${id}`);
            const errorIcon = document.getElementById(`error-icon-${id}`);
            const checkIcon = document.getElementById(`check-nama-${id}`);

            if (namaInput && namaInput.value.trim() !== '') {
                namaInput.classList.add('input-success');
                if (checkIcon) checkIcon.style.display = 'block';
            } else {
                namaInput?.classList.remove('input-success');
                if (checkIcon) checkIcon.style.display = 'none';
            }

            const harga = parseFloat(hargaInput?.value);
            if (isNaN(harga) || harga <= 0) {
                hargaInput?.classList.add('input-error');
                if (errorIcon) errorIcon.style.display = 'block';
                if (errorText) errorText.style.display = 'block';
            } else {
                hargaInput?.classList.remove('input-error');
                if (errorIcon) errorIcon.style.display = 'none';
                if (errorText) errorText.style.display = 'none';
            }
            calcPerkakasan();
        }

        function saveRowPerkakasan(id) {
            const row = document.getElementById(`row-perkakasan-${id}`);
            const btn = document.getElementById(`btn-save-perk-${id}`);
            if (!row || !btn) return;
            if (row.classList.contains('view-mode')) {
                row.classList.remove('view-mode');
                btn.innerText = '💾';
            } else {
                row.classList.add('view-mode');
                btn.innerText = '📝';
            }
            if (currentSystemCode) systems[currentSystemCode].perkakasan = serializePerkakasanFromDOM();
        }

        function deleteRowPerkakasan(id) {
            if (!confirm('Padam baris ini?')) return;
            const row = document.getElementById(`row-perkakasan-${id}`);
            if (row) {
                row.remove();
                updatePerkakasanIndexes();
                calcPerkakasan();
                const remaining = document.querySelectorAll('#perkakasan-table-body tr[id^="row-perkakasan-"]').length;
                const tbody = document.getElementById('perkakasan-table-body');
                if (remaining === 0 && tbody && !document.getElementById('empty-perkakasan')) {
                    tbody.innerHTML = `<tr id="empty-perkakasan"><td colspan="6" style="text-align: center; color: var(--text-muted);">Tiada Rekod Dijumpai</td></tr>`;
                }
                if (currentSystemCode) systems[currentSystemCode].perkakasan = serializePerkakasanFromDOM();
            }
        }

        function updatePerkakasanIndexes() {
            const rows = document.querySelectorAll('#perkakasan-table-body tr[id^="row-perkakasan-"]');
            let idx = 1;
            rows.forEach(row => {
                const td = row.querySelector('.perkakasan-index');
                if (td) td.innerText = idx++;
            });
            document.getElementById('perkakasan-count').innerText = rows.length > 0 ? `1-${rows.length} of ${rows.length}` : `0-0 of 0`;
        }

        function calcPerkakasan() {
            let totalOverall = 0;
            document.querySelectorAll('#perkakasan-table-body tr[id^="row-perkakasan-"]').forEach(row => {
                const id = row.id.replace('row-perkakasan-', '');
                const harga = parseFloat(document.getElementById(`harga-perkakasan-${id}`)?.value) || 0;
                const kuantiti = parseInt(document.getElementById(`kuantiti-perkakasan-${id}`)?.value) || 0;
                const base = harga * kuantiti;
                const totalInput = document.getElementById(`total-perkakasan-${id}`);
                if (totalInput) totalInput.value = base > 0 ? base.toFixed(2) : '';
                totalOverall += base;
            });
            const fm = (n) => 'RM ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const sumEl = document.getElementById('sum-perkakasan-total');
            if (sumEl) sumEl.innerText = fm(totalOverall);
            if (currentSystemCode && systems[currentSystemCode]) {
                systems[currentSystemCode].perkakasan = serializePerkakasanFromDOM();
            }
            updateInfoPanelCosts();
        }

        // ============================================
        // AI POPOVER LOGIC (preserved from original)
        // ============================================
        let aiCache = {};

        function toggleAI(context, rowId) {
            const pop = document.getElementById(`pop-${context}-${rowId}`);
            if (!pop) return;
            const isOpen = pop.classList.contains('pop-open');
            document.querySelectorAll('.ai-popover').forEach(p => { p.classList.remove('pop-open'); p.style.display = ''; });
            if (!isOpen) {
                pop.classList.add('pop-open');
                const input = document.getElementById(`input-${context}-${rowId}`);
                if (input) { input.value = ""; setTimeout(() => input.focus(), 80); }
                const resp = document.getElementById(`resp-${context}-${rowId}`);
                if (resp) resp.style.display = 'none';
                const submit = document.getElementById(`btn-submit-${context}-${rowId}`);
                if (submit) submit.style.display = 'block';
            }
        }

        function runAI(context, rowId) {
            const inputEl = document.getElementById(`input-${context}-${rowId}`);
            if (!inputEl) return;
            const input = inputEl.value;
            if (!input) { alert("Sila berikan maklumat dahulu!"); return; }

            const submitBtn = document.getElementById(`btn-submit-${context}-${rowId}`);
            const loadEl = document.getElementById(`load-${context}-${rowId}`);
            if (submitBtn) submitBtn.style.display = 'none';
            if (loadEl) loadEl.style.display = 'flex';

            setTimeout(() => {
                if (loadEl) loadEl.style.display = 'none';
                let hint = "", val = "";

                if (context === 'trans') {
                    if (input.toLowerCase().includes("kira") || input.toLowerCase().includes("formula")) {
                        hint = "Oleh kerana melibatkan pengiraan matematik (Formula), ini diklasifikasikan sebagai External Output (EO).";
                        val = "EOA - EO average";
                    } else if (input.toLowerCase().includes("papar") || input.toLowerCase().includes("lihat")) {
                        hint = "Hanya paparan data tanpa pengiraan tambahan. Ini diklasifikasikan sebagai External Inquiry (EQ).";
                        val = "EQA - EQ average";
                    } else {
                        hint = "Kemasukan data ke dalam sistem. Ini diklasifikasikan sebagai External Input (EI).";
                        val = "EIA - EI average";
                    }
                } else if (context === 'data') {
                    if (input.includes("banyak") || input.includes("50")) {
                        hint = "Berdasarkan jumlah medan data yang banyak, matriks JDN mengklasifikasikan ini sebagai Tinggi (High).";
                        val = "ILFH - high";
                    } else {
                        hint = "Data ringkas (< 19 DET). JDN mengklasifikasikan ini sebagai Rendah (Low).";
                        val = "ILFL - low";
                    }
                }

                const hintEl = document.getElementById(`hint-${context}-${rowId}`);
                const applyBtn = document.getElementById(`btn-apply-${context}-${rowId}`);
                const respEl = document.getElementById(`resp-${context}-${rowId}`);
                if (hintEl) hintEl.innerText = hint;
                if (applyBtn) applyBtn.innerText = `Guna Cadangan`;
                if (respEl) respEl.style.display = 'block';
                aiCache[`${context}-${rowId}`] = val;
            }, 1500);
        }

        function applyAI(context, rowId) {
            const value = aiCache[`${context}-${rowId}`];
            const drop = document.getElementById(`komponen-${context}-${rowId}`);
            if (!drop) return;
            drop.value = value;
            drop.style.color = "#333";
            drop.style.background = "#fff";
            const row = document.getElementById(`row-${context}-${rowId}`);
            if (row) {
                row.classList.add('highlight-pulse');
                setTimeout(() => row.classList.remove('highlight-pulse'), 1500);
            }
            const pop = document.getElementById(`pop-${context}-${rowId}`);
            if (pop) pop.style.display = 'none';
            recalculateTotals();
            updateFinalReport();
        }

        function recalculateTotals() {
            let totalMin = 0, totalMl = 0, totalMax = 0;
            document.querySelectorAll('input[id^="komponen-trans-"]').forEach(dd => {
                let id = dd.id.replace('komponen-trans-', '');
                let gInput = document.getElementById(`gandaan-trans-${id}`);
                let gandaan = gInput ? parseInt(gInput.value) || 1 : 1;
                const ref = (typeof lookupTransComponent === 'function') ? lookupTransComponent(dd.value) : null;
                if (ref) {
                    totalMin += ref.min    * gandaan;
                    totalMl  += ref.median * gandaan;
                    totalMax += ref.max    * gandaan;
                }
            });
            const setText = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
            setText('sum-min', totalMin.toFixed(2));
            setText('sum-ml',  totalMl.toFixed(2));
            setText('sum-max', totalMax.toFixed(2));
            setText('sum-mmin', totalMin.toFixed(2));
            setText('sum-mml',  totalMl.toFixed(2));
            setText('sum-mmax', totalMax.toFixed(2));
            // persist
            if (currentSystemCode && systems[currentSystemCode]) {
                systems[currentSystemCode].fungsiTrans = serializeFungsiTransFromDOM();
            }
            // Refresh the Fungsi Data summary bar too
            if (typeof recalculateDataTotals === 'function') recalculateDataTotals();
            updateFinalReport();
        }

        // Same logic as recalculateTotals() but for the Fungsi Data table.
        // Populates the dark MIN/ML/MAX/M-MIN/M-ML/M-MAX bar at the bottom of #page-data.
        function recalculateDataTotals() {
            let totalMin = 0, totalMl = 0, totalMax = 0;
            document.querySelectorAll('input[id^="komponen-data-"]').forEach(dd => {
                let id = dd.id.replace('komponen-data-', '');
                let gInput = document.getElementById(`gandaan-data-${id}`);
                let gandaan = gInput ? parseInt(gInput.value) || 1 : 1;
                const ref = (typeof lookupDataComponent === 'function') ? lookupDataComponent(dd.value) : null;
                if (ref) {
                    totalMin += ref.min    * gandaan;
                    totalMl  += ref.median * gandaan;
                    totalMax += ref.max    * gandaan;
                }
            });
            // Fall back to state if the page isn't currently rendered
            if (totalMl === 0 && currentSystemCode && systems[currentSystemCode]
                && !document.querySelector('#page-data tbody tr[id^="row-data-"]')) {
                (systems[currentSystemCode].fungsiData || []).forEach(r => {
                    const g = parseInt(r.gandaan) || 1;
                    const ref = lookupDataComponent(r.komponen || '');
                    if (ref) {
                        totalMin += ref.min    * g;
                        totalMl  += ref.median * g;
                        totalMax += ref.max    * g;
                    }
                });
            }
            const setText = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
            setText('sum-data-min',  totalMin.toFixed(2));
            setText('sum-data-ml',   totalMl.toFixed(2));
            setText('sum-data-max',  totalMax.toFixed(2));
            setText('sum-data-mmin', totalMin.toFixed(2));
            setText('sum-data-mml',  totalMl.toFixed(2));
            setText('sum-data-mmax', totalMax.toFixed(2));
        }

        // Close row popovers on outside click
        document.addEventListener('click', function (event) {
            const isInside = event.target.closest('.ai-popover') || event.target.closest('.ai-inline-btn');
            if (!isInside) document.querySelectorAll('.ai-popover').forEach(p => { p.classList.remove('pop-open'); p.style.display = ''; });
        });

        // ============================================
        // KOMPONEN CATALOG — exact values from FUSE government tables.
        // Keyed by aggregat label (matches the dropdown text in each row).
        // ============================================
        const DATA_COMPONENTS = {
            '1 - Amat Terperinci': [
                { value: 'ILFL - low',    min: 6.5,  median: 7.0,  max: 7.5,  keterangan: 'Komponen dikenalpasti sebagai ILF. Maklumat DET dan RET diketahui' },
                { value: 'ILFM - medium', min: 9.5,  median: 10.0, max: 10.5, keterangan: 'Komponen dikenalpasti sebagai ILF. Maklumat DET dan RET diketahui' },
                { value: 'ILFH - high',   min: 14.5, median: 15.0, max: 15.5, keterangan: 'Komponen dikenalpasti sebagai ILF. Maklumat DET dan RET diketahui' },
                { value: 'EIFL - low',    min: 4.5,  median: 5.0,  max: 5.5,  keterangan: 'Komponen dikenalpasti sebagai EIF. Maklumat DET dan RET diketahui' },
                { value: 'EIFM - medium', min: 6.5,  median: 7.0,  max: 7.5,  keterangan: 'Komponen dikenalpasti sebagai EIF. Maklumat DET dan RET diketahui' },
                { value: 'EIFH - high',   min: 9.5,  median: 10.0, max: 10.5, keterangan: 'Komponen dikenalpasti sebagai EIF. Maklumat DET dan RET diketahui' },
            ],
            '2 - Kurang Perincian': [
                { value: 'GILF - Generic ILF',                    min: 7.4, median: 7.7, max: 8.1, keterangan: 'Komponen dikenalpasti sebagai ILF. Maklumat DET dan RET TIDAK diketahui' },
                { value: 'GEIF - Generic EIF',                    min: 5.2, median: 5.4, max: 5.7, keterangan: 'Komponen dikenalpasti sebagai EIF. Maklumat DET dan RET TIDAK diketahui' },
                { value: 'UGDG - Unspecified Generic Data Group', min: 6.4, median: 7.0, max: 7.8, keterangan: 'Komponen TIDAK PASTI sama ada ILF atau EIF. Maklumat DET dan RET TIDAK diketahui' },
            ],
            '3 - Tiada Perincian': [
                { value: 'GDGS - small 2-4 ULF',  min: 15.0, median: 21.4, max: 27.8,  keterangan: 'Komponen mengumpul 2-4 ULF (tidak terperinci). Maklumat DET dan RET TIDAK diketahui' },
                { value: 'GDGM - medium 5-8 ULF', min: 32.4, median: 46.3, max: 60.2,  keterangan: 'Komponen mengumpul 5-8 ULF (tidak terperinci). Maklumat DET dan RET TIDAK diketahui' },
                { value: 'GDGL - large 9-13 ULF', min: 54.8, median: 78.3, max: 101.8, keterangan: 'Komponen mengumpul 9-13 ULF (tidak terperinci). Maklumat DET dan RET TIDAK diketahui' },
            ],
        };

        const TRANS_COMPONENTS = {
            '1 - Amat Terperinci': [
                { value: 'EIL - EI low',     min: 3, median: 3, max: 3, keterangan: 'Komponen dikenalpasti sebagai EI. Maklumat DET dan FTR diketahui' },
                { value: 'EIA - EI average', min: 4, median: 4, max: 4, keterangan: 'Komponen dikenalpasti sebagai EI. Maklumat DET dan FTR diketahui' },
                { value: 'EIH - EI high',    min: 6, median: 6, max: 6, keterangan: 'Komponen dikenalpasti sebagai EI. Maklumat DET dan FTR diketahui' },
                { value: 'EQL - EQ low',     min: 3, median: 3, max: 3, keterangan: 'Komponen dikenalpasti sebagai EQ. Maklumat DET dan FTR diketahui' },
                { value: 'EQA - EQ average', min: 4, median: 4, max: 4, keterangan: 'Komponen dikenalpasti sebagai EQ. Maklumat DET dan FTR diketahui' },
                { value: 'EQH - EQ high',    min: 6, median: 6, max: 6, keterangan: 'Komponen dikenalpasti sebagai EQ. Maklumat DET dan FTR diketahui' },
                { value: 'EOL - EO low',     min: 4, median: 4, max: 4, keterangan: 'Komponen dikenalpasti sebagai EO. Maklumat DET dan FTR diketahui' },
                { value: 'EOA - EO average', min: 5, median: 5, max: 5, keterangan: 'Komponen dikenalpasti sebagai EO. Maklumat DET dan FTR diketahui' },
                { value: 'EOH - EO high',    min: 7, median: 7, max: 7, keterangan: 'Komponen dikenalpasti sebagai EO. Maklumat DET dan FTR diketahui' },
            ],
            '2 - Terperinci': [
                { value: 'GEI - Generic EI',                                         min: 4.0, median: 4.2, max: 4.4, keterangan: 'Komponen dikenalpasti sebagai EI. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'GEQ - Generic EQ',                                         min: 3.7, median: 3.9, max: 4.1, keterangan: 'Komponen dikenalpasti sebagai EQ. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'GEO - Generic EO',                                         min: 4.9, median: 5.2, max: 5.4, keterangan: 'Komponen dikenalpasti sebagai EO. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'UGO - Unspecified Generic Output (EQ/EO)',                 min: 4.1, median: 4.6, max: 5.0, keterangan: 'Komponen TIDAK PASTI sama ada EQ atau EO. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'UGEP - Unspecified Generic Elementary Process (EI/EQ/EO)', min: 4.3, median: 4.6, max: 4.8, keterangan: 'Komponen TIDAK PASTI sama ada EI/EQ/EO. Maklumat DET dan FTR TIDAK diketahui' },
            ],
            '3 - Kurang Perincian': [
                { value: 'TPS - small (CRUD)',             min: 14.1, median: 16.5, max: 19.0, keterangan: 'Komponen mengumpulkan transaksi asas CRUD. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'TPM - medium (CRUD+List)',       min: 17.9, median: 21.1, max: 24.3, keterangan: 'Komponen mengumpulkan transaksi CRUD dan Senarai (Listing). Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'TPL - large (CRUD+List+Report)', min: 22.3, median: 26.3, max: 30.2, keterangan: 'Komponen mengumpulkan transaksi CRUD, Senarai dan Laporan. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'GPS - small 6-10 UEPs',          min: 26.4, median: 35.2, max: 44.0, keterangan: 'Komponen mengumpulkan 6-10 UEP (EI/EQ/EO). Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'GPM - medium 11-15 UEPs',        min: 42.9, median: 57.2, max: 71.5, keterangan: 'Komponen mengumpulkan 11-15 UEP (EI/EQ/EO). Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'GPL - large 16-20 UEPs',         min: 59.4, median: 79.2, max: 98.9, keterangan: 'Komponen mengumpulkan 16-20 UEP (EI/EQ/EO). Maklumat DET dan FTR TIDAK diketahui' },
            ],
            '4 - Tiada Perincian': [
                { value: 'MPS - small 2-4 Generic GPs',  min: 111.5, median: 171.5, max: 231.5, keterangan: 'Komponen mengumpul 2-4 Generic GP. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'MPM - medium 5-7 Generic GPs', min: 185.8, median: 285.9, max: 385.9, keterangan: 'Komponen mengumpul 5-7 Generic GP. Maklumat DET dan FTR TIDAK diketahui' },
                { value: 'MPL - large 8-10 Generic GPs', min: 297.3, median: 457.4, max: 617.4, keterangan: 'Komponen mengumpul 8-10 Generic GP. Maklumat DET dan FTR TIDAK diketahui' },
            ],
        };

        function lookupComponentRow(catalog, value) {
            for (const agg in catalog) {
                const row = catalog[agg].find(r => r.value === value);
                if (row) return row;
            }
            return null;
        }
        function lookupDataComponent(value)  { return lookupComponentRow(DATA_COMPONENTS,  value); }
        function lookupTransComponent(value) { return lookupComponentRow(TRANS_COMPONENTS, value); }

        function fmtPoint(n) {
            return Number.isInteger(n) ? String(n) : n.toFixed(1);
        }

        // ============================================
        // KOMPONEN MODALS (Fungsi Data + Fungsi Trans)
        // ============================================
        let currentModalRowId = null;

        function populateKomponenModal(catalog, aggregat, tableEl, emptyEl, bodyEl, selectEl) {
            bodyEl.innerHTML = '';
            selectEl.innerHTML = '<option value="">Pilih Komponen</option>';

            const list = catalog[aggregat];
            if (!list || !list.length) {
                tableEl.style.display = 'none';
                emptyEl.style.display = 'block';
                selectEl.disabled = true;
                return;
            }
            tableEl.style.display = '';
            emptyEl.style.display = 'none';
            selectEl.disabled = false;

            list.forEach(c => {
                bodyEl.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>${escapeHtml(c.value)}</td>
                        <td>${fmtPoint(c.min)}</td>
                        <td>${fmtPoint(c.median)}</td>
                        <td>${fmtPoint(c.max)}</td>
                        <td>${escapeHtml(c.keterangan)}</td>
                    </tr>
                `);
                const opt = document.createElement('option');
                opt.value = c.value;
                opt.textContent = c.value;
                selectEl.appendChild(opt);
            });
        }

        function openModal(rowId) {
            currentModalRowId = rowId;
            const aggSel = document.getElementById(`aggregat-data-${rowId}`);
            const aggregat = aggSel ? aggSel.value : '';
            populateKomponenModal(
                DATA_COMPONENTS,
                aggregat,
                document.getElementById('komponenModalTable'),
                document.getElementById('komponenModalEmpty'),
                document.getElementById('komponenModalBody'),
                document.getElementById('modalSelect'),
            );
            document.getElementById('komponenModal').style.display = 'flex';
            document.getElementById('modalSelect').value = '';
        }
        function closeModal() { document.getElementById('komponenModal').style.display = 'none'; }
        function confirmModal() {
            const val = document.getElementById('modalSelect').value;
            if (val && currentModalRowId) {
                const drop = document.getElementById(`komponen-data-${currentModalRowId}`);
                if (drop) {
                    drop.value = val;
                    drop.style.color = "#333";
                    drop.style.background = "#fff";
                }
                const row = document.getElementById(`row-data-${currentModalRowId}`);
                if (row) {
                    row.classList.add('highlight-pulse');
                    setTimeout(() => row.classList.remove('highlight-pulse'), 1500);
                }
                if (currentSystemCode) systems[currentSystemCode].fungsiData = serializeFungsiDataFromDOM();
                updateFinalReport();
            }
            closeModal();
        }

        function openTransModal(rowId) {
            currentModalRowId = rowId;
            const aggSel = document.getElementById(`aggregat-trans-${rowId}`);
            const aggregat = aggSel ? aggSel.value : '';
            populateKomponenModal(
                TRANS_COMPONENTS,
                aggregat,
                document.getElementById('komponenTransModalTable'),
                document.getElementById('komponenTransModalEmpty'),
                document.getElementById('komponenTransModalBody'),
                document.getElementById('modalTransSelect'),
            );
            document.getElementById('komponenTransModal').style.display = 'flex';
            document.getElementById('modalTransSelect').value = '';
        }
        function closeTransModal() { document.getElementById('komponenTransModal').style.display = 'none'; }
        function confirmTransModal() {
            const val = document.getElementById('modalTransSelect').value;
            if (val && currentModalRowId) {
                const drop = document.getElementById(`komponen-trans-${currentModalRowId}`);
                if (drop) {
                    drop.value = val;
                    drop.style.color = "#333";
                    drop.style.background = "#fff";
                }
                const row = document.getElementById(`row-trans-${currentModalRowId}`);
                if (row) {
                    row.classList.add('highlight-pulse');
                    setTimeout(() => row.classList.remove('highlight-pulse'), 1500);
                }
                recalculateTotals();
            }
            closeTransModal();
        }

        // ============================================
        // SAVE / ROW-MODE / DELETE / CLEAR (Data + Trans)
        // ============================================
        let currentSaveContext = null;
        let currentSaveRowId = null;

        function openSaveModal(context, rowId) {
            currentSaveContext = context;
            currentSaveRowId = rowId;
            document.getElementById('saveModal').style.display = 'flex';
        }
        function closeSaveModal() { document.getElementById('saveModal').style.display = 'none'; }
        function confirmSaveModal() {
            if (currentSaveContext && currentSaveRowId) {
                const row = document.getElementById(`row-${currentSaveContext}-${currentSaveRowId}`);
                if (row) {
                    row.classList.add('highlight-pulse');
                    setTimeout(() => row.classList.remove('highlight-pulse'), 1500);
                    toggleRowMode(currentSaveContext, currentSaveRowId, 'view');
                }
                // persist to state
                if (currentSystemCode) {
                    if (currentSaveContext === 'data') systems[currentSystemCode].fungsiData = serializeFungsiDataFromDOM();
                    else if (currentSaveContext === 'trans') systems[currentSystemCode].fungsiTrans = serializeFungsiTransFromDOM();
                }
            }
            closeSaveModal();
            if (typeof fuseScheduleSave === 'function') fuseScheduleSave(0);
        }

        function toggleRowMode(context, rowId, mode) {
            const row = document.getElementById(`row-${context}-${rowId}`);
            if (!row) return;
            const actionContainer = row.querySelector('.action-btns');
            if (!actionContainer) return;
            if (mode === 'view') {
                row.classList.add('view-mode');
                actionContainer.innerHTML = `
                    <button class="action-btn" onclick="toggleRowMode('${context}', ${rowId}, 'edit')">✏️</button>
                    <button class="action-btn" onclick="deleteRow('${context}', ${rowId})">🗑️</button>
                `;
            } else {
                row.classList.remove('view-mode');
                actionContainer.innerHTML = `
                    <button class="action-btn" onclick="openSaveModal('${context}', ${rowId})">💾</button>
                    <button class="action-btn" onclick="clearRowData('${context}', ${rowId})">🧹</button>
                `;
            }
        }

        function deleteRow(context, rowId) {
            if (!confirm("Adakah anda pasti ingin memadam baris ini?")) return;
            const row = document.getElementById(`row-${context}-${rowId}`);
            if (row) {
                row.remove();
                if (currentSystemCode) {
                    if (context === 'data') systems[currentSystemCode].fungsiData = serializeFungsiDataFromDOM();
                    else if (context === 'trans') systems[currentSystemCode].fungsiTrans = serializeFungsiTransFromDOM();
                }
                if (context === 'trans') recalculateTotals();
                else updateFinalReport();
            }
        }

        function clearRowData(context, rowId) {
            const row = document.getElementById(`row-${context}-${rowId}`);
            if (!row) return;
            row.querySelectorAll('input[type="text"], input[type="number"], textarea').forEach(input => {
                if (!input.disabled) input.value = '';
            });
            row.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
            // reset komponen input placeholder styling
            const komp = row.querySelector(`input[id^="komponen-${context}"]`);
            if (komp) {
                komp.value = '';
                komp.style.background = '#f3f4f6';
                komp.style.color = '#9ca3af';
            }
            if (context === 'trans') recalculateTotals();
            else updateFinalReport();
        }

        // ============================================
        // FINAL REPORT (Penganggaran Kos)
        // ============================================
        function updateFinalReport() {
            // Always keep the per-page summary bars in sync.
            if (typeof recalculateDataTotals === 'function') recalculateDataTotals();

            const dataPts  = (val) => { const r = lookupDataComponent(val);  return r ? { min: r.min, ml: r.median, max: r.max } : { min: 0, ml: 0, max: 0 }; };
            const transPts = (val) => { const r = lookupTransComponent(val); return r ? { min: r.min, ml: r.median, max: r.max } : { min: 0, ml: 0, max: 0 }; };

            let dataMin = 0, dataMl = 0, dataMax = 0;
            document.querySelectorAll('input[id^="komponen-data-"]').forEach(input => {
                let id = input.id.replace('komponen-data-', '');
                let gInput = document.getElementById(`gandaan-data-${id}`);
                let gandaan = gInput ? parseInt(gInput.value) || 1 : 1;
                const p = dataPts(input.value);
                dataMin += p.min * gandaan;
                dataMl  += p.ml  * gandaan;
                dataMax += p.max * gandaan;
            });
            // Fall back to stored state when the data page isn't rendered
            if (dataMl === 0 && currentSystemCode && systems[currentSystemCode] && !document.querySelector('#page-data tbody tr[id^="row-data-"]')) {
                (systems[currentSystemCode].fungsiData || []).forEach(r => {
                    const g = parseInt(r.gandaan) || 1;
                    const p = dataPts(r.komponen || '');
                    dataMin += p.min * g;
                    dataMl  += p.ml  * g;
                    dataMax += p.max * g;
                });
            }

            let transMin = 0, transMl = 0, transMax = 0;
            document.querySelectorAll('input[id^="komponen-trans-"]').forEach(input => {
                let id = input.id.replace('komponen-trans-', '');
                let gInput = document.getElementById(`gandaan-trans-${id}`);
                let gandaan = gInput ? parseInt(gInput.value) || 1 : 1;
                const p = transPts(input.value);
                transMin += p.min * gandaan;
                transMl  += p.ml  * gandaan;
                transMax += p.max * gandaan;
            });
            if (transMl === 0 && currentSystemCode && systems[currentSystemCode] && !document.querySelector('#page-trans tbody tr[id^="row-trans-"]')) {
                (systems[currentSystemCode].fungsiTrans || []).forEach(r => {
                    const g = parseInt(r.gandaan) || 1;
                    const p = transPts(r.komponen || '');
                    transMin += p.min * g;
                    transMl  += p.ml  * g;
                    transMax += p.max * g;
                });
            }

            let tdi = 0;
            if (document.getElementById('komponen-vaf-1')) {
                for (let i = 1; i <= 14; i++) {
                    const val = document.getElementById(`komponen-vaf-${i}`);
                    if (val) tdi += parseInt(val.value) || 0;
                }
            } else if (currentSystemCode && systems[currentSystemCode]) {
                (systems[currentSystemCode].vaf || []).forEach(v => tdi += (parseInt(v) || 0));
            }
            let vaf = (tdi * 0.01) + 0.65;

            const f = (n) => n.toFixed(2);
            const formatMoney = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const el = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };

            el('rep-data-min', f(dataMin)); el('rep-data-ml', f(dataMl)); el('rep-data-max', f(dataMax));
            el('rep-trans-min', f(transMin)); el('rep-trans-ml', f(transMl)); el('rep-trans-max', f(transMax));
            let cMin = dataMin + transMin, cMl = dataMl + transMl, cMax = dataMax + transMax;
            el('rep-sum-min', f(cMin)); el('rep-sum-ml', f(cMl)); el('rep-sum-max', f(cMax));
            el('rep-vaf-min', f(vaf)); el('rep-vaf-ml', f(vaf)); el('rep-vaf-max', f(vaf));
            let afpMin = cMin * vaf, afpMl = cMl * vaf, afpMax = cMax * vaf;
            el('rep-afp-min', f(afpMin)); el('rep-afp-ml', f(afpMl)); el('rep-afp-max', f(afpMax));
            let kosMin = afpMin * 1200, kosMl = afpMl * 1200, kosMax = afpMax * 1200;
            el('rep-kos-min', formatMoney(kosMin)); el('rep-kos-ml', formatMoney(kosMl)); el('rep-kos-max', formatMoney(kosMax));
            let manMin = Math.floor((afpMin * 10) / 8), manMl = Math.floor((afpMl * 10) / 8), manMax = Math.floor((afpMax * 10) / 8);
            el('rep-man-min', manMin); el('rep-man-ml', manMl); el('rep-man-max', manMax);

            updateInfoPanelCosts();
        }

        function janaPDF() {
            const element = document.getElementById('report-container');
            const btnContainer = document.getElementById('pdf-actions');
            const sysName = currentSystemCode ? `${currentSystemCode}_${(systems[currentSystemCode]?.nama || '').replace(/\s+/g, '_')}` : 'Sistem';
            document.getElementById('report-date').innerText = new Date().toLocaleDateString('ms-MY', { year: 'numeric', month: 'long', day: 'numeric' });
            btnContainer.style.display = 'none';
            const opt = {
                margin: 15,
                filename: `Laporan_Kos_FPA_${sysName}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };
            html2pdf().set(opt).from(element).save().then(() => {
                btnContainer.style.display = 'flex';
                document.getElementById('report-date').innerText = '';
            });
        }

        // ============================================
        // INFO PANEL — live cost summary per system
        // ============================================
        function calcSystemCosts(kod) {
            const s = systems[kod];
            if (!s) return { fpaMin: 0, fpaMax: 0, peng: 0, pengSst: 0, perk: 0 };

            // FPA total uses median (point) values from the catalog.
            let totalData = 0;
            (s.fungsiData || []).forEach(r => {
                const ref = lookupDataComponent(r.komponen || '');
                if (ref) totalData += ref.median * (parseInt(r.gandaan) || 1);
            });
            let totalTrans = 0;
            (s.fungsiTrans || []).forEach(r => {
                const ref = lookupTransComponent(r.komponen || '');
                if (ref) totalTrans += ref.median * (parseInt(r.gandaan) || 1);
            });
            let tdi = 0;
            (s.vaf || []).forEach(v => tdi += (parseInt(v) || 0));
            let vaf = (tdi * 0.01) + 0.65;
            let afp = (totalData + totalTrans) * vaf;
            let kosFpa = afp * 1200;

            // Pengurusan
            let pengBase = 0;
            (s.pengurusan || []).forEach(r => {
                pengBase += (parseFloat(r.harga) || 0) * (parseInt(r.kuantiti) || 0);
            });
            let pengSst = pengBase * 0.08;

            // Perkakasan
            let perk = 0;
            (s.perkakasan || []).forEach(r => {
                perk += (parseFloat(r.harga) || 0) * (parseInt(r.kuantiti) || 0);
            });

            return { fpaMin: kosFpa, fpaMax: kosFpa * 1.08, peng: pengBase, pengSst: pengSst, perk: perk };
        }

        function updateInfoPanelCosts() {
            if (!currentSystemCode || !systems[currentSystemCode]) return;
            // make sure DOM state is reflected into state first (lightweight)
            const c = calcSystemCosts(currentSystemCode);
            const fm = (n) => 'RM ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const rows = document.querySelectorAll('.rp-info-row');
            // Order (by original HTML): Kod, Nama, Kos FPA, Kos Pengurusan, Kos Perkakasan, Kos keseluruhan, Keterangan
            if (rows.length >= 6) {
                rows[2].innerHTML = `<strong>Kos FPA:</strong> ${fm(c.fpaMin)} / ${fm(c.fpaMax)} (+sst 8%)`;
                rows[3].innerHTML = `<strong>Kos Pengurusan:</strong> ${fm(c.peng)} / ${fm(c.peng + c.pengSst)} (+sst 8%)`;
                rows[4].innerHTML = `<strong>Kos Perkakasan:</strong> ${fm(c.perk)}`;
                const total = c.fpaMin + c.peng + c.perk;
                const totalSst = c.fpaMax + (c.peng + c.pengSst) + c.perk;
                rows[5].innerHTML = `<strong>Kos keseluruhan:</strong> ${fm(total)} / ${fm(totalSst)} (+sst 8%)`;
            }
        }

        // ============================================
        // TOP-LEVEL SECTION SWITCH (Laman Utama  ↔  Analisis Sistem)
        // ============================================
        function switchSection(name) {
            const laman    = document.getElementById('section-laman-utama');
            const analisis = document.getElementById('section-analisis');
            const sbLaman    = document.getElementById('sb-laman-utama');
            const sbAnalisis = document.getElementById('sb-analisis');
            const sbAnalisisChildren = document.getElementById('sb-analisis-children');
            const breadcrumb = document.getElementById('top-breadcrumb');

            if (name === 'laman-utama') {
                if (laman)    laman.style.display = '';
                if (analisis) analisis.style.display = 'none';
                // Sidebar active states
                if (sbLaman) sbLaman.classList.add('active-home');
                if (sbAnalisis) {
                    sbAnalisis.style.background = '';
                    sbAnalisis.style.color = '';
                    sbAnalisis.style.fontWeight = '';
                }
                if (sbAnalisisChildren) sbAnalisisChildren.style.display = 'none';
                if (breadcrumb) breadcrumb.innerHTML = '🏠 / Laman Utama Agensi';
            } else { // 'analisis'
                if (laman)    laman.style.display = 'none';
                if (analisis) analisis.style.display = '';
                if (sbLaman) sbLaman.classList.remove('active-home');
                if (sbAnalisis) {
                    sbAnalisis.style.background = 'white';
                    sbAnalisis.style.color = 'var(--fuse-navy)';
                    sbAnalisis.style.fontWeight = '600';
                }
                if (sbAnalisisChildren) sbAnalisisChildren.style.display = '';
                if (breadcrumb) breadcrumb.innerHTML = '🏠 / Analisis Sistem / Pengurusan Sistem / Senarai Sistem';
            }
        }

        // ============================================
        // INITIALIZATION
        // ============================================
        // Seed defaults only when running fully offline (no auth layer).
        // When auth.js is loaded it will overwrite `systems` with the
        // server's per-user list right after login.
        function initDefaultSystems() {
            if (Object.keys(systems).length > 0) return;
            systems['UTM3'] = createEmptySystem('UTM3', 'Food Counter', 'Food');
            systems['UTM2'] = createEmptySystem('UTM2', 'tesing', 'tesing');
        }

        // Expose for auth.js / debugging.
        window.systems = systems;
        window.currentSystemCode = currentSystemCode;

        // Setter so other scripts (ai-chatbox.js) can change the system the
        // app is focused on. Writing window.currentSystemCode alone does NOT
        // work — switchMainPage() reads the block-scoped `let currentSystemCode`
        // above, which is a separate variable. This keeps both in sync.
        window.setCurrentSystemCode = function(kod) {
            currentSystemCode = (kod && systems[kod]) ? kod : null;
            window.currentSystemCode = currentSystemCode;
            return currentSystemCode;
        };

        window.addEventListener('DOMContentLoaded', () => {
            // Only seed demo systems if there's no token saved (i.e. not yet
            // logged in or running without the backend). After a successful
            // login, auth.js calls fuseLoadUserSystems() which replaces
            // window.systems and re-renders.
            const hasToken = !!localStorage.getItem('fuse_jwt');
            if (!hasToken) initDefaultSystems();
            window.systems = systems; // re-sync after possible mutation
            renderSenaraiTable();   // also calls renderDashboard()
            // Initial visible page is senarai (inside Analisis section)
            document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
            document.getElementById('page-senarai').classList.add('active');
            currentVisiblePage = 'page-senarai';
            // Default top-level section: Laman Utama dashboard
            switchSection('laman-utama');
        });

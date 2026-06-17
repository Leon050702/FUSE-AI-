// ── AI Modal state ──────────────────────────────
let aiModalState = 'idle'; // idle | thinking | done
let aiModalCloseTimer = null;
// Which "personality" the chatbox runs as:
//   'estimate' — Analisis Sistem: generates FD/FT/VAF/Kos tables (default).
//   'review'   — Laman Utama: audits existing systems for completeness.
let aiChatMode = 'estimate';

// ── Chatbox backend integration ──────────────────
const AI_BACKEND_URL = 'http://localhost:3001';
let aiConversation = [];      // multi-turn: [{role: 'user'|'assistant', content: '...'}]
let aiCurrentPayload = null;  // last validated payload (for submit-to-laravel)

// ── Persistent chat history ──────────────────────
let aiCurrentConvoId = null;   // server-side conversation id (null = not yet saved)
let aiConvoList = [];          // [{id, title, system_kod, updated_at, msg_count}, ...]
let aiLinkedSystemKod = null;  // 'UTM3' / null — which system AI should edit

// JWT helper — same key auth.js uses.
function aiAuthHeaders() {
  const tok = localStorage.getItem('fuse_jwt');
  return tok
    ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }
    : { 'Content-Type': 'application/json' };
}

function aiHasToken() { return !!localStorage.getItem('fuse_jwt'); }

// ----- API wrappers ------------------------------------------------
// Lists ONLY the conversations for the current chatbox mode — the Analisis
// Sistem ('estimate') and Laman Utama ('review') chatboxes have separate
// histories.
async function aiApiListConvos() {
  if (!aiHasToken()) return [];
  try {
    const r = await fetch(
      AI_BACKEND_URL + '/api/conversations?mode=' + encodeURIComponent(aiChatMode),
      { headers: aiAuthHeaders() }
    );
    if (!r.ok) return [];
    const d = await r.json();
    return d.conversations || [];
  } catch (_) { return []; }
}

async function aiApiCreateConvo(title, systemKod) {
  const r = await fetch(AI_BACKEND_URL + '/api/conversations', {
    method: 'POST',
    headers: aiAuthHeaders(),
    body: JSON.stringify({
      title: title || 'Perbualan Baru',
      system_kod: systemKod || null,
      mode: aiChatMode,            // tag the conversation with this chatbox's mode
    }),
  });
  if (!r.ok) throw new Error('Gagal mencipta perbualan.');
  const d = await r.json();
  return d.conversation;
}

// Update just the system_kod link for an existing conversation.
async function aiApiSetConvoSystem(convoId, systemKod) {
  try {
    await fetch(AI_BACKEND_URL + '/api/conversations/' + convoId, {
      method: 'PATCH',
      headers: aiAuthHeaders(),
      body: JSON.stringify({ system_kod: systemKod || null }),
    });
  } catch (_) { /* non-fatal */ }
}

async function aiApiLoadConvo(id) {
  const r = await fetch(AI_BACKEND_URL + '/api/conversations/' + id, { headers: aiAuthHeaders() });
  if (!r.ok) throw new Error('Gagal memuat perbualan.');
  const d = await r.json();
  return d.conversation;
}

async function aiApiAppendMessage(convoId, role, content) {
  try {
    await fetch(AI_BACKEND_URL + '/api/conversations/' + convoId + '/messages', {
      method: 'POST',
      headers: aiAuthHeaders(),
      body: JSON.stringify({ role, content }),
    });
  } catch (_) { /* non-fatal — UI continues even if save fails */ }
}

async function aiApiRenameConvo(id, title) {
  try {
    await fetch(AI_BACKEND_URL + '/api/conversations/' + id, {
      method: 'PATCH',
      headers: aiAuthHeaders(),
      body: JSON.stringify({ title }),
    });
  } catch (_) { /* non-fatal */ }
}

async function aiApiDeleteConvo(id) {
  const r = await fetch(AI_BACKEND_URL + '/api/conversations/' + id, {
    method: 'DELETE',
    headers: aiAuthHeaders(),
  });
  return r.ok;
}

// ----- System-link dropdown (custom, themed) ----------------------
const AI_SYSDD_NONE_LABEL = '— Tiada (cipta baharu) —';

// Rebuild the custom dropdown menu + trigger label from the current systems.
function aiRefreshSystemDropdown() {
  const menu    = document.getElementById('ai-sysdd-menu');
  const current = document.getElementById('ai-sysdd-current');
  if (!menu || !current) return;

  const list = Object.values(window.systems || {});

  // "— Tiada (cipta baharu) —" row + divider, then one row per system.
  const noneSel = !aiLinkedSystemKod ? ' selected' : '';
  let html =
    `<div class="ai-sysdd-item is-none${noneSel}" role="option" data-kod="">
       <span class="ai-sysdd-name">${AI_SYSDD_NONE_LABEL}</span>
     </div>`;
  if (list.length) html += `<div class="ai-sysdd-sep"></div>`;
  html += list.map(s => {
    const sel = (s.kod === aiLinkedSystemKod) ? ' selected' : '';
    return `<div class="ai-sysdd-item${sel}" role="option" data-kod="${escapeHtml(s.kod)}">
              <span class="ai-sysdd-kod">${escapeHtml(s.kod)}</span>
              <span class="ai-sysdd-name">${escapeHtml(s.nama || '')}</span>
            </div>`;
  }).join('');
  menu.innerHTML = html;

  // Wire each row's click.
  menu.querySelectorAll('.ai-sysdd-item').forEach(el => {
    el.onclick = () => {
      aiSetLinkedSystem(el.getAttribute('data-kod'));
      aiCloseSystemDropdown();
    };
  });

  // Refresh the trigger label to whatever is currently linked.
  if (aiLinkedSystemKod && window.systems && window.systems[aiLinkedSystemKod]) {
    const s = window.systems[aiLinkedSystemKod];
    current.textContent = `${s.kod} · ${s.nama || ''}`;
  } else {
    current.textContent = AI_SYSDD_NONE_LABEL;
  }
}

// Open / close the custom dropdown menu.
function aiToggleSystemDropdown(ev) {
  if (ev) ev.stopPropagation();
  const menu = document.getElementById('ai-sysdd-menu');
  const trig = document.getElementById('ai-sysdd-trigger');
  if (!menu || !trig) return;
  const willOpen = !menu.classList.contains('open');
  if (willOpen) aiRefreshSystemDropdown();   // always show fresh systems
  menu.classList.toggle('open', willOpen);
  trig.classList.toggle('open', willOpen);
}
function aiCloseSystemDropdown() {
  document.getElementById('ai-sysdd-menu')?.classList.remove('open');
  document.getElementById('ai-sysdd-trigger')?.classList.remove('open');
}
// Click anywhere outside the dropdown closes it.
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('ai-system-link');
  if (wrap && !wrap.contains(e.target)) aiCloseSystemDropdown();
});

// User picked a system. Persists the link if we have a convo.
async function aiSetLinkedSystem(kod) {
  aiLinkedSystemKod = kod || null;
  if (aiCurrentConvoId) {
    aiApiSetConvoSystem(aiCurrentConvoId, aiLinkedSystemKod);
  }
  aiRefreshSystemDropdown();   // sync trigger label + selected highlight
  // Update header subline so the user sees the link took effect.
  const sub = document.getElementById('ai-header-sub');
  if (sub) {
    sub.textContent = aiLinkedSystemKod
      ? `✦ Mengedit sistem ${aiLinkedSystemKod}`
      : 'Siap membantu anda (tiada sistem terikat)';
  }
}

// ----- Sidebar render ----------------------------------------------
async function aiRefreshSidebar() {
  // Review mode (Laman Utama) shows a SYSTEMS list, not conversation history.
  // We still load the convo list first so each system can show whether it
  // already has a saved review chat.
  if (aiChatMode === 'review') {
    aiConvoList = await aiApiListConvos();
    aiRenderSystemsSidebar();
    return;
  }

  const list = document.getElementById('ai-convo-list');
  if (!list) return;
  if (!aiHasToken()) {
    list.innerHTML = '<div class="ai-convo-empty">Log masuk untuk menyimpan sejarah perbualan.</div>';
    return;
  }
  aiConvoList = await aiApiListConvos();
  if (!aiConvoList.length) {
    list.innerHTML = '<div class="ai-convo-empty">Tiada perbualan lagi. Mulakan satu baharu!</div>';
    return;
  }
  list.innerHTML = aiConvoList.map(c => {
    const linked = c.system_kod
      ? `<span class="convo-link-tag" title="Terikat dengan sistem ${escapeHtml(c.system_kod)}">${escapeHtml(c.system_kod)}</span>`
      : '';
    return `
      <div class="ai-convo-item ${c.id === aiCurrentConvoId ? 'active' : ''}"
           onclick="aiSwitchConversation(${c.id})"
           ondblclick="event.stopPropagation(); aiStartRenameConvo(${c.id}, this)">
        <span class="title" title="Klik dua kali untuk namakan semula">${escapeHtml(c.title)}</span>
        ${linked}
        <button class="rename-btn" title="Namakan semula"
                onclick="event.stopPropagation(); aiStartRenameConvo(${c.id}, this.parentElement)">✎</button>
        <button class="del-btn" title="Padam"
                onclick="event.stopPropagation(); aiDeleteConversation(${c.id})">🗑</button>
      </div>
    `;
  }).join('');
}

// Review-mode sidebar: lists every registered system. Clicking one FOCUSES
// it (so the AI knows which system the user means) — the user then types
// their request in the right-side input.
function aiRenderSystemsSidebar() {
  const list = document.getElementById('ai-convo-list');
  if (!list) return;
  const arr = Object.values(window.systems || {});
  if (!arr.length) {
    list.innerHTML = '<div class="ai-convo-empty">Tiada sistem didaftar. Sila daftar sistem di Analisis Sistem.</div>';
    return;
  }
  // Which systems already have a saved review chat (so we can show a ● marker).
  const chatKods = new Set((aiConvoList || []).map(c => c.system_kod).filter(Boolean));
  list.innerHTML = arr.map(s => {
    const active = (s.kod === aiLinkedSystemKod) ? ' active' : '';
    // ● = has an ongoing chat for this system; dimmed ○ = no chat yet.
    const dot = chatKods.has(s.kod)
      ? '<span class="ai-sys-chatdot has" title="Ada chat tersimpan">●</span>'
      : '<span class="ai-sys-chatdot" title="Belum ada chat">○</span>';
    return `
      <div class="ai-convo-item ai-sys-item${active}" onclick="aiFocusReviewSystem('${escapeHtml(s.kod)}')">
        ${dot}
        <span class="ai-sys-item-kod">${escapeHtml(s.kod)}</span>
        <span class="title" title="${escapeHtml(s.nama || '')}">${escapeHtml(s.nama || '(tiada nama)')}</span>
      </div>
    `;
  }).join('');
}

// User clicked a system in the review sidebar — open THAT system's own chatbox.
// Each system keeps one ongoing review conversation: if it already has one we
// load its saved history; if not we create a fresh one and run the first review.
async function aiFocusReviewSystem(kod) {
  if (!(kod && window.systems && window.systems[kod])) return;
  if (aiModalState === 'thinking') return;   // don't switch mid-stream

  aiLinkedSystemKod = kod;
  aiRenderSystemsSidebar();                   // highlight the picked system
  const sub = document.getElementById('ai-header-sub');
  if (sub) sub.textContent = `Membuka chat sistem ${kod}…`;

  // Find this system's existing review conversation (if any).
  const existing = await aiFindSystemConvo(kod);
  if (existing) {
    // Reopen its saved chat (past review + any follow-up messages).
    await aiSwitchConversation(existing.id);
    return;
  }

  // No chat yet for this system → create one, link it, and run the first review.
  const s = window.systems[kod];
  aiConversation = [];
  document.getElementById('ai-chat-area').innerHTML = '';
  try {
    const convo = await aiApiCreateConvo(`Semakan ${kod} — ${s.nama || ''}`.trim(), kod);
    aiCurrentConvoId = convo.id;
  } catch (_) {
    aiCurrentConvoId = null;   // saving may fail (e.g. not logged in) — chat still works in-session
  }
  await aiRefreshSidebar();
  aiRenderSystemsSidebar();

  const autoMsg = `Sila semak kelengkapan sistem ${s.kod} (${s.nama || ''}) sahaja, dan laporkan bahagian yang sudah lengkap dan yang belum bagi sistem ini.`;
  aiConversation.push({ role: 'user', content: autoMsg });
  if (aiCurrentConvoId) aiApiAppendMessage(aiCurrentConvoId, 'user', autoMsg);
  sendAIEstimate(autoMsg);
}

// Look up the saved review conversation linked to a given system code.
// Returns the convo summary {id, title, system_kod, ...} or null.
async function aiFindSystemConvo(kod) {
  if (!aiHasToken()) return null;
  const list = await aiApiListConvos();   // already filtered to mode=review
  return list.find(c => c.system_kod === kod) || null;
}

// Inline rename: replace the title span with an input, Enter saves, Esc cancels.
function aiStartRenameConvo(id, itemEl) {
  const titleEl = itemEl.querySelector('.title');
  if (!titleEl || itemEl.querySelector('.rename-input')) return; // already editing

  const oldText = titleEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = oldText;
  input.maxLength = 80;
  input.onclick = (e) => e.stopPropagation();

  const commit = async (save) => {
    const newText = input.value.trim();
    input.replaceWith(titleEl);
    if (save && newText && newText !== oldText) {
      titleEl.textContent = newText; // optimistic update
      await aiApiRenameConvo(id, newText);
      aiRefreshSidebar();
    } else {
      titleEl.textContent = oldText;
    }
  };

  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  input.onblur = () => commit(true);

  titleEl.replaceWith(input);
  input.focus();
  input.select();
}

// Switch into an existing convo: load its messages, render them, set state.
async function aiSwitchConversation(id) {
  try {
    const convo = await aiApiLoadConvo(id);
    aiCurrentConvoId = convo.id;
    aiLinkedSystemKod = convo.system_kod || null;
    // Keep the chatbox mode in sync with the conversation being opened.
    if (convo.mode === 'review' || convo.mode === 'estimate') aiChatMode = convo.mode;
    aiConversation = (convo.messages || []).map(m => ({ role: m.role, content: m.content }));
    aiCurrentPayload = null;
    window.aiPendingPayload = null;

    // Re-render the chat area from scratch.
    // For assistant messages we must:
    //   1. strip the raw JSON before display (the user must never see it),
    //   2. re-parse the JSON payload so the apply button can be restored.
    // The apply button is a UI element built at send-time and is NOT persisted,
    // so without this it would vanish when reopening a saved conversation.
    //
    // If this conversation is already LINKED to an existing system, the data
    // was already inserted in a past session — so instead of the "MASUKKAN KE
    // DALAM SISTEM" button we show the "PERGI KE KOS FPA" card.
    const alreadyApplied = !!(aiLinkedSystemKod && window.systems && window.systems[aiLinkedSystemKod]);

    const chat = document.getElementById('ai-chat-area');
    chat.innerHTML = '';
    let lastPayload = null;
    aiConversation.forEach(m => {
      if (m.role === 'user') {
        addAIBubble(m.content, true);
        return;
      }
      // assistant message
      const visible = aiStripJsonBlock(m.content).trim();
      const replyBubble = visible ? addAIBubble(visible) : null;
      const payload = aiExtractPayloadFromText(m.content);
      if (payload) {
        lastPayload = payload;
        if (alreadyApplied) {
          // Data already in the system — offer navigation, not re-insert.
          const s = window.systems[aiLinkedSystemKod];
          aiAppendCardToBubble(replyBubble, aiGoToSystemCardHtml(aiLinkedSystemKod, s && s.nama));
        } else {
          // Restore the "MASUKKAN KE DALAM SISTEM" card under this message.
          window.aiPendingPayload = payload;
          aiAppendCardToBubble(replyBubble, aiApplyButtonHtml());
        }
      }
    });
    // If the conversation ended with a generated payload that was NOT yet
    // applied, keep it pending so the restored apply button works.
    if (lastPayload && !alreadyApplied) window.aiPendingPayload = lastPayload;
    else window.aiPendingPayload = null;

    // Reset UI mode to "idle" (input visible)
    aiModalState = 'idle';
    document.getElementById('ai-input-area').style.display = 'flex';
    document.getElementById('ai-done-actions')?.classList.remove('show');
    document.getElementById('ai-send-btn').disabled = false;
    document.getElementById('ai-header-sub').textContent = aiLinkedSystemKod
      ? (aiChatMode === 'review' ? `Semakan sistem ${aiLinkedSystemKod}` : `✦ Mengedit sistem ${aiLinkedSystemKod}`)
      : (convo.title || 'Perbualan disambung semula');

    // In review mode, re-attach the hover "Pergi ke …" jumps to the report table
    // so a reopened system chat keeps its clickable section rows.
    if (aiChatMode === 'review' && aiLinkedSystemKod) {
      aiAttachRowJumpsToLastReport(aiLinkedSystemKod);
    }

    aiRefreshSidebar();          // update active highlight
    aiRefreshSystemDropdown();   // sync the dropdown to the loaded convo's link
    setTimeout(() => {
      const ta = document.getElementById('ai-textarea');
      if (ta) ta.focus();
      chat.scrollTop = chat.scrollHeight;
    }, 50);
  } catch (err) {
    alert(err.message || 'Gagal memuat perbualan.');
  }
}

// Start a fresh conversation (does NOT save until first message is sent).
// A new conversation always starts with NO linked system, so describing a
// system creates a brand-new one — it never silently overwrites whatever
// system the previous conversation was editing.
function aiStartNewConversation() {
  aiCurrentConvoId = null;
  aiConversation = [];
  aiCurrentPayload = null;
  aiModalState = 'idle';
  // Reset the system link so a new chat = "cipta baharu" (blank).
  aiLinkedSystemKod = null;
  window.aiPendingPayload = null;

  const chat = document.getElementById('ai-chat-area');
  chat.innerHTML = '';
  document.getElementById('ai-input-area').style.display = 'flex';
  document.getElementById('ai-done-actions')?.classList.remove('show');
  document.getElementById('ai-send-btn').disabled = false;
  document.getElementById('ai-textarea').value = '';
  document.getElementById('ai-header-sub').textContent = 'Perbualan baharu';

  // Welcome bubble — text depends on the chatbox mode.
  if (aiChatMode === 'review') {
    // The audit runs automatically when the modal opens (see openAIModal → aiAutoRunReview).
    addAIBubble('Selamat datang! Saya akan menyemak kelengkapan semua sistem anda sekarang — bahagian yang sudah lengkap dan yang belum.');
  } else {
    addAIBubble('Selamat datang! Saya boleh menganalisis penerangan sistem anda dan mengisi semua data secara automatik — Kos FPA (Fungsi Data + Fungsi Transaksi).\n\nSila taip atau tampal penerangan sistem anda di bawah. Saya akan tanya soalan susulan jika perlu.');
  }

  aiRefreshSidebar();
  aiRefreshSystemDropdown();
  setTimeout(() => document.getElementById('ai-textarea').focus(), 50);
}

async function aiDeleteConversation(id) {
  if (!confirm('Padam perbualan ini? Tindakan ini tidak boleh dibatalkan.')) return;
  const ok = await aiApiDeleteConvo(id);
  if (!ok) { alert('Gagal memadam perbualan.'); return; }
  if (aiCurrentConvoId === id) aiStartNewConversation();
  else aiRefreshSidebar();
}

// Ensure we have a conversation row before saving any message.
// Auto-titles from the first user message (truncated). Persists the
// currently-selected system link onto the new conversation.
async function aiEnsureConvoExists(firstMsgForTitle) {
  if (aiCurrentConvoId) return aiCurrentConvoId;
  if (!aiHasToken()) return null;
  try {
    const title = (firstMsgForTitle || 'Perbualan Baru').replace(/\s+/g, ' ').trim().slice(0, 60);
    const convo = await aiApiCreateConvo(title, aiLinkedSystemKod);
    aiCurrentConvoId = convo.id;
    aiRefreshSidebar();
    return aiCurrentConvoId;
  } catch (_) { return null; }
}

function setAIModalShellOpen(isOpen) {
  const overlay = document.getElementById('ai-modal-overlay');
  const gooBg   = document.getElementById('ai-goo-bg');
  const gooContent = document.getElementById('ai-goo-content');
  const card = document.getElementById('ai-modal-card');

  overlay?.classList.toggle('active', isOpen);
  gooContent?.classList.toggle('open', isOpen);
  card?.classList.toggle('active', isOpen);
  document.body.classList.toggle('ai-modal-is-open', isOpen);

  clearTimeout(aiModalCloseTimer);
  if (isOpen) {
    window.aiModalSourceButton?.classList.add('is-active', 'ai-pill-morphing');
    gooBg?.classList.add('visible');
    requestAnimationFrame(() => gooBg?.classList.add('open'));
  } else {
    gooBg?.classList.remove('open');
    // Hide the goo layer AS the shrink lands (close transition = 0.5s) so the
    // dark blob never sits frozen over the real pill button.
    aiModalCloseTimer = setTimeout(() => {
      gooBg?.classList.remove('visible');
      const sourceBtn = window.aiModalSourceButton;
      if (sourceBtn) {
        sourceBtn.classList.remove('ai-pill-morphing', 'is-active');
        sourceBtn.classList.add('ai-pill-rebound');
        setTimeout(() => sourceBtn.classList.remove('ai-pill-rebound'), 720);
      }
    }, 440);
  }
}

// Adjust the modal chrome to the current chatbox mode:
//   review   → "Sistem Didaftar" sidebar (systems list), no "Perbualan Baru"
//              button, and NO top-right system dropdown (the sidebar IS the
//              system picker).
//   estimate → "Sejarah Perbualan" sidebar + "Perbualan Baru" button + the
//              top-right system dropdown.
function aiApplySidebarMode() {
  const title  = document.getElementById('ai-sidebar-title');
  const newBtn = document.getElementById('ai-new-chat-btn');
  const sysDd  = document.getElementById('ai-system-link');   // top-right dropdown
  if (aiChatMode === 'review') {
    if (title)  title.textContent = 'Sistem Didaftar';
    if (newBtn) newBtn.style.display = 'none';
    if (sysDd)  sysDd.style.display = 'none';
  } else {
    if (title)  title.textContent = 'Sejarah Perbualan';
    if (newBtn) newBtn.style.display = '';
    if (sysDd)  sysDd.style.display = '';
  }
}

async function openAIModal(mode) {
  // mode: 'review' (Laman Utama completeness checker) or 'estimate' (default).
  aiChatMode = (mode === 'review') ? 'review' : 'estimate';
  aiApplySidebarMode();   // sidebar = systems list (review) or history (estimate)
  // Open the visual shell first. Chat/history setup below is allowed to fail
  // without blocking the user from seeing and closing the modal.
  setAIModalShellOpen(true);
  aiModalState = 'idle';

  try {
    // Reset chatbox state
    aiConversation = [];
    aiCurrentPayload = null;
    aiCurrentConvoId = null;
    document.getElementById('ai-chat-area').innerHTML = '';
    document.getElementById('ai-done-actions')?.classList.remove('show');
    const submitBtn = document.getElementById('ai-submit-laravel-btn');
    if (submitBtn) submitBtn.style.display = 'none';
    document.getElementById('ai-input-area').style.display = 'flex';
    document.getElementById('ai-send-btn').disabled = false;
    document.getElementById('ai-textarea').value = '';
    document.getElementById('ai-header-sub').textContent = 'Siap membantu anda';
    setParticles(false);

    // Populate the system dropdown from the currently-loaded systems.
    // Pre-select whichever system the user has open in Analisis Sistem right now
    // (so the AI immediately knows the context without an extra click).
    aiLinkedSystemKod = (window.currentSystemCode && window.systems && window.systems[window.currentSystemCode])
      ? window.currentSystemCode
      : null;
    aiRefreshSystemDropdown();
    if (aiLinkedSystemKod) {
      const sub = document.getElementById('ai-header-sub');
      if (sub) sub.textContent = `✦ Mengedit sistem ${aiLinkedSystemKod}`;
    }

    if (aiChatMode === 'review') {
      // Review mode: sidebar shows the systems list; always start a fresh
      // review chat (no per-conversation history, no estimation chips).
      await aiRefreshSidebar();          // renders the systems list
      aiStartNewConversation();
      // AUTO-RUN the completeness audit — the user shouldn't have to ask.
      setTimeout(aiAutoRunReview, 280);
    } else {
      // Estimate mode: sidebar = conversation history. Auto-open the most
      // recent convo, or show a fresh welcome screen with quick-start chips.
      await aiRefreshSidebar();
      if (aiConvoList.length > 0) {
        await aiSwitchConversation(aiConvoList[0].id);
      } else {
        aiStartNewConversation();
        const chips = document.createElement('div');
        chips.className = 'ai-chip-row';
        chips.id = 'ai-chips';
        ['Sistem pengurusan pelajar UTM', 'Platform e-dagang untuk SME', 'Sistem inventori hospital'].forEach(t => {
          const c = document.createElement('div');
          c.className = 'ai-chip';
          c.textContent = t;
          c.onclick = () => { document.getElementById('ai-textarea').value = t; chips.remove(); };
          chips.appendChild(c);
        });
        document.getElementById('ai-chat-area').appendChild(chips);
      }
    }
  } catch (err) {
    console.error('AI modal setup failed:', err);
    const chat = document.getElementById('ai-chat-area');
    if (chat && chat.children.length === 0) {
      addAIBubble('AI chatbox dibuka, tetapi sejarah perbualan tidak dapat dimuat. Anda masih boleh mula menaip di bawah.');
    }
  }

  // Background backend health check (non-blocking)
  aiBackendHealthCheck();
  setTimeout(() => document.getElementById('ai-textarea')?.focus(), 100);
}

async function aiBackendHealthCheck() {
  try {
    const r = await fetch(AI_BACKEND_URL + '/api/health');
    const d = await r.json();
    document.getElementById('ai-header-sub').textContent =
      d.laravel_configured ? 'Bersedia · Laravel disambung' : 'Bersedia · Laravel belum disambung';
  } catch (_) {
    document.getElementById('ai-header-sub').textContent = '⚠ Pelayan AI tidak dapat dihubungi (' + AI_BACKEND_URL + ')';
  }
}

function closeAIModal() {
  setAIModalShellOpen(false);
  setParticles(false);
  // Safety: stop the logo flow in case the modal was closed mid-request.
  aiSetGenerating(false);
}

// Quick close used when the modal is closed BECAUSE we are navigating to a
// different page (e.g. the "Pergi ke" section jumps). The normal close morphs
// back to the source pill — but mid-navigation that pill is gone/moved, so the
// box would shrink to a stale spot. Instead: fade + settle out in place.
function closeAIModalQuick() {
  const overlay = document.getElementById('ai-modal-overlay');
  const gooBg   = document.getElementById('ai-goo-bg');
  const gooContent = document.getElementById('ai-goo-content');
  const card = document.getElementById('ai-modal-card');

  clearTimeout(aiModalCloseTimer);

  // Freeze the goo panel where it is (keep .open so it doesn't morph) and
  // fade everything out in place.
  card?.classList.add('quick-close');
  gooBg?.classList.add('quick-fade');
  overlay?.classList.remove('active');
  document.body.classList.remove('ai-modal-is-open');

  // Source pill: just reset its state — no rebound (it's on another page now).
  window.aiModalSourceButton?.classList.remove('ai-pill-morphing', 'is-active', 'ai-pill-rebound');

  setParticles(false);
  aiSetGenerating(false);

  // After the fade completes, fully reset the shell to its closed state.
  aiModalCloseTimer = setTimeout(() => {
    gooBg?.classList.remove('open', 'visible', 'quick-fade');
    gooContent?.classList.remove('open');
    card?.classList.remove('active', 'quick-close');
  }, 340);
}

// keep old fn names working
function openAIPanel() { openAIModal('estimate'); }
function closeAIPanel() { closeAIModal(); }
// Laman Utama opener — runs the chatbox as a completeness checker.
function openAIReviewPanel() { openAIModal('review'); }

// Close only when the click lands on the backdrop itself, not on the modal
// card or any of its children (textarea, send button, chat bubbles, etc.).
document.getElementById('ai-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeAIModal();
});

// ── Markdown-lite → HTML formatter ───────────────────────────
// Used for AI conversational text so newlines, numbered lists,
// bullet lists, tables, and **bold** render properly inside the bubble.
//
// IMPORTANT: the AI frequently emits its 4-table estimation reply with NO
// blank lines between the heading and the table, or between sections. So we
// CANNOT rely on blank lines to separate blocks. Instead we walk the text
// line-by-line and start a new block whenever the line *type* changes
// (heading / table / list / paragraph). This makes rendering robust no matter
// how sloppily the model spaces its output.
function aiFormatMarkdown(raw) {
  if (raw == null) return '';

  // 1. Escape HTML entities first (everything in raw is treated as text).
  let s = String(raw)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // 2. Inline bold: **text**  (do this before line scanning).
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 3. Classify each line into a structural kind.
  const isHeading = (l) => /^\s*#{1,6}\s+/.test(l);
  const isSep     = (l) => /^\s*\|?[\s:|-]{3,}\|?\s*$/.test(l) && l.includes('-');
  const isTableLn = (l) => l.trim().startsWith('|');
  const isOlItem  = (l) => /^\s*\d+\.\s+/.test(l);
  const isUlItem  = (l) => /^\s*[-*]\s+/.test(l);

  const rawLines = s.split('\n');
  // A "table continuation" is a non-"|" line that follows table lines (the
  // wrapped-row case). We treat it as part of the current table block.
  const blocks = [];   // { kind: 'heading'|'table'|'ol'|'ul'|'p', lines: [] }
  let cur = null;
  const push = (kind, line) => {
    if (!cur || cur.kind !== kind) { cur = { kind, lines: [] }; blocks.push(cur); }
    cur.lines.push(line);
  };

  for (let i = 0; i < rawLines.length; i++) {
    const ln = rawLines[i];
    if (ln.trim() === '') { cur = null; continue; }   // blank line ends a block

    if (isHeading(ln)) { blocks.push({ kind: 'heading', lines: [ln] }); cur = null; continue; }

    // Table: a line starting with "|" begins/continues a table.
    if (isTableLn(ln) || isSep(ln)) { push('table', ln); continue; }

    // Wrapped continuation: when we are inside a table block, a non-"|" line
    // that still CONTAINS a "|" is a wrapped-row tail (the AI broke a cell like
    // "ILFL - low" onto a new line, so the tail is "- low | 1 | 6.5 | ..."").
    // This MUST be checked before the bullet-list test, because such a tail
    // often starts with "- ". A line with no "|" at all ends the table.
    if (cur && cur.kind === 'table' && ln.includes('|')) { cur.lines.push(ln); continue; }

    if (isOlItem(ln)) { push('ol', ln); continue; }
    if (isUlItem(ln)) { push('ul', ln); continue; }
    push('p', ln);
  }

  // 4. Render each block.
  const out = blocks.map(b => {
    if (b.kind === 'heading') {
      const level = (b.lines[0].match(/^\s*#+/) || ['#'])[0].trim().length;
      const text  = b.lines[0].replace(/^\s*#{1,6}\s+/, '').trim();
      const tag   = level <= 2 ? 'h4' : 'h5';
      return `<${tag} class="ai-md-heading">${text}</${tag}>`;
    }
    if (b.kind === 'table') {
      // Need at least a header + separator to be a real table.
      if (b.lines.length >= 2 && b.lines[0].includes('|') && isSep(b.lines[1])) {
        return aiRenderMdTable(b.lines);
      }
      // Not a valid table — fall back to paragraph so nothing is lost.
      return '<p>' + b.lines.join('<br>') + '</p>';
    }
    if (b.kind === 'ol') {
      return '<ol>' + b.lines.map(l => '<li>' + l.replace(/^\s*\d+\.\s+/, '') + '</li>').join('') + '</ol>';
    }
    if (b.kind === 'ul') {
      return '<ul>' + b.lines.map(l => '<li>' + l.replace(/^\s*[-*]\s+/, '') + '</li>').join('') + '</ul>';
    }
    return '<p>' + b.lines.join('<br>') + '</p>';
  }).join('');

  return out;
}

// Parse a GitHub-flavored markdown table into <table> HTML.
// The AI very often breaks ONE logical row across two physical lines because a
// component string like "ILFL - low" contains "- ", which it treats as the
// start of a markdown list. The break looks like:
//     | 1 | Pengguna | ILFL          <- line 1, no trailing "|"
//     - low | 1 | 6.5 | 7 | 7.5 |    <- line 2, starts with "- "
// The "- low" is really the TAIL of the "ILFL" cell, not a new column. So we
// must glue the part before the first "|" of line 2 onto the LAST cell of
// line 1 (with a space), and only the remaining "| ... |" parts are new cells.
function aiRenderMdTable(lines) {
  const splitRow = (raw) => {
    let row = raw.trim();
    if (row.startsWith('|')) row = row.slice(1);
    if (row.endsWith('|'))   row = row.slice(0, -1);
    return row.split('|').map(c => c.trim());
  };

  const headers = splitRow(lines[0]);
  const colCount = headers.length;

  // Merge continuation lines into the previous row.
  const body = lines.slice(2);
  const merged = [];
  for (const line of body) {
    const t = line.trim();
    // A continuation = a line that does NOT start with "|" and there is a row
    // to attach it to. (Covers "- low | ..." and plain "low | ..." both.)
    if (merged.length && !t.startsWith('|')) {
      // strip a leading list marker if present
      const cont = t.replace(/^[-*]\s+/, '');
      // The text before the first "|" belongs to the previous row's LAST cell.
      const firstPipe = cont.indexOf('|');
      const tail   = (firstPipe >= 0 ? cont.slice(0, firstPipe) : cont).trim();
      const rest   = firstPipe >= 0 ? cont.slice(firstPipe) : '';   // "| a | b |..."
      let prev = merged[merged.length - 1].replace(/\s*\|?\s*$/, '');
      if (tail) prev += ' ' + tail;          // glue onto last cell
      merged[merged.length - 1] = prev + rest;
    } else {
      merged.push(line);
    }
  }

  const bodyRows = merged.map(splitRow);

  const th = headers.map(h => `<th>${h}</th>`).join('');
  const trs = bodyRows.map(cells => {
    // Pad short rows so they don't break the grid
    while (cells.length < colCount) cells.push('');
    return '<tr>' + cells.slice(0, colCount).map(c => `<td>${c}</td>`).join('') + '</tr>';
  }).join('');

  return `<div class="ai-md-table-wrap"><table class="ai-md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

// Bubble appender. `content` is auto-classified:
//   • isUser = true            → escape, render as plain text (preserves newlines via CSS)
//   • content already has tags → pass through as HTML (result cards, error blocks)
//   • otherwise                → run through aiFormatMarkdown for nice formatting
// The FUSE AI infinity-ribbon logo (same as the "ASK AI" pill). Returned as
// an SVG string. Each call uses a UNIQUE gradient id so multiple logos on the
// page don't clash. Drop this into any round AI avatar instead of the ✦ glyph.
let aiRibbonSeq = 0;
function aiRibbonSvg() {
  const gid = 'ai-rib-' + (++aiRibbonSeq);
  return `
    <svg class="ai-logo-ribbon" viewBox="0 0 30 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="#fff"/>
          <stop offset="50%"  stop-color="#fae8ff"/>
          <stop offset="100%" stop-color="#fff"/>
        </linearGradient>
      </defs>
      <path class="ai-ribbon" stroke="url(#${gid})" stroke-width="5.5" stroke-linecap="round"
            d="M11 13 C11 6, 4 6, 4 13 C4 20, 11 20, 15 13 C19 6, 26 6, 26 13 C26 20, 19 20, 15 13"/>
    </svg>
  `;
}

// Wrap an avatar element in the FUSE AI ripple SVG so it has the flowing
// concentric rings around it. Used by both regular AI bubbles and the
// thinking-bubble. The .is-active class can be toggled externally to speed up.
function aiWrapWithRipple(avatarEl) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-ripple-wrap';
  wrap.innerHTML = `
    <svg class="ai-ripple" viewBox="0 0 60 60" aria-hidden="true">
      <path class="r1" d="M30,4 a26,26 0 1,1 -0.01,0"/>
      <path class="r2" d="M30,8 a22,22 0 1,1 -0.01,0"/>
      <path class="r3" d="M30,12 a18,18 0 1,1 -0.01,0"/>
      <path class="r4" d="M30,16 a14,14 0 1,1 -0.01,0"/>
    </svg>
  `;
  wrap.appendChild(avatarEl);
  return wrap;
}

function addAIBubble(content, isUser) {
  const area = document.getElementById('ai-chat-area');
  const wrap = document.createElement('div');
  wrap.className = 'ai-bubble-wrap' + (isUser ? ' user' : '');
  const av = document.createElement('div');
  av.className = 'ai-bubble-avatar ' + (isUser ? 'user-av' : 'ai-av');
  // User avatar = "ME" text; AI avatar = the FUSE infinity-ribbon logo.
  if (isUser) av.textContent = 'ME';
  else av.innerHTML = aiRibbonSvg();
  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble ' + (isUser ? 'user-msg' : 'ai-msg');

  if (isUser) {
    // textContent escapes automatically; CSS white-space:pre-wrap preserves newlines
    bubble.textContent = String(content);
  } else if (typeof content === 'string' && /<\w+[^>]*>/.test(content)) {
    // Pre-built HTML (result cards, validation errors with <ul>) — pass through
    bubble.innerHTML = content;
  } else {
    // Plain AI text or markdown — format it
    bubble.innerHTML = aiFormatMarkdown(content);
  }

  // Chat bubbles show just the logo (no ripple rings, no circle).
  wrap.appendChild(av);
  wrap.appendChild(bubble);
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
  return bubble;
}

// Toggle the flowing-logo animation. Kept separate from the thinking-bubble
// lifecycle so the logo keeps moving while the ANSWER is being rendered, and
// only stops once the whole exchange is finished.
function aiSetGenerating(on) {
  document.body.classList.toggle('ai-generating', !!on);
}

// The 4 phases shown in the estimate-mode progress tracker (matches the spec).
const AI_TRACE_STEPS = [
  { key: 'fpa',    label: 'FPA Analysis' },
  { key: 'agg',    label: 'Aggregation Detection' },
  { key: 'json',   label: 'JSON Formatter' },
  { key: 'result', label: 'Result Generation' },
];
// SVG icons per step (shown once a step is done; the active step shows a spinner).
const AI_TRACE_ICONS = {
  fpa:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  agg:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M12 7.4v4M12 11.4l-5 4.5M12 11.4l5 4.5"/></svg>',
  json:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2"/></svg>',
  result: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};
const AI_TRACE_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

let aiTraceIndex = 0;   // index of the currently-active step (driven by REAL stream)

// Build the stepper HTML with `activeIdx` active and earlier steps done.
function aiTraceHtml(activeIdx) {
  let steps = '';
  AI_TRACE_STEPS.forEach((s, i) => {
    const state = i < activeIdx ? 'done' : (i === activeIdx ? 'active' : 'pending');
    const inner = state === 'done'   ? AI_TRACE_CHECK
                : state === 'active' ? '<div class="ai-trace-spin"></div>'
                : AI_TRACE_ICONS[s.key];
    if (i > 0) {
      steps += `<div class="ai-trace-conn ${i <= activeIdx ? 'done' : ''}"></div>`;
    }
    steps += `
      <div class="ai-trace-step ${state}">
        <div class="ai-trace-dot">${inner}</div>
        <div class="ai-trace-label">${s.label}</div>
      </div>`;
  });
  return `
    <div class="ai-trace">
      <div class="ai-trace-title">Kami akan proseskan analisis berdasarkan FD dan FT.<br>Sila tunggu sebentar…</div>
      <div class="ai-trace-steps" id="ai-trace-steps">${steps}</div>
    </div>`;
}

// Skeleton placeholder shown inside the thinking bubble while the AI is
// composing the reply — a shimmering "the answer is coming, here's its rough
// shape" cue. Estimate mode hints at the 4 tables; review mode hints at the
// per-system status report.
function aiSkeletonHtml(mode) {
  const bar = (cls = '') => `<div class="ai-skel-bar ${cls}"></div>`;
  if (mode === 'estimate') {
    // Heading → "table" of rows × 4 — one per FPA section (FD, FT, VAF, Kos).
    const tableRows = (n) => Array.from({ length: n }, () => bar('w-95')).join('');
    return `
      <div class="ai-skeleton" aria-hidden="true">
        ${bar('heading')}
        <div class="ai-skel-table">${tableRows(3)}</div>
        ${bar('heading')}
        <div class="ai-skel-table">${tableRows(3)}</div>
      </div>`;
  }
  // review mode — paragraphs + a short status block.
  return `
    <div class="ai-skeleton" aria-hidden="true">
      ${bar('w-95')}
      ${bar('w-88')}
      ${bar('w-72')}
      <div class="ai-skel-table">${bar('w-95')}${bar('w-88')}${bar('w-72')}</div>
      ${bar('w-55')}
    </div>`;
}

function addThinkingBubble() {
  const area = document.getElementById('ai-chat-area');
  const wrap = document.createElement('div');
  wrap.className = 'ai-bubble-wrap';
  wrap.id = 'ai-thinking-wrap';
  const av = document.createElement('div');
  // .ai-thinking-av marks THIS logo as the one currently generating — only it
  // animates. No ripple rings: just the bare logo.
  av.className = 'ai-bubble-avatar ai-av ai-thinking-av';
  av.innerHTML = aiRibbonSvg();
  const inner = document.createElement('div');
  inner.className = 'ai-bubble ai-msg';

  if (aiChatMode === 'review') {
    // Review mode: dots label + skeleton hinting at the per-system report.
    inner.innerHTML =
      '<div class="ai-thinking-dots"><span></span><span></span><span></span></div>'
      + '<div class="ai-thinking-label" id="ai-thinking-label">Menyemak kelengkapan sistem…</div>'
      + aiSkeletonHtml('review');
  } else {
    // Estimate mode: 4-step progress tracker + skeleton hinting at the tables.
    // Steps are driven by the REAL token stream (see aiTraceProgressFromText).
    aiTraceIndex = 0;
    inner.innerHTML = aiTraceHtml(aiTraceIndex) + aiSkeletonHtml('estimate');
  }
  wrap.appendChild(av);
  wrap.appendChild(inner);
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

// Re-render just the steps row inside the live thinking bubble.
function aiRenderTrace() {
  const steps = document.getElementById('ai-trace-steps');
  if (!steps) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = aiTraceHtml(aiTraceIndex);
  const fresh = tmp.querySelector('#ai-trace-steps');
  if (fresh) steps.replaceWith(fresh);
}

// Move the active step forward to `idx` (never backwards). Re-renders.
function aiTraceSetStep(idx) {
  if (idx <= aiTraceIndex) return;
  aiTraceIndex = idx;
  aiRenderTrace();
}

// Map the REAL accumulated stream text to a progress step. The AI emits the
// reply in a fixed order (FD table → FT table → VAF → Penganggaran Kos → ```json),
// so the presence of those markers tells us genuinely how far it has got:
//   step 0 FPA Analysis        — streaming has begun (FD section)
//   step 1 Aggregation Detection — FT section started (## Fungsi Transaksi)
//   step 2 JSON Formatter       — the ```json block started
//   step 3 Result Generation    — only on the final 'done' event (aiFinishTrace)
function aiTraceProgressFromText(text) {
  if (aiChatMode !== 'estimate') return;
  const hasJson = /```json/i.test(text) || /"(FT_Sistem|FD_Sistem|VAF)"\s*:/.test(text);
  const hasFT   = /##\s*Fungsi\s*Transaksi/i.test(text);
  if (hasJson)      aiTraceSetStep(2);   // JSON Formatter
  else if (hasFT)   aiTraceSetStep(1);   // Aggregation Detection
  // else stays at step 0 (FPA Analysis)
}

// Mark all 4 steps complete — called when the estimate reply has fully arrived.
function aiFinishTrace() {
  aiTraceIndex = AI_TRACE_STEPS.length; // past the last → all done
  aiRenderTrace();
}

function removeThinkingBubble() {
  const el = document.getElementById('ai-thinking-wrap');
  if (el) el.remove();
}

function setParticles(on) {
  const c = document.getElementById('ai-particles');
  c.innerHTML = '';
  if (!on) return;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'ai-particle';
    const sz = 3 + Math.random() * 5;
    p.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;opacity:${0.3+Math.random()*0.5};animation-duration:${3+Math.random()*4}s;animation-delay:${Math.random()*2}s;`;
    c.appendChild(p);
  }
}

const thinkingLabels = [
  'Menganalisis sistem anda…',
  'Mengenal pasti fungsi transaksi…',
  'Mengira kompleksiti FPA…',
  'Menjana kos pengurusan…',
  'Menganggar kos perkakasan…',
  'Menyediakan laporan…',
];

// Strip the JSON payload from displayed text — the user must NEVER see raw JSON.
// The AI is supposed to fence it in ```json ... ``` but often gets it wrong:
//   • emits a bare { ... } with no fences,
//   • forgets the closing ``` ,
//   • gets cut off mid-JSON when the response hits max_tokens.
// So we strip in three passes, strongest cut wins.
function aiStripJsonBlock(text) {
  let s = String(text || '');

  // Pass 1: properly fenced ```json ... ``` blocks.
  s = s.replace(/```json\s*[\s\S]*?```/gi, '');

  // Pass 2: a fence that was opened but never closed (truncated response).
  s = s.replace(/```json[\s\S]*$/i, '');

  // Pass 3: an UNFENCED payload. Our payload is a top-level object containing
  // the tell-tale keys. Find the first "{" that is followed (anywhere after it)
  // by one of those keys, and cut everything from that "{" onward.
  const payloadKey = /"(FT_Sistem|FD_Sistem|VAF|user_id)"\s*:/;
  let cutAt = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    if (payloadKey.test(s.slice(i, i + 1200))) { cutAt = i; break; }
  }
  if (cutAt >= 0) s = s.slice(0, cutAt);

  // Tidy up: drop a dangling ``` or "json" label left behind, trim trailing
  // whitespace/separators.
  s = s.replace(/```/g, '').replace(/^\s*json\s*$/gim, '');
  return s.replace(/[\s\-—=]+$/g, '').trim();
}

// Extract the JSON payload object from a stored assistant message. The backend
// does this server-side for live replies, but when we REPLAY chat history we
// only have the raw text — so we re-parse it here. Mirrors backend extractJson
// + repairJsonString (collapses raw newlines inside string values).
function aiExtractPayloadFromText(text) {
  const repair = (raw) => {
    let out = '', inStr = false, escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (inStr && (ch === '\n' || ch === '\r' || ch === '\t')) {
        if (!out.endsWith(' ') && !out.endsWith('"')) out += ' ';
        continue;
      }
      out += ch;
    }
    return out;
  };
  const tryParse = (c) => {
    const t = String(c).trim();
    try { return JSON.parse(t); } catch (_) {}
    try { return JSON.parse(repair(t)); } catch (_) {}
    return null;
  };
  const str = String(text || '');
  const fenced = str.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) { const p = tryParse(fenced[1]); if (p) return p; }
  const start = str.indexOf('{');
  const end = str.lastIndexOf('}');
  if (start >= 0 && end > start) { const p = tryParse(str.slice(start, end + 1)); if (p) return p; }
  return null;
}

// Append a card (apply / go-to-FPA) INTO an existing AI bubble, so it sits
// directly under the table instead of becoming a separate chat message.
// Falls back to a standalone bubble if no bubble element was given.
function aiAppendCardToBubble(bubbleEl, html) {
  if (bubbleEl && bubbleEl.insertAdjacentHTML) {
    bubbleEl.insertAdjacentHTML('beforeend', html);
    const area = document.getElementById('ai-chat-area');
    if (area) area.scrollTop = area.scrollHeight;
  } else {
    addAIBubble(html);
  }
}

// The green "MASUKKAN KE DALAM SISTEM" card. Built in one place so the live
// reply path AND the history-replay path render an identical button.
// The button passes its own card (the closest .ai-result-card) to
// applyAiPayload so that, after a click, THAT card is swapped in place for a
// "go to Kos FPA" navigation card.
function aiApplyButtonHtml() {
  return `
    <div class="ai-result-card ai-apply-card" style="border: 1px solid #10b981; background: rgba(16,185,129,0.05); margin-top: 15px;">
      <div class="result-title" style="color: #10b981; margin-bottom: 8px;">✓ Data sedia untuk dimasukkan</div>
      <p style="font-size: 13px; color: #d1d5db; margin: 0 0 15px 0; line-height: 1.4;">Sila semak jadual di atas. Jika anda berpuas hati, klik butang di bawah untuk memasukkan data ke dalam sistem FUSE-AI.</p>
      <button onclick="window.applyAiPayload(this.closest('.ai-apply-card'))" style="background: #10b981; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; font-family: 'Inter', sans-serif; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(16,185,129,0.2); transition: 0.2s;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        MASUKKAN KE DALAM SISTEM
      </button>
    </div>
  `;
}

// The card that REPLACES the apply card after a successful insert: it now
// offers a button that jumps straight to the Kos FPA page for `kod`.
function aiGoToSystemCardHtml(kod, nama) {
  const label = nama ? `${nama} (${kod})` : kod;
  return `
    <div class="ai-result-card" style="border: 1px solid #10b981; background: rgba(16,185,129,0.08); margin-top: 15px;">
      <div class="result-title" style="color: #10b981; margin-bottom: 8px;">✓ Data telah dimasukkan ke ${escapeHtml(label)}</div>
      <p style="font-size: 13px; color: #d1d5db; margin: 0 0 15px 0; line-height: 1.4;">Anda boleh terus ke halaman Kos FPA untuk menyemak dan mengemaskini data sistem ini.</p>
      <button onclick="window.aiGoToKosFpa('${escapeHtml(kod)}')" style="background: #10b981; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; font-family: 'Inter', sans-serif; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(16,185,129,0.2); transition: 0.2s;">
        PERGI KE KOS FPA
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  `;
}

// Close the AI modal and navigate the main app to the Kos FPA page for `kod`.
window.aiGoToKosFpa = function(kod) {
  // Use the app's setter — writing window.currentSystemCode directly does NOT
  // update the block-scoped `currentSystemCode` that switchMainPage() reads,
  // so the FPA page would reject navigation ("Sila pilih sistem...").
  if (typeof window.setCurrentSystemCode === 'function') {
    window.setCurrentSystemCode(kod);
  } else if (kod && window.systems && window.systems[kod]) {
    window.currentSystemCode = kod;   // fallback (older app.js)
  }
  closeAIModalQuick();   // in-place fade — we're navigating away from the pill's page
  // switchMainPage('fpa') needs currentSystemCode set; switchSection mirrors
  // what the "Kos FPA" sidebar item does.
  if (typeof switchMainPage === 'function') switchMainPage('fpa');
  if (typeof switchSection === 'function') switchSection('analisis');
  // switchMainPage('fpa') defaults to the Fungsi Transaksi tab. We want the
  // user to start on Fungsi Data (the first tab), so switch to it explicitly.
  if (typeof switchPage === 'function') switchPage('page-data');
};

// Close the AI modal and jump straight to a specific MODULE/section of a system,
// so from a Semak AI report the user can go directly to the part that needs work
// without closing the chat and navigating back manually.
//   section: 'fd' | 'ft' | 'vaf' | 'kos'   (kos = Kos Pengurusan)
window.aiGoToSection = function(kod, section) {
  // Make `kod` the active system (via the app's setter, not a raw write).
  if (typeof window.setCurrentSystemCode === 'function') {
    window.setCurrentSystemCode(kod);
  } else if (kod && window.systems && window.systems[kod]) {
    window.currentSystemCode = kod;
  }
  // Fade out in place — the pill-morph close would shrink toward a button on
  // the page we're leaving (it lands in a "strange place" mid-navigation).
  closeAIModalQuick();
  if (typeof switchSection === 'function') switchSection('analisis');

  // FD / FT / VAF all live under the FPA page (tabbed); Kos Pengurusan is its
  // own main page.
  if (section === 'kos') {
    if (typeof switchMainPage === 'function') switchMainPage('pengurusan');
    return;
  }
  if (typeof switchMainPage === 'function') switchMainPage('fpa');
  const tab = { fd: 'page-data', ft: 'page-trans', vaf: 'page-vaf' }[section] || 'page-data';
  if (typeof switchPage === 'function') switchPage(tab);
};

// Map the chatbox backend payload to a FUSE AI v2 system entry and inject it into `systems`.
// Backend payload shape:
//   { nama, keterangan, FT_Sistem:[{macroproses,general_proses,aggregat,komponen,ft_multiplier,keterangan,...}],
//                       FD_Sistem:[{entiti,aggregat,komponen,fd_multiplier,keterangan,...}] }
function aiApplyPayloadToSystems(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // If the chat is linked to an existing system, REUSE that kod and keep
  // its existing metadata (nama, keterangan). Otherwise, fall back to the
  // old behavior: create a fresh system from the payload.
  let kod, nama, keterangan, sys;
  if (aiLinkedSystemKod && systems[aiLinkedSystemKod]) {
    kod        = aiLinkedSystemKod;
    nama       = systems[kod].nama;
    keterangan = systems[kod].keterangan || '';
    sys        = systems[kod];                  // mutate in place
    // Wipe the modules the AI is about to fill, so we don't accumulate duplicates.
    sys.fungsiTrans = [];
    sys.fungsiData  = [];
  } else {
    nama       = payload.nama || 'Sistem AI';
    keterangan = payload.keterangan || '';
    kod        = aiGenerateKodFromName(nama);
    sys        = createEmptySystem(kod, nama, keterangan);
  }

  // Trans aggregat options live in buildTransRowHtml: 'Pilih', '1 - Amat Terperinci',
  // '2 - Terperinci', '3 - Kurang Perincian', '4 - Tiada Perincian'
  const transAggMap = {
    1: '1 - Amat Terperinci',
    2: '2 - Terperinci',
    3: '3 - Kurang Perincian',
    4: '4 - Tiada Perincian'
  };
  // Data aggregat options live in buildDataRowHtml: 'Pilih', '1 - Amat Terperinci',
  // '2 - Kurang Perincian', '3 - Tiada Perincian'  (data only has 3 levels, no "Terperinci")
  const dataAggMap = {
    1: '1 - Amat Terperinci',
    2: '2 - Kurang Perincian',
    3: '3 - Tiada Perincian'
  };

  // Collapse any stray newline/tab the AI may have left inside a string value
  // into a single space — keeps komponen matching ("EIA", "ILFM") working and
  // avoids ugly multi-line cells.
  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  if (Array.isArray(payload.FT_Sistem)) {
    sys.fungsiTrans = payload.FT_Sistem.map(ft => ({
      makro: clean(ft.macroproses),
      general: clean(ft.general_proses),
      aggregat: transAggMap[ft.aggregat] || 'Pilih',
      // komponen string from ref table (e.g. "EI - Average (EIA)") — substring 'EIA'
      // is what recalculateTotals() / updateFinalReport() look for, so this works as-is.
      komponen: clean(ft.komponen),
      gandaan: String(ft.ft_multiplier || 1),
      catatan: clean(ft.keterangan),
      saved: true
    }));
  }

  if (Array.isArray(payload.FD_Sistem)) {
    sys.fungsiData = payload.FD_Sistem.map(fd => ({
      entiti: clean(fd.entiti),
      aggregat: dataAggMap[fd.aggregat] || 'Pilih',
      komponen: clean(fd.komponen),
      gandaan: String(fd.fd_multiplier || 1),
      catatan: clean(fd.keterangan),
      saved: true
    }));
  }

  // VAF — array of exactly 14 integers in [0,5], one per GSC.
  // Backend now generates these; clamp/coerce defensively in case of weird AI output.
  let vafCount = 0;
  if (Array.isArray(payload.VAF) && payload.VAF.length === 14) {
    sys.vaf = payload.VAF.map(v => {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
      return 0;
    });
    vafCount = sys.vaf.filter(v => v > 0).length;
  }

  systems[kod] = sys;
  // Use the app's setter so its block-scoped currentSystemCode is updated too
  // (a bare assignment here only creates a stray global, not the app's var).
  if (typeof window.setCurrentSystemCode === 'function') window.setCurrentSystemCode(kod);
  else currentSystemCode = kod;
  if (typeof renderSenaraiTable === 'function') renderSenaraiTable();
  // Persist to the backend — WITHOUT this the AI-created system lives only in
  // memory and is lost on reload. fuseSaveSystemsNow skips the DOM-persist step
  // so it can't overwrite the data we just injected with stale page DOM.
  if (typeof window.fuseSaveSystemsNow === 'function') {
    window.fuseSaveSystemsNow();
  } else if (typeof window.fuseScheduleSave === 'function') {
    window.fuseScheduleSave(0);   // fallback (older auth.js)
  }
  return {
    kod, nama,
    ftCount: (payload.FT_Sistem || []).length,
    fdCount: (payload.FD_Sistem || []).length,
    vafCount: vafCount,
    vafFilled: Array.isArray(payload.VAF) && payload.VAF.length === 14
  };
}

// Pick a 3–5 letter uppercase code from the system name; ensure uniqueness against `systems`.
function aiGenerateKodFromName(nama) {
  const words = String(nama).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  let base = words.length >= 2
    ? words.slice(0, 4).map(w => w[0]).join('')
    : (words[0] || 'AI').slice(0, 4);
  if (base.length < 3) base = (base + 'SYS').slice(0, 3);
  if (base.length > 5) base = base.slice(0, 5);
  if (!systems[base]) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = (base + i).slice(0, 5);
    if (!systems[candidate]) return candidate;
  }
  return base + Date.now().toString().slice(-3);
}

// When the SEMAK AI chatbox opens, DON'T audit immediately. Instead greet the
// user and let them pick which system to review from the sidebar first.
function aiAutoRunReview() {
  if (aiChatMode !== 'review') return;
  if (aiModalState === 'thinking') return;

  const list = Object.values(window.systems || {});
  if (!list.length) {
    addAIBubble('Belum ada sistem didaftarkan untuk disemak. Sila daftarkan sekurang-kurangnya satu sistem di **Analisis Sistem**, kemudian buka semula SEMAK AI.');
    document.getElementById('ai-header-sub').textContent = 'Tiada sistem untuk disemak';
    return;
  }

  // Greeting + clickable chooser so the user selects a system before any audit.
  aiRenderReviewChooser(list);
  document.getElementById('ai-header-sub').textContent = 'Pilih sistem untuk disemak';
}

// Render a "choose a system" prompt inside the chat: a short message plus one
// clickable chip per system (and an "All systems" option). Clicking a chip runs
// the review for that scope — the same path as clicking the sidebar item.
function aiRenderReviewChooser(list) {
  addAIBubble('Sila pilih sistem yang anda mahu saya semak kelengkapannya. Klik salah satu di bawah, atau pilih dari senarai sistem di sebelah kiri.');

  const body = document.getElementById('ai-chat-area');
  if (!body) return;

  const wrap = document.createElement('div');
  wrap.className = 'ai-chip-row';
  wrap.id = 'ai-review-chooser';

  list.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'ai-chip';
    chip.innerHTML = `<strong>${escapeHtml(s.kod)}</strong> · ${escapeHtml(s.nama || '(tiada nama)')}`;
    chip.onclick = () => {
      document.getElementById('ai-review-chooser')?.remove();
      aiFocusReviewSystem(s.kod);   // focuses + runs review for THIS system only
    };
    wrap.appendChild(chip);
  });

  // "All systems" option — review everything at once.
  if (list.length > 1) {
    const allChip = document.createElement('div');
    allChip.className = 'ai-chip';
    allChip.style.cssText = 'background:#3d3175; color:#e9d5ff; font-weight:600;';
    allChip.textContent = '📋 Semak SEMUA sistem';
    allChip.onclick = () => {
      document.getElementById('ai-review-chooser')?.remove();
      aiRunReviewAllSystems();
    };
    wrap.appendChild(allChip);
  }

  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}

// Make the section rows in the LAST review report clickable. We scan every
// table row in the most-recent AI bubble; if a row's first cell names a known
// section (Fungsi Data / Transaksi / VAF / Kos Pengurusan), we tag it so that
// hovering reveals a "Pergi ke →" link that jumps straight to that page.
function aiAttachRowJumpsToLastReport(kod) {
  const area = document.getElementById('ai-chat-area');
  if (!area) return;
  // The report is the last AI bubble we just appended.
  const bubbles = area.querySelectorAll('.ai-bubble.ai-msg');
  const last = bubbles[bubbles.length - 1];
  if (!last) return;

  // Map a section to the text patterns that identify its row.
  const SECTION_MATCHERS = [
    { sec: 'fd',  re: /fungsi\s*data|\bFD\b/i },
    { sec: 'ft',  re: /fungsi\s*transaksi|\bFT\b/i },
    { sec: 'vaf', re: /\bVAF\b|general\s*system|gsc/i },
    { sec: 'kos', re: /kos\s*pengurusan|pengurusan/i },
  ];

  const SECTION_NAMES = { fd: 'Fungsi Data', ft: 'Fungsi Transaksi', vaf: 'Konfigurasi VAF', kos: 'Kos Pengurusan' };

  last.querySelectorAll('table.ai-md-table tbody tr').forEach(tr => {
    const firstCell = tr.querySelector('td');
    if (!firstCell) return;
    const label = firstCell.textContent || '';
    const match = SECTION_MATCHERS.find(m => m.re.test(label));
    if (!match) return;

    tr.classList.add('ai-jump-row');
    tr.addEventListener('click', () => window.aiGoToSection(kod, match.sec));

    // Floating "Pergi ke <section> →" popup that follows the cursor on hover.
    const tipText = `Pergi ke ${SECTION_NAMES[match.sec]} →`;
    tr.addEventListener('mouseenter', () => aiShowJumpTip(tipText));
    tr.addEventListener('mousemove',  (e) => aiMoveJumpTip(e.clientX, e.clientY));
    tr.addEventListener('mouseleave', () => aiHideJumpTip());
  });
}

// ---- Floating jump tooltip (a single reusable element) -----------------
let aiJumpTipEl = null;
function aiEnsureJumpTip() {
  if (aiJumpTipEl) return aiJumpTipEl;
  aiJumpTipEl = document.createElement('div');
  aiJumpTipEl.className = 'ai-jump-tip';
  document.body.appendChild(aiJumpTipEl);
  return aiJumpTipEl;
}
function aiShowJumpTip(text) {
  const el = aiEnsureJumpTip();
  el.textContent = text;
  el.classList.add('show');
}
function aiMoveJumpTip(x, y) {
  const el = aiEnsureJumpTip();
  // Offset a little up/right of the cursor so it doesn't sit under the pointer.
  el.style.left = (x + 14) + 'px';
  el.style.top  = (y - 10) + 'px';
}
function aiHideJumpTip() {
  if (aiJumpTipEl) aiJumpTipEl.classList.remove('show');
}

// Run the completeness audit for ALL systems (the previous default behaviour),
// now only when the user explicitly chooses it.
function aiRunReviewAllSystems() {
  if (aiModalState === 'thinking') return;
  aiLinkedSystemKod = null;            // no focus = all systems
  aiRenderSystemsSidebar();
  const autoMsg = 'Sila semak kelengkapan SEMUA sistem yang telah didaftarkan, dan laporkan bahagian yang sudah lengkap dan yang belum bagi setiap sistem.';
  aiConversation.push({ role: 'user', content: autoMsg });
  sendAIEstimate(autoMsg);
}

// Build a plain-text snapshot of the user's systems, for the review-mode
// completeness audit. The AI reads this to judge how complete each system is.
// If `onlyKod` is given (a system focused in the sidebar), the snapshot — and
// the AI's report — covers ONLY that system. Otherwise it covers ALL systems.
function aiBuildAllSystemsContext(onlyKod = null) {
  const all = Object.values(window.systems || {});
  const list = (onlyKod && window.systems && window.systems[onlyKod])
    ? [window.systems[onlyKod]]
    : all;
  if (!list.length) {
    return `[KONTEKS — pengguna belum mendaftar sebarang sistem. Tiada sistem untuk disemak.]`;
  }
  const blocks = list.map(s => {
    const fdRows  = (s.fungsiData  || []).filter(r => r && r.komponen);
    const ftRows  = (s.fungsiTrans || []).filter(r => r && r.komponen);
    const vafArr  = (s.vaf && s.vaf.length === 14) ? s.vaf : new Array(14).fill(0);
    const vafSet  = vafArr.some(v => Number(v) > 0);
    const pengRows = (s.pengurusan || []).filter(r => r && (Number(r.harga) > 0 || r.checked));
    return `--- SISTEM ---
KOD: ${s.kod}
NAMA: ${s.nama || '(tiada nama)'}
KETERANGAN: ${s.keterangan ? s.keterangan : '(KOSONG)'}
Fungsi Data (FD): ${fdRows.length} entri ${fdRows.length ? 'didaftarkan' : '(KOSONG)'}
Fungsi Transaksi (FT): ${ftRows.length} entri ${ftRows.length ? 'didaftarkan' : '(KOSONG)'}
Konfigurasi VAF: ${vafSet ? 'sudah ditetapkan' : 'semua nilai 0 (KOSONG)'}
Kos Pengurusan: ${pengRows.length} item ${pengRows.length ? 'didaftarkan' : '(KOSONG)'}`;
  }).join('\n\n');

  const scope = (onlyKod && window.systems && window.systems[onlyKod])
    ? `HANYA sistem ${onlyKod} (${window.systems[onlyKod].nama || 'tiada nama'}) — pengguna sedang fokus pada sistem ini sahaja. Semak DAN laporkan SISTEM INI SAHAJA; JANGAN sebut atau semak sistem lain.`
    : `SEMUA sistem yang telah didaftarkan pengguna. Semak kelengkapan setiap satu.`;

  return `[KONTEKS SISTEM — berikut adalah ${scope} Berdasarkan data sebenar ini. JANGAN minta pengguna terangkan sistem baharu.

${blocks}

ARAHAN: Hasilkan laporan kelengkapan untuk ${onlyKod ? `sistem ${onlyKod} sahaja` : 'setiap sistem di atas'} mengikut format yang ditetapkan.]`;
}

// POST to /api/chat with streaming. Reads the SSE stream, calls onProgress with
// the accumulated text after each chunk (so the caller can drive a real-time
// progress tracker), and resolves with the final result:
//   { ok, reply, payload, validation, truncated }  — or { ok:false, error }.
// Falls back gracefully if the server/stream errors.
async function aiStreamChat(messages, mode, onProgress) {
  let r;
  try {
    r = await fetch(AI_BACKEND_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, mode, stream: true }),
    });
  } catch (e) {
    return { ok: false, error: 'Tidak dapat hubungi pelayan AI.' };
  }
  if (!r.ok) {
    let msg = 'Ralat pelayan AI.';
    try { const j = await r.json(); msg = j.error || msg; } catch (_) {}
    return { ok: false, error: msg };
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let acc = '';                 // accumulated reply text
  let done = null;              // the final {reply,payload,...} from the 'done' event

  // Parse one SSE block ("event: X\ndata: {...}").
  const handleBlock = (block) => {
    const evMatch = block.match(/^event:\s*(.+)$/m);
    const dataMatch = block.match(/^data:\s*([\s\S]*)$/m);
    if (!dataMatch) return;
    let payload; try { payload = JSON.parse(dataMatch[1]); } catch (_) { return; }
    const ev = evMatch ? evMatch[1].trim() : 'message';
    if (ev === 'delta' && payload.text) {
      acc += payload.text;
      if (onProgress) { try { onProgress(acc); } catch (_) {} }
    } else if (ev === 'done') {
      done = payload;
    } else if (ev === 'error') {
      done = { error: payload.error };
    }
  };

  try {
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });
      // SSE blocks are separated by a blank line.
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (block.trim()) handleBlock(block);
      }
    }
    if (buf.trim()) handleBlock(buf);   // flush any trailing block
  } catch (e) {
    return { ok: false, error: 'Sambungan strim AI terputus.' };
  }

  if (done && done.error) return { ok: false, error: done.error };
  if (done) return { ok: true, ...done };
  // Stream ended without a 'done' event — fall back to whatever text we got.
  return { ok: true, reply: acc.trim(), payload: null, validation: null, truncated: false };
}

// `injectedMsg` is set by aiRedirectToGenerate (which already pushed the message
// into aiConversation and rendered its bubble). When present, we skip reading the
// textarea and skip re-adding the bubble — we just fire the API call.
async function sendAIEstimate(injectedMsg) {
  if (aiModalState === 'thinking') return;
  const ta = document.getElementById('ai-textarea');
  const isRetry = typeof injectedMsg === 'string' && injectedMsg.length > 0;
  const msg = isRetry ? injectedMsg : ta.value.trim();
  if (!msg) return;

  // A genuine user-typed send starts a fresh task — allow one essay-retry
  // and one truncation-retry again.
  if (!isRetry) {
    window.aiEssayRetryDone = false;
    window.aiTruncRetryDone = false;
  }

  // Re-sync the dropdown right before sending. Catches newly-added systems,
  // renamed systems, or deletions that happened while the chat was open.
  aiRefreshSystemDropdown();

  // remove chips on first send
  const chips = document.getElementById('ai-chips');
  if (chips) chips.remove();

  document.getElementById('ai-send-btn').disabled = true;
  aiModalState = 'thinking';
  aiSetGenerating(true);   // logo flows while processing + answering

  if (!isRetry) {
    // Normal send: clear the textarea, render the user bubble, push to history.
    ta.value = '';
    // Shrink back to one-row height. Use the explicit min-height (not 'auto')
    // so the CSS height transition animates the shrink smoothly.
    ta.style.height = '42px';
    addAIBubble(msg, true);
    aiConversation.push({ role: 'user', content: msg });
  }
  // (On retry, aiRedirectToGenerate has already done the bubble + history push.)
  // Persist: ensure a server-side conversation exists, then save the message.
  // On retry the message was already persisted by aiRedirectToGenerate.
  if (!isRetry) {
    (async () => {
      const cid = await aiEnsureConvoExists(msg);
      if (cid) aiApiAppendMessage(cid, 'user', msg);
    })();
  }
  addThinkingBubble();
  setParticles(true);
  document.getElementById('ai-header-sub').textContent = 'Sedang berfikir…';

  // Review mode keeps the rotating label; estimate mode uses the live trace.
  let labelTimer = null;
  if (aiChatMode === 'review') {
    let labelIdx = 0;
    labelTimer = setInterval(() => {
      const lbl = document.getElementById('ai-thinking-label');
      if (lbl) { labelIdx = (labelIdx + 1) % thinkingLabels.length; lbl.textContent = thinkingLabels[labelIdx]; }
    }, 1800);
  }

  try {
    // If a system is linked, prepend a synthetic context note as the first
    // user message so the AI knows which kod/nama/keterangan to keep using.
    // This message is NOT persisted to chat_messages — it's only sent to the API.
    const messagesToSend = [...aiConversation];

    // REVIEW MODE: inject a snapshot so the AI can audit. If a system is focused
    // in the sidebar, only that one is included; otherwise all systems.
    if (aiChatMode === 'review') {
      const focusKod = (aiLinkedSystemKod && window.systems && window.systems[aiLinkedSystemKod])
        ? aiLinkedSystemKod : null;
      messagesToSend.unshift({ role: 'user', content: aiBuildAllSystemsContext(focusKod) });
      messagesToSend.splice(1, 0, {
        role: 'assistant',
        content: focusKod
          ? `Faham — saya akan semak kelengkapan sistem ${focusKod} sahaja.`
          : 'Faham — saya akan semak kelengkapan semua sistem yang didaftarkan.'
      });
    } else if (aiLinkedSystemKod && window.systems && window.systems[aiLinkedSystemKod]) {
      const s = window.systems[aiLinkedSystemKod];
      const fdRows  = (s.fungsiData  || []).filter(r => r && r.komponen);
      const ftRows  = (s.fungsiTrans || []).filter(r => r && r.komponen);
      const vafArr  = (s.vaf && s.vaf.length === 14) ? s.vaf : new Array(14).fill(0);
      const pengRows = (s.pengurusan || []).filter(r => r && (Number(r.harga) > 0 || r.checked));

      // Pretty-print the actual contents so the AI can list / discuss them
      // without asking the user to retype anything.
      const fdList = fdRows.length
        ? fdRows.map((r, i) =>
            `  ${i + 1}. Entiti=${r.entiti || '(kosong)'} | Komponen=${r.komponen} | Aggregat=${r.aggregat} | Gandaan=${r.gandaan} | Catatan=${r.catatan || ''}`
          ).join('\n')
        : '  (tiada Fungsi Data didaftarkan)';

      const ftList = ftRows.length
        ? ftRows.map((r, i) =>
            `  ${i + 1}. Makro=${r.makro || '(kosong)'} | General=${r.general || '(kosong)'} | Komponen=${r.komponen} | Aggregat=${r.aggregat} | Gandaan=${r.gandaan} | Catatan=${r.catatan || ''}`
          ).join('\n')
        : '  (tiada Fungsi Transaksi didaftarkan)';

      const vafList = vafArr.map((v, i) => `${i + 1}=${v}`).join(', ');

      const pengList = pengRows.length
        ? pengRows.map((r, i) =>
            `  ${i + 1}. Perkara=${r.perkara} | Harga=${r.harga} | Kuantiti=${r.kuantiti}`
          ).join('\n')
        : '  (tiada item Kos Pengurusan didaftarkan)';

      const ctx =
`[KONTEKS SISTEM — pengguna sedang mengedit sistem berikut. Gunakan data sebenar ini untuk SEMUA jawapan (termasuk apabila pengguna minta "list in table", "senaraikan", dll). Anda TIDAK perlu tanya pengguna semula — semua maklumat sudah ada di bawah:

KOD: ${s.kod}
NAMA: ${s.nama}
KETERANGAN: ${s.keterangan || '(tiada)'}

== FUNGSI DATA (${fdRows.length} entri) ==
${fdList}

== FUNGSI TRANSAKSI (${ftRows.length} entri) ==
${ftList}

== KONFIGURASI VAF (14 GSC) ==
${vafList}

== KOS PENGURUSAN (${pengRows.length} entri) ==
${pengList}

ARAHAN PENTING:
1. Apabila pengguna minta "list in table" atau "senaraikan dalam jadual" — terus tunjukkan jadual berdasarkan data di atas. JANGAN tanya pengguna untuk berikan maklumat semula.
2. Apabila anda menjana payload JSON baharu, mesti gunakan "nama":"${s.nama}" dan "keterangan":"${s.keterangan || ''}". Pengguna mahu MENGEMASKINI sistem ini, bukan mencipta baharu.]`;

      messagesToSend.unshift({ role: 'user', content: ctx });
      messagesToSend.splice(1, 0, { role: 'assistant', content: 'Faham — saya ada akses penuh kepada data sistem ' + s.kod + ' dan akan jawab berdasarkan data tersebut.' });
    }

    // Stream the response. The trace steps advance from the REAL token stream
    // (aiTraceProgressFromText), so the progress reflects the AI's actual speed.
    const data = await aiStreamChat(messagesToSend, aiChatMode, (acc) => {
      aiTraceProgressFromText(acc);
    });

    aiFinishTrace();              // all 4 steps complete (real reply arrived)
    if (labelTimer) clearInterval(labelTimer);
    // Brief beat so the user sees the final ✓ before the bubble is replaced.
    await new Promise(res => setTimeout(res, 280));
    removeThinkingBubble();
    setParticles(false);

    if (!data.ok) {
      addAIBubble('⚠ ' + (data.error || 'Ralat tidak dijangka dari pelayan AI.'));
      document.getElementById('ai-send-btn').disabled = false;
      aiModalState = 'idle';
      aiSetGenerating(false);
      document.getElementById('ai-header-sub').textContent = 'Sila cuba lagi';
      return;
    }

    const replyText = data.reply || '';
    aiConversation.push({ role: 'assistant', content: replyText });
    // Persist AI reply to current conversation
    if (aiCurrentConvoId) aiApiAppendMessage(aiCurrentConvoId, 'assistant', replyText);

    // REVIEW MODE: the reply is a completeness report — no payload, no apply
    // button, none of the estimation retry logic. Just render it and finish.
    if (aiChatMode === 'review') {
      const reviewText = (replyText || '').trim();
      if (reviewText) addAIBubble(reviewText);
      if (data.truncated) {
        addAIBubble('⚠ Laporan mungkin tidak lengkap — terlalu panjang. Anda boleh minta semakan untuk sistem tertentu.');
      }
      // If the report was for ONE focused system, make each section row in the
      // generated table clickable: hovering a row (e.g. "Fungsi Data") reveals a
      // "Pergi ke" link that jumps straight to that page for the system.
      const focusKod = (aiLinkedSystemKod && window.systems && window.systems[aiLinkedSystemKod])
        ? aiLinkedSystemKod : null;
      if (focusKod) aiAttachRowJumpsToLastReport(focusKod);

      document.getElementById('ai-send-btn').disabled = false;
      aiModalState = 'idle';
      aiSetGenerating(false);
      document.getElementById('ai-header-sub').textContent = 'Semakan selesai';
      setTimeout(() => document.getElementById('ai-textarea').focus(), 50);
      return;
    }

    // What the user sees: AI text minus the JSON block (JSON is applied to the form instead)
    const visible = aiStripJsonBlock(replyText).trim();
    const aiSkippedTables = !visible; // AI produced only JSON, no human-readable content

    // Truncation: the backend flags data.truncated when the model was cut off
    // (finish_reason === 'length'). If it was cut off AND we couldn't extract a
    // valid payload, the reply is unusable — auto-retry once.
    if (data.truncated && !data.payload && !window.aiTruncRetryDone) {
      window.aiTruncRetryDone = true;
      addAIBubble('⚠ Jawapan AI terpotong (terlalu panjang). Sedang menjana versi lebih padat...');
      // Retry with a COMPACT instruction — re-sending the same request would
      // just truncate again. We ask the AI to keep tables minimal and put its
      // full effort into a valid, complete JSON payload.
      setTimeout(() => { if (window.aiRetryCompact) window.aiRetryCompact(); }, 800);
      return;
    }
    // Cut off but a payload still survived — usable, just warn the user the
    // visible tables may be incomplete (the form data from JSON is fine).
    if (data.truncated && data.payload) {
      addAIBubble('⚠ Nota: paparan jadual mungkin tidak lengkap kerana jawapan panjang, tetapi data penuh telah diterima.');
    }

    // Essay detection: a proper estimation reply contains "## " section headings
    // (Fungsi Data / Transaksi / VAF / Penganggaran Kos). If the AI instead wrote
    // a long free-text proposal with no payload and no headings, treat it as an
    // off-task essay and silently re-ask for the tables — but only once, to avoid
    // an infinite loop if the AI keeps misbehaving.
    const looksLikeTables = /(^|\n)##\s/.test(visible) || /\n\s*\|[\s:|-]+\|/.test(visible);
    const isOffTaskEssay = !data.payload && visible.length > 280 && !looksLikeTables;
    if (isOffTaskEssay && !window.aiEssayRetryDone) {
      window.aiEssayRetryDone = true;
      addAIBubble('⚠ AI memberi penerangan, bukan jadual. Sedang meminta AI jana jadual Kos FPA...');
      setTimeout(() => {
        if (window.aiRedirectToGenerate) window.aiRedirectToGenerate();
      }, 800);
      return;
    }

    if (data.payload && aiSkippedTables) {
      // AI gave us valid JSON but no tables — auto re-ask for the tables silently.
      window.aiPendingPayload = data.payload; // save it in case re-ask also returns JSON
      addAIBubble('⚠ AI tidak jana jadual. Sedang meminta AI jana semula...');
      // Short delay then auto-redirect to force tables
      setTimeout(() => {
        if (window.aiRedirectToGenerate) window.aiRedirectToGenerate();
      }, 800);
      return; // skip the rest; sendAIEstimate will handle the new response
    }

    // Render the table reply. Keep a handle so the apply card can be appended
    // INTO this same bubble (under the table) rather than as a new message.
    const replyBubble = visible ? addAIBubble(visible) : null;

    if (data.payload) {
      // Validation gate: if backend says NOT ok, surface the errors and let the user
      // ask for corrections (don't inject bad data into the form).
      if (data.validation && !data.validation.ok) {
        const errsHtml = (data.validation.errors || []).map(e => '<li>' + escapeHtml(e) + '</li>').join('');
        addAIBubble('⚠ Payload dijana tetapi tidak lulus pengesahan:<ul style="margin:6px 0 0 18px;padding:0;">' + errsHtml + '</ul>Sila minta AI untuk membetulkan.');
        document.getElementById('ai-send-btn').disabled = false;
        aiModalState = 'idle';
        aiSetGenerating(false);
        document.getElementById('ai-header-sub').textContent = 'Pengesahan gagal — sila minta pembetulan';
        return;
      }

      // Instead of applying automatically, prepare a manual insertion button.
      window.aiPendingPayload = data.payload;
      aiAppendCardToBubble(replyBubble, aiApplyButtonHtml());

      // Keep chat open so user can review or ask for changes
      document.getElementById('ai-send-btn').disabled = false;
      aiModalState = 'idle';
      aiSetGenerating(false);   // answer fully delivered — stop the logo
      document.getElementById('ai-header-sub').textContent = 'Sedia — semak jadual di atas';
      setTimeout(() => document.getElementById('ai-textarea').focus(), 50);
    } else {
      // No payload yet — AI is asking a clarifying question. No redirect
      // button: the AI is prompted to generate tables directly, so we just
      // let the user reply in the input box.
      document.getElementById('ai-send-btn').disabled = false;
      aiModalState = 'idle';
      aiSetGenerating(false);   // answer fully delivered — stop the logo
      document.getElementById('ai-header-sub').textContent = 'Menunggu maklumat tambahan…';
      setTimeout(() => document.getElementById('ai-textarea').focus(), 50);
    }

  } catch (err) {
    clearInterval(labelTimer);
    removeThinkingBubble();
    setParticles(false);
    addAIBubble('⚠ Tidak dapat hubungi pelayan AI. Pastikan backend berjalan di ' + AI_BACKEND_URL + '.');
    document.getElementById('ai-send-btn').disabled = false;
    aiModalState = 'idle';
    aiSetGenerating(false);
    document.getElementById('ai-header-sub').textContent = 'Sila cuba lagi';
  }
}

// Forward the validated payload to the Laravel FUSE-AI backend (via the chatbox proxy).
async function submitAIPayloadToLaravel() {
  if (!aiCurrentPayload) return;
  const btn = document.getElementById('ai-submit-laravel-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Menghantar…'; }
  try {
    const r = await fetch(AI_BACKEND_URL + '/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: aiCurrentPayload })
    });
    const data = await r.json();
    if (!r.ok) {
      addAIBubble('⚠ Laravel menolak payload: ' + (data.error || 'ralat tidak diketahui'));
    } else {
      addAIBubble('✓ Payload telah berjaya disimpan ke pangkalan data FUSE-AI.');
    }
  } catch (_) {
    addAIBubble('⚠ Tidak dapat hubungi pelayan untuk hantar ke FUSE-AI.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Hantar ke FUSE-AI'; }
  }
}

// Function called by the "MASUKKAN KE DALAM SISTEM" button.
// `cardEl` is the .ai-apply-card the button lives in — after a successful
// insert we swap its INNER content for a "go to Kos FPA" button so the user
// can jump straight to the system instead of seeing a dead insert button.
window.applyAiPayload = async function(cardEl) {
  if (!window.aiPendingPayload) return;
  const payload = window.aiPendingPayload;
  window.aiPendingPayload = null; // Clear it so it can't be clicked twice

  const summary = aiApplyPayloadToSystems(payload);
  aiCurrentPayload = payload;

  if (summary) {
    // Turn the clicked apply card into a "go to Kos FPA" card IN PLACE — the
    // card stays attached under the table, no separate summary bubble.
    if (cardEl && cardEl.parentElement) {
      const tmp = document.createElement('div');
      tmp.innerHTML = aiGoToSystemCardHtml(summary.kod, summary.nama);
      const newCard = tmp.firstElementChild;
      if (newCard) cardEl.replaceWith(newCard);
    }

    // Link this conversation to the system it just filled, so that when the
    // conversation is reopened later we know the data was already inserted
    // (and can show "PERGI KE KOS FPA" instead of the apply button again).
    aiLinkedSystemKod = summary.kod;
    // Sync the top-right dropdown to the system the AI just created, so it
    // always reflects the conversation currently being discussed.
    aiRefreshSystemDropdown();
    if (aiCurrentConvoId) {
      aiApiSetConvoSystem(aiCurrentConvoId, summary.kod);
      // Rename the conversation to the system name so the history sidebar
      // shows a meaningful title instead of the first user message.
      const newTitle = (summary.nama || summary.kod || '').trim();
      if (newTitle) {
        aiApiRenameConvo(aiCurrentConvoId, newTitle).then(() => aiRefreshSidebar());
      }
    }
  }

  // Data inserted. Keep the input visible so the user can continue chatting
  // (e.g. ask for changes). The "PERGI KE KOS FPA" card under the table is
  // the navigation path now — no separate footer actions.
  aiModalState = 'idle';
  document.getElementById('ai-header-sub').textContent = '✓ Selesai — data telah diisi';
  document.getElementById('ai-input-area').style.display = 'flex';
  document.getElementById('ai-send-btn').disabled = false;
};

// Called by the "Jana Jadual Sekarang" redirect button.
// Injects a fixed instruction message into the conversation so the AI
// stops asking questions and immediately generates the 4 tables + JSON payload.
window.aiRedirectToGenerate = function() {
  // Disable the redirect button so it can't be clicked twice
  const btn = document.getElementById('ai-generate-now-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  // Inject a silent system redirect into the conversation history
  const redirectMsg = 'Saya sudah berikan maklumat yang cukup. Sila jana terus semua EMPAT jadual (Fungsi Data, Fungsi Transaksi, VAF, dan Penganggaran Kos) sekarang berdasarkan maklumat yang ada. Jangan tanya soalan lagi.';

  // Show user message in chat
  addAIBubble(redirectMsg, true);

  // Push into conversation history and call sendAIEstimate logic
  aiConversation.push({ role: 'user', content: redirectMsg });
  if (aiCurrentConvoId) aiApiAppendMessage(aiCurrentConvoId, 'user', redirectMsg);

  // Trigger the AI call directly
  sendAIEstimate(redirectMsg);
};

// Retry after a truncated reply. Re-sending the same request would just
// truncate again, so we inject an instruction to keep the visible tables
// minimal and spend the token budget on a COMPLETE, valid JSON payload.
window.aiRetryCompact = function() {
  const compactMsg =
    'Jawapan tadi terpotong kerana terlalu panjang. Sila jana SEMULA dengan lebih padat: ' +
    'kekalkan jadual ringkas sahaja (jangan tambah ayat panjang atau pengulangan), ' +
    'dan PASTIKAN blok JSON di hujung adalah LENGKAP dan sah. ' +
    'Keutamaan: JSON mesti penuh dan tidak terpotong.';
  // This instruction is internal — push to the API conversation but keep the
  // chat clean (no extra user bubble).
  aiConversation.push({ role: 'user', content: compactMsg });
  sendAIEstimate(compactMsg);
};

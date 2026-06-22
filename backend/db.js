// ============================================================
// SQLite layer (node-sqlite3-wasm — pure JS, no native build)
// ============================================================
// Schema:
//   users   (id, email, password_hash, name, created_at)
//   systems (id, user_id, kod, nama, keterangan, data_json, tarikh_cipta, updated_at)
// A "system" is stored as one JSON blob so the existing in-memory shape
// (fungsiData, fungsiTrans, vaf, pengurusan, perkakasan) survives intact.
// ============================================================

const path = require("path");
const fs   = require("fs");
const { Database } = require("node-sqlite3-wasm");

const DB_PATH = path.join(__dirname, "fuse.db");

// node-sqlite3-wasm uses a directory named "<db>.lock" as its mutex. If the
// previous process was killed mid-write (Ctrl+C at the wrong moment, crash,
// VS Code closed without stopping the server, taskkill), the directory stays
// on disk and every future start dies with "database is locked".
// Safe to clean here because this module is being imported right now — no
// other writer can possibly hold a valid handle yet.
try { fs.rmSync(DB_PATH + ".lock", { recursive: true, force: true }); } catch (_) {}
try { fs.rmSync(DB_PATH + "-journal", { force: true }); } catch (_) {}

const db = new Database(DB_PATH);

// Schema ---------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS systems (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    kod          TEXT NOT NULL,
    nama         TEXT NOT NULL,
    keterangan   TEXT,
    data_json    TEXT NOT NULL,
    tarikh_cipta TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, kod),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_systems_user ON systems(user_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL DEFAULT 'Perbualan Baru',
    system_kod  TEXT,                                   -- optional FK to systems.kod (per user). NULL = unlinked.
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role            TEXT NOT NULL,            -- 'user' or 'assistant'
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_convo_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_msg_convo  ON chat_messages(conversation_id);
`);

// One-time migrations: add columns to old databases that pre-date them.
// ALTER TABLE ADD COLUMN throws "duplicate column" if it already exists — we just swallow it.
try { db.exec(`ALTER TABLE conversations ADD COLUMN system_kod TEXT`); } catch (_) { /* already exists */ }
// `mode` separates the two chatboxes: 'estimate' (Analisis Sistem) vs
// 'review' (Laman Utama completeness checker). Old rows default to 'estimate'.
try { db.exec(`ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'estimate'`); } catch (_) { /* already exists */ }

// ---------- USERS -----------------------------------------------------
function createUser({ email, passwordHash, name }) {
  const stmt = db.prepare(`
    INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)
  `);
  const info = stmt.run([email.toLowerCase(), passwordHash, name]);
  return { id: Number(info.lastInsertRowid), email: email.toLowerCase(), name };
}

function findUserByEmail(email) {
  const row = db
    .prepare(`SELECT id, email, password_hash, name FROM users WHERE email = ?`)
    .get([email.toLowerCase()]);
  return row || null;
}

function findUserById(id) {
  const row = db
    .prepare(`SELECT id, email, name, created_at FROM users WHERE id = ?`)
    .get([id]);
  return row || null;
}

// Like findUserById but includes the password hash — used when verifying the
// current password before a password change.
function findUserAuthById(id) {
  const row = db
    .prepare(`SELECT id, email, name, password_hash, created_at FROM users WHERE id = ?`)
    .get([id]);
  return row || null;
}

function updateUserName(id, name) {
  db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run([name, id]);
  return findUserById(id);
}

function updateUserPassword(id, passwordHash) {
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run([passwordHash, id]);
}

// Count how many systems a user owns (shown on the profile screen).
function countUserSystems(userId) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM systems WHERE user_id = ?`).get([userId]);
  return row ? Number(row.n) : 0;
}

// ---------- SYSTEMS ---------------------------------------------------
function listSystems(userId) {
  const rows = db
    .prepare(`
      SELECT kod, nama, keterangan, data_json, tarikh_cipta, updated_at
      FROM systems
      WHERE user_id = ?
      ORDER BY datetime(tarikh_cipta) DESC
    `)
    .all([userId]);
  return rows.map((r) => {
    let data = {};
    try { data = JSON.parse(r.data_json); } catch (_) { data = {}; }
    return { ...data, kod: r.kod, nama: r.nama, keterangan: r.keterangan, tarikhCipta: r.tarikh_cipta };
  });
}

function upsertSystem(userId, sys) {
  if (!sys || !sys.kod || !sys.nama) {
    throw new Error("System must have kod and nama.");
  }
  const dataJson = JSON.stringify(sys);
  const tarikh = sys.tarikhCipta || new Date().toISOString();
  // Use ON CONFLICT to upsert by (user_id, kod).
  db.prepare(`
    INSERT INTO systems (user_id, kod, nama, keterangan, data_json, tarikh_cipta, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, kod) DO UPDATE SET
      nama       = excluded.nama,
      keterangan = excluded.keterangan,
      data_json  = excluded.data_json,
      updated_at = datetime('now')
  `).run([userId, sys.kod, sys.nama, sys.keterangan || "", dataJson, tarikh]);
}

function deleteSystem(userId, kod) {
  const info = db
    .prepare(`DELETE FROM systems WHERE user_id = ? AND kod = ?`)
    .run([userId, kod]);
  return info.changes > 0;
}

function replaceAllSystems(userId, systemsObj) {
  // For bulk autosave: drop the user's systems and re-insert. Wrapped in a
  // transaction so the table is never half-populated if anything throws.
  const txn = () => {
    db.prepare(`DELETE FROM systems WHERE user_id = ?`).run([userId]);
    const list = Object.values(systemsObj || {});
    for (const sys of list) upsertSystem(userId, sys);
  };
  // node-sqlite3-wasm exposes raw transaction control via exec.
  db.exec("BEGIN");
  try { txn(); db.exec("COMMIT"); }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

// ---------- CONVERSATIONS ---------------------------------------------
// listConversations is filtered by `mode` so the two chatboxes (Analisis
// Sistem = 'estimate', Laman Utama = 'review') each see only their own
// history. Passing no mode returns all (back-compat).
function listConversations(userId, mode) {
  if (mode === "estimate" || mode === "review") {
    return db
      .prepare(`
        SELECT c.id, c.title, c.system_kod, c.mode, c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS msg_count
        FROM conversations c
        WHERE c.user_id = ? AND c.mode = ?
        ORDER BY datetime(c.updated_at) DESC
      `)
      .all([userId, mode]);
  }
  return db
    .prepare(`
      SELECT c.id, c.title, c.system_kod, c.mode, c.created_at, c.updated_at,
             (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id) AS msg_count
      FROM conversations c
      WHERE c.user_id = ?
      ORDER BY datetime(c.updated_at) DESC
    `)
    .all([userId]);
}

function createConversation(userId, title, systemKod, mode) {
  const m = (mode === "review") ? "review" : "estimate";
  const info = db
    .prepare(`INSERT INTO conversations (user_id, title, system_kod, mode) VALUES (?, ?, ?, ?)`)
    .run([userId, (title || "Perbualan Baru").slice(0, 80), systemKod || null, m]);
  return {
    id: Number(info.lastInsertRowid),
    title: title || "Perbualan Baru",
    system_kod: systemKod || null,
    mode: m,
  };
}

function getConversation(userId, convoId) {
  const convo = db
    .prepare(`SELECT id, title, system_kod, mode, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?`)
    .get([convoId, userId]);
  if (!convo) return null;
  const messages = db
    .prepare(`SELECT role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC`)
    .all([convoId]);
  return { ...convo, messages };
}

// Update the linked system on an existing conversation. Pass null to unlink.
function setConversationSystem(userId, convoId, systemKod) {
  const info = db
    .prepare(`UPDATE conversations SET system_kod = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run([systemKod || null, convoId, userId]);
  return info.changes > 0;
}

function appendMessage(userId, convoId, role, content) {
  // Confirm the convo belongs to this user before writing.
  const owner = db
    .prepare(`SELECT 1 FROM conversations WHERE id = ? AND user_id = ?`)
    .get([convoId, userId]);
  if (!owner) throw new Error("Perbualan tidak dijumpai.");
  db.prepare(`INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)`)
    .run([convoId, role, String(content).slice(0, 32000)]);
  db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`)
    .run([convoId]);
}

function renameConversation(userId, convoId, title) {
  const info = db
    .prepare(`UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run([(title || "").slice(0, 80), convoId, userId]);
  return info.changes > 0;
}

function deleteConversation(userId, convoId) {
  const info = db
    .prepare(`DELETE FROM conversations WHERE id = ? AND user_id = ?`)
    .run([convoId, userId]);
  return info.changes > 0;
}

module.exports = {
  db,
  createUser,
  findUserByEmail,
  findUserById,
  findUserAuthById,
  updateUserName,
  updateUserPassword,
  countUserSystems,
  listSystems,
  upsertSystem,
  deleteSystem,
  replaceAllSystems,
  // chat
  listConversations,
  createConversation,
  getConversation,
  appendMessage,
  renameConversation,
  deleteConversation,
  setConversationSystem,
};

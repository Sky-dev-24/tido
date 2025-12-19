import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Support configurable database path for Docker deployment
const dbPath = process.env.DB_PATH || join(__dirname, '../../todos.db');
const db = new Database(dbPath);

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    is_approved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    is_shared INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS list_members (
    list_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    permission_level TEXT NOT NULL DEFAULT 'editor',
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (list_id, user_id),
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS list_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    inviter_id INTEGER NOT NULL,
    invitee_id INTEGER NOT NULL,
    permission_level TEXT NOT NULL DEFAULT 'editor',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    completed_by INTEGER,
    is_recurring INTEGER DEFAULT 0,
    recurrence_pattern TEXT,
    next_occurrence TEXT,
    due_date TEXT,
    reminder_minutes_before INTEGER,
    priority TEXT DEFAULT 'medium',
    parent_todo_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_todo_id) REFERENCES todos(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_todos_list_id ON todos(list_id);
  CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_list_members_user_id ON list_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_list_invitations_invitee ON list_invitations(invitee_id, status);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS task_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_task_attachments_todo ON task_attachments(todo_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS todo_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_todo_comments_todo ON todo_comments(todo_id);
  CREATE INDEX IF NOT EXISTS idx_todo_comments_user ON todo_comments(user_id);
`);

// Password reset tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
`);

// Email verification tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    verified_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
`);

function ensureTodoColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(todos)').all();
  const hasColumn = columns.some((column) => column.name === name);
  if (!hasColumn) {
    db.prepare(`ALTER TABLE todos ADD COLUMN ${name} ${definition}`).run();
  }
}

function ensureUserColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const hasColumn = columns.some((column) => column.name === name);
  if (!hasColumn) {
    db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
  }
}

ensureTodoColumn('due_date', 'TEXT');
ensureTodoColumn('reminder_minutes_before', 'INTEGER');
ensureTodoColumn('priority', "TEXT DEFAULT 'medium'");
ensureTodoColumn('parent_todo_id', 'INTEGER');
ensureTodoColumn('sort_order', 'INTEGER');
ensureTodoColumn('notes', 'TEXT');
ensureTodoColumn('assigned_to', 'INTEGER');
ensureTodoColumn('deleted_at', 'TEXT');
ensureTodoColumn('completed_at', 'TEXT');
ensureTodoColumn('archived_at', 'TEXT');

ensureUserColumn('dark_mode', 'INTEGER DEFAULT 0');
ensureUserColumn('theme', "TEXT DEFAULT 'aurora'");
ensureUserColumn('view_density', "TEXT DEFAULT 'comfortable'");
ensureUserColumn('font_scale', "TEXT DEFAULT 'medium'");
ensureUserColumn('font_family', "TEXT DEFAULT 'system'");
ensureUserColumn('default_task_priority', "TEXT DEFAULT 'medium'");
ensureUserColumn('default_task_due_offset_days', 'INTEGER DEFAULT 0');
ensureUserColumn('default_task_reminder_minutes', 'INTEGER');
ensureUserColumn('auto_archive_days', 'INTEGER DEFAULT 0');
ensureUserColumn('week_start_day', "TEXT DEFAULT 'sunday'");
ensureUserColumn('email_verified', 'INTEGER DEFAULT 0');

function ensureListColumn(name, definition) {
  const columns = db.prepare('PRAGMA table_info(lists)').all();
  const hasColumn = columns.some((column) => column.name === name);
  if (!hasColumn) {
    db.prepare(`ALTER TABLE lists ADD COLUMN ${name} ${definition}`).run();
  }
}

ensureListColumn('archived_at', 'TEXT');

function ensureTodoParentIndex() {
  const columns = db.prepare('PRAGMA table_info(todos)').all();
  const hasParentColumn = columns.some((column) => column.name === 'parent_todo_id');
  if (hasParentColumn) {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos(parent_todo_id)').run();
  }
}

ensureTodoParentIndex();

function autoArchiveCompletedTodosForList(listId, userId) {
  if (!listId || !userId) return;

  const user = getUser(userId);
  const autoArchiveDays = Number(user?.auto_archive_days ?? 0);

  if (!Number.isFinite(autoArchiveDays) || autoArchiveDays <= 0) {
    return;
  }

  const threshold = new Date(Date.now() - autoArchiveDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  db.prepare(
    `
      UPDATE todos
      SET archived_at = ?, deleted_at = ?
      WHERE list_id = ?
        AND completed = 1
        AND archived_at IS NULL
        AND deleted_at IS NULL
        AND completed_at IS NOT NULL
        AND completed_at <= ?
    `
  ).run(nowIso, nowIso, listId, threshold);
}

function selectSiblingIds(listId, parentId, excludeId) {
  if (parentId === null) {
    if (excludeId !== undefined && excludeId !== null) {
      return db
        .prepare(
          `
          SELECT id
          FROM todos
          WHERE list_id = ?
            AND parent_todo_id IS NULL
            AND id != ?
          ORDER BY sort_order ASC, created_at ASC
        `
        )
        .all(listId, excludeId);
    }

    return db
      .prepare(
        `
        SELECT id
        FROM todos
        WHERE list_id = ?
          AND parent_todo_id IS NULL
        ORDER BY sort_order ASC, created_at ASC
      `
      )
      .all(listId);
  }

  if (excludeId !== undefined && excludeId !== null) {
    return db
      .prepare(
        `
        SELECT id
        FROM todos
        WHERE list_id = ?
          AND parent_todo_id = ?
          AND id != ?
        ORDER BY sort_order ASC, created_at ASC
      `
      )
      .all(listId, parentId, excludeId);
  }

  return db
    .prepare(
      `
      SELECT id
      FROM todos
      WHERE list_id = ?
        AND parent_todo_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `
    )
    .all(listId, parentId);
}

function isUserMemberOfList(listId, userId) {
  if (!listId || !userId) return false;
  const member = db
    .prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);
  return Boolean(member);
}

function normalizeAssignee(listId, assigneeId) {
  if (assigneeId === undefined || assigneeId === null || assigneeId === '') {
    return null;
  }

  const parsed = Number(assigneeId);
  if (!Number.isInteger(parsed)) {
    throw new Error('Invalid assignee id');
  }

  if (!isUserMemberOfList(listId, parsed)) {
    throw new Error('Assignee must be a list member');
  }

  return parsed;
}

function getNextSortOrder(listId, parentTodoId) {
  if (parentTodoId !== null && parentTodoId !== undefined) {
    const result = db
      .prepare('SELECT MAX(sort_order) as maxOrder FROM todos WHERE parent_todo_id = ?')
      .get(parentTodoId);
    const maxOrder = result?.maxOrder ?? 0;
    return maxOrder + 1;
  }

  const result = db
    .prepare('SELECT MAX(sort_order) as maxOrder FROM todos WHERE list_id = ? AND parent_todo_id IS NULL')
    .get(listId);
  const maxOrder = result?.maxOrder ?? 0;
  return maxOrder + 1;
}

function normalizeDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeReminderMinutes(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizePriority(value) {
  const allowed = new Set(['low', 'medium', 'high']);
  if (!value) {
    return 'medium';
  }
  const normalized = String(value).toLowerCase();
  return allowed.has(normalized) ? normalized : 'medium';
}

function sanitizeAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    todo_id: row.todo_id,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size: row.size,
    created_at: row.created_at
  };
}

function fetchAttachmentRowsByTodoIds(todoIds) {
  if (!Array.isArray(todoIds) || todoIds.length === 0) {
    return [];
  }

  const placeholders = todoIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT *
    FROM task_attachments
    WHERE todo_id IN (${placeholders})
    ORDER BY created_at DESC
  `).all(...todoIds);
}

function groupSanitizedAttachments(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const sanitized = sanitizeAttachment(row);
    if (!sanitized) return;
    if (!map.has(row.todo_id)) {
      map.set(row.todo_id, []);
    }
    map.get(row.todo_id).push(sanitized);
  });
  return map;
}

function getAttachmentRecord(id) {
  return db.prepare(`
    SELECT a.*, t.list_id
    FROM task_attachments a
    JOIN todos t ON a.todo_id = t.id
    WHERE a.id = ?
  `).get(id);
}

// ===== USER FUNCTIONS =====

export function hasAnyUsers() {
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return result.count > 0;
}

export async function createUser(username, email, password) {
  const passwordHash = await bcrypt.hash(password, 10);

  // Check if this is the first user
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const isFirstUser = userCount === 0;

  try {
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, is_admin, is_approved)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, email, passwordHash, isFirstUser ? 1 : 0, isFirstUser ? 1 : 0);

    const user = getUser(result.lastInsertRowid);

    // Create default personal list for the new user
    const listResult = db.prepare(`
      INSERT INTO lists (name, created_by, is_shared)
      VALUES (?, ?, 0)
    `).run('My Tasks', user.id);

    // Add user as admin of their personal list
    db.prepare(`
      INSERT INTO list_members (list_id, user_id, permission_level)
      VALUES (?, ?, 'admin')
    `).run(listResult.lastInsertRowid, user.id);

    return user;
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      if (error.message.includes('username')) {
        throw new Error('Username already exists');
      }
      if (error.message.includes('email')) {
        throw new Error('Email already exists');
      }
    }
    throw error;
  }
}

export function getUser(id) {
  return db
    .prepare(
      `SELECT
        id,
        username,
        email,
        is_admin,
        is_approved,
        dark_mode,
        theme,
        view_density,
        font_scale,
        font_family,
        default_task_priority,
        default_task_due_offset_days,
        default_task_reminder_minutes,
        auto_archive_days,
        week_start_day,
        created_at
      FROM users
      WHERE id = ?`
    )
    .get(id);
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export function updateUserDarkMode(userId, darkMode) {
  db.prepare('UPDATE users SET dark_mode = ? WHERE id = ?').run(darkMode ? 1 : 0, userId);
  return getUser(userId);
}

export function updateUserTheme(userId, theme) {
  const allowedThemes = new Set([
    'ocean',
    'forest',
    'sunset',
    'midnight',
    'candy',
    'lavender',
    'crimson',
    'aurora',
    'amber',
    'monochrome',
    'emerald'
  ]);

  const rawTheme = typeof theme === 'string' ? theme.trim().toLowerCase() : '';
  let normalizedTheme = rawTheme || 'aurora';

  if (!allowedThemes.has(normalizedTheme)) {
    normalizedTheme = normalizedTheme
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!normalizedTheme) {
      normalizedTheme = 'aurora';
    }
  }

  if (normalizedTheme.length > 64) {
    normalizedTheme = normalizedTheme.slice(0, 64);
  }

  db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(normalizedTheme, userId);
  return getUser(userId);
}

export function updateUserViewDensity(userId, viewDensity) {
  const allowedDensities = ['compact', 'comfortable', 'spacious'];
  const normalizedDensity = allowedDensities.includes(viewDensity) ? viewDensity : 'comfortable';
  db.prepare('UPDATE users SET view_density = ? WHERE id = ?').run(normalizedDensity, userId);
  return getUser(userId);
}

export function updateUserPreferences(userId, preferences = {}) {
  if (!userId) {
    throw new Error('User ID is required to update preferences');
  }

  const allowedFontScales = new Set(['small', 'medium', 'large']);
  const allowedFontFamilies = new Set(['system', 'serif', 'mono', 'rounded']);
  const allowedPriorities = new Set(['low', 'medium', 'high']);
  const allowedWeekStarts = new Set(['sunday', 'monday']);

  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(preferences, 'fontScale')) {
    const value = String(preferences.fontScale ?? '').toLowerCase();
    const normalized = allowedFontScales.has(value) ? value : 'medium';
    updates.push('font_scale = ?');
    params.push(normalized);
  }

  if (Object.prototype.hasOwnProperty.call(preferences, 'fontFamily')) {
    const value = String(preferences.fontFamily ?? '').toLowerCase();
    const normalized = allowedFontFamilies.has(value) ? value : 'system';
    updates.push('font_family = ?');
    params.push(normalized);
  }

  if (Object.prototype.hasOwnProperty.call(preferences, 'defaultTaskPriority')) {
    const value = String(preferences.defaultTaskPriority ?? '').toLowerCase();
    const normalized = allowedPriorities.has(value) ? value : 'medium';
    updates.push('default_task_priority = ?');
    params.push(normalized);
  }

  if (Object.prototype.hasOwnProperty.call(preferences, 'defaultTaskDueOffsetDays')) {
    const raw = preferences.defaultTaskDueOffsetDays;
    let normalized = 0;
    if (raw === null || raw === undefined || raw === '') {
      normalized = 0;
    } else {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        normalized = Math.min(Math.max(Math.trunc(parsed), 0), 365);
      }
    }
    updates.push('default_task_due_offset_days = ?');
    params.push(normalized);
  }

  if (Object.prototype.hasOwnProperty.call(preferences, 'defaultTaskReminderMinutes')) {
    const raw = preferences.defaultTaskReminderMinutes;
    let normalized = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
        normalized = Math.min(Math.trunc(parsed), 10080); // cap at 7 days
      } else {
        normalized = null;
      }
    }
    updates.push('default_task_reminder_minutes = ?');
    params.push(normalized);
  }

  if (Object.prototype.hasOwnProperty.call(preferences, 'autoArchiveDays')) {
    const raw = preferences.autoArchiveDays;
    let normalized = 0;
    if (raw === null || raw === undefined || raw === '') {
      normalized = 0;
    } else {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
        normalized = Math.min(Math.trunc(parsed), 365);
      }
    }
    updates.push('auto_archive_days = ?');
    params.push(normalized);
  }

  if (Object.prototype.hasOwnProperty.call(preferences, 'weekStartDay')) {
    const value = String(preferences.weekStartDay ?? '').toLowerCase();
    const normalized = allowedWeekStarts.has(value) ? value : 'sunday';
    updates.push('week_start_day = ?');
    params.push(normalized);
  }

  if (updates.length === 0) {
    return getUser(userId);
  }

  const statement = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  params.push(userId);
  db.prepare(statement).run(...params);

  return getUser(userId);
}

// ===== SESSION FUNCTIONS =====

export function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, userId, expiresAt);

  return { id: sessionId, userId, expiresAt };
}

export function getSession(sessionId) {
  const session = db
    .prepare(
      `
    SELECT
      s.*,
      u.username,
      u.email,
      u.is_admin,
      u.is_approved,
      u.dark_mode,
      u.theme,
      u.view_density,
      u.font_scale,
      u.font_family,
      u.default_task_priority,
      u.default_task_due_offset_days,
      u.default_task_reminder_minutes,
      u.auto_archive_days,
      u.week_start_day
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `
    )
    .get(sessionId);

  return session;
}

// ===== ADMIN FUNCTIONS =====

export function getAllUsers() {
  return db.prepare('SELECT id, username, email, is_admin, is_approved, dark_mode, theme, view_density, created_at FROM users ORDER BY created_at DESC').all();
}

export function getPendingUsers() {
  return db.prepare('SELECT id, username, email, created_at FROM users WHERE is_approved = 0 ORDER BY created_at DESC').all();
}

export function approveUser(userId) {
  db.prepare('UPDATE users SET is_approved = 1 WHERE id = ?').run(userId);
  return getUser(userId);
}

export function rejectUser(userId) {
  // Delete the user and their associated sessions
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function setUserAdminStatus(userId, isAdmin) {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId);
  return getUser(userId);
}

export function permanentlyDeleteUser(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM list_members WHERE user_id = ?').run(userId);
  db.prepare('UPDATE todos SET assigned_to = NULL WHERE assigned_to = ?').run(userId);
  db.prepare('DELETE FROM todos WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM list_invitations WHERE inviter_id = ? OR invitee_id = ?').run(userId, userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function getAdminCount() {
  const result = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get();
  return result?.count ?? 0;
}

export function deleteSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function cleanExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// ===== TODO FUNCTIONS =====

// Get todos for a specific list (with permission check)
export function getTodosForList(listId, userId) {
  cleanExpiredSessions();
  checkRecurringTasksForList(listId, userId);

  // Verify user has access to this list
  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member) {
    throw new Error('Access denied to this list');
  }

  autoArchiveCompletedTodosForList(listId, userId);

  // Get todos with user information for completed_by (exclude soft-deleted)
  const todos = db.prepare(`
    SELECT t.*,
      u.username as completed_by_username,
      a.username as assigned_to_username,
      a.email as assigned_to_email,
      COALESCE(c.comment_count, 0) as comment_count
    FROM todos t
    LEFT JOIN users u ON t.completed_by = u.id
    LEFT JOIN users a ON t.assigned_to = a.id
    LEFT JOIN (
      SELECT todo_id, COUNT(*) as comment_count
      FROM todo_comments
      GROUP BY todo_id
    ) c ON t.id = c.todo_id
    WHERE t.list_id = ? AND t.deleted_at IS NULL AND t.archived_at IS NULL
    ORDER BY
      CASE WHEN t.parent_todo_id IS NULL THEN 0 ELSE 1 END,
      CASE WHEN t.sort_order IS NULL THEN 1 ELSE 0 END,
      t.sort_order ASC,
      t.created_at ASC
  `).all(listId);

  const attachmentsMap = groupSanitizedAttachments(fetchAttachmentRowsByTodoIds(todos.map((todo) => todo.id)));

  return todos.map((todo) => ({
    ...todo,
    attachments: attachmentsMap.get(todo.id) ?? [],
    comment_count: todo.comment_count || 0
  }));
}

export function getTodo(id, userId) {
  const todo = db.prepare(`
    SELECT t.*,
      u.username as completed_by_username,
      a.username as assigned_to_username,
      a.email as assigned_to_email,
      COALESCE(c.comment_count, 0) as comment_count
    FROM todos t
    LEFT JOIN users u ON t.completed_by = u.id
    LEFT JOIN users a ON t.assigned_to = a.id
    LEFT JOIN (
      SELECT todo_id, COUNT(*) as comment_count
      FROM todo_comments
      GROUP BY todo_id
    ) c ON t.id = c.todo_id
    WHERE t.id = ?
  `).get(id);

  if (!todo) return null;

  // Check if user has access to this todo's list
  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(todo.list_id, userId);

  if (!member) return null;

  const attachments = groupSanitizedAttachments(fetchAttachmentRowsByTodoIds([todo.id]));

  return {
    ...todo,
    attachments: attachments.get(todo.id) ?? [],
    comment_count: todo.comment_count || 0
  };
}

export function createTaskAttachment(todoId, userId, metadata) {
  const todo = getTodo(todoId, userId);
  if (!todo) {
    throw new Error('Todo not found');
  }

  const { original_name, stored_name, mime_type = null, size = null } = metadata;

  const result = db.prepare(`
    INSERT INTO task_attachments (todo_id, original_name, stored_name, mime_type, size)
    VALUES (?, ?, ?, ?, ?)
  `).run(todoId, original_name, stored_name, mime_type, size);

  return getAttachmentRecord(result.lastInsertRowid);
}

export function getAttachmentForUser(attachmentId, userId) {
  const attachment = getAttachmentRecord(attachmentId);
  if (!attachment) return null;

  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(attachment.list_id, userId);

  if (!member) return null;

  return attachment;
}

export function deleteTaskAttachment(attachmentId, userId) {
  const attachment = getAttachmentForUser(attachmentId, userId);
  if (!attachment) return null;

  db.prepare('DELETE FROM task_attachments WHERE id = ?').run(attachmentId);
  return attachment;
}

export function listAttachmentsForTodo(todoId, userId) {
  const todo = getTodo(todoId, userId);
  if (!todo) return [];

  const rows = db.prepare(`
    SELECT *
    FROM task_attachments
    WHERE todo_id = ?
    ORDER BY created_at DESC
  `).all(todoId);

  return rows.map((row) => sanitizeAttachment(row));
}

export function getAttachmentFilesForTodo(todoId, userId) {
  const todo = getTodo(todoId, userId);
  if (!todo) return [];

  return db.prepare(`
    SELECT *
    FROM task_attachments
    WHERE todo_id = ?
  `).all(todoId);
}

export function createTodo(
  listId,
  userId,
  text,
  isRecurring = false,
  recurrencePattern = null,
  dueDate = null,
  reminderMinutesBefore = null,
  priority = 'medium',
  parentTodoId = null,
  assignedTo = null
) {
  // Verify user has access to this list
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member) {
    throw new Error('Access denied to this list');
  }

  let parentTodo = null;
  let targetListId = listId;

  const userPreferences = getUser(userId);
  const fallbackPriority = normalizePriority(userPreferences?.default_task_priority ?? 'medium');
  const defaultDueOffsetDaysRaw = Number(userPreferences?.default_task_due_offset_days ?? 0);
  const defaultDueOffsetDays = Number.isFinite(defaultDueOffsetDaysRaw)
    ? Math.max(0, Math.trunc(defaultDueOffsetDaysRaw))
    : 0;
  const defaultReminderMinutesRaw = userPreferences?.default_task_reminder_minutes ?? null;

  if (parentTodoId !== null && parentTodoId !== undefined) {
    parentTodo = getTodo(parentTodoId, userId);

    if (!parentTodo) {
      throw new Error('Parent todo not found');
    }

    if (parentTodo.list_id !== listId) {
      throw new Error('Parent todo must belong to the same list');
    }

    if (parentTodo.parent_todo_id) {
      throw new Error('Subtasks cannot have subtasks');
    }

    targetListId = parentTodo.list_id;
  }

  let normalizedDueDate = normalizeDateTime(dueDate);
  if (!normalizedDueDate && defaultDueOffsetDays > 0) {
    const due = new Date();
    due.setHours(17, 0, 0, 0);
    due.setDate(due.getDate() + defaultDueOffsetDays);
    normalizedDueDate = due.toISOString();
  }

  const hasExplicitReminder =
    reminderMinutesBefore !== undefined &&
    reminderMinutesBefore !== null &&
    reminderMinutesBefore !== '';
  const reminderMinutes = normalizeReminderMinutes(
    hasExplicitReminder ? reminderMinutesBefore : defaultReminderMinutesRaw
  );
  const normalizedPriority = normalizePriority(priority ?? fallbackPriority);
  const normalizedAssignee = normalizeAssignee(targetListId, assignedTo);
  const nextOccurrence = isRecurring && recurrencePattern
    ? calculateNextOccurrence(recurrencePattern, normalizedDueDate ?? new Date())
    : null;

  const normalizedParentId = parentTodoId ?? null;
  const sortOrder = getNextSortOrder(targetListId, normalizedParentId);

  const result = db.prepare(`
    INSERT INTO todos (list_id, user_id, text, completed, is_recurring, recurrence_pattern, next_occurrence, due_date, reminder_minutes_before, priority, parent_todo_id, sort_order, assigned_to)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    targetListId,
    userId,
    text,
    isRecurring ? 1 : 0,
    recurrencePattern,
    nextOccurrence,
    normalizedDueDate,
    reminderMinutes,
    normalizedPriority,
    normalizedParentId,
    sortOrder,
    normalizedAssignee
  );

  return getTodo(result.lastInsertRowid, userId);
}

export function reorderTodos(listId, userId, updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return;
  }

  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member) {
    throw new Error('Access denied to this list');
  }

  const updateTodoOrder = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');

  const transaction = db.transaction((rows) => {
    rows.forEach((row) => {
      const id = Number(row.id);
      const sortOrder = Number(row.sortOrder);
      const parentId = row.parentId ?? null;

      if (!Number.isInteger(id) || !Number.isInteger(sortOrder)) {
        throw new Error('Invalid reorder payload');
      }

      const todo = getTodo(id, userId);
      if (!todo) {
        throw new Error('Todo not found');
      }

      if (todo.list_id !== listId) {
        throw new Error('Todo does not belong to this list');
      }

      const currentParent = todo.parent_todo_id ?? null;
      if ((parentId ?? null) !== currentParent) {
        throw new Error('Cannot change parent via reorder');
      }

      updateTodoOrder.run(sortOrder, id);
    });
  });

  transaction(updates);
}

export function moveTodoToList(todoId, userId, targetListId, targetParentId = null, targetIndex = null) {
  const id = Number(todoId);
  const listId = Number(targetListId);
  const parentId =
    targetParentId === null || targetParentId === undefined ? null : Number(targetParentId);

  if (!Number.isInteger(id) || !Number.isInteger(listId)) {
    throw new Error('Invalid move payload');
  }
  if (parentId !== null && !Number.isInteger(parentId)) {
    throw new Error('Invalid parent todo id');
  }

  const todo = getTodo(id, userId);
  if (!todo) {
    throw new Error('Todo not found');
  }

  const member = db
    .prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);
  if (!member) {
    throw new Error('Access denied to target list');
  }

  if (parentId === id) {
    throw new Error('Todo cannot be its own parent');
  }

  if (parentId !== null) {
    const parent = db.prepare('SELECT * FROM todos WHERE id = ?').get(parentId);
    if (!parent) {
      throw new Error('Parent todo not found');
    }
    if (parent.list_id !== listId) {
      throw new Error('Parent todo must belong to target list');
    }
    if (parent.parent_todo_id !== null) {
      throw new Error('Subtasks cannot have subtasks');
    }
  }

  const updateSortOrder = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');

  const transaction = db.transaction(() => {
    const previousListId = todo.list_id;
    const previousParentId = todo.parent_todo_id ?? null;

    // Reindex siblings in the previous location if we're changing list or parent
    if (previousListId !== listId || previousParentId !== parentId) {
      const remainingSiblings = selectSiblingIds(previousListId, previousParentId, id);
      remainingSiblings.forEach((row, index) => updateSortOrder.run(index, row.id));
    }

    // Update todo's list and parent
    db.prepare('UPDATE todos SET list_id = ?, parent_todo_id = ? WHERE id = ?').run(
      listId,
      parentId,
      id
    );

    // Determine insertion index among new siblings
    const siblings = selectSiblingIds(listId, parentId, id);
    const resolvedIndex =
      targetIndex === null || targetIndex === undefined
        ? siblings.length
        : Math.max(0, Math.min(Number(targetIndex), siblings.length));

    const finalOrder = [...siblings];
    finalOrder.splice(resolvedIndex, 0, { id });

    finalOrder.forEach((row, index) => updateSortOrder.run(index, row.id));
  });

  transaction();

  return {
    todo: getTodo(id, userId),
    previousListId: todo.list_id,
    previousParentId: todo.parent_todo_id ?? null
  };
}

export function updateTodo(id, userId, updates) {
  const todo = getTodo(id, userId);
  if (!todo) return null;

  // Check if trying to mark parent as complete when it has incomplete subtasks
  if (updates.completed === true && !todo.completed && !todo.parent_todo_id) {
    const incompleteSubtasks = db.prepare(
      'SELECT COUNT(*) as count FROM todos WHERE parent_todo_id = ? AND completed = 0'
    ).get(id);

    if (incompleteSubtasks && incompleteSubtasks.count > 0) {
      throw new Error('Cannot complete parent task with incomplete subtasks');
    }
  }

  const completed = updates.completed !== undefined ? (updates.completed ? 1 : 0) : todo.completed;
  const text = updates.text !== undefined ? updates.text : todo.text;
  let completedBy = todo.completed_by;
  let completedAt = todo.completed_at ?? null;

  if (updates.completed !== undefined) {
    if (updates.completed) {
      completedBy = todo.completed ? todo.completed_by : userId;
      if (!todo.completed || !todo.completed_at) {
        completedAt = new Date().toISOString();
      }
    } else {
      completedBy = null;
      completedAt = null;
    }
  }

  const dueDateUpdate =
    updates.dueDate !== undefined ? normalizeDateTime(updates.dueDate)
    : (updates.due_date !== undefined ? normalizeDateTime(updates.due_date) : todo.due_date);
  const reminderMinutesUpdate =
    updates.reminderMinutesBefore !== undefined
      ? normalizeReminderMinutes(updates.reminderMinutesBefore)
      : (updates.reminder_minutes_before !== undefined
        ? normalizeReminderMinutes(updates.reminder_minutes_before)
        : normalizeReminderMinutes(todo.reminder_minutes_before));
  const priorityUpdate =
    updates.priority !== undefined
      ? normalizePriority(updates.priority)
      : (updates.priority_level !== undefined
        ? normalizePriority(updates.priority_level)
        : normalizePriority(todo.priority));
  const notesUpdate = updates.notes !== undefined ? updates.notes : todo.notes;
  const hasAssigneeUpdate = updates.assigned_to !== undefined || updates.assignedTo !== undefined;
  const assigneeUpdate = hasAssigneeUpdate
    ? normalizeAssignee(todo.list_id, updates.assigned_to !== undefined ? updates.assigned_to : updates.assignedTo)
    : (todo.assigned_to ?? null);

  db.prepare('UPDATE todos SET text = ?, completed = ?, completed_by = ?, completed_at = ?, due_date = ?, reminder_minutes_before = ?, priority = ?, notes = ?, assigned_to = ? WHERE id = ?')
    .run(text, completed, completedBy, completedAt, dueDateUpdate, reminderMinutesUpdate, priorityUpdate, notesUpdate, assigneeUpdate, id);

  // If completing a recurring task, create the next occurrence
  if (todo.is_recurring && updates.completed && !todo.completed) {
    createNextRecurrence(todo, userId);
  }

  return getTodo(id, userId);
}

export function deleteTodo(id, userId) {
  const todo = getTodo(id, userId);
  if (!todo) return false;

  // Check if user has permission to delete (must be editor or admin)
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(todo.list_id, userId);

  if (!member) return false;

  // Soft delete - set deleted_at timestamp
  const deletedAt = new Date().toISOString();
  const result = db.prepare('UPDATE todos SET deleted_at = ?, archived_at = ? WHERE id = ?').run(deletedAt, deletedAt, id);
  return result.changes > 0;
}

// Get deleted todos for a list (soft-deleted within last 7 days)
export function getDeletedTodosForList(listId, userId) {
  // Verify user has access to this list
  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member) {
    throw new Error('Access denied to this list');
  }

  // Get todos deleted within last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const todos = db.prepare(`
    SELECT t.*, u.username as completed_by_username, a.username as assigned_to_username, a.email as assigned_to_email
    FROM todos t
    LEFT JOIN users u ON t.completed_by = u.id
    LEFT JOIN users a ON t.assigned_to = a.id
    WHERE t.list_id = ? AND t.deleted_at IS NOT NULL AND t.deleted_at >= ?
    ORDER BY t.deleted_at DESC
  `).all(listId, sevenDaysAgo);

  const attachmentsMap = groupSanitizedAttachments(fetchAttachmentRowsByTodoIds(todos.map((todo) => todo.id)));

  return todos.map((todo) => ({
    ...todo,
    attachments: attachmentsMap.get(todo.id) ?? []
  }));
}

// Restore a soft-deleted todo
export function restoreTodo(id, userId) {
  // Get the todo including soft-deleted ones
  const todo = db.prepare(`
    SELECT t.*, u.username as completed_by_username, a.username as assigned_to_username, a.email as assigned_to_email
    FROM todos t
    LEFT JOIN users u ON t.completed_by = u.id
    LEFT JOIN users a ON t.assigned_to = a.id
    WHERE t.id = ?
  `).get(id);

  if (!todo) return null;

  // Check if user has access to this todo's list
  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(todo.list_id, userId);

  if (!member) return null;

  // Restore by setting deleted_at to NULL
  const result = db.prepare('UPDATE todos SET deleted_at = NULL, archived_at = NULL WHERE id = ?').run(id);

  if (result.changes > 0) {
    return getTodo(id, userId);
  }

  return null;
}

// Permanently delete a todo (hard delete)
export function permanentlyDeleteTodo(id, userId) {
  // Get the todo including soft-deleted ones
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);

  if (!todo) return false;

  // Check if user has access to this todo's list
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(todo.list_id, userId);

  if (!member) return false;

  // Hard delete
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  return result.changes > 0;
}

// Clean up todos deleted more than 7 days ago
export function cleanupOldDeletedTodos() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(sevenDaysAgo);
  return result.changes;
}

// Permanently delete all deleted todos for a specific list
export function deleteAllDeletedTodosForList(listId, userId) {
  // Verify user has access to this list
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member) {
    throw new Error('Access denied to this list');
  }

  // Delete all soft-deleted todos for this list
  const result = db.prepare('DELETE FROM todos WHERE list_id = ? AND deleted_at IS NOT NULL').run(listId);
  return result.changes;
}

function calculateNextOccurrence(pattern, fromDate = new Date()) {
  const base = new Date(fromDate);

  // Handle custom intervals (format: "custom:N:unit" e.g., "custom:3:days")
  if (pattern?.startsWith('custom:')) {
    const parts = pattern.split(':');
    if (parts.length === 3) {
      const interval = parseInt(parts[1], 10);
      const unit = parts[2];

      if (!isNaN(interval) && interval > 0) {
        switch (unit) {
          case 'days':
            base.setDate(base.getDate() + interval);
            break;
          case 'weeks':
            base.setDate(base.getDate() + (interval * 7));
            break;
          case 'months':
            base.setMonth(base.getMonth() + interval);
            break;
          case 'years':
            base.setFullYear(base.getFullYear() + interval);
            break;
        }
      }
    }
  } else {
    // Handle standard patterns
    switch (pattern) {
      case 'daily':
        base.setDate(base.getDate() + 1);
        break;
      case 'weekly':
        base.setDate(base.getDate() + 7);
        break;
      case 'biweekly':
        base.setDate(base.getDate() + 14);
        break;
      case 'monthly':
        base.setMonth(base.getMonth() + 1);
        break;
      case 'yearly':
        base.setFullYear(base.getFullYear() + 1);
        break;
    }
  }

  return base.toISOString();
}

function createNextRecurrence(todo, userId) {
  if (!todo.recurrence_pattern) return;

  const nextOccurrence = calculateNextOccurrence(
    todo.recurrence_pattern,
    todo.next_occurrence ?? new Date()
  );
  const nextDueDate = todo.due_date
    ? calculateNextOccurrence(todo.recurrence_pattern, todo.due_date)
    : null;
  const priority = normalizePriority(todo.priority);
  const parentTodoId = todo.parent_todo_id ?? null;
  const assignedTo = normalizeAssignee(todo.list_id, todo.assigned_to);

  const sortOrder = getNextSortOrder(todo.list_id, parentTodoId ?? null);

  db.prepare(`
    INSERT INTO todos (list_id, user_id, text, completed, is_recurring, recurrence_pattern, next_occurrence, due_date, reminder_minutes_before, priority, parent_todo_id, sort_order, assigned_to)
    VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    todo.list_id,
    userId,
    todo.text,
    todo.recurrence_pattern,
    nextOccurrence,
    nextDueDate,
    normalizeReminderMinutes(todo.reminder_minutes_before),
    priority,
    parentTodoId ?? null,
    sortOrder,
    assignedTo
  );
}

// Check and create due recurring tasks for a specific list
export function checkRecurringTasksForList(listId, userId) {
  // Verify user has access to this list
  const member = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member) return;

  const now = new Date().toISOString();
  const dueTasks = db.prepare(`
    SELECT * FROM todos
    WHERE list_id = ?
    AND is_recurring = 1
    AND completed = 1
    AND next_occurrence IS NOT NULL
    AND next_occurrence <= ?
  `).all(listId, now);

  dueTasks.forEach(task => {
    createNextRecurrence(task, task.user_id);
    // Update the next occurrence for the completed task
    const nextBase = task.next_occurrence ?? task.due_date ?? new Date();
    const newNext = calculateNextOccurrence(task.recurrence_pattern, nextBase);
    db.prepare('UPDATE todos SET next_occurrence = ? WHERE id = ?')
      .run(newNext, task.id);
  });
}

// ===== LIST FUNCTIONS =====

export function getUserLists(userId) {
  return db.prepare(`
    SELECT l.*, lm.permission_level,
      (SELECT COUNT(*) FROM list_members WHERE list_id = l.id) as member_count
    FROM lists l
    JOIN list_members lm ON l.id = lm.list_id
    WHERE lm.user_id = ? AND l.archived_at IS NULL
    ORDER BY l.created_at DESC
  `).all(userId);
}

export function getList(listId, userId) {
  const list = db.prepare(`
    SELECT l.*, lm.permission_level
    FROM lists l
    JOIN list_members lm ON l.id = lm.list_id
    WHERE l.id = ? AND lm.user_id = ?
  `).get(listId, userId);

  if (list) {
    list.members = db.prepare(`
      SELECT lm.*, u.username, u.email
      FROM list_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.list_id = ?
    `).all(listId);
  }

  return list;
}

export function getListMembersForUser(listId, userId) {
  const requester = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!requester) {
    throw new Error('Access denied to this list');
  }

  return db.prepare(`
    SELECT u.id, u.username, u.email, lm.permission_level
    FROM list_members lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.list_id = ?
    ORDER BY lower(u.username)
  `).all(listId);
}

export function createList(userId, name, isShared = false) {
  const result = db.prepare(`
    INSERT INTO lists (name, created_by, is_shared)
    VALUES (?, ?, ?)
  `).run(name, userId, isShared ? 1 : 0);

  // Add creator as admin
  db.prepare(`
    INSERT INTO list_members (list_id, user_id, permission_level)
    VALUES (?, ?, 'admin')
  `).run(result.lastInsertRowid, userId);

  return getList(result.lastInsertRowid, userId);
}

export function updateList(listId, userId, updates) {
  // Check if user has admin permission
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member || member.permission_level !== 'admin') {
    throw new Error('Insufficient permissions');
  }

  if (updates.name) {
    db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(updates.name, listId);
  }

  return getList(listId, userId);
}

export function archiveList(listId, userId) {
  const list = getList(listId, userId);
  if (!list || list.permission_level !== 'admin') {
    throw new Error('Insufficient permissions');
  }

  const archivedAt = new Date().toISOString();
  db.prepare('UPDATE lists SET archived_at = ? WHERE id = ?').run(archivedAt, listId);
  return true;
}

export function getArchivedLists(userId) {
  return db.prepare(`
    SELECT l.*, lm.permission_level,
      (SELECT COUNT(*) FROM list_members WHERE list_id = l.id) as member_count
    FROM lists l
    JOIN list_members lm ON l.id = lm.list_id
    WHERE lm.user_id = ? AND l.archived_at IS NOT NULL
    ORDER BY l.archived_at DESC
  `).all(userId);
}

export function restoreList(listId, userId) {
  const list = db.prepare(`
    SELECT l.*, lm.permission_level
    FROM lists l
    JOIN list_members lm ON l.id = lm.list_id
    WHERE l.id = ? AND lm.user_id = ?
  `).get(listId, userId);

  if (!list || list.permission_level !== 'admin') {
    throw new Error('Insufficient permissions');
  }

  db.prepare('UPDATE lists SET archived_at = NULL WHERE id = ?').run(listId);
  return true;
}

export function deleteList(listId, userId) {
  const list = db.prepare(`
    SELECT l.*, lm.permission_level
    FROM lists l
    JOIN list_members lm ON l.id = lm.list_id
    WHERE l.id = ? AND lm.user_id = ?
  `).get(listId, userId);

  if (!list || list.permission_level !== 'admin') {
    throw new Error('Insufficient permissions');
  }

  // Only allow deletion of archived lists
  if (!list.archived_at) {
    throw new Error('List must be archived before deletion');
  }

  db.prepare('DELETE FROM lists WHERE id = ?').run(listId);
  return true;
}

// ===== INVITATION FUNCTIONS =====

export function createInvitation(listId, inviterId, inviteeUsername, permissionLevel = 'editor') {
  const invitee = getUserByUsername(inviteeUsername);
  if (!invitee) {
    throw new Error('User not found');
  }

  // Check if inviter has admin permission
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, inviterId);

  if (!member || member.permission_level !== 'admin') {
    throw new Error('Insufficient permissions');
  }

  // Check if user is already a member
  const existingMember = db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, invitee.id);

  if (existingMember) {
    throw new Error('User is already a member of this list');
  }

  // Check for existing pending invitation
  const existingInvite = db.prepare(`
    SELECT 1 FROM list_invitations
    WHERE list_id = ? AND invitee_id = ? AND status = 'pending'
  `).get(listId, invitee.id);

  if (existingInvite) {
    throw new Error('Invitation already sent to this user');
  }

  const result = db.prepare(`
    INSERT INTO list_invitations (list_id, inviter_id, invitee_id, permission_level)
    VALUES (?, ?, ?, ?)
  `).run(listId, inviterId, invitee.id, permissionLevel);

  return db.prepare(`
    SELECT i.*, l.name as list_name, u.username as inviter_username
    FROM list_invitations i
    JOIN lists l ON i.list_id = l.id
    JOIN users u ON i.inviter_id = u.id
    WHERE i.id = ?
  `).get(result.lastInsertRowid);
}

export function getUserInvitations(userId) {
  return db.prepare(`
    SELECT i.*, l.name as list_name, u.username as inviter_username
    FROM list_invitations i
    JOIN lists l ON i.list_id = l.id
    JOIN users u ON i.inviter_id = u.id
    WHERE i.invitee_id = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
  `).all(userId);
}

export function acceptInvitation(invitationId, userId) {
  const invitation = db.prepare('SELECT * FROM list_invitations WHERE id = ? AND invitee_id = ?')
    .get(invitationId, userId);

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error('Invitation already processed');
  }

  // Add user to list
  db.prepare(`
    INSERT INTO list_members (list_id, user_id, permission_level)
    VALUES (?, ?, ?)
  `).run(invitation.list_id, userId, invitation.permission_level);

  // Update invitation status
  db.prepare("UPDATE list_invitations SET status = 'accepted' WHERE id = ?").run(invitationId);

  return getList(invitation.list_id, userId);
}

export function rejectInvitation(invitationId, userId) {
  const invitation = db.prepare('SELECT * FROM list_invitations WHERE id = ? AND invitee_id = ?')
    .get(invitationId, userId);

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  db.prepare("UPDATE list_invitations SET status = 'rejected' WHERE id = ?").run(invitationId);
  return true;
}

export function removeMember(listId, userId, memberIdToRemove) {
  // Check if user has admin permission
  const member = db.prepare('SELECT permission_level FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(listId, userId);

  if (!member || member.permission_level !== 'admin') {
    throw new Error('Insufficient permissions');
  }

  // Can't remove the list creator
  const list = db.prepare('SELECT created_by FROM lists WHERE id = ?').get(listId);
  if (list.created_by === memberIdToRemove) {
    throw new Error('Cannot remove list creator');
  }

  db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(listId, memberIdToRemove);
  return true;
}

// Comment functions
export function createComment(todoId, userId, commentText) {
  const todo = db.prepare(`
    SELECT t.id, t.list_id
    FROM todos t
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(todoId);

  if (!todo) {
    throw new Error('Task not found');
  }

  // Verify user has access to the list
  const member = db.prepare('SELECT user_id FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(todo.list_id, userId);

  if (!member) {
    throw new Error('Access denied');
  }

  const result = db.prepare(`
    INSERT INTO todo_comments (todo_id, user_id, comment_text)
    VALUES (?, ?, ?)
  `).run(todoId, userId, commentText);

  return {
    id: result.lastInsertRowid,
    todo_id: todoId,
    user_id: userId,
    comment_text: commentText,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function getCommentsForTodo(todoId, userId) {
  const todo = db.prepare(`
    SELECT t.id, t.list_id
    FROM todos t
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(todoId);

  if (!todo) {
    return [];
  }

  // Verify user has access to the list
  const member = db.prepare('SELECT user_id FROM list_members WHERE list_id = ? AND user_id = ?')
    .get(todo.list_id, userId);

  if (!member) {
    return [];
  }

  return db.prepare(`
    SELECT
      c.id,
      c.todo_id,
      c.user_id,
      c.comment_text,
      c.created_at,
      c.updated_at,
      u.username
    FROM todo_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.todo_id = ?
    ORDER BY c.created_at ASC
  `).all(todoId);
}

export function updateComment(commentId, userId, commentText) {
  const comment = db.prepare('SELECT * FROM todo_comments WHERE id = ?').get(commentId);

  if (!comment) {
    throw new Error('Comment not found');
  }

  // Only the comment author can update it
  if (comment.user_id !== userId) {
    throw new Error('Access denied');
  }

  db.prepare(`
    UPDATE todo_comments
    SET comment_text = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(commentText, commentId);

  return {
    ...comment,
    comment_text: commentText,
    updated_at: new Date().toISOString()
  };
}

export function deleteComment(commentId, userId) {
  const comment = db.prepare('SELECT * FROM todo_comments WHERE id = ?').get(commentId);

  if (!comment) {
    throw new Error('Comment not found');
  }

  // Only the comment author can delete it
  if (comment.user_id !== userId) {
    throw new Error('Access denied');
  }

  db.prepare('DELETE FROM todo_comments WHERE id = ?').run(commentId);
  return true;
}

// ==================== Password Reset Functions ====================

/**
 * Create a password reset token for a user
 * @param {number} userId - User ID
 * @returns {string} Reset token
 */
export function createPasswordResetToken(userId) {
  // Generate a secure random token
  const token = crypto.randomBytes(32).toString('hex');

  // Token expires in 1 hour
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // Invalidate any existing unused tokens for this user
  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND used_at IS NULL
  `).run(userId);

  // Create new token
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);

  return token;
}

/**
 * Validate and retrieve password reset token
 * @param {string} token - Reset token
 * @returns {Object|null} Token data or null if invalid
 */
export function getPasswordResetToken(token) {
  const tokenData = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token = ? AND used_at IS NULL
  `).get(token);

  if (!tokenData) {
    return null;
  }

  // Check if token has expired
  const now = new Date();
  const expiresAt = new Date(tokenData.expires_at);

  if (now > expiresAt) {
    return null;
  }

  return tokenData;
}

/**
 * Mark password reset token as used
 * @param {string} token - Reset token
 */
export function markPasswordResetTokenUsed(token) {
  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(token);
}

/**
 * Update user password (used for password reset)
 * @param {number} userId - User ID
 * @param {string} newPassword - New plain text password
 */
export function updateUserPassword(userId, newPassword) {
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare(`
    UPDATE users
    SET password_hash = ?
    WHERE id = ?
  `).run(hashedPassword, userId);
}

/**
 * Clean up expired password reset tokens
 */
export function cleanupExpiredPasswordResetTokens() {
  const now = new Date().toISOString();
  const result = db.prepare(`
    DELETE FROM password_reset_tokens
    WHERE expires_at < ? OR used_at IS NOT NULL
  `).run(now);
  return result.changes;
}

// ==================== Email Verification Functions ====================

/**
 * Create an email verification token for a user
 * @param {number} userId - User ID
 * @returns {string} Verification token
 */
export function createEmailVerificationToken(userId) {
  // Generate a secure random token
  const token = crypto.randomBytes(32).toString('hex');

  // Token expires in 24 hours
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Invalidate any existing unverified tokens for this user
  db.prepare(`
    DELETE FROM email_verification_tokens
    WHERE user_id = ? AND verified_at IS NULL
  `).run(userId);

  // Create new token
  db.prepare(`
    INSERT INTO email_verification_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);

  return token;
}

/**
 * Validate and retrieve email verification token
 * @param {string} token - Verification token
 * @returns {Object|null} Token data or null if invalid
 */
export function getEmailVerificationToken(token) {
  const tokenData = db.prepare(`
    SELECT * FROM email_verification_tokens
    WHERE token = ? AND verified_at IS NULL
  `).get(token);

  if (!tokenData) {
    return null;
  }

  // Check if token has expired
  const now = new Date();
  const expiresAt = new Date(tokenData.expires_at);

  if (now > expiresAt) {
    return null;
  }

  return tokenData;
}

/**
 * Mark email as verified
 * @param {string} token - Verification token
 * @returns {boolean} Success status
 */
export function verifyEmail(token) {
  const tokenData = getEmailVerificationToken(token);

  if (!tokenData) {
    return false;
  }

  // Mark token as verified
  db.prepare(`
    UPDATE email_verification_tokens
    SET verified_at = CURRENT_TIMESTAMP
    WHERE token = ?
  `).run(token);

  // Mark user's email as verified
  db.prepare(`
    UPDATE users
    SET email_verified = 1
    WHERE id = ?
  `).run(tokenData.user_id);

  return true;
}

/**
 * Check if user's email is verified
 * @param {number} userId - User ID
 * @returns {boolean}
 */
export function isEmailVerified(userId) {
  const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(userId);
  return user?.email_verified === 1;
}

/**
 * Clean up expired email verification tokens
 */
export function cleanupExpiredEmailVerificationTokens() {
  const now = new Date().toISOString();
  const result = db.prepare(`
    DELETE FROM email_verification_tokens
    WHERE expires_at < ? OR verified_at IS NOT NULL
  `).run(now);
  return result.changes;
}

export default db;

import initSqlJs, { Database } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

let db: Database | null = null;
let dbPath: string = '';

export function getDbPath(): string {
  const userDataPath = typeof process !== 'undefined' && process.env?.USER_DATA_PATH || '.';
  return path.join(userDataPath, 'autobrowse.db');
}

export async function initDb(targetPath?: string): Promise<Database> {
  if (db) return db;
  
  dbPath = targetPath || getDbPath();
  console.log(`[DB] Initializing at ${dbPath}`);
  
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const SQL = await initSqlJs();
  
  let data: Buffer | null = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }
  
  db = data ? new SQL.Database(data) : new SQL.Database();
  
  runMigrations(db);
  saveDb();
  
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function saveDb() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function runMigrations(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      instruction TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 1,
      attempts INTEGER NOT NULL DEFAULT 0,
      session_id TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      result TEXT,
      error TEXT
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT,
      screenshot_path TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      profile_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      last_seen_at TEXT NOT NULL,
      profile_path TEXT
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      actions TEXT NOT NULL,
      duration INTEGER,
      created_at TEXT NOT NULL
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cookies TEXT,
      local_storage TEXT,
      session_storage TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_used TEXT
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS system (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      scope TEXT NOT NULL DEFAULT 'global',
      user_id TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  database.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id)`);
  
  console.log('[DB] Migrations complete');
}

export function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
import { getDb, saveDb } from './index.js';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';

const getHostname = () => {
  try {
    return os.hostname();
  } catch {
    return 'unknown';
  }
};

export interface Task {
  id: string;
  agent_id: string;
  instruction: string;
  payload: string | null;
  status: string;
  priority: number;
  attempts: number;
  session_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: string | null;
  error: string | null;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  step: number;
  event_type: string;
  message: string | null;
  screenshot_path: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  agent_id: string;
  name: string;
  profile_path: string;
  created_at: string;
  last_used: string | null;
}

export function createTask(task: Omit<Task, 'id' | 'created_at' | 'attempts' | 'status'>): Task {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO tasks (id, agent_id, instruction, payload, status, priority, attempts, session_id, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?)`,
    [id, task.agent_id, task.instruction, task.payload, task.priority, task.session_id, created_at]
  );
  saveDb();
  
  return { ...task, id, status: 'pending', attempts: 0, created_at };
}

export function getTask(id: string): Task | undefined {
  const db = getDb();
  const result = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  
  const row = result[0].values[0];
  const columns = result[0].columns;
  return rowToTask(columns, row);
}

function rowToTask(columns: string[], row: any[]): Task {
  const obj: any = {};
  columns.forEach((col, i) => obj[col] = row[i]);
  return obj as Task;
}

export function getTasks(filters?: { status?: string; limit?: number }): Task[] {
  const db = getDb();
  let query = 'SELECT * FROM tasks';
  const params: any[] = [];
  
  if (filters?.status) {
    query += ' WHERE status = ?';
    params.push(filters.status);
  }
  
  query += ' ORDER BY created_at DESC';
  
  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }
  
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  return result[0].values.map(row => rowToTask(result[0].columns, row));
}

export function updateTaskStatus(id: string, status: string, result?: string, error?: string) {
  const db = getDb();
  const finished_at = ['completed', 'failed', 'cancelled'].includes(status) 
    ? new Date().toISOString() 
    : null;
  const started_at = status === 'running' ? new Date().toISOString() : null;
  
  const current = getTask(id);
  if (!current) return;
  
  db.run(
    `UPDATE tasks 
     SET status = ?, result = ?, error = ?, finished_at = COALESCE(?, finished_at),
         started_at = COALESCE(?, started_at)
     WHERE id = ?`,
    [status, result || null, error || null, finished_at, started_at, id]
  );
  saveDb();
}

export function incrementTaskAttempts(id: string) {
  const db = getDb();
  db.run('UPDATE tasks SET attempts = attempts + 1 WHERE id = ?', [id]);
  saveDb();
}

export function createTaskEvent(event: Omit<TaskEvent, 'id' | 'created_at'>): TaskEvent {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO task_events (id, task_id, step, event_type, message, screenshot_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, event.task_id, event.step, event.event_type, event.message, event.screenshot_path, created_at]
  );
  saveDb();
  
  return { ...event, id, created_at };
}

export function getTaskEvents(taskId: string): TaskEvent[] {
  const db = getDb();
  const result = db.exec('SELECT * FROM task_events WHERE task_id = ? ORDER BY step, created_at', [taskId]);
  if (result.length === 0) return [];
  
  return result[0].values.map(row => {
    const obj: any = {};
    result[0].columns.forEach((col, i) => obj[col] = row[i]);
    return obj as TaskEvent;
  });
}

export function createSession(session: Omit<Session, 'id' | 'created_at' | 'last_used'>): Session {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  
  db.run(
    `INSERT INTO sessions (id, agent_id, name, profile_path, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, session.agent_id, session.name, session.profile_path, created_at]
  );
  saveDb();
  
  return { ...session, id, created_at, last_used: null };
}

export function getSessions(agentId?: string): Session[] {
  const db = getDb();
  const query = agentId ? 'SELECT * FROM sessions WHERE agent_id = ?' : 'SELECT * FROM sessions';
  const params = agentId ? [agentId] : [];
  const result = db.exec(query, params);
  if (result.length === 0) return [];
  
  return result[0].values.map(row => {
    const obj: any = {};
    result[0].columns.forEach((col, i) => obj[col] = row[i]);
    return obj as Session;
  });
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  const result = db.exec('SELECT * FROM sessions WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  
  const row = result[0].values[0];
  const obj: any = {};
  result[0].columns.forEach((col, i) => obj[col] = row[i]);
  return obj as Session;
}

export function updateSessionLastUsed(id: string) {
  const db = getDb();
  db.run('UPDATE sessions SET last_used = ? WHERE id = ?', [new Date().toISOString(), id]);
  saveDb();
}

export function deleteSession(id: string) {
  const db = getDb();
  db.run('DELETE FROM sessions WHERE id = ?', [id]);
  saveDb();
}

export function getOrCreateDefaultAgent(): { id: string; name: string; machine_name: string } {
  const db = getDb();
  const result = db.exec('SELECT * FROM agents LIMIT 1');
  
  if (result.length === 0 || result[0].values.length === 0) {
    const id = uuidv4();
    const name = 'default';
    const machine_name = getHostname();
    const now = new Date().toISOString();
    
    db.run(
      `INSERT INTO agents (id, name, machine_name, status, last_seen_at)
       VALUES (?, ?, ?, 'online', ?)`,
      [id, name, machine_name, now]
    );
    saveDb();
    
    return { id, name, machine_name };
  }
  
  const row = result[0].values[0];
  const obj: any = {};
  result[0].columns.forEach((col, i) => obj[col] = row[i]);
  return { id: obj.id, name: obj.name, machine_name: obj.machine_name };
}

export function getConfig(key: string): string | undefined {
  const db = getDb();
  const result = db.exec('SELECT value FROM config WHERE key = ?', [key]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  return result[0].values[0][0] as string;
}

export function setConfig(key: string, value: string) {
  const db = getDb();
  const existing = getConfig(key);
  if (existing !== undefined) {
    db.run('UPDATE config SET value = ? WHERE key = ?', [value, key]);
  } else {
    db.run('INSERT INTO config (key, value) VALUES (?, ?)', [key, value]);
  }
  saveDb();
}
export interface AIConfig {
  enabled: boolean;
  provider: 'local' | 'cloud' | 'hybrid';
  local: { url: string; model: string };
  cloud: { apiKey: string; model: string };
  fallback: boolean;
}

export function getAIConfig(): AIConfig {
  const db = getDb();
  const result = db.exec("SELECT key, value FROM config WHERE key LIKE 'ai.%'");
  const config: any = { 
    enabled: true, 
    provider: 'hybrid', 
    fallback: true,
    local: { url: 'http://localhost:11434', model: 'llama3.2' },
    cloud: { apiKey: '', model: 'gpt-4o-mini' }
  };
  
  for (const row of result) {
    const key = row.values[0][0] as string;
    const value = row.values[0][1] as string;
    
    if (key === 'ai.enabled') config.enabled = value === 'true';
    if (key === 'ai.provider') config.provider = value;
    if (key === 'ai.local.url') config.local.url = value;
    if (key === 'ai.local.model') config.local.model = value;
    if (key === 'ai.cloud.apiKey') config.cloud.apiKey = value;
    if (key === 'ai.cloud.model') config.cloud.model = value;
    if (key === 'ai.fallback') config.fallback = value === 'true';
  }
  
  return config as AIConfig;
}

export function setAIConfig(key: string, value: string) {
  const db = getDb();
  db.run(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [`ai.${key}`, value]);
  saveDb();
}

export interface Recording {
  id: string;
  name: string;
  description: string | null;
  actions: string;
  duration: number;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  cookies: string | null;
  local_storage: string | null;
  session_storage: string | null;
  user_agent: string | null;
  created_at: string;
  last_used: string | null;
}

export function createRecording(recording: Omit<Recording, 'id' | 'created_at'>): Recording {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  db.run(`INSERT INTO recordings (id, name, description, actions, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, recording.name, recording.description, recording.actions, recording.duration, created_at]);
  saveDb();
  return { ...recording, id, created_at };
}

export function getRecordings(): Recording[] {
  const db = getDb();
  const result = db.exec('SELECT * FROM recordings ORDER BY created_at DESC');
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: any = {};
    result[0].columns.forEach((col, i) => obj[col] = row[i]);
    return obj as Recording;
  });
}

export function getRecording(id: string): Recording | undefined {
  const db = getDb();
  const result = db.exec('SELECT * FROM recordings WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  const obj: any = {};
  result[0].columns.forEach((col, i) => obj[col] = result[0].values[0][i]);
  return obj as Recording;
}

export function deleteRecording(id: string) {
  const db = getDb();
  db.run('DELETE FROM recordings WHERE id = ?', [id]);
  saveDb();
}

export function createProfile(profile: Omit<Profile, 'id' | 'created_at' | 'last_used'>): Profile {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  db.run(`INSERT INTO profiles (id, name, cookies, local_storage, session_storage, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, profile.name, profile.cookies, profile.local_storage, profile.session_storage, profile.user_agent, created_at]);
  saveDb();
  return { ...profile, id, created_at, last_used: null };
}

export function getProfiles(): Profile[] {
  const db = getDb();
  const result = db.exec('SELECT * FROM profiles ORDER BY last_used DESC, created_at DESC');
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: any = {};
    result[0].columns.forEach((col, i) => obj[col] = row[i]);
    return obj as Profile;
  });
}

export function getProfile(id: string): Profile | undefined {
  const db = getDb();
  const result = db.exec('SELECT * FROM profiles WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  const obj: any = {};
  result[0].columns.forEach((col, i) => obj[col] = result[0].values[0][i]);
  return obj as Profile;
}

export function deleteProfile(id: string) {
  const db = getDb();
  db.run('DELETE FROM profiles WHERE id = ?', [id]);
  saveDb();
}

export function updateProfileLastUsed(id: string) {
  const db = getDb();
  db.run('UPDATE profiles SET last_used = ? WHERE id = ?', [new Date().toISOString(), id]);
  saveDb();
}

export function getSystem(key: string): string | undefined {
  const db = getDb();
  const result = db.exec('SELECT value FROM system WHERE key = ?', [key]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  return result[0].values[0][0] as string;
}

export function setSystem(key: string, value: string, description?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(`INSERT OR REPLACE INTO system (key, value, description, updated_at) VALUES (?, ?, ?, ?)`,
    [key, value, description || null, now]);
  saveDb();
}

export function isDebugMode(): boolean {
  return getSystem('debug') === 'true';
}

export function setDebugMode(enabled: boolean) {
  setSystem('debug', enabled ? 'true' : 'false', 'Debug mode flag');
}

export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  scope: string;
  user_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function getFeatureFlags(): FeatureFlag[] {
  const db = getDb();
  const result = db.exec('SELECT * FROM feature_flags WHERE expires_at IS NULL OR expires_at > ?', [new Date().toISOString()]);
  if (result.length === 0) return [];
  return result[0].values.map(row => {
    const obj: any = {};
    result[0].columns.forEach((col, i) => obj[col] = row[i]);
    return obj as FeatureFlag;
  });
}

export function getFeatureFlag(name: string): FeatureFlag | undefined {
  const db = getDb();
  const result = db.exec('SELECT * FROM feature_flags WHERE name = ? AND (expires_at IS NULL OR expires_at > ?)',
    [name, new Date().toISOString()]);
  if (result.length === 0 || result[0].values.length === 0) return undefined;
  const obj: any = {};
  result[0].columns.forEach((col, i) => obj[col] = result[0].values[0][i]);
  return obj as FeatureFlag;
}

export function isFeatureEnabled(name: string): boolean {
  const flag = getFeatureFlag(name);
  return flag?.enabled ?? false;
}

export function setFeatureFlag(name: string, enabled: boolean, scope: string = 'global', expiresAt?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `ff_${name}`;
  db.run(`INSERT OR REPLACE INTO feature_flags (id, name, enabled, scope, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name, enabled ? 1 : 0, scope, expiresAt || null, now, now]);
  saveDb();
}

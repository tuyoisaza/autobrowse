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
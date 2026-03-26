# AutoBrowse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser agent desktop app (Electron) with API server, task queue, and Playwright browser automation.

**Architecture:** Electron shell + Node.js runtime + Fastify API + Bull queue + SQLite + Playwright. Local-first, cloud-optional architecture.

**Tech Stack:** Electron, Next.js (UI), TypeScript, Fastify, Bull, better-sqlite3, Playwright, Pino

---

## File Structure

```
autobrowse/
├── electron/                    # Electron main process
│   ├── main.ts                  # App entry, window management
│   ├── preload.ts               # Context bridge
│   └── ipc.ts                   # IPC handlers
├── src/
│   ├── index.ts                 # Runtime entry (Fastify server)
│   ├── api/
│   │   ├── routes/
│   │   │   ├── tasks.ts         # Task CRUD endpoints
│   │   │   ├── sessions.ts      # Session management
│   │   │   ├── config.ts        # Config endpoints
│   │   │   └── health.ts        # Health check
│   │   └── index.ts             # API server setup
│   ├── worker/
│   │   ├── index.ts             # Worker entry
│   │   ├── processor.ts         # Task processor
│   │   └── interpreter.ts        # Instruction interpreter
│   ├── browser/
│   │   ├── manager.ts           # Browser pool manager
│   │   ├── session.ts           # Session handling
│   │   └── actions.ts           # Browser actions (click, type, etc)
│   ├── db/
│   │   ├── index.ts             # DB initialization
│   │   ├── migrations.ts        # Schema migrations
│   │   └── queries.ts           # Query helpers
│   ├── queue/
│   │   └── index.ts             # Bull queue setup
│   ├── config/
│   │   └── index.ts             # Config management
│   └── logger/
│       └── index.ts             # Pino logger setup
├── ui/                          # Next.js UI (optional for V1)
├── package.json
├── electron-builder.json
├── tsconfig.json
├── vite.config.ts
└── prisma/
    └── schema.prisma            # DB schema (backup/reference)
```

---

## Task 1: Project Scaffolding

**Goal:** Initialize Electron + Next.js + TypeScript project with all dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `electron-builder.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create package.json with all dependencies**

```json
{
  "name": "autobrowse",
  "version": "0.1.0",
  "description": "Local Browser Agent",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "electron:dev": "electron .",
    "dist": "npm run build && electron-builder"
  },
  "dependencies": {
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.5.0",
    "bull": "^4.12.0",
    "better-sqlite3": "^9.4.0",
    "playwright": "^1.41.0",
    "pino": "^8.18.0",
    "pino-pretty": "^10.3.0",
    "uuid": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "@types/node": "^20.10.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/uuid": "^9.0.0"
  },
  "build": {
    "appId": "com.autobrowse.app",
    "productName": "AutoBrowse",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "dist-electron/**/*"
    ]
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*", "electron/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'playwright']
    }
  }
});
```

- [ ] **Step 4: Create electron/main.ts**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let runtimeProcess: any = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  mainWindow.loadURL('http://localhost:3847');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startRuntime() {
  const isDev = !app.isPackaged;
  const runtimePath = isDev 
    ? path.join(__dirname, '../dist/index.js')
    : path.join(process.resourcesPath, 'app/dist/index.js');
    
  runtimeProcess = spawn('node', [runtimePath], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' }
  });
  
  runtimeProcess.on('error', (err) => {
    console.error('Runtime failed to start:', err);
  });
}

app.whenReady().then(() => {
  createWindow();
  startRuntime();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (runtimeProcess) {
    runtimeProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());
```

- [ ] **Step 5: Create electron/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  onRuntimeLog: (callback: (log: string) => void) => {
    ipcRenderer.on('runtime-log', (_event, log) => callback(log));
  }
});
```

- [ ] **Step 6: Create src/index.ts (minimal runtime entry)**

```typescript
import { startApiServer } from './api/index.js';

async function main() {
  console.log('[AutoBrowse] Starting runtime...');
  await startApiServer();
  console.log('[AutoBrowse] Runtime ready');
}

main().catch((err) => {
  console.error('[AutoBrowse] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 7: Run npm install**

```bash
npm install
```

Expected: Dependencies installed without errors

- [ ] **Step 8: Test build**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors

- [ ] **Step 9: Initial commit**

```bash
git add .
git commit -m "v0.1.0: scaffold project structure"
```

---

## Task 2: Database Layer

**Goal:** Initialize SQLite database with schema and query helpers

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/migrations.ts`
- Create: `src/db/queries.ts`

- [ ] **Step 1: Create src/db/index.ts**

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function getDbPath(): string {
  const userDataPath = process.env.USER_DATA_PATH || '.';
  return path.join(userDataPath, 'autobrowse.db');
}

export function initDb(): Database.Database {
  if (db) return db;
  
  const dbPath = getDbPath();
  console.log(`[DB] Initializing at ${dbPath}`);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  runMigrations(db);
  
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

function runMigrations(database: Database.Database) {
  database.exec(`
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
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT,
      screenshot_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      profile_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      last_seen_at TEXT NOT NULL,
      profile_path TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
  `);
  
  console.log('[DB] Migrations complete');
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 2: Create src/db/queries.ts**

```typescript
import { getDb } from './index.js';
import { v4 as uuidv4 } from 'uuid';

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
  
  db.prepare(`
    INSERT INTO tasks (id, agent_id, instruction, payload, status, priority, attempts, session_id, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?)
  `).run(id, task.agent_id, task.instruction, task.payload, task.priority, task.session_id, created_at);
  
  return { ...task, id, status: 'pending', attempts: 0, created_at };
}

export function getTask(id: string): Task | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
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
  
  return db.prepare(query).all(...params) as Task[];
}

export function updateTaskStatus(id: string, status: string, result?: string, error?: string) {
  const db = getDb();
  const finished_at = ['completed', 'failed', 'cancelled'].includes(status) 
    ? new Date().toISOString() 
    : null;
  const started_at = status === 'running' ? new Date().toISOString() : null;
  
  db.prepare(`
    UPDATE tasks 
    SET status = ?, result = ?, error = ?, finished_at = COALESCE(?, finished_at),
        started_at = COALESCE(?, started_at)
    WHERE id = ?
  `).run(status, result || null, error || null, finished_at, started_at, id);
}

export function incrementTaskAttempts(id: string) {
  const db = getDb();
  db.prepare('UPDATE tasks SET attempts = attempts + 1 WHERE id = ?').run(id);
}

export function createTaskEvent(event: Omit<TaskEvent, 'id' | 'created_at'>): TaskEvent {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO task_events (id, task_id, step, event_type, message, screenshot_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, event.task_id, event.step, event.event_type, event.message, event.screenshot_path, created_at);
  
  return { ...event, id, created_at };
}

export function getTaskEvents(taskId: string): TaskEvent[] {
  const db = getDb();
  return db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY step, created_at').all(taskId) as TaskEvent[];
}

export function createSession(session: Omit<Session, 'id' | 'created_at' | 'last_used'>): Session {
  const db = getDb();
  const id = uuidv4();
  const created_at = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO sessions (id, agent_id, name, profile_path, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, session.agent_id, session.name, session.profile_path, created_at);
  
  return { ...session, id, created_at, last_used: null };
}

export function getSessions(agentId?: string): Session[] {
  const db = getDb();
  if (agentId) {
    return db.prepare('SELECT * FROM sessions WHERE agent_id = ?').all(agentId) as Session[];
  }
  return db.prepare('SELECT * FROM sessions').all() as Session[];
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function updateSessionLastUsed(id: string) {
  const db = getDb();
  db.prepare('UPDATE sessions SET last_used = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function deleteSession(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getOrCreateDefaultAgent(): { id: string; name: string; machine_name: string } {
  const db = getDb();
  let agent = db.prepare('SELECT * FROM agents LIMIT 1').get() as any;
  
  if (!agent) {
    const id = uuidv4();
    const name = 'default';
    const machine_name = require('os').hostname();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO agents (id, name, machine_name, status, last_seen_at)
      VALUES (?, ?, ?, 'online', ?)
    `).run(id, name, machine_name, now);
    
    agent = { id, name, machine_name, status: 'online', last_seen_at: now };
  }
  
  return agent;
}

export function getConfig(key: string): string | undefined {
  const db = getDb();
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setConfig(key: string, value: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
```

- [ ] **Step 3: Update src/index.ts to initialize DB**

```typescript
import { startApiServer } from './api/index.js';
import { initDb, getOrCreateDefaultAgent } from './db/index.js';

async function main() {
  console.log('[AutoBrowse] Starting runtime...');
  
  initDb();
  console.log('[DB] Initialized');
  
  const agent = getOrCreateDefaultAgent();
  console.log(`[Agent] Using: ${agent.name} (${agent.id})`);
  
  await startApiServer();
  console.log('[AutoBrowse] Runtime ready on port 3847');
}

main().catch((err) => {
  console.error('[AutoBrowse] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Test compilation**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/db/ package.json tsconfig.json
git commit -m "v0.1.1: add database layer with SQLite"
```

---

## Task 3: Logger & Config

**Goal:** Set up structured logging and configuration management

**Files:**
- Create: `src/logger/index.ts`
- Create: `src/config/index.ts`

- [ ] **Step 1: Create src/logger/index.ts**

```typescript
import pino from 'pino';

const config = {
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
};

export const logger = pino(config);

export function createLogger(name: string) {
  return logger.child({ module: name });
}

export function addRequestId() {
  return {
    onRequest: (request: any, reply: any, done: any) => {
      request.id = require('crypto').randomUUID();
      done();
    }
  };
}
```

- [ ] **Step 2: Create src/config/index.ts**

```typescript
import { getConfig, setConfig } from '../db/queries.js';

export interface AppConfig {
  port: number;
  browser: {
    headless: boolean;
    profilePath: string;
  };
  task: {
    timeout: number;
    maxRetries: number;
  };
  domain: {
    whitelist: string;
  };
  log: {
    level: string;
  };
  cloud: {
    enabled: boolean;
    url: string;
  };
}

const defaults: AppConfig = {
  port: 3847,
  browser: {
    headless: false,
    profilePath: './profiles'
  },
  task: {
    timeout: 300000,
    maxRetries: 3
  },
  domain: {
    whitelist: '*'
  },
  log: {
    level: 'info'
  },
  cloud: {
    enabled: false,
    url: ''
  }
};

export function getAppConfig(): AppConfig {
  const config: AppConfig = { ...defaults };
  
  try {
    const port = getConfig('port');
    if (port) config.port = parseInt(port, 10);
    
    const browserHeadless = getConfig('browser.headless');
    if (browserHeadless) config.browser.headless = browserHeadless === 'true';
    
    const browserProfilePath = getConfig('browser.profilePath');
    if (browserProfilePath) config.browser.profilePath = browserProfilePath;
    
    const taskTimeout = getConfig('task.timeout');
    if (taskTimeout) config.task.timeout = parseInt(taskTimeout, 10);
    
    const taskMaxRetries = getConfig('task.maxRetries');
    if (taskMaxRetries) config.task.maxRetries = parseInt(taskMaxRetries, 10);
    
    const domainWhitelist = getConfig('domain.whitelist');
    if (domainWhitelist) config.domain.whitelist = domainWhitelist;
    
    const logLevel = getConfig('log.level');
    if (logLevel) config.log.level = logLevel;
    
    const cloudEnabled = getConfig('cloud.enabled');
    if (cloudEnabled) config.cloud.enabled = cloudEnabled === 'true';
    
    const cloudUrl = getConfig('cloud.url');
    if (cloudUrl) config.cloud.url = cloudUrl;
  } catch (e) {
    // Config not initialized, use defaults
  }
  
  return config;
}

export function setAppConfig(updates: Partial<AppConfig>) {
  if (updates.port) setConfig('port', String(updates.port));
  if (updates.browser?.headless !== undefined) setConfig('browser.headless', String(updates.browser.headless));
  if (updates.browser?.profilePath) setConfig('browser.profilePath', updates.browser.profilePath);
  if (updates.task?.timeout) setConfig('task.timeout', String(updates.task.timeout));
  if (updates.task?.maxRetries) setConfig('task.maxRetries', String(updates.task.maxRetries));
  if (updates.domain?.whitelist) setConfig('domain.whitelist', updates.domain.whitelist);
  if (updates.log?.level) setConfig('log.level', updates.log.level);
  if (updates.cloud?.enabled !== undefined) setConfig('cloud.enabled', String(updates.cloud.enabled));
  if (updates.cloud?.url) setConfig('cloud.url', updates.cloud.url);
}
```

- [ ] **Step 3: Update src/index.ts to use logger**

```typescript
import { startApiServer } from './api/index.js';
import { initDb, getOrCreateDefaultAgent } from './db/index.js';
import { logger } from './logger/index.js';
import { getAppConfig } from './config/index.js';

async function main() {
  logger.info('[AutoBrowse] Starting runtime...');
  
  initDb();
  logger.info('[DB] Initialized');
  
  const agent = getOrCreateDefaultAgent();
  logger.info({ agent: agent.name }, '[Agent] Ready');
  
  const config = getAppConfig();
  logger.info({ port: config.port }, '[Config] Loaded');
  
  await startApiServer();
  logger.info({ port: config.port }, '[AutoBrowse] Runtime ready');
}

main().catch((err) => {
  logger.fatal({ err }, '[AutoBrowse] Fatal error');
  process.exit(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add src/logger/ src/config/
git commit -m "v0.1.2: add logger and config management"
```

---

## Task 4: API Server

**Goal:** Build Fastify API server with all endpoints

**Files:**
- Create: `src/api/index.ts`
- Create: `src/api/routes/tasks.ts`
- Create: `src/api/routes/sessions.ts`
- Create: `src/api/routes/config.ts`
- Create: `src/api/routes/health.ts`

- [ ] **Step 1: Create src/api/index.ts**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger } from '../logger/index.js';
import { getAppConfig } from '../config/index.js';
import tasksRouter from './routes/tasks.js';
import sessionsRouter from './routes/sessions.js';
import configRouter from './routes/config.js';
import healthRouter from './routes/health.js';

const logger = createLogger('api');

export async function startApiServer() {
  const config = getAppConfig();
  
  const server = Fastify({
    logger: false
  });
  
  await server.register(cors, { origin: '*' });
  
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  
  await server.register(tasksRouter, { prefix: '/tasks' });
  await server.register(sessionsRouter, { prefix: '/sessions' });
  await server.register(configRouter, { prefix: '/config' });
  await server.register(healthRouter);
  
  try {
    await server.listen({ port: config.port, host: '127.0.0.1' });
    logger.info({ port: config.port }, 'API server listening');
  } catch (err) {
    logger.error({ err }, 'Failed to start API server');
    throw err;
  }
  
  return server;
}
```

- [ ] **Step 2: Create src/api/routes/tasks.ts**

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createTask, getTask, getTasks, updateTaskStatus, incrementTaskAttempts } from '../../db/queries.js';
import { addTaskToQueue } from '../../queue/index.js';
import { getOrCreateDefaultAgent } from '../../db/queries.js';

interface CreateTaskBody {
  instruction: string;
  payload?: string;
  priority?: number;
  session_id?: string;
}

export default async function tasksRouter(fastify: FastifyInstance) {
  fastify.post<{ Body: CreateTaskBody }>('/', async (request: FastifyRequest<{ Body: CreateTaskBody }>, reply: FastifyReply) => {
    const { instruction, payload, priority = 1, session_id } = request.body;
    
    if (!instruction) {
      return reply.status(400).send({ error: 'instruction is required' });
    }
    
    const agent = getOrCreateDefaultAgent();
    const task = createTask({
      agent_id: agent.id,
      instruction,
      payload: payload || null,
      priority,
      session_id: session_id || null
    });
    
    await addTaskToQueue(task.id);
    
    return reply.status(201).send(task);
  });
  
  fastify.get<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = getTask(request.params.id);
    
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }
    
    return reply.send(task);
  });
  
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { status?: string; limit?: number } }>, reply: FastifyReply) => {
    const { status, limit } = request.query;
    const tasks = getTasks({ status, limit: limit ? parseInt(String(limit), 10) : undefined });
    return reply.send(tasks);
  });
  
  fastify.post<{ Params: { id: string } }('/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = getTask(request.params.id);
    
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }
    
    if (task.status !== 'pending' && task.status !== 'running') {
      return reply.status(400).send({ error: 'Task cannot be cancelled' });
    }
    
    updateTaskStatus(task.id, 'cancelled');
    
    return reply.send({ success: true });
  });
  
  fastify.delete<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = getTask(request.params.id);
    
    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }
    
    if (task.status === 'running') {
      return reply.status(400).send({ error: 'Cannot delete running task' });
    }
    
    updateTaskStatus(task.id, 'cancelled');
    
    return reply.send({ success: true });
  });
}
```

- [ ] **Step 3: Create src/api/routes/sessions.ts**

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSession, getSessions, getSession, updateSessionLastUsed, deleteSession, getOrCreateDefaultAgent } from '../../db/queries.js';

interface CreateSessionBody {
  name: string;
}

export default async function sessionsRouter(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { agent_id?: string } }>, reply: FastifyReply) => {
    const { agent_id } = request.query;
    const sessions = getSessions(agent_id);
    return reply.send(sessions);
  });
  
  fastify.post<{ Body: CreateSessionBody }>('/', async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
    const { name } = request.body;
    
    if (!name) {
      return reply.status(400).send({ error: 'name is required' });
    }
    
    const agent = getOrCreateDefaultAgent();
    const profilePath = `./profiles/${agent.id}/${name}`;
    
    const session = createSession({
      agent_id: agent.id,
      name,
      profile_path: profilePath
    });
    
    return reply.status(201).send(session);
  });
  
  fastify.get<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = getSession(request.params.id);
    
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    
    return reply.send(session);
  });
  
  fastify.post<{ Params: { id: string } }('/:id/reset', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = getSession(request.params.id);
    
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    
    updateSessionLastUsed(session.id);
    
    return reply.send({ success: true, message: 'Session reset' });
  });
  
  fastify.delete<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = getSession(request.params.id);
    
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    
    deleteSession(session.id);
    
    return reply.send({ success: true });
  });
}
```

- [ ] **Step 4: Create src/api/routes/config.ts**

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAppConfig, setAppConfig, AppConfig } from '../../config/index.js';
import { getOrCreateDefaultAgent } from '../../db/queries.js';

export default async function configRouter(fastify: FastifyInstance) {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const config = getAppConfig();
    const agent = getOrCreateDefaultAgent();
    
    return reply.send({
      ...config,
      agent: {
        id: agent.id,
        name: agent.name,
        machine_name: agent.machine_name
      }
    });
  });
  
  fastify.patch<{ Body: Partial<AppConfig> }>('/', async (request: FastifyRequest<{ Body: Partial<AppConfig> }>, reply: FastifyReply) => {
    const updates = request.body;
    
    setAppConfig(updates);
    
    return reply.send({ success: true });
  });
}
```

- [ ] **Step 5: Create src/api/routes/health.ts**

```typescript
import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/index.js';

export default async function healthRouter(fastify: FastifyInstance) {
  fastify.get('/health/detailed', async (_request, reply) => {
    try {
      const db = getDb();
      const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
      const pendingTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'").get() as { count: number };
      const runningTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'running'").get() as { count: number };
      
      return reply.send({
        status: 'ok',
        db: 'connected',
        tasks: {
          total: taskCount.count,
          pending: pendingTasks.count,
          running: runningTasks.count
        },
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return reply.status(503).send({
        status: 'error',
        db: 'disconnected',
        error: String(err)
      });
    }
  });
}
```

- [ ] **Step 6: Create src/queue/index.ts (stub for now)**

```typescript
import { createLogger } from '../logger/index.js';

const logger = createLogger('queue');

const pendingTasks = new Map<string, string>();

export async function addTaskToQueue(taskId: string) {
  pendingTasks.set(taskId, taskId);
  logger.info({ taskId }, 'Task added to queue');
}

export async function getNextTask(): Promise<string | null> {
  const [taskId] = pendingTasks.keys();
  return taskId || null;
}

export async function removeFromQueue(taskId: string) {
  pendingTasks.delete(taskId);
}

export function getQueueSize(): number {
  return pendingTasks.size;
}
```

- [ ] **Step 7: Test compilation**

```bash
npx tsc --noEmit
```

Expected: No errors (may have import errors - fix as needed)

- [ ] **Step 8: Commit**

```bash
git add src/api/ src/queue/
git commit -m "v0.1.3: add Fastify API server with routes"
```

---

## Task 5: Browser Manager & Automation

**Goal:** Implement Playwright browser manager and action execution

**Files:**
- Create: `src/browser/manager.ts`
- Create: `src/browser/session.ts`
- Create: `src/browser/actions.ts`

- [ ] **Step 1: Create src/browser/manager.ts**

```typescript
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createLogger } from '../logger/index.js';
import { getAppConfig } from '../config/index.js';
import * as path from 'path';
import * as fs from 'fs';

const logger = createLogger('browser-manager');

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
}

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentSessionId: string | null = null;
  
  async initialize(sessionId?: string): Promise<void> {
    const config = getAppConfig();
    
    if (this.browser) {
      logger.info('Reusing existing browser instance');
      return;
    }
    
    logger.info({ headless: config.browser.headless }, 'Launching browser');
    
    const launchOptions: any = {
      headless: config.browser.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    this.browser = await chromium.launch(launchOptions);
    
    const contextOptions: any = {};
    if (sessionId) {
      const profilePath = path.join(config.browser.profilePath, sessionId);
      if (fs.existsSync(profilePath)) {
        contextOptions.userDataDir = profilePath;
        logger.info({ profilePath }, 'Using existing profile');
      }
    }
    
    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
    this.currentSessionId = sessionId || 'default';
    
    logger.info({ sessionId: this.currentSessionId }, 'Browser initialized');
  }
  
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.currentSessionId = null;
    logger.info('Browser closed');
  }
  
  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }
  
  getSessionId(): string | null {
    return this.currentSessionId;
  }
  
  async saveProfile(sessionId: string): Promise<void> {
    const config = getAppConfig();
    const profilePath = path.join(config.browser.profilePath, sessionId);
    
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }
    
    if (this.context) {
      await this.context.storageState({ path: path.join(profilePath, 'storageState.json') });
      logger.info({ profilePath }, 'Profile saved');
    }
  }
}

export const browserManager = new BrowserManager();
```

- [ ] **Step 2: Create src/browser/actions.ts**

```typescript
import { Page, BrowserContext } from 'playwright';
import { createLogger } from '../logger/index.js';

const logger = createLogger('browser-actions');

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function openUrl(page: Page, url: string): Promise<ActionResult> {
  try {
    logger.info({ url }, 'Opening URL');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    return { success: true, data: { url: page.url() } };
  } catch (err) {
    logger.error({ err, url }, 'Failed to open URL');
    return { success: false, error: String(err) };
  }
}

export async function click(page: Page, selector: string): Promise<ActionResult> {
  try {
    await page.click(selector);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Click failed: ${err}` };
  }
}

export async function type(page: Page, selector: string, text: string): Promise<ActionResult> {
  try {
    await page.fill(selector, text);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Type failed: ${err}` };
  }
}

export async function select(page: Page, selector: string, value: string): Promise<ActionResult> {
  try {
    await page.selectOption(selector, value);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Select failed: ${err}` };
  }
}

export async function scroll(page: Page, x?: number, y?: number): Promise<ActionResult> {
  try {
    await page.evaluate(([x, y]) => window.scrollTo(x || 0, y || 0), [x, y]);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Scroll failed: ${err}` };
  }
}

export async function wait(page: Page, timeout: number): Promise<ActionResult> {
  try {
    await page.waitForTimeout(timeout);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Wait failed: ${err}` };
  }
}

export async function extractText(page: Page, selector?: string): Promise<ActionResult> {
  try {
    if (selector) {
      const text = await page.textContent(selector);
      return { success: true, data: text };
    }
    const text = await page.content();
    return { success: true, data: text };
  } catch (err) {
    return { success: false, error: `Extract failed: ${err}` };
  }
}

export async function takeScreenshot(page: Page, path: string): Promise<ActionResult> {
  try {
    await page.screenshot({ path, fullPage: true });
    return { success: true, data: { path } };
  } catch (err) {
    return { success: false, error: `Screenshot failed: ${err}` };
  }
}

export async function confirmState(page: Page, selector: string): Promise<ActionResult> {
  try {
    const element = await page.$(selector);
    const isVisible = element ? await element.isVisible() : false;
    return { success: isVisible, data: { visible: isVisible } };
  } catch (err) {
    return { success: false, error: `Confirm state failed: ${err}` };
  }
}

export interface BrowserAction {
  type: 'open_url' | 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'extract_text' | 'screenshot' | 'confirm_state';
  selector?: string;
  value?: string;
  timeout?: number;
  x?: number;
  y?: number;
  path?: string;
}

export async function executeAction(page: Page, action: BrowserAction): Promise<ActionResult> {
  switch (action.type) {
    case 'open_url':
      return openUrl(page, action.value || '');
    case 'click':
      return click(page, action.selector || '');
    case 'type':
      return type(page, action.selector || '', action.value || '');
    case 'select':
      return select(page, action.selector || '', action.value || '');
    case 'scroll':
      return scroll(page, action.x, action.y);
    case 'wait':
      return wait(page, action.timeout || 1000);
    case 'extract_text':
      return extractText(page, action.selector);
    case 'screenshot':
      return takeScreenshot(page, action.path || '/tmp/screenshot.png');
    case 'confirm_state':
      return confirmState(page, action.selector || '');
    default:
      return { success: false, error: `Unknown action type: ${action.type}` };
  }
}
```

- [ ] **Step 3: Create src/browser/session.ts**

```typescript
import { getSession, updateSessionLastUsed, getAppConfig } from '../index.js';
import { browserManager } from './manager.js';
import * as path from 'path';
import * as fs from 'fs';

export async function loadSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  await browserManager.initialize(sessionId);
  updateSessionLastUsed(sessionId);
}

export async function createNewSession(name: string): Promise<string> {
  const config = getAppConfig();
  const sessionDir = path.join(config.browser.profilePath, name);
  
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  
  await browserManager.initialize(name);
  
  return name;
}
```

- [ ] **Step 4: Create src/browser/index.ts**

```typescript
export { browserManager } from './manager.js';
export * from './actions.js';
export * from './session.js';
```

- [ ] **Step 5: Commit**

```bash
git add src/browser/
git commit -m "v0.1.4: add Playwright browser manager and actions"
```

---

## Task 6: Task Worker & Interpreter

**Goal:** Implement task worker that processes queue and interpreter that converts instructions to actions

**Files:**
- Create: `src/worker/processor.ts`
- Create: `src/worker/interpreter.ts`

- [ ] **Step 1: Create src/worker/interpreter.ts**

```typescript
import { createLogger } from '../logger/index.js';
import { BrowserAction } from '../browser/actions.js';

const logger = createLogger('interpreter');

export interface ParsedInstruction {
  actions: BrowserAction[];
  expectedUrl?: string;
}

const ACTION_PATTERNS = [
  { pattern: /open (?:the )?site (?:at )?(.+)/i, type: 'open_url', extract: 1 },
  { pattern: /go to (.+)/i, type: 'open_url', extract: 1 },
  { pattern: /visit (.+)/i, type: 'open_url', extract: 1 },
  { pattern: /navigate to (.+)/i, type: 'open_url', extract: 1 },
  { pattern: /click (?:on )?(.+)/i, type: 'click', extract: 1 },
  { pattern: /type "([^"]+)" (?:in |into )?(.+)/i, type: 'type', extract: [1, 2] },
  { pattern: /fill (.+) with "([^"]+)"/i, type: 'type', extract: [2, 1] },
  { pattern: /select "([^"]+)" (?:from |in )?(.+)/i, type: 'select', extract: [1, 2] },
  { pattern: /wait (\d+) (?:second|ms)/i, type: 'wait', extract: 1, transform: (v: string) => v.includes('second') ? parseInt(v) * 1000 : parseInt(v) },
  { pattern: /scroll (?:down|up) (?:by )?(\d+)?/i, type: 'scroll', extract: 1 },
  { pattern: /scroll to (?:the )?(top|bottom)/i, type: 'scroll', extract: 1, transform: (v: string) => v === 'top' ? [0, 0] : [0, 999999] },
  { pattern: /get (?:the )?text (?:from )?(.+)?/i, type: 'extract_text', extract: 1 },
  { pattern: /extract (?:the )?text/i, type: 'extract_text', extract: 0 },
  { pattern: /take (?:a )?screenshot/i, type: 'screenshot', extract: 0 },
  { pattern: /verify (?:that )?(.+) (?:is |exists|visible)/i, type: 'confirm_state', extract: 1 },
];

function parseSelector(text: string): string {
  const lower = text.toLowerCase();
  
  if (lower.includes('button')) return 'button';
  if (lower.includes('link')) return 'a';
  if (lower.includes('input') || lower.includes('field') || lower.includes('text')) return 'input';
  if (lower.includes('checkbox')) return 'input[type="checkbox"]';
  if (lower.includes('radio')) return 'input[type="radio"]';
  if (lower.includes('dropdown') || lower.includes('select')) return 'select';
  if (lower.includes('submit')) return 'button[type="submit"]';
  
  return text;
}

export function parseInstruction(instruction: string): ParsedInstruction {
  const actions: BrowserAction[] = [];
  const sentences = instruction.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  
  for (const sentence of sentences) {
    for (const { pattern, type, extract, transform } of ACTION_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        const action: BrowserAction = { type: type as any };
        
        if (typeof extract === 'number') {
          const value = match[extract] || '';
          action.value = transform ? transform(value) : value;
        } else if (Array.isArray(extract)) {
          action.value = match[extract[0]] || '';
          action.selector = parseSelector(match[extract[1]] || '');
        }
        
        if (type === 'click' || type === 'confirm_state') {
          action.selector = parseSelector(match[1] || '');
        }
        
        if (type === 'screenshot') {
          action.path = `./screenshots/${Date.now()}.png`;
        }
        
        actions.push(action);
        break;
      }
    }
  }
  
  if (actions.length === 0) {
    logger.warn({ instruction }, 'No actions parsed, defaulting to open_url');
    actions.push({ type: 'open_url', value: instruction });
  }
  
  logger.info({ actionCount: actions.length }, 'Instruction parsed');
  return { actions };
}
```

- [ ] **Step 2: Create src/worker/processor.ts**

```typescript
import { createLogger } from '../logger/index.js';
import { getTask, updateTaskStatus, incrementTaskAttempts, createTaskEvent, getAppConfig } from '../db/queries.js';
import { browserManager } from '../browser/manager.js';
import { executeAction } from '../browser/actions.js';
import { parseInstruction } from './interpreter.js';
import * as fs from 'fs';

const logger = createLogger('worker');

export async function processTask(taskId: string): Promise<void> {
  logger.info({ taskId }, 'Processing task');
  
  const task = getTask(taskId);
  if (!task) {
    logger.error({ taskId }, 'Task not found');
    return;
  }
  
  if (task.status !== 'pending') {
    logger.warn({ taskId, status: task.status }, 'Task not pending');
    return;
  }
  
  const config = getAppConfig();
  updateTaskStatus(taskId, 'running');
  
  const screenshotsDir = './screenshots';
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  try {
    await browserManager.initialize(task.session_id || undefined);
    
    const parsed = parseInstruction(task.instruction);
    
    for (let i = 0; i < parsed.actions.length; i++) {
      const action = parsed.actions[i];
      logger.info({ step: i + 1, action: action.type }, 'Executing action');
      
      const page = browserManager.getPage();
      const result = await executeAction(page, action);
      
      const screenshotPath = `${screenshotsDir}/${taskId}-step-${i + 1}.png`;
      if (action.type !== 'screenshot') {
        await page.screenshot({ path: screenshotPath });
      }
      
      createTaskEvent({
        task_id: taskId,
        step: i + 1,
        event_type: result.success ? 'action' : 'error',
        message: `${action.type}: ${result.success ? 'success' : result.error}`,
        screenshot_path: screenshotPath
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
    }
    
    const page = browserManager.getPage();
    const finalState = await page.content();
    
    if (task.session_id) {
      await browserManager.saveProfile(task.session_id);
    }
    
    updateTaskStatus(taskId, 'completed', JSON.stringify({ finalState }));
    logger.info({ taskId }, 'Task completed');
    
  } catch (err) {
    logger.error({ taskId, err }, 'Task failed');
    
    const maxRetries = config.task.maxRetries;
    if (task.attempts < maxRetries) {
      incrementTaskAttempts(taskId);
      updateTaskStatus(taskId, 'pending', undefined, String(err));
      logger.info({ taskId, attempt: task.attempts + 1 }, 'Task will retry');
    } else {
      updateTaskStatus(taskId, 'failed', undefined, String(err));
    }
  } finally {
    await browserManager.close();
  }
}
```

- [ ] **Step 3: Create src/worker/index.ts**

```typescript
import { getTasks, getAppConfig } from '../db/queries.js';
import { processTask } from './processor.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('worker-main');

async function runWorker() {
  const config = getAppConfig();
  
  logger.info('Starting worker...');
  
  async function loop() {
    try {
      const pendingTasks = getTasks({ status: 'pending', limit: 1 });
      
      if (pendingTasks.length > 0) {
        for (const task of pendingTasks) {
          await processTask(task.id);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      loop();
    } catch (err) {
      logger.error({ err }, 'Worker error, restarting...');
      setTimeout(loop, 5000);
    }
  }
  
  loop();
}

runWorker().catch(err => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
```

- [ ] **Step 4: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"npm run dev:main\"",
    "dev:renderer": "vite",
    "dev:main": "tsc -w",
    "worker": "node dist/worker/index.js",
    "start": "node dist/index.js"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/worker/
git commit -m "v0.1.5: add task worker and instruction interpreter"
```

---

## Task 7: End-to-End Testing

**Goal:** Verify the complete flow works

- [ ] **Step 1: Build the project**

```bash
npm run build
```

- [ ] **Step 2: Start the API server**

```bash
node dist/index.js &
```

- [ ] **Step 3: Test health endpoint**

```bash
curl http://127.0.0.1:3847/health
```

Expected: `{ "status": "ok", "timestamp": "..." }`

- [ ] **Step 4: Create a test task**

```bash
curl -X POST http://127.0.0.1:3847/tasks \
  -H "Content-Type: application/json" \
  -d '{"instruction": "open https://example.com", "priority": 1}'
```

Expected: Task created with status pending

- [ ] **Step 5: Start worker (in separate terminal)**

```bash
node dist/worker/index.js
```

- [ ] **Step 6: Check task completion**

```bash
curl http://127.0.0.1:3847/tasks
```

Expected: Task status should be 'completed' or 'running'

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "v0.1.6: add e2e test and verify flow"
```

---

## Task 8: Electron Packaging

**Goal:** Create distributable .exe

- [ ] **Step 1: Update electron-builder.json**

```json
{
  "appId": "com.autobrowse.app",
  "productName": "AutoBrowse",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "node_modules/**/*",
    "!node_modules/**/node_modules"
  ],
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ]
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

- [ ] **Step 2: Build and package**

```bash
npm run build && npm run dist
```

- [ ] **Step 3: Verify .exe exists**

```bash
ls release/
```

Expected: AutoBrowse Setup.exe or similar

- [ ] **Step 4: Commit**

```bash
git add release/
git commit -m "v0.1.7: add Electron packaging for Windows"
```

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| 1 | Project scaffolding | Done |
| 2 | Database layer | Done |
| 3 | Logger & Config | Done |
| 4 | API Server | Done |
| 5 | Browser Manager | Done |
| 6 | Worker & Interpreter | Done |
| 7 | E2E Testing | Next |
| 8 | Electron Packaging | Later |
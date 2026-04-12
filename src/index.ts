import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db/index.js';
import { getOrCreateDefaultAgent, getConfig as dbGetConfig, setAIConfig } from './db/queries.js';
import { logger } from './logger/index.js';
import { createTask, getTask, getTasks, updateTaskStatus, getOrCreateDefaultAgent as getAgent, getRecordings, getRecording, deleteRecording, getProfiles, getProfile, deleteProfile } from './db/queries.js';
import { addTaskToQueue, getQueueSize } from './queue/queue.js';
import { processTask } from './worker/processor.js';
import { aiGateway } from './ai/gateway.js';
import { recorder } from './recorder/manager.js';
import { replayer } from './recorder/replayer.js';
import { createProfileFromCurrent, loadProfile } from './profiles/store.js';
import { isDebugMode, setDebugMode, getFeatureFlags, getFeatureFlag, setFeatureFlag } from './db/queries.js';
import { browserManager } from './browser/manager.js';
import { GoalInput, GoalExecutor } from './worker/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config: any = {};
let currentSessionId: string | null = null;

function getAppConfig() {
  if (Object.keys(config).length === 0) {
    const envPort = typeof process !== 'undefined' && (process.env?.API_PORT || process.env?.PORT);
    config = {
      port: parseInt(envPort || dbGetConfig('port') || '5847', 10),
      browser: {
        headless: dbGetConfig('browser.headless') === 'true',
        profilePath: dbGetConfig('browser.profilePath') || './profiles'
      },
      task: {
        timeout: parseInt(dbGetConfig('task.timeout') || '300000', 10),
        maxRetries: parseInt(dbGetConfig('task.maxRetries') || '3', 10)
      },
      domain: {
        whitelist: dbGetConfig('domain.whitelist') || '*'
      },
      log: {
        level: dbGetConfig('log.level') || 'info'
      },
      cloud: {
        enabled: dbGetConfig('cloud.enabled') === 'true',
        url: dbGetConfig('cloud.url') || ''
      }
    };
  }
  return config;
}

function ensureAIConfig() {
  const defaults = [
    ['enabled', 'true'],
    ['provider', 'hybrid'],
    ['local.url', 'http://localhost:11434'],
    ['local.model', 'llama3.2'],
    ['cloud.model', 'gpt-4o-mini'],
    ['fallback', 'true'],
  ];
  for (const [key, val] of defaults) {
    const existing = dbGetConfig(`ai.${key}`);
    if (!existing) setAIConfig(key, val);
  }
}

async function main() {
  logger.info('[AutoBrowse] Starting runtime...');
  
  await initDb();
  logger.info('[DB] Initialized');
  
  ensureAIConfig();
  logger.info('[AI Config] Initialized');
  
  const agent = getOrCreateDefaultAgent();
  logger.info('[Agent] Ready', { agent: agent.name });
  
  const cfg = getAppConfig();
  logger.info('[Config] Loaded', { port: cfg.port });
  
  const server = Fastify();
  
  server.get('/', async (request, reply) => {
    const fs = await import('fs');
    const html = fs.readFileSync(path.join(__dirname, '../electron/index.html'), 'utf-8');
    reply.type('text/html').send(html);
  });
  
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString(), version: 'v0.2.0', build: new Date().toISOString() }));
  
  server.get('/debug', async () => ({ 
    debug: isDebugMode(),
    version: 'v0.2.0',
    git: process.env.GIT_SHA?.slice(0,7) || 'dev',
    build: new Date().toISOString(),
    port: cfg.port,
    queueSize: getQueueSize()
  }));
  
  server.put('/debug', async (request: any) => {
    const { enabled } = request.body || {};
    setDebugMode(enabled);
    return { success: true, debug: isDebugMode() };
  });

  server.get('/flags', async () => ({ flags: getFeatureFlags() }));
  
  server.get('/admin', async () => ({
    version: 'v0.2.0',
    build: new Date().toISOString(),
    debug: isDebugMode(),
    stats: {
      tasks: getTasks({ limit: 1000 }).length,
      recordings: getRecordings().length,
      profiles: getProfiles().length
    }
  }));
  
  server.get('/admin/system', async () => {
    const debug = isDebugMode();
    const flags = getFeatureFlags();
    return { debug, flags };
  });
  
  server.put('/admin/system', async (request: any) => {
    const { debug, flags } = request.body || {};
    if (typeof debug === 'boolean') {
      setDebugMode(debug);
    }
    if (flags) {
      for (const [name, enabled] of Object.entries(flags)) {
        setFeatureFlag(name, Boolean(enabled));
      }
    }
    return { success: true };
  });
  
  server.get('/admin/audit', async () => {
    const tasks = getTasks({ limit: 50 });
    const recordings = getRecordings().slice(0, 20);
    return { tasks, recordings };
  });
   
  server.put('/flags/:name', async (request: any) => {
    const { name } = request.params;
    const { enabled, expiresAt } = request.body || {};
    setFeatureFlag(name, enabled, 'global', expiresAt);
    return { success: true, flag: getFeatureFlag(name) };
  });
  
  server.post('/prompt', async (request: any, reply: any) => {
    const instruction = typeof request.body === 'string' 
      ? request.body 
      : request.body?.instruction || request.body?.text;
    
    if (!instruction) {
      return { error: 'Provide instruction as body text, {"instruction": "..."}, or {"text": "..."}' };
    }

    logger.info('[Prompt] Creating task', { instruction });
    
    if (!currentSessionId) {
      currentSessionId = `session-${Date.now()}`;
    }
    
    const task = createTask({
      agent_id: getAgent().id,
      instruction,
      payload: null,
      priority: 1,
      session_id: currentSessionId,
      started_at: null,
      finished_at: null,
      result: null,
      error: null
    });
    
    logger.info('[Prompt] Task created, processing', { taskId: task.id });
    
    await addTaskToQueue(task.id);
    await processTask(task.id);
    
    logger.info('[Prompt] Task processed, getting result', { taskId: task.id });
    
    let result = getTask(task.id);
    let waitCount = 0;
    while (result && (result.status === 'running' || result.status === 'pending') && waitCount < 60) {
      logger.info('[Prompt] Waiting for task', { taskId: task.id, status: result.status, waitCount, attempts: result.attempts });
      await new Promise(r => setTimeout(r, 500));
      result = getTask(task.id);
      waitCount++;
    }
    
    logger.info('[Prompt] Task final status', { taskId: task.id, status: result?.status, attempts: result?.attempts });
    
    if (result?.status === 'completed') {
      return { status: 'OK' };
    } else if (result?.status === 'failed') {
      return { status: 'FAILED', message: result.error };
    } else if (result?.status === 'running') {
      return { status: 'FAILED', message: 'Task timed out after 15s', details: { taskId: task.id, status: 'running' } };
    } else if (result?.status === 'pending') {
      return { status: 'FAILED', message: 'Task still pending - worker may be stuck', details: { taskId: task.id, status: 'pending', attempts: result.attempts } };
    }
    return { status: 'FAILED', message: 'Unknown task state', details: { taskId: task.id, status: result?.status, attempts: result?.attempts } };
  });
  
  server.post('/tasks', async (request: any) => {
    const { instruction, payload, priority = 1, session_id } = request.body || {};
    if (!instruction) {
      return { error: 'instruction is required' };
    }
    const agent = getAgent();
    const task = createTask({
      agent_id: agent.id,
      instruction,
      payload: payload || null,
      priority,
      session_id: session_id || null,
      started_at: null,
      finished_at: null,
      result: null,
      error: null
    });
    await addTaskToQueue(task.id);
    return task;
  });
  
  server.get('/tasks/:id', async (request: any) => {
    const task = getTask(request.params.id);
    if (!task) {
      return { error: 'Task not found' };
    }
    return task;
  });
  
  server.get('/tasks', async (request: any) => {
    const { status, limit } = request.query || {};
    return getTasks({ status, limit: limit ? parseInt(String(limit), 10) : undefined });
  });
  
  server.post('/tasks/:id/cancel', async (request: any) => {
    const task = getTask(request.params.id);
    if (!task) {
      return { error: 'Task not found' };
    }
    if (task.status !== 'pending' && task.status !== 'running') {
      return { error: 'Task cannot be cancelled' };
    }
    updateTaskStatus(task.id, 'cancelled');
    return { success: true };
  });
  
  server.get('/sessions', async () => {
    const active = browserManager.isInitialized();
    return [{
      id: currentSessionId || 'default',
      active,
      created_at: currentSessionId ? new Date().toISOString() : null
    }];
  });

  server.post('/sessions/reset', async () => {
    await browserManager.close();
    currentSessionId = null;
    return { status: 'OK', message: 'Browser session reset' };
  });
  
  server.get('/config', async () => {
    const cfg = getAppConfig();
    const agent = getOrCreateDefaultAgent();
    return {
      port: cfg.port,
      browser: cfg.browser,
      task: cfg.task,
      agent: { id: agent.id, name: agent.name }
    };
  });
  
  server.get('/ai/config', async () => ({ config: aiGateway.getConfig() }));

  server.put('/ai/config', async (request: any) => {
    const { provider, model, apiKey, enabled, fallback } = request.body || {};
    await aiGateway.updateConfig({ 
      provider, 
      local: { url: 'http://localhost:11434', model }, 
      cloud: { apiKey, model }, 
      enabled, 
      fallback 
    });
    return { success: true, config: aiGateway.getConfig() };
  });

  server.get('/ai/models', async (request: any) => {
    const { provider } = request.query || {};
    if (provider === 'local' || provider === 'cloud') {
      return { provider, models: await aiGateway.listModels(provider) };
    }
    return {
      local: await aiGateway.listModels('local'),
      cloud: await aiGateway.listModels('cloud')
    };
  });

  server.post('/ai/test', async (request: any) => {
    const { provider, model } = request.body || {};
    const available = await aiGateway.testProvider(provider || 'local', model);
    return { available };
  });
  
  server.get('/recordings', async () => ({ recordings: getRecordings() }));

  server.get('/recordings/:id', async (request: any) => {
    const recording = getRecording(request.params.id);
    if (!recording) return { error: 'Recording not found' };
    return recording;
  });

  server.post('/recordings', async (request: any) => {
    const { name, description } = request.body || {};
    if (!name) return { error: 'name is required' };
    recorder.startRecording();
    return { success: true, message: 'Recording started. Use /recordings/:id/stop to finish.' };
  });

  server.post('/recordings/:id/stop', async (request: any) => {
    const { name, description } = request.body || {};
    try {
      const recording = recorder.stopRecording(name || 'Untitled', description);
      return recording;
    } catch (err) {
      return { error: String(err) };
    }
  });

  server.post('/recordings/:id/cancel', async () => {
    recorder.cancelRecording();
    return { success: true };
  });

  server.post('/recordings/:id/play', async (request: any) => {
    const { speed } = request.body || {};
    try {
      await replayer.playFromStart(request.params.id, speed);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  server.delete('/recordings/:id', async (request: any) => {
    deleteRecording(request.params.id);
    return { success: true };
  });

  server.get('/profiles', async () => ({ profiles: getProfiles() }));

  server.get('/profiles/:id', async (request: any) => {
    const profile = getProfile(request.params.id);
    if (!profile) return { error: 'Profile not found' };
    return profile;
  });

  server.post('/profiles', async (request: any) => {
    const { name } = request.body || {};
    if (!name) return { error: 'name is required' };
    const profile = await createProfileFromCurrent(name);
    return profile;
  });

  server.post('/profiles/:id/load', async (request: any) => {
    try {
      await loadProfile(request.params.id);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  server.delete('/profiles/:id', async (request: any) => {
    deleteProfile(request.params.id);
    return { success: true };
  });

  server.post<{ Body: GoalInput }>('/execute-goal', async (request, reply) => {
    const goalInput = request.body as GoalInput;
    
    if (!goalInput.goal) {
      return reply.status(400).send({ error: 'goal is required' });
    }

    logger.info('[ExecuteGoal] Starting execution', { goal: goalInput.goal });

    try {
      if (!browserManager.isInitialized()) {
        await browserManager.initialize();
      }

      if (goalInput.screenshotConfig) {
        browserManager.setScreenshotConfig(goalInput.screenshotConfig);
        logger.info('[ExecuteGoal] Screenshot config set', { config: goalInput.screenshotConfig });
      }

      const executor = new GoalExecutor(browserManager, aiGateway);
      const result = await executor.execute(goalInput);

      logger.info('[ExecuteGoal] Completed', { 
        goal: goalInput.goal, 
        status: result.status,
        goalStatus: result.goalStatus 
      });

      return result;
    } catch (err) {
      logger.error('[ExecuteGoal] Failed', { error: err });
      return reply.status(500).send({ 
        error: 'Execution failed',
        message: err instanceof Error ? err.message : String(err)
      });
    }
  });
  
  try {
    await server.listen({ port: cfg.port, host: '127.0.0.1' });
    logger.info('[AutoBrowse] Runtime ready', { port: cfg.port });
    
    startWorkerLoop();
  } catch (err) {
    logger.error('Failed to start server', { err });
    throw err;
  }
}

main().catch((err) => {
  logger.fatal('[AutoBrowse] Fatal error', { err });
  process.exit(1);
});

function startWorkerLoop() {
  logger.info('[Worker] Starting worker loop');
  
  async function loop() {
    try {
      const queueSize = getQueueSize();
      
      if (queueSize > 0) {
        const pendingTasks = getTasks({ status: 'pending', limit: 1 });
        
        if (pendingTasks.length > 0) {
          for (const task of pendingTasks) {
            if (!browserManager.isInitialized()) {
              await browserManager.initialize(task.session_id || undefined);
            }
            await processTask(task.id);
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      loop();
    } catch (err) {
      logger.error('[Worker] Error, restarting...', { err });
      setTimeout(loop, 5000);
    }
  }
  
  loop();
}

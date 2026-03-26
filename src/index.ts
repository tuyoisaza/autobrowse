import Fastify from 'fastify';
import { initDb } from './db/index.js';
import { getOrCreateDefaultAgent, getConfig as dbGetConfig } from './db/queries.js';
import { logger } from './logger/index.js';
import { createTask, getTask, getTasks, updateTaskStatus, getOrCreateDefaultAgent as getAgent } from './db/queries.js';
import { addTaskToQueue, getQueueSize } from './queue/queue.js';
import { processTask } from './worker/processor.js';

let config: any = {};

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

async function main() {
  logger.info('[AutoBrowse] Starting runtime...');
  
  await initDb();
  logger.info('[DB] Initialized');
  
  const agent = getOrCreateDefaultAgent();
  logger.info('[Agent] Ready', { agent: agent.name });
  
  const cfg = getAppConfig();
  logger.info('[Config] Loaded', { port: cfg.port });
  
  const server = Fastify();
  
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  
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
    return [];
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
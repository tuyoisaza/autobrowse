import { createLogger } from '../logger/index.js';
import tasksRouter from './routes/tasks.js';
import sessionsRouter from './routes/sessions.js';
import configRouter from './routes/config.js';
import healthRouter from './routes/health.js';

const logger = createLogger('api');

export async function startApiServer(server: any, getConfig: () => any) {
  await server.register(corsPlugin);
  
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  
  await server.register(tasksRouter, { prefix: '/tasks' });
  await server.register(sessionsRouter, { prefix: '/sessions' });
  await server.register(configRouter, { prefix: '/config', getConfig });
  await server.register(healthRouter, { getConfig });
  
  logger.info('API routes registered');
}

async function corsPlugin(fastify: any) {
  fastify.addHeader('Access-Control-Allow-Origin', '*');
  fastify.addHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  fastify.addHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  fastify.options('*', async () => ({ ok: true }));
}
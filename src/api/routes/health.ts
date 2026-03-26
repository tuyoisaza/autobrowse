import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/index.js';

export default async function healthRouter(fastify: FastifyInstance, options: { getConfig: () => any }) {
  fastify.get('/health/detailed', async (_request, reply) => {
    try {
      const db = getDb();
      const taskCount = db.exec('SELECT COUNT(*) as count FROM tasks');
      const pendingTasks = db.exec("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'");
      const runningTasks = db.exec("SELECT COUNT(*) as count FROM tasks WHERE status = 'running'");
      
      return reply.send({
        status: 'ok',
        db: 'connected',
        tasks: {
          total: taskCount[0]?.values[0]?.[0] || 0,
          pending: pendingTasks[0]?.values[0]?.[0] || 0,
          running: runningTasks[0]?.values[0]?.[0] || 0
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
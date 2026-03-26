import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getOrCreateDefaultAgent, getConfig as dbGetConfig, setConfig as dbSetConfig } from '../../db/queries.js';

export default async function configRouter(fastify: FastifyInstance, options: { getConfig: () => any }) {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const cfg = options.getConfig();
    const agent = getOrCreateDefaultAgent();
    
    return reply.send({
      port: cfg.port,
      browser: cfg.browser,
      task: cfg.task,
      domain: cfg.domain,
      log: cfg.log,
      cloud: cfg.cloud,
      agent: {
        id: agent.id,
        name: agent.name,
        machine_name: agent.machine_name
      }
    });
  });
  
  fastify.patch<{ Body: Record<string, any> }>('/', async (request: FastifyRequest<{ Body: Record<string, any> }>, reply: FastifyReply) => {
    const updates = request.body;
    
    if (updates.port) dbSetConfig('port', String(updates.port));
    if (updates.browser?.headless !== undefined) dbSetConfig('browser.headless', String(updates.browser.headless));
    if (updates.browser?.profilePath) dbSetConfig('browser.profilePath', updates.browser.profilePath);
    if (updates.task?.timeout) dbSetConfig('task.timeout', String(updates.task.timeout));
    if (updates.task?.maxRetries) dbSetConfig('task.maxRetries', String(updates.task.maxRetries));
    if (updates.domain?.whitelist) dbSetConfig('domain.whitelist', updates.domain.whitelist);
    if (updates.log?.level) dbSetConfig('log.level', updates.log.level);
    if (updates.cloud?.enabled !== undefined) dbSetConfig('cloud.enabled', String(updates.cloud.enabled));
    if (updates.cloud?.url) dbSetConfig('cloud.url', updates.cloud.url);
    
    return reply.send({ success: true });
  });
}
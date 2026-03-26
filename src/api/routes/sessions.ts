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
  
  fastify.post<{ Params: { id: string } }>('/:id/reset', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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
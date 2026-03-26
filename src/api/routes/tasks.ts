import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createTask, getTask, getTasks, updateTaskStatus, getOrCreateDefaultAgent } from '../../db/queries.js';
import { addTaskToQueue } from '../../queue/queue.js';

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
      session_id: session_id || null,
      started_at: null,
      finished_at: null,
      result: null,
      error: null
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
  
  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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
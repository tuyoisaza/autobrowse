import { createLogger } from '../logger/index.js';

const logger = createLogger('queue');

const pendingTasks = new Map<string, string>();

export async function addTaskToQueue(taskId: string) {
  pendingTasks.set(taskId, taskId);
  logger.info('Task added to queue', { taskId });
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
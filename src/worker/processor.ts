import { createLogger } from '../logger/index.js';
import { getTask, updateTaskStatus, incrementTaskAttempts, createTaskEvent, getConfig as dbGetConfig } from '../db/queries.js';
import { browserManager } from '../browser/manager.js';
import { executeAction } from '../browser/actions.js';
import { parseInstruction } from './interpreter.js';
import * as fs from 'fs';

const logger = createLogger('worker');

function getWorkerConfig() {
  return {
    timeout: parseInt(dbGetConfig('task.timeout') || '300000', 10),
    maxRetries: parseInt(dbGetConfig('task.maxRetries') || '3', 10)
  };
}

export async function processTask(taskId: string): Promise<void> {
  logger.info('Processing task', { taskId });
  
  const task = getTask(taskId);
  if (!task) {
    logger.error('Task not found', { taskId });
    return;
  }
  
  if (task.status !== 'pending') {
    logger.warn('Task not pending', { taskId, status: task.status });
    return;
  }
  
  const config = getWorkerConfig();
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
      logger.info('Executing action', { step: i + 1, action: action.type });
      
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
    logger.info('Task completed', { taskId });
    
  } catch (err) {
    logger.error('Task failed', { taskId, err });
    
    const maxRetries = config.maxRetries;
    if (task.attempts < maxRetries) {
      incrementTaskAttempts(taskId);
      updateTaskStatus(taskId, 'pending', undefined, String(err));
      logger.info('Task will retry', { taskId, attempt: task.attempts + 1 });
    } else {
      updateTaskStatus(taskId, 'failed', undefined, String(err));
    }
  } finally {
    await browserManager.close();
  }
}
import { getTasks } from '../db/queries.js';
import { processTask } from './processor.js';
import { createLogger } from '../logger/index.js';
import { getQueueSize } from '../queue/queue.js';

const logger = createLogger('worker-main');

async function runWorker() {
  logger.info('Starting worker...');
  
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
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      loop();
    } catch (err) {
      logger.error('Worker error, restarting...', { err });
      setTimeout(loop, 5000);
    }
  }
  
  loop();
}

runWorker().catch(err => {
  logger.fatal('Worker failed to start', { err });
  process.exit(1);
});
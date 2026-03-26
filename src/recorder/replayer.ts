import { browserManager } from '../browser/manager.js';
import { getRecording } from '../db/queries.js';
import { deserializeActions, RecordedAction } from './actions.js';
import { executeAction } from '../browser/actions.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('replayer');

export interface ReplayOptions {
  speed?: number;
  startAt?: number;
  onProgress?: (current: number, total: number) => void;
}

export class Replayer {
  async playRecording(recordingId: string, options: ReplayOptions = {}) {
    const recording = getRecording(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const actions = deserializeActions(recording.actions);
    if (actions.length === 0) {
      throw new Error('No actions to replay');
    }

    const speed = options.speed || 1;
    const startAt = options.startAt || 0;
    const onProgress = options.onProgress || (() => {});

    logger.info('Starting replay', { recordingId, actions: actions.length, speed });

    await browserManager.initialize();
    const page = browserManager.getPage();

    let lastTimestamp = startAt;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      if (action.timestamp < startAt) continue;
      
      const delay = action.timestamp - lastTimestamp;
      if (delay > 0 && speed > 0) {
        await new Promise(resolve => setTimeout(resolve, delay / speed));
      }

      logger.debug('Replaying action', { step: i + 1, type: action.type });
      
      const result = await executeAction(page, {
        type: action.type,
        selector: action.selector,
        value: action.value,
        key: action.key
      });

      if (!result.success) {
        logger.error('Replay action failed', { step: i + 1, type: action.type, error: result.error });
        throw new Error(`Action ${i + 1} failed: ${result.error}`);
      }

      lastTimestamp = action.timestamp;
      onProgress(i + 1, actions.length);
    }

    logger.info('Replay completed', { recordingId });
    await browserManager.close();
  }

  async playFromStart(recordingId: string, speed: number = 1) {
    return this.playRecording(recordingId, { speed });
  }
}

export const replayer = new Replayer();

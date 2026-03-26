import { browserManager, exportBrowserState } from '../browser/manager.js';
import { createRecording } from '../db/queries.js';
import { RecordedAction, serializeAction } from './actions.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('recorder');

export class Recorder {
  private actions: RecordedAction[] = [];
  private startTime: number = 0;
  private isRecording: boolean = false;
  private currentSessionId: string | null = null;

  startRecording(sessionId?: string): void {
    this.actions = [];
    this.startTime = Date.now();
    this.isRecording = true;
    this.currentSessionId = sessionId || null;
    logger.info('Recording started');
  }

  recordAction(action: any): void {
    if (!this.isRecording) return;
    
    const recorded = serializeAction(action);
    recorded.timestamp = Date.now() - this.startTime;
    this.actions.push(recorded);
    logger.debug('Action recorded', { type: action.type, timestamp: recorded.timestamp });
  }

  stopRecording(name: string, description?: string) {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }
    
    const duration = Date.now() - this.startTime;
    const recording = createRecording({
      name,
      description: description || null,
      actions: JSON.stringify(this.actions),
      duration
    });
    
    this.isRecording = false;
    this.actions = [];
    this.currentSessionId = null;
    
    logger.info('Recording saved', { id: recording.id, name, duration });
    return recording;
  }

  cancelRecording(): void {
    this.isRecording = false;
    this.actions = [];
    this.currentSessionId = null;
    logger.info('Recording cancelled');
  }

  isActive(): boolean {
    return this.isRecording;
  }

  async captureBrowserState(): Promise<{
    cookies: string;
    localStorage: string;
    sessionStorage: string;
  }> {
    const page = browserManager.getPage();
    const state = await exportBrowserState(page);
    return {
      cookies: JSON.stringify(state.cookies),
      localStorage: JSON.stringify(state.localStorage),
      sessionStorage: JSON.stringify(state.sessionStorage)
    };
  }
}

export const recorder = new Recorder();

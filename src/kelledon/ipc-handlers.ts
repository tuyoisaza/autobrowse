import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { GoalInput, ExecutionResult } from '../worker/types.js';
import { AutoBrowseEngine } from '../runtime/autobrowse-engine.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('kelledon:ipc');

export interface IPCChannel {
  name: string;
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>;
}

export class IPCServer {
  private engine: AutoBrowseEngine | null = null;
  private registeredChannels: string[] = [];

  setEngine(engine: AutoBrowseEngine): void {
    this.engine = engine;
  }

  registerChannels(): void {
    this.register('execute-goal', this.handleExecuteGoal.bind(this));
    this.register('get-available-goals', this.handleGetAvailableGoals.bind(this));
    this.register('abort-execution', this.handleAbortExecution.bind(this));
    this.register('get-engine-status', this.handleGetEngineStatus.bind(this));
    this.register('register-goal-handler', this.handleRegisterGoalHandler.bind(this));

    logger.info('IPC channels registered', { channels: this.registeredChannels });
  }

  private register(name: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any>): void {
    if (this.registeredChannels.includes(name)) {
      logger.warn(`Channel already registered: ${name}`);
      return;
    }

    ipcMain.handle(name, handler);
    this.registeredChannels.push(name);
    logger.info(`IPC channel registered: ${name}`);
  }

  unregisterAll(): void {
    for (const channel of this.registeredChannels) {
      ipcMain.removeHandler(channel);
    }
    this.registeredChannels = [];
    logger.info('All IPC channels unregistered');
  }

  private async handleExecuteGoal(event: IpcMainInvokeEvent, input: GoalInput): Promise<ExecutionResult> {
    if (!this.engine) {
      throw new Error('AutoBrowse engine not initialized');
    }

    logger.info('IPC: execute-goal received', { goal: input.goal });

    try {
      const result = await this.engine.executeGoal(input);
      logger.info('IPC: execute-goal completed', { 
        executionId: result.executionId, 
        status: result.status,
        goalStatus: result.goalStatus 
      });
      return result;
    } catch (err) {
      logger.error('IPC: execute-goal failed', { error: err });
      throw err;
    }
  }

  private async handleGetAvailableGoals(): Promise<string[]> {
    if (!this.engine) {
      return [];
    }
    return this.engine.getAvailableGoals();
  }

  private async handleAbortExecution(): Promise<{ success: boolean }> {
    if (!this.engine) {
      return { success: false };
    }

    try {
      this.engine.abort();
      return { success: true };
    } catch (err) {
      logger.error('IPC: abort-execution failed', { error: err });
      return { success: false };
    }
  }

  private async handleGetEngineStatus(): Promise<{
    initialized: boolean;
    connected: boolean;
    isExecuting: boolean;
    availableGoals: string[];
  }> {
    if (!this.engine) {
      return {
        initialized: false,
        connected: false,
        isExecuting: false,
        availableGoals: []
      };
    }

    return {
      initialized: this.engine.isInitialized(),
      connected: this.engine.isConnected(),
      isExecuting: this.engine.isGoalExecuting(),
      availableGoals: this.engine.getAvailableGoals()
    };
  }

  private async handleRegisterGoalHandler(
    event: IpcMainInvokeEvent, 
    handler: { goal: string; description: string; mapToSteps: (inputs: Record<string, any>) => any[]; validateResult?: (result: any[], evidence: any) => 'achieved' | 'failed' | 'uncertain' }
  ): Promise<{ success: boolean }> {
    if (!this.engine) {
      throw new Error('AutoBrowse engine not initialized');
    }

    try {
      this.engine.registerGoalHandler(handler);
      logger.info('IPC: goal handler registered', { goal: handler.goal });
      return { success: true };
    } catch (err) {
      logger.error('IPC: register-goal-handler failed', { error: err, goal: handler.goal });
      return { success: false };
    }
  }
}

export const ipcServer = new IPCServer();

import type { ElectronSession } from './electron-adapter.js';
import { createElectronAdapter, ElectronAdapter } from './electron-adapter.js';
import { createGoalExecutor, GoalExecutor, GoalInput, goalMapper, GoalHandler } from '../worker/worker.js';
import type { BrowserManager } from '../browser/manager.js';
import { createLogger } from '../logger/index.js';
import { EventEmitter } from 'events';

const logger = createLogger('runtime:autobrowse-engine');

export interface KelledonHost {
  electronSession: ElectronSession;
  onGoalComplete?: (result: any) => void;
  onGoalError?: (error: Error) => void;
  onStepComplete?: (step: any, result: any) => void;
  onStepError?: (step: any, error: Error) => void;
}

export interface EngineConfig {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  screenshotOnFailure?: boolean;
  defaultTimeout?: number;
}

export type EngineState = 'idle' | 'connecting' | 'connected' | 'executing' | 'error' | 'disposed';

export class AutoBrowseEngine extends EventEmitter {
  private electronAdapter: ElectronAdapter;
  private browserManager: BrowserManager;
  private goalExecutor: GoalExecutor;
  private host: KelledonHost;
  private config: Required<EngineConfig>;
  private state: EngineState = 'idle';
  private isExecuting: boolean = false;

  constructor(host: KelledonHost, config: EngineConfig = {}) {
    super();
    this.host = host;
    this.config = {
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
      screenshotOnFailure: config.screenshotOnFailure ?? true,
      defaultTimeout: config.defaultTimeout ?? 60000
    };
    
    this.electronAdapter = createElectronAdapter({
      autoReconnect: this.config.autoReconnect,
      maxReconnectAttempts: this.config.maxReconnectAttempts
    });
    
    this.browserManager = this.electronAdapter.getBrowserManager();
    this.goalExecutor = createGoalExecutor(this.browserManager);
  }

  async initialize(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'disposed') {
      logger.warn('Engine already initialized', { state: this.state });
      return;
    }

    this.setState('connecting');
    logger.info('Initializing AutoBrowse engine');

    try {
      await this.electronAdapter.connect(this.host.electronSession);
      this.setState('connected');
      logger.info('AutoBrowse engine initialized');
      this.emit('initialized');
    } catch (err) {
      this.setState('error');
      logger.error('Failed to initialize engine', { error: err });
      throw err;
    }
  }

  async executeGoal(input: GoalInput): Promise<any> {
    if (this.state !== 'connected') {
      throw new Error(`Cannot execute goal: engine state is ${this.state}. Call initialize() first.`);
    }

    if (this.isExecuting) {
      throw new Error('Engine is already executing a goal. Wait for completion or abort.');
    }

    this.isExecuting = true;
    this.setState('executing');
    logger.info('Executing goal', { goal: input.goal, inputs: input.inputs });

    try {
      const result = await this.goalExecutor.execute(
        {
          ...input,
          constraints: {
            ...input.constraints,
            maxDuration: input.constraints?.maxDuration || this.config.defaultTimeout
          }
        },
        {
          screenshotOnFailure: this.config.screenshotOnFailure
        },
        {
          onStepComplete: (step, stepResult) => {
            logger.info(`Step completed: ${step.type}`, { 
              stepId: stepResult.stepId, 
              success: stepResult.success 
            });
            this.host.onStepComplete?.(step, stepResult);
            this.emit('step_complete', step, stepResult);
          },
          onStepError: (step, error) => {
            logger.error(`Step error: ${step.type}`, { 
              stepId: step.id, 
              error: error.message 
            });
            this.host.onStepError?.(step, error);
            this.emit('step_error', step, error);
          }
        }
      );

      logger.info('Goal execution completed', { 
        executionId: result.executionId,
        status: result.status,
        goalStatus: result.goalStatus,
        stepsExecuted: result.stepsExecuted,
        stepsFailed: result.stepsFailed
      });

      this.host.onGoalComplete?.(result);
      this.emit('goal_complete', result);

      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Goal execution failed', { error: error.message });
      this.host.onGoalError?.(error);
      this.emit('goal_error', error);
      throw error;

    } finally {
      this.isExecuting = false;
      this.setState('connected');
    }
  }

  abort(): void {
    if (!this.isExecuting) {
      logger.warn('No execution to abort');
      return;
    }

    logger.info('Aborting execution');
    this.goalExecutor.abort();
    this.emit('aborted');
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting engine');
    
    if (this.isExecuting) {
      logger.warn('Aborting in-progress execution before disconnect');
      this.abort();
    }

    await this.electronAdapter.disconnect();
    this.setState('idle');
    this.emit('disconnected');
    logger.info('Engine disconnected');
  }

  async dispose(): Promise<void> {
    logger.info('Disposing engine');
    
    await this.disconnect();
    this.removeAllListeners();
    this.setState('disposed');
    this.emit('disposed');
    logger.info('Engine disposed');
  }

  registerGoalHandler(handler: GoalHandler): void {
    goalMapper.register(handler);
    this.goalExecutor.registerGoalHandler(handler);
    logger.info('Goal handler registered', { goal: handler.goal });
  }

  getAvailableGoals(): string[] {
    return goalMapper.getAvailableGoals();
  }

  getGoalDescription(goal: string): string | undefined {
    return goalMapper.getGoalDescription(goal);
  }

  getState(): EngineState {
    return this.state;
  }

  isInitialized(): boolean {
    return this.state === 'connected' || this.state === 'executing';
  }

  isConnected(): boolean {
    return this.electronAdapter.isConnected();
  }

  isGoalExecuting(): boolean {
    return this.isExecuting;
  }

  private setState(state: EngineState): void {
    const previousState = this.state;
    this.state = state;
    logger.debug(`Engine state changed: ${previousState} -> ${state}`);
    this.emit('state_change', state, previousState);
  }
}

export function createAutoBrowseEngine(host: KelledonHost, config?: EngineConfig): AutoBrowseEngine {
  return new AutoBrowseEngine(host, config);
}

export type { GoalInput, ExecutionResult, WorkflowStep, StepResult, GoalStatus, EvidenceData } from '../worker/types.js';
export { goalMapper } from '../worker/goal-mapper.js';
export type { GoalHandler } from '../worker/goal-mapper.js';

import type { Session } from 'electron';
import { AutoBrowseEngine, createAutoBrowseEngine, KelledonHost, EngineConfig } from '../runtime/autobrowse-engine.js';
import { ipcServer } from './ipc-handlers.js';
import { CloudClient, createCloudClient, CloudConfig } from './cloud-client.js';
import { createLogger } from '../logger/index.js';
import type { GoalInput, ExecutionResult } from '../worker/types.js';

const logger = createLogger('kelledon:integration');

export interface KelledonIntegrationConfig {
  engine?: EngineConfig;
  cloud?: CloudConfig;
  autoConnect?: boolean;
}

export class KelledonIntegration {
  private engine: AutoBrowseEngine | null = null;
  private cloudClient: CloudClient | null = null;
  private session: Session | null = null;
  private isInitialized: boolean = false;

  async initialize(session: Session, config: KelledonIntegrationConfig = {}): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Integration already initialized');
      return;
    }

    logger.info('Initializing KELEDON integration');
    this.session = session;

    const host: KelledonHost = {
      electronSession: {
        defaultSession: {
          debuggerWebSocketUrl: this.getDebuggerUrl(session)
        }
      },
      onGoalComplete: (result) => {
        logger.info('Goal completed', { executionId: result.executionId, goalStatus: result.goalStatus });
        this.cloudClient?.sendExecutionResult(result.executionId, result);
      },
      onGoalError: (error) => {
        logger.error('Goal error', { error: error.message });
      },
      onStepComplete: (step, result) => {
        logger.debug('Step complete', { type: step.type, stepId: result.stepId });
      },
      onStepError: (step, error) => {
        logger.error('Step error', { type: step.type, stepId: step.id, error: error.message });
      }
    };

    this.engine = createAutoBrowseEngine(host, config.engine);
    ipcServer.setEngine(this.engine);
    ipcServer.registerChannels();

    if (config.cloud) {
      this.cloudClient = createCloudClient(config.cloud);
      
      this.cloudClient.on('goal', async (goalData) => {
        logger.info('Goal from cloud', { goalId: goalData.goalId, goal: goalData.goal });
        
        try {
          const input: GoalInput = {
            goal: goalData.goal,
            inputs: goalData.inputs || {},
            constraints: goalData.constraints,
            successCriteria: goalData.successCriteria
          };

          const result = await this.engine!.executeGoal(input);
          await this.cloudClient!.sendExecutionResult(goalData.goalId, result);
        } catch (err) {
          logger.error('Failed to execute goal from cloud', { goalId: goalData.goalId, error: err });
        }
      });

      this.cloudClient.on('cancel', (executionId) => {
        logger.info('Cancel from cloud', { executionId });
        this.engine?.abort();
      });

      this.cloudClient.on('config_update', (configUpdate) => {
        logger.info('Config update from cloud', { config: configUpdate });
      });

      if (config.autoConnect !== false) {
        await this.cloudClient.connect();
      }
    }

    await this.engine.initialize();
    this.isInitialized = true;
    logger.info('KELEDON integration initialized');
  }

  private getDebuggerUrl(_session: Session): string {
    const { Session } = require('electron');
    const debugUrl = (Session as any).defaultSession?.debuggerWebSocketUrl;
    if (!debugUrl) {
      throw new Error('Electron debugger not enabled. Enable with session.setDevToolsWebContents() or BrowserWindow.webContents.openDevTools()');
    }
    return debugUrl;
  }

  async executeGoal(input: GoalInput): Promise<ExecutionResult> {
    if (!this.engine) {
      throw new Error('Integration not initialized. Call initialize() first.');
    }
    return this.engine.executeGoal(input);
  }

  async abort(): Promise<void> {
    this.engine?.abort();
  }

  async dispose(): Promise<void> {
    logger.info('Disposing KELEDON integration');
    
    ipcServer.unregisterAll();
    this.cloudClient?.disconnect();
    await this.engine?.dispose();
    
    this.isInitialized = false;
    logger.info('KELEDON integration disposed');
  }

  getEngine(): AutoBrowseEngine | null {
    return this.engine;
  }

  getCloudClient(): CloudClient | null {
    return this.cloudClient;
  }

  isReady(): boolean {
    return this.isInitialized && (this.engine?.isInitialized() ?? false);
  }
}

export function createKelledonIntegration(): KelledonIntegration {
  return new KelledonIntegration();
}

export { AutoBrowseEngine, createAutoBrowseEngine } from '../runtime/autobrowse-engine.js';
export type { KelledonHost, EngineConfig } from '../runtime/autobrowse-engine.js';
export type { GoalInput, ExecutionResult, WorkflowStep, StepResult, GoalStatus, EvidenceData } from '../worker/types.js';
export { goalMapper } from '../worker/goal-mapper.js';
export type { GoalHandler } from '../worker/goal-mapper.js';
export { ipcServer } from './ipc-handlers.js';
export { CloudClient, createCloudClient } from './cloud-client.js';
export type { CloudConfig, CloudMessage, CloudGoalMessage, ExecutionEvent } from './cloud-client.js';

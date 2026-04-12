import { EventEmitter } from 'events';
import { ExecutionResult } from '../worker/types.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('kelledon:cloud-client');

export interface CloudConfig {
  url: string;
  deviceId: string;
  token: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface CloudMessage {
  type: 'goal' | 'cancel' | 'ping' | 'config_update' | 'sync_request' | 'complete' | 'error' | 'start' | 'step_complete' | 'step_error';
  id?: string;
  payload?: any;
  deviceId?: string;
  timestamp?: number;
}

export interface CloudGoalMessage extends CloudMessage {
  type: 'goal';
  payload: {
    goalId: string;
    goal: string;
    inputs: Record<string, any>;
    constraints?: any;
    successCriteria?: any;
    priority?: number;
    timeout?: number;
  };
}

export interface ExecutionEvent {
  type: 'start' | 'step_complete' | 'step_error' | 'complete' | 'error';
  executionId: string;
  timestamp: number;
  data?: any;
}

export class CloudClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: CloudConfig;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private pendingGoals: Map<string, (result: ExecutionResult) => void> = new Map();
  private executionQueue: CloudGoalMessage[] = [];

  constructor(config: CloudConfig) {
    super();
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      ...config
    };
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      logger.warn('Cloud client already connected or connecting');
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const url = `${this.config.url}/ws/device/${this.config.deviceId}?token=${encodeURIComponent(this.config.token)}`;
      logger.info('Connecting to cloud', { url });

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          logger.info('Cloud connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startPing();
          this.emit('connected');
          this.processExecutionQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          logger.error('Cloud WebSocket error', { error });
          this.emit('error', error);
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(error);
          }
        };

        this.ws.onclose = (event) => {
          logger.info('Cloud disconnected', { code: event.code, reason: event.reason });
          this.isConnecting = false;
          this.stopPing();
          this.emit('disconnected');
          this.scheduleReconnect();
        };

      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.clearReconnectTimeout();
    this.stopPing();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.pendingGoals.clear();
    this.emit('disconnected');
    logger.info('Cloud client disconnected');
  }

  async sendExecutionResult(executionId: string, result: ExecutionResult): Promise<void> {
    return this.send({
      type: 'complete',
      id: executionId,
      payload: {
        status: result.status,
        goalStatus: result.goalStatus,
        stepsExecuted: result.stepsExecuted,
        stepsFailed: result.stepsFailed,
        duration: result.duration,
        evidence: {
          finalUrl: result.evidence.finalUrl,
          finalTitle: result.evidence.finalTitle,
          screenshotsCount: result.evidence.screenshots.length,
          extractedDataKeys: Object.keys(result.evidence.extractedData)
        },
        error: result.error
      }
    });
  }

  sendExecutionEvent(event: ExecutionEvent): void {
    this.send({
      type: event.type === 'complete' ? 'complete' : event.type,
      id: event.executionId,
      payload: event.data
    });
  }

  async send(message: CloudMessage): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Cannot send message, not connected');
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not available'));
        return;
      }

      try {
        this.ws.send(JSON.stringify({
          ...message,
          deviceId: this.config.deviceId,
          timestamp: Date.now()
        }));
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as CloudMessage;
      logger.debug('Cloud message received', { type: message.type, id: message.id });

      switch (message.type) {
        case 'goal':
          this.handleGoalMessage(message as CloudGoalMessage);
          break;
          
        case 'cancel':
          this.handleCancelMessage(message);
          break;
          
        case 'ping':
          this.handlePing();
          break;
          
        case 'config_update':
          this.handleConfigUpdate(message);
          break;
          
        case 'sync_request':
          this.handleSyncRequest();
          break;
          
        default:
          logger.warn('Unknown message type', { type: message.type });
      }

      this.emit('message', message);
    } catch (err) {
      logger.error('Failed to parse cloud message', { error: err, data });
    }
  }

  private handleGoalMessage(message: CloudGoalMessage): void {
    logger.info('Goal received from cloud', { 
      goalId: message.payload.goalId, 
      goal: message.payload.goal 
    });
    this.emit('goal', message.payload);
  }

  private handleCancelMessage(message: CloudMessage): void {
    const executionId = message.id;
    logger.info('Cancel received from cloud', { executionId });
    this.emit('cancel', executionId);
  }

  private handlePing(): void {
    this.send({ type: 'ping' }).catch(() => {});
  }

  private handleConfigUpdate(message: CloudMessage): void {
    logger.info('Config update received', { payload: message.payload });
    this.emit('config_update', message.payload);
  }

  private handleSyncRequest(): void {
    logger.info('Sync request received');
    this.emit('sync_request');
    this.send({
      type: 'sync_request',
      payload: { status: 'ready', deviceId: this.config.deviceId }
    }).catch(() => {});
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      logger.error('Max reconnect attempts reached');
      this.emit('reconnect_failed');
      return;
    }

    this.clearReconnectTimeout();
    const delay = this.config.reconnectInterval || 5000;
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      logger.info(`Reconnecting to cloud (attempt ${this.reconnectAttempts})`);
      this.connect().catch(() => {});
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' }).catch(() => {});
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private processExecutionQueue(): void {
    for (const goal of this.executionQueue) {
      this.handleGoalMessage(goal);
    }
    this.executionQueue = [];
  }
}

export function createCloudClient(config: CloudConfig): CloudClient {
  return new CloudClient(config);
}

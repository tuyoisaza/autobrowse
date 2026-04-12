import type { Page } from 'playwright';
import { GoalInput, ExecutionResult, GoalStatus, EvidenceData, StepResult, WorkflowStep } from './types.js';
import { goalMapper as defaultGoalMapper, GoalMapper, GoalHandler } from './goal-mapper.js';
import { executeSteps, ExecutionContext } from './step-executor.js';
import type { BrowserManager } from '../browser/index.js';
import type { AIGateway } from '../ai/gateway.js';
import { createLogger } from '../logger/index.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('worker:orchestrator');

export interface ExecutionOptions {
  stopOnError?: boolean;
  maxDuration?: number;
  screenshotOnEachStep?: boolean;
  screenshotOnFailure?: boolean;
}

export interface ExecutionProgress {
  onStepComplete?: (step: WorkflowStep, result: StepResult) => void;
  onStepError?: (step: WorkflowStep, error: Error) => void;
}

export class GoalExecutor {
  private goalMapper: GoalMapper;
  private browserManager: BrowserManager;
  private aiGateway?: AIGateway;
  private isExecuting: boolean = false;
  private abortController?: AbortController;

  constructor(browserManager: BrowserManager, aiGateway?: AIGateway, goalMapper?: GoalMapper) {
    this.browserManager = browserManager;
    this.aiGateway = aiGateway;
    this.goalMapper = goalMapper ?? defaultGoalMapper;
  }

  get isInitialized(): boolean {
    return this.browserManager.isInitialized();
  }

  async execute(
    input: GoalInput,
    options: ExecutionOptions = {},
    progress?: ExecutionProgress
  ): Promise<ExecutionResult> {
    if (this.isExecuting) {
      throw new Error('Executor is already executing a goal. Wait for completion.');
    }

    this.isExecuting = true;
    this.abortController = new AbortController();

    const executionId = uuidv4();
    const startTime = Date.now();
    let page: Page | null = null;
    let context: ExecutionContext | null = null;

    logger.info('Starting goal execution', { executionId, goal: input.goal, inputs: input.inputs });

    try {
      if (!this.browserManager.isInitialized()) {
        await this.browserManager.initialize(undefined, { mode: 'launch' });
      }

      page = this.browserManager.getPage();
      if (!page) {
        throw new Error('Browser page not available');
      }

      const steps = this.goalMapper.mapToSteps(input);
      logger.info('Steps generated', { executionId, stepCount: steps.length, goal: input.goal });

      if (options.maxDuration) {
        this.abortController.signal.addEventListener('abort', () => {
          logger.warn('Execution aborted due to max duration', { executionId });
        });
        setTimeout(() => this.abortController?.abort(), options.maxDuration);
      }

      const enhancedProgress = progress ? {
        onStepComplete: (step: WorkflowStep, result: StepResult) => {
          logger.info(`Step completed: ${step.type}`, { 
            stepId: result.stepId, 
            success: result.success, 
            duration: result.duration 
          });
          progress.onStepComplete?.(step, result);
        },
        onStepError: (step: WorkflowStep, error: Error) => {
          logger.error(`Step failed: ${step.type}`, { stepId: step.id, error: error.message });
          progress.onStepError?.(step, error);
        }
      } : undefined;

      context = await executeSteps(
        page,
        steps,
        enhancedProgress,
        options.stopOnError ?? input.constraints?.stopOnError ?? true,
        this.abortController.signal
      );

      if (options.screenshotOnFailure && context.stepResults.some(r => !r.success)) {
        const failedPage = await this.captureErrorScreenshot(page, context);
        if (failedPage) {
          context.evidence.screenshots.push(failedPage);
        }
      }

      const goalStatus = this.goalMapper.validateGoalStatus(input, context.stepResults, context.evidence);
      const duration = Date.now() - startTime;

      const result: ExecutionResult = {
        executionId,
        status: this.determineStatus(context.stepResults, goalStatus),
        goalStatus,
        stepsExecuted: context.stepResults.filter(r => r.success).length,
        stepsFailed: context.stepResults.filter(r => !r.success).length,
        duration,
        stepResults: context.stepResults,
        evidence: context.evidence
      };

      logger.info('Goal execution completed', {
        executionId,
        status: result.status,
        goalStatus: result.goalStatus,
        duration,
        stepsExecuted: result.stepsExecuted,
        stepsFailed: result.stepsFailed
      });

      return result;

    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);

      logger.error('Goal execution failed', { executionId, error });

      let errorScreenshot: Buffer | string | undefined;
      if (options.screenshotOnFailure && page) {
        errorScreenshot = await this.captureErrorScreenshot(page, context);
      }

      const stepResults = context?.stepResults || [];
      const evidence = context?.evidence || { screenshots: [], extractedData: {}, logs: [] };

      if (errorScreenshot) {
        evidence.screenshots.push(errorScreenshot);
      }

      return {
        executionId,
        status: 'failed',
        goalStatus: 'failed',
        stepsExecuted: stepResults.filter(r => r.success).length,
        stepsFailed: stepResults.filter(r => !r.success).length,
        duration,
        stepResults,
        evidence,
        error
      };

    } finally {
      this.isExecuting = false;
      this.abortController = undefined;
    }
  }

  private async captureErrorScreenshot(page: Page, context: ExecutionContext | null): Promise<string | Buffer | undefined> {
    try {
      const screenshot = await page.screenshot({ fullPage: true });
      const key = `error_screenshot_${Date.now()}`;
      if (context) {
        context.evidence.extractedData[key] = screenshot;
      }
      return screenshot;
    } catch {
      return undefined;
    }
  }

  private determineStatus(stepResults: StepResult[], goalStatus: GoalStatus): 'success' | 'failed' | 'partial' | 'uncertain' {
    const failedCount = stepResults.filter(r => !r.success).length;
    const successCount = stepResults.filter(r => r.success).length;

    if (failedCount === 0 && goalStatus === 'achieved') {
      return 'success';
    }

    if (failedCount === 0 && goalStatus === 'uncertain') {
      return 'partial';
    }

    if (failedCount > 0 && successCount === 0) {
      return 'failed';
    }

    if (failedCount > 0 && successCount > 0) {
      return 'partial';
    }

    return 'uncertain';
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Execution abort requested');
    }
  }

  registerGoalHandler(handler: GoalHandler): void {
    this.goalMapper.register(handler);
  }

  getAvailableGoals(): string[] {
    return this.goalMapper.getAvailableGoals();
  }

  getGoalDescription(goal: string): string | undefined {
    return this.goalMapper.getGoalDescription(goal);
  }
}

export function createGoalExecutor(browserManager: BrowserManager, aiGateway?: AIGateway): GoalExecutor {
  return new GoalExecutor(browserManager, aiGateway);
}

export function formatExecutionResult(result: ExecutionResult): string {
  const lines: string[] = [];
  
  lines.push(`Execution ID: ${result.executionId}`);
  lines.push(`Status: ${result.status.toUpperCase()}`);
  lines.push(`Goal Status: ${result.goalStatus.toUpperCase()}`);
  lines.push(`Duration: ${result.duration}ms`);
  lines.push(`Steps: ${result.stepsExecuted} succeeded / ${result.stepsFailed} failed`);
  
  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }
  
  lines.push('');
  lines.push('Step Results:');
  
  for (const step of result.stepResults) {
    const icon = step.success ? '[OK]' : '[FAIL]';
    lines.push(`  ${icon} [${step.type}] ${step.description} (${step.duration}ms)`);
    if (step.error) {
      lines.push(`      Error: ${step.error}`);
    }
    if (step.extractedValue) {
      const preview = step.extractedValue.length > 100 
        ? step.extractedValue.substring(0, 100) + '...' 
        : step.extractedValue;
      lines.push(`      Extracted: ${preview}`);
    }
  }
  
  lines.push('');
  lines.push(`Final URL: ${result.evidence.finalUrl || 'N/A'}`);
  lines.push(`Final Title: ${result.evidence.finalTitle || 'N/A'}`);
  
  if (result.evidence.screenshots.length > 0) {
    lines.push(`Screenshots: ${result.evidence.screenshots.length}`);
  }
  
  const extractedKeys = Object.keys(result.evidence.extractedData);
  if (extractedKeys.length > 0) {
    lines.push(`Extracted Data Keys: ${extractedKeys.length}`);
  }

  return lines.join('\n');
}

export function serializeExecutionResult(result: ExecutionResult): Record<string, unknown> {
  return {
    executionId: result.executionId,
    status: result.status,
    goalStatus: result.goalStatus,
    stepsExecuted: result.stepsExecuted,
    stepsFailed: result.stepsFailed,
    duration: result.duration,
    stepResults: result.stepResults.map(sr => ({
      stepId: sr.stepId,
      type: sr.type,
      description: sr.description,
      success: sr.success,
      duration: sr.duration,
      error: sr.error,
      extractedValue: sr.extractedValue ? (
        sr.extractedValue.length > 1000 
          ? sr.extractedValue.substring(0, 1000) + '...[truncated]' 
          : sr.extractedValue
      ) : undefined,
      hasScreenshot: !!sr.screenshot
    })),
    evidence: {
      finalUrl: result.evidence.finalUrl,
      finalTitle: result.evidence.finalTitle,
      screenshotsCount: result.evidence.screenshots.length,
      extractedDataKeys: Object.keys(result.evidence.extractedData),
      logsCount: result.evidence.logs.length
    },
      error: result.error
  };
}

export const goalExecutor = {
  execute: (input: GoalInput) => {
    throw new Error('Cannot use goalExecutor without browser manager. Use createGoalExecutor() instead.');
  }
};

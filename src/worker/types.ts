export interface GoalInput {
  goal: string;
  inputs: Record<string, any>;
  constraints?: {
    maxSteps?: number;
    maxDuration?: number;
    stopOnError?: boolean;
    domain?: string;
  };
  successCriteria?: {
    expectedUrl?: string;
    expectedText?: string;
    expectedSelector?: string;
    extractedData?: string[];
  };
}

export interface WorkflowStep {
  id: string;
  type: StepType;
  description: string;
  action: string;
  selector?: string;
  value?: string;
  key?: string;
  direction?: string;
  timeout?: number;
  retry?: RetryConfig;
  optional?: boolean;
  condition?: ConditionalBlock;
}

export type StepType = 
  | 'navigate'
  | 'click'
  | 'double_click'
  | 'type'
  | 'fill'
  | 'clear'
  | 'search'
  | 'select'
  | 'check'
  | 'wait'
  | 'wait_for'
  | 'wait_for_navigation'
  | 'screenshot'
  | 'screenshot_element'
  | 'extract'
  | 'extract_all'
  | 'extract_attribute'
  | 'extract_links'
  | 'extract_table'
  | 'verify'
  | 'verify_text'
  | 'conditional'
  | 'scroll'
  | 'scroll_to_element'
  | 'press_key'
  | 'press_keys'
  | 'hover'
  | 'go_back'
  | 'go_forward'
  | 'refresh'
  | 'submit'
  | 'get_value'
  | 'evaluate'
  | 'unknown';

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoff?: 'linear' | 'exponential';
}

export interface ConditionalBlock {
  type: 'if_exists' | 'if_not_exists' | 'if_visible' | 'if_not_visible';
  selector: string;
  thenSteps?: WorkflowStep[];
  elseSteps?: WorkflowStep[];
}

export interface StepResult {
  stepId: string;
  type: string;
  description: string;
  success: boolean;
  error?: string;
  screenshot?: string;
  extractedValue?: string;
  duration: number;
}

export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'failed' | 'partial' | 'uncertain';
  goalStatus: GoalStatus;
  stepsExecuted: number;
  stepsFailed: number;
  duration: number;
  stepResults: StepResult[];
  evidence: EvidenceData;
  error?: string;
}

export type GoalStatus = 'achieved' | 'failed' | 'uncertain' | 'pending';

export interface EvidenceData {
  finalUrl?: string;
  finalTitle?: string;
  screenshots: (string | Buffer)[];
  extractedData: Record<string, any>;
  logs: string[];
}

export interface GoalHandler {
  goal: string;
  description: string;
  mapToSteps: (inputs: Record<string, any>) => WorkflowStep[];
  validateResult?: (result: StepResult[], evidence: EvidenceData) => GoalStatus;
}

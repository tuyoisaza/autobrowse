import type { GoalInput, WorkflowStep } from '../../src/worker/types.js';

export const mockGoalInput: GoalInput = {
  goal: 'navigate',
  inputs: { url: 'https://example.com' }
};

export const mockSteps: WorkflowStep[] = [
  {
    id: 'step-1',
    type: 'navigate',
    description: 'Navigate to example.com',
    action: 'navigate',
    value: 'https://example.com'
  }
];

export const screenshotModes = ['none', 'base64', 'file', 'both'] as const;

export const newGoalInputs = {
  upload_file: {
    goal: 'upload_file',
    inputs: {
      url: 'https://example.com/upload',
      selector: 'input[type="file"]',
      filePath: '/path/to/file.pdf'
    }
  },
  wait_for_network: {
    goal: 'wait_for_network',
    inputs: {
      waitFor: ['api.example.com/data'],
      timeout: 10000
    }
  },
  switch_frame: {
    goal: 'switch_frame',
    inputs: {
      url: 'https://example.com/iframe',
      frameSelector: 'iframe[name="content"]',
      actions: [{ type: 'extract', selector: 'p', value: 'content' }]
    }
  },
  handle_dialog: {
    goal: 'handle_dialog',
    inputs: {
      action: 'accept',
      clickSelector: 'button[data-action="confirm"]'
    }
  }
};
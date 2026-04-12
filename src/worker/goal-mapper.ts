import { GoalInput, WorkflowStep, GoalStatus, StepResult, EvidenceData } from './types.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('worker:goal-mapper');

export class GoalMapper {
  private handlers: Map<string, GoalHandler> = new Map();
  private defaultHandlers: GoalHandler[] = [];

  constructor() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.defaultHandlers = [
      this.createNavigateHandler(),
      this.createSearchHandler(),
      this.createFillFormHandler(),
      this.createClickElementHandler(),
      this.createExtractDataHandler(),
      this.createLoginHandler(),
      this.createWorkflowHandler(),
      this.createScrapePageHandler(),
      this.createDownloadHandler(),
      this.createTakeScreenshotHandler(),
      this.createUploadFileHandler(),
      this.createWaitForNetworkHandler(),
      this.createSwitchFrameHandler(),
      this.createHandleDialogHandler()
    ];

    for (const handler of this.defaultHandlers) {
      this.register(handler);
    }
  }

  private createNavigateHandler(): GoalHandler {
    return {
      goal: 'navigate',
      description: 'Navigate to a URL',
      mapToSteps: (inputs) => [
        {
          id: `step-${Date.now()}-nav`,
          type: 'navigate',
          description: `Navigate to ${inputs.url}`,
          action: 'navigate',
          value: inputs.url,
          timeout: inputs.timeout || 30000
        }
      ],
      validateResult: (results, evidence) => {
        const hasNav = results.some(r => r.type === 'navigate' && r.success);
        const hasUrl = evidence.finalUrl && evidence.finalUrl.length > 0;
        return hasNav && hasUrl ? 'achieved' : 'failed';
      }
    };
  }

  private createSearchHandler(): GoalHandler {
    return {
      goal: 'search',
      description: 'Search on a website',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        const baseUrl = inputs.url || inputs.baseUrl;
        
        if (baseUrl) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to ${baseUrl}`,
            action: 'navigate',
            value: baseUrl,
            timeout: 30000
          });
          
          if (inputs.waitForSelector) {
            steps.push({
              id: `step-${Date.now()}-wait`,
              type: 'wait_for',
              description: `Wait for search page to load`,
              action: 'wait_for',
              selector: inputs.waitForSelector,
              timeout: 15000
            });
          }
        }

        steps.push({
          id: `step-${Date.now()}-search`,
          type: 'search',
          description: `Search for "${inputs.query}"`,
          action: 'search',
          value: inputs.query,
          selector: inputs.searchSelector || 'input[name="q"], input[name="search"], input[type="search"], input[type="text"]',
          timeout: 15000
        });

        if (inputs.waitForResults) {
          steps.push({
            id: `step-${Date.now()}-wait-results`,
            type: 'wait_for',
            description: 'Wait for search results',
            action: 'wait_for',
            selector: inputs.waitForResults,
            timeout: inputs.resultsTimeout || 20000
          });
        }

        return steps;
      },
      validateResult: (results, evidence) => {
        const failedCount = results.filter(r => !r.success).length;
        return failedCount === 0 ? 'achieved' : failedCount < results.length ? 'uncertain' : 'failed';
      }
    };
  }

  private createFillFormHandler(): GoalHandler {
    return {
      goal: 'fill_form',
      description: 'Fill out a form',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to form page`,
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for form to load',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: 15000
          });
        }

        if (inputs.fields && Array.isArray(inputs.fields)) {
          for (const field of inputs.fields) {
            if (field.action === 'click') {
              steps.push({
                id: `step-${Date.now()}-click-${field.name}`,
                type: 'click',
                description: field.label || `Click ${field.name}`,
                action: 'click',
                selector: field.selector || field.name,
                optional: field.optional,
                timeout: 10000
              });
            } else if (field.action === 'select') {
              steps.push({
                id: `step-${Date.now()}-select-${field.name}`,
                type: 'select',
                description: field.label || `Select ${field.name}`,
                action: 'select',
                selector: field.selector || `select[name="${field.name}"]`,
                value: field.value,
                optional: field.optional,
                timeout: 10000
              });
            } else if (field.action === 'check') {
              steps.push({
                id: `step-${Date.now()}-check-${field.name}`,
                type: 'check',
                description: field.label || `Check ${field.name}`,
                action: 'check',
                selector: field.selector || `#${field.name}`,
                value: field.value || 'true',
                optional: field.optional,
                timeout: 10000
              });
            } else {
              steps.push({
                id: `step-${Date.now()}-type-${field.name}`,
                type: 'type',
                description: field.label || `Fill ${field.name}`,
                action: 'type',
                selector: field.selector || `input[name="${field.name}"], #${field.name}, [placeholder*="${field.name}"]`,
                value: String(field.value),
                optional: field.optional,
                timeout: 10000
              });
            }
          }
        }

        if (inputs.submit !== false) {
          steps.push({
            id: `step-${Date.now()}-submit`,
            type: 'submit',
            description: inputs.submitDescription || 'Submit form',
            action: 'submit',
            timeout: 15000
          });
        }

        if (inputs.waitForNavigation) {
          steps.push({
            id: `step-${Date.now()}-wait-nav`,
            type: 'wait_for_navigation',
            description: 'Wait for navigation',
            action: 'wait_for_navigation',
            value: inputs.waitForNavigation,
            timeout: inputs.navigationTimeout || 30000
          });
        }

        return steps;
      },
      validateResult: (results, evidence): GoalStatus => {
        const failedCount = results.filter(r => !r.success && !r.error?.includes('optional')).length;
        if (failedCount === 0) return 'achieved';
        return failedCount < results.length ? 'uncertain' : 'failed';
      }
    };
  }

  private createClickElementHandler(): GoalHandler {
    return {
      goal: 'click_element',
      description: 'Click an element',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to ${inputs.url}`,
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: `Wait for element`,
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: inputs.waitTimeout || 15000
          });
        }

        steps.push({
          id: `step-${Date.now()}-click`,
          type: inputs.action === 'double_click' ? 'double_click' : 'click',
          description: `Click ${inputs.element || 'element'}`,
          action: 'click',
          selector: inputs.selector,
          optional: inputs.optional,
          timeout: inputs.timeout || 15000,
          retry: inputs.retry ? { maxAttempts: inputs.retry.maxAttempts || 3, delayMs: inputs.retry.delayMs || 1000 } : undefined
        });

        if (inputs.waitAfterClick) {
          steps.push({
            id: `step-${Date.now()}-wait-after`,
            type: 'wait',
            description: 'Wait after click',
            action: 'wait',
            value: String(inputs.waitAfterClick),
            optional: true
          });
        }

        if (inputs.verifySelector) {
          steps.push({
            id: `step-${Date.now()}-verify`,
            type: 'verify',
            description: 'Verify click result',
            action: 'verify',
            selector: inputs.verifySelector,
            value: inputs.verifyVisible ? 'visible' : undefined,
            optional: true
          });
        }

        return steps;
      },
      validateResult: (results, evidence) => {
        const clickResult = results.find(r => r.type === 'click' || r.type === 'double_click');
        return clickResult?.success ? 'achieved' : clickResult?.success === false && clickResult.error?.includes('optional') ? 'uncertain' : 'failed';
      }
    };
  }

  private createExtractDataHandler(): GoalHandler {
    return {
      goal: 'extract_data',
      description: 'Extract data from a page',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to ${inputs.url}`,
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for content to load',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: inputs.waitTimeout || 15000
          });
        }

        if (inputs.selectors && Array.isArray(inputs.selectors)) {
          for (const selector of inputs.selectors) {
            const selectorConfig = typeof selector === 'string' 
              ? { selector, name: `extracted_${selector}` } 
              : selector;
            
            if (selectorConfig.action === 'links') {
              steps.push({
                id: `step-${Date.now()}-extract-links`,
                type: 'extract_links',
                description: `Extract links from ${selectorConfig.selector || 'page'}`,
                action: 'extract_links',
                selector: selectorConfig.selector,
                value: selectorConfig.name || 'links',
                optional: selectorConfig.optional
              });
            } else if (selectorConfig.action === 'table') {
              steps.push({
                id: `step-${Date.now()}-extract-table`,
                type: 'extract_table',
                description: `Extract table from ${selectorConfig.selector}`,
                action: 'extract_table',
                selector: selectorConfig.selector,
                value: selectorConfig.name || 'table_data',
                optional: selectorConfig.optional
              });
            } else if (selectorConfig.action === 'all') {
              steps.push({
                id: `step-${Date.now()}-extract-all-${selectorConfig.name}`,
                type: 'extract_all',
                description: `Extract all from ${selectorConfig.selector}`,
                action: 'extract_all',
                selector: selectorConfig.selector,
                value: selectorConfig.name,
                optional: selectorConfig.optional
              });
            } else if (selectorConfig.action === 'attribute') {
              steps.push({
                id: `step-${Date.now()}-extract-attr-${selectorConfig.name}`,
                type: 'extract_attribute',
                description: `Extract ${selectorConfig.attribute} from ${selectorConfig.selector}`,
                action: 'extract_attribute',
                selector: selectorConfig.selector,
                key: selectorConfig.attribute,
                value: selectorConfig.name,
                optional: selectorConfig.optional
              });
            } else {
              steps.push({
                id: `step-${Date.now()}-extract-${selectorConfig.name}`,
                type: 'extract',
                description: `Extract ${selectorConfig.name}`,
                action: 'extract',
                selector: selectorConfig.selector,
                value: selectorConfig.name,
                optional: selectorConfig.optional
              });
            }
          }
        }

        if (inputs.screenshot !== false) {
          steps.push({
            id: `step-${Date.now()}-screenshot`,
            type: 'screenshot',
            description: 'Take screenshot',
            action: 'screenshot',
            value: inputs.screenshotMode || 'viewport',
            optional: true
          });
        }

        return steps;
      },
      validateResult: (results, evidence) => {
        const extractResults = results.filter(r => r.type.startsWith('extract') && r.success);
        const extractedKeys = Object.keys(evidence.extractedData);
        return extractedKeys.length > 0 ? 'achieved' : extractResults.length > 0 ? 'achieved' : 'failed';
      }
    };
  }

  private createLoginHandler(): GoalHandler {
    return {
      goal: 'login',
      description: 'Perform login',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: 'Navigate to login page',
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for login form',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: 15000
          });
        }

        if (inputs.username || inputs.email) {
          steps.push({
            id: `step-${Date.now()}-username`,
            type: 'type',
            description: 'Enter username',
            action: 'type',
            selector: inputs.usernameSelector || 'input[name="username"], input[type="email"], input[id="username"], input[id="email"], input[placeholder*="user" i], input[placeholder*="email" i]',
            value: inputs.username || inputs.email,
            timeout: 10000
          });
        }

        if (inputs.password) {
          steps.push({
            id: `step-${Date.now()}-password`,
            type: 'type',
            description: 'Enter password',
            action: 'type',
            selector: inputs.passwordSelector || 'input[name="password"], input[type="password"], input[id="password"], input[placeholder*="password" i]',
            value: inputs.password,
            timeout: 10000
          });
        }

        if (inputs.rememberMe) {
          steps.push({
            id: `step-${Date.now()}-remember`,
            type: 'check',
            description: 'Check remember me',
            action: 'check',
            selector: 'input[name="remember"], input[type="checkbox"]',
            value: 'true',
            optional: true
          });
        }

        if (inputs.submit !== false) {
          steps.push({
            id: `step-${Date.now()}-submit`,
            type: 'submit',
            description: inputs.submitButtonText ? `Click "${inputs.submitButtonText}"` : 'Submit login',
            action: 'submit',
            timeout: 15000
          });
        }

        if (inputs.waitForNavigation) {
          steps.push({
            id: `step-${Date.now()}-wait-nav`,
            type: 'wait_for_navigation',
            description: 'Wait for login to complete',
            action: 'wait_for_navigation',
            value: 'networkidle',
            timeout: 30000
          });
        }

        if (inputs.verifyLogoutSelector) {
          steps.push({
            id: `step-${Date.now()}-verify-logout`,
            type: 'verify',
            description: 'Verify logged in',
            action: 'verify',
            selector: inputs.verifyLogoutSelector,
            value: 'visible',
            optional: true
          });
        }

        return steps;
      },
      validateResult: (results, evidence): GoalStatus => {
        const failedCount = results.filter(r => !r.success).length;
        if (failedCount === 0) return 'achieved';
        return failedCount < results.length ? 'uncertain' : 'failed';
      }
    };
  }

  private createWorkflowHandler(): GoalHandler {
    return {
      goal: 'workflow',
      description: 'Execute a custom workflow',
      mapToSteps: (inputs) => {
        if (!inputs.steps || !Array.isArray(inputs.steps)) {
          throw new Error('workflow goal requires steps array in inputs');
        }
        
        return inputs.steps.map((step: any, index: number) => ({
          id: step.id || `step-${Date.now()}-${index}`,
          type: step.type,
          description: step.description || `${step.type} step`,
          action: step.action || step.type,
          selector: step.selector,
          value: step.value,
          key: step.key,
          direction: step.direction,
          timeout: step.timeout,
          optional: step.optional,
          retry: step.retry,
          condition: step.condition,
          ...step
        }));
      },
      validateResult: (results, evidence): GoalStatus => {
        const failedCount = results.filter(r => !r.success).length;
        return failedCount === 0 ? 'achieved' : failedCount < results.length ? 'uncertain' : 'failed';
      }
    };
  }

  private createScrapePageHandler(): GoalHandler {
    return {
      goal: 'scrape_page',
      description: 'Scrape data from a webpage',
      mapToSteps: (inputs: Record<string, any>) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to ${inputs.url}`,
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for content',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: inputs.waitTimeout || 15000
          });
        }

        if (inputs.scrollToBottom) {
          steps.push({
            id: `step-${Date.now()}-scroll`,
            type: 'scroll',
            description: 'Scroll to bottom',
            action: 'scroll',
            direction: 'bottom',
            optional: true
          });
        }

        if (inputs.extractSelectors) {
          for (const config of inputs.extractSelectors) {
            const selector = typeof config === 'string' ? config : config.selector;
            const name = typeof config === 'string' ? `data_${selector}` : config.name || `data_${selector}`;
            
            steps.push({
              id: `step-${Date.now()}-scrape-${name}`,
              type: 'extract',
              description: `Scrape ${name}`,
              action: 'extract',
              selector,
              value: name,
              optional: true
            });
          }
        }

        steps.push({
          id: `step-${Date.now()}-links`,
          type: 'extract_links',
          description: 'Extract all links',
          action: 'extract_links',
          selector: inputs.linksSelector || 'a[href]',
          value: 'all_links',
          optional: true
        });

        if (inputs.screenshot) {
          steps.push({
            id: `step-${Date.now()}-screenshot`,
            type: 'screenshot',
            description: 'Take page screenshot',
            action: 'screenshot',
            optional: true
          });
        }

        return steps;
      },
      validateResult: (results, evidence) => {
        const extractedKeys = Object.keys(evidence.extractedData);
        return extractedKeys.length > 0 ? 'achieved' : 'uncertain';
      }
    };
  }

  private createDownloadHandler(): GoalHandler {
    return {
      goal: 'download',
      description: 'Download a file',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to download page`,
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for download button',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: 15000
          });
        }

        steps.push({
          id: `step-${Date.now()}-click`,
          type: 'click',
          description: `Click download button`,
          action: 'click',
          selector: inputs.downloadSelector,
          timeout: 15000
        });

        if (inputs.waitForDownload) {
          steps.push({
            id: `step-${Date.now()}-wait-download`,
            type: 'wait',
            description: 'Wait for download',
            action: 'wait',
            value: String(inputs.waitForDownload),
            optional: true
          });
        }

        return steps;
      },
      validateResult: (results, evidence) => {
        const clickResult = results.find(r => r.type === 'click');
        return clickResult?.success ? 'achieved' : 'failed';
      }
    };
  }

  private createTakeScreenshotHandler(): GoalHandler {
    return {
      goal: 'screenshot',
      description: 'Take a screenshot',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: `Navigate to ${inputs.url}`,
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for element',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: inputs.waitTimeout || 15000
          });
        }

        steps.push({
          id: `step-${Date.now()}-screenshot`,
          type: inputs.element ? 'screenshot_element' : 'screenshot',
          description: inputs.element ? `Screenshot of ${inputs.element}` : 'Take full page screenshot',
          action: 'screenshot',
          selector: inputs.element,
          value: inputs.fullPage !== false ? 'fullpage' : 'viewport',
          timeout: 30000
        });

        return steps;
      },
      validateResult: (results, evidence) => {
        const screenshotResult = results.find(r => r.type === 'screenshot' || r.type === 'screenshot_element');
        return screenshotResult?.success && evidence.screenshots.length > 0 ? 'achieved' : 'failed';
      }
    };
  }

  private createUploadFileHandler(): GoalHandler {
    return {
      goal: 'upload_file',
      description: 'Upload a file to a page',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];
        
        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: 'Navigate to upload page',
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for upload input',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: 15000
          });
        }

        steps.push({
          id: `step-${Date.now()}-upload`,
          type: 'upload',
          description: `Upload file`,
          action: 'upload',
          selector: inputs.selector,
          value: inputs.filePath,
          timeout: 30000
        });

        if (inputs.submit !== false) {
          steps.push({
            id: `step-${Date.now()}-submit`,
            type: 'submit',
            description: 'Submit upload',
            action: 'submit',
            timeout: 15000
          });
        }

        if (inputs.waitForNavigation) {
          steps.push({
            id: `step-${Date.now()}-wait-nav`,
            type: 'wait_for_navigation',
            description: 'Wait for upload to complete',
            action: 'wait_for_navigation',
            value: inputs.waitForNavigation,
            timeout: inputs.navigationTimeout || 30000
          });
        }

        return steps;
      },
      validateResult: (results, evidence): GoalStatus => {
        const uploadResult = results.find(r => r.type === 'upload');
        return uploadResult?.success ? 'achieved' : 'failed';
      }
    };
  }

  private createWaitForNetworkHandler(): GoalHandler {
    return {
      goal: 'wait_for_network',
      description: 'Wait for network requests to complete',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];

        steps.push({
          id: `step-${Date.now()}-wait-network`,
          type: 'wait_for_network',
          description: 'Wait for network requests',
          action: 'wait_for_network',
          value: Array.isArray(inputs.waitFor) ? inputs.waitFor.join(',') : inputs.waitFor,
          timeout: inputs.timeout || 30000
        });

        return steps;
      },
      validateResult: (results, evidence): GoalStatus => {
        const waitResult = results.find(r => r.type === 'wait_for_network');
        return waitResult?.success !== false ? 'achieved' : 'uncertain';
      }
    };
  }

  private createSwitchFrameHandler(): GoalHandler {
    return {
      goal: 'switch_frame',
      description: 'Interact with iframe content',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];

        if (inputs.url) {
          steps.push({
            id: `step-${Date.now()}-nav`,
            type: 'navigate',
            description: 'Navigate to page with frame',
            action: 'navigate',
            value: inputs.url,
            timeout: 30000
          });
        }

        if (inputs.waitForSelector) {
          steps.push({
            id: `step-${Date.now()}-wait`,
            type: 'wait_for',
            description: 'Wait for frame',
            action: 'wait_for',
            selector: inputs.waitForSelector,
            timeout: inputs.waitTimeout || 15000
          });
        }

        steps.push({
          id: `step-${Date.now()}-switch-frame`,
          type: 'switch_frame',
          description: 'Switch to frame',
          action: 'switch_frame',
          selector: inputs.frameSelector,
          timeout: 15000
        });

        if (inputs.actions && Array.isArray(inputs.actions)) {
          for (const action of inputs.actions) {
            const actionId = action.id || `step-${Date.now()}-frame-action`;
            const { id: _ignored, ...rest } = action;
            steps.push({
              id: actionId,
              ...rest
            });
          }
        }

        if (inputs.switchBack !== false) {
          steps.push({
            id: `step-${Date.now()}-switch-back`,
            type: 'switch_frame_back',
            description: 'Return to main frame',
            action: 'switch_frame_back',
            timeout: 5000
          });
        }

        return steps;
      },
      validateResult: (results, evidence): GoalStatus => {
        const switchResult = results.find(r => r.type === 'switch_frame');
        return switchResult?.success ? 'achieved' : 'failed';
      }
    };
  }

  private createHandleDialogHandler(): GoalHandler {
    return {
      goal: 'handle_dialog',
      description: 'Handle browser dialogs',
      mapToSteps: (inputs) => {
        const steps: WorkflowStep[] = [];

        steps.push({
          id: `step-${Date.now()}-set-dialog`,
          type: 'set_handle_dialog',
          description: `Set dialog handler to ${inputs.action}`,
          action: 'set_handle_dialog',
          value: inputs.action,
          key: inputs.promptValue
        });

        if (inputs.clickSelector) {
          steps.push({
            id: `step-${Date.now()}-click-trigger`,
            type: 'click',
            description: 'Click to trigger dialog',
            action: 'click',
            selector: inputs.clickSelector,
            timeout: inputs.timeout || 15000
          });
        }

        if (inputs.screenshot) {
          steps.push({
            id: `step-${Date.now()}-screenshot`,
            type: 'screenshot',
            description: 'Take screenshot after dialog',
            action: 'screenshot',
            optional: true
          });
        }

        return steps;
      },
      validateResult: (results, evidence): GoalStatus => {
        const dialogResult = results.find(r => r.type === 'set_handle_dialog');
        const clickResult = results.find(r => r.type === 'click');
        
        if (!clickResult) return 'achieved';
        return clickResult.success ? 'achieved' : 'failed';
      }
    };
  }

  register(handler: GoalHandler): void {
    if (!handler.goal || !handler.mapToSteps) {
      throw new Error('Invalid goal handler: must have goal and mapToSteps');
    }
    this.handlers.set(handler.goal, handler);
    logger.info('Goal handler registered', { goal: handler.goal, description: handler.description });
  }

  unregister(goal: string): boolean {
    const removed = this.handlers.delete(goal);
    if (removed) {
      logger.info('Goal handler unregistered', { goal });
    }
    return removed;
  }

  mapToSteps(input: GoalInput): WorkflowStep[] {
    const handler = this.handlers.get(input.goal);
    
    if (handler) {
      try {
        return handler.mapToSteps(input.inputs);
      } catch (err) {
        logger.error('Handler mapping failed', { goal: input.goal, error: err });
        return [{
          id: `step-${Date.now()}-error`,
          type: 'unknown',
          description: `Error in handler for ${input.goal}: ${err}`,
          action: input.goal
        }];
      }
    }

    for (const defaultHandler of this.defaultHandlers) {
      if (defaultHandler.goal === input.goal) {
        try {
          return defaultHandler.mapToSteps(input.inputs);
        } catch (err) {
          logger.error('Default handler mapping failed', { goal: input.goal, error: err });
        }
      }
    }

    logger.warn('No handler found for goal', { goal: input.goal });
    return [{
      id: `step-${Date.now()}-fallback`,
      type: 'unknown',
      description: `Execute goal: ${input.goal}`,
      action: input.goal
    }];
  }

  validateGoalStatus(
    input: GoalInput,
    stepResults: StepResult[],
    evidence: EvidenceData
  ): GoalStatus {
    const handler = this.handlers.get(input.goal);
    
    if (handler?.validateResult) {
      try {
        return handler.validateResult(stepResults, evidence);
      } catch (err) {
        logger.error('Validation failed', { goal: input.goal, error: err });
      }
    }

    for (const defaultHandler of this.defaultHandlers) {
      if (defaultHandler.goal === input.goal && defaultHandler.validateResult) {
        try {
          return defaultHandler.validateResult(stepResults, evidence);
        } catch (err) {
          logger.error('Default validation failed', { goal: input.goal, error: err });
        }
      }
    }

    const failedSteps = stepResults.filter(r => !r.success && !r.error?.includes('optional'));
    const successfulSteps = stepResults.filter(r => r.success);

    if (failedSteps.length === 0 && successfulSteps.length > 0) {
      if (input.successCriteria?.expectedUrl && evidence.finalUrl && !evidence.finalUrl.includes(input.successCriteria.expectedUrl)) {
        return 'uncertain';
      }
      return 'achieved';
    }

    if (failedSteps.length > 0 && successfulSteps.length === 0) {
      return 'failed';
    }

    if (failedSteps.length > 0 && successfulSteps.length > 0) {
      const criticalFailed = failedSteps.filter(f => 
        !f.error?.includes('optional') && !f.error?.includes('timeout')
      );
      if (criticalFailed.length > 0) {
        return 'failed';
      }
      return 'uncertain';
    }

    return 'uncertain';
  }

  getAvailableGoals(): string[] {
    return Array.from(this.handlers.keys());
  }

  getGoalDescription(goal: string): string | undefined {
    const handler = this.handlers.get(goal);
    if (handler) return handler.description;
    
    const defaultHandler = this.defaultHandlers.find(h => h.goal === goal);
    return defaultHandler?.description;
  }

  hasGoalHandler(goal: string): boolean {
    return this.handlers.has(goal) || this.defaultHandlers.some(h => h.goal === goal);
  }
}

export interface GoalHandler {
  goal: string;
  description: string;
  mapToSteps: (inputs: Record<string, any>) => WorkflowStep[];
  validateResult?: (result: StepResult[], evidence: EvidenceData) => GoalStatus;
}

export const goalMapper = new GoalMapper();

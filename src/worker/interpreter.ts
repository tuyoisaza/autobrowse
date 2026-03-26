import { createLogger } from '../logger/index.js';
import { BrowserAction } from '../browser/actions.js';

const logger = createLogger('interpreter');

export interface ParsedInstruction {
  actions: BrowserAction[];
}

const ACTION_PATTERNS = [
  { pattern: /open (?:the )?site (?:at )?(.+)/i, type: 'open_url', extract: 1 },
  { pattern: /go to (.+)/i, type: 'open_url', extract: 1 },
  { pattern: /visit (.+)/i, type: 'open_url', extract: 1 },
  { pattern: /navigate to (.+)/i, type: 'open_url', extract: 1 },
  { pattern: /click (?:on )?(.+)/i, type: 'click', extract: 1 },
  { pattern: /type "([^"]+)" (?:in |into )?(.+)/i, type: 'type', extract: [1, 2] },
  { pattern: /fill (.+) with "([^"]+)"/i, type: 'type', extract: [2, 1] },
  { pattern: /select "([^"]+)" (?:from |in )?(.+)/i, type: 'select', extract: [1, 2] },
  { pattern: /wait (\d+) (?:second|ms)/i, type: 'wait', extract: 1, transform: (v: string) => v.includes('second') ? parseInt(v) * 1000 : parseInt(v) },
  { pattern: /scroll (?:down|up) (?:by )?(\d+)?/i, type: 'scroll', extract: 1 },
  { pattern: /get (?:the )?text (?:from )?(.+)?/i, type: 'extract_text', extract: 1 },
  { pattern: /extract (?:the )?text/i, type: 'extract_text', extract: 0 },
  { pattern: /take (?:a )?screenshot/i, type: 'screenshot', extract: 0 },
  { pattern: /verify (?:that )?(.+) (?:is |exists|visible)/i, type: 'confirm_state', extract: 1 },
];

function parseSelector(text: string): string {
  const lower = text.toLowerCase();
  
  if (lower.includes('button')) return 'button';
  if (lower.includes('link')) return 'a';
  if (lower.includes('input') || lower.includes('field') || lower.includes('text')) return 'input';
  if (lower.includes('checkbox')) return 'input[type="checkbox"]';
  if (lower.includes('radio')) return 'input[type="radio"]';
  if (lower.includes('dropdown') || lower.includes('select')) return 'select';
  if (lower.includes('submit')) return 'button[type="submit"]';
  
  return text;
}

export function parseInstruction(instruction: string): { actions: BrowserAction[] } {
  const actions: BrowserAction[] = [];
  const sentences = instruction.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  
  for (const sentence of sentences) {
    for (const { pattern, type, extract, transform } of ACTION_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        const action: BrowserAction = { type: type as any };
        
        if (typeof extract === 'number') {
          const value = match[extract] || '';
          action.value = transform ? String(transform(value)) : value;
        } else if (Array.isArray(extract)) {
          action.value = match[extract[0]] || '';
          action.selector = parseSelector(match[extract[1]] || '');
        }
        
        if (type === 'click' || type === 'confirm_state') {
          action.selector = parseSelector(match[1] || '');
        }
        
        if (type === 'screenshot') {
          action.path = `./screenshots/${Date.now()}.png`;
        }
        
        actions.push(action);
        break;
      }
    }
  }
  
  if (actions.length === 0) {
    logger.warn('No actions parsed, defaulting to open_url', { instruction });
    actions.push({ type: 'open_url', value: instruction });
  }

  logger.info('Instruction parsed', { actionCount: actions.length });
  return { actions };
}
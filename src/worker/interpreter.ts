import { createLogger } from '../logger/index.js';
import { BrowserAction } from '../browser/actions.js';
import { aiGateway } from '../ai/gateway.js';

const logger = createLogger('interpreter');

export interface ParsedInstruction {
  actions: BrowserAction[];
}

interface ActionPattern {
  pattern: RegExp;
  type: string;
  extract?: number | number[];
  transform?: (v: string) => any;
  direction?: string;
  key?: string;
}

const ACTION_PATTERNS: ActionPattern[] = [
  // URL opening - must be first, more specific
  { pattern: /^(https?:\/\/[^\s;,]+)$/i, type: 'open_url', extract: 0 },
  { pattern: /^(?:go to |visit |open )?(https?:\/\/[^\s;,]+)/i, type: 'open_url', extract: 1 },
  
  // Auto-add https:// for bare domains
  { pattern: /^(?:go to |visit |open |)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i, type: 'open_url', extract: 1, transform: (v) => v.startsWith('http') ? v : `https://${v}` },
  
  // Search patterns
  { pattern: /search (?:for )?"([^"]+)"/i, type: 'search', extract: 1 },
  { pattern: /search (?:for )?(.+)/i, type: 'search', extract: 1 },
  
  // Multi-action separator handling - split by semicolon first
  // Then individual actions:
  { pattern: /^(?:go to|visit|open|navigate to)\s+(.+)/i, type: 'open_url', extract: 1 },
  
  // Click actions
  { pattern: /click (?:on )?(?:the )?(.+)/i, type: 'click', extract: 1 },
  { pattern: /press (?:the )?(.+) button/i, type: 'click', extract: 1 },
  { pattern: /tap (?:on )?(?:the )?(.+)/i, type: 'click', extract: 1 },
  { pattern: /press enter/i, type: 'press_key', key: 'Enter' },
  { pattern: /press tab/i, type: 'press_key', key: 'Tab' },
  { pattern: /press escape/i, type: 'press_key', key: 'Escape' },
  
  // Type/input actions
  { pattern: /type "([^"]+)" (?:in |into |on )?(?:the )?(.+)/i, type: 'type', extract: [1, 2] },
  { pattern: /type\s+(.+)\s+in\s+(.+)/i, type: 'type', extract: [1, 2] },
  { pattern: /fill (?:the )?(.+) (?:with |with text )?"([^"]+)"/i, type: 'type', extract: [2, 1] },
  { pattern: /fill (?:the )?(.+) with ([^"]+)/i, type: 'type', extract: [2, 1] },
  { pattern: /write "([^"]+)" (?:in |into )?(?:the )?(.+)/i, type: 'type', extract: [1, 2] },
  { pattern: /clear (?:the )?(.+)/i, type: 'clear', extract: 1 },
  
  // Select actions
  { pattern: /select "([^"]+)" (?:from |in )?(?:the )?(.+)/i, type: 'select', extract: [1, 2] },
  { pattern: /choose "([^"]+)" (?:from |in )?(?:the )?(.+)/i, type: 'select', extract: [1, 2] },
  
  // Wait actions
  { pattern: /wait (\d+) ?seconds?/i, type: 'wait', extract: 1, transform: (v: string) => parseInt(v) * 1000 },
  { pattern: /wait (\d+) ?ms/i, type: 'wait', extract: 1, transform: (v: string) => parseInt(v) },
  { pattern: /wait for (\d+) ?seconds?/i, type: 'wait', extract: 1, transform: (v: string) => parseInt(v) * 1000 },
  
  // Scroll actions
  { pattern: /scroll (?:the )?page (?:down)/i, type: 'scroll', direction: 'down' },
  { pattern: /scroll (?:the )?page (?:up)/i, type: 'scroll', direction: 'up' },
  { pattern: /scroll (?:down|up)/i, type: 'scroll', direction: 'down' },
  { pattern: /scroll (?:by )?(\d+) pixels?/i, type: 'scroll', extract: 1 },
  { pattern: /scroll to (?:the )?bottom/i, type: 'scroll', direction: 'bottom' },
  { pattern: /scroll to (?:the )?top/i, type: 'scroll', direction: 'top' },
  { pattern: /scroll to (?:the )?(.+)/i, type: 'scroll_to', extract: 1 },
  
  // Extraction actions - get title must come before general text
  { pattern: /get (?:the )?title/i, type: 'get_title', extract: 0 },
  { pattern: /get (?:the )?text (?:from )?(?:the )?(.+)/i, type: 'extract_text', extract: 1 },
  { pattern: /extract (?:the )?text/i, type: 'extract_text', extract: 0 },
  { pattern: /get (?:the )?html/i, type: 'extract_html', extract: 0 },
  { pattern: /get (?:all )?links/i, type: 'extract_links', extract: 0 },
  { pattern: /get (?:all )?images/i, type: 'extract_images', extract: 0 },
  { pattern: /get (?:the )?value (?:of )?(?:the )?(.+)/i, type: 'get_value', extract: 1 },
  { pattern: /get (?:the )?attribute "([^"]+)" (?:of )?(?:the )?(.+)/i, type: 'get_attribute', extract: [1, 2] },
  
  // Screenshot
  { pattern: /take (?:a )?screenshot/i, type: 'screenshot', extract: 0 },
  { pattern: /screenshot/i, type: 'screenshot', extract: 0 },
  { pattern: /capture (?:the )?screen/i, type: 'screenshot', extract: 0 },
  
  // Verification
  { pattern: /verify (?:that )?(?:the )?(.+) (?:is |exists|visible)/i, type: 'confirm_state', extract: 1 },
  { pattern: /check (?:that )?(?:the )?(.+) (?:is |exists|visible)/i, type: 'confirm_state', extract: 1 },
  { pattern: /assert (?:that )?(?:the )?(.+) (?:is |exists)/i, type: 'confirm_state', extract: 1 },
  { pattern: /wait (?:until |for )?(?:the )?(.+) (?:appears?|is visible)/i, type: 'wait_for', extract: 1 },
  
  // Navigation
  { pattern: /go back/i, type: 'go_back', extract: 0 },
  { pattern: /go forward/i, type: 'go_forward', extract: 0 },
  { pattern: /refresh (?:the )?page/i, type: 'refresh', extract: 0 },
  
  // Download
  { pattern: /download (?:the )?file/i, type: 'download', extract: 0 },
  
  // Hover
  { pattern: /hover (?:over )?(?:the )?(.+)/i, type: 'hover', extract: 1 },
  
  // Double click
  { pattern: /double[ -]click (?:on )?(?:the )?(.+)/i, type: 'dblclick', extract: 1 },
  
  // Check/Uncheck
  { pattern: /check (?:the )?(.+)/i, type: 'check', extract: 1 },
  { pattern: /uncheck (?:the )?(.+)/i, type: 'uncheck', extract: 1 },
];

function parseSelector(text: string): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  
  if (lower.includes('button')) return 'button';
  if (lower.includes('link')) return 'a';
  if (lower.includes('input') || lower.includes('field') || lower.includes('text box')) return 'input';
  if (lower.includes('checkbox')) return 'input[type="checkbox"]';
  if (lower.includes('radio')) return 'input[type="radio"]';
  if (lower.includes('dropdown') || lower.includes('select')) return 'select';
  if (lower.includes('submit')) return 'button[type="submit"]';
  if (lower.includes('image')) return 'img';
  
  return text.trim();
}

export function parseInstruction(instruction: string): { actions: BrowserAction[] } {
  const actions: BrowserAction[] = [];
  const sentences = instruction.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  
  for (const sentence of sentences) {
    for (const pat of ACTION_PATTERNS) {
      const match = sentence.match(pat.pattern);
      if (match) {
        const action: BrowserAction = { type: pat.type as any };
        
        // Handle special properties
        if (pat.direction) action.direction = pat.direction;
        if (pat.key) action.key = pat.key;
        
        // Handle extract patterns
        if (typeof pat.extract === 'number') {
          const value = match[pat.extract] || '';
          action.value = pat.transform ? String(pat.transform(value)) : value;
        } else if (Array.isArray(pat.extract)) {
          action.value = match[pat.extract[0]] || '';
          action.selector = parseSelector(match[pat.extract[1]] || '');
        } else if (pat.extract === 0) {
          // No extraction needed
        }
        
        // Handle single-arg selectors
        if (['click', 'dblclick', 'hover', 'clear', 'check', 'uncheck', 'confirm_state', 'wait_for', 'scroll_to', 'extract_text', 'get_value'].includes(pat.type)) {
          const colonParts = sentence.split(':');
          if (colonParts.length > 1) {
            action.selector = parseSelector(colonParts.slice(1).join(':').trim());
          }
        }
        
        if (pat.type === 'screenshot') {
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

export async function parseInstructionAsync(instruction: string, pageContext?: string): Promise<{ actions: BrowserAction[] }> {
  try {
    const actions = await aiGateway.parseInstruction(instruction, pageContext);
    if (actions.length > 0) {
      logger.info('AI parsed instruction', { actionCount: actions.length });
      return { actions };
    }
  } catch (err) {
    logger.warn('AI parsing failed, using regex', { err });
  }
  
  return parseInstruction(instruction);
}

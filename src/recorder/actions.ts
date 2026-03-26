export type ActionType = 
  | 'open_url' | 'click' | 'dblclick' | 'hover' | 'type' | 'clear' 
  | 'select' | 'check' | 'uncheck' | 'press_key' | 'scroll' | 'wait'
  | 'screenshot' | 'go_back' | 'go_forward' | 'refresh';

export interface RecordedAction {
  type: ActionType;
  selector?: string;
  value?: string;
  key?: string;
  timestamp: number;
}

export function serializeAction(action: any): RecordedAction {
  return {
    type: action.type,
    selector: action.selector,
    value: action.value,
    key: action.key,
    timestamp: Date.now()
  };
}

export function deserializeActions(json: string): RecordedAction[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

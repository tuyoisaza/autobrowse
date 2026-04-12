import { describe, it, expect, beforeEach } from 'vitest';
import { GoalMapper } from '../../src/worker/goal-mapper.js';
import type { GoalInput } from '../../src/worker/types.js';

describe('GoalMapper', () => {
  let mapper: GoalMapper;

  beforeEach(() => {
    mapper = new GoalMapper();
  });

  describe('navigate handler', () => {
    it('should map navigate goal to navigate step', () => {
      const input: GoalInput = {
        goal: 'navigate',
        inputs: { url: 'https://example.com' }
      };
      const steps = mapper.mapToSteps(input);
      expect(steps[0].type).toBe('navigate');
      expect(steps[0].value).toBe('https://example.com');
    });

    it('should include timeout in navigate step', () => {
      const input: GoalInput = {
        goal: 'navigate',
        inputs: { url: 'https://example.com', timeout: 60000 }
      };
      const steps = mapper.mapToSteps(input);
      expect(steps[0].timeout).toBe(60000);
    });
  });

  describe('search handler', () => {
    it('should map search goal to steps with navigate and search', () => {
      const input: GoalInput = {
        goal: 'search',
        inputs: { url: 'https://google.com', query: 'test' }
      };
      const steps = mapper.mapToSteps(input);
      expect(steps.some(s => s.type === 'navigate')).toBe(true);
      expect(steps.some(s => s.type === 'search')).toBe(true);
    });

    it('should include query in search step', () => {
      const input: GoalInput = {
        goal: 'search',
        inputs: { query: 'playwright automation' }
      };
      const steps = mapper.mapToSteps(input);
      const searchStep = steps.find(s => s.type === 'search');
      expect(searchStep?.value).toBe('playwright automation');
    });
  });

  describe('workflow handler', () => {
    it('should map custom workflow steps', () => {
      const input: GoalInput = {
        goal: 'workflow',
        inputs: {
          steps: [
            { type: 'navigate', value: 'https://example.com' },
            { type: 'click', selector: '#btn' }
          ]
        }
      };
      const steps = mapper.mapToSteps(input);
      expect(steps.length).toBe(2);
      expect(steps[0].type).toBe('navigate');
      expect(steps[1].type).toBe('click');
    });
  });

  describe('handler registration', () => {
    it('should have 10 default handlers', () => {
      const goals = mapper.getAvailableGoals();
      expect(goals.length).toBeGreaterThanOrEqual(10);
    });

    it('should return handler description', () => {
      expect(mapper.getGoalDescription('navigate')).toBe('Navigate to a URL');
      expect(mapper.getGoalDescription('search')).toBe('Search on a website');
    });

    it('should check if handler exists', () => {
      expect(mapper.hasGoalHandler('navigate')).toBe(true);
      expect(mapper.hasGoalHandler('nonexistent')).toBe(false);
    });
  });
});
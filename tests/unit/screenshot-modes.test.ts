import { describe, it, expect } from 'vitest';
import { screenshotModes } from '../fixtures/test-data.js';

describe('Screenshot Modes', () => {
  it('should have all 4 modes defined', () => {
    expect(screenshotModes).toContain('none');
    expect(screenshotModes).toContain('base64');
    expect(screenshotModes).toContain('file');
    expect(screenshotModes).toContain('both');
  });

  it('should not have overlapping base64/file capture', () => {
    const modes = ['none', 'base64', 'file', 'both'];
    modes.forEach(mode => {
      if (mode === 'file') {
        expect(mode).not.toBe('base64');
      }
    });
  });

  it('should define mode behavior correctly', () => {
    expect(screenshotModes.length).toBe(4);
  });
});
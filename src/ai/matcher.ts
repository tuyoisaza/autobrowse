import { Page } from 'playwright';
import { createLogger } from '../logger/index.js';

const logger = createLogger('ai:matcher');

export interface ElementContext {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  selector: string;
}

export class ElementMatcher {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async getPageContext(): Promise<string> {
    const elements = await this.page.evaluate(() => {
      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        return el.tagName.toLowerCase();
      };

      const clickable = ['button', 'a', 'input', 'select', 'textarea'];
      const els = Array.from(document.querySelectorAll(clickable.join(',')))
        .slice(0, 50)
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 50) || '',
          attributes: {
            type: (el as HTMLInputElement).type || '',
            placeholder: (el as HTMLInputElement).placeholder || '',
            name: (el as HTMLInputElement).name || '',
            id: el.id || '',
            'data-testid': el.getAttribute('data-testid') || ''
          },
          selector: getSelector(el)
        }));
      return els;
    });

    return elements.map(e => `${e.tag}: "${e.text}" (${e.selector})`).join('\n');
  }

  async findByText(patterns: string[]): Promise<string | null> {
    for (const pattern of patterns) {
      const lower = pattern.toLowerCase();
      
      const exact = await this.page.locator(`button:text("${pattern}"), a:text("${pattern}")`).first();
      if (await exact.count() > 0) {
        const selector = await exact.evaluate(el => {
          if (el.id) return `#${el.id}`;
          if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
          return '';
        });
        if (selector) return selector;
      }

      const partial = await this.page.locator(`button:has-text("${pattern}"), a:has-text("${pattern}")`).first();
      if (await partial.count() > 0) {
        return await partial.evaluate(el => el.id || el.getAttribute('data-testid') || el.tagName.toLowerCase());
      }
    }
    return null;
  }

  async findByPlaceholder(placeholder: string): Promise<string | null> {
    const input = await this.page.locator(`[placeholder*="${placeholder}"]`).first();
    if (await input.count() > 0) {
      return await input.evaluate(el => el.id || el.getAttribute('name') || el.getAttribute('data-testid') || '');
    }
    return null;
  }

  async findBestMatch(description: string): Promise<string | null> {
    const words = description.toLowerCase().split(/\s+/);
    
    const selector = await this.findByText(words);
    if (selector) return selector;

    for (const word of words) {
      const inputMatch = await this.findByPlaceholder(word);
      if (inputMatch) return `[name="${inputMatch}"], [placeholder*="${word}"]`;
    }

    return null;
  }
}

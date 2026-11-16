import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkdownRenderer from '../MarkdownRenderer';

describe('MarkdownRenderer citation marks', () => {
  it('renders [n] markers as numbered circles and leaves code alone', () => {
    const { container } = render(
      <MarkdownRenderer content={'RAG grounds answers[1][2].\n\n- Use `arr[0]` [3]'} citationMarks />
    );
    const marks = [...container.querySelectorAll('span.ws-cite')].map((el) => el.textContent);
    expect(marks).toEqual(['1', '2', '3']);
    expect(container.querySelector('code')?.textContent).toBe('arr[0]');
    expect(container.textContent).not.toContain('[1]');
  });

  it('keeps brackets when citation marks are off', () => {
    const { container } = render(<MarkdownRenderer content="Text [1]." />);
    expect(container.querySelector('.ws-cite')).toBeNull();
    expect(container.textContent).toContain('[1]');
  });

  it('makes the circles buttons inside claim spans, each knowing its source', () => {
    const { container } = render(
      <MarkdownRenderer content={'Depth is leverage [1]. Locality matters [2][3].\n\n- Use `arr[0]` here [1]'} markClaims />
    );
    const claims = [...container.querySelectorAll('.ws-claim')];
    expect(claims.map((el) => [...el.querySelectorAll<HTMLElement>('button.ws-cite')].map((m) => m.dataset.cite))).toEqual([['1'], ['2', '3'], ['1']]);
    expect(container.querySelector('button.ws-cite')).toHaveAccessibleName('Source 1');
    expect(container.querySelector('p')?.textContent).toBe('Depth is leverage1. Locality matters23.');
    // The last word and its circles wrap together, so a circle never starts a line alone
    expect([...container.querySelectorAll('.ws-cite-run')].map((el) => el.textContent)).toEqual(['leverage1', 'matters23', 'here1']);
    expect(container.querySelector('code')?.textContent).toBe('arr[0]');
  });
});

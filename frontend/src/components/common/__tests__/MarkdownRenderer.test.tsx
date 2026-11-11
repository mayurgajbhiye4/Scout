import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkdownRenderer from '../MarkdownRenderer';

describe('MarkdownRenderer citation marks', () => {
  it('renders [n] markers as superscripts and leaves code alone', () => {
    const { container } = render(
      <MarkdownRenderer content={'RAG grounds answers[1][2].\n\n- Use `arr[0]` [3]'} citationMarks />
    );
    const marks = [...container.querySelectorAll('sup.ws-cite')].map((el) => el.textContent);
    expect(marks).toEqual(['1', '2', '3']);
    expect(container.querySelector('code')?.textContent).toBe('arr[0]');
    expect(container.textContent).not.toContain('[1]');
  });

  it('keeps brackets when citation marks are off', () => {
    const { container } = render(<MarkdownRenderer content="Text [1]." />);
    expect(container.querySelector('sup')).toBeNull();
    expect(container.textContent).toContain('[1]');
  });
});

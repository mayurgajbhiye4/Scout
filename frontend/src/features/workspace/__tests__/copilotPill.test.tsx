import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopilotPill } from '../UnifiedWorkspace';

function renderPill(props: Partial<React.ComponentProps<typeof CopilotPill>> = {}) {
  const handlers = { onRestore: vi.fn(), onExpand: vi.fn(), onClose: vi.fn() };
  render(<CopilotPill title="Attention and memory" answering={false} {...handlers} {...props} />);
  return handlers;
}

describe('CopilotPill', () => {
  it('names the session and brings the window back when clicked', () => {
    const { onRestore } = renderPill();
    const pill = screen.getByRole('button', { name: /Attention and memory/ });
    expect(pill).toHaveAttribute('aria-controls', 'ws-window-copilot');
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(pill);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('says when an answer is on its way', () => {
    renderPill({ answering: true });
    expect(screen.getByRole('button', { name: /Answering…/ })).toBeInTheDocument();
  });

  it('expands and closes from its own buttons', () => {
    const { onExpand, onClose, onRestore } = renderPill();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Research Copilot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Research Copilot' }));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('leaves out expand where the window cannot widen (phones)', () => {
    renderPill({ onExpand: undefined });
    expect(screen.queryByRole('button', { name: 'Expand Research Copilot' })).not.toBeInTheDocument();
  });
});

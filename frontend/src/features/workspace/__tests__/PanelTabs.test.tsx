import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PanelTabs from '../PanelTabs';

describe('PanelTabs', () => {
  it('shows both panels with their counts, marks the open one, and switches on click', () => {
    const onChange = vi.fn();
    render(<PanelTabs value="sessions" onChange={onChange} counts={{ sessions: '28+', sources: 14 }} />);
    expect(screen.getByRole('tab', { name: 'Sessions 28+' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sources 14' })).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByRole('tab', { name: 'Sources 14' }));
    expect(onChange).toHaveBeenCalledWith('sources');
  });

  it('leaves a count out while it is loading', () => {
    render(<PanelTabs value="sources" onChange={vi.fn()} counts={{ sources: 3 }} />);
    expect(screen.getByRole('tab', { name: 'Sessions' })).toBeInTheDocument();
  });
});

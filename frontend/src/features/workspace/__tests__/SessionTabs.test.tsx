import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionTabs from '../SessionTabs';

const tabs = [
  { id: 'a', title: 'Alpha notes' },
  { id: 'b', title: 'Beta review' },
  { id: 'c', title: '' },
];

function setup(props: Partial<Parameters<typeof SessionTabs>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn() };
  render(<SessionTabs tabs={tabs} activeId="b" {...handlers} {...props} />);
  return handlers;
}

describe('SessionTabs', () => {
  it('shows a tab per open session and marks the open one', () => {
    setup();
    expect(screen.getByRole('tablist', { name: 'Open sessions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha notes' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Beta review' })).toHaveAttribute('aria-selected', 'true');
    // A session whose title isn't known yet still gets a name
    expect(screen.getByRole('tab', { name: 'Research session' })).toBeInTheDocument();
  });

  it('opens another tab on click, but not the one already open', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Beta review' }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha notes' }));
    expect(onSelect).toHaveBeenCalledWith(tabs[0]);
  });

  it('closes a tab without opening it', () => {
    const { onClose, onSelect } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close Alpha notes' }));
    expect(onClose).toHaveBeenCalledWith('a');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes a tab on middle click', () => {
    const { onClose } = setup();
    fireEvent(screen.getByRole('tab', { name: 'Alpha notes' }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(onClose).toHaveBeenCalledWith('a');
  });

  it('starts new research from the + button', () => {
    const { onNew } = setup();
    fireEvent.click(screen.getByRole('button', { name: /New research/ }));
    expect(onNew).toHaveBeenCalled();
  });

  it('shows a new conversation as the open tab, in place of the + button', () => {
    setup({ activeId: null });
    expect(screen.getByRole('tab', { name: 'New research' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Beta review' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('button', { name: /New research/ })).not.toBeInTheDocument();
  });

  it('says when the open session is answering', () => {
    setup({ busy: true });
    expect(screen.getByRole('tab', { name: /Beta review.*answering/ })).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys, Home and End, and closes with Delete', () => {
    const { onClose, onSelect } = setup();
    const beta = screen.getByRole('tab', { name: 'Beta review' });
    beta.focus();
    fireEvent.keyDown(beta, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Research session' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Alpha notes' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Research session' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Alpha notes' })).toHaveFocus();
    // Moving focus doesn't switch session: that would cut off a reply
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: 'Delete' });
    expect(onClose).toHaveBeenCalledWith('a');
  });
});

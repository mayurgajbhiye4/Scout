import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntityNavigator from '../canvas/EntityNavigator';
import type { WorkspaceNode } from '../useWorkspaceData';

const node = (id: string, label: string, type: string, degree: number, extra: Partial<WorkspaceNode> = {}): WorkspaceNode => ({
  id,
  label,
  type,
  degree,
  isSource: type === 'Document',
  isUser: type === 'User',
  sourceIds: [],
  ...extra,
});

const NODES = [
  node('me', 'You', 'User', 0),
  node('doc1', 'Paper', 'Document', 2),
  node('rag', 'RAG', 'Concept', 2),
  node('lc', 'LangChain', 'Technology', 5, { description: 'A framework for LLM apps.' }),
  node('gem', 'Gemini', 'Technology', 3),
];

function setup() {
  const onHover = vi.fn();
  const onSelect = vi.fn();
  render(
    <EntityNavigator
      nodes={NODES}
      markOf={() => ({ shape: 'circle', color: '#000000' })}
      selectedId={null}
      onHover={onHover}
      onSelect={onSelect}
    />
  );
  const options = () => screen.queryAllByRole('option').map((o) => o.textContent);
  return { onHover, onSelect, options, search: screen.getByRole('combobox') };
}

describe('EntityNavigator', () => {
  it('lists everything but you, grouped by type, most connected first', () => {
    const { options } = setup();
    expect(options()).toEqual(['Paper2', 'RAG2', 'LangChain5', 'Gemini3']);
  });

  it('filters by name or description as you type', () => {
    const { options, search } = setup();
    fireEvent.change(search, { target: { value: 'framework' } });
    expect(options()).toEqual(['LangChain5']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(options()).toEqual([]);
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
  });

  it('filters by type pill', () => {
    const { options } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Technology/ }));
    expect(options()).toEqual(['LangChain5', 'Gemini3']);
  });

  it('walks the list with the arrow keys, lighting each row, and Enter picks it', () => {
    const { onHover, onSelect, search } = setup();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(onHover).toHaveBeenLastCalledWith('rag');
    expect(search).toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'rag' }));
  });

  it('hovering a row lights it; clicking picks it', () => {
    const { onHover, onSelect } = setup();
    const row = screen.getByRole('option', { name: /Gemini/ });
    fireEvent.mouseEnter(row);
    expect(onHover).toHaveBeenLastCalledWith('gem');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'gem' }));
  });
});

import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import GraphCanvas from '../canvas/GraphCanvas';
import { linksIn } from '../canvas/addSourceOptions';

vi.mock('@/features/theme', () => ({ useTheme: () => ({ theme: 'light' }) }));

// jsdom doesn't lay anything out; the map only measures itself with this
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
});

function paste(text: string, target: EventTarget = document.body) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function renderMap(props: Partial<ComponentProps<typeof GraphCanvas>> = {}) {
  const onPasteLinks = vi.fn();
  const base = {
    graph: { nodes: [], links: [], entitiesBySource: new Map() },
    sourcesById: new Map(),
    isAuthenticated: true,
    selectedEntity: null,
    scope: null,
    variant: 'orb',
    onDropSources: vi.fn(() => ({ added: 0, skipped: 0 })),
    onPasteLinks,
    ...props,
  } as unknown as ComponentProps<typeof GraphCanvas>;
  render(<GraphCanvas {...base} />);
  return { onPasteLinks };
}

describe('linksIn', () => {
  it('finds each distinct http(s) link and nothing else', () => {
    expect(linksIn('see https://a.dev/x\nhttp://b.dev https://a.dev/x ftp://c.dev')).toEqual(['https://a.dev/x', 'http://b.dev']);
    expect(linksIn('just some notes')).toEqual([]);
  });
});

describe('pasting on the map', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('adds the pasted links, wherever focus is', () => {
    const { onPasteLinks } = renderMap();
    const event = paste('https://a.dev https://b.dev');
    expect(onPasteLinks).toHaveBeenCalledWith(['https://a.dev', 'https://b.dev']);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Adding 2 links', { selector: '[aria-hidden] p' })).toBeInTheDocument();
  });

  it('says what it takes when the clipboard has no link', () => {
    const { onPasteLinks } = renderMap();
    paste('just some notes');
    expect(onPasteLinks).not.toHaveBeenCalled();
    expect(screen.getByText('Paste a link to add a source', { selector: '[aria-hidden] p' })).toBeInTheDocument();
  });

  it('leaves a text field its own paste', () => {
    const { onPasteLinks } = renderMap();
    const input = document.body.appendChild(document.createElement('textarea'));
    const event = paste('https://a.dev', input);
    expect(onPasteLinks).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('stays out of the way of an open dialog', () => {
    const { onPasteLinks } = renderMap();
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    paste('https://a.dev');
    expect(onPasteLinks).not.toHaveBeenCalled();
  });

  it('says so while adding sources is paused', () => {
    const { onPasteLinks } = renderMap({ dropPausedFor: 12 });
    paste('https://a.dev');
    expect(onPasteLinks).not.toHaveBeenCalled();
    expect(screen.getByText('Adding sources is paused for 12s', { selector: '[aria-hidden] p' })).toBeInTheDocument();
  });
});

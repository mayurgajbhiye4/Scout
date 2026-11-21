import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/features/theme';
import { useAddSource } from '../canvas/AddSource';

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

function dropOf(files: File[]): DataTransfer {
  return { files, getData: () => '' } as unknown as DataTransfer;
}

describe('useAddSource files', () => {
  it('uploads PDF, Word, text and Markdown files, instead of reading them in the browser', () => {
    const ingest = vi.fn();
    const { result } = renderHook(() => useAddSource(ingest), { wrapper });
    const md = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
    const txt = new File(['plain'], 'notes.txt', { type: 'text/plain' });
    const pdf = new File(['%PDF-1.4'], 'paper.pdf', { type: 'application/pdf' });
    const docx = new File(['PK'], 'plan.docx', { type: '' });

    const dropped = result.current.dropSources(dropOf([md, txt, pdf, docx]));

    expect(dropped).toEqual({ added: 4, skipped: 0 });
    // No pasted content: the file itself goes to the server, which detects its encoding and enforces the size limit
    expect(ingest).toHaveBeenCalledWith('notes', 'notes.md', md);
    expect(ingest).toHaveBeenCalledWith('notes', 'notes.txt', txt);
    expect(ingest).toHaveBeenCalledWith('pdf', 'paper.pdf', pdf);
    expect(ingest).toHaveBeenCalledWith('notes', 'plan.docx', docx);
  });

  it('skips every other file type, including other text formats', () => {
    const ingest = vi.fn();
    const { result } = renderHook(() => useAddSource(ingest), { wrapper });
    const files = [
      new File(['x'], 'photo.png', { type: 'image/png' }),
      new File(['x'], 'old.doc', { type: 'application/msword' }),
      new File(['a,b'], 'table.csv', { type: 'text/csv' }),
      new File(['{}'], 'data.json', { type: 'application/json' }),
      new File(['<p>'], 'page.html', { type: 'text/html' }),
    ];

    expect(result.current.dropSources(dropOf(files))).toEqual({ added: 0, skipped: files.length });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('adds dragged links as web pages, but not dragged text', () => {
    const ingest = vi.fn();
    const { result } = renderHook(() => useAddSource(ingest), { wrapper });
    const textDrop = (text: string) => ({ files: [], getData: (t: string) => (t === 'text/plain' ? text : '') }) as unknown as DataTransfer;

    expect(result.current.dropSources(textDrop('https://docs.python.org/3/'))).toEqual({ added: 1, skipped: 0 });
    expect(ingest).toHaveBeenCalledWith('web', 'https://docs.python.org/3/');

    ingest.mockClear();
    // Skipped, so the map shows what can be dropped instead of creating a note
    expect(result.current.dropSources(textDrop('Some highlighted paragraph from a page'))).toEqual({ added: 0, skipped: 1 });
    expect(ingest).not.toHaveBeenCalled();
  });
});

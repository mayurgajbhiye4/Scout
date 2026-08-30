/**
 * Frontend application component tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AppProviders from '../src/app/providers';
import { extractCitationsFromMarkdown } from '../src/lib/citations';
import { formatDate, formatStatusLabel } from '../src/lib/formatters';

describe('Frontend Citation & Formatting Utilities', () => {
  it('extracts unique citations from markdown', () => {
    const text = 'PostgreSQL is relational [1]. Pinecone is vector [2] and another cite [1].';
    const citations = extractCitationsFromMarkdown(text);
    expect(citations).toHaveLength(2);
    expect(citations[0].index).toBe(1);
    expect(citations[1].index).toBe(2);
  });

  it('formats status labels correctly', () => {
    expect(formatStatusLabel('completed')).toBe('Completed');
    expect(formatStatusLabel('researching')).toBe('Researching');
    expect(formatStatusLabel('failed')).toBe('Failed');
  });

  it('formats dates gracefully', () => {
    const formatted = formatDate('2026-08-23T12:00:00Z');
    expect(formatted).toBeTruthy();
  });
});

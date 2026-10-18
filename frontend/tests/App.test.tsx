/**
 * Frontend application component tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AppProviders from '../src/app/providers';
import { extractCitationsFromMarkdown, resolveReferencedSources } from '../src/lib/citations';
import { formatDate, formatStatusLabel } from '../src/lib/formatters';

describe('Frontend Citation & Formatting Utilities', () => {
  it('extracts unique citations from markdown', () => {
    const text = 'PostgreSQL is relational [1]. Pinecone is vector [2] and another cite [1].';
    const citations = extractCitationsFromMarkdown(text);
    expect(citations).toHaveLength(2);
    expect(citations[0].index).toBe(1);
    expect(citations[1].index).toBe(2);
  });

  it('deduplicates multiple chunk citations from the same source into a single referenced source', () => {
    // Simulates the user scenario with 8 chunk citations all from the same video
    const duplicateCitations = Array.from({ length: 8 }, (_, i) => ({
      citation_index: i + 1,
      source_id: '71901a18-d72b-426c-82ff-3ad46cf61793',
      source_title: "Let's build GPT: from scratch, in code",
      canonical_uri: 'https://youtube.com/watch?v=kCc8FmEb1nY',
      snippet: `Chunk content number ${i}`,
    }));

    const markdown = "The GPT architecture is an autoregressive decoder-only model [1]. It uses self-attention [2].";
    const resolved = resolveReferencedSources(duplicateCitations, markdown);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].sourceTitle).toBe("Let's build GPT: from scratch, in code");
    expect(resolved[0].displayIndex).toBe(1);
    expect(resolved[0].sourceType).toBe('youtube');
    expect(resolved[0].snippets).toHaveLength(8);
  });

  it('supports multiple reference sources from RAG and Knowledge Graph relationships', () => {
    const multiCitations = [
      {
        citation_index: 1,
        source_id: 'src-1',
        source_title: "Let's build GPT: from scratch",
        source_type: 'youtube',
        snippet: 'Token embeddings and self-attention block',
      },
      {
        citation_index: 2,
        source_id: 'src-2',
        source_title: 'Attention Is All You Need.pdf',
        source_type: 'pdf',
        snippet: 'Scaled dot-product attention formula',
      },
      {
        citation_index: 3,
        source_id: 'src-3',
        source_title: 'Knowledge Graph: Transformer Architecture',
        source_type: 'graph',
        snippet: 'Entity: Multi-Head Attention RELATES_TO Transformer',
      },
    ];

    const markdown = 'Transformers rely on self-attention [1] and scaled dot-product attention [2]. Linked in graph [3].';
    const resolved = resolveReferencedSources(multiCitations, markdown);

    expect(resolved).toHaveLength(3);
    expect(resolved[0].sourceType).toBe('youtube');
    expect(resolved[1].sourceType).toBe('document');
    expect(resolved[2].sourceType).toBe('graph');
  });

  it('only keeps actual referenced sources when specific citation markers are used', () => {
    const citations = [
      {
        citation_index: 1,
        source_id: 'src-1',
        source_title: 'Cited Source A',
      },
      {
        citation_index: 2,
        source_id: 'src-2',
        source_title: 'Uncited Source B',
      },
    ];

    const markdown = 'Only Source A was actually used to answer this query [1].';
    const resolved = resolveReferencedSources(citations, markdown);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].sourceTitle).toBe('Cited Source A');
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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserBubble } from '../copilot/CopilotChat';
import { attachConcept, splitConcept } from '../copilot/conceptContext';

describe('attachConcept', () => {
  it('prefixes a question that does not name the concept', () => {
    expect(attachConcept('  why does it scale badly? ', 'Transformer')).toBe('About "Transformer": why does it scale badly?');
  });

  it('leaves a question that already names it, whatever the case', () => {
    expect(attachConcept('Explain "Transformer" using my sources', 'Transformer')).toBe('Explain "Transformer" using my sources');
    expect(attachConcept('how does a transformer train?', 'Transformer')).toBe('how does a transformer train?');
  });
});

describe('splitConcept', () => {
  it('gets back the concept and what was typed, across lines', () => {
    expect(splitConcept('About "Transformer": first\nsecond')).toEqual({ concept: 'Transformer', text: 'first\nsecond' });
  });

  it('copes with a name containing quotes', () => {
    expect(splitConcept(attachConcept('why?', 'The "Big" Model'))).toEqual({ concept: 'The "Big" Model', text: 'why?' });
  });

  it('leaves a message without the prefix alone', () => {
    expect(splitConcept('About attention: what is it?')).toEqual({ concept: null, text: 'About attention: what is it?' });
    expect(splitConcept('plain question')).toEqual({ concept: null, text: 'plain question' });
  });
});

describe('UserBubble', () => {
  it('shows the concept as a tag above the typed text', () => {
    render(<UserBubble content={'About "Transformer": why does it scale badly?'} />);
    expect(screen.getByText('Transformer')).toBeInTheDocument();
    expect(screen.getByText('why does it scale badly?')).toBeInTheDocument();
    expect(screen.queryByText(/About "/)).not.toBeInTheDocument();
  });

  it('shows an ordinary message as it was written', () => {
    render(<UserBubble content="plain question" />);
    expect(screen.getByText('plain question')).toBeInTheDocument();
  });
});

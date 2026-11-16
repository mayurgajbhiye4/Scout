import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AnswerRelation } from '@/api/chat';
import { useTheme } from '@/features/theme';
import { cn } from '@/lib/utils';
import type { EntityFocus } from '../../canvas/SourcesDock';
import { prettyRelation, relationColor } from '../../canvas/graphView';

function ConceptPill({ label, findConcept, onFocusConcept }: { label: string } & ConceptLinks) {
  const concept = findConcept?.(label) ?? null;
  if (concept && onFocusConcept) {
    return (
      <button type="button" onClick={() => onFocusConcept(concept)} title={`Show ${label} on the map`} className="ws-concept is-linked">
        {label}
      </button>
    );
  }
  return (
    <span className="ws-concept" title={label}>
      {label}
    </span>
  );
}

interface ConceptLinks {
  findConcept?: (label: string) => EntityFocus | null;
  onFocusConcept?: (concept: EntityFocus) => void;
}

/**
 * How the answer's concepts connect, as edges from the user's knowledge graph. Folded into one line under the answer;
 * opened, each edge reads concept, the relation and an arrow, concept (wrapping when the chat is narrow), with one
 * line on what the link means for this answer.
 */
export function RelationMap({ relations, findConcept, onFocusConcept }: { relations: AnswerRelation[] } & ConceptLinks) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (relations.length === 0) return null;
  return (
    <section aria-label="How these connect">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="ws-step-label -ml-2 flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-[var(--ws-card-hover)] hover:text-[var(--ws-ink-soft)] cursor-pointer"
      >
        {relations.length === 1 ? '1 connection' : `${relations.length} connections`} on your map
        <ChevronRight size={13} className={cn('transition-transform duration-200', open && 'rotate-90')} aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="ui-in-fade mt-2 flex flex-col gap-2.5">
          {relations.map((r) => (
            <RelationRow
              key={r.id}
              relation={r}
              color={relationColor(r.relationship, theme === 'light')}
              findConcept={findConcept}
              onFocusConcept={onFocusConcept}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RelationRow({ relation: r, color, findConcept, onFocusConcept }: { relation: AnswerRelation; color: string } & ConceptLinks) {
  const words = prettyRelation(r.relationship);
  const gloss = r.note || r.description || r.definition;
  return (
    <li className="min-w-0">
      <div className="ws-relation" aria-label={`${r.source} ${words} ${r.target}`}>
        <ConceptPill label={r.source} findConcept={findConcept} onFocusConcept={onFocusConcept} />
        <span className="ws-relation-edge" style={{ color }} aria-hidden>
          {words}
          <svg width="12" height="8" viewBox="0 0 12 8" className="shrink-0">
            <path d="M0 4 H10" stroke="currentColor" strokeWidth="1.25" />
            <path d="M7 1 L10.5 4 L7 7" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <ConceptPill label={r.target} findConcept={findConcept} onFocusConcept={onFocusConcept} />
      </div>
      {gloss && <p className="mt-1 text-[12.5px] leading-snug text-[var(--ws-ink-faint)]">{gloss}</p>}
    </li>
  );
}

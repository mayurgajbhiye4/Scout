import type { AnswerExtras, EvidenceClaim } from '@/api/chat';
import type { ReferencedSourceItem } from '@/lib/citations';

/** What the card under an answer shows for one citation. */
export interface Passage {
  quote: string;
  chunkIndex?: number;
  /** Picked for this very sentence, rather than the source's passage for the answer as a whole. */
  exact: boolean;
}

/** How alike two claim keys must be (shared words over the longer one) to count as the same sentence. */
const MIN_KEY_OVERLAP = 0.6;

function keyWords(key: string) {
  return new Set(key.split(' ').filter((w) => w.length > 2));
}

/** The saved claim for a sentence whose key didn't match exactly (formatting split it), if one is close enough. */
function closestClaim(key: string, candidates: EvidenceClaim[]): EvidenceClaim | undefined {
  const words = keyWords(key);
  let best: EvidenceClaim | undefined;
  let bestScore = MIN_KEY_OVERLAP;
  for (const c of candidates) {
    const other = keyWords(c.key);
    const shared = [...words].filter((w) => other.has(w)).length;
    const score = shared / Math.max(words.size, other.size, 1);
    if (score >= bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The passage to show for a citation: the one picked for its sentence, else the source's passage for the whole
 * answer, else the snippet saved with the citation. A sentence never borrows another sentence's quote.
 */
export function passageFor(
  mark: { citation: number; key: string },
  extras: AnswerExtras | null | undefined,
  ref?: ReferencedSourceItem
): Passage | null {
  const ofSource = (extras?.evidence?.claims ?? []).filter((c) => c.citation_index === mark.citation);
  const claim = mark.key ? ofSource.find((c) => c.key === mark.key) ?? closestClaim(mark.key, ofSource) : undefined;
  if (claim) return { quote: claim.quote, chunkIndex: claim.chunk_index, exact: true };
  const whole = extras?.evidence?.sources?.[String(mark.citation)];
  if (whole) return { quote: whole.quote, chunkIndex: whole.chunk_index, exact: false };
  const snippet = ref?.snippets[0];
  return snippet ? { quote: snippet, exact: false } : null;
}


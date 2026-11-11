/**
 * A question asked about the concept picked on the map carries that concept in its text, so retrieval, memory and the
 * model all know what "this" means. It's plain message content on purpose: the chat reducer matches a sent message to
 * its saved copy by exact content, and older messages simply have no prefix.
 */
const PREFIX = /^About "(.+?)": ([\s\S]*)$/;

/** The question as it's sent. One that already names the concept needs no help. */
export function attachConcept(text: string, name: string): string {
  const question = text.trim();
  return question.toLowerCase().includes(name.toLowerCase()) ? question : `About "${name}": ${question}`;
}

/** Splits a sent message back into the concept it was about, if any, and what was typed. */
export function splitConcept(content: string): { concept: string | null; text: string } {
  const match = PREFIX.exec(content);
  return match ? { concept: match[1]!, text: match[2]! } : { concept: null, text: content };
}

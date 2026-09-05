from typing import List


def chunk_text(
    text: str,
    max_chunk_size: int = 1500,
    overlap: int = 200,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> List[str]:
    """
    Split text into overlapping chunks using a simple character-based approach.
    Prioritizes splitting on double newlines, then single newlines, then spaces.
    
    In a full production environment, this should use a proper tokenizer
    like tiktoken or LangChain's RecursiveCharacterTextSplitter.
    """
    if chunk_size is not None:
        max_chunk_size = chunk_size
    if chunk_overlap is not None:
        overlap = chunk_overlap

    if not text:
        return []

    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + max_chunk_size, text_len)

        if end >= text_len:
            final_chunk = text[start:text_len].strip()
            if final_chunk:
                chunks.append(final_chunk)
            break

        # Try to find a good break point
        break_point = -1
        
        # 1. Look for double newline
        break_point = text.rfind("\n\n", start, end)
        
        # 2. Look for single newline if no double newline found
        if break_point == -1 or break_point <= start:
            break_point = text.rfind("\n", start, end)
            
        # 3. Look for space if no newline found
        if break_point == -1 or break_point <= start:
            break_point = text.rfind(" ", start, end)

        # 4. Force split if no good break point found
        if break_point == -1 or break_point <= start:
            break_point = end

        chunk = text[start:break_point].strip()
        if chunk:
            chunks.append(chunk)

        # Move start forward, accounting for overlap and ensuring strict progress
        prev_start = start
        if break_point > start + overlap:
            start = break_point - overlap
        else:
            start = break_point

        # Guarantee strictly monotonic progress to prevent infinite loop / memory exhaustion
        if start <= prev_start:
            start = prev_start + 1

    return chunks

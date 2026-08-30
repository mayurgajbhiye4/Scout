from typing import List


def chunk_text(text: str, max_chunk_size: int = 1500, overlap: int = 200) -> List[str]:
    """
    Split text into overlapping chunks using a simple character-based approach.
    Prioritizes splitting on double newlines, then single newlines, then spaces.
    
    In a full production environment, this should use a proper tokenizer
    like tiktoken or LangChain's RecursiveCharacterTextSplitter.
    """
    if not text:
        return []

    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + max_chunk_size

        if end >= text_len:
            chunks.append(text[start:text_len].strip())
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

        # Move start forward, accounting for overlap
        start = break_point - overlap
        
        # Ensure we always make forward progress
        if start <= chunks[-1].__len__() - max_chunk_size:
            start = break_point

    return chunks

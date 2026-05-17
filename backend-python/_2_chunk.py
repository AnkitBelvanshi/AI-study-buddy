"""
_2_chunk.py - split a long string inot overlapping chunks.
Usage: 
    python _2_chunk.py document.pdf
"""

import sys
from _1_read import read_pdf

def chunk_text(text: str, chunk_size: int = 2000, overlap: int = 500) -> list[str]:
    """Split text into chunks of 'chunk_size' characters with 'overlap' between them."""

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        # Move forward by (chunk_size - overlap) so the next chunk starts inside the previous
        start += chunk_size - overlap

    return chunks

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python _2_chunk.py <path-to-pdf>")
        sys.exit(1)

    text = read_pdf(sys.argv[1])
    chunks = chunk_text(text, chunk_size=500, overlap=50)

    print(f"\nCreated {len(chunks)} chunks")
    print(f"\n--- First chunk ---\n{chunks[0]}")
    print(f"\n--- Second chunk (notice the overlap with first)---\n{chunks[1]}")
"""
_4_search.py - find chunks relevant to a question.
Usage:
    python _4_search.py document.pdf "your question here"
"""

import sys
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import cast

from _1_read import read_pdf
from _2_chunk import chunk_text

def search(question:str, chunks:list[str], embeddings: np.ndarray, model: SentenceTransformer, top_k: int = 3) -> list[tuple[str, float]]:
    """Return the top_k chunks most relevant to the question."""

    # Embed the question into the same 384-dim space as the chunks.
    question_embedding = model.encode(question, 
                            normalize_embeddings=True, 
                            convert_to_numpy=True,
                            convert_to_tensor=False)
    
    # Cosine similarity = dot product (because all vectors are normalized).
    # This gives one score per chunk: how similar is the chunk to the question?
    similarities = embeddings @ question_embedding # @ is matrix multiplication

    # Get the indices of the top_k highest scores.
    top_indices = np.argsort(similarities)[::-1][:top_k]

    return [(chunks[i], float(similarities[i])) for i in top_indices]

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python _4_search.py <path-to-pdf> \"your question here\"")
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    question = " ".join(sys.argv[2:])

    text = read_pdf(pdf_path)
    chunks = chunk_text(text)

    model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    embeddings = model.encode(chunks,
                    normalize_embeddings=True,
                    show_progress_bar=True,
    )
    
    results = search(question, chunks, embeddings , model)

    print(f"\n--- Top 3 relevant for :\"{question}\" ---\n")
    for i, (chunk, score) in enumerate(results, 1):
        print(f"[{i}] score={score: .3f}")
        print(chunk)
        print()

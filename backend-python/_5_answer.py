"""
_5_answer.py - full RAG: PDF + question -> grounded answer.
Usage:
    python _5_answer.py document.pdf "your question here"
"""

import os
import sys
from dotenv import load_dotenv
from groq import Groq
from sentence_transformers import SentenceTransformer
import numpy as np

from _1_read import read_pdf
from _2_chunk import chunk_text
from _4_search import search

load_dotenv()
MODEL_ANSWER = "llama-3.1-8b-instant"
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def answer_question(question: str, relevant_chunks: list[str]) -> str:
    """ Ask the LLM to answer the question using only the provided chunks."""
    # Build the context block from the chunks
    context = "\n\n".join(
        f"[Passage {i+1}]\n{chunk}" for i, chunk in enumerate(relevant_chunks)
    )

    system_prompt = (
        "You are a study assistant. Answer the user's question using ONLY the "
        "information provided in the passage below. If the passsages don't contain the answer,"
        "say so honestly - do not use outside knowledge. Cite passages like [1], [2]."
    )

    user_prompt = f"Passages: \n{context}\n\nQuestion: {question}"

    response = client.chat.completions.create(
        model=MODEL_ANSWER,
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content":  user_prompt},
        ],
        temperature=0.1 # low temp = stick to the passages, don't get creative
    )

    answer = response.choices[0].message.content
    if not answer: 
        return "Sorry, I couldn't find an answer in the provided passages."
    
    return answer.strip()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python _5_answer.py <path-to-pdf> \"your question here\"")
        sys.exit(1)

    pdf_path = sys.argv[1]
    question = " ".join(sys.argv[2:])

    # The full pipeline:
    print("1. Reading PDF...")
    text = read_pdf(pdf_path)
    
    print("\n2. Chunking...")
    chunks = chunk_text(text)
    print(f"{len(chunks)} chunks created.")

    print("\n3. Embedding...")
    model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    embeddings = model.encode(chunks, 
                    normalize_embeddings=True,
                    show_progress_bar=True)

    
    print("\n4. Searching for relevant chunks...")
    results = search(question, chunks, embeddings, model, top_k=3) # type: ignore
    relevant_chunks = [chunk for chunk, _ in results]

    print("\n5. Generating answer...")
    answer = answer_question(question, relevant_chunks)

    print(f"\n--- Question ---\n{question}")
    print(f"\n--- Answer ---\n{answer}")
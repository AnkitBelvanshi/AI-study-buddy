"""
agent_v2.py - agentic RAG using LangGraph's ReAct agent.
Usage: 
    python agent_v2.py <path-to-pdf> "your question here"
"""

import os
import sys
import numpy as np
from dotenv import load_dotenv
from groq import Groq
from langchain_core.tools import tool
from langchain_groq import ChatGroq
# from langgraph.prebuilt import create_react_agent
from langchain.agents import create_agent
from sentence_transformers import SentenceTransformer

from _1_read import read_pdf
from _2_chunk import chunk_text
from _4_search import search
from _5_answer import answer_question

load_dotenv()
MODEL = "llama-3.1-8b-instant"

# Same LLM as version 1, just throught LangChain's interface
# ChatGroq is a thin wrapper over the groq client we used directly before.

llm = ChatGroq(model=MODEL, temperature=0.1)

# We'll fill these in __main__ before the agent runs.
_chunks: list[str] = []
_embeddings: np.ndarray | None = None
_embedder: SentenceTransformer | None = None
_telemetry: dict = {"tools_used": [], "last_chunks": [], "last_scores": []}

def load_document(pdf_path: str) -> None:
    global _chunks, _embeddings, _embedder

    print("Loading PDF and embeddings...")
    text = read_pdf(pdf_path)
    _chunks = chunk_text(text)

    _embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
    _embeddings = _embedder.encode(
        _chunks,
        normalize_embeddings=True,
        show_progress_bar=True,
        convert_to_numpy=True,
        convert_to_tensor=False,
    )

@tool
def search_documents(query: str)-> str:
    """Search the user's uploaded document for passages relevant to a query.
    Use this FIRST to find information before answering."""
    _telemetry["tools_used"].append("search_documents")
    results = search(query, _chunks, _embeddings, _embedder, top_k=3)
    _telemetry["last_chunks"] = [c for c, _ in results]
    _telemetry["last_scores"] = [s for _, s in results]

    lines = []
    for i, (chunk, score) in enumerate(results, 1):\
        lines.append(f"[Passage {i}] (score: {score:.4f})\n{chunk}")
    return "\n\n".join(lines)

@tool
def rewrite_query(original_question: str, reason: str) -> str:
    """Rewrite a question into more technical terminology.
    Use this if search_documents returns weak or irrelevant passages.
    Then call search_documents again with the rewritten query."""
    _telemetry["tools_used"].append("rewrite_query")
    prompt=(
        f"Rewrite this question for better retrieval. Reason it failed: {reason}\n"
        f"Use technical terminology. Keep it under 20 words. Reply with only rewrite.\n\n"
        f"Origina: {original_question}"
    )
    response = llm.invoke(prompt)
    rewritten = response.content.strip().strip('"\'')
    return f"Rewritten query: {rewritten}\nNow call search_documents with this."


SYSTEM_PROMPT = """You are a study assistant answering questions about the user's uploaded document.

Rules: 
1. ALWAYS  call search_documents first.
2. Look at the passages. If they clearly answer the question, give the answer using ONLY their content. Cite as [1], [2], etc.
3. If the passages look weak or off-topic, call rewrite_query, then search_documents again. Do this at most once.
4. If after rewriting you still can't find the answer, say honestly: "I couldn't find this in the document." Do NOT use outside knowledge.
5. Keep answers concise - 2-4 sentences unless detail is requested.
"""

def run_agent(question: str)-> dict:
    _telemetry["tools_used"] = []
    _telemetry["last_chunks"] = []
    _telemetry["last_scores"] = []
    
    agent = create_agent(
        model=llm, 
        tools=[search_documents, rewrite_query],
        system_prompt=SYSTEM_PROMPT,
    )
    result = agent.invoke({
        "messages": [
            {"role": "user", "content": question},
        ],
    })

    final_message = result["messages"][-1]
    return {
        "answer": final_message.content,
        "tools_used": _telemetry["tools_used"],
        "chunks": _telemetry["last_chunks"],
        "scores": _telemetry["last_scores"],
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python agent_v2.py <path-to-pdf> \"your question\"")
        sys.exit(1)

    pdf_path = sys.argv[1]
    question = sys.argv[2]

    print("Loading PDF and embeddings...")
    text = read_pdf(pdf_path)
    _chunks = chunk_text(text)
    _embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
    _embeddings = _embedder.encode(_chunks, normalize_embeddings=True, show_progress_bar=True) 

    print(f"\nQuestion: {question}")
    result = run_agent(question)

    print("\n" + "=" * 60)
    print(f"ANSWER: {result['answer']}")
    print(f"Tools used: {result['tools_used']}")

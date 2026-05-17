"""
main.py - FastAPI ML service.

Endpoints:
    POST  /upload 
    POST  /ask
    GET   /documents
    DELETE /documents/{filename}
    GET   /health

Sessions are simple: client posses a session_id string with every request.
For now it's in-memory. Production swap: Redis.
"""

import os
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

from _1_read import read_pdf
from _2_chunk import chunk_text
from _4_search import search
from agent_v2 import run_agent, load_document

load_dotenv()

# ---------- state ----------
# Top-level dict: session_id -> {filename: {chunks, embeddings}}.
# Each session has its own document set. No leakage.
state: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading embedding model....")
    state["embedder"] = SentenceTransformer("BAAI/bge-small-en-v1.5")
    state["sessions"] = {} # session_id -> {filename: {chunks, embeddings}}
    print("Ready.")
    yield


app = FastAPI(title="Study Buddy ML", lifespan=lifespan)

# CORS for local development. In production, restrict to your gateway's origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- helpers ----------

UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

def get_session(session_id: str) -> str:
    """Return the session's document store, creating it if needed."""
    if session_id not in state["sessions"]:
        state["sessions"][session_id] = {}
    return state["sessions"][session_id]

# ---------- schemas ----------

class AskRequest(BaseModel):
    session_id: str
    question: str
    filename: str | None = None # if None, search across all session docs

class AskResponse(BaseModel):
    answer: str
    citations: list[dict]
    tools_used: list[str]


# ---------- endpoints ----------

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/upload")
def upload_pdf(file: UploadFile = File(...), session_id: str = Form(...)):
    """Recieve PDF, chunk + embed, store under session."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "File must be a PDF.")

    # Save tempgfile to pypdf can read it.
    saved = UPLOADS_DIR / f"{session_id}_{file.filename}"
    with open(saved, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    text = read_pdf(str(saved))
    chunks = chunk_text(text)
    embeddings = state["embedder"].encode(
        chunks, normalize_embeddings=True, show_progress_bar=False
    )

    session = get_session(session_id)
    session[file.filename] = {"chunks": chunks, "embeddings": embeddings}

    return {
        "filename": file.filename,
        "num_chunks": len(chunks),
        "status": "indexed",
    }


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    """Run the agentic RAG pipeline."""
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(404, "No documents uploaded in this session.")
    
    # Pick the document: explicit filename, or fall back to the only one.
    if req.filename:
        if req.filename not in session:
            raise HTTPException(404, f"Document {req.filename!r} not found.")
        target = session[req.filename]
    elif len(session) == 1:
        target = next(iter(session.values()))
    else:
        # raise HTTPException(400, 
        #     "Multiple documents indexed - specify `filename` in request.")
        import numpy as np
        all_chunks = []
        all_embeddings = []
        for doc in session.values():
            all_chunks.extend(doc["chunks"])
            all_embeddings.append(doc["embeddings"])
        target = {
            "chunks": all_chunks,
            "embeddings": np.vstack(all_embeddings),
        }


    # Pump state into the agent (same hack as eval.py - see limitations).
    import agent_v2
    agent_v2._chunks = target["chunks"]
    agent_v2._embeddings = target["embeddings"]
    agent_v2._embedder = state["embedder"]

    result = run_agent(req.question)

    # citations = [{"chunk": c, "index": i} for i, c in enumerate(result["chunks"])]
    scores = result.get("scores", [])
    doc_name = req.filename or next(iter(session.keys()), "document")
    citations = [
        {
            "text": c,
            "index": i,
            "relevance_score": scores[i] if i < len(scores) else 0,
            "source": doc_name,
        }
        for i, c in enumerate(result["chunks"])
    ]
        
    return AskResponse(
        answer=result["answer"],
        citations=citations,
        tools_used=result["tools_used"],
    )

@app.get("/documents")
def list_documents(session_id: str):
    session = get_session(session_id)
    return {
        "session_id": session_id,
        "documents": [
            {"filename": name, "num_chunks": len(d["chunks"])}
            for name, d in session.items()
        ]
    }

@app.delete("/documents/{filename}")
def delete_document(filename: str, session_id: str):
    session = get_session(session_id)
    if filename not in session:
        raise HTTPException(404, "Document not found.")
    del session[filename]
    return {"status": "deleted", "filename": filename}
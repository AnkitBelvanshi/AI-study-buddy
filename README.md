# AI Study Buddy

> Agentic RAG (Retrieval-Augmented Generation) over your documents — upload a PDF and have a conversation with it.

![Study Buddy UI](https://img.shields.io/badge/status-active-brightgreen) ![Python](https://img.shields.io/badge/python-3.11+-blue) ![Node](https://img.shields.io/badge/node-18+-green) ![React](https://img.shields.io/badge/react-18-61dafb)

---

## What It Does

Upload a PDF, ask questions, and get grounded answers with cited source passages. The agent doesn't just do a single search — it judges the quality of its results and rewrites the query if needed before answering.

**The pipeline for every question:**
1. Embed the question and search chunks by cosine similarity
2. Judge whether the retrieved passages actually answer the question
3. If weak → rewrite the query with more technical terminology and search again
4. Answer using **only** the retrieved passages, with `[1]`, `[2]` citations
5. Return the answer + source passages + telemetry (iterations, rewrites, tools used)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│                 │     │                      │     │                     │
│  React Frontend │────▶│  Express Gateway     │────▶│  FastAPI ML Service │
│  (Vite, port    │     │  (Node.js, port 4000)│     │  (Python, port 8000)│
│   5173)         │◀────│                      │◀────│                     │
│                 │     │  - CORS & rate limit  │     │  - PDF ingestion    │
└─────────────────┘     │  - Session mgmt      │     │  - Chunking         │
                        │  - Request shaping   │     │  - Embeddings       │
                        │  - Chat history      │     │  - Agentic RAG      │
                        └──────────────────────┘     └─────────────────────┘
```

### Frontend (`/frontend`)
- **React + Vite** single-page app
- Three-panel layout: document sidebar | chat | citations
- Optimistic UI — user messages appear instantly while the agent thinks
- Citation panel shows source passage text + relevance score per answer
- Session persistence via `localStorage`

### Express Gateway (`/backend-node`)
- Sits between the UI and Python to own CORS, rate limiting, and request shaping
- Wraps the flat Python response into the `assistantMessage` shape the frontend expects
- Maintains in-memory chat history per session (swap to Redis for production)

### FastAPI ML Service (`/backend-python`)
- `_1_read.py` — PDF text extraction via `pypdf`
- `_2_chunk.py` — overlapping character chunks (500 chars, 150 overlap)
- `_4_search.py` — cosine similarity search using normalized embeddings
- `_5_answer.py` — LLM answer generation with passage context
- `agent_v2.py` — LangGraph ReAct agent with `search_documents` and `rewrite_query` tools
- `main.py` — FastAPI app, session state, endpoint definitions

---

## Project Structure

```
study-buddy/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js          # All fetch calls, one place
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx  # Message list + composer
│   │   │   ├── CitationPanel.jsx  # Source passages sidebar
│   │   │   └── DocumentUpload.jsx # Drag-and-drop uploader
│   │   ├── styles/
│   │   │   └── app.css
│   │   └── App.jsx                # Layout + session lifecycle
│   ├── package.json
│   └── vite.config.js
│
├── backend-node/
│   ├── server.js                  # Express gateway
│   └── package.json
│
├── backend-python/
│   ├── main.py                    # FastAPI app + endpoints
│   ├── agent_v2.py                # ReAct agent (LangGraph)
│   ├── _1_read.py                 # PDF reader
│   ├── _2_chunk.py                # Text chunker
│   ├── _4_search.py               # Embedding search
│   ├── _5_answer.py               # LLM answer generation
│   └── uploads/                   # Saved PDFs (gitignored)
│
└── README.md
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Groq API Key | [console.groq.com](https://console.groq.com) |

---

## Setup & Installation

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/study-buddy.git
cd study-buddy
```

### 2. Python backend

```bash
cd backend-python

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install fastapi uvicorn pypdf sentence-transformers \
            python-dotenv groq langchain langchain-groq \
            langgraph numpy pydantic python-multipart

# Create .env
echo "GROQ_API_KEY=your_groq_key_here" > .env

# Start the ML service
uvicorn main:app --reload --port 8000
```

### 3. Node gateway

```bash
cd backend-node

npm install

# Create .env
echo "PORT=4000" > .env
echo "PYTHON_URL=http://localhost:8000" >> .env

# Start the gateway
node server.js
# or with auto-reload:
npx nodemon server.js
```

### 4. Frontend

```bash
cd frontend

npm install

# Create .env (optional — defaults to localhost:4000)
echo "VITE_API_URL=http://localhost:4000" > .env

# Start dev server
npm run dev
```

### 5. Open the app

Navigate to **[http://localhost:5173](http://localhost:5173)**

---

## Environment Variables

### `backend-python/.env`
| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Your Groq API key for LLM calls |

### `backend-node/.env`
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Gateway port |
| `PYTHON_URL` | `http://localhost:8000` | FastAPI service URL |

### `frontend/.env`
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | Express gateway URL |

---

## How It Works — Deep Dive

### Document Ingestion
When you upload a PDF:
1. Express receives the file and forwards it to FastAPI via multipart form
2. FastAPI saves it, extracts text with `pypdf`
3. Text is split into 500-character overlapping chunks (150-char overlap to preserve context across boundaries)
4. Each chunk is embedded using `BAAI/bge-small-en-v1.5` (384-dimensional vectors, normalized)
5. Chunks + embeddings are stored in memory under your session ID

### Agentic Query Loop
When you ask a question, the LangGraph ReAct agent runs:

```
User question
     │
     ▼
search_documents(question)          ← always runs first
     │
     ▼
Are results good enough?
     ├── YES → generate answer with citations
     └── NO  → rewrite_query(reason)
                    │
                    ▼
              search_documents(rewritten_query)
                    │
                    ▼
              generate answer (or admit "not found")
```

The `rewrite_query` tool asks the LLM itself to make the query more technical, then searches again. This handles cases where a casual question ("why are plants green?") doesn't surface the right chunks but a technical rewrite ("chlorophyll pigment light absorption spectrum") does.

### Citation Scoring
Each cited chunk gets a **relevance score** (0–1) from cosine similarity between the query embedding and the chunk embedding. Scores above ~0.7 are strong matches; below ~0.5 often indicates the topic isn't well-covered in the document.

---

## API Reference

### FastAPI ML Service (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload and index a PDF |
| `POST` | `/ask` | Run the agentic RAG pipeline |
| `GET` | `/documents` | List indexed documents for a session |
| `DELETE` | `/documents/{filename}` | Remove a document from a session |
| `GET` | `/health` | Health check |

### Express Gateway (port 4000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Forward upload + create/validate session |
| `POST` | `/api/ask` | Forward question + shape response for UI |
| `GET` | `/api/documents` | List documents |
| `GET` | `/api/history` | Get chat history for session |
| `GET` | `/health` | Health check |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, vanilla CSS |
| Gateway | Express.js, Multer, Axios, Helmet |
| ML Service | FastAPI, Uvicorn, pypdf |
| Embeddings | `sentence-transformers` — `BAAI/bge-small-en-v1.5` |
| LLM | Groq — `llama-3.1-8b-instant` |
| Agent | LangGraph ReAct, LangChain Groq |
| Session store | In-memory (Map / dict) |

---

*Built as a learning project exploring agentic RAG architecture.*
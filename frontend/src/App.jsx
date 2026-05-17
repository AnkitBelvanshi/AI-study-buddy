import { useState, useEffect, useCallback } from "react";
import ChatInterface from "./components/ChatInterface";
import DocumentUpload from "./components/DocumentUpload";
import CitationPanel from "./components/CitationPanel";
import { listDocuments } from "./api/client";
import "./styles/app.css";

const SESSION_KEY = "ai-study-buddy.session";

/**
 * Top-level layout: sidebar (uploads + doc list) | chat | citations.
 *
 * Session lifecycle:
 *  - On first load, check localStorage for a sessionId.
 *  - If absent, leave it null — the first upload or message will create one
 *    server-side and the response will tell us the id, which we persist.
 *  - This means anonymous users get a sticky session across reloads.
 */
export default function App() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const [documents, setDocuments] = useState([]);
  const [activeCitations, setActiveCitations] = useState([]);

  const persistSession = useCallback((id) => {
    setSessionId(id);
    if (id) localStorage.setItem(SESSION_KEY, id);
  }, []);

  // Refresh document list whenever the session changes or after uploads/deletes.
  const refreshDocs = useCallback(async () => {
    if (!sessionId) {
      setDocuments([]);
      return;
    }
    try {
      const { documents } = await listDocuments(sessionId);
      setDocuments(documents || []);
    } catch (e) {
      console.error("Failed to list documents:", e);
    }
  }, [sessionId]);

  useEffect(() => { refreshDocs(); }, [refreshDocs]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-name">AI Study Buddy</span>
        </div>
        <div className="brand-tagline">Agentic RAG over your documents</div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <DocumentUpload
            sessionId={sessionId}
            onSession={persistSession}
            onUploaded={refreshDocs}
          />
          <div className="doc-list">
            <h3>Your documents</h3>
            {documents.length === 0 && (
              <p className="muted">Upload a PDF, .txt, or .md file to begin.</p>
            )}
            <ul>
              {documents.map((d) => (
                <li key={d.doc_id} className="doc-row">
                  <span className="doc-name">{d.filename}</span>
                  <span className="doc-chunks">{d.num_chunks} chunks</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="chat-area">
          <ChatInterface
            sessionId={sessionId}
            onSession={persistSession}
            onCitations={setActiveCitations}
            disabled={documents.length === 0}
          />
        </section>

        <aside className="citation-area">
          <CitationPanel citations={activeCitations} />
        </aside>
      </main>
    </div>
  );
}

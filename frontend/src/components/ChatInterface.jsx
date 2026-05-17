import { useState, useRef, useEffect } from "react";
import { sendMessage } from "../api/client";

/**
 * ChatInterface:
 *   - Local message list (we store it in component state, not refetched from server,
 *     because the gateway also keeps history — but for a fresh session, local is
 *     authoritative).
 *   - On send: optimistic user message, await server, append assistant message.
 *   - Telemetry chips on each assistant message: iterations, rewrites, tools.
 *
 * Why optimistic UI?
 *   The agentic loop can take 1-3 seconds. Showing the user message immediately
 *   gives the UX a feeling of responsiveness even while the LLM is thinking.
 */
export default function ChatInterface({sessionId, onSession, onCitations, disabled }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const endRef = useRef(null);

    // Auto-scroll to bottom on new message.
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    },[messages, sending]);
    
    async function handleSend(e) {
        e.preventDefault();
        const question = input.trim();
        if(!question || sending) return;
        setError(null);
        setInput("");
        // Optimistic add
        setMessages((m) => [...m, {role: "user", content: question, id: `u-${Date.now()}` }]);
        setSending(true);

        try {
            const result = await sendMessage(question, sessionId);
            if(result.sessionId && result.sessionId !== sessionId) {
                onSession(result.sessionId);
            }

            const a = result.assistantMessage;
            if (!a) {
                throw new Error("Received an incomplete response from the server.");
            }
            setMessages((m) => [...m, {
                role: "assistant",
                content: a.content || "No content returned.",
                id: a.id,
                citations: a.citations || [],
                meta: a.meta || {},
            }]);
            onCitations(a.citations || {});
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    function handleClickMessage(msg) {
        if(msg.role == "assistant" && msg.citations) {
            onCitations(msg.citations);
        }
    }

    return (
        <div className="chat">
            <div className="chat-scroll">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <p className="empty-title">Ask anything about your uploaded documents.</p>
                        <p className="empty-sub">
                            The agent will search, judge and (if needed) rewrite the query
                            before answering. You'll see citations on the right.
                        </p>
                    </div>
                )}

                {messages.map((m) => (
                    <div key={m.id} className={`msg msg-${m.role}`} onClick={() => handleClickMessage(m)}> 
                        <div className="msg-role">{m.role==="user" ? "You" : "Study Buddy"} </div>
                        <div className="msg-content">{m.content}</div>
                        {m.role === "assistant" && m.meta && (
                            <div className="msg-meta">
                                <span className="chip">{m.meta.iterations || 0} iterations</span>
                                <span className="chip">{m.meta.rewrites || 0} rewrites</span>
                                {(m.meta.toolsUsed || []).slice(0, 3).map((t, i) => (
                                    <span key={i} className="chip chip-tool">{t}</span>
                                ))} 
                            </div>
                        )}
                    </div>
                ))}

                {sending && (
                    <div className="msg msg-assistant msg-thinking">
                        <div className="msg-role">Study Buddy</div>
                        <div className="msg.content">
                            <span className="dot" /><span className="dot" /><span className="dot" />
                            <span className="thinking-text">retrieving · judging · answering</span>
                        </div>
                    </div>
                )}

                {error && <div className="error-banner">⚠ {error}</div>}
                <div ref={endRef} />
            </div>
            
            <form className="composer" onSubmit={handleSend}>
                <textarea 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter to sen, Shift+Enter for newline.
                        if(e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend(e);
                        }
                    }}
                    placeholder={disabled ? "Upload a document first...": "Ask a question about your documents..."}
                    disabled={disabled || sending}
                    rows={1}
                />
                <button type="submit" disabled={disabled || sending || !input.trim()} >
                    {sending ? "Thinking...": "Send"}
                </button>
            </form>
        </div>
    );
}
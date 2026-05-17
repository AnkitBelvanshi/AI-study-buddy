/**
 * API client for the Express gateway.
 * 
 * One file, one place to: 
 *  - inject base URL
 *  - handle non-2xx responses uniformly
 *  - add headers later(auth tokens, request IDs)
 * 
 * Components import these named functions, never use `fetch` directly.
 */
const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
    const resp = await fetch(`${BASE}${path}`, {
        headers: {"Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok) {
        const err = new Error(data.message || data.detail || `HTTP ${resp.status}`);
        err.status = resp.status;
        err.code = data.code;
        throw err;
    }
    return data;
}

// ---------- Documents ----------

export async function uploadDocument(file, sessionId) {
    // Multipart needs FormData, which the browser fills the boundary for -
    // so we must NOT set Content-Type, let the browser do it.
    const form = new FormData();
    form.append("file", file);
    if(sessionId) form.append("sessionId", sessionId);

    const resp = await fetch(`${BASE}/api/upload`, {
        method: "POST",
        body: form,
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok) throw new Error(data.error || `Upload failed: ${resp.status}`);
    return data;
}

export function listDocuments(sessionId) {
    return request(`/api/documents?sessionId=${encodeURIComponent(sessionId)}`);
}

export function deleteDocument(docId, sessionId) {
    return request(`/api/documents/${docId}?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
    });
}

// ---------- Chat ----------

export function sendMessage(question, sessionId) {
    return request("/api/ask", {
        method: "POST",
        body: JSON.stringify({ question, sessionId}),
    });
}

export function fetchHistory(sessionId) {
    return request(`/api/chat/history/${encodeURIComponent(sessionId)}`)
}
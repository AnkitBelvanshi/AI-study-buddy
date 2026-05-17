/**
 * DocumentUpload — drag-and-drop or click-to-pick.
 *
 * State machine: idle → uploading → success | error.
 * After success it auto-resets after 2s so the user can upload more without
 * needing to click anything.
 */
import { useState, useRef } from "react";
import { uploadDocument } from "../api/client";

export default function DocumentUpload({sessionId, onSession, onUploaded }) {
    const [status, setStatus] = useState({kind: "idle"});
    const [dragging, setDragging] = useState(false);
    const fileInput = useRef(null);

    async function handleFile(file) {
        if (!file) return;
        setStatus({kind: "uploading", filename: file.name});
        try {
            const result = await uploadDocument(file, sessionId);
            if(result.sessionId && result.sessionId !== sessionId) {
                onSession(result.sessionId);
            }
            setStatus({
                kind: "success",
                filename: file.name,
                chunks: result.num_chunks,
            });
            onUploaded?.();
            setTimeout(() => setStatus({kind: "idle"}), 2500);
        } catch (e) {
            setStatus({kind: "error", message: e.message });
        }
    }

    function onDrop(e){
        e.preventDefault();
        setDragging(false);
        const file= e.dataTransfer.files?.[0];
        handleFile(file);
    }

    return (
    <div className="uploader">
        <h3>Upload</h3>
        <div 
            className ={`dropzone ${dragging ? "dropzone-active" : ""}`}
            onDragOver = {(e) => {e.preventDefault(); setDragging(true);}}
            onDragLeave = {() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
        >
            <input
                ref={fileInput}
                type="file"
                accept=".pdf, .txt, .md"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {status.kind === "idle" && (
                <>
                    <div className="dropzone-icon">⬆</div>
                    <div>Drop a file or click to browse</div>
                    <div className="muted-small">.pdf, .txt, .mdpdf · .txt · .md  ·  up to 25 MB</div>
                </>
            )}
            {status.kind === "uploading" && (
                <div>Indexing <strong>{status.filename}</strong>...</div>
            )}
            {status.kind === "success" && (
                <div>
                    ✓ Indexed <strong>{status.filename}</strong>
                    {status.chunks ? ` into ${status.chunks} chunks.` : ""}
                </div>
            )}
            {status.kind==="error" && (
                <div className="error-text">✗ {status.message}</div>
            )}
        </div>
    </div> 
    );
} 
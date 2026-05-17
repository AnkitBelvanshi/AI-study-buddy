/** 
 * server.js - Express gateway in front of Python ML service.
 * 
 * Owns: CORS, rate limits, file upload verification, request shape for the UI.
 * Forwards: actual ML work to Python.
 */

require("dotenv").config();

const express =require('express');
const cors = require('cors');
const morgan =require('morgan');
const rateLimit =require("express-rate-limit");
const helmet = require("helmet");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const { randomUUID } =require("crypto");

const app = express();
const PORT = process.env.PORT || 4000;
const PYTHON_URL = process.env.PYTHON_URL || "http://localhost:8000";

// ---------- middleware ----------
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({limit: "1mb"}));
app.use(cors({
    origin: ["http://localhost:5173"],
    credentials: true,
}));

app.use("/api", rateLimit({ windowMs: 60_000, max: 60}));

// File upload handler - uses memory storage (we forward the bytes immediately).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 25 * 1024 * 1024}, // 25MB
});

// ---------- sessions(in-memory; swap to Redis for prod) ----------
const sessions = new Map(); // sessionId -> { id, history: [] }

function ensureSession(id) {
    if(id && sessions.has(id)) return id;
    const newId = id || randomUUID();
    sessions.set(newId, {id: newId, history: []});
    return newId;
}

// ---------- python client ----------
const python = axios.create({
    baseURL: PYTHON_URL,
    timeout: 60_000,
    validateStatus: () => true, // we'll handle non-2xx ourselves
});

function ok(resp, fallback) {
    if(resp.status >= 200 && resp.status < 300) return resp.data;
    const e = new Error(resp.data?.detail || fallback);
    e.status = resp.status;
    throw e; 
}

// ---------- routes ----------

app.get("/health", (_req, res) => res.json({status: "ok"}));

// POST /api/upload
app.post("/api/upload", upload.single("file"), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({error: "No file."});
        const sessionId = ensureSession(req.body.sessionId);

        const form = new FormData();
        form.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });
        form.append("session_id", sessionId);

        const resp = await python.post("/upload", form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
        
        res.json({...ok(resp, "Upload failed"), sessionId});
    } catch (e) { next(e); }
});


// POST /api/ask
app.post("/api/ask", async (req, res, next) => {
    try {
        const { question, filename } =req.body;
        if(!question) return res.status(400).json({error: "question required"});
        const sessionId = ensureSession(req.body.sessionId);

        // Save user message in history (best-effort)
        sessions.get(sessionId).history.push({
            role: "user",
            content: question,
        });

        const resp = await python.post("/ask", {
            session_id : sessionId,
            question,
            filename,
        });
        const data = ok(resp, "Ask failed");
        
        sessions.get(sessionId).history.push({
            role: "assistant",
            content: data.answer,
            source: data.citations,
        });
        
        res.json({
            sessionId,
            assistantMessage: {
                id: `a-${Date.now()}`,
                content: data.answer,
                citations: data.citations || [],
                meta: {
                    iterations: data.iterations || 0,
                    rewrites: data.rewrites || 0,
                    toolsUsed: data.tools_used || [],
                },
            },
        });
    } catch (e) { next(e); }
});

// GET /api/documents
app.get("/api/documents", async (req, res, next) => {
    try {
        const sessionId = ensureSession(req.query.sessionId);
        const resp = await python.get("/documents", {params: {session_id: sessionId}});
        res.json({ ...ok(resp, "List failed"), sessionId});
    } catch (e) { next(e); }
});

// GET /api/history
app.get("/api/history", (req, res) => {
    const sessionId = ensureSession(req.query.sessionId);
    res.json({sessionId, history: sessions.get(sessionId).history});
});

// ---------- error handler ----------
app.use((err, _req, res, _next) => {
    console.error("[error]", err.message);
    res.status(err.status || 500).json({error: err.message});
});

app.listen(PORT, () => {
    console.log(`Gateway on http://localhost:${PORT} → forwarding to ${PYTHON_URL}`);
});
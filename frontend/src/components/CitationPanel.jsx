/**
 * CitationPanel — shows the chunks the agent used.
 *
 * Why prominent? Because the trustworthiness of a RAG system is its citations.
 * If a user can verify the answer against the source paragraph, the whole
 * "hallucination" problem becomes "okay, I can see exactly where it got that
 * from." Without citations, you have an LLM chatbot, not a study tool.
 */
export default function CitationPanel({ citations }) {
    if(!citations || citations.length === 0) {
        return (
            <div className="citations">
                <h3>Sources</h3>
                <p className="muted small">
                    When the agent answers, the passages it used will appear here.
                </p>
            </div>
        ); 
    }

    return (
        <div className="citations">
            <h3>Sources ({citations.length})</h3>
            <ol className="citation-list">
                {citations.map((c, i) => (
                    <li key={i} className="citation-item">
                        <div className="citation-head">
                            <span className="citation-num">[{i + 1}]</span>
                            <span className="citation-source">[{c.source}]</span>
                            {c.page != null && <span className="citation-page">p. {c.page + 1}</span>}
                            <span className="citation-score" title="Relevance score(0-1)">
                                {(c.relevance_score * 100).toFixed(0)}%
                            </span>
                        </div>
                        <div className="citation-text">{c.text}</div>
                    </li>
                ))}
            </ol>
        </div>
    )
}
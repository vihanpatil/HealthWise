import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { rootwiseApi } from "../../api/rootwise";

function MarkdownMessage({ content }) {
  return (
    <div style={mdStyles.wrap}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ node, ...props }) => <h1 style={mdStyles.h1} {...props} />,
          h2: ({ node, ...props }) => <h2 style={mdStyles.h2} {...props} />,
          h3: ({ node, ...props }) => <h3 style={mdStyles.h3} {...props} />,
          p: ({ node, ...props }) => <p style={mdStyles.p} {...props} />,
          ul: ({ node, ...props }) => <ul style={mdStyles.ul} {...props} />,
          ol: ({ node, ...props }) => <ol style={mdStyles.ol} {...props} />,
          li: ({ node, ...props }) => <li style={mdStyles.li} {...props} />,
          blockquote: ({ node, ...props }) => <blockquote style={mdStyles.blockquote} {...props} />,
          a: ({ node, ...props }) => <a style={mdStyles.a} target="_blank" rel="noreferrer" {...props} />,
          code: ({ inline, children, ...props }) => {
            if (inline) {
              return (
                <code style={mdStyles.codeInline} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <pre style={mdStyles.pre}>
                <code style={mdStyles.codeBlock} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          hr: () => <hr style={mdStyles.hr} />,
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState("classic");
  const [showTrace, setShowTrace] = useState(false);
  const [traceSteps, setTraceSteps] = useState([]);

  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const historyTuples = useMemo(() => {
    const tuples = [];
    for (let i = 0; i < messages.length; i += 2) {
      const u = messages[i];
      const a = messages[i + 1];
      if (u?.role === "user" && a?.role === "assistant") tuples.push([u.text, a.text]);
    }
    return tuples;
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;

    setInput("");
    setStatus(mode === "agentic" ? "Running agentic workflow..." : "Streaming...");
    setIsStreaming(true);
    setTraceSteps([]);

    setMessages((prev) => [...prev, { role: "user", text: msg }, { role: "assistant", text: "" }]);

    await rootwiseApi.streamChat({
      message: msg,
      history: historyTuples,
      mode,
      debug: mode === "agentic" && showTrace,
      onMessage: (payload) => {
        const h = payload?.history;
        if (!Array.isArray(h) || h.length === 0) return;

        const last = h[h.length - 1];
        const assistantText = Array.isArray(last) ? String(last[1] ?? "") : "";

        setMessages((prev) => {
          if (prev.length < 2) return prev;
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", text: assistantText };
          return copy;
        });
      },
      onTrace: (payload) => {
        if (!payload?.label || !payload?.detail) return;
        setTraceSteps((prev) => [...prev, { label: payload.label, detail: payload.detail }]);
      },
      onDone: () => {
        setStatus("");
        setIsStreaming(false);
      },
      onError: (err) => {
        setStatus("Error");
        setIsStreaming(false);
        setMessages((prev) => {
          const copy = [...prev];
          if (copy.length) {
            copy[copy.length - 1] = {
              role: "assistant",
              text: `Error: ${err?.message || String(err)}`,
            };
          }
          return copy;
        });
      },
    });
  };

  const clear = () => {
    if (isStreaming) return;
    setMessages([]);
    setStatus("");
    setTraceSteps([]);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>RootWise Chat</div>
          <div style={styles.hint}>
            Ask for zero-waste recipes and functional-medicine tips grounded in your rootwise_data.
          </div>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.modeSwitch}>
            <button
              onClick={() => setMode("classic")}
              style={{ ...styles.modeBtn, ...(mode === "classic" ? styles.modeBtnActive : {}) }}
              disabled={isStreaming}
            >
              Classic
            </button>
            <button
              onClick={() => setMode("agentic")}
              style={{ ...styles.modeBtn, ...(mode === "agentic" ? styles.modeBtnActive : {}) }}
              disabled={isStreaming}
            >
              Agentic
            </button>
          </div>
          <button
            onClick={() => setShowTrace((prev) => !prev)}
            style={{ ...styles.traceBtn, ...(mode !== "agentic" ? styles.btnDisabled : {}) }}
            disabled={isStreaming || mode !== "agentic"}
          >
            {showTrace ? "Hide Trace" : "Show Trace"}
          </button>
          <button onClick={clear} style={{ ...styles.clearBtn, ...(isStreaming ? styles.btnDisabled : {}) }} disabled={isStreaming}>
            Clear
          </button>
        </div>
      </div>

      {mode === "agentic" ? (
        <div style={styles.modeHint}>
          Agentic mode runs a retrieval-planning workflow before answering. Higher latency is expected.
        </div>
      ) : null}

      <div style={styles.chatBox}>
        {messages.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Try one:</div>
            <div style={styles.emptyLine}>“What can I make with squash peels and miso?”</div>
            <div style={styles.emptyLine}>“Give me 2 gut-friendly dinner ideas from what I have.”</div>
            <div style={styles.emptyLine}>“How do I preserve leftover herbs?”</div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  ...(m.role === "user" ? styles.userBubble : styles.assistantBubble),
                }}
              >
                {m.role === "assistant" ? (
                  <MarkdownMessage content={m.text || "…"} />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                )}
              </div>
            </div>
          ))
        )}

        {status ? <div style={styles.status}>{status}</div> : null}
        {mode === "agentic" && showTrace && traceSteps.length > 0 ? (
          <div style={styles.tracePanel}>
            <div style={styles.traceTitle}>Workflow Trace</div>
            {traceSteps.map((step, idx) => (
              <div key={`${step.label}-${idx}`} style={styles.traceItem}>
                <span style={styles.traceLabel}>{step.label}</span>
                <span style={styles.traceDetail}>{step.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div ref={scrollRef} />
      </div>

      <div style={styles.composer}>
        <input
          style={styles.input}
          placeholder="Ask RootWise…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          onClick={send}
          style={{
            ...styles.sendBtn,
            ...((isStreaming || !input.trim()) ? styles.btnDisabled : {}),
          }}
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: 12,
    background: "linear-gradient(180deg, rgba(242,246,234,1) 0%, rgba(255,255,255,1) 100%)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 10,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  title: { fontSize: 14, fontWeight: 900 },
  hint: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  modeHint: {
    marginBottom: 10,
    padding: "8px 10px",
    borderRadius: 12,
    background: "rgba(233, 241, 220, 0.9)",
    border: "1px solid rgba(0,0,0,0.08)",
    fontSize: 12,
  },
  modeSwitch: {
    display: "flex",
    gap: 6,
    padding: 4,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.9)",
  },
  modeBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "white",
    fontWeight: 800,
    cursor: "pointer",
  },
  modeBtnActive: {
    background: "#E6F0D7",
  },
  traceBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    fontWeight: 800,
    cursor: "pointer",
  },
  clearBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    fontWeight: 900,
    cursor: "pointer",
  },
  chatBox: {
    height: 360,
    overflowY: "auto",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.06)",
    background: "rgba(255,255,255,0.85)",
  },
  empty: { opacity: 0.75, fontSize: 13 },
  emptyLine: { marginTop: 6 },
  bubble: {
    maxWidth: "82%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    lineHeight: 1.45,
    boxShadow: "0 6px 20px rgba(0,0,0,0.04)",
  },
  userBubble: { background: "#E6F0D7" },
  assistantBubble: { background: "#FFFFFF" },
  status: { marginTop: 8, fontSize: 12, opacity: 0.7 },
  tracePanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(248,250,244,0.95)",
  },
  traceTitle: {
    fontWeight: 900,
    fontSize: 12,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  traceItem: {
    display: "grid",
    gridTemplateColumns: "88px 1fr",
    gap: 10,
    fontSize: 12,
    padding: "6px 0",
    borderTop: "1px solid rgba(0,0,0,0.05)",
  },
  traceLabel: {
    fontWeight: 800,
    color: "#2D3A2E",
  },
  traceDetail: {
    opacity: 0.85,
  },
  composer: { display: "flex", gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    background: "white",
  },
  sendBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#2D3A2E",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
};

const mdStyles = {
  wrap: {
    fontSize: 13,
    color: "#101418",
  },
  h1: { fontSize: 16, fontWeight: 900, margin: "10px 0 6px" },
  h2: { fontSize: 15, fontWeight: 900, margin: "10px 0 6px" },
  h3: { fontSize: 14, fontWeight: 900, margin: "10px 0 6px" },
  p: { margin: "6px 0" },
  ul: { margin: "6px 0", paddingLeft: 18 },
  ol: { margin: "6px 0", paddingLeft: 18 },
  li: { margin: "2px 0" },
  blockquote: {
    margin: "8px 0",
    padding: "8px 10px",
    borderLeft: "3px solid rgba(0,0,0,0.15)",
    background: "rgba(0,0,0,0.03)",
    borderRadius: 10,
  },
  a: { color: "#0B66C3", textDecoration: "underline" },
  codeInline: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    padding: "1px 6px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.08)",
  },
  pre: {
    margin: "8px 0",
    padding: 10,
    borderRadius: 12,
    background: "rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflowX: "auto",
  },
  codeBlock: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
  },
  hr: { border: "none", borderTop: "1px solid rgba(0,0,0,0.08)", margin: "10px 0" },
};

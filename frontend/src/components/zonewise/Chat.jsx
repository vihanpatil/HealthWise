import React, { useEffect, useMemo, useRef, useState } from "react";
import { zonewiseApi } from "../../api/zonewise";

export default function ZoneChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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
    setStatus("Streaming...");
    setIsStreaming(true);
    setMessages((prev) => [...prev, { role: "user", text: msg }, { role: "assistant", text: "" }]);

    await zonewiseApi.streamChat({
      message: msg,
      history: historyTuples,
      onMessage: (payload) => {
        const h = payload?.history;
        if (!Array.isArray(h) || h.length === 0) return;
        const last = h[h.length - 1];
        const assistantText = Array.isArray(last) ? String(last[1] ?? "") : "";

        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", text: assistantText };
          return copy;
        });
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
          copy[copy.length - 1] = { role: "assistant", text: `Error: ${err?.message || String(err)}` };
          return copy;
        });
      },
    });
  };

  const clear = () => {
    if (isStreaming) return;
    setMessages([]);
    setStatus("");
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>ZoneWise Chat</div>
          <div style={styles.hint}>Ask questions grounded in your system_data/zonewise_data evidence.</div>
        </div>
        <button onClick={clear} style={styles.clearBtn} disabled={isStreaming}>Clear</button>
      </div>

      <div style={styles.chatBox}>
        {messages.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Try one:</div>
            <div style={styles.emptyLine}>“Summarize what the Zone 2 guidance says.”</div>
            <div style={styles.emptyLine}>“What does my documentation say about recovery?”</div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ ...styles.bubble, ...(m.role === "user" ? styles.userBubble : styles.assistantBubble) }}>
                {m.text || (m.role === "assistant" ? "…" : "")}
              </div>
            </div>
          ))
        )}
        {status ? <div style={styles.status}>{status}</div> : null}
        <div ref={scrollRef} />
      </div>

      <div style={styles.composer}>
        <input
          style={styles.input}
          placeholder="Ask ZoneWise…"
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
        <button onClick={send} style={styles.sendBtn} disabled={isStreaming || !input.trim()}>
          {isStreaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: { border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16, padding: 12, background: "linear-gradient(180deg, rgba(242,246,234,1) 0%, rgba(255,255,255,1) 100%)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: 900 },
  hint: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  clearBtn: { padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.9)", fontWeight: 900, cursor: "pointer" },
  chatBox: { height: 320, overflowY: "auto", padding: 12, borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.85)" },
  empty: { opacity: 0.75, fontSize: 13 },
  emptyLine: { marginTop: 6 },
  bubble: { maxWidth: "82%", padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", whiteSpace: "pre-wrap", lineHeight: 1.35, boxShadow: "0 6px 20px rgba(0,0,0,0.04)" },
  userBubble: { background: "#E6F0D7" },
  assistantBubble: { background: "#FFFFFF" },
  status: { marginTop: 8, fontSize: 12, opacity: 0.7 },
  composer: { display: "flex", gap: 8, marginTop: 10 },
  input: { flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", outline: "none", background: "white" },
  sendBtn: { padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#2D3A2E", color: "white", fontWeight: 900, cursor: "pointer" },
};

// frontend/src/routes/RootWise.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Chat from "../components/rootwise/Chat";
import { rootwiseApi } from "../api/rootwise";
import RagInputs from "../components/rootwise/RagInputs";

export default function RootWise() {
  const [name, setName] = useState("");
  const [nameStatus, setNameStatus] = useState("");
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [imgFile, setImgFile] = useState(null);
  const [detected, setDetected] = useState("");
  const [detectStatus, setDetectStatus] = useState("");
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewImg, setPreviewImg] = useState("");
  const [activeTab, setActiveTab] = useState("chat");
  const [fileScope, setFileScope] = useState("system");

  const hasName = useMemo(() => name.trim().length > 0, [name]);

  async function refreshFiles(scope = fileScope) {
    const res = await rootwiseApi.listFiles(scope);
    setFiles(res.files || []);
  }

  useEffect(() => {
    refreshFiles().catch(() => {});
  }, []);

  useEffect(() => {
    setSelected("");
    setPreviewText("");
    setPreviewImg("");
    refreshFiles(fileScope).catch(() => {});
  }, [fileScope]);

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.logo}>🌱</div>
          <div>
            <div style={styles.title}>RootWise</div>
            <div style={styles.subtitle}>Sustainability + functional medicine, powered by your knowledge base</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={styles.pill}>{hasName ? `User: ${name.trim()}` : "No user set"}</span>
          <Link to="/zonewise" style={styles.linkBtn}>
            ZoneWise →
          </Link>
        </div>
      </div>

      {/* Layout */}
      <div style={styles.grid}>
        {/* Left: profile + quick actions */}
        <aside style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardHeaderTitle}>Profile</div>
          </div>

          <div style={styles.fieldLabel}>Name</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mahyar"
              style={styles.input}
            />
            <button
              style={styles.primaryBtn}
              onClick={async () => {
                try {
                  await rootwiseApi.setName(name);
                  setNameStatus(`✅ Welcome, ${name.trim()}! Your notebook is ready.`);
                  await refreshFiles();
                } catch (e) {
                  setNameStatus(String(e));
                }
              }}
            >
              Set
            </button>
          </div>
          {nameStatus ? <pre style={styles.miniLog}>{nameStatus}</pre> : null}

          <div style={styles.divider} />

          <div style={styles.cardHeader}>
            <div style={styles.cardHeaderTitle}>Quick Notepad</div>
            <div style={styles.cardHeaderHint}>Saved into your user RAG</div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="Thought, recipe idea, zero-waste trick..."
            style={styles.textarea}
          />
          <button
            style={{ ...styles.primaryBtn, width: "100%", marginTop: 8 }}
            onClick={async () => {
              try {
                await rootwiseApi.appendNotepad(note);
                setNoteStatus("✅ Saved to your notebook.");
                setNote("");
                await refreshFiles();
              } catch (e) {
                setNoteStatus(String(e));
              }
            }}
          >
            Save Note
          </button>
          {noteStatus ? <pre style={styles.miniLog}>{noteStatus}</pre> : null}

          <div style={styles.divider} />

          <div style={styles.cardHeader}>
            <div style={styles.cardHeaderTitle}>Veg Detector</div>
            <div style={styles.cardHeaderHint}>Upload → detect → add later</div>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImgFile(e.target.files?.[0] || null)}
            style={styles.file}
          />
          <button
            disabled={!imgFile}
            style={{
              ...styles.secondaryBtn,
              width: "100%",
              opacity: imgFile ? 1 : 0.6,
              cursor: imgFile ? "pointer" : "not-allowed",
            }}
            onClick={async () => {
              setDetectStatus("Detecting...");
              try {
                const res = await rootwiseApi.detectVeg(imgFile);
                setDetected(res.detected || "");
                setDetectStatus("✅ Detection complete.");
              } catch (e) {
                setDetectStatus(String(e));
              }
            }}
          >
            Detect
          </button>

          {detected ? (
            <div style={styles.detectedBox}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Detected</div>
              <div style={{ fontSize: 13 }}>{detected}</div>
            </div>
          ) : null}
          {detectStatus ? <pre style={styles.miniLog}>{detectStatus}</pre> : null}
        </aside>

        {/* Right: tabs (Chat / Tools) */}
        <main style={styles.main}>
          <div style={styles.tabs}>
            <button
              onClick={() => setActiveTab("chat")}
              style={{ ...styles.tabBtn, ...(activeTab === "chat" ? styles.tabActive : {}) }}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setActiveTab("tools")}
              style={{ ...styles.tabBtn, ...(activeTab === "tools" ? styles.tabActive : {}) }}
            >
              📚 Data Tools
            </button>
          </div>

          {activeTab === "chat" ? (
            <Chat />
          ) : (
            <>
              <RagInputs onAdded={refreshFiles} />

              {/* 🔹 File Viewer */}
              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderTitle}>File Viewer</div>
                  <div style={styles.cardHeaderHint}>
                    Switch between system knowledge files and user-entered files.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {/* NEW: scope toggle */}
                  <div style={styles.scopePills}>
                    <button
                      style={{
                        ...styles.scopeBtn,
                        ...(fileScope === "system" ? styles.scopeActive : {}),
                      }}
                      onClick={() => setFileScope("system")}
                    >
                      System Data
                    </button>
                    <button
                      style={{
                        ...styles.scopeBtn,
                        ...(fileScope === "user" ? styles.scopeActive : {}),
                      }}
                      onClick={() => setFileScope("user")}
                    >
                      User Files
                    </button>
                  </div>

                  <button style={styles.secondaryBtn} onClick={() => refreshFiles(fileScope)}>
                    Refresh
                  </button>

                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- select file --</option>
                    {files.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  <button
                    disabled={!selected}
                    style={{
                      ...styles.primaryBtn,
                      opacity: selected ? 1 : 0.6,
                      cursor: selected ? "pointer" : "not-allowed",
                    }}
                    onClick={async () => {
                      try {
                        const res = await rootwiseApi.readFile(selected, fileScope);
                        setPreviewText(res.text || "");
                        setPreviewImg(res.preview || "");
                      } catch (e) {
                        setPreviewText(String(e));
                        setPreviewImg("");
                      }
                    }}
                  >
                    Load
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <pre style={styles.preview}>{previewText}</pre>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 16,
    maxWidth: 1200,
    margin: "0 auto",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#1c2a1f",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "linear-gradient(180deg, rgba(242,246,234,1) 0%, rgba(255,255,255,1) 100%)",
    boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "#E6F0D7",
    border: "1px solid rgba(0,0,0,0.08)",
    fontSize: 20,
  },
  title: { fontSize: 20, fontWeight: 900, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, opacity: 0.72, marginTop: 2 },
  pill: {
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.9)",
  },
  linkBtn: {
    textDecoration: "none",
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#2D3A2E",
    color: "white",
    fontWeight: 800,
    fontSize: 13,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: 14,
    marginTop: 14,
    alignItems: "start",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  card: {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  cardHeader: { marginBottom: 10 },
  cardHeaderTitle: { fontWeight: 900, fontSize: 14 },
  cardHeaderHint: { fontSize: 12, opacity: 0.7, marginTop: 3 },
  fieldLabel: { fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
  },
  textarea: {
    width: "92%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    resize: "vertical",
  },
  file: { width: "100%", marginTop: 6, marginBottom: 8 },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#2D3A2E",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#F2F6EA",
    color: "#1c2a1f",
    fontWeight: 900,
    cursor: "pointer",
  },
  divider: { height: 1, background: "rgba(0,0,0,0.08)", margin: "14px 0" },
  miniLog: {
    marginTop: 8,
    fontSize: 11,
    background: "#0b0f0c",
    color: "#d6ffd7",
    padding: 10,
    borderRadius: 12,
    overflowX: "auto",
  },
  detectedBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "linear-gradient(180deg, rgba(230,240,215,1) 0%, rgba(255,255,255,1) 100%)",
  },
  tabs: { display: "flex", gap: 8 },
  tabBtn: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.85)",
    fontWeight: 900,
    cursor: "pointer",
  },
  tabActive: {
    background: "#E6F0D7",
    border: "1px solid rgba(0,0,0,0.12)",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    minWidth: 240,
  },
  preview: {
    whiteSpace: "pre-wrap",
    background: "#fafafa",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 12,
    padding: 12,
    maxHeight: 340,
    overflow: "auto",
  },
  scopePills: {
    display: "flex",
    gap: 8,
    padding: 4,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.8)",
  },
  scopeBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.9)",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 12,
  },
  scopeActive: {
    background: "#E6F0D7",
    border: "1px solid rgba(0,0,0,0.14)",
  },
};

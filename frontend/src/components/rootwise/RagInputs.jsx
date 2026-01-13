import React from "react";
import { useState } from "react";
import { rootwiseApi } from "../../api/rootwise";

export default function RagInputs({ onAdded }) {
  const [ingredients, setIngredients] = useState("");
  const [season, setSeason] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [status, setStatus] = useState("");

  const addIngredients = async () => {
    const v = ingredients.trim();
    if (!v) return;
    setStatus("Saving ingredients…");
    try {
      await rootwiseApi.ragAdd("", v, "");
      setIngredients("");
      setStatus("✅ Ingredients saved to RAG");
      onAdded?.();
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    }
  };

  const addSeason = async () => {
    const v = season.trim();
    if (!v) return;
    setStatus("Saving season…");
    try {
      await rootwiseApi.ragAdd(v, "", "");
      setSeason("");
      setStatus("✅ Season saved to RAG");
      onAdded?.();
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    }
  };

  const addRestrictions = async () => {
    const v = restrictions.trim();
    if (!v) return;
    setStatus("Saving dietary restrictions…");
    try {
      await rootwiseApi.ragAdd("", "", v);
      setRestrictions("");
      setStatus("✅ Dietary restrictions saved to RAG");
      onAdded?.();
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.title}>🌾 Add to Your RAG Dataset</div>
        <div style={styles.hint}>
          Tailor RootWise to your context: what you have, what season it is, and what you can’t eat.
        </div>
      </div>

      <div style={styles.grid}>
        <div>
          <div style={styles.label}>Ingredients (comma-separated)</div>
          <input
            style={styles.input}
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder="e.g. lentils, daikon, lemon zest"
          />
          <button style={styles.btn} onClick={addIngredients}>
            ➕ Add Ingredients
          </button>
        </div>

        <div>
          <div style={styles.label}>Season</div>
          <input
            style={styles.input}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="e.g. early summer, winter"
          />
          <button style={styles.btn} onClick={addSeason}>
            📅 Add Season
          </button>
        </div>

        <div>
          <div style={styles.label}>Dietary Restrictions (comma-separated)</div>
          <input
            style={styles.input}
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            placeholder="e.g. gluten-free, nut allergy, low FODMAP"
          />
          <button style={styles.btn} onClick={addRestrictions}>
            🚫 Add Restrictions
          </button>
        </div>
      </div>

      {status ? <div style={styles.status}>{status}</div> : null}
    </div>
  );
}

const styles = {
  card: {
    marginTop: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 12,
  },
  header: { marginBottom: 10 },
  title: { fontWeight: 900, fontSize: 14 },
  hint: { fontSize: 12, opacity: 0.7, marginTop: 3 },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },
  label: { fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    marginBottom: 8,
  },
  btn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#F2F6EA",
    color: "#1c2a1f",
    fontWeight: 900,
    cursor: "pointer",
  },
  status: { marginTop: 10, fontSize: 12, opacity: 0.85 },
};

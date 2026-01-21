import React from "react";
import { useMemo, useState } from "react";
import { rootwiseApi } from "../../api/rootwise";

const SEASONS = ["Fall", "Summer", "Winter", "Spring"];

const COMMON_RESTRICTIONS = [
  "gluten-free",
  "lactose-free",
  "dairy-free",
  "egg-free",
  "nut allergy",
  "peanut allergy",
  "shellfish allergy",
  "soy-free",
  "low FODMAP",
  "vegetarian",
  "vegan",
];

function normalizeCommaList(s) {
  // "a, b ,  c" -> "a, b, c" (dedupe, trim, keep order)
  const items = (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out.join(", ");
}

export default function UserContextInputs({ onAdded }) {
  const [ingredients, setIngredients] = useState("");
  const [season, setSeason] = useState(""); // must be one of SEASONS or ""
  const [selectedRestrictions, setSelectedRestrictions] = useState([]);
  const [customRestriction, setCustomRestriction] = useState("");
  const [status, setStatus] = useState("");

  const restrictionsCsv = useMemo(() => {
    const merged = [...selectedRestrictions];
    const custom = normalizeCommaList(customRestriction);
    if (custom) {
      for (const it of custom.split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!merged.some((r) => r.toLowerCase() === it.toLowerCase())) merged.push(it);
      }
    }
    return merged.join(", ");
  }, [selectedRestrictions, customRestriction]);

  const toggleRestriction = (r) => {
    setSelectedRestrictions((prev) => {
      const exists = prev.some((x) => x.toLowerCase() === r.toLowerCase());
      if (exists) return prev.filter((x) => x.toLowerCase() !== r.toLowerCase());
      return [...prev, r];
    });
  };

  const saveIngredients = async () => {
    const v = normalizeCommaList(ingredients);
    if (!v) return;
    setStatus("Saving ingredients…");
    try {
      await rootwiseApi.ragAdd("", v, "");
      setIngredients("");
      setStatus("✅ Ingredients saved");
      onAdded?.();
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    }
  };

  const saveSeason = async () => {
    const v = (season || "").trim();
    if (!v) return;
    setStatus("Saving season…");
    try {
      await rootwiseApi.ragAdd(v, "", "");
      setSeason("");
      setStatus("✅ Season saved");
      onAdded?.();
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    }
  };

  const saveRestrictions = async () => {
    const v = restrictionsCsv.trim();
    if (!v) return;
    setStatus("Saving dietary restrictions…");
    try {
      await rootwiseApi.ragAdd("", "", v);
      setSelectedRestrictions([]);
      setCustomRestriction("");
      setStatus("✅ Dietary restrictions saved");
      onAdded?.();
    } catch (e) {
      setStatus(`❌ ${String(e)}`);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.title}>🧾 Your Context</div>
        <div style={styles.hint}>
          This helps RootWise tailor suggestions: what you have, what season it is, and what you can’t eat.
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
          <button style={styles.btn} onClick={saveIngredients}>
            ➕ Save Ingredients
          </button>
        </div>

        <div>
          <div style={styles.label}>Season (pick one)</div>
          <select
            style={styles.select}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            <option value="">Select…</option>
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button style={styles.btn} onClick={saveSeason}>
            📅 Save Season
          </button>
        </div>

        <div>
          <div style={styles.label}>Dietary Restrictions (select + add your own)</div>

          <div style={styles.checklist}>
            {COMMON_RESTRICTIONS.map((r) => {
              const checked = selectedRestrictions.some((x) => x.toLowerCase() === r.toLowerCase());
              return (
                <label key={r} style={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRestriction(r)}
                  />
                  <span style={styles.checkText}>{r}</span>
                </label>
              );
            })}
          </div>

          <div style={styles.subLabel}>Add your own (comma-separated)</div>
          <input
            style={styles.input}
            value={customRestriction}
            onChange={(e) => setCustomRestriction(e.target.value)}
            placeholder="e.g. sesame allergy, low sodium"
          />

          <div style={styles.preview}>
            <div style={styles.previewLabel}>Saved value (comma-separated)</div>
            <div style={styles.previewText}>{restrictionsCsv || "—"}</div>
          </div>

          <button style={styles.btn} onClick={saveRestrictions}>
            🚫 Save Restrictions
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
  subLabel: { fontSize: 12, fontWeight: 800, opacity: 0.65, marginTop: 10, marginBottom: 6 },
  input: {
    width: "97%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    marginBottom: 8,
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    marginBottom: 8,
    background: "white",
  },
  checklist: {
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 12,
    padding: 10,
    background: "rgba(0,0,0,0.02)",
  },
  checkItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 2px",
    fontSize: 12,
    cursor: "pointer",
  },
  checkText: { opacity: 0.9 },
  preview: {
    border: "1px dashed rgba(0,0,0,0.18)",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
    background: "rgba(255,255,255,0.8)",
  },
  previewLabel: { fontSize: 11, fontWeight: 900, opacity: 0.6, marginBottom: 4 },
  previewText: { fontSize: 12, fontWeight: 700, opacity: 0.9 },
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
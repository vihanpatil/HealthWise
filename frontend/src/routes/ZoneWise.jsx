import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { zonewiseApi } from "../api/zonewise";

const LS_USER_ID_KEY = "zonewise_user_id";

export default function ZoneWise() {
  const [userIdInput, setUserIdInput] = useState("");
  const [registeredUserId, setRegisteredUserId] = useState(() => localStorage.getItem(LS_USER_ID_KEY) || "");

  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);

  const [status, setStatus] = useState("");
  const [hasAttemptedRegister, setHasAttemptedRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [metricType, setMetricType] = useState("");

  const showDashboard = Boolean(registeredUserId && data);

  async function register() {
    setHasAttemptedRegister(true);
    setStatus("");

    const candidate = (userIdInput || "").trim();

    // 1) Validate ONLY on register click
    if (!isUuid(candidate)) {
      setRegisteredUserId("");
      setData(null);
      localStorage.removeItem(LS_USER_ID_KEY);
      setStatus("❌ Please enter a valid User ID (UUID).");
      return;
    }

    // 2) Try to load metrics (acts as existence check)
    setIsLoading(true);
    setStatus("Loading…");

    try {
      const res = await zonewiseApi.dailyMetrics(candidate, days);
      const hasAnySeries = Object.keys(res?.series || {}).length > 0;

      if (!hasAnySeries) {
        setRegisteredUserId("");
        setData(null);
        localStorage.removeItem(LS_USER_ID_KEY);
        setStatus("❌ User not found. Double-check your UUID.");
        return;
      }

      // 3) Success: register + show dashboard
      setRegisteredUserId(candidate);
      localStorage.setItem(LS_USER_ID_KEY, candidate);

      setData(res);
      setStatus("");
    } catch (e) {
      const msg = String(e);
      const isNotFound = msg.includes("404") || msg.toLowerCase().includes("not found");

      setRegisteredUserId("");
      setData(null);
      localStorage.removeItem(LS_USER_ID_KEY);

      setStatus(isNotFound ? "❌ User not found. Double-check your UUID." : `❌ ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  const metricTypes = useMemo(() => Object.keys(data?.series || {}).sort(), [data]);

  useEffect(() => {
    if (!metricType && metricTypes.length) setMetricType(metricTypes[0]);
    if (metricType && metricTypes.length && !metricTypes.includes(metricType)) {
      setMetricType(metricTypes[0] || "");
    }
  }, [metricTypes, metricType]);

  const series = useMemo(() => {
    const rows = data?.series?.[metricType] || [];
    const isSteps = metricType?.toLowerCase() === "steps";
    const valueKey = isSteps ? "sum_value" : "avg_value";
    return rows.map((r) => ({ day: r.day, value: r[valueKey], unit: r.unit || "" }));
  }, [data, metricType]);

  const unit = series?.[0]?.unit || "";

  const kpis = useMemo(() => {
    if (!series.length) return null;
    const last = series[series.length - 1]?.value;
    const nums = series.map((r) => Number(r.value)).filter(Number.isFinite);

    const avg = nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
    const min = nums.length ? Math.min(...nums) : null;
    const max = nums.length ? Math.max(...nums) : null;

    return { last: fmt(last), avg: fmt(avg), min: fmt(min), max: fmt(max) };
  }, [series]);

  const isSteps = metricType?.toLowerCase() === "steps";
  const Chart = isSteps ? BarChartView : LineChartView;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>ZoneWise</div>
          <div style={styles.subtitle}>Daily metrics dashboard (from your Postgres)</div>
        </div>
        <Link to="/rootwise" style={styles.linkBtn}>
          ← Back to RootWise
        </Link>
      </header>

      {/* Only show input+register until successful registration */}
      <div style={styles.toolbar}>
        <div style={{ ...styles.control, flex: 1, minWidth: 320 }}>
          <div style={styles.label}>User ID (UUID)</div>

          <div style={styles.registerRow}>
            <input
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") register(); // enter always triggers (validates inside)
              }}
              placeholder="Paste your UUID"
              style={{
                ...styles.input,
                height: styles.btnHeight,
                border:
                  userIdInput.length === 0
                    ? styles.input.border
                    : isUuid(userIdInput.trim())
                    ? "1px solid rgba(0,0,0,0.12)"
                    : "1px solid rgba(220,0,0,0.35)",
              }}
            />

            {/* ALWAYS ACTIVE */}
            <button
              onClick={register}
              style={{
                ...styles.primaryBtn,
                height: styles.btnHeight,
                minWidth: 130,
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? "wait" : "pointer",
              }}
            >
              {isLoading ? "Loading…" : "Register"}
            </button>
          </div>

          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
            Tip: copy the UUID from your DB (public.users.id). Stored locally in this browser.
          </div>

          {/* No messages while typing; only after they click register */}
          {hasAttemptedRegister && status ? (
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>{status}</div>
          ) : null}
        </div>
      </div>

      {/* Dashboard renders ONLY after success */}
      {showDashboard ? (
        <>
          <div style={{ ...styles.toolbar, marginTop: 12 }}>
            <div style={styles.control}>
              <div style={styles.label}>Range</div>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={styles.select}>
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </div>

            <div style={styles.control}>
              <div style={styles.label}>Metric</div>
              <select value={metricType} onChange={(e) => setMetricType(e.target.value)} style={styles.select}>
                {metricTypes.length === 0 ? <option value="">(none)</option> : null}
                {metricTypes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                localStorage.removeItem(LS_USER_ID_KEY);
                setRegisteredUserId("");
                setData(null);
                setMetricType("");
                setHasAttemptedRegister(false);
                setStatus("");
                setUserIdInput("");
              }}
              style={{ ...styles.secondaryBtn, height: styles.btnHeight }}
            >
              Log out
            </button>
          </div>

          {kpis ? (
            <div style={styles.kpiGrid}>
              <KpiCard title="Last value" value={`${kpis.last}${unit ? ` ${unit}` : ""}`} />
              <KpiCard title={`${days}-day avg`} value={`${kpis.avg}${unit ? ` ${unit}` : ""}`} />
              <KpiCard title="Min" value={`${kpis.min}${unit ? ` ${unit}` : ""}`} />
              <KpiCard title="Max" value={`${kpis.max}${unit ? ` ${unit}` : ""}`} />
            </div>
          ) : (
            <div style={styles.empty}>
              No data for this user yet. Insert rows into <code>public.metrics</code> for this user_id.
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>
                {metricType || "Metric"} {unit ? <span style={{ opacity: 0.6 }}>({unit})</span> : null}
              </div>
              <div style={styles.cardHint}>
                {isSteps ? "Bars show daily total steps." : "Line shows daily average value."}
              </div>
            </div>

            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Chart data={series} />
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function LineChartView({ data }) {
  return (
    <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} />
      <Tooltip />
      <Line type="monotone" dataKey="value" strokeWidth={3} dot={{ r: 3 }} />
    </LineChart>
  );
}

function BarChartView({ data }) {
  return (
    <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} />
      <Tooltip />
      <Bar dataKey="value" />
    </BarChart>
  );
}

function KpiCard({ title, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function fmt(x) {
  if (x === null || x === undefined) return "—";
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return (Math.round(n * 100) / 100).toString();
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    (s || "").trim()
  );
}

const styles = {
  btnHeight: 42,

  page: {
    padding: 16,
    maxWidth: 1100,
    margin: "0 auto",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#1c2a1f",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, opacity: 0.7, marginTop: 4 },
  linkBtn: {
    textDecoration: "none",
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#2D3A2E",
    color: "white",
    fontWeight: 800,
    fontSize: 13,
    height: 17,
  },
  toolbar: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
    flexWrap: "wrap",
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "linear-gradient(180deg, rgba(242,246,234,1) 0%, rgba(255,255,255,1) 100%)",
  },
  control: { minWidth: 180 },
  label: { fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 6 },

  registerRow: { display: "flex", gap: 10, alignItems: "center" },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    background: "white",
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    outline: "none",
    background: "white",
  },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#2D3A2E",
    color: "white",
    fontWeight: 900,
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
  kpiGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  kpiCard: {
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  kpiTitle: { fontSize: 12, fontWeight: 900, opacity: 0.65 },
  kpiValue: { fontSize: 22, fontWeight: 900, marginTop: 8 },
  card: {
    marginTop: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  cardHeader: { marginBottom: 10 },
  cardTitle: { fontWeight: 900, fontSize: 14 },
  cardHint: { fontSize: 12, opacity: 0.7, marginTop: 3 },
  empty: {
    marginTop: 14,
    padding: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.95)",
  },
};

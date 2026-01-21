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
import { apiJson, getToken, setToken, clearToken } from "../api/client";

export default function ZoneWise() {
  // auth state
  const [authed, setAuthed] = useState(false);
  const [me, setMe] = useState(null);

  // auth form
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // shared UI state
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // dashboard state
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [metricType, setMetricType] = useState("");

  // On mount: if token exists, verify it and load dashboard
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let mounted = true;
    (async () => {
      try {
        const who = await apiJson("/api/auth/me");
        if (!mounted) return;
        setMe(who);
        setAuthed(true);
      } catch {
        // invalid token
        clearToken();
        if (!mounted) return;
        setMe(null);
        setAuthed(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Whenever we become authed OR change days, load metrics (me endpoint)
  useEffect(() => {
    if (!authed) return;

    let mounted = true;
    (async () => {
      setIsLoading(true);
      setStatus("");
      try {
        const res = await apiJson(`/api/zonewise/metrics/daily/me?days=${days}`);
        if (!mounted) return;
        setData(res);

        // pick default metric type
        const keys = Object.keys(res?.series || {}).sort();
        setMetricType((prev) => (prev && keys.includes(prev) ? prev : keys[0] || ""));
      } catch (e) {
        if (!mounted) return;
        setData(null);
        setStatus(`❌ ${String(e.message || e)}`);
      } finally {
        if (!mounted) return;
        setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authed, days]);

  async function onSubmitAuth(e) {
    e.preventDefault();

    setStatus("");
    setIsLoading(true);

    // Register-only validation
    if (mode === "register") {
      if (password !== confirmPassword) {
        setStatus("❌ Passwords do not match.");
        setIsLoading(false);
        return;
      }

      const a = parseInt(String(age).trim(), 10);
      const h = parseFloat(String(heightCm).trim());
      const w = parseFloat(String(weightKg).trim());

      if (!Number.isFinite(a) || a < 1) {
        setStatus("❌ Age must be a valid number.");
        setIsLoading(false);
        return;
      }

      if (!Number.isFinite(h) || h <= 0) {
        setStatus("❌ Height must be a valid number (e.g. 175 or 175.5).");
        setIsLoading(false);
        return;
      }

      if (!Number.isFinite(w) || w <= 0) {
        setStatus("❌ Weight must be a valid number (e.g. 72 or 72.3).");
        setIsLoading(false);
        return;
      }
    }

    try {
      const payload =
        mode === "register"
          ? (() => {
              const a = parseInt(String(age).trim(), 10);
              const h = parseFloat(String(heightCm).trim());
              const w = parseFloat(String(weightKg).trim());

              return {
                email: email.trim(),
                password,
                name: name.trim(),
                gender,
                age: a,
                height_cm: h,
                weight_kg: w,
              };
            })()
          : {
              email: email.trim(),
              password,
            };

      const res =
        mode === "register"
          ? await apiJson("/api/auth/register", "POST", payload)
          : await apiJson("/api/auth/login", "POST", payload);

      if (!res?.token) {
        throw new Error("Missing token from server");
      }

      setToken(res.token);

      const who = await apiJson("/api/auth/me");
      setMe(who);
      setAuthed(true);
      setStatus("");
    } catch (err) {
      clearToken();
      setAuthed(false);
      setMe(null);
      setStatus(`❌ ${String(err.message || err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  function onLogout() {
    clearToken();
    setAuthed(false);
    setMe(null);
    setData(null);
    setMetricType("");
    setStatus("");
    setEmail("");
    setPassword("");
    setMode("login");
    setName("");
    setGender("male");
    setAge("");
    setHeightCm("");
    setWeightKg("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);

  }

  // Dashboard computed values
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

      {/* AUTH GATE */}
      {!authed ? (
        <div style={styles.authWrap}>
          <div style={styles.authCard}>
            <div style={styles.authTitle}>{mode === "register" ? "Create account" : "Login"}</div>

            <form onSubmit={onSubmitAuth} style={{ display: "grid", gap: 10 }}>
              {mode === "register" ? (
                <>
                  <input
                    style={styles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    autoComplete="name"
                  />

                  <div style={styles.row2}>
                    <div>
                      <div style={styles.smallLabel}>Gender</div>
                      <select style={styles.select} value={gender} onChange={(e) => setGender(e.target.value)}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>

                    <div>
                      <div style={styles.smallLabel}>Age</div>
                      <input
                        style={styles.input}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="e.g. 23"
                        inputMode="numeric"
                      />
                    </div>
                  </div>

                  <div style={styles.row2}>
                    <div>
                      <div style={styles.smallLabel}>Height (cm)</div>
                      <input
                        style={styles.input}
                        type="number"
                        step="any"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        placeholder="e.g. 175"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <div style={styles.smallLabel}>Weight (kg)</div>
                      <input
                        style={styles.input}
                        type="number"
                        step="any"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        placeholder="e.g. 72"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </>
              ) : null}

              <input
                style={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
              />

              {/* Password field with Show/Hide button */}
              <div style={styles.passwordRow}>
                <input
                  style={{ ...styles.input, margin: 0 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={styles.showBtn}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Confirm password only on register */}
              {mode === "register" ? (
                <div style={styles.passwordRow}>
                  <input
                    style={{ ...styles.input, margin: 0 }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    style={styles.showBtn}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              ) : null}

              <button
                style={{
                  ...styles.primaryBtn,
                  height: styles.btnHeight,
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? "wait" : "pointer",
                }}
                type="submit"
              >
                {isLoading ? "Please wait…" : mode === "register" ? "Create account" : "Login"}
              </button>
            </form>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              {mode === "register" ? (
                <>
                  Already have an account?{" "}
                  <button style={styles.linkInlineBtn} onClick={() => setMode("login")} type="button">
                    Login
                  </button>
                </>
              ) : (
                <>
                  New here?{" "}
                  <button style={styles.linkInlineBtn} onClick={() => setMode("register")} type="button">
                    Create account
                  </button>
                </>
              )}
            </div>

            {status ? <div style={styles.status}>{status}</div> : null}
          </div>
        </div>
      ) : (
        <>
          {/* TOP BAR */}
          <div style={{ ...styles.toolbar, marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Logged in as <b>{me?.email || "—"}</b>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
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

              <button style={{ ...styles.secondaryBtn, height: styles.btnHeight }} onClick={onLogout}>
                Log out
              </button>
            </div>

            {status ? <div style={{ fontSize: 12, opacity: 0.8 }}>{status}</div> : null}
          </div>

          {/* DASHBOARD */}
          {isLoading && !data ? (
            <div style={styles.empty}>Loading your dashboard…</div>
          ) : kpis ? (
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
      )}
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

  authWrap: { marginTop: 18, display: "flex", justifyContent: "center" },
  authCard: {
    width: "100%",
    maxWidth: 520,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  authTitle: { fontSize: 18, fontWeight: 900, marginBottom: 12 },
  status: { marginTop: 10, fontSize: 12, opacity: 0.9 },

  linkInlineBtn: {
    border: "none",
    background: "transparent",
    color: "#2D3A2E",
    fontWeight: 900,
    cursor: "pointer",
    padding: 0,
  },

  toolbar: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
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
  row2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  smallLabel: {
    fontSize: 11,
    fontWeight: 800,
    opacity: 0.7,
    marginBottom: 6,
  },
  passwordRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  showBtn: {
    height: 42,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#F2F6EA",
    color: "#1c2a1f",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

};

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
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
  const [gender, setGender] = useState("male");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // shared UI state
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // dashboard state (heart_rate only)
  const [minutes, setMinutes] = useState(60);
  const [zones, setZones] = useState(null);


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

  // Fetch heart-rate zones whenever authed or minutes changes
useEffect(() => {
  if (!authed) return;

  let mounted = true;
  (async () => {
    try {
      const res = await apiJson(`/api/zonewise/metrics/heart_zones/me?minutes=${minutes}`);
      if (!mounted) return;
      setZones(res);
    } catch (e) {
      if (!mounted) return;
      setZones(null);
      setStatus(`❌ ${String(e.message || e)}`);
    }
  })();

  return () => {
    mounted = false;
  };
}, [authed, minutes]);


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

      if (!name.trim()) {
        setStatus("❌ Name is required.");
        setIsLoading(false);
        return;
      }
      if (!email.trim()) {
        setStatus("❌ Email is required.");
        setIsLoading(false);
        return;
      }
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
      if (gender !== "male" && gender !== "female") {
        setStatus("❌ Gender must be male or female.");
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

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>ZoneWise</div>
          <div style={styles.subtitle}>Daily heart rate dashboard (from your Postgres)</div>
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

              {/* Password */}
              <div style={styles.passwordRow}>
                <input
                  style={{ ...styles.input, margin: 0 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} style={styles.showBtn}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Confirm password */}
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
              {/* NEW: zones window */}
              <div style={styles.control}>
                <div style={styles.label}>Zones window</div>
                <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={styles.select}>
                  <option value={30}>Last 30 min</option>
                  <option value={60}>Last 60 min</option>
                  <option value={90}>Last 90 min</option>
                </select>
              </div>

              <button style={{ ...styles.secondaryBtn, height: styles.btnHeight }} onClick={onLogout}>
                Log out
              </button>
            </div>

            {status ? <div style={{ fontSize: 12, opacity: 0.8 }}>{status}</div> : null}
          </div>

          {/* DASHBOARD */}
          {/* NEW: Heart-rate zones bar chart (requires `zones` state fetched from /metrics/heart_zones/me) */}
          {zones?.zones?.length ? (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>Heart Rate Zones</div>
                <div style={styles.cardHint}>
                  Minutes in each zone (last {zones.minutes_window} min, max HR {zones.max_hr})
                </div>
              </div>

              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={zones.zones} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="minutes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </>

      )}
    </div>
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
    height: 20,
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

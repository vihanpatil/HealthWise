import React, { useEffect, useState } from "react";
import { getToken } from "../../api/client";
import { login, register, me, logout } from "../../api/auth";

function prettyError(err) {
  if (err instanceof Error && typeof err.message === "string") return err.message;
  if (err && typeof err.message === "string") return err.message;

  const detail = err?.detail ?? err?.response?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => d?.msg || d?.message || (typeof d === "string" ? d : null))
      .filter(Boolean);
    if (msgs.length) return msgs.join(" • ");
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Request failed";
  }
}

export default function AuthGate({ children }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let mounted = true;
    (async () => {
      try {
        const u = await me();
        if (!mounted) return;
        setUser(u);
        setAuthed(true);
      } catch {
        if (!mounted) return;
        setAuthed(false);
        setUser(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      if (mode === "register") {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      const u = await me();
      setUser(u);
      setAuthed(true);
      setStatus("");
    } catch (err) {
      setStatus(prettyError(err) || "Auth failed");
      setAuthed(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  if (authed) {
    return (
      <div>
        <div style={styles.topbar}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Logged in as <b>{user?.email}</b>
          </div>
          <button
            onClick={() => {
              logout();
              setAuthed(false);
              setUser(null);
              setEmail("");
              setPassword("");
              setStatus("");
              setMode("login");
            }}
            style={styles.secondaryBtn}
          >
            Log out
          </button>
        </div>

        {children}
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>
          {mode === "register" ? "Create account" : "Login"}
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
          />
          <input
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />

          <button style={styles.primaryBtn} disabled={loading}>
            {loading ? "Please wait…" : mode === "register" ? "Create account" : "Login"}
          </button>
        </form>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          {mode === "register" ? (
            <>
              Already have an account?{" "}
              <button style={styles.linkBtn} onClick={() => setMode("login")}>
                Login
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button style={styles.linkBtn} onClick={() => setMode("register")}>
                Create account
              </button>
            </>
          )}
        </div>

        {status ? <div style={styles.status}>{status}</div> : null}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    padding: 16,
    maxWidth: 520,
    margin: "40px auto",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
  },
  card: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  title: { fontSize: 18, fontWeight: 900, marginBottom: 12 },
  input: {
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
    cursor: "pointer",
    height: 42,
  },
  secondaryBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#F2F6EA",
    fontWeight: 900,
    cursor: "pointer",
  },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#2D3A2E",
    fontWeight: 900,
    cursor: "pointer",
    padding: 0,
  },
  status: { marginTop: 10, fontSize: 12, opacity: 0.9 },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "linear-gradient(180deg, rgba(242,246,234,1) 0%, rgba(255,255,255,1) 100%)",
    maxWidth: 1100,
    margin: "12px auto 0",
  },
};

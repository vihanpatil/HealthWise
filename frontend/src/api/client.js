export const API_BASE = "http://127.0.0.1:8000";

const LS_TOKEN_KEY = "zonewise_token";

export function getToken() {
  return localStorage.getItem(LS_TOKEN_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(LS_TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(LS_TOKEN_KEY);
}

function withAuthHeaders(headers = {}) {
  const token = getToken();
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
}

async function parseError(res) {
  const text = await res.text().catch(() => "");
  try {
    const j = text ? JSON.parse(text) : null;
    if (j && typeof j === "object" && "detail" in j) return String(j.detail);
    return text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

export async function apiJson(path, method = "GET", body) {
  const headers = body ? { "Content-Type": "application/json" } : undefined;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: withAuthHeaders(headers),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json();
}

export async function apiForm(path, formData, method = "POST") {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: withAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json();
}


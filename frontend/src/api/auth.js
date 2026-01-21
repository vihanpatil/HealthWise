import { apiFetch, setToken, clearToken } from "./client";

export async function register(email, password) {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    body: { email, password },
  });
  setToken(res.token);
  return res;
}

export async function login(email, password) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setToken(res.token);
  return res;
}

export async function me() {
  return apiFetch("/api/auth/me");
}

export function logout() {
  clearToken();
}

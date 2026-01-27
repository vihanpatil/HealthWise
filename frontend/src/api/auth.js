// frontend/src/api/auth.js
import { apiJson, setToken, clearToken } from "./client";

export async function register(email, password) {
  const res = await apiJson("/api/auth/register", "POST", { email, password });
  setToken(res.token);
  return res;
}

export async function login(email, password) {
  const res = await apiJson("/api/auth/login", "POST", { email, password });
  setToken(res.token);
  return res;
}

export function me() {
  return apiJson("/api/auth/me");
}

export function logout() {
  clearToken();
}

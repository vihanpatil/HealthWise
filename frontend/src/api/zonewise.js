import { apiFetch } from "./client";

export async function dailyMetricsMe(days = 7) {
  return apiFetch(`/api/zonewise/metrics/daily/me?days=${days}`);
}

import { apiJson } from "./client";

export const zonewiseApi = {
  listUsers: () => apiJson("/api/zonewise/users"),
  dailyMetrics: (userId, days = 7) =>
    apiJson(`/api/zonewise/metrics/daily?user_id=${encodeURIComponent(userId)}&days=${days}`),
};

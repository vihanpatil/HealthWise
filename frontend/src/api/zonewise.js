// frontend/src/api/zonewise.js
import { API_BASE, apiJson, getToken } from "./client";

export async function dailyMetricsMe(days = 7) {
  return apiJson(`/api/zonewise/metrics/daily/me?days=${days}`);
}

export const zonewiseApi = {
  streamChat: async ({ message, history, onMessage, onDone, onError }) => {
    try {
      const token = getToken();

      const res = await fetch(`${API_BASE}/api/zonewise/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const emitEvent = (rawEvent) => {
        const lines = rawEvent.split("\n").filter(Boolean);
        let eventName = "message";
        let dataLine = "";

        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        }

        if (!dataLine) return;

        let payload;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          payload = { raw: dataLine };
        }

        if (eventName === "message") onMessage?.(payload);
        if (eventName === "done") onDone?.(payload);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const p of parts) emitEvent(p);
      }
    } catch (err) {
      onError?.(err);
    }
  },
};

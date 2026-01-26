// frontend/src/api/rootwise.js
import { API_BASE, apiJson, apiForm } from "./client";

export const rootwiseApi = {
  setName: (name) => apiJson("/api/rootwise/user/name", "POST", { name }),
  appendNotepad: (text) => apiJson("/api/rootwise/notepad/append", "POST", { text }),

  detectVeg: async (file) => {
    const fd = new FormData();
    fd.append("image", file);
    return apiForm("/api/rootwise/veg/detect", fd);
  },

  addVeg: (season, ingredients, restrictions) =>
    apiJson("/api/rootwise/veg/add", "POST", { season, ingredients, restrictions }),

  ragAdd: (season, ingredients, restrictions) =>
    apiJson("/api/rootwise/rag/add", "POST", { season, ingredients, restrictions }),

  docsLoad: async (files) => {
    const fd = new FormData();
    [...files].forEach((f) => fd.append("files", f));
    return apiForm("/api/rootwise/docs/load", fd);
  },

  // NEW: scope-aware file listing/reading
  listFiles: (scope = "system") => apiJson(`/api/rootwise/system/files?scope=${encodeURIComponent(scope)}`),
  readFile: (name, scope = "system") =>
    apiJson(`/api/rootwise/system/file?scope=${encodeURIComponent(scope)}&name=${encodeURIComponent(name)}`),

  streamChat: async ({ message, history, onMessage, onDone, onError }) => {
    try {
      const res = await fetch(`${API_BASE}/api/rootwise/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok) {
        const text = await res.text();
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
import { useEffect, useRef } from "react";
import type { ServerEvent } from "@arena/shared";
import { getToken } from "../api.js";

const BASE_WS = (import.meta.env.VITE_API_URL ?? "http://localhost:8080")
  .replace(/^http/, "ws");

export function useWs(onEvent: (e: ServerEvent) => void) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;

    function connect() {
      if (closed) return;
      // Authenticate the socket so it receives this user's private events
      // (own verdicts/run results, the matches they're in). Read the token at
      // connect time so a reconnect after a refresh uses the current one.
      const token = getToken();
      const url = token ? `${BASE_WS}/ws?token=${encodeURIComponent(token)}` : `${BASE_WS}/ws`;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as ServerEvent;
          cbRef.current(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (closed) return;
        retryTimeout = setTimeout(() => {
          delay = Math.min(delay * 2, 30000);
          connect();
        }, delay);
      };

      ws.onopen = () => {
        delay = 1000;
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      ws?.close();
    };
  }, []);
}

import { useEffect, useRef } from "react";
import type { ServerEvent } from "@arena/shared";
import { getToken } from "../api.js";

const BASE_WS = (import.meta.env.VITE_API_URL ?? "http://localhost:8080")
  .replace(/^http/, "ws");

/**
 * Subscribe to the real-time bus. Pass `spectateMatchId` to also follow a live
 * match you're not playing in — the hook sends a `spectate` control message on
 * connect (and re-sends it on every reconnect), so a watcher keeps getting the
 * match's state/feed/reactions even across a dropped socket.
 */
export function useWs(
  onEvent: (e: ServerEvent) => void,
  opts?: { spectateMatchId?: string },
) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;
  const wsRef = useRef<WebSocket | null>(null);
  // Read at (re)connect time so onopen always subscribes to the latest match.
  const specRef = useRef<string | undefined>(opts?.spectateMatchId);
  specRef.current = opts?.spectateMatchId;

  useEffect(() => {
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
      const ws = new WebSocket(url);
      wsRef.current = ws;

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
        // Re-establish any spectator subscription across reconnects.
        if (specRef.current) ws.send(JSON.stringify({ type: "spectate", matchId: specRef.current }));
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // Follow spectator-target changes on an already-open socket (the onopen
  // handler covers the not-yet-connected case).
  useEffect(() => {
    const ws = wsRef.current;
    const id = opts?.spectateMatchId;
    if (!ws || ws.readyState !== WebSocket.OPEN || !id) return;
    ws.send(JSON.stringify({ type: "spectate", matchId: id }));
    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "unspectate", matchId: id }));
    };
  }, [opts?.spectateMatchId]);
}

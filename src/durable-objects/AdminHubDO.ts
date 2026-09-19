// Singleton (env.ADMIN_HUB.idFromName("singleton")). Replaces the Go server's
// in-memory wsHub: tracks admin-dashboard WebSocket clients and rebroadcasts
// "recent request" and "stats" events pushed by the proxy route. Uses the
// WebSocket Hibernation API so idle admin tabs cost ~nothing between
// broadcasts — the DO doesn't need to stay resident just to hold sockets
// open, and doesn't need to wake for ping/pong keepalives either.

export class AdminHubDO {
  state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const payload = await request.text();
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(payload);
        } catch {
          // socket gone; hibernation API cleans it up on its own
        }
      }
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(): Promise<void> {
    // Admin dashboard is receive-only; ignore any client messages.
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}

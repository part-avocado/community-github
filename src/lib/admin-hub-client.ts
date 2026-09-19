import type { Env } from "../env";

function stub(env: Env) {
  const id = env.ADMIN_HUB.idFromName("singleton");
  return env.ADMIN_HUB.get(id);
}

export async function broadcastRecent(env: Env, data: unknown): Promise<void> {
  await stub(env)
    .fetch("https://admin-hub/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recent", data }),
    })
    .catch(() => undefined);
}

export async function broadcastStats(env: Env, data: unknown): Promise<void> {
  await stub(env)
    .fetch("https://admin-hub/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "stats", data }),
    })
    .catch(() => undefined);
}

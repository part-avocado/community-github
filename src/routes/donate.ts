import { Hono } from "hono";
import type { Env } from "../env";
import { countActiveDonors, mostRecentDonor } from "../db/queries/donatedTokens";
import { DonatePage } from "../templates/Donate";

export const donateRoutes = new Hono<{ Bindings: Env }>();

donateRoutes.get("/donate", async (c) => {
  const [donors, last] = await Promise.all([countActiveDonors(c.env.DB), mostRecentDonor(c.env.DB)]);
  return c.html(
    DonatePage({ donated: c.req.query("donated") === "1", donors, lastUser: last?.github_user ?? null }),
  );
});

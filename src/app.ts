import { Hono } from "hono";
import type { Env } from "./env";
import { securityHeaders } from "./middleware/security-headers";
import { requestLogger } from "./middleware/request-logger";
import { rateLimitPolicyHeader } from "./middleware/rate-limit-policy-header";
import { notFoundHandler } from "./middleware/error-envelope";
import { discoveryRoutes } from "./routes/discovery";
import { donateRoutes } from "./routes/donate";
import { getAccessRoutes } from "./routes/get-access";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { proxyRoutes } from "./routes/proxy";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", requestLogger);
app.use("*", rateLimitPolicyHeader);
app.use("*", securityHeaders);

app.route("/", discoveryRoutes);
app.route("/", donateRoutes);
app.route("/", getAccessRoutes);
app.route("/", authRoutes);
app.route("/admin", adminRoutes);
app.route("/gh", proxyRoutes);

app.notFound((c) => notFoundHandler(c));

export default app;

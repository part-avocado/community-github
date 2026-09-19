import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("discovery routes", () => {
  it("GET /healthz returns 204", async () => {
    const res = await SELF.fetch("http://example.com/healthz");
    expect(res.status).toBe(204);
  });

  it("GET / renders the home page", async () => {
    const res = await SELF.fetch("http://example.com/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("gh-proxy");
    expect(body).toContain('"Segoe UI"'); // CSS must not be HTML-entity-escaped
  });

  it("GET /openapi.json is valid JSON with the expected paths", async () => {
    const res = await SELF.fetch("http://example.com/openapi.json");
    expect(res.status).toBe(200);
    const spec = await res.json<{ paths: Record<string, unknown> }>();
    expect(spec.paths["/gh/{path}"]).toBeDefined();
    expect(spec.paths["/get-access"]).toBeDefined();
  });

  it("GET /llms.txt, /robots.txt, /sitemap.xml all 200", async () => {
    for (const path of ["/llms.txt", "/robots.txt", "/sitemap.xml"]) {
      const res = await SELF.fetch(`http://example.com${path}`);
      expect(res.status, path).toBe(200);
    }
  });

  it("unknown path returns 404 JSON envelope with Accept: application/json", async () => {
    const res = await SELF.fetch("http://example.com/nope", { headers: { Accept: "application/json" } });
    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string; links: unknown[] } }>();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(Array.isArray(body.error.links)).toBe(true);
  });

  it("unknown path returns markdown for a plain curl-style Accept header", async () => {
    const res = await SELF.fetch("http://example.com/nope", { headers: { Accept: "*/*" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/markdown");
  });

  it("wrong method on a real path returns 405, not 404", async () => {
    const res = await SELF.fetch("http://example.com/docs", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(405);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });
});

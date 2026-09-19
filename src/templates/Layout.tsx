import type { FC, PropsWithChildren } from "hono/jsx";

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: baseCss }} />
    </head>
    <body>
      <div class="wrap">{children}</div>
    </body>
  </html>
);

const baseCss = `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #0b0d10; color: #e6e8eb; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 48px 20px 80px; }
  a { color: #6ea8fe; }
  h1 { font-size: 1.8rem; margin-bottom: .25rem; }
  h2 { font-size: 1.2rem; margin-top: 2.5rem; }
  p.lead { color: #a7adb5; }
  .card { background: #14171b; border: 1px solid #24282e; border-radius: 12px; padding: 20px 24px; margin: 16px 0; }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 140px; }
  .stat .n { font-size: 1.6rem; font-weight: 600; }
  .stat .l { color: #a7adb5; font-size: .85rem; }
  button, .btn { background: #2b6bf0; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: .95rem; cursor: pointer; text-decoration: none; display: inline-block; }
  button.secondary, .btn.secondary { background: transparent; border: 1px solid #3a3f47; color: #e6e8eb; }
  code, pre { background: #0f1114; border-radius: 6px; }
  pre { padding: 12px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #24282e; font-size: .9rem; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: .75rem; }
  .badge.ok { background: #16351f; color: #6fd98a; }
  .badge.warn { background: #3a2a12; color: #f0b95a; }
  .badge.err { background: #3a1414; color: #f08a8a; }
  nav.top { margin-bottom: 32px; }
  nav.top a { margin-right: 16px; }
`;

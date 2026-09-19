import { entryPoints } from "../lib/errors";
import { Layout } from "./Layout";

export function NotFoundPage({ path }: { path: string }) {
  return (
    <Layout title="404 Not Found · gh-proxy">
      <h1>404 Not Found</h1>
      <p class="lead">
        <code>{path}</code> is not a route on this server.
      </p>
      <h2>Where to look next</h2>
      <ul>
        {entryPoints.map((e) => (
          <li>
            <a href={e.path}>{e.path}</a> — {e.desc}
          </li>
        ))}
      </ul>
    </Layout>
  );
}

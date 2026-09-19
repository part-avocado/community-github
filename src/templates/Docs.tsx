import { Layout } from "./Layout";

export function DocsPage({ baseURL }: { baseURL: string }) {
  return (
    <Layout title="API Documentation · gh-proxy">
      <nav class="top">
        <a href="/">Home</a>
        <a href="/get-access">Get access</a>
        <a href="/donate">Donate a token</a>
        <a href="/openapi.json">OpenAPI spec</a>
        <a href="/llms.txt">llms.txt</a>
      </nav>
      <h1>API Documentation</h1>
      <p class="lead">
        gh-proxy proxies the GitHub REST and GraphQL APIs using a pool of community-donated tokens,
        with per-key rate limiting and response caching. Get your own key at{" "}
        <a href="/get-access">/get-access</a>.
      </p>

      <h2>Base URL</h2>
      <pre>
        <code>{baseURL}</code>
      </pre>

      <h2>Authentication</h2>
      <p>
        Include your API key in the <code>X-API-Key</code> header:
      </p>
      <pre>
        <code>{`curl -H "X-API-Key: your_api_key_here" ${baseURL}/gh/user`}</code>
      </pre>

      <h2>Endpoints</h2>
      <div class="card">
        <h3>
          <code>GET|POST|PATCH|PUT|DELETE /gh/{"{path}"}</code>
        </h3>
        <p>Proxies any GitHub REST API endpoint — mirrors https://api.github.com/{"{path}"}.</p>
        <pre>
          <code>{`curl -H "X-API-Key: your_key" ${baseURL}/gh/repos/octocat/Hello-World\ncurl -H "X-API-Key: your_key" "${baseURL}/gh/search/repositories?q=javascript"`}</code>
        </pre>
      </div>
      <div class="card">
        <h3>
          <code>POST /gh/graphql</code>
        </h3>
        <p>Proxies the GitHub GraphQL API. Content-Type: application/json.</p>
        <pre>
          <code>{`curl -X POST -H "X-API-Key: your_key" -H "Content-Type: application/json" \\\n  -d '{"query":"query { viewer { login } }"}' ${baseURL}/gh/graphql`}</code>
        </pre>
      </div>

      <h2>Rate limiting</h2>
      <p>
        Each API key has its own limit (default 10 requests/second). Every <code>/gh/</code>{" "}
        response reports your live quota:
      </p>
      <ul>
        <li>
          <code>RateLimit-Limit</code> / <code>RateLimit-Remaining</code> / <code>RateLimit-Reset</code>
        </li>
        <li>
          <code>RateLimit</code> and <code>RateLimit-Policy</code> — IETF draft structured-field syntax
        </li>
        <li>
          <code>Retry-After</code> — sent on <code>429</code>
        </li>
      </ul>
      <p>
        GitHub's own upstream quota for the donated token that served your request is passed through
        separately as <code>X-RateLimit-*</code>.
      </p>

      <h2>Caching</h2>
      <p>
        GET/HEAD 200 responses are cached. Check <code>X-Gh-Proxy-Cache: hit|miss</code>.
      </p>

      <h2>Debug headers</h2>
      <ul>
        <li>
          <code>X-Gh-Proxy-Cache</code>: hit/miss
        </li>
        <li>
          <code>X-Gh-Proxy-Category</code>: core/search/code_search/graphql
        </li>
        <li>
          <code>X-Gh-Proxy-Client</code>: your key's display name
        </li>
        <li>
          <code>X-Gh-Proxy-Donor</code>: GitHub user whose donated token served the request
        </li>
      </ul>

      <h2>Errors</h2>
      <p>Every error is JSON, never an HTML page:</p>
      <pre>
        <code>{`{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "hint": "This key allows 10 requests/second; retry after 1 second(s) and back off exponentially",
    "documentation_url": "${baseURL}/docs"
  }
}`}</code>
      </pre>
      <p>
        Branch on <code>error.code</code>; it is stable. <code>404</code>/<code>405</code> responses also
        carry an <code>error.links</code> array.
      </p>
      <table>
        <tbody>
          <tr>
            <td>
              <code>401</code>
            </td>
            <td>
              <code>MISSING_API_KEY</code>
            </td>
            <td>no X-API-Key header sent</td>
          </tr>
          <tr>
            <td>
              <code>401</code>
            </td>
            <td>
              <code>INVALID_API_KEY</code>
            </td>
            <td>key not recognized</td>
          </tr>
          <tr>
            <td>
              <code>403</code>
            </td>
            <td>
              <code>API_KEY_DISABLED</code>
            </td>
            <td>key exists but was disabled</td>
          </tr>
          <tr>
            <td>
              <code>401</code>
            </td>
            <td>
              <code>HCA_LOGIN_REQUIRED</code>
            </td>
            <td>/get-access needs a Hack Club Auth login</td>
          </tr>
          <tr>
            <td>
              <code>403</code>
            </td>
            <td>
              <code>NOT_ELIGIBLE</code>
            </td>
            <td>your Hack Club Auth verification status doesn't qualify</td>
          </tr>
          <tr>
            <td>
              <code>403</code>
            </td>
            <td>
              <code>DONATION_REQUIRED</code>
            </td>
            <td>donate a GitHub token to activate your key</td>
          </tr>
          <tr>
            <td>
              <code>404</code>
            </td>
            <td>
              <code>NOT_FOUND</code>
            </td>
            <td>no such path</td>
          </tr>
          <tr>
            <td>
              <code>405</code>
            </td>
            <td>
              <code>METHOD_NOT_ALLOWED</code>
            </td>
            <td>path exists, wrong method</td>
          </tr>
          <tr>
            <td>
              <code>413</code>
            </td>
            <td>
              <code>REQUEST_TOO_LARGE</code>
            </td>
            <td>request body too large</td>
          </tr>
          <tr>
            <td>
              <code>429</code>
            </td>
            <td>
              <code>RATE_LIMIT_EXCEEDED</code>
            </td>
            <td>see Retry-After</td>
          </tr>
          <tr>
            <td>
              <code>502</code>
            </td>
            <td>
              <code>UPSTREAM_ERROR</code>
            </td>
            <td>could not reach GitHub; retry with backoff</td>
          </tr>
        </tbody>
      </table>
      <p>
        Any other status on <code>/gh/*</code> is GitHub's own response, forwarded verbatim.
      </p>

      <h2>For agents</h2>
      <ul>
        <li>
          <a href="/llms.txt">/llms.txt</a> — machine-readable site map (llmstxt.org format)
        </li>
        <li>
          <a href="/openapi.json">/openapi.json</a> — OpenAPI 3.0.3 spec
        </li>
        <li>Unknown paths return a real 404: JSON with Accept: application/json, markdown otherwise.</li>
      </ul>
    </Layout>
  );
}

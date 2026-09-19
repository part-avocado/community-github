import { Layout } from "./Layout";
import type { ApiKeyListRow } from "../db/queries/apiKeys";

export interface AdminData {
  csrf: string;
  totalRequests: string;
  cacheHitRate: string;
  today: string;
  activeTokens: number;
  selfServeDonors: number;
  anonymousDonors: number;
  coreRateLimit: number;
  coreRateRemaining: number;
  coreRateTracked: number;
  keys: ApiKeyListRow[];
}

export function AdminPage(d: AdminData) {
  return (
    <Layout title="Admin · gh-proxy">
      <nav class="top">
        <a href="/">Home</a>
        <a href="/docs">Docs</a>
      </nav>
      <h1>Admin dashboard</h1>

      <div class="card stats">
        <div class="stat">
          <div class="n" id="stat-total">
            {d.totalRequests}
          </div>
          <div class="l">total requests</div>
        </div>
        <div class="stat">
          <div class="n" id="stat-hitrate">
            {d.cacheHitRate}
          </div>
          <div class="l">cache hit rate</div>
        </div>
        <div class="stat">
          <div class="n" id="stat-today">
            {d.today}
          </div>
          <div class="l">today</div>
        </div>
        <div class="stat">
          <div class="n">{d.activeTokens}</div>
          <div class="l">active donated tokens</div>
        </div>
      </div>

      <div class="card stats">
        <div class="stat">
          <div class="n">{d.selfServeDonors}</div>
          <div class="l">self-serve donors (have a key)</div>
        </div>
        <div class="stat">
          <div class="n">{d.anonymousDonors}</div>
          <div class="l">anonymous donors (/donate)</div>
        </div>
        <div class="stat">
          <div class="n">
            {d.coreRateRemaining}/{d.coreRateLimit}
          </div>
          <div class="l">aggregate core quota ({d.coreRateTracked} tracked)</div>
        </div>
      </div>

      <h2>API keys</h2>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Owner</th>
            <th>Total</th>
            <th>Hit rate</th>
            <th>Last used</th>
            <th>Limit/s</th>
            <th>Donation</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="keys-body">
          {d.keys.map((k) => (
            <tr>
              <td>
                <code>{k.display}</code>
              </td>
              <td>{k.hc_username ?? k.slack_id ?? "—"}</td>
              <td>{k.total}</td>
              <td>{k.hit_rate.toFixed(1)}%</td>
              <td>{k.last_used ?? "never"}</td>
              <td>{k.rate_limit}</td>
              <td>
                {k.donation_active ? (
                  <span class="badge ok">active</span>
                ) : (
                  <span class="badge err">lapsed</span>
                )}
              </td>
              <td>
                {k.disabled ? <span class="badge err">disabled</span> : <span class="badge ok">enabled</span>}
              </td>
              <td>
                {!k.disabled && (
                  <form method="post" action={`/admin/apikeys/${k.id}/disable`} style="display:inline">
                    <input type="hidden" name="csrf" value={d.csrf} />
                    <button type="submit" class="secondary">
                      Disable
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Recent activity</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody id="recent-body" />
      </table>

      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
            var ws = new WebSocket(proto + '//' + location.host + '/admin/ws');
            ws.onmessage = function(ev) {
              try {
                var msg = JSON.parse(ev.data);
                if (msg.type === 'stats') {
                  document.getElementById('stat-total').textContent = msg.data.totalRequests;
                  document.getElementById('stat-hitrate').textContent = msg.data.cacheHitRate;
                  document.getElementById('stat-today').textContent = msg.data.todayRequests;
                } else if (msg.type === 'recent') {
                  var body = document.getElementById('recent-body');
                  var tr = document.createElement('tr');
                  tr.innerHTML = '<td>' + msg.data.method + '</td><td><code>' + msg.data.path + '</code></td><td></td><td>' + new Date(msg.data.created_at).toLocaleTimeString() + '</td>';
                  body.insertBefore(tr, body.firstChild);
                  while (body.children.length > 50) body.removeChild(body.lastChild);
                }
              } catch (e) {}
            };
          })();
        `,
        }}
      />
    </Layout>
  );
}

# Remote access
- Devices connect OUTBOUND to the control plane (agent polling). No
  inbound port is needed on a device, and no inbound shell is ever opened.
- The plane itself should sit behind a TLS reverse proxy (nginx example):
  ```
  server {
    listen 443 ssl; server_name bridge.example.com;
    ssl_certificate /etc/letsencrypt/live/bridge.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bridge.example.com/privkey.pem;
    location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }
  }
  ```
  Obtain certs with certbot. Keep :8000 on loopback only.
- Authentication: admin dashboard/API via `X-Admin-Token`; devices via
  `X-Device-Token` (hashed at rest). Rotate both on any suspected leak.
- MCP remote: run `python -m ai_bridge.server --http` on loopback and
  proxy it with TLS + a bearer check; never expose the raw HTTP MCP port.
- Offline devices: tasks stay `queued`; the agent picks them up on
  reconnect with bounded exponential backoff (2s -> 60s cap). The
  dashboard shows last-seen from heartbeats.

- mTLS (until native support lands): terminate TLS at nginx with
  `ssl_verify_client on;` and a client CA, and only then proxy to the
  loopback plane. The plane itself does not yet verify client certificates.

const http = require('http');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 3000);
const rawUpstreamUrl = process.env.UPSTREAM_URL || process.env.POOL_URL;

function normalizeWebSocketUrl(input) {
  if (!input) return null;

  const url = new URL(input);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  return url.toString();
}

const upstreamUrl = normalizeWebSocketUrl(rawUpstreamUrl);

if (!upstreamUrl) {
  console.error('Missing UPSTREAM_URL or POOL_URL environment variable');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('WebSocket proxy ready. Connect to this service with a WebSocket client and it will be bridged to the upstream pool.');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const target = normalizeWebSocketUrl(searchParams.get('target') || upstreamUrl);

  if (!target) {
    socket.destroy();
    return;
  }

  console.log(`Bridging client request to upstream target: ${target}`);

  const upstreamSocket = new (require('ws'))(target, {
    headers: {
      Origin: req.headers.origin || 'http://localhost',
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
    },
  });

  upstreamSocket.on('open', () => {
    wss.handleUpgrade(req, socket, head, (clientSocket) => {
      clientSocket.on('message', (data) => upstreamSocket.send(data));
      upstreamSocket.on('message', (data) => clientSocket.send(data));

      clientSocket.on('close', () => upstreamSocket.close());
      upstreamSocket.on('close', () => clientSocket.close());
      clientSocket.on('error', () => {});
      upstreamSocket.on('error', () => {});
    });
  });

  upstreamSocket.on('error', () => {
    socket.destroy();
  });
});

server.listen(port, () => {
  console.log(`Proxy listening on port ${port}`);
});

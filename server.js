const http = require('http');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 3000);
const rawUpstreamUrl = 'http://prl.kryptex.network:7048';

function normalizeUpstreamUrl(input) {
  if (!input) return null;

  const url = new URL(input);
  if (url.protocol === 'http:') {
    return url.toString();
  }

  if (url.protocol === 'https:') {
    return url.toString();
  }

  return url.toString();
}

const upstreamUrl = normalizeUpstreamUrl(rawUpstreamUrl);

console.log(`Using default pool endpoint: ${upstreamUrl}`);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('WebSocket proxy ready. Connect to this service with a WebSocket client and it will be bridged to the upstream pool.');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const target = normalizeUpstreamUrl(searchParams.get('target') || upstreamUrl);

  if (!target) {
    socket.destroy();
    return;
  }

  const wsTargetUrl = new URL(target);
  wsTargetUrl.protocol = wsTargetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsTargetUrl.pathname = pathname || '/';
  if (searchParams && searchParams.toString()) {
    wsTargetUrl.search = searchParams.toString();
  }

  console.log(`Bridging client request to upstream target: ${wsTargetUrl.toString()}`);

  const upstreamSocket = new (require('ws'))(wsTargetUrl.toString(), {
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

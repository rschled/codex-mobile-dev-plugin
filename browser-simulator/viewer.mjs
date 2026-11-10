import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { actionSchema } from './native.mjs';

const assets = new Map([
  ['', ['viewer.html', 'text/html; charset=utf-8']],
  ['viewer.js', ['viewer.js', 'text/javascript; charset=utf-8']],
  ['viewer.css', ['viewer.css', 'text/css; charset=utf-8']],
]);
const files = new Map(await Promise.all([...assets].map(async ([path, [file, type]]) => [
  path, [await readFile(new URL(file, import.meta.url)), type],
])));
const headerEnd = Buffer.from('\r\n\r\n');

// Baguette's CLI writes an HTTP header followed by length-prefixed JPEG parts.
async function sendFrames(stream, socket) {
  let buffer = Buffer.alloc(0);
  let firstHeader = true;
  let length = 0;
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length) {
      if (!length) {
        const end = buffer.indexOf(headerEnd);
        if (end < 0) {
          if (buffer.length > 4096) throw new Error('Invalid simulator stream header.');
          break;
        }
        const header = buffer.subarray(0, end).toString('ascii');
        buffer = buffer.subarray(end + headerEnd.length);
        if (firstHeader) {
          firstHeader = false;
          if (!header.startsWith('HTTP/1.1 200 OK\r\n')) throw new Error('Could not start the simulator stream.');
          continue;
        }
        length = Number(/^Content-Length: (\d+)$/im.exec(header)?.[1]);
        if (!length || length > 8 * 1024 * 1024) throw new Error('Invalid simulator frame length.');
      }
      if (buffer.length < length) break;
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 512 * 1024) socket.send(buffer.subarray(0, length));
      buffer = buffer.subarray(length);
      length = 0;
    }
  }
}

export async function openViewer(native, device) {
  const prefix = `/${randomBytes(24).toString('hex')}/`;
  let origin;
  let host;
  let active;
  const http = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (req.method !== 'GET' || req.headers.host !== host || !req.url.startsWith(prefix)) {
      res.writeHead(404).end(); return;
    }
    const path = req.url.slice(prefix.length);
    if (path === 'device') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(device));
    } else if (path === 'screenshot.jpg') {
      try {
        const image = await native.screenshot();
        res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(image);
      }
      catch { if (res.headersSent) res.destroy(); else res.writeHead(503).end('Screenshot unavailable.'); }
    } else {
      const file = files.get(path);
      if (file) res.writeHead(200, { 'Content-Type': file[1] }).end(file[0]);
      else res.writeHead(404).end();
    }
  });
  const ws = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });
  http.on('upgrade', (req, socket, head) => {
    if (active || req.url !== `${prefix}live` || req.headers.host !== host || req.headers.origin !== origin) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return;
    }
    ws.handleUpgrade(req, socket, head, client => {
      active = client;
      let checkingInput;
      let lastCheck = 0;
      let lastError;
      let alive = true;
      const stream = native.stream();
      const status = (error) => {
        if (error === lastError) return;
        lastError = error;
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ error }));
      };
      stream.on('error', () => client.close(1011, 'Could not start stream'));
      stream.stdin.on('error', () => {});
      void sendFrames(stream.stdout, client).catch(() => {}).finally(() => {
        if (client.readyState === WebSocket.OPEN) client.close(1011, 'Stream ended');
      });
      client.on('error', () => client.terminate());
      client.on('pong', () => { alive = true; });
      const check = setInterval(() => {
        if (!alive) client.terminate();
        else { alive = false; client.ping(); }
      }, 10000);
      client.on('close', () => {
        clearInterval(check);
        stream.kill();
        if (active === client) active = undefined;
      });
      client.on('message', async (data, binary) => {
        if (binary) return;
        let parsed;
        try { parsed = actionSchema.safeParse(JSON.parse(data.toString())); }
        catch { return; }
        if (!parsed.success) { status('Unsupported simulator input.'); return; }
        const message = parsed.data;
        try {
          if (Date.now() - lastCheck > 1000) {
            checkingInput ??= native.checkOwner().then(() => { lastCheck = Date.now(); }).finally(() => { checkingInput = undefined; });
            await checkingInput;
          }
          if (client.readyState !== WebSocket.OPEN) return;
          await native.send(message);
          if (lastError) status(null);
        } catch (error) { status(error.message); }
      });
    });
  });
  await new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  host = `127.0.0.1:${http.address().port}`;
  origin = `http://${host}`;
  return {
    url: origin + prefix,
    close() {
      active?.terminate();
      ws.close();
      http.close();
      http.closeAllConnections();
    },
  };
}

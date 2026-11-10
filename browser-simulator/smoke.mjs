import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocket } from 'ws';

const [checkout, simulatorName] = process.argv.slice(2);
const cli = process.env.CODEX_CLI_PATH ?? 'codex';
const { transport: config, enabled } = JSON.parse(execFileSync(cli, ['mcp', 'get', 'ios-simulator-browser', '--json']));
assert.equal(enabled, true);
const entries = await readdir(config.cwd);
assert.ok(entries.includes('Baguette') && entries.includes('viewer.html'));
assert.ok(!entries.some(name => /android|mirror|slim|\.bundle$/i.test(name)));
const release = JSON.parse(await readFile(join(config.cwd, 'release.json'), 'utf8'));
assert.equal(createHash('sha256').update(await readFile(join(config.cwd, 'Baguette'))).digest('hex'), release.build.binarySha256);

const transport = new StdioClientTransport({ ...config, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, stderr: 'pipe' });
transport.stderr.on('data', chunk => process.stderr.write(chunk));
const client = new Client({ name: 'ios-simulator-browser-smoke', version: '1' });
async function call(name, args = {}) {
  const reply = await client.callTool({ name, arguments: args });
  assert.ok(!reply.isError, reply.content[0]?.text);
  return reply.content[0];
}
function jpeg(bytes) {
  assert.ok(bytes.length > 1024);
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
}
async function frame(url, origin, expectedUpgrade = 101) {
  const socket = new WebSocket(url, { origin, handshakeTimeout: 5000 });
  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Timed out waiting for the simulator stream.')), 8000);
      const finish = error => { clearTimeout(deadline); if (error) reject(error); else resolve(); };
      socket.on('error', finish);
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        finish(response.statusCode === expectedUpgrade ? undefined : new Error(`Unexpected status ${response.statusCode}`));
      });
      socket.on('message', (data, binary) => {
        try { assert.equal(expectedUpgrade, 101); assert.ok(binary); jpeg(data); finish(); }
        catch (error) { finish(error); }
      });
    });
  } finally {
    if (socket.readyState !== WebSocket.CLOSED) await new Promise(resolve => { socket.once('close', resolve); socket.close(); });
  }
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'close_simulator', 'inspect_simulator', 'open_simulator', 'reclaim_simulator_input', 'simulator_input', 'simulator_screenshot',
  ]);
  if (checkout) {
    const { text } = await call('open_simulator', { checkout, simulatorName });
    if (simulatorName) assert.ok(text.startsWith(`${simulatorName} (`));
    const url = new URL(text.split('\n').at(-1));
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal((await fetch(url.origin)).status, 404);
    assert.match(await (await fetch(url)).text(), /Live simulator screen/);
    const screenshot = await fetch(new URL('screenshot.jpg', url));
    assert.equal(screenshot.headers.get('content-type'), 'image/jpeg');
    jpeg(Buffer.from(await screenshot.arrayBuffer()));
    jpeg(Buffer.from((await call('simulator_screenshot')).data, 'base64'));
    const socketUrl = new URL('live', url);
    socketUrl.protocol = 'ws:';
    await frame(socketUrl, 'http://example.invalid', 404);
    await frame(socketUrl, url.origin);
    await frame(socketUrl, url.origin);
    await call('close_simulator');
    await assert.rejects(fetch(url));
  }
  console.log(`Installed package and MCP tools verified${checkout ? ', including scoped stream, screenshots, reconnect, and close' : ''}.`);
} finally {
  await client.close();
}

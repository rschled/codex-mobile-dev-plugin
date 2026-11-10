import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { actionSchema, resolveSimulator, simulatorNative } from './native.mjs';
import { openViewer } from './viewer.mjs';

const executable = fileURLToPath(new URL('./Baguette', import.meta.url));
let session;
let opening;
let stopping = false;
const mcp = new McpServer({ name: 'ios-simulator-browser', version: '0.1.0' });
const result = text => ({ content: [{ type: 'text', text }] });
const readOnly = { readOnlyHint: true };
const localAction = { destructiveHint: false, openWorldHint: false };

function tool(name, description, inputSchema, annotations, handle) {
  mcp.registerTool(name, { description, inputSchema, annotations }, async args => {
    try { return await handle(args); }
    catch (error) { return { ...result(error.message), isError: true }; }
  });
}
function requireSession() {
  if (!session) throw new Error('Open a simulator first.');
  return session;
}
function close() {
  session?.viewer.close();
  session?.native.dispose();
  session = undefined;
}

tool('open_simulator', 'Start the browser viewer for a Dapital checkout. Use its mapped simulator by default or an exact simulator name explicitly requested by the user. Open the returned URL in the Codex in-app browser.', {
  checkout: z.string().min(1).describe('Absolute path to the Dapital client checkout or its dappios directory.'),
  simulatorName: z.string().trim().min(1).optional().describe('Exact simulator name, only when explicitly requested by the user.'),
}, localAction, async ({ checkout, simulatorName }) => {
  if (opening) throw new Error('The simulator viewer is already opening. Retry after the open finishes.');
  if (session && (checkout !== session.checkout || simulatorName !== session.simulatorName)) {
    throw new Error('Close the current simulator before opening another target.');
  }
  if (!session) {
    opening = true;
    let native;
    try {
      const device = await resolveSimulator(checkout, simulatorName);
      native = await simulatorNative(executable, device.udid);
      const viewer = await openViewer(native, { name: device.name });
      if (stopping) { viewer.close(); throw new Error('The plugin has closed.'); }
      session = { device, native, viewer, checkout, simulatorName };
    } catch (error) { native?.dispose(); throw error; }
    finally { opening = false; }
  }
  return result(`${session.device.name} (${session.device.udid})\n${session.viewer.url}`);
});

tool('inspect_simulator', 'Read the accessibility tree of the open simulator. Use its current labels and bounds before choosing a gesture.', {}, readOnly, async () => {
  return result(JSON.stringify(await requireSession().native.inspect()));
});
tool('simulator_screenshot', 'Capture a new image from the open simulator.', {}, readOnly, async () => {
  const data = (await requireSession().native.screenshot()).toString('base64');
  return { content: [{ type: 'image', data, mimeType: 'image/jpeg' }] };
});
tool('simulator_input', 'Send a tap, swipe, hardware button, key, or printable US keyboard text to the open simulator. Gesture coordinates and dimensions must use the same units.', {
  input: actionSchema,
}, localAction, async ({ input }) => {
  const { native } = requireSession();
  await native.checkOwner();
  await native.send(input);
  return result('Input acknowledged. Read the current screen to verify the result.');
});
tool('reclaim_simulator_input', 'Reclaim input from Device Hub after its window for this simulator is closed. This restarts backboardd and SpringBoard and closes running apps on the selected simulator.', {}, { ...localAction, destructiveHint: true }, async () => {
  await requireSession().native.reclaim();
  return result('The simulator input surface is available.');
});
tool('close_simulator', 'Close the viewer and release its local simulator connections.', {}, localAction, async () => {
  if (opening) throw new Error('Wait for the simulator viewer to finish opening before closing it.');
  close();
  return result('Simulator viewer closed.');
});

const transport = new StdioServerTransport();
await mcp.connect(transport);
function shutdown() { stopping = true; close(); }
mcp.server.onclose = shutdown;
process.stdin.on('end', shutdown);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { shutdown(); process.exit(0); });

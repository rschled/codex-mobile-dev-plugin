# iOS Simulator Browser for Codex

Open the Dapital simulator assigned to a checkout in Codex’s built-in browser. The simulator stays on this Mac, and the plugin gives Codex independent screenshot, accessibility, and input tools for the same device.

## Build and install

Use an Apple Silicon Mac with Xcode 27 and Node 22.18 or later. From the root of the mobile plugin repository:

```sh
npm ci
npm run rebuild:baguette
node browser-simulator/package.mjs
codex plugin marketplace add ./release/browser-marketplace
codex plugin add ios-simulator-browser@ios-simulator-local
```

If `vendor/baguette` already contains a matching local build, packaging verifies the binary hash and source commit and can reuse it. The package includes the Baguette executable and license notices from the pinned build, a Node bundle with its dependency notices, and the viewer. It uses no Baguette plugins or web resources, platform helpers, or simulator optimizers. It disables native reporting before every invocation.

## Use

In a Codex chat for the Dapital client, invoke the plugin’s **open-simulator** skill or ask it to open the mapped iOS simulator beside the chat. In a different project, supply the absolute Dapital client checkout path. The plugin uses the checkout’s `scripts/agent-ios.py resolve` command by default. If you explicitly name a simulator, it resolves that exact name from the available iOS simulators. To install a build, run `scripts/agent-ios.py install --target-kind mapped-simulator` from `dappios`. Add `--simulator-name <same exact name>` when using an explicit simulator, and verify the install target matches the viewer’s device.

Close the mapped simulator’s window in Device Hub. If input remains claimed, ask Codex to reclaim it. This restarts backboardd and SpringBoard and closes running apps on the selected simulator. Click the streamed display to tap, drag and release to swipe, and focus a native text field to type. Direct typing and **Type text** support printable US keyboard characters. **Screenshot** downloads a fresh image. Closing the tab releases its stream. Reopening the returned URL starts a new stream for the same simulator until Codex closes the session. Treat the URL as local session access.

## Smoke test

```sh
node browser-simulator/smoke.mjs
node browser-simulator/smoke.mjs /absolute/path/to/dapital/client [simulator-name]
```

The first command checks the installed package through Codex’s configured MCP transport. The second additionally opens the mapped or explicitly named simulator, verifies live JPEG frames, checks that browser access is scoped, reconnects, and closes the session. It may boot the selected simulator. For interactive dogfood, use iOS Settings for touch, swipe, and text, then clear the test search and verify the Dapital app renders.

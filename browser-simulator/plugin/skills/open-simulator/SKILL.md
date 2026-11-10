---
name: open-simulator
description: Open the mapped Dapital iOS simulator in the native Codex browser and control it alongside the chat.
---

Use the active Dapital client checkout (or its `dappios` directory). If the chat is in an unrelated project and no Dapital checkout is specified, ask which checkout to use. Never infer a simulator from whichever devices are booted.

1. Call `open_simulator` with that absolute checkout path. Pass `simulatorName` only when the user explicitly requests a simulator by name. Open the returned local URL in the native Codex in-app browser and verify a live frame. The URL grants access to this simulator for this session. Keep it local.
2. Close the mapped device's window in Device Hub. If input reports Device Hub ownership, confirm the mapped window is closed before calling `reclaim_simulator_input`. Recovery restarts backboardd and SpringBoard and closes running apps on that simulator.
3. Use `inspect_simulator` or `simulator_screenshot` before agent input. Use the exposed labels and current bounds to locate controls. After each action, verify its effect. For text, click the phone and type, or use the browser's **Type text** field after focusing a field on iOS. The current native keyboard accepts printable US keyboard characters.
4. To install a build, run `scripts/agent-ios.py install --target-kind mapped-simulator` from the checkout's `dappios` directory. For an explicitly named simulator, add `--simulator-name <same exact name>`. Confirm the install target matches the name and UDID returned by `open_simulator`. Preserve logins and drafts.
5. Closing the browser tab stops its live stream. Use `close_simulator` when finished with the session.

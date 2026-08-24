<div align="center">
  <img src="./assets/touchbridge-mark.svg" width="108" alt="TouchBridge logo" />
  <h1>TouchBridge</h1>
  <p><strong>Local MCP control, inspection, and design capture for iOS.</strong></p>

  [![CI](https://github.com/MarshallBear1/touchbridge-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/MarshallBear1/touchbridge-mcp/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Node.js 20.17+](https://img.shields.io/badge/node-%3E%3D20.17-339933.svg)](package.json)
</div>

TouchBridge lets an MCP-compatible AI host inspect and operate iOS simulators and physical iPhones. It also creates structured design snapshots: a full-resolution screen image, redacted accessibility metadata, normalized editor layers, and a versioned handoff manifest.

The server runs locally over stdio. Normal device control does not require a TouchBridge cloud service.

> [!IMPORTANT]
> TouchBridge is pre-1.0 software. Test destructive or account-changing flows on non-production data, keep physical devices unlocked during automation, and review the [security and privacy boundaries](#security-and-privacy) before capturing sensitive screens.

## What works

| Capability | Simulator | Physical iPhone/iPad |
|---|:---:|:---:|
| Discover active targets | Yes | Yes |
| Tap, swipe, and enter text | Yes | Yes, through WebDriverAgent |
| Scan visible interactive elements | Yes | Yes |
| Read the accessibility hierarchy | Yes | Yes |
| Capture temporary screenshots | Yes | Yes |
| Capture durable design snapshots | Yes | Yes |
| Launch an app by known bundle ID | Yes | Yes |
| List installed apps | Yes | Not yet |
| Loopback live viewer | — | Yes |
| Structured environment diagnostics | Yes | Yes |

Physical-device automation does not support numeric HID keycodes. Use text keys, touch actions, or supported hardware-button actions instead.

## Requirements

- macOS
- Xcode and its command-line tools
- Node.js 20.17 or newer
- Homebrew
- Internet access during first-time installation

Physical devices additionally require:

- a data-capable USB cable or a working CoreDevice network tunnel;
- an unlocked, trusted iPhone or iPad;
- Developer Mode enabled;
- an Apple ID signed into Xcode for WebDriverAgent code signing.

## Quick start

Check the environment before changing any MCP configuration:

```bash
npx -y github:MarshallBear1/touchbridge-mcp --doctor
```

Install the local dependencies and configure supported MCP hosts:

```bash
npx -y github:MarshallBear1/touchbridge-mcp --setup-all
```

`--setup-all` configures detected Claude Code, Cursor, Codex, and OpenCode installations. Use `--setup-here` for project-scoped configuration or `--setup` for an interactive choice.

Restart the MCP host, boot one simulator or connect one unlocked physical device, then ask:

```text
Run TouchBridge doctor, get the execution context, and describe the current screen.
```

TouchBridge exposes the MCP server with this command:

```bash
npx -y github:MarshallBear1/touchbridge-mcp
```

## Physical-device setup

1. Connect the device with a data-capable cable.
2. Unlock it and accept **Trust This Computer** if prompted.
3. Enable **Settings → Privacy & Security → Developer Mode**.
4. Sign into **Xcode → Settings → Accounts**.
5. Run `--setup-all`; TouchBridge clones the pinned WebDriverAgent release listed in `src/brand.ts`.
6. Call the MCP `setup_device` tool with the physical UDID. If WebDriverAgent is not running, the tool returns exact build and launch commands.
7. Keep the returned `xcodebuild test-without-building` process running while using the device.

If the Mac has certificates for multiple Apple teams, set the team shown in Xcode before starting the MCP host:

```bash
export TOUCHBRIDGE_DEVELOPMENT_TEAM=ABCDE12345
```

Useful connection checks:

```bash
xcrun xcdevice list
xcrun devicectl list devices
npx -y github:MarshallBear1/touchbridge-mcp --doctor
```

A device that is merely paired or remembered is not necessarily connected. If TouchBridge reports zero physical devices, unlock the phone, reconnect the cable, accept any trust/developer-image prompt, and retry.

### Reproducible physical smoke test

From a source checkout, this command exercises the real MCP transport without tapping, typing, or launching an app:

```bash
npm ci
npm run smoke:physical -- --udid 00008150-EXAMPLE
```

The smoke test performs:

```text
doctor → list_devices → setup_device → get_screenshot → scan_ui
```

It verifies and then deletes its temporary screenshot. It fails with the required WebDriverAgent setup instructions when WDA is not ready. Physical smoke tests are intentionally opt-in and do not run in GitHub Actions.

### Verified physical-device matrix

| Date | Device | iOS | Xcode | WDA | Result |
|---|---|---:|---:|---:|---|
| 2026-08-24 | iPhone Air | 26.5 | 26.6 | 16.8.0 | PASS: doctor, MCP setup, screenshot verification, and 24-element UI scan |

The verified run performed no taps, typing, button presses, or app launches.

## MCP tools

| Tool | Purpose |
|---|---|
| `doctor` | Diagnose Node, Xcode, Simulator, idb, image tooling, and connected targets |
| `get_execution_context` | Resolve the active simulator/device and viewer state |
| `list_devices` | List booted simulators and connected physical devices |
| `setup_device` | Connect to WDA or return its exact build/launch commands |
| `scan_ui` | Return visible interactive elements and device-point coordinates |
| `describe_screen` | Return the visible accessibility hierarchy |
| `device_action` | Perform one validated action |
| `device_actions` | Perform a bounded sequence of validated actions |
| `get_screenshot` | Create a temporary, unredacted screenshot and embedded preview |
| `capture_design_snapshot` | Create a durable design handoff with redacted UI metadata |
| `launch_app` | Activate an app by a known bundle ID |
| `list_apps` | List installed apps on simulators |

Always call `get_execution_context` first. When multiple targets exist, pass the chosen `udid` explicitly to every subsequent tool.

## Design snapshots

`capture_design_snapshot` writes a versioned bundle below `~/.touchbridge/captures/`:

```text
capture-directory/
├── screen.png      full-resolution, unredacted pixels
├── preview.png     downscaled, unredacted pixels
├── ui.json         redacted accessibility metadata
├── editor.json     normalized layers and sanitized editing intent
└── manifest.json   design-snapshot@1 handoff contract
```

See the [snapshot contract](docs/design-snapshot-capture.md) and [voice-to-design architecture](docs/voice-design-workflow.md).

## Security and privacy

TouchBridge stores local state beneath `~/.touchbridge/`:

```text
~/.touchbridge/
├── captures/       durable design handoffs
├── python/         isolated idb environment
├── idb-companion/  local companion support
├── wda-build/      pinned WebDriverAgent source and build data
└── bin/            native accessibility helper
```

- The live viewer binds to `127.0.0.1`, not the public network.
- Text entered with `input-text`, text keys, or text-key sequences is not echoed in MCP results or logs.
- Sensitive accessibility values are redacted from `ui.json`, `editor.json`, manifests, and editing intents.
- **Screenshot pixels are not redacted.** Temporary and durable PNGs can contain passwords, messages, health data, or other visible information.
- Temporary screenshots use a randomized private directory. The returned full-resolution file remains until the caller deletes it.
- Design snapshots are durable by design and remain until the user deletes their capture directory.
- First-time setup downloads packages from GitHub, Homebrew, npm, and PyPI. Runtime device traffic remains local.
- WebDriverAgent is a signed test runner installed on the device; stop its `xcodebuild` process when testing is complete.

For vulnerability reports, see [SECURITY.md](SECURITY.md).

## Troubleshooting

### Xcode sees the phone, but TouchBridge does not

An Xcode entry can represent a remembered device. TouchBridge requires a current CoreDevice tunnel or wired connection. Unlock the device, reconnect it with a data-capable cable, accept prompts, and rerun `--doctor`.

### `No CoreDevice tunnel found`

Keep the device unlocked and trusted. Confirm Developer Mode, then inspect `xcrun devicectl list devices`. A `disconnected` or `unavailable` tunnel cannot carry WDA traffic.

### WebDriverAgent does not build

Open Xcode once, sign into an Apple ID, and allow automatic provisioning. If macOS requests keychain access during the build, choose **Always Allow** for the signing operation.

### `get_execution_context` is ambiguous

Shut down unused simulators or select the intended target from `list_devices`, then pass that UDID explicitly.

## Development

```bash
git clone https://github.com/MarshallBear1/touchbridge-mcp.git
cd touchbridge-mcp
npm ci
npm run check
npm audit --omit=dev
npm run smoke:package
```

CI runs the audit, typecheck, tests, and fresh-consumer package smoke test on macOS with Node 20.17 and Node 22.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Keep device actions deterministic, bound externally supplied values, avoid logging screen content or typed text, and add regression tests for physical and simulator paths.

## License and attribution

TouchBridge is MIT licensed. It includes work derived from the MIT-licensed `iPhone-mcp` project; the required upstream copyright notice is preserved in [LICENSE](LICENSE), with provenance in [NOTICE.md](NOTICE.md).

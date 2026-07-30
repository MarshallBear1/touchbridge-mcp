# TouchBridge Tool Reference

## Setup

```bash
npx -y github:MarshallBear1/touchbridge-mcp --setup    # Install dependencies + configure MCP
npx -y github:MarshallBear1/touchbridge-mcp            # Start MCP server (stdio)
npx -y github:MarshallBear1/touchbridge-mcp --version  # Print version
```

## Tools

### doctor

Run read-only environment diagnostics before troubleshooting setup failures. Reports Node, Xcode, Simulator, idb, image tooling, and currently connected targets.

### capture_design_snapshot

Create a durable full-resolution PNG, redacted UI/accessibility JSON, and a versioned handoff manifest beneath `~/.touchbridge/captures/`. Use this for voice requests such as “capture this screen/slide for editing” or when another MCP will continue in Figma, Slides, or an image editor. Keep `get_screenshot` for temporary visual checks.

### get_execution_context

Get available iOS devices. Call this first.

**Returns:**
- `target: 'simulator'` — one simulator booted. Use `udid` for all calls.
- `target: 'device'` — one physical device. Use `udid`. Share `viewer_url` with user.
- `target: 'ambiguous'` — multiple devices. Ask user which to use.
- `target: 'none'` — no devices found.

```json
{ "target": "simulator", "udid": "ABC-123", "name": "iPhone 16 Pro", "screen_size": { "width": 393, "height": 852 } }
```

### scan_ui

Find interactive elements on screen. Returns tap coordinates.

**Params:**
- `region` (required): `'full'` | `'top-half'` | `'bottom-half'` | `'top-left'` | `'top-right'` | `'bottom-left'` | `'bottom-right'`
- `query` (optional): Text search (case-insensitive)
- `udid` (optional): Device ID

**Example:**
```json
{ "region": "full", "query": "Settings" }
```

### describe_screen

Get full UI hierarchy (all element types). Use for understanding layout.

**Params:**
- `udid` (optional)
- `nested` (optional): Include nested hierarchy

### device_action

Execute a single action.

**Params:**
- `action`: `'tap'` | `'swipe'` | `'button'` | `'input-text'` | `'key'` | `'key-sequence'`
- `params`: Action-specific params
- `udid` (optional)
- `describe_after` (optional): `{ all: true }` or `{ point: { x, y } }`

**Action params:**
- tap: `{ x, y, duration? }`
- swipe: `{ fromX, fromY, toX, toY, duration?, delta? }`
- button: `{ button: 'HOME'|'LOCK'|'SIDE_BUTTON'|'APPLE_PAY'|'SIRI', duration? }`
- input-text: `{ text }`
- key: `{ key: number|string, duration? }`
- key-sequence: `{ keySequence: (number|string)[] }`

**Examples:**
```json
{ "action": "tap", "params": { "x": 200, "y": 400 } }
{ "action": "swipe", "params": { "fromX": 200, "fromY": 600, "toX": 200, "toY": 200 } }
{ "action": "input-text", "params": { "text": "Hello world" } }
{ "action": "button", "params": { "button": "HOME" } }
```

### device_actions

Execute multiple actions in sequence.

**Params:**
- `actions`: Array of `{ action, params }` objects
- `udid` (optional)
- `describe_after` (optional)

**Example:**
```json
{
  "actions": [
    { "action": "tap", "params": { "x": 200, "y": 100 } },
    { "action": "input-text", "params": { "text": "search query" } },
    { "action": "key", "params": { "key": "\n" } }
  ]
}
```

### get_screenshot

Capture a PNG screenshot. Returns file path.

**Params:**
- `udid` (optional)

### list_devices

List all booted simulators and connected physical devices.

### launch_app

Launch an app by bundle ID.

**Params:**
- `bundleId` (required): e.g. `"com.apple.mobilesafari"`
- `udid` (optional)

### list_apps

List installed apps (simulator only).

**Params:**
- `udid` (optional)

## Common Patterns

### Navigate to a screen
```
1. scan_ui { region: "full" } → find target element
2. device_action { action: "tap", params: { x, y } } → tap it
3. scan_ui { region: "full" } → verify new screen
```

### Fill a form
```
1. scan_ui { region: "full", query: "Email" } → find field
2. device_action { action: "tap", params: { x, y } } → focus field
3. device_action { action: "input-text", params: { text: "user@example.com" } }
4. scan_ui { region: "full", query: "Password" } → find next field
5. device_action { action: "tap", params: { x, y } }
6. device_action { action: "input-text", params: { text: "password123" } }
```

### Scroll to find content
```
1. scan_ui { region: "full", query: "target" } → check if visible
2. If not found or warning about off-screen:
   device_action { action: "swipe", params: { fromX: 200, fromY: 600, toX: 200, toY: 200 } }
3. scan_ui again
```

## Coordinate Reference

| Device | Width | Height |
|--------|-------|--------|
| iPhone 17 Pro | 402 | 874 |
| iPhone 17 Pro Max | 440 | 956 |
| iPhone 16 Pro | 402 | 874 |
| iPhone 16 Pro Max | 440 | 956 |
| iPhone 16 | 393 | 852 |
| iPhone 16 Plus | 430 | 932 |
| iPhone 15 Pro | 393 | 852 |
| iPhone 15 Pro Max | 430 | 932 |
| iPhone SE (3rd gen) | 375 | 667 |

## WDA Troubleshooting

- **Developer Mode**: Enable on iPhone at Settings > Privacy & Security > Developer Mode
- **Trust This Computer**: Tap "Trust" when prompted on iPhone after USB connection
- **Provisioning**: Sign into Xcode with Apple ID (Xcode > Settings > Accounts)
- **WDA not reachable**: Ensure iPhone is unlocked and connected via USB

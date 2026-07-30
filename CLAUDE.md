# TouchBridge

MCP server for controlling iOS simulators and physical iPhones.

## Workflow

1. Call `get_execution_context` first to discover available devices
2. If setup or connectivity is unclear, call `doctor` for structured read-only diagnostics
3. If `target === 'ambiguous'`, ask the user which device to use
4. If `target === 'device'`, inform the user about `viewer_url` so they can see the screen
5. If `target === 'none'`, tell the user to boot a simulator or connect an iPhone
6. Pass the returned `udid` to all subsequent tool calls

## Key Patterns

- Use `scan_ui` before interacting — it returns interactive elements with tap coordinates
- Use `get_screenshot` to visually verify the current screen state
- Use `capture_design_snapshot` when the screenshot must be durable or handed to Figma, Slides, or another editing tool; pass the user's spoken instruction in `intent` and consume the returned `editor.json` for normalized layers
- Use `describe_screen` for the full element tree (all types, not just interactive)
- All coordinates are in device screen points (not pixels)
- Use `device_actions` for batching multiple sequential actions
- Choose the smallest `scan_ui` region possible for speed

## Physical Devices

- Physical devices require WebDriverAgent (WDA) running on the device
- Run `npx -y github:MarshallBear1/touchbridge-mcp --setup` to install WDA and dependencies
- The viewer URL shows a live screen stream in the browser
- The agent cannot see the physical device screen directly — rely on `scan_ui` and `get_screenshot`

## Coordinate Systems

Common iPhone screen sizes (in points):
- iPhone 15/16 Pro: 393 x 852
- iPhone 15/16 Pro Max: 430 x 932
- iPhone SE: 375 x 667

All coordinates passed to tap/swipe should be in these point values.

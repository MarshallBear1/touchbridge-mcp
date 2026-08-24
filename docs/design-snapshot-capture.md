# Design snapshot capture

The `capture_design_snapshot` MCP tool captures a durable, full-resolution snapshot of the current iPhone screen together with structured UI/accessibility context, packaged for handoff to a design or editing environment (Figma, Slides, etc.) driven by another MCP or orchestrator.

It is intended for voice-friendly flows like *"capture this screen for editing"*—one tool call, one self-contained artifact folder. TouchBridge never talks to Figma or any other design service and stores no design-tool credentials; it only produces artifacts on local disk that an orchestrator can pick up.

For a quick throwaway screenshot (private temporary directory, no manifest), use `get_screenshot` and delete the returned file after use.

> [!WARNING]
> Screenshot pixels are not redacted. Both `screen.png` and `preview.png` can contain any text or imagery visible on the device. Redaction applies only to structured accessibility data and sanitized intent fields.

## Tool input

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `udid` | string | `"booted"` | Simulator UDID or physical-device UDID, same as other tools |
| `name` | string | none | Human-friendly name, e.g. `"login screen"`. Sanitized into a slug (`login-screen`); blank or unusable names are ignored. Arbitrary output paths are **not** accepted. |
| `intent` | string | none | Spoken or typed editing instruction, e.g. `"make this editable in Figma and label the controls"`. Whitespace is normalized, assigned secrets are redacted, and the stored value is capped at 500 characters. |
| `include_ui` | boolean | `true` | Also capture the filtered UI element tree (same filtering as `describe_screen`) |

Works on both simulators (`xcrun simctl io ... screenshot`) and physical devices (WebDriverAgent screenshot), reusing the existing device clients.

## Artifacts

Each capture is written to a unique directory that is never reused:

```
~/.touchbridge/captures/<timestamp>-<random>[-<name>]/
├── screen.png     # full-resolution, unredacted screenshot (source of truth for editing)
├── preview.png    # 1/3-scale, unredacted preview (what the agent sees inline)
├── ui.json        # filtered UI/accessibility elements (when include_ui)
├── editor.json    # normalized semantic layers + sanitized editing intent
└── manifest.json  # manifest v1, see below
```

If any step fails, the directory is removed and the tool returns a normal MCP error — a capture folder on disk always represents a complete snapshot.

## Manifest v1

`manifest.json` is the handoff contract. Consumers should key off `handoff.contract` / `handoff.version` rather than guessing from file layout.

```json
{
  "schema": "dev.touchbridge.design-snapshot.capture-manifest",
  "schema_version": 1,
  "handoff": {
    "contract": "design-snapshot",
    "version": 1,
    "intent": "Make this editable in Figma and label the controls"
  },
  "capture": {
    "id": "2026-07-30T12-34-56-789Z-ab12cd34",
    "name": "login-screen",
    "created_at": "2026-07-30T12:34:56.789Z"
  },
  "source": {
    "platform": "ios",
    "target": "simulator",
    "udid": "AAAA1111-2222-3333-4444-555566667777"
  },
  "image": {
    "path": "/Users/me/.touchbridge/captures/.../screen.png",
    "file": "screen.png",
    "mime_type": "image/png",
    "pixel_width": 1179,
    "pixel_height": 2556
  },
  "preview": {
    "path": "/Users/me/.touchbridge/captures/.../preview.png",
    "file": "preview.png",
    "mime_type": "image/png"
  },
  "screen_points": { "width": 393, "height": 852 },
  "ui": {
    "path": "/Users/me/.touchbridge/captures/.../ui.json",
    "file": "ui.json",
    "format": "dev.touchbridge.design-snapshot.capture-ui@1",
    "element_count": 42
  },
  "editor": {
    "path": "/Users/me/.touchbridge/captures/.../editor.json",
    "file": "editor.json",
    "format": "dev.touchbridge.design-snapshot.editor-layer-map@1",
    "layer_count": 18
  }
}
```

- `source.target` is `"simulator"` or `"physical-device"`.
- `screen_points` is the screen size in points (the coordinate space used by `ui.json` frames and all tap/swipe tools); it is `null` if it could not be determined.
- `preview` and `ui` are `null` when not produced.
- `ui.json` contains `{ schema, schema_version, element_count, elements }`, where `elements` uses the same shape and filtering as the `describe_screen` tool.
- `editor.json` removes the application root and malformed frames, gives every remaining element a stable layer ID/name/semantic role, marks interactive elements, and supplies both point and normalized frames.
- `editor.json.canvas.pixels_per_point` records the exact image-to-iOS coordinate scale. This is derived from the captured accessibility root, so custom simulator names do not introduce Figma overlay drift.
- `editor.json.figma` provides a suggested frame name and default overlay treatment. These are hints, not credentials or direct Figma API calls.
- Values from secure text fields and password/passcode/PIN/verification-code/API-key-like elements are replaced with `[REDACTED]` before structured JSON artifacts are written. This does not modify screenshot pixels.
- Assigned secrets in `intent` (for example, `password is ...` or `api key: ...`) are replaced with `[REDACTED]`.

## Tool response

The tool returns two content items:

1. A `text` item with machine-readable JSON: `capture_id`, `name`, `directory`, `manifest_path`, plus the manifest's `image` (always includes the full-resolution `screen.png` path), `preview`, `screen_points`, `ui`, `editor`, `source`, and `handoff` blocks.
2. An `image` item containing the downscaled preview for the agent's visual inspection.

## Tests

Pure helpers (name sanitization, capture-id/directory construction, sips output parsing, manifest building) live in `src/capture-artifact.ts` and are covered by `test/capture-artifact.test.mjs` against the compiled package:

```bash
npm test
```

The project test command builds first, then uses Node's built-in test runner.

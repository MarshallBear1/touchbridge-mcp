# Changelog

Notable changes to TouchBridge are documented here.

The project follows [Semantic Versioning](https://semver.org/) while keeping in mind that pre-1.0 releases may still change interfaces.

## Unreleased

- Bound and validate MCP action payloads and batch sizes.
- Redact text-bearing key results and fail unsupported physical HID actions explicitly.
- Fix physical WDA accessibility hit-testing.
- Probe WDA through the CoreDevice tunnel used by setup.
- Add a non-destructive physical-device smoke command.
- Harden temporary screenshot storage and document pixel-level privacy limits.
- Pin WebDriverAgent setup to a published release.
- Resolve signing teams from an explicit override or a previously successful WDA profile instead of guessing across multiple certificates.

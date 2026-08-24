# Contributing to TouchBridge

Thanks for helping improve TouchBridge.

## Development setup

```bash
npm ci
npm run check
npm audit --omit=dev
npm run smoke:package
```

Node.js 20.17 is the minimum supported runtime. CI also tests Node.js 22 on macOS.

## Change guidelines

- Keep each pull request focused on one behavior.
- Preserve simulator and physical-device paths unless a change explicitly documents a compatibility break.
- Validate and bound every value received from an MCP caller.
- Never log typed text, passwords, raw accessibility values, or screenshot content.
- Treat screenshots as sensitive even when accessibility metadata is redacted.
- Return an explicit error for unsupported device actions; never report a false success.
- Add a regression test for every correctness or privacy fix.
- Update the README when setup, capabilities, limitations, or security boundaries change.

## Physical-device changes

Automated tests must not depend on a connected phone. When a change affects WebDriverAgent or physical-device routing, run the opt-in read-only smoke test:

```bash
npm run smoke:physical -- --udid <physical-device-udid>
```

Describe the device model, iOS version, Xcode version, and exact smoke result in the pull request. Do not attach private screenshots.

## Pull requests

Before requesting review:

1. Rebase on the current `main` branch.
2. Run the four development checks above.
3. Summarize the user-visible behavior and rollback path.
4. Call out any device state changed by manual testing.

Security-sensitive findings should follow [SECURITY.md](SECURITY.md), not the public issue tracker.

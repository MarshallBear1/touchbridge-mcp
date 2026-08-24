# Security policy

## Supported versions

TouchBridge is currently pre-1.0. Security fixes are applied to the latest code on `main`; older commits and third-party forks are not maintained.

## Reporting a vulnerability

Please use [GitHub's private vulnerability reporting flow](https://github.com/MarshallBear1/touchbridge-mcp/security/advisories/new). Include:

- the affected commit or version;
- the macOS, Xcode, Node.js, and iOS versions involved;
- a minimal reproduction;
- the expected impact;
- whether screenshots, accessibility data, typed text, credentials, or device control are exposed.

Do not put secrets, private screenshots, device identifiers, or exploit details in a public issue. If private reporting is unavailable, open a public issue containing only a request for a private contact channel.

## Security boundaries

- TouchBridge is a local MCP server and is not a sandbox.
- An authorized MCP host can observe the active screen and perform device actions.
- Screenshot pixels are unredacted; only structured UI metadata and typed-text result messages receive automatic redaction.
- WebDriverAgent is a third-party test runner that must be signed and installed on physical devices.
- The loopback viewer is local-only, but any local process running as the same user may be able to access local files created by TouchBridge.

Please review these boundaries before using TouchBridge with production accounts or regulated data.

# Security Policy

## Supported versions

Nanobox is pre-release (v0.x). Security fixes land on `main` only; there is no
long-term-support branch yet.

| Version | Supported |
|---|---|
| 0.x (main) | ✅ |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately via GitHub's [Security Advisories](https://github.com/AagamS06/Nanobox/security/advisories/new)
for this repository, or email the maintainer directly at the address listed on
the [GitHub profile](https://github.com/AagamS06).

Include:
- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version/commit

You should expect an initial response within 5 business days. Confirmed
vulnerabilities will be patched and disclosed once a fix is available.

## Scope notes specific to Nanobox

- **Secrets**: OAuth tokens for music/calendar integrations are stored in the
  OS keychain via Tauri's secure store — never in SQLite or plaintext files.
  Report any code path that writes tokens outside this store.
- **Widget sandbox**: user-authored "lego block" widget code runs in an
  isolated JS realm with no direct access to `window`, `document`, `fetch`,
  or Tauri APIs. Sandbox escapes are treated as critical severity.
- **Local data**: notes and settings are stored locally in SQLite. Nanobox
  does not transmit user data off-device unless the user explicitly connects
  an integration (Spotify, Google Calendar, etc.).

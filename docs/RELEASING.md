# Releasing Nanobox

How a version goes from `main` to a downloadable, auto-updating release.

There are two separate kinds of signing, and it's easy to mix them up:

| Signing | What it's for | Status |
|---|---|---|
| **Updater signature** (Tauri minisign key) | Lets the in-app updater prove an update came from you before installing it | ✅ Wired up, needs the one-time key setup below |
| **Windows Authenticode** | Removes the SmartScreen "unknown publisher" warning | ⏳ Applying to SignPath Foundation (free for OSS) |
| **Apple notarisation** | Removes the macOS "damaged app" / Gatekeeper prompt | ⏳ Needs Apple Developer Program membership |

The updater works without the other two. Users just see the OS warning on
the *first* install; later updates install in place.

---

## 1. One-time setup: updater key

Do this once, on your own machine. The private key must never be committed.

```bash
npm run tauri signer generate -- -w ~/.tauri/nanobox.key
```

It asks for a password (recommended) and prints a **public key**.

1. Paste the public key into `src-tauri/tauri.conf.json` →
   `plugins.updater.pubkey`, replacing `REPLACE_WITH_UPDATER_PUBLIC_KEY`.
   Commit that change; the public key is meant to be public.
2. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `~/.tauri/nanobox.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password you chose (skip if none)
3. Back up `~/.tauri/nanobox.key` and its password somewhere safe (password
   manager). **If you lose it, every installed copy of Nanobox can no longer
   auto-update** — users would have to reinstall manually.

The release workflow refuses to run until both of these are in place, with
an error that points back here.

## 2. Cutting a release

1. Bump the version in **all three** places (they must match):
   - `package.json` → `version`
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `[package] version`
2. Add a short "what's new" entry to `PROGRESS.md`.
3. Commit, then tag and push:
   ```bash
   git commit -am "chore: release v0.2.0"
   git tag v0.2.0
   git push && git push --tags
   ```
4. `.github/workflows/release.yml` builds Windows (NSIS) and a universal
   macOS DMG, and attaches them plus `latest.json` to a **draft** release.
5. Open the draft on the Releases page, check the assets and notes, then
   click **Publish release**. Only then do installed copies see the update
   (the updater reads `/releases/latest/`, which skips drafts).

The tag must equal `v` + the version in `tauri.conf.json`, or the workflow
stops early and says so.

## 3. How users get updates

`src/core/updater.ts` checks ~15 seconds after launch (never in `tauri dev`).
If a newer published release exists, it asks once: **Install** downloads,
verifies the signature against the public key, installs, and restarts;
**Later** is remembered for that version, so it doesn't nag every launch.

## 4. Windows code signing (planned): SignPath Foundation

Microsoft's Artifact Signing (formerly Trusted Signing) only accepts
individual developers in the US and Canada, so it's not an option from
Australia. SignPath Foundation issues a free certificate to qualifying
open-source projects.

Before applying, make sure:
- The repo is public under an OSI-approved licence (MIT ✅).
- Releases are built entirely by CI from the public repo (✅ `release.yml`).
- MFA is on for your GitHub account (and later your SignPath account).
- The README carries their required credit line once accepted:
  *"Free code signing provided by SignPath.io, certificate by SignPath Foundation."*

Apply at https://signpath.org. Once accepted, the signing step slots into
`release.yml` between the build and the upload. One thing to sort out at that
point: the installer must be Authenticode-signed **before** the updater
signature (`.sig`) is generated, otherwise the `.sig` won't match the file
users download. Tauri's `bundle.windows.signCommand` hook is the likely place
to do this.

Expect SmartScreen warnings to fade gradually rather than vanish overnight:
an OV certificate builds reputation with download volume.

## 5. macOS signing (planned)

Needs an Apple Developer Program membership (paid, yearly). With it:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` go into repo secrets, and
`tauri-action` signs and notarises automatically. Until then, users open the
DMG via right-click → Open.

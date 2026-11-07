# XPPAUT for macOS (Electron)

The XPPAUT-Web page as a desktop app. It serves the built site (`../dist`)
from its own files, so it works offline and runs the fast JSPI WebAssembly
build. The same setup also builds Linux and Windows apps.

What the app adds to the page:

- `.ode` files open from Finder (double-click, "Open with", or drop on the
  Dock icon), and from **File → Open .ode file…** (⌘O).
- Exports and sessions are saved through the normal save dialog.
- Closing a window while XPP runs asks first.
- Web links open in the browser. XPP's pop-out windows stay in the app.

## Files

| File | What it is |
|---|---|
| `main.cjs` | The app (Electron main process) |
| `package.json` | Versions and the electron-builder config (dmg/zip, arm64 + x64, ad-hoc signing, `.ode` association) |
| `scripts/copy-site.mjs` | Copies `../dist` to `site/` (leaving out the videos and service worker) and the icon to `build/` |
| `test/smoke.mjs` | Smoke test (Playwright): launch, open lorenz.ode the Finder way, Initialconds → Go, export and check the data, screenshots in `smoke-out/` |
| `ci/macos-app.yml` | GitHub Actions workflow: builds the site, then the Mac apps, and smoke-tests them on Apple Silicon and Intel Macs |

## Run and test here (Linux)

```bash
cd ~/Downloads/XPPAUT-Android
npm run build:wasm && npm run build     # only when the site changed
cd MacOS-build
npm install
npm start                                # the app, from source
xvfb-run -a node test/smoke.mjs          # smoke test (no window needed)
npx electron-builder --linux dir         # packaged app: out/linux-unpacked/
XPP_APP=$PWD/out/linux-unpacked/xppaut xvfb-run -a node test/smoke.mjs
```

The Linux app is the same Chromium and the same code, so most problems show
up here. Things only a Mac shows: Finder/Dock opening, the menu bar, the
first-launch warning, and the `.dmg`.

## Build and test on GitHub's Macs

Mac apps cannot be built on Linux (they need Apple's `codesign`). The
workflow `ci/macos-app.yml` does it on GitHub's free macOS machines:

1. Copy it to `.github/workflows/macos-app.yml` in a repo that holds this
   code, and push.
2. Actions tab → **macOS app** → **Run workflow**.
3. On the run page, under Artifacts: the `.dmg`/`.zip` files and, for each
   Mac, the screenshots and `result.json` of the smoke test. The Apple Silicon
   job also opens the model with macOS's own `open` command (the real Finder
   path) and takes a screenshot of the whole screen.

It checks that the signature is intact (otherwise macOS says "XPPAUT is
damaged and can't be opened") and prints Gatekeeper's verdict, which is
expected to be "rejected": the app is not notarized.

## First launch on a Mac (not notarized)

The app is ad-hoc signed, not signed with an Apple Developer ID, so macOS
warns the first time:

1. Open the `.dmg` and drag XPPAUT to Applications.
2. Double-click XPPAUT. macOS says it cannot verify the app. Click **Done**.
3. **System Settings → Privacy & Security**, scroll down, **Open Anyway**,
   then confirm with your password. After that it opens normally.

If macOS says the app "is damaged", run this in Terminal once:
`xattr -dr com.apple.quarantine /Applications/XPPAUT.app`

Removing the warning needs the Apple Developer Program ($99/year) plus
notarization, which can be added to the workflow later.

## Not included

The Android voice control (it uses Android's speech services). The `.ode`
editor and voice code are on the Android folder only. The app contains
whatever `../dist` (here) or the repo's master (in the workflow) has.

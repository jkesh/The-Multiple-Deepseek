# Secure Update Architecture — Tauri App Embedding DeepSeek Harness + The-Multiple-Deepseek

Status: design / recommendation. Workspace grounding: `D:\test\TMD` is the source of the
`the-multiple-deepseek` (TMD) plugin (`package.json` version `0.1.0`, git-distributed,
committed `lib/` builds, `peerDependencies` on `@deepseek-ai/*`). Harness baseline:
`@deepseek-ai/dsh` **rc.6**. There is no Tauri scaffold in this workspace yet; the app
is greenfield and this document defines its update spine.

---

## 1. System model and the core decision

A Tauri app that "embeds/manages" DeepSeek Harness does not run dsh inside the Rust
process. It is three cooperating pieces:

1. **App shell** — the Rust binary + WebView frontend. Low-change, updated by Tauri's
   built-in updater.
2. **Harness runtime** — a child **Node.js process** running `@deepseek-ai/dsh` and its
   `node_modules`, plus Node itself. The WebView loads the dsh web GUI over
   `http://127.0.0.1:<port>` with a per-launch token; dsh injects `window.__DSH_BOOT__`
   and its module loader serves plugin **client** bundles.
3. **Plugins** — TMD and any other Cordis plugin. Host half runs inside the dsh process;
   client half (`lib/client.js`, which registers through `window.__ModuleLoader__`) is
   served by dsh from the profile.

The single most important design decision:

> **The app shell updates through the Tauri updater. dsh, Node, and every plugin update
> through a separately versioned, signed *runtime manifest* installed into an
> app-managed profile directory, never in place.**

Do **not** bundle dsh/TMD into the installer and re-release the whole app for every
plugin bump. That collapses three release cadences into one and destroys independent
plugin versioning. Instead, treat the harness+plugins like VSCode extensions/Obsidian
plugins: side-by-side versioned installs + an atomic pointer.

Because dsh and plugins are **not** independently compatible, the runtime manifest is
signed **as one coherent unit** — this prevents a "mix-and-match" attack or accident
where a new TMD is paired with an old dsh seam it does not match.

---

## 2. Component inventory and versioning

| Component | Where it lives | Version source | Update lane |
|---|---|---|---|
| Tauri shell (exe, dlls) | install dir (Program Files) | `Cargo.toml` + `tauri.conf.json` | Tauri updater, signed GitHub Release |
| Node runtime | `%LOCALAPPDATA%\TMD\runtime\versions\node\<v>\` | pinned in runtime manifest | runtime manifest |
| `@deepseek-ai/dsh` + deps | `%LOCALAPPDATA%\TMD\runtime\versions\dsh\<v>\` | `package.json` version + **contract version** | runtime manifest |
| Plugins (TMD, …) | `%LOCALAPPDATA%\TMD\runtime\versions\plugins\<name>\<v>\` | `package.json` version | runtime manifest |
| User profile (cordis.patch.yml, presets, settings, history) | `%LOCALAPPDATA%\TMD\profile\` (stable path) | n/a — user data | never clobbered; migrated additively |

Every version directory is **immutable** after install. The only mutable state is the
small pointer/state files at the top level.

---

## 3. Trust and key model

Three keys, kept separate so a compromise in one lane cannot pivot to another:

- **`app_key`** — Ed25519 (minisign) for the Tauri updater. Public half baked into the
  binary at build time. Used by `tauri sign`.
- **`runtime_root_key`** — offline Ed25519, signs `root.json` (TUF-lite root of trust).
  Embedded in the app at build time.
- **`runtime_targets_key`** — online/CI Ed25519, signs the runtime manifest. Referenced
  and (optionally) rotatable by `root.json`.

Use TUF-lite semantics: a `root.json` (pinned in the installer) delegates to a
`targets.json` (the runtime manifest) that lists per-artifact `sha256` + `length`. One
signature over the manifest transitively covers every artifact hash.

Never ship private keys. CI signing uses an OIDC-authenticated signer (or a locked-down
GitHub Actions secret); `root.json` rotation is a manual, offline operation.

---

## 4. Signed GitHub Releases

- App lane: GitHub Release holds the platform bundles + `latest.json` for the Tauri
  updater. `latest.json` → `{ version, notes, pub_date, platforms: { "windows-x86_64":
  { signature, url } } }`. Signature is the `tauri sign` `.sig` over the installer.
- Runtime lane: GitHub Release (or a stable download URL) holds the signed
  `runtime-manifest.json` plus immutable artifact tarballs (`.tgz`/`.zip`). Artifacts are
  hash-addressed so a re-published file under the same version is detected immediately.

**Pin, do not float.** The current TMD install path is a mutable git ref
(`github:jkesh/The-Multiple-Deepseek`, README line 26). The updater manifest must pin an
immutable **commit hash** or tarball digest — never a branch or tag that can move after
review.

---

## 5. Runtime manifest schema (signed `targets.json`)

```jsonc
{
  "schemaVersion": 1,
  "channel": "stable",            // stable | beta | rc  (rc.6 stays on rc/beta unless opted in)
  "version": 23,                  // monotonic counter — anti-rollback
  "generatedAt": "2025-01-01T00:00:00Z",
  "minAppVersion": "0.1.0",       // shell ↔ runtime compatibility gate
  "targets": {
    "node": {
      "version": "22.11.0",
      "url": "https://…/node-v22.11.0-win-x64.zip",
      "sha256": "…", "size": 12345678
    },
    "dsh": {
      "name": "@deepseek-ai/dsh",
      "version": "0.0.0-rc.6",
      "contract": "web@2",        // runtime contract, read back from installed code
      "url": "https://…/dsh-0.0.0-rc.6.tgz",
      "sha256": "…", "size": 9876543
    },
    "plugins": [
      {
        "name": "the-multiple-deepseek",
        "version": "0.1.0",
        "source": "github:jkesh/The-Multiple-Deepseek#<immutable-sha>",
        "url": "https://…/the-multiple-deepseek-0.1.0.tgz",
        "sha256": "…", "size": 7654321,
        "requiresDsh": ">=0.0.0-rc.6",     // semver intersection, secondary to contract
        "requiresContract": "web@2"         // hard gate; bump when dsh seams change
      }
    ]
  }
}
```

Envelope for the signature (payload = base64url of canonical JSON, RFC 8785 JCS):

```jsonc
{ "payload": "…", "signatures": [{ "keyId": "runtime-targets-2025", "sig": "…" }] }
```

Verification order (see §8): signature → counter monotonic → per-artifact `sha256` →
install into version dir → **read contract back from the installed code** → gate →
activate.

---

## 6. Filesystem layout and atomic staging / rollback

```
%LOCALAPPDATA%\TMD\
├── root.json                      # embedded at build time, also cached here
├── state.json                     # counter, current/previous/lastKnownGood, decision log
├── manifests\<version>.json       # every accepted signed manifest (tamper-evident)
├── profile\                       # DSH_HOME — stable path across versions, user data
├── runtime\
│   ├── versions\
│   │   ├── node\<v>\…             # immutable
│   │   ├── dsh\<v>\…              # immutable: package + node_modules
│   │   └── plugins\<name>\<v>\…   # immutable plugin install
│   ├── current.json               # tiny pointer { node, dsh, plugins } — the swap unit
│   ├── pending.json               # written before swap, removed after commit/rollback
│   └── staging\<txn-id>\…         # in-progress downloads, fsync'd before swap
```

Transaction (all three lanes share it):

1. Download to `staging\<txn-id>\`, stream-hash to verify `sha256` **before** unpacking
   into `versions\`.
2. Unpack into a **new** `versions\…\<v>` directory. Never touch an existing version dir.
3. Verify installed `package.json` `name`/`version` and (for dsh) read back the
   `contract` from the installed code — do not trust manifest metadata alone.
4. Write `pending.json` (temp + rename), run compatibility gates + migrations against the
   candidate using a **copy-on-write profile** or a dedicated `--profile` scratch dir.
5. Stop the dsh process tree (§7), atomically rewrite `current.json` (temp + rename →
   `ReplaceFile`), start new dsh, run smoke test.
6. **Commit**: update `state.json` (temp + rename), drop `pending.json`. **Rollback**:
   flip `current.json` back to `previous`, restart previous, record the failure.

Crash safety comes from the fact that `current.json` is a tiny single atomic rename:
after a crash at any point, boot sees either old or new pointer, and `pending.json`
presence means "finalize the pending install before starting dsh, or roll back if its
smoke test never committed."

Rollback policy vs anti-rollback: automatic updates require
`manifest.version > state.counter`. Rollback to a **previously installed** version is
always allowed locally (its signed manifest is on disk in `manifests\`) — this keeps the
"boot failed → go back to last known good" path working without opening a network-driven
downgrade.

---

## 7. Windows process and file locking

The lock problem is real and specific: dsh is a Node.js ESM process; Windows keeps
mapped `.js`/`.exe`/`.node`/`.dll` files open, and TMD spawns **child subagents**
(`ctx.subagents` spawn/fork) plus background jobs — orphaned grandchildren are the
classic cause of a failed swap.

- **Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.** Launch the dsh sidecar
  inside one; closing the job kills the whole tree, no `taskkill /T` race. This is the
  authoritative stop mechanism, not a fallback.
- **Never mutate a live version directory.** Swap is a pointer rename
  (`ReplaceFile`/`MoveFileEx`), not a file overwrite. If a stray handle still blocks the
  rename (antivirus scan, Defender, a misbehaving plugin), retry with backoff and, on
  final failure, leave `pending.json` and complete the swap on next boot **before** dsh
  starts — the same install-on-next-launch pattern Tauri uses.
- **pnpm content-addressable store.** If dsh installs with pnpm, its files are hardlinks
  into a shared store. Do not delete the store while a version references it; reference-count
  or make the store grow-only and GC it only while the runtime is stopped and no pointer
  targets it.
- **Stop order:** graceful dsh shutdown (IPC/port) → timeout → close job object → wait
  for exit → swap → start. Never swap first and kill after.
- **WebView2:** use the Evergreen runtime; do not self-manage or self-update it from the
  app (the Tauri updater + system handle it).
- **Node itself** is a versioned runtime component. Pin the exact version + hash; never
  use system `node.exe` (uncontrolled version = uncontrolled peer resolution).

---

## 8. Integrity and signature verification pipeline

Applied to **every** artifact before it can become `current`:

1. `root.json` → `runtime_targets_key` public key (embedded at build time; no TOFU over
   the network for the root itself).
2. Manifest envelope signature → Ed25519 verify (`ed25519-dalek` in Rust, or Node
   `crypto.verify`).
3. `manifest.version > state.counter` (automatic install) and `channel` matches the
   user's channel (rc/beta is opt-in — an rc.6 baseline must not silently roll to
   rc.10 as "latest").
4. `minAppVersion` gate against the running shell.
5. Per-artifact `sha256` + `size`, verified during streaming download, **before**
   unpack.
6. Post-unpack: installed `name`/`version` match the manifest, and dsh's runtime
   `contract` is read back from code and matched to every plugin's `requiresContract`.
7. Composition gate (§9) + smoke test → only then commit the pointer.

App-lane equivalent: the Tauri updater verifies the `tauri sign` signature against the
baked-in pubkey; the binary is also Authenticode-signed so Windows SmartScreen/AppLocker
see a valid publisher.

---

## 9. Migration and compatibility gates

The fragility is structural: TMD depends on **internal** `@deepseek-ai/dsh-*` seams
(`subagents`, `llm`, `tools`, `commands`, `settings`, `systemPrompt`, `jobs`) and
declares `"*"` peer ranges (TMD `package.json` lines 27–39). Semver alone cannot capture
whether `ctx.subagents` still exposes `capabilities.persona` after a dsh bump. So:

- **Add a runtime contract version to dsh** (a stable exported symbol or
  `package.json` `dsh.contract`), bumped deliberately when a seam changes. The updater
  reads it back from the installed code, so the gate is checked against the *actual*
  bytes, not metadata.
- **TMD declares `requiresContract`/`requiresDsh`** in the manifest entry. Evaluation is
  the intersection of contract version + semver range, run **before** activation.
- **Migrations** are per-version, additive, reversible scripts keyed by dsh version:
  - profile dir (`%LOCALAPPDATA%\TMD\profile\`) is **version-independent** and never
    deleted or rewritten wholesale;
  - destructive migrations back up to `profile\backups\<v>-<ts>\` first;
  - migrations run against a scratch/copy-on-write profile, not the live one.
- **Smoke gate before commit:** start candidate dsh → `--dump-config` succeeds → every
  mounted plugin row loads without error → contract version matches. Optionally run
  TMD's `resolveRoster()` as a no-op unit probe. Any failure → rollback to `previous`.

This gate is what turns "dsh rc.6 → rc.7 broke TMD" from a bricked desktop app into a
non-committed candidate that never becomes `current`.

---

## 10. Offline behavior

- The app is **fully local after install**: Node, dsh, and plugins live on disk; nothing
  phones home at startup. An update check never blocks launch.
- Update checks run in the background on an interval (or only on user demand); on no
  network, keep the current version and show "last checked N days ago" — no error path.
- First run must work with no network: ship the installer with a **bundled signed
  manifest + artifact tarballs** (or at least the signed manifest and the current
  `root.json`), so trust bootstrap and the initial install are offline-capable.
- Air-gapped/enterprise (later phase): `update --import bundle.zip` imports a signed
  manifest + artifacts from local media and verifies them with the same embedded keys.

---

## 11. Release CI

Three source repos + one aggregator; the manifest is the integration point.

- **dsh repo:** npm publish → produce tarball → `sha256` → SLSA/attestation → publish a
  signed *entry* (version + contract + hash).
- **TMD repo:** run the build from `src/` in CI (do **not** trust the committed `lib/`
  alone — see §12), `pnpm pack` → tarball → `sha256` → attestation → signed entry pinning
  the immutable commit.
- **App repo:** `tauri build` (Windows MSI/NSIS) → Authenticode sign → `tauri sign`
  (Ed25519) → GitHub Release + `latest.json`; `createUpdaterArtifacts: true` in
  `tauri.conf.json`; publish via `tauri-apps/tauri-action`.
- **Aggregator job** (own repo or the app repo's release workflow): composes
  `targets.json` from the three entries, verifies each entry's provenance/attestation,
  assigns the monotonic counter, signs with the targets key, publishes
  `runtime-manifest.json` + artifacts to a stable URL and a GitHub Release.

CI hardening: branch protection + required checks on all three repos; OIDC-authenticated
signing (no long-lived PAT with write access doing the signing); targets key rotates on a
schedule, root key is offline; artifacts are hash-addressed so a later compromise of any
single repo cannot republish different bytes under an already-referenced version.

---

## 12. Threat model and adversarial notes

| Threat | Mitigation |
|---|---|
| Repo/token compromise pushes a malicious update | signing keys are separate from publish tokens; targets key limits blast radius; root key offline |
| MITM substitutes a download | Ed25519 signature + sha256, both independent of TLS |
| Rollback attack (replay old manifest) | monotonic `version` counter; local rollback only to previously-seen versions with on-disk signed manifests |
| Mix-and-match incompatible dsh+plugin set | manifest is signed as a coherent unit; per-plugin `requiresContract` gate |
| Mutable git ref (`github:…` default branch) | manifest pins immutable commit hash / tarball digest |
| **TMD `"*"` peer ranges + internal seams break silently** | contract-version gate + post-install smoke before commit (the highest-probability real failure) |
| **Committed `lib/` drift from `src/`** (README: "lib/ is a committed build so git installs need no prepare script") | CI builds `lib/` from `src/`, verifies the committed `lib/` matches (or signs only the CI-built artifact); integrity covers the shipped `lib/*.js` bytes, never source assumed to equal build |
| dsh localhost GUI hijacked by another local process/website | bind `127.0.0.1` only, random port, per-launch bearer token, Tauri navigation allowlist + CSP; no devtools in prod |
| Orphaned subagent/job processes block or survive an update | Job Object with kill-on-close |
| Local attacker with write access to app data dir | out of scope (they own the app then); `state.json` + `manifests\` remain tamper-evident via stored signatures |
| WebView2 / AV locking staged files | swap-on-next-boot retry path, backoff, never mutate live dirs |

---

## 13. Recommended minimal first implementation (MVP)

The smallest end-to-end slice that proves signed, atomic, rollback-capable updates on all
three lanes without inventing everything at once.

**M1 — app shell updater (off-the-shelf, no custom code):**
- Scaffold the Tauri app; add `tauri-plugin-updater`, bake in an Ed25519 pubkey,
  `endpoints` → GitHub Release `latest.json`, `createUpdaterArtifacts: true`, NSIS
  `installMode: "passive"`; publish `latest.json` + `tauri sign` `.sig` in CI.

**M2 — signed runtime manifest + keys (the spine):**
- Define the §5 schema; implement `sign`/`verify` for the envelope (Rust `ed25519-dalek`
  + `sha2`, or Node `crypto` for a small CLI); generate root + targets keys; embed the
  root pubkey in the app.
- `state.json` with monotonic counter + decision log.

**M3 — runtime manager (Rust, inside the Tauri app):**
- Download→stagedir→hash→unpack into `versions\`; pointer swap via `current.json`;
  dsh sidecar launched in a Job Object; stop→swap→start→`--dump-config` smoke→commit or
  rollback. This is the one genuinely new component.

**M4 — dsh lane:**
- Add a runtime `contract` version to dsh (exported symbol read back after install);
  publish a versioned tarball + `sha256` + signed entry.

**M5 — TMD lane:**
- Pin the immutable commit, publish `pnpm pack` tarball + `sha256` + signed entry;
  declare `requiresDsh`/`requiresContract`; build `lib/` from `src/` in CI and verify
  the committed `lib/` matches.

**M6 — bootstrap + offline:**
- `DSH_HOME` → `%LOCALAPPDATA%\TMD\profile\`; bundle root key + signed manifest (and
  ideally the initial artifacts) in the installer; update checks are background,
  non-blocking, with a "last checked" surface.

Deliberately deferred: TUF target delegation graph, air-gapped import UI, in-app
channel/rollback UX, multi-platform signatures, plugin dependency resolution beyond a
flat list, and Enterprise policy/AppLocker integration.

---

## 14. Open decisions to confirm before coding

1. Does dsh already expose a stable contract/version surface (the `dsh` field on TMD's
   `package.json` lines 40–49 suggests the loader already keys on client injects — is
   there a host-side equivalent to formalize)?
2. NSIS vs MSI installer (NSIS allows `basicUi`/`passive`; MSI only `passive`), and
   whether silent auto-update or user-confirmed is required.
3. Which Node is authoritative — bundled-in-installer (simplest MVP) vs manifest-managed
   (adds a node update lane but keeps Node patchable independently).
4. Whether the aggregator lives in the app repo or a dedicated `tmd-release` repo.

# FoldOps packaging for Folding-OS

Reference Buildroot packages and install layout for [pacificnm/folding-os](https://github.com/pacificnm/folding-os) Milestone 3.

The foldops repo ships **source + tagged releases**; the folding-os repo **builds images** that install binaries, systemd units, env templates, and dashboard assets.

See [docs/folding-os.md](../../docs/folding-os.md) for paths and configuration.

---

## Copy into folding-os

```text
folding-os/build/packages/
  foldops-common.mk          ← from packaging/folding-os/buildroot/foldops-common.mk
  foldops-agent/
    Config.in                ← from packaging/folding-os/buildroot/foldops-agent/
    foldops-agent.mk
  foldops-supervisor/
    Config.in                ← from packaging/folding-os/buildroot/foldops-supervisor/
    foldops-supervisor.mk
```

Wire the menu in your external tree `Config.in` (adjust path macro):

```text
source "build/packages/foldops-agent/Config.in"
source "build/packages/foldops-supervisor/Config.in"
```

Set in defconfig / `local.mk`:

```makefile
BR2_PACKAGE_FOLDOPS_AGENT=y
# Supervisor node only:
BR2_PACKAGE_FOLDOPS_SUPERVISOR=y
BR2_FOLDOPS_CARGO_OFFLINE=y
FOLDOPS_VERSION = 0.1.0
TARGET_RUSTC = x86_64-unknown-linux-gnu
```

`TARGET_RUSTC` must match the folding-os Rust toolchain target triple.

---

## folding-os integration checklist

1. Copy packages from this directory into `folding-os/build/packages/`.
2. Ensure Buildroot provides `host-cargo`, `host-rust`, target `openssl`, and `sqlite`.
3. Pin `FOLDOPS_VERSION` to a [foldops release tag](https://github.com/pacificnm/foldops/tags).
4. For offline builds, vendor deps before tagging or use CI release tarballs (see below).
5. Image post-build: copy `agent.env.example` / `supervisor.env.example` to `/etc/foldops/*.env` with real secrets (not committed).
6. Enable units per profile:
   - **Worker:** `foldops-agent.service`
   - **Supervisor node:** `foldops-agent.service` + `foldops-supervisor.service`
7. QEMU smoke test: agent ingest, dashboard on `:3000`.

---

## Release flow (foldops repo)

```bash
# 1. Vendor Cargo deps for offline Buildroot (optional but recommended)
./scripts/vendor-rust-deps.sh

# 2. Build dashboard + Rust binaries + release tarball
./scripts/build-folding-os-artifacts.sh

# 3. Tag and push (CI uploads GitHub Release assets)
git tag v0.1.0
git push origin v0.1.0
```

CI (`.github/workflows/rust.yml`) on `v*` tags builds:

- `foldops-agent`, `foldops-supervisor` (x86_64 gnu)
- React `apps/supervisor/web/dist`
- `foldops-<version>-folding-os.tar.xz` source bundle with `dist/` included

Bump `FOLDOPS_VERSION` in folding-os when integrating a new tag.

---

## Install layout (target rootfs)

| Path | Package |
|------|---------|
| `/usr/bin/foldops-agent` | foldops-agent |
| `/usr/bin/foldops-supervisor` | foldops-supervisor |
| `/usr/share/foldops/web/` | foldops-supervisor |
| `/usr/lib/systemd/system/foldops-*.service` | both |
| `/etc/foldops/*.env.example` | both |
| `/usr/lib/sysusers.d/foldops.conf` | foldops-supervisor |
| `/usr/lib/tmpfiles.d/foldops.conf` | foldops-supervisor |

Runtime secrets: `/etc/foldops/agent.env`, `/etc/foldops/supervisor.env`.

---

## Image profiles

| Profile | Packages | systemd |
|---------|----------|---------|
| FAH worker | `foldops-agent` | `foldops-agent` |
| Supervisor / fah-01 | `foldops-agent` + `foldops-supervisor` | both |

FoldOps failure must not block boot or FAH folding (see folding-os `doc/foldops-integration.md`).

---

## Apt repository (recommended for farms)

Official signed repo: **https://deb.folding-os.com**

Seed images with the keyring and source entry so nodes can install on first boot:

```bash
curl -fsSL https://deb.folding-os.com/foldops-archive-keyring.gpg \
  | gpg --dearmor -o /usr/share/keyrings/foldops.gpg

tee /etc/apt/sources.list.d/foldops.list <<'EOF'
deb [signed-by=/usr/share/keyrings/foldops.gpg] https://deb.folding-os.com stable main
EOF
```

| Profile | `apt install` |
|---------|----------------|
| FAH worker | `foldops-agent` |
| Supervisor | `foldops-agent foldops-supervisor` |

Configure `/etc/foldops/*.env` from package examples before `systemctl enable`. See [docs/installation.md](../../docs/installation.md#production-deployment-apt) and [`packaging/deb/README.md`](../deb/README.md).

---

## Updates

Folding-OS appliances do **not** use `scripts/update-agent.sh`.

**Preferred for FoldOps-only updates:**

```bash
apt update
apt install --only-upgrade foldops-agent foldops-supervisor foldops-web
```

Maintainers publish with `npm run build:debs`, `npm run build:apt-repo:signed`, `npm run sync:apt-repo:r2`.

Buildroot compile-from-source (above) is still valid for **initial image** seeding; ongoing FoldOps releases should use the apt repo.

The supervisor **Deploy** UI (`POST /api/deploy/agents`) remains for legacy Debian git-checkout farms only.

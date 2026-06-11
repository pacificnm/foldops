# FoldOps Debian packages

Install and upgrade FoldOps on Folding-OS (or any Debian-based node) **without reflashing the OS image**.

Official apt repository: **https://deb.folding-os.com**

---

## Farm nodes — install and configure

### 1. Enable the repository

```bash
curl -fsSL https://deb.folding-os.com/foldops-archive-keyring.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/foldops.gpg

sudo tee /etc/apt/sources.list.d/foldops.list <<'EOF'
deb [signed-by=/usr/share/keyrings/foldops.gpg] https://deb.folding-os.com stable main
EOF

sudo apt update
```

### 2. Install packages

```bash
# Every FAH node
sudo apt install foldops-agent

# Supervisor node (fah-01) — pulls in foldops-web
sudo apt install foldops-supervisor
```

### 3. Configure and start

Packages ship env **templates** only — services are not auto-enabled.

```bash
sudo cp /etc/foldops/agent.env.example /etc/foldops/agent.env
# edit SUPERVISOR_URL and AGENT_TOKEN (must match supervisor INGEST_TOKEN)
sudo chmod 600 /etc/foldops/agent.env
sudo systemctl enable --now foldops-agent
```

On the supervisor host:

```bash
sudo cp /etc/foldops/supervisor.env.example /etc/foldops/supervisor.env
# edit INGEST_TOKEN; WEB_ROOT=/usr/share/foldops/web is set in the example
sudo chmod 600 /etc/foldops/supervisor.env
sudo systemctl enable --now foldops-supervisor
```

Full variable reference: [docs/configuration.md](../../docs/configuration.md). Step-by-step farm setup: [docs/installation.md](../../docs/installation.md#production-deployment-apt).

### 4. Upgrade

```bash
sudo apt update
sudo apt install --only-upgrade foldops-agent foldops-supervisor foldops-web
```

---

## Packages

| Package | Architecture | Contents |
|---------|--------------|----------|
| `foldops-agent` | `amd64` | Rust agent binary, systemd unit, `/etc/foldops/agent.env.example` |
| `foldops-web` | `all` | React dashboard at `/usr/share/foldops/web/` |
| `foldops-supervisor` | `amd64` | Rust supervisor binary, systemd unit, sysusers/tmpfiles, env example; **depends on `foldops-web` same version** |

---

## Build (foldops repo)

```bash
npm run build:debs
# → target/debian/foldops-{agent,supervisor}_*_amd64.deb
# → target/debian/foldops-web_*_all.deb
```

Requires `cargo-deb` (installed automatically by the script) and `dpkg-deb`.

CI attaches `.deb` files to GitHub Releases on `v*` tags.

---

## Apt repository layout

Only these paths are public on R2 / `deb.folding-os.com`:

```text
dists/stable/
  InRelease
  Release
  Release.gpg
  main/binary-amd64/Packages.gz
pool/main/
  f/foldops-agent/foldops-agent_0.1.0-1_amd64.deb
  f/foldops-supervisor/foldops-supervisor_0.1.0-1_amd64.deb
  f/foldops-web/foldops-web_0.1.0_all.deb
foldops-archive-keyring.gpg
```

Build-time only (do **not** upload): `conf/`, `db/`

---

## Signing key

Official repo public key: [`foldops-archive-keyring.gpg`](foldops-archive-keyring.gpg) (same as repo root `gpg.key`).

| | |
|--|--|
| Key id | `8BC95492` |
| Fingerprint | `42E02FBEF6C5B7E8983D4EEECC57F8008BC95492` |
| Identity | FoldingOS Package Signing `<security@folding-os.com>` |

- **Public key** — committed in `packaging/deb/foldops-archive-keyring.gpg` (farm nodes + R2).
- **Secret key** — must be in your local gpg keyring to sign; **never** commit private keys.

---

## Publish to deb.folding-os.com (maintainers)

### Build signed repo

```bash
sudo apt install reprepro gnupg

# secret key must already be imported
gpg --list-secret-keys 8BC95492

npm run build:debs
npm run build:apt-repo:signed
# uses key 8BC95492 by default; override with APT_SIGNING_KEY=...
```

### Upload to Cloudflare R2

Configure `rclone` with an R2 remote named `r2` (see `scripts/upload-apt-repo-r2.sh`).

```bash
npm run sync:apt-repo:r2
# defaults R2_BUCKET=foldops-apt; override with R2_BUCKET=other npm run sync:apt-repo:r2
```

Upload order: `pool/` → package indices → `Release` / `InRelease` last, so apt never sees mismatched metadata mid-sync.

### After upload

1. Purge Cloudflare cache for `https://deb.folding-os.com/dists/` (apt errors “mirror sync in progress” when CDN serves stale `Packages.gz`).
2. On a test node: `sudo apt update && apt policy foldops-agent`.

### Unsigned vs signed

| Script | Tool | Signing | Use |
|--------|------|---------|-----|
| `build-apt-repo.sh` | apt-ftparchive | No | Quick local test, `[trusted=yes]` |
| `build-apt-repo-signed.sh` | reprepro | Yes | **Production** / R2 |

**Note:** apt cannot `install https://…/foldops-agent.deb` directly for upgrades with dependencies — it needs the `Packages` index under `dists/`.

---

## Image / local mirrors

Bake the same `sources.list` into Folding-OS images, or use a local mirror:

```text
# /etc/apt/sources.list.d/foldops.list
deb [signed-by=/usr/share/keyrings/foldops.gpg] https://deb.folding-os.com stable main
# embedded mirror:
# deb [trusted=yes] file:/srv/apt/foldops stable main
```

| Profile | `apt install` |
|---------|----------------|
| FAH worker | `foldops-agent` |
| Supervisor (fah-01) | `foldops-agent foldops-supervisor` |

Pin versions at image build time if needed:

```bash
apt install foldops-agent=0.1.0-1 foldops-supervisor=0.1.0-1
```

---

## Relation to Buildroot packages

`packaging/folding-os/buildroot/` compiles from source into the rootfs — useful for **initial image** builds.

**`.deb` + apt** is the recommended path for **ongoing FoldOps updates** without OS redeploy. folding-os can:

- Seed the image with the apt source + pinned versions at build time, or
- Replace Buildroot compile packages with “install from `deb.folding-os.com`” in image recipes.

Both layouts install the same files under `/usr/bin`, `/usr/share/foldops/web`, etc.

---

## Upgrade flow

1. Tag foldops `v0.2.0` → build debs, signed repo, `npm run sync:apt-repo:r2`.
2. Purge Cloudflare cache for `/dists/`.
3. On each node: `apt update && apt upgrade foldops-agent` (and supervisor/web on fah-01).
4. `postinst` runs `daemon-reload`; `prerm` stops services before file replace.

No full OS image flash required for FoldOps-only changes.

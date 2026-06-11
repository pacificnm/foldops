# FoldOps Debian packages

Install and upgrade FoldOps on Folding-OS (or any Debian-based node) **without reflashing the OS image**.

```bash
sudo apt update
sudo apt install foldops-agent              # every FAH node
sudo apt install foldops-supervisor         # supervisor node (pulls in foldops-web)
```

```bash
sudo apt install --only-upgrade foldops-agent foldops-supervisor foldops-web
```

---

## Packages

| Package | Architecture | Contents |
|---------|--------------|----------|
| `foldops-agent` | `amd64` | Agent binary, systemd unit, `/etc/foldops/agent.env.example` |
| `foldops-web` | `all` | React dashboard at `/usr/share/foldops/web/` |
| `foldops-supervisor` | `amd64` | Supervisor binary, systemd unit, sysusers/tmpfiles, env example; **depends on `foldops-web` same version** |

Services are **not** auto-enabled on install. Copy env examples and enable after configuration:

```bash
sudo cp /etc/foldops/agent.env.example /etc/foldops/agent.env
# edit tokens/URLs
sudo systemctl enable --now foldops-agent
```

---

## Build (foldops repo)

```bash
./scripts/build-debs.sh
# → target/debian/foldops-{agent,supervisor}_*_amd64.deb
# → target/debian/foldops-web_*_all.deb
```

Requires `cargo-deb` (installed automatically by the script) and `dpkg-deb`.

CI attaches `.deb` files to GitHub Releases on `v*` tags.

---

## Apt repository on Folding-OS

Bake a local repo into the image so nodes can `apt upgrade` FoldOps independently of OS updates.

### 1. Publish debs (foldops CI)

Release tag `v0.1.0` produces:

- `foldops-agent_0.1.0-1_amd64.deb`
- `foldops-supervisor_0.1.0-1_amd64.deb`
- `foldops-web_0.1.0_all.deb`

### 2. Create repo

```bash
npm run build:debs
./scripts/build-apt-repo.sh
# → packaging/apt-repo/{pool,dists}/...
```

### 3. Host on Cloudflare R2 (recommended for remote farms)

R2 is S3-compatible static hosting. apt needs the **repository layout** (`dists/`, `pool/`), not raw `.deb` URLs.

1. **Build and upload**

   ```bash
   npm run build:debs
   npm run build:apt-repo
   R2_BUCKET=foldops-apt ./scripts/upload-apt-repo-r2.sh
   ```

   Configure `rclone` with a Cloudflare R2 remote (see `scripts/upload-apt-repo-r2.sh`).

2. **Public HTTPS URL**

   - R2 → bucket → **Settings** → connect a **custom domain** (e.g. `apt.yourdomain.com`), or
   - Enable public access on the bucket prefix (less ideal; custom domain is better for apt).

3. **Farm node** — `/etc/apt/sources.list.d/foldops.list`

   ```text
   deb [trusted=yes] https://apt.yourdomain.com stable main
   ```

   ```bash
   sudo apt update
   sudo apt install foldops-agent
   sudo apt install --only-upgrade foldops-agent foldops-supervisor foldops-web
   ```

   `[trusted=yes]` skips GPG verification — fine for a private bucket you control. For production, sign the repo with `reprepro` and use `[signed-by=...]`.

4. **Publish flow after each release**

   ```bash
   npm run build:debs
   npm run build:apt-repo
   R2_BUCKET=foldops-apt ./scripts/upload-apt-repo-r2.sh
   ```

   Nodes pick up new versions on `apt update` (no OS reflash).

**Note:** apt cannot `install https://bucket.../foldops-agent.deb` directly for upgrades with dependencies — it needs the `Packages` index under `dists/`.

### 4. Local / image-embedded mirror

```text
# /etc/apt/sources.list.d/foldops.list
deb [trusted=yes] file:/srv/apt/foldops stable main
# or any HTTPS mirror:
# deb [signed-by=/usr/share/keyrings/foldops.gpg] https://apt.example.com stable main
```

### 5. Image profiles (folding-os)

| Profile | `apt install` |
|---------|----------------|
| FAH worker | `foldops-agent` |
| Supervisor (fah-01) | `foldops-agent foldops-supervisor` |

Pin versions in image build if needed:

```bash
apt install foldops-agent=0.1.0-1 foldops-supervisor=0.1.0-1
```

---

## Relation to Buildroot packages

`packaging/folding-os/buildroot/` compiles from source into the rootfs — useful for **initial image** builds.

**`.deb` + apt** is the recommended path for **ongoing FoldOps updates** without OS redeploy. folding-os can:

- Seed the image with an apt repo + pinned versions at build time, or
- Replace Buildroot compile packages with “download `.deb` from GitHub Release” packages.

Both layouts install the same files under `/usr/bin`, `/usr/share/foldops/web`, etc.

---

## Upgrade flow (Milestone 4 alignment)

1. Tag foldops `v0.2.0` → CI publishes new `.deb` files.
2. Publish to apt mirror (or `foldingosctl`/OS updater pulls debs).
3. On each node: `apt update && apt upgrade foldops-agent` (and supervisor/web on fah-01).
4. `postinst` runs `daemon-reload`; `prerm` stops services before file replace.
5. `systemctl restart foldops-agent` (or let admin automate via apt hook).

No full OS image flash required for FoldOps-only changes.

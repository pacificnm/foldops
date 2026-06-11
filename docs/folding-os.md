# FoldOps on Folding-OS

FoldOps ships as **prebuilt Rust binaries** in [Folding-OS](https://github.com/pacificnm/folding-os) images (roadmap Milestone 3). Farm nodes do not compile FoldOps at runtime — Buildroot builds binaries during image creation.

See also [Rust migration plan](rust-migration.md) for implementation phases.

---

## Binaries

| Binary | Role | Typical host |
|--------|------|--------------|
| `foldops-agent` | Metrics collector + local HTTP API | Every FAH node |
| `foldops-supervisor` | Ingest API, SQLite, alerts, dashboard | One management node (e.g. fah-01) |

Build from this repository:

```bash
cargo build --release -p foldops-agent
cargo build --release -p foldops-supervisor
npm run build -w @foldops/web   # React dashboard assets
```

Release artifacts: `target/release/foldops-agent`, `target/release/foldops-supervisor`.

---

## Install paths (Folding-OS target layout)

| Path | Contents |
|------|----------|
| `/usr/bin/foldops-agent` | Agent binary |
| `/usr/bin/foldops-supervisor` | Supervisor binary |
| `/usr/share/foldops/web/` | React SPA static files (`index.html`, assets) |
| `/etc/foldops/agent.env` | Agent configuration (not in git) |
| `/etc/foldops/supervisor.env` | Supervisor configuration (not in git) |
| `/var/lib/foldops/foldops.db` | Supervisor SQLite database (recommended) |

Systemd unit templates for Rust binaries live in [`systemd/rust/`](../systemd/rust/).

Legacy Node.js units remain under `apps/agent/systemd/` and `apps/supervisor/systemd/` for Debian git-checkout deployments.

---

## Environment files

Same variables as documented in [Configuration](configuration.md). Examples:

**`/etc/foldops/agent.env`**

```env
SUPERVISOR_URL=http://fah-01:3000
AGENT_TOKEN=change-me
INTERVAL_MS=60000
FAH_LOG_PATH=/var/log/fah-client/log.txt
FAH_DB_PATH=/var/lib/fah-client/client.db
FAH_WORK_DIR=/var/lib/fah-client/work
AGENT_HTTP_PORT=9100
```

**`/etc/foldops/supervisor.env`**

```env
HOST=0.0.0.0
PORT=3000
INGEST_TOKEN=change-me
DB_PATH=/var/lib/foldops/foldops.db
WEB_ROOT=/usr/share/foldops/web
ALERTS_ENABLED=true
```

`WEB_ROOT` is the Rust supervisor path to the React build (Node supervisor uses `apps/supervisor/web/dist` relative to the checkout).

---

## Buildroot integration (folding-os repo)

Reference packages live in this repo under [`packaging/folding-os/`](../packaging/folding-os/). Copy them into `pacificnm/folding-os`:

```text
folding-os/build/packages/
  foldops-common.mk              ← packaging/folding-os/buildroot/foldops-common.mk
  foldops-agent/
    Config.in
    foldops-agent.mk
  foldops-supervisor/
    Config.in
    foldops-supervisor.mk
```

See [`packaging/folding-os/README.md`](../packaging/folding-os/README.md) for the full integration checklist.

Each package should:

1. `FOLDOPS_VERSION` — pinned git tag (e.g. `v0.1.0`)
2. `cargo build --release` with vendored deps (`npm run vendor:rust` or `./scripts/vendor-rust-deps.sh`)
3. Install binaries to `/usr/bin`
4. Install systemd units from `systemd/rust/`
5. Install `web/dist` to `/usr/share/foldops/web/` (supervisor package only)
6. Ship env **templates** from `packaging/folding-os/env/` as `/etc/foldops/*.env.example` (not secrets)
7. Install `sysusers.d` / `tmpfiles.d` for the `foldops` supervisor user and `/var/lib/foldops`

Image profiles:

- **Worker nodes** — `foldops-agent` enabled
- **Supervisor node** — `foldops-agent` + `foldops-supervisor` enabled

---

## Release checklist

1. Optional offline deps: `npm run vendor:rust`
2. Local smoke: `npm run build:folding-os` (binaries + rootfs/source tarballs in `packaging/staging/`)
3. Tag foldops: `git tag v0.x.y && git push origin v0.x.y`
4. CI (`.github/workflows/rust.yml`) publishes GitHub Release assets on tag push
5. Bump `FOLDOPS_VERSION` in folding-os Buildroot packages
6. Rebuild Folding-OS image
7. QEMU / farm smoke test:
   - Agent posts to `POST /api/ingest`
   - Dashboard loads at `:3000`
   - Kiosk and machine detail pages show live data

---

## Install and configure (apt)

Folding-OS farm nodes install FoldOps from the official signed repository:

**https://deb.folding-os.com**

### Enable apt on each node

```bash
curl -fsSL https://deb.folding-os.com/foldops-archive-keyring.gpg \
  | gpg --dearmor -o /usr/share/keyrings/foldops.gpg

tee /etc/apt/sources.list.d/foldops.list <<'EOF'
deb [signed-by=/usr/share/keyrings/foldops.gpg] https://deb.folding-os.com stable main
EOF

apt update
```

Image builds can bake the keyring and `sources.list` so first boot only needs `apt install`.

### Install by profile

| Profile | Packages |
|---------|----------|
| FAH worker | `foldops-agent` |
| Supervisor (`fah-01`) | `foldops-agent` + `foldops-supervisor` |

```bash
apt install foldops-agent
# supervisor node only:
apt install foldops-supervisor
```

### Configure environment files

Copy package templates and set secrets (see [Configuration](configuration.md)):

```bash
cp /etc/foldops/agent.env.example /etc/foldops/agent.env
# SUPERVISOR_URL, AGENT_TOKEN (= supervisor INGEST_TOKEN)
chmod 600 /etc/foldops/agent.env
systemctl enable --now foldops-agent
```

Supervisor node:

```bash
cp /etc/foldops/supervisor.env.example /etc/foldops/supervisor.env
# INGEST_TOKEN, WEB_ROOT=/usr/share/foldops/web
chmod 600 /etc/foldops/supervisor.env
systemctl enable --now foldops-supervisor
```

Step-by-step farm setup: [Installation — apt](installation.md#production-deployment-apt).

---

## Updates on Folding-OS nodes

Nodes built from Folding-OS images **do not** use `scripts/update-agent.sh` (no git/npm on appliance).

**Recommended:** `apt upgrade` from `deb.folding-os.com`:

```bash
apt update
apt install --only-upgrade foldops-agent foldops-supervisor foldops-web
```

Maintainers publish with `npm run build:debs`, `npm run build:apt-repo:signed`, and `npm run sync:apt-repo:r2`. See [`packaging/deb/README.md`](../packaging/deb/README.md).

The supervisor **Deploy** UI (`POST /api/deploy/agents`) remains for legacy Debian/git-checkout farms only.

---

## Failure philosophy

Per [Folding-OS FoldOps integration](https://github.com/pacificnm/folding-os/blob/main/doc/foldops-integration.md):

- FoldOps agent or supervisor failure must **not** block boot or FAH folding
- Nodes continue contributing if the supervisor is unreachable
- Agent uses `Restart=on-failure` systemd policy

---

## Related docs

- [Rust migration plan](rust-migration.md)
- [Installation — Rust prerequisites](installation.md#rust-development-prerequisites)
- [Configuration](configuration.md)
- [API reference](api.md)

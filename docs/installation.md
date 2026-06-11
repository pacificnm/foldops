# Installation

## Development

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- npm 10+

For Rust agent/supervisor work (see [Rust migration](rust-migration.md)), also install the [Rust development prerequisites](#rust-development-prerequisites) below.

### Setup

```bash
git clone <repo-url> foldops
cd foldops
npm install
```

### Build shared types

```bash
npm run build -w @foldops/shared
```

### Run the supervisor

```bash
cp apps/supervisor/.env.example apps/supervisor/.env
# Edit INGEST_TOKEN in apps/supervisor/.env

npm run dev -w @foldops/supervisor
```

Supervisor listens on `http://localhost:3000` by default.

### Run the dashboard (dev)

In a separate terminal:

```bash
cd apps/supervisor/web
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to the supervisor on port 3000.

### Build and run an agent

Build (shared package must be built first):

```bash
npm run build -w @foldops/shared
npm run build -w @foldops/agent
# or: npm run build:agent
```

Configure and run in dev mode (TypeScript via `tsx`, no `dist/` required):

```bash
cp apps/agent/.env.example apps/agent/.env
# Set SUPERVISOR_URL=http://localhost:3000
# Set AGENT_TOKEN to the same value as INGEST_TOKEN

npm run dev -w @foldops/agent
```

Production-style run from compiled output:

```bash
npm run build:agent
set -a && source apps/agent/.env && set +a
npm run start -w @foldops/agent
```

See also [apps/agent/README.md](../apps/agent/README.md).

### Rust development prerequisites

Required on a **development machine** only. Folding-OS farm images build FoldOps inside Buildroot during image creation — nodes do not need `rustc` or `cargo` at runtime.

#### Rust toolchain

Install via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable
rustup component add clippy rustfmt   # optional
```

Verify:

```bash
rustc --version
cargo --version
```

Default target on x86_64 Linux is `x86_64-unknown-linux-gnu` (matches Folding-OS v0.1.0). ARM64 cross-compilation is only needed later for Raspberry Pi images.

#### System packages (Debian/Ubuntu)

Native libraries used at **compile time** by planned Rust crates (`rusqlite`, `reqwest`, etc.):

```bash
sudo apt install build-essential pkg-config libssl-dev libsqlite3-dev
```

| Package | Purpose |
|---------|---------|
| `build-essential` | C compiler and linker (`cc`, `gcc`) |
| `pkg-config` | Locate native libraries during `cargo build` |
| `libssl-dev` | TLS for outbound HTTP (`reqwest` — webhooks, FAH API) |
| `libsqlite3-dev` | SQLite for the Rust supervisor (`rusqlite`) |

Optional:

| Package | Purpose |
|---------|---------|
| `lm-sensors` | Agent temperature fallback via `sensors -j` (hwmon alone is often enough) |
| `sqlite3` | CLI for inspecting FAH `client.db` during development |

#### Readiness checklist

Run from the repo root:

```bash
./scripts/check-rust-prereqs.sh
```

Exit code `0` means all **required** tools are present. The script prints OK/FAIL for each item.

| Check | Command / probe | Required | apt package (Debian) |
|-------|-----------------|----------|----------------------|
| Rust compiler | `rustc --version` | Yes | via [rustup](https://rustup.rs/) |
| Cargo | `cargo --version` | Yes | via rustup |
| Toolchain manager | `rustup show` | Yes | rustup |
| C compiler | `cc --version` | Yes | `build-essential` |
| GNU compiler | `gcc --version` | Yes | `build-essential` |
| pkg-config | `pkg-config --version` | Yes | `pkg-config` |
| OpenSSL headers | `pkg-config --exists openssl` | Yes | `libssl-dev` |
| SQLite headers | `pkg-config --exists sqlite3` | Yes | `libsqlite3-dev` |
| Node.js 22+ | `node --version` | Yes† | NodeSource / nvm (see `.nvmrc`) |
| npm | `npm --version` | Yes† | bundled with Node |
| lm-sensors | `sensors` | No | `lm-sensors` |
| sqlite3 CLI | `sqlite3 --version` | No | `sqlite3` |
| clippy | `cargo clippy --version` | No | `rustup component add clippy` |
| Cargo workspace | `cargo metadata` | Yes | [Rust workspace](../Cargo.toml) |

†Required for the React dashboard; not needed if you only build/test the Rust agent binary.

One-line install for missing **apt** packages:

```bash
sudo apt install build-essential pkg-config libssl-dev libsqlite3-dev
```

#### Build commands

```bash
cargo build --release -p foldops-agent
cargo build --release -p foldops-supervisor
npm run build -w @foldops/web    # React dashboard (still Node/Vite)
# or from repo root:
npm run build:rust
```

You still need Node.js for the React frontend even when running the Rust supervisor. During the transition, either the Node or Rust backend can serve `/api`; the dashboard is unchanged.

#### Lint and test

```bash
cargo test
cargo clippy --workspace -- -D warnings
cargo fmt --check
```

---

## Production build

For **farm nodes**, prefer [apt deployment](#production-deployment-apt) — no build step on the node.

The commands below build from source (Node legacy stack or local Rust binaries). Use on development machines or legacy git-checkout farms.

From the repository root:

```bash
npm install
```

Run from the **repository root** (`/opt/foldops`), not from `apps/supervisor/web`.

If `NODE_ENV=production` is set globally, install with dev deps for the build step:

```bash
npm install --include=dev
# or: NODE_ENV=development npm install
```

**Supervisor** (fah-01 only — includes React dashboard):

```bash
npm run build:supervisor
# builds shared → supervisor API → React dashboard (vite)
```

**Agent** (every FAH node):

```bash
npm run build:agent
# equivalent to:
# npm run build -w @foldops/shared && npm run build -w @foldops/agent
```

**Everything:**

```bash
npm run build
```

| Command | Output |
|---------|--------|
| `build:agent` | `apps/agent/dist/` (run on every fah-01..fah-04) |
| `./scripts/build-agent.sh` | Same as `build:agent` with `npm install` |
| `build:supervisor` | `apps/supervisor/dist/` + `apps/supervisor/web/dist/` |

---

## Production deployment (apt)

**Recommended** for Folding-OS farm nodes and any Debian host. Installs prebuilt **Rust** binaries from the official apt repository — no git checkout, `npm`, or `rustc` on the node.

| Package | Host | Description |
|---------|------|-------------|
| `foldops-agent` | Every FAH node (`fah-01`..`fah-04`) | Metrics collector + local HTTP API |
| `foldops-supervisor` | Supervisor node (`fah-01`) | Ingest API, SQLite, alerts, dashboard |
| `foldops-web` | Pulled in by `foldops-supervisor` | React dashboard at `/usr/share/foldops/web/` |

Repository: **https://deb.folding-os.com** (signed, hosted on Cloudflare R2). Maintainer docs: [`packaging/deb/README.md`](../packaging/deb/README.md).

On **fah-01..fah-04** you are **root** — run these commands without `sudo`.

### 1. Enable the apt repository

On **each** node:

```bash
curl -fsSL https://deb.folding-os.com/foldops-archive-keyring.gpg \
  | gpg --dearmor -o /usr/share/keyrings/foldops.gpg

tee /etc/apt/sources.list.d/foldops.list <<'EOF'
deb [signed-by=/usr/share/keyrings/foldops.gpg] https://deb.folding-os.com stable main
EOF

apt update
```

If `apt update` reports **“File has unexpected size”** or **“Mirror sync in progress?”**, Cloudflare may be serving stale `Packages.gz` metadata. Purge cache for `https://deb.folding-os.com/dists/` in the Cloudflare dashboard, then run `apt update` again.

### 2. Install packages

**Every FAH node** (including `fah-01`):

```bash
apt install foldops-agent
```

**Supervisor node only** (`fah-01`):

```bash
apt install foldops-supervisor
# installs foldops-web as a dependency
```

Services are **not** auto-started on install. Configure environment files first (next steps).

### 3. Configure the supervisor (`fah-01`)

Generate a shared secret (use the same value for `INGEST_TOKEN` and every `AGENT_TOKEN`):

```bash
openssl rand -hex 32
```

Create the supervisor environment file from the package template:

```bash
cp /etc/foldops/supervisor.env.example /etc/foldops/supervisor.env
```

Edit `/etc/foldops/supervisor.env` — at minimum set `INGEST_TOKEN` and confirm paths:

```env
HOST=0.0.0.0
PORT=3000
INGEST_TOKEN=<your-secret>
DB_PATH=/var/lib/foldops/foldops.db
WEB_ROOT=/usr/share/foldops/web
```

Optional: alerts, live logs, remote control — see [Configuration](configuration.md).

```bash
chmod 600 /etc/foldops/supervisor.env
systemctl enable --now foldops-supervisor
systemctl status foldops-supervisor
curl -s http://localhost:3000/api/machines
```

Dashboard: **http://fah-01:3000**

### 4. Configure the agent (all nodes)

On **each** FAH node:

```bash
cp /etc/foldops/agent.env.example /etc/foldops/agent.env
```

Edit `/etc/foldops/agent.env`:

```env
SUPERVISOR_URL=http://fah-01:3000
AGENT_TOKEN=<same value as INGEST_TOKEN on supervisor>
INTERVAL_MS=60000
FAH_LOG_PATH=/var/log/fah-client/log.txt
FAH_DB_PATH=/var/lib/fah-client/client.db
AGENT_HTTP_PORT=9100
```

Use the supervisor’s LAN IP in `SUPERVISOR_URL` if hostnames are not resolved yet.

```bash
chmod 600 /etc/foldops/agent.env
systemctl enable --now foldops-agent
journalctl -u foldops-agent -f
```

After ~60 seconds the machine should appear on the dashboard. See [Network connectivity](#network-connectivity) if ingest fails.

### 5. Upgrade FoldOps

When a new release is published to the apt repo:

```bash
apt update
apt install --only-upgrade foldops-agent foldops-supervisor foldops-web
```

Or upgrade individual packages. `postinst` runs `daemon-reload`; restart services if needed:

```bash
systemctl restart foldops-agent
# on fah-01:
systemctl restart foldops-supervisor
```

No OS reflash required for FoldOps-only changes.

### 6. Publish updates (maintainers)

From the foldops repository on a build machine with the signing key and `rclone` configured:

```bash
npm run build:debs
npm run build:apt-repo:signed
npm run sync:apt-repo:r2
```

After upload, purge Cloudflare cache for `/dists/` on `deb.folding-os.com` so nodes do not see mismatched `Release` / `Packages.gz` hashes. See [`packaging/deb/README.md`](../packaging/deb/README.md).

---

## Production deployment (legacy: git checkout)

For Debian hosts that deploy from a **git clone** at `/opt/foldops` with Node.js build tooling. Not used on Folding-OS appliance images.

On **fah-01..fah-04** you are **root** — run these commands without `sudo`.

### 1. Deploy code to supervisor (fah-01)

```bash
mkdir -p /opt/foldops
rsync -av --exclude node_modules --exclude .env ./ /opt/foldops/
cd /opt/foldops
npm install --include=dev
npm run build:supervisor
```

Or use the helper script: `./scripts/build-supervisor.sh`

### 1b. Build agent on each FAH node (fah-01..fah-04)

Run on **each** worker (as root). Same steps everywhere; only `/etc/foldops/agent.env` differs per host (e.g. `SUPERVISOR_URL`).

**After `git pull` or rsync new code:**

```bash
cd /opt/foldops
git pull                    # if using git on the node
npm install
npm run build:agent
systemctl restart foldops-agent
journalctl -u foldops-agent -n 3 --no-pager
```

Or use the helper script:

```bash
cd /opt/foldops
./scripts/build-agent.sh
systemctl restart foldops-agent
```

**First-time deploy** (copy repo to the node, then build):

```bash
mkdir -p /opt/foldops
rsync -av --exclude node_modules --exclude .env ./ /opt/foldops/
cd /opt/foldops
npm install
npm run build:agent
```

**One-liner per node** (from your dev machine, if you SSH as root):

```bash
for h in fah-01 fah-02 fah-03 fah-04; do
  echo "=== $h ==="
  ssh root@$h 'cd /opt/foldops && git pull && npm install && npm run build:agent && systemctl restart foldops-agent'
done
```

`build:agent` compiles `packages/shared` then `apps/agent` → `apps/agent/dist/`.

### Push updates from the supervisor (dashboard)

After agents run from a **git clone** at `/opt/foldops`, the supervisor can push updates without SSH:

1. On **each agent** (`/etc/foldops/agent.env`):

   ```env
   UPDATE_ENABLED=true
   AGENT_HTTP_PORT=9100
   FOLDOPS_ROOT=/opt/foldops
   ```

2. On the **supervisor**:

   ```env
   DEPLOY_ENABLED=true
   AGENT_HTTP_PORT=9100
   ```

3. Rebuild and restart supervisor + agents once manually, then use **Dashboard → Deploy agents** (`/deploy`).

Each run executes `scripts/update-agent.sh` (`git pull --ff-only`, `npm install`, `npm run build:agent`) and restarts `foldops-agent`. Offline nodes are skipped. Supervisor UI is not updated by this flow — update the supervisor host separately.

### 2. Supervisor on fah-01

Create the service user and data directory:

```bash
useradd --system --home /opt/foldops --shell /usr/sbin/nologin foldops || true
mkdir -p /etc/foldops /var/lib/foldops
chown foldops:foldops /var/lib/foldops
```

Create the environment file:

```bash
tee /etc/foldops/supervisor.env << 'EOF'
PORT=3000
DB_PATH=/var/lib/foldops/foldops.db
INGEST_TOKEN=your-long-random-secret-here
OFFLINE_THRESHOLD_MS=120000
EOF
chmod 600 /etc/foldops/supervisor.env
```

Install and start the systemd unit:

```bash
cp /opt/foldops/apps/supervisor/systemd/foldops-supervisor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now foldops-supervisor
```

Verify:

```bash
systemctl status foldops-supervisor
curl -s http://localhost:3000/api/machines
```

Dashboard: **http://fah-01:3000**

### 3. Agent on fah-01 through fah-04

On each FAH node, create the agent environment file. Use the **same** secret as `INGEST_TOKEN` on the supervisor:

```bash
tee /etc/foldops/agent.env << 'EOF'
SUPERVISOR_URL=http://fah-01:3000
AGENT_TOKEN=your-long-random-secret-here
INTERVAL_MS=60000
FAH_LOG_PATH=/var/log/fah-client/log.txt
EOF
chmod 600 /etc/foldops/agent.env
```

Install and start the agent:

```bash
cp /opt/foldops/apps/agent/systemd/foldops-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now foldops-agent
```

Verify:

```bash
systemctl status foldops-agent
journalctl -u foldops-agent -f
```

After ~60 seconds, the machine should appear on the dashboard.

### Native module build (supervisor only)

`better-sqlite3` requires native compilation. On Debian:

```bash
apt install build-essential python3
```

Run `npm install` on the supervisor host after installing these packages.

### Temperature sensors (optional)

CPU temperature is usually available via kernel hwmon (`coretemp`, `k10temp`, etc.) without extra packages. **Chassis** temperature depends on the motherboard reporting a system/board sensor—often labeled `SYST` or exposed through `acpitz`.

If the dashboard shows `—` for chassis temp on a node:

```bash
# See what the kernel exposes
grep -H . /sys/class/hwmon/hwmon*/temp*_label 2>/dev/null
```

Install **lm-sensors** for additional chips and the `sensors` CLI:

```bash
apt install lm-sensors
sensors-detect   # interactive, run once per machine
sensors               # verify readings
```

No agent configuration is required—the agent picks up hwmon and `sensors -j` automatically. Restart the agent after installing sensors:

```bash
systemctl restart foldops-agent
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `apt update`: unexpected size / mirror sync | Stale CDN cache on `deb.folding-os.com` — purge `/dists/` in Cloudflare; retry `apt update` |
| Agent logs `ingest error` | `AGENT_TOKEN` matches `INGEST_TOKEN`; supervisor reachable at `SUPERVISOR_URL` |
| Machine shows offline | Agent service running; firewall allows port 3000 to fah-01 |
| No FAH metrics | `fah-client` running; agent can read `FAH_DB_PATH` and `FAH_LOG_PATH` |
| `Connect Timeout` to supervisor | Supervisor not running, wrong IP, or **firewall** blocking port 3000 — see [Network connectivity](#network-connectivity) |
| Progress OK, PPD/TPF `—` | PPD/TPF only in `client.db` — run agent as root (`systemctl`), install `sqlite3`: `apt install sqlite3`, redeploy latest agent |
| Progress/PPD show `—` | Redeploy agent (Node 22+); confirm `FAH_DB_PATH` exists and is readable; check `journalctl -u foldops-agent` for warnings |
| Live log pull failed (cached snapshot OK) | On supervisor: `/etc/hosts` entries for each `fah-0N`; agent listening on `AGENT_HTTP_PORT`; `AGENT_TOKEN` = `INGEST_TOKEN`; `node scripts/diagnose-log-pull.mjs fah-02` |
| Control tab errors | Same as live logs (`/etc/hosts`, port 9100); `CONTROLS_ENABLED=true` on agent, `CONTROL_ENABLED=true` on supervisor; reboot needs `CONTROLS_ALLOW_REBOOT=true` |

### Network connectivity

Agents POST to `SUPERVISOR_URL` (e.g. `http://192.168.4.10:3000`). Every FAH node must reach that host on port 3000.

**On the supervisor server** (the machine with IP `192.168.4.10`):

```bash
# Service running
systemctl status foldops-supervisor

# Listening on all interfaces (not only 127.0.0.1)
ss -tlnp | grep 3000
# expect 0.0.0.0:3000 or *:3000

# Local API works
curl -s http://127.0.0.1:3000/api/machines

# /etc/foldops/supervisor.env should include:
# HOST=0.0.0.0
# PORT=3000
```

**Open firewall if enabled:**

```bash
ufw allow 3000/tcp
# or: ufw status
```

**From each FAH node** (e.g. fah-02):

```bash
curl -m 5 http://192.168.4.10:3000/api/machines
```

If this times out from fah-02 but works on the supervisor host, it is a network/firewall issue — not an agent bug. Fix connectivity before expecting nodes to show online.

**Hostnames (`/etc/hosts`)** — Live logs, deploy, and other supervisor→agent calls use `http://<hostname>:9100` (the name from each agent’s `os.hostname()`, e.g. `fah-02`). Ingest only needs agents to reach the supervisor by IP; it does **not** require the supervisor to resolve worker hostnames. After a router/DHCP change, add stable entries on **the supervisor host** (and anywhere you run `curl` by name):

```bash
# /etc/hosts on fah-01 (supervisor) — use your current LAN IPs
192.168.4.10  fah-01
192.168.4.11  fah-02
192.168.4.12  fah-03
192.168.4.13  fah-04
```

Verify: `getent hosts fah-02` and  
`curl -H "Authorization: Bearer $INGEST_TOKEN" http://fah-02:9100/logs/fah?lines=1`

| Supervisor won't start | `INGEST_TOKEN` set; `DB_PATH` directory writable by `foldops` user |
| Build fails on sqlite | Install `build-essential` and `python3`, re-run `npm install` |
| CPU temp shows `—` | Check hwmon: `ls /sys/class/hwmon/`; verify `coretemp` or platform driver loaded |
| Chassis temp shows `—` | Motherboard may lack a chassis sensor; try `lm-sensors` (see [Temperature sensors](#temperature-sensors-optional)) |

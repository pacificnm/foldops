# FoldOps

Folding@home farm monitor for Debian nodes. Agents on `fah-01` through `fah-04` collect system and FAH metrics every 60 seconds—including **CPU and chassis temperature**—and POST them to a central supervisor on `fah-01`, which stores snapshots in SQLite and serves a React dashboard.

## Quick start

```bash
npm install
npm run build -w @foldops/shared

# Terminal 1 — supervisor
cp apps/supervisor/.env.example apps/supervisor/.env
npm run dev -w @foldops/supervisor

# Terminal 2 — dashboard
cd apps/supervisor/web && npm install && npm run dev

# Terminal 3 — agent
cp apps/agent/.env.example apps/agent/.env
npm run dev -w @foldops/agent
```

Open http://localhost:5173 (dev) or http://localhost:3000 (production build).

## Lint and typecheck

```bash
npm run typecheck   # all packages (builds shared first for types)
npm run lint        # ESLint across the repo
npm run check       # typecheck + lint
```

Per package: `npm run typecheck -w @foldops/agent`, `npm run lint -w @foldops/web`, etc.

## Production build

```bash
npm install
npm run build:supervisor   # fah-01 — API + dashboard
npm run build:agent        # fah-01..fah-04 — metrics collector
```

See [apps/agent/README.md](apps/agent/README.md) for agent-specific build and deployment steps.

## Rust (in progress)

Agent and supervisor are being rewritten in Rust for [Folding-OS](https://github.com/pacificnm/folding-os) images. Legacy Node apps remain for development.

```bash
./scripts/check-rust-prereqs.sh
cargo build --release --workspace
cargo test --workspace
npm run build:web                    # dashboard for Rust supervisor
npm run build:folding-os             # release tarballs for Folding-OS images
npm run build:debs                   # .deb packages for apt upgrade on nodes
```

See [docs/rust-migration.md](docs/rust-migration.md), [docs/folding-os.md](docs/folding-os.md), [packaging/folding-os/README.md](packaging/folding-os/README.md), and [packaging/deb/README.md](packaging/deb/README.md).

## Documentation

Full documentation lives in **[docs/](docs/)**:

| Guide | Topics |
|-------|--------|
| [docs/README.md](docs/README.md) | Documentation index |
| [Architecture](docs/architecture.md) | System design and data flow |
| [Installation](docs/installation.md) | Dev setup and production deployment |
| [Configuration](docs/configuration.md) | Environment variables |
| [API Reference](docs/api.md) | HTTP endpoints |
| [Agent](docs/agent.md) | Agent build, metrics, and log parsing |
| [apps/agent/README.md](apps/agent/README.md) | Agent build & systemd quick reference |
| [Database](docs/database.md) | SQLite schema |

## Stack

Node.js 22 · Express · React + Vite · SQLite (better-sqlite3) · systeminformation · Zod

## License

MIT

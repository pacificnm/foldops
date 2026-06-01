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

## Documentation

Full documentation lives in **[docs/](docs/)**:

| Guide | Topics |
|-------|--------|
| [docs/README.md](docs/README.md) | Documentation index |
| [Architecture](docs/architecture.md) | System design and data flow |
| [Installation](docs/installation.md) | Dev setup and production deployment |
| [Configuration](docs/configuration.md) | Environment variables |
| [API Reference](docs/api.md) | HTTP endpoints |
| [Agent](docs/agent.md) | Metrics and log parsing |
| [Database](docs/database.md) | SQLite schema |

## Stack

Node.js 22 · Express · React + Vite · SQLite (better-sqlite3) · systeminformation · Zod

## License

MIT

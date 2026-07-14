# Karea

Industrial vehicle production tracking platform (KTS + KMS unified).

## Monorepo Layout

```
backend/          Go 1.22 API (Clean Architecture)
web/              React admin dashboard (Vite + TypeScript)
mobile/           React Native operator app (Expo)
database/
  migrations/     golang-migrate SQL files
  seed/           reference data scripts
  init/           Docker Postgres init scripts
docs/             product and architecture documentation
```

## Prerequisites

- Docker & Docker Compose
- [golang-migrate](https://github.com/golang-migrate/migrate) CLI
- Go 1.22+ (for local backend development)
- Node.js 20+ (for web and mobile)

## Quick Start

### 1. Environment

```bash
cp .env.example .env
```

### 2. Start infrastructure

```bash
docker compose up -d postgres
```

Postgres runs on `localhost:5432` with `pg_trgm` and `uuid-ossp` extensions enabled via `database/init/00_extensions.sql`.

### 3. Run migrations

```bash
export DATABASE_URL=postgres://karea:karea_secret@localhost:5432/karea?sslmode=disable

migrate -path database/migrations -database "$DATABASE_URL" up
```

Rollback:

```bash
migrate -path database/migrations -database "$DATABASE_URL" down 1
```

### 4. Seed reference data (after Prompt 2)

```bash
# Example once seed scripts exist:
# psql "$DATABASE_URL" -f database/seed/01_phases.sql
```

### 5. Backend API

Local:

```bash
cd backend
go run ./cmd/api
```

Or via Docker (postgres + backend):

```bash
docker compose up -d
```

Health check: `GET http://localhost:8080/health`

### 6. Web dashboard

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

### 7. Mobile app

```bash
cd mobile
npm install
npx expo start
```

Use the Expo Go app or a simulator to run the operator shell.

## Documentation

See `/docs` for PRD, database schema, UI/UX guidelines, and Cursor master prompts.


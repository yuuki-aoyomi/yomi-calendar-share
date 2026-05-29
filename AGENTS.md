# AGENTS.md

## Project Policy: Avoid Cloudflare Lock-in

This project may be deployed on Cloudflare for the initial version, but it must be designed so that it can be migrated later to a VPS, home server, Docker environment, or Kubernetes cluster without major rewrites.

Cloudflare is the first hosting target, not the permanent dependency.

## Core Principles

* Do not tightly couple business logic to Cloudflare-specific APIs.
* Keep storage, database, and AI integrations behind clear abstraction layers.
* Prefer portable formats and protocols.
* Data must be exportable and importable.
* The application should remain understandable and maintainable by the project owner.

## Architecture Rules

### Frontend

* Use React as a normal frontend application.
* Do not assume Cloudflare Pages-specific behavior inside application logic.
* Environment variables should be accessed through a small config layer.
* The frontend should communicate with the backend through normal HTTP APIs.

### Backend

* Backend logic should be organized into services.
* Cloudflare Workers-specific code should stay near the entrypoint only.
* Avoid putting business logic directly inside Worker request handlers.
* API routes should be portable to Express, Hono, Fastify, or another server framework later.

Preferred structure:

```txt
src/
  api/
  services/
  repositories/
  storage/
  config/
```

### Database

* D1 may be used initially, but SQL should remain as portable as possible.
* Avoid D1-specific features unless there is a clear reason.
* Do not store Cloudflare-specific URLs as permanent data.
* Store logical keys, IDs, and metadata instead.

Good:

```txt
imageKey = "daily-images/2026/05/29/abc.webp"
```

Bad:

```txt
imageUrl = "https://example.r2.dev/daily-images/2026/05/29/abc.webp"
```

The final public URL should be generated at runtime by the storage layer.

### Storage

* R2 may be used initially.
* Treat R2 as S3-compatible object storage, not as a unique permanent platform.
* All image access should go through a storage adapter.

Required abstraction:

```txt
StorageService
- uploadObject()
- getObject()
- deleteObject()
- getPublicUrl()
- listObjects()
```

Do not call R2 directly from UI or business logic.

### Images

For the daily image feature:

* Store original images separately from optimized display images.
* Keep original files unless the user explicitly deletes them.
* Use compressed WebP or similar formats for display.
* Preserve metadata in the database.

Recommended object layout:

```txt
daily-images/
  originals/
  optimized/
```

### Export / Import

The project must support future migration.

Add or design for:

```txt
Export
- metadata.json
- images/
- events.json
- settings.json
```

The export format should be readable without Cloudflare.

Import should eventually restore:

* calendar events
* daily image metadata
* image files
* user settings

### AI Features

AI features must be optional.

* Do not make the calendar depend on AI to function.
* AI failure must not break normal calendar usage.
* Put AI logic behind an adapter.

Required abstraction:

```txt
AiService
- suggestSchedule()
- summarizeDay()
```

Cloudflare Workers AI, OpenAI API, local LLM, or another provider should be swappable later.

### Error Handling

Cloudflare service failures must degrade gracefully.

Examples:

* If AI fails, show a simple fallback message.
* If image loading fails, show a placeholder.
* If storage upload fails, keep the calendar usable.
* If database access fails, return clear API errors.

### Environment Configuration

All provider-specific settings must live in environment/config files.

Do not hardcode:

* R2 bucket names
* Cloudflare account IDs
* public storage URLs
* API keys
* model names
* deployment URLs

### Future Hosting Targets

The codebase should be able to migrate toward:

```txt
Frontend:
- Static hosting
- Nginx
- Cloudflare Pages
- Vercel

Backend:
- Cloudflare Workers
- Node.js server
- Docker container
- VPS
- Home server
- Kubernetes

Database:
- D1
- SQLite
- PostgreSQL

Storage:
- R2
- MinIO
- S3
- Local filesystem
- NAS
```

## Development Style

When implementing features:

1. Explain the design briefly before changing code.
2. Keep changes small and reviewable.
3. Avoid unnecessary rewrites.
4. Prefer clear file structure over clever abstractions.
5. Do not silently introduce vendor lock-in.
6. If Cloudflare-specific code is necessary, isolate it and explain why.

## Important Reminder

The goal is not to avoid Cloudflare.

The goal is to use Cloudflare now while keeping the project portable enough to survive future migration.

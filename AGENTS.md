# Repository Guidelines

## Project Structure & Module Organization
- `index.js`: thin startup entrypoint (loads env, creates app, starts listener).
- `app.js`: app composition layer (middleware, routes, error handlers).
- `config/`: env parsing and Firebase initialization (`env.js`, `firebase.js`).
- `controllers/`: request handlers for image workflows.
- `routes/`: HTTP route wiring (`systemRoutes.js`, `imageRoutes.js`).
- `middleware/`: CORS, upload, size guards, rate limits, error handlers.
- `utils/`: shared logger and semaphore utilities.
- `tests/`: formal automated tests (`*.test.js`) run via Node test runner.
- `jimp-test/`: isolated Jimp experiments (`test-jimp.js`, sample image, local package manifest).
- Root config files: `package.json`, `package-lock.json`, `.env` (local only).

## Build, Test, and Development Commands
- `npm install`: install dependencies for the backend service.
- `npm start`: run the API locally (`node index.js`, default port `3000`).
- `npm test`: run automated tests in `tests/**/*.test.js`.
- `node test.js`: quick runtime sanity check.
- `cd jimp-test && npm install && node test-jimp.js`: validate Jimp behavior independently.
- Example local run with env overrides:
  `PORT=3000 MAX_FILE_SIZE_MB=5 IMAGE_PROCESSOR=sharp npm start`

## Provider-Backed MVP Architecture
- Default MVP mode: `AUTH_PROVIDER=firebase`, `DATABASE_PROVIDER=sqlite`, `STORAGE_PROVIDER=local`.
- Firebase Auth verifies ID tokens; SQLite stores image metadata; local filesystem storage keeps processed image files.
- Firebase Storage endpoints remain compatibility paths for `/upload`, `/resize-upload`, and `/delete-image`.
- Provider selection belongs in `config/env.js`, `config/container.js`, and `config/providerRegistry.js`.
- Controllers, routes, and services must not branch on provider env values or import concrete Firebase, SQLite, or local-storage providers directly.
- Canonical provider-backed routes: `GET /images/public`, `GET /images/me`, `POST /images`, `DELETE /images/:imageId`, `PATCH /images/:imageId/visibility`, `POST /images/:imageId/archive`, `POST /images/:imageId/unarchive`, and `GET /media/*`.
- Preserve legacy routes: `/health`, `/resize`, `/upload`, `/resize-upload`, and `/delete-image`.
- DTOs must not expose `storageKey`, `thumbnailKey`, filesystem paths, Firebase bucket names, or other provider internals.

## Deployment Environment Constraints
- Production host: Samsung Netbook NC110 running Ubuntu Server 24.04.3 LTS.
- Hardware profile: Intel Atom CPU, 2GB RAM, 250GB SSD.
- Process manager: PM2 (the API is expected to run as a managed PM2 process).
- Favor low-memory/low-CPU changes: stream I/O, avoid loading large buffers, and keep dependencies lightweight.
- Keep `LOW_MEMORY_MODE=true`, `RESIZE_CONCURRENCY=1`, and `MAX_FILE_SIZE_MB=5` unless the target host has been load-tested.
- Validate processor choice (`IMAGE_PROCESSOR=sharp|jimp`) on target hardware before release; Atom-class CPUs may require fallback to `jimp`.
- Use `TRUST_PROXY=loopback` when the NC110 is behind a same-host Nginx/Caddy reverse proxy.
- CORS methods must include `GET,POST,PATCH,DELETE,OPTIONS,HEAD` for canonical image metadata actions.
- Verify PM2 behavior after changes (`pm2 status`, `pm2 logs photogram-backend`) and keep startup commands documented in PRs when process settings change.

## Coding Style & Naming Conventions
- JavaScript (CommonJS), 4-space indentation, semicolons, and single quotes.
- Use `camelCase` for variables/functions and `UPPER_SNAKE_CASE` for constants/env-derived settings.
- Keep endpoint paths lowercase and hyphenated (for example, `/resize-upload`).
- Prefer small helper functions for shared concerns (logging, validation, concurrency guards).
- No formatter/linter is currently enforced; match existing style exactly in touched files.

## Testing Guidelines
- Automated unit tests are required for new logic; add tests under `tests/` using `node:test` and `node:assert/strict`.
- Keep tests focused and dependency-light (mock request/response objects and storage clients where possible).
- Validate key flows with `curl`/Postman: `/health`, `/resize`, `/upload`, `/resize-upload`, `/delete-image`.
- For upload endpoints, always test: valid image, non-image file, empty payload, and oversize payload (`MAX_FILE_SIZE_MB`).
- If adding substantial logic, include a reproducible test command in the PR description.

## Commit & Pull Request Guidelines
- Follow observed Conventional Commit-style prefixes: `feat:`, `fix:`, `perf:` (use imperative, concise summaries).
- Keep commits focused by concern (for example, “perf: stream uploads to disk”).
- PRs should include: purpose, behavior changes, config/env changes, manual test evidence, and related issue/PR links.
- For API behavior changes, include sample request/response snippets.

## Security & Configuration Tips
- Do not commit real secrets. `FIREBASE_SERVICE_ACCOUNT_PATH` is required; keep service account JSON outside the repository.
- Do not commit `.env`, `secrets/`, service-account JSON, `data/`, SQLite DB files, uploaded images, `firebase-debug.log`, or `node_modules/`.
- Back up the SQLite DB and `LOCAL_STORAGE_ROOT` together; metadata and files are a matched set.
- For non-public buckets/private access, use `FIREBASE_URL_MODE=signed` and set `FIREBASE_SIGNED_URL_EXPIRES_SECONDS` to the shortest practical TTL.
- Review CORS allowlist updates carefully in `index.js` and document any new origins in the PR.

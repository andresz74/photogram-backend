# Backend MVP Validation

Slice 18A validation target:

```env
AUTH_PROVIDER=firebase
DATABASE_PROVIDER=sqlite
STORAGE_PROVIDER=local
```

Canonical provider-backed routes:

```text
GET    /images/public
GET    /images/me
POST   /images
DELETE /images/:imageId
PATCH  /images/:imageId/visibility
POST   /images/:imageId/archive
POST   /images/:imageId/unarchive
GET    /media/*
```

Legacy routes remain available:

```text
/health
/resize
/upload
/resize-upload
/delete-image
```

## Validation Findings

- Provider selection remains centralized in `config/env.js`, `config/container.js`, and `config/providerRegistry.js`.
- Controllers, routes, and services do not import concrete SQLite, local storage, or Firebase provider implementations.
- `storageKey` and `thumbnailKey` stay internal; frontend DTOs are created by `services/imagePresenter.js`.
- Local storage validates keys before resolving paths and verifies object paths stay inside `LOCAL_STORAGE_ROOT`.
- `/media` is mounted only when `container.config.storageProvider === 'local'`.
- `/images` routes are additive and do not replace legacy routes.
- Upload cleanup is covered by `tests/imageUploadService.test.js`.
- SQLite repository exposes `close()` and registry/container tests close it after use.
- Firebase Auth provider tests inject fake Firebase Auth and do not require real credentials.
- `better-sqlite3` is present in `package.json` and `package-lock.json`; `npm install --package-lock-only --ignore-scripts` reports the lockfile is up to date.

## Automated Checks

```bash
npm install
npm test
node --check index.js
node --check app.js
```

## Local MVP Startup

```bash
AUTH_PROVIDER=firebase \
DATABASE_PROVIDER=sqlite \
STORAGE_PROVIDER=local \
SQLITE_PATH=./data/photogram.sqlite \
LOCAL_STORAGE_ROOT=./data/images \
PUBLIC_MEDIA_BASE_URL=http://localhost:3000/media \
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/photogram/firebase-service-account.json \
LOW_MEMORY_MODE=true \
MAX_FILE_SIZE_MB=5 \
RESIZE_CONCURRENCY=1 \
HEAVY_RATE_LIMIT_MAX=8 \
ENABLE_DEBUG_ENDPOINT=false \
IMAGE_PROCESSOR=sharp \
npm start
```

## Manual Curl Checks

```bash
curl http://localhost:3000/health

curl http://localhost:3000/images/public

curl -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/me

curl -X POST \
  -H "Authorization: Bearer <firebase-id-token>" \
  -F "image=@/path/to/photo.jpg" \
  -F "description=Provider-backed upload" \
  -F "isPublic=true" \
  http://localhost:3000/images

curl -X DELETE \
  -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/<image-id>

curl -X PATCH \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"isPublic":false}' \
  http://localhost:3000/images/<image-id>/visibility

curl -X POST \
  -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/<image-id>/archive

curl -X POST \
  -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/<image-id>/unarchive

curl -H "Authorization: Bearer <firebase-id-token>" \
  http://localhost:3000/images/me?archived=true

curl http://localhost:3000/media/users/<uid>/images/<image-id>.jpg
```

Legacy upload check:

```bash
curl -X POST \
  -F "image=@/path/to/photo.jpg" \
  http://localhost:3000/resize-upload
```

Upload edge cases to validate manually:

- valid image
- non-image file
- empty payload
- oversize payload using `MAX_FILE_SIZE_MB`

## NC110 Risks

- `sharp` may fail on Atom-era CPUs; switch to `IMAGE_PROCESSOR=jimp` if the server logs invalid opcode or native module failures.
- Express `/media` serving is acceptable for low traffic but Nginx/Caddy static serving may be more efficient later.
- SQLite and image directory backups must be managed together.

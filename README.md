# Photogram Backend (Image Upload Service)

Express service for resizing, uploading, and deleting images in Firebase Storage. The app is modularized into `app.js`, `routes/`, `controllers/`, `middleware/`, `config/`, and `utils/`.

## Features
- Resize to 1440px width and compress to JPEG (quality 80) via `/resize`.
- Upload original image to Firebase Storage via `/upload`.
- Resize then upload via `/resize-upload`.
- Delete images from Firebase Storage via `/delete-image`.
- Health/debug endpoints plus size limits and a CORS allowlist.

## Prerequisites
- Node.js 18+
- Firebase project with Storage enabled.
- Firebase service account JSON file available on disk.

## Configuration
Set environment variables as needed:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `MAX_FILE_SIZE_MB` | Upload limit (in MB) | `5` |
| `RESIZE_CONCURRENCY` | Max concurrent resize jobs (guardrailed by memory profile) | `1` |
| `LOW_MEMORY_MODE` | Memory profile mode (`auto`, `true`, `false`) used for safety caps | `auto` |
| `DEFAULT_RATE_LIMIT_MAX` | Per-minute limit for light endpoints | `60` |
| `HEAVY_RATE_LIMIT_MAX` | Per-minute limit for heavy endpoints (`/resize`, `/resize-upload`) | `8` on low-memory, `20` otherwise |
| `ENABLE_DEBUG_ENDPOINT` | Enable `/debug` endpoint (`auto`, `true`, `false`) | `auto` (`false` in production) |
| `UPLOAD_TEMP_CLEANUP_ENABLED` | Enable periodic cleanup of stale temp upload files | `true` |
| `UPLOAD_TEMP_CLEANUP_INTERVAL_SECONDS` | Temp cleanup interval in seconds | `300` |
| `UPLOAD_TEMP_STALE_AGE_SECONDS` | File age threshold for deletion in seconds | `900` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON | **required** (no fallback) |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name | `photograma-c2078.appspot.com` |
| `IMAGE_PROCESSOR` | Image engine for `/resize` + `/resize-upload` (`sharp` or `jimp`) | `sharp` |
| `FIREBASE_UPLOAD_ACL` | GCS predefined ACL for uploads (`publicRead`, etc). Set `none` to rely on bucket policy. | `publicRead` |
| `FIREBASE_URL_MODE` | Upload response URL type (`public` or `signed`) | `public` |
| `FIREBASE_SIGNED_URL_EXPIRES_SECONDS` | Signed URL TTL in seconds (used when `FIREBASE_URL_MODE=signed`) | `900` |

## Setup
```bash
npm install
```

Start the server (example with PM2):
```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/path/service-account.json PORT=3000 MAX_FILE_SIZE_MB=5 pm2 start index.js --name photogram-backend
```

## API
All endpoints expect `multipart/form-data` with the file field named `image` unless noted.

- `POST /resize` — Resize/compress and return the JPEG bytes. Response `Content-Type: image/jpeg`.
- `POST /upload` — Upload original image to Firebase Storage and return `{ url }`.
- `POST /resize-upload` — Resize/compress, upload to Storage, and return `{ url }`.
- `POST /delete-image` — JSON body `{ "imgName": "file-name.jpg" }` to delete from `images/` in the bucket.
- `GET /health` — Returns `OK`.
- `GET /debug` — Returns basic request info (IP, region).

## CORS
Allowed origins are defined in `middleware/cors.js` (`apps.andreszenteno.com`, localhost, LAN IPs). Update `allowedOrigins` there if your frontend runs elsewhere.

## Notes
- Only image uploads are accepted; non-image requests are rejected with `400`.
- On low-memory hosts (`LOW_MEMORY_MODE=true` or auto-detected), runtime guardrails clamp `MAX_FILE_SIZE_MB` to `10` and `RESIZE_CONCURRENCY` to `1`.
- Heavy endpoint rate limit is also clamped in low-memory mode (`HEAVY_RATE_LIMIT_MAX` cap `12`, default `8`).
- `FIREBASE_SERVICE_ACCOUNT_PATH` is required. Do not rely on in-repo credential files.
- For private workflows, set `FIREBASE_URL_MODE=signed` so upload endpoints return time-limited signed URLs instead of public object URLs.
- `/debug` is disabled by default in production unless `ENABLE_DEBUG_ENDPOINT=true`.
- Some very old CPUs (e.g. Atom-era netbooks) may crash when loading `sharp`/libvips (`invalid opcode` / `SIGILL`). If that happens, set `IMAGE_PROCESSOR=jimp` (higher CPU/RAM), or rebuild `sharp` on that machine against a compatible libvips.

## Breaking Changes (v2.0.0)
- `FIREBASE_SERVICE_ACCOUNT_PATH` is now required. Startup will fail if it is missing or invalid.
- Runtime defaults now include low-memory guardrails:
  - `LOW_MEMORY_MODE=auto` (auto-detects low-memory hosts)
  - low-memory clamp for `MAX_FILE_SIZE_MB` (cap `10`)
  - low-memory clamp for `RESIZE_CONCURRENCY` (cap `1`)
- Rate limits are now configurable and guardrailed:
  - `DEFAULT_RATE_LIMIT_MAX`
  - `HEAVY_RATE_LIMIT_MAX` (defaults lower on low-memory hosts, with caps)
- `/debug` endpoint behavior changed:
  - `ENABLE_DEBUG_ENDPOINT=auto` means disabled by default in `NODE_ENV=production`.

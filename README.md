# Photogram Backend (Image Upload Service)

Small Express service for resizing, uploading, and deleting images stored in Firebase Storage. Uses Jimp for in-memory processing and Multer for uploads, with CORS locked to trusted frontends.

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
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON | falls back to `./photograma-c2078-firebase-adminsdk-ax4wk-d70d1dfd8e.json` |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name | `photograma-c2078.appspot.com` |
| `IMAGE_PROCESSOR` | Image engine for `/resize` + `/resize-upload` (`sharp` or `jimp`) | `sharp` |
| `FIREBASE_UPLOAD_ACL` | GCS predefined ACL for uploads (`publicRead`, etc). Set `none` to rely on bucket policy. | `publicRead` |

## Setup
```bash
npm install
```

Start the server (example with PM2):
```bash
PORT=3000 MAX_FILE_SIZE_MB=5 pm2 start index.js --name photogram-backend
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
Allowed origins are defined in `index.js` (`apps.andreszenteno.com`, localhost:3000, `192.168.1.181`). Update `allowedOrigins` if your frontend runs elsewhere.

## Notes
- Only image uploads are accepted; non-image requests are rejected with `400`.
- The service account path should be provided via `FIREBASE_SERVICE_ACCOUNT_PATH` in production to avoid keeping credentials in the repo.
- Some very old CPUs (e.g. Atom-era netbooks) may crash when loading `sharp`/libvips (`invalid opcode` / `SIGILL`). If that happens, set `IMAGE_PROCESSOR=jimp` (higher CPU/RAM), or rebuild `sharp` on that machine against a compatible libvips.

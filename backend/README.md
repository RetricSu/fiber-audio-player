# Fiber Audio Player Backend

This folder contains the source code for the backend API, built with Hono and compiled to `dist` for production.

## Running in development

1. Install dependencies:

   ```bash
   cd backend
   pnpm install
   ```

2. Build and start the server:

   ```bash
   pnpm dev
   ```

   (or `pnpm build && node dist/index.js` for a one-off run)

## Operational modes

The backend can be run in two main operational modes for production deployments. Both rely on helper scripts in the top-level `scripts/` directory.

### 1. systemd (recommended on Linux servers)

See [`scripts/systemd/README.md`](../scripts/systemd/README.md) for full instructions on installing, managing, and checking health using the systemd service files.

### 2. PM2 process manager

If you prefer to use PM2 instead of systemd, refer to [`scripts/pm2/README.md`](../scripts/pm2/README.md) for installation, ecosystem configuration, and management steps.

## Audio Upload and Streaming

The backend handles audio uploads and automatic HLS transcoding:

1. **Upload**: Admin users upload audio files (MP3, WAV, OGG, AAC) via API
2. **Transcode**: Backend automatically transcodes to HLS format using FFmpeg
3. **Stream**: Encrypted HLS content served through authenticated endpoints

See [docs/hls-streaming.md](../docs/hls-streaming.md) for details.

No manual HLS preparation needed — everything is handled automatically by the backend.

## Testing

Run the test suite:

```bash
# Run all tests
npx vitest run

# Run tests in watch mode (development)
npx vitest
```

**Note:** Use `npx vitest run` instead of `bun test` due to native module ABI compatibility. The test suite includes 38+ tests covering:
- Health check endpoint
- Podcast CRUD operations  
- Episode management and uploads
- Payment flow integration

Tests automatically set up a test database and clean up after each test.

## Additional notes

- The backend listens on port `8787` by default; you may change this via the `PORT` environment variable.
- Always build the project before running in production. The `build:api` script lives at the **root** of the repository, so run it from the top level:
  ```bash
  pnpm build:api
  ```

With this README in place, operations teams have quick links to the detailed guides for both management methods and HLS preparation.

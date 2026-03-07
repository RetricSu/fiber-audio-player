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

   (or `pnpm build:api && node dist/index.js` for a one-off run)

## Operational modes

The backend can be run in two main operational modes for production deployments. Both rely on helper scripts in the top-level `scripts/` directory.

### 1. systemd (recommended on Linux servers)

See [`scripts/systemd/README.md`](../scripts/systemd/README.md) for full instructions on installing, managing, and checking health using the systemd service files.

### 2. PM2 process manager

If you prefer to use PM2 instead of systemd, refer to [`scripts/pm2/README.md`](../scripts/pm2/README.md) for installation, ecosystem configuration, and management steps.

## HLS preparation

The backend serves HLS segments and playlists. Before deploying, make sure you have prepared the HLS content as described in the project documentation:

- See [docs/prepare-hls](../docs/hls-manual-setup.md) for step-by-step guidance on generating and hosting the `media/hls` playlist and segments.

## Additional notes

- The backend listens on port `8787` by default; you may change this via the `PORT` environment variable.
- Always build (`pnpm build:api`) before running in production.

With this README in place, operations teams have quick links to the detailed guides for both management methods and HLS preparation.
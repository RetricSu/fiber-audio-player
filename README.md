# Fiber Audio Player

A self-hosted podcast platform with streaming micropayments via Fiber Network (CKB Lightning Network). Creators maintain full ownership of their content and audience relationships while receiving direct payments from listeners.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run complete stack (frontend + backend)
pnpm dev

# Or run individually
pnpm dev:web    # Frontend only
pnpm dev:api    # Backend only
```

For detailed setup instructions, see [docs/admin-guide.md](docs/admin-guide.md).

## Project Structure

This is a `pnpm workspace` monorepo:

```
.
├── src/                    # Next.js frontend (web player)
├── backend/               # Hono API server (payment & auth)
├── apps/cli/             # CLI tool for content management
├── docs/                 # Documentation
└── scripts/              # Deployment & utility scripts
```

### Components

| Package | Description | Path |
|---------|-------------|------|
| **Web Player** | Next.js frontend with audio player UI | `src/` |
| **API Server** | Hono backend for payments & streaming auth | `backend/` |
| **CLI** | Command-line tool for podcast management | `apps/cli/` |

## Documentation

- **[Admin Guide](docs/admin-guide.md)** - Complete setup and deployment instructions
- **[API Documentation](docs/API.md)** - Backend API reference
- **[CLI Guide](docs/cli.md)** - Command-line tool usage
- **[DevOps Manual](docs/devops-manual.md)** - Production deployment with PM2, FFmpeg, SSL
- **[Testing Guide](docs/testing-guide.md)** - Development and testing workflows
- **[Self-Hosted Content Creation](docs/self-hosted-content-creation.md)** - Architecture vision for agent-operated platforms

## CLI Tool

The `fap` CLI simplifies podcast management:

```bash
# Install CLI
pnpm build:app

# Upload episode
fap episodes upload ./my-episode.mp3 --title "Episode Title"

# List episodes
fap episodes list

# Check transcoding status
fap transcode status --id <episode-id>
```

See [docs/cli.md](docs/cli.md) for full CLI documentation.

## Configuration

### Environment Variables

Copy `.env.local.example` to `.env.local` and configure:

```bash
# Required: Your Fiber node pubkey for receiving payments
NEXT_PUBLIC_RECIPIENT_PUBKEY=03abc...your_pubkey_hex

# Optional: Bootnode multiaddr for listener auto-bootstrap
NEXT_PUBLIC_BOOTNODE_MULTIADDR=/ip4/127.0.0.1/tcp/8228/p2p/Qm...

# Optional: Backend URL
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8787

# Optional: Payment interval (default: 10 seconds)
NEXT_PUBLIC_PAYMENT_INTERVAL_MS=10000
```

## How It Works

1. **Content Upload**: Creator uploads audio via CLI or admin interface
2. **Transcoding**: Backend processes audio into HLS streams with multiple qualities
3. **Payment Channel**: Listeners open Fiber Network payment channel to creator's node
4. **Streaming**: Audio plays while payments stream in real-time via keysend
5. **Authorization**: Backend verifies payments and issues streaming tokens

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, Motion
- **Backend**: Hono, TypeScript, FFmpeg (for transcoding)
- **CLI**: Node.js, Commander.js
- **Payments**: Fiber Network (CKB Lightning Network)
- **Deployment**: PM2, systemd, Vercel-ready

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web Player    │────▶│   API Server     │────▶│  Fiber Network  │
│   (Next.js)     │     │   (Hono)         │     │   (Payments)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  HLS Streams     │
                        │  (FFmpeg)        │
                        └──────────────────┘
```

## Resources

- [Fiber Network](https://github.com/nervosnetwork/fiber)
- [Fiber Light Paper](https://github.com/nervosnetwork/fiber/blob/develop/docs/light-paper.md)
- [Nervos CKB Documentation](https://docs.nervos.org/)

## Contributing

Contributions welcome! Please see individual package READMEs for development guidelines.

## License

MIT

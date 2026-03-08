# HLS Audio Streaming

## Overview

With the multi-podcast backend, HLS audio streaming is fully automated. Content creators upload audio files through the admin API, and the backend automatically:

1. Transcodes audio to HLS format with AES-128 encryption
2. Generates playlists and segments
3. Stores files in organized directory structure
4. Serves content through authenticated endpoints

## How It Works

### Upload Flow

```
Admin Upload (MP3/WAV/OGG/AAC)
        ↓
Backend Storage (uploads/)
        ↓
FFmpeg Transcoding (async)
        ↓
HLS Generation (encrypted)
        ↓
Ready for Streaming
```

### Storage Structure

Uploaded and transcoded content is stored in `backend/uploads/`:

```
backend/uploads/
├── {podcast-id-1}/
│   ├── {episode-id-1}/
│   │   ├── source.mp3          # Original uploaded file
│   │   ├── hls/
│   │   │   ├── playlist.m3u8   # HLS playlist
│   │   │   ├── enc.key         # Encryption key
│   │   │   ├── segment_000.ts  # Audio segments
│   │   │   ├── segment_001.ts
│   │   │   └── ...
│   │   └── metadata.json
│   └── ...
├── {podcast-id-2}/
│   └── ...
```

### Episode Status Workflow

1. **draft** - Episode created, no audio uploaded
2. **processing** - Audio uploaded, transcoding in progress
3. **ready** - Transcoding complete, ready to publish
4. **published** - Live and available for streaming

## Configuration

Environment variables for HLS streaming:

```env
# Segment duration in seconds (default: 6)
HLS_SEGMENT_DURATION_SEC=6

# Stream authorization token TTL (default: 300)
STREAM_AUTH_TTL_SEC=300

# Uploads directory (default: backend/uploads)
UPLOADS_DIR=/path/to/uploads
```

## No Manual Setup Required

**The old manual HLS preparation process is no longer needed.** Simply:

1. Create a podcast via admin API
2. Create an episode
3. Upload audio file (MP3, WAV, OGG, or AAC)
4. Wait for transcoding to complete
5. Publish the episode

The backend handles all transcoding automatically using FFmpeg.

## Supported Audio Formats

- **MP3** (`audio/mpeg`, `audio/mp3`)
- **WAV** (`audio/wav`)
- **OGG** (`audio/ogg`)
- **AAC** (`audio/aac`)

Maximum file size: 500 MB per upload

## Security

- All HLS segments are encrypted with AES-128
- Encryption keys are stored securely and never exposed directly
- Stream access requires authenticated tokens
- Tokens are time-limited and scope-restricted

## Streaming Endpoints

Authenticated streaming endpoints:

- `GET /stream/hls/:fileName?token=<token>` - Access HLS content
- Tokens are obtained through payment flow
- Each token grants access to specific segments based on payment

See [API.md](./API.md) for complete streaming API documentation.

# HLS Manual Setup (Single Fixed Audio File)

This project expects one fixed audio source file and pre-generated encrypted HLS output.

## 1) Put your source audio

Place your source file at:

- `media/source/episode.mp3`

You can also pass a custom input path to the script.

If you do not have an audio file yet, download a sample file first:

```bash
mkdir -p media/source
curl -L "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" -o media/source/episode.mp3
```

## 2) Generate encrypted HLS locally

From repo root:

```bash
chmod +x scripts/prepare-hls.sh
scripts/prepare-hls.sh
```

Optional custom paths:

```bash
scripts/prepare-hls.sh /absolute/path/to/input.mp3 /absolute/path/to/output_hls_dir
```

By default this creates:

- `media/hls/playlist.m3u8`
- `media/hls/enc.key`
- `media/hls/segment_000.ts`, `segment_001.ts`, ...

## 3) Start backend

```bash
pnpm dev:api
```

The backend reads files from `HLS_DIR` (default `../media/hls` from backend folder).

## 4) Dummy verify and authorize

Verify payment (currently dummy-agree):

```bash
curl -X POST http://localhost:8787/payments/verify \
  -H "content-type: application/json" \
  -d '{"requestedSeconds":30,"paymentHash":"0xdemo"}'
```

Authorize stream with returned `paymentSessionId`:

```bash
curl -X POST http://localhost:8787/stream/authorize \
  -H "content-type: application/json" \
  -d '{"paymentSessionId":"<FROM_VERIFY>","requestedSeconds":30}'
```

Response includes `playlistUrl`, for example:

- `/stream/hls/playlist.m3u8?token=<TOKEN>`

## 5) Playback URL for player/hls.js

Use full URL in player:

- `http://localhost:8787/stream/hls/playlist.m3u8?token=<TOKEN>`

The token is short-lived (`STREAM_AUTH_TTL_SEC`) and segment access is capped by granted seconds.

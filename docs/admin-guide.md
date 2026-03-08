# Admin Guide: Managing Multiple Podcasts

This guide walks you through creating and managing multiple podcasts with episodes using the Fiber Audio Player backend admin API.

You can manage content using either the **CLI** (recommended for most operations) or direct **API calls** (for automation and scripting). See the [CLI Reference](./cli.md) for command-line documentation.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start Workflow](#quick-start-workflow)
- [Step-by-Step Guide](#step-by-step-guide)
  - [1. Create Podcasts](#1-create-podcasts)
  - [2. Add Episodes](#2-add-episodes)
  - [3. Upload Audio Files](#3-upload-audio-files)
  - [4. Monitor Transcoding](#4-monitor-transcoding)
  - [5. Publish Episodes](#5-publish-episodes)
- [Managing Multiple Podcasts](#managing-multiple-podcasts)
- [Episode Status Workflow](#episode-status-workflow)
- [Common Operations](#common-operations)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

1. **Backend running** (locally or deployed)
   ```bash
   cd backend && pnpm dev
   ```

2. **Admin API Key** set in your environment (`ADMIN_API_KEY`)

3. **CLI installed** (optional but recommended)
   ```bash
   cd apps/cli && pnpm build
   # Or use directly with: npx tsx src/index.ts
   ```

4. **cURL or HTTP client** (curl, httpie, Postman, etc.) - only needed if not using CLI

5. **Audio files** ready for upload (MP3, WAV, OGG, or AAC format)

---

## Quick Start Workflow

Here's the typical workflow for setting up a podcast with episodes:

```
1. Create Podcast → 2. Create Episode → 3. Upload Audio → 4. Wait for Transcoding → 5. Publish
```

### Using the CLI (Recommended)

```bash
# 1. Authenticate
fap auth login --api-key "your-admin-api-key"

# 2. Create a podcast
PODCAST=$(fap podcast create --title "My Podcast" --description "A great podcast" --format json)
PODCAST_ID=$(echo $PODCAST | jq -r '.id')

# 3. Create episode with upload
fap episode create \
  --podcast-id "$PODCAST_ID" \
  --title "Episode 1" \
  --description "Introduction" \
  --file ./episode1.mp3 \
  --wait

# 4. Publish when ready
fap episode list --podcast-id "$PODCAST_ID" --status ready
fap episode publish "episode-id-from-list"
```

### Using cURL (Alternative)

```bash
# Set your API key and base URL
API_KEY="your-admin-api-key"
BASE_URL="http://localhost:8787"

# 1. Create a podcast
PODCAST=$(curl -s -X POST "$BASE_URL/admin/podcasts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "My Podcast", "description": "A great podcast"}')
PODCAST_ID=$(echo $PODCAST | jq -r '.podcast.id')

# 2. Create episodes
curl -X POST "$BASE_URL/admin/episodes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"podcast_id\": \"$PODCAST_ID\", \"title\": \"Episode 1\", \"description\": \"Introduction\", \"price_per_second\": \"10000\"}"

# 3. Upload audio (repeat for each episode)
curl -X POST "$BASE_URL/admin/episodes/{episode_id}/upload" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@episode1.mp3"

# 4. Check status until 'ready'
curl "$BASE_URL/admin/episodes/{episode_id}" \
  -H "Authorization: Bearer $API_KEY"

# 5. Publish
curl -X POST "$BASE_URL/admin/episodes/{episode_id}/publish" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Step-by-Step Guide

### 1. Create Podcasts

Create each podcast using the admin API:

**Request:**
```bash
curl -X POST http://localhost:8787/admin/podcasts \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Talk Weekly",
    "description": "Weekly discussions about technology and programming"
  }'
```

**Response:**
```json
{
  "ok": true,
  "podcast": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Tech Talk Weekly",
    "description": "Weekly discussions about technology and programming",
    "created_at": 1704067200000
  }
}
```

**Save the `id`** - you'll need it to create episodes.

**Create multiple podcasts:**
```bash
# Podcast 1: Tech Talk
TECH_PODCAST=$(curl -s -X POST http://localhost:8787/admin/podcasts \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Tech Talk Weekly", "description": "Tech discussions"}')
TECH_ID=$(echo $TECH_PODCAST | jq -r '.podcast.id')

# Podcast 2: Music Hour
MUSIC_PODCAST=$(curl -s -X POST http://localhost:8787/admin/podcasts \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Music Hour", "description": "Music reviews"}')
MUSIC_ID=$(echo $MUSIC_PODCAST | jq -r '.podcast.id')

# Podcast 3: News Daily
NEWS_PODCAST=$(curl -s -X POST http://localhost:8787/admin/podcasts \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "News Daily", "description": "Daily news updates"}')
NEWS_ID=$(echo $NEWS_PODCAST | jq -r '.podcast.id')
```

---

### 2. Add Episodes

Create episodes for each podcast:

**Request:**
```bash
curl -X POST http://localhost:8787/admin/episodes \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Getting Started",
    "description": "Introduction to the series",
    "price_per_second": "10000"
  }'
```

**Response:**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Getting Started",
    "description": "Introduction to the series",
    "duration": null,
    "storage_path": "",
    "price_per_second": "10000",
    "status": "draft",
    "created_at": 1704067200000
  }
}
```

**Key fields:**
- `podcast_id`: The UUID from step 1
- `price_per_second`: Price in Shannon (CKB smallest unit). "10000" = 10,000 Shannon per second
- `status`: Starts as "draft"

**Add multiple episodes to a podcast:**
```bash
# Create 3 episodes for Tech Talk podcast
for i in 1 2 3; do
  curl -X POST http://localhost:8787/admin/episodes \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"podcast_id\": \"$TECH_ID\",
      \"title\": \"Episode $i: Topic $i\",
      \"description\": \"Discussion about topic $i\",
      \"price_per_second\": \"10000\"
    }"
done
```

---

### 3. Upload Audio Files

Upload audio for each episode:

**Request:**
```bash
curl -X POST http://localhost:8787/admin/episodes/{episode-id}/upload \
  -H "Authorization: Bearer your-api-key" \
  -F "file=@/path/to/your/audio-file.mp3"
```

**Allowed formats:**
- MP3 (`audio/mpeg`, `audio/mp3`)
- WAV (`audio/wav`)
- OGG (`audio/ogg`)
- AAC (`audio/aac`)

**Max file size:** 500 MB

**Response:**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "processing",
    "storage_path": "/uploads/.../source.mp3"
  },
  "message": "File uploaded and transcoding queued"
}
```

**Note:** The episode status changes from `draft` to `processing` after upload.

**Batch upload script:**
```bash
#!/bin/bash
# upload-episodes.sh

API_KEY="your-api-key"
EPISODES_DIR="/path/to/episodes"

# Array of episode IDs and corresponding files
declare -A EPISODES=(
  ["episode-uuid-1"]="episode1.mp3"
  ["episode-uuid-2"]="episode2.mp3"
  ["episode-uuid-3"]="episode3.mp3"
)

for EPISODE_ID in "${!EPISODES[@]}"; do
  FILE="${EPISODES[$EPISODE_ID]}"
  echo "Uploading $FILE to episode $EPISODE_ID..."
  
  curl -X POST http://localhost:8787/admin/episodes/$EPISODE_ID/upload \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$EPISODES_DIR/$FILE"
  
  echo "Done!"
done
```

---

### 4. Monitor Transcoding

After upload, the backend automatically transcodes the audio to HLS format. Check the episode status:

**Request:**
```bash
curl http://localhost:8787/admin/episodes/{episode-id} \
  -H "Authorization: Bearer your-api-key"
```

**Response (while processing):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "processing",
    "duration": null
  }
}
```

**Response (when ready):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "ready",
    "duration": 1800
  }
}
```

**Wait for ready status before publishing.**

**Monitor script:**
```bash
#!/bin/bash
# wait-for-ready.sh

API_KEY="your-api-key"
EPISODE_ID="your-episode-uuid"

echo "Waiting for episode $EPISODE_ID to be ready..."

while true; do
  STATUS=$(curl -s http://localhost:8787/admin/episodes/$EPISODE_ID \
    -H "Authorization: Bearer $API_KEY" | jq -r '.episode.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "ready" ]; then
    echo "Episode is ready to publish!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Transcoding failed!"
    exit 1
  fi
  
  sleep 10
done
```

---

### 5. Publish Episodes

Once status is `ready`, publish the episode to make it available to listeners:

**Request:**
```bash
curl -X POST http://localhost:8787/admin/episodes/{episode-id}/publish \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "published"
  },
  "message": "Episode published successfully"
}
```

**Important:** Once published, you cannot:
- Edit the episode metadata
- Re-upload audio
- Change pricing

Make sure everything is correct before publishing!

---

## Managing Multiple Podcasts

### List All Podcasts

```bash
curl http://localhost:8787/admin/podcasts \
  -H "Authorization: Bearer your-api-key"
```

### List Episodes for a Podcast

```bash
# Get all episodes (including unpublished)
curl "http://localhost:8787/admin/episodes?podcast_id={podcast-id}" \
  -H "Authorization: Bearer your-api-key"

# Get only published episodes (public API)
curl "http://localhost:8787/api/podcasts/{podcast-id}/episodes"
```

### Update Podcast Metadata

```bash
curl -X PUT http://localhost:8787/admin/podcasts/{podcast-id} \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "description": "Updated description"
  }'
```

### Delete a Podcast

⚠️ **Warning:** This deletes all episodes and their audio files!

```bash
curl -X DELETE http://localhost:8787/admin/podcasts/{podcast-id} \
  -H "Authorization: Bearer your-api-key"
```

---

## Episode Status Workflow

```
draft → processing → ready → published
  ↑                                    ↓
  └──────────── archived ←─────────────┘
```

| Status | Description | Actions Allowed |
|--------|-------------|-----------------|
| `draft` | Episode created, no audio uploaded | Edit metadata, upload audio, delete |
| `processing` | Audio uploaded, transcoding in progress | Monitor status only |
| `ready` | Transcoding complete, ready to publish | Publish, edit metadata, delete |
| `published` | Live and available to listeners | None (read-only) |
| `archived` | No longer available | Can be restored (future feature) |

---

## Common Operations

### Complete Setup Script

Here's a complete script to set up multiple podcasts with episodes:

```bash
#!/bin/bash
# setup-podcasts.sh

API_KEY="your-admin-api-key"
BASE_URL="http://localhost:8787"
AUDIO_DIR="./audio-files"

# Function to create podcast
create_podcast() {
  local title="$1"
  local description="$2"
  
  curl -s -X POST "$BASE_URL/admin/podcasts" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"title\": \"$title\", \"description\": \"$description\"}" | jq -r '.podcast.id'
}

# Function to create episode
create_episode() {
  local podcast_id="$1"
  local title="$2"
  local description="$3"
  local price="$4"
  
  curl -s -X POST "$BASE_URL/admin/episodes" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"podcast_id\": \"$podcast_id\",
      \"title\": \"$title\",
      \"description\": \"$description\",
      \"price_per_second\": \"$price\"
    }" | jq -r '.episode.id'
}

# Function to upload audio
upload_audio() {
  local episode_id="$1"
  local file_path="$2"
  
  curl -s -X POST "$BASE_URL/admin/episodes/$episode_id/upload" \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$file_path" | jq -r '.message'
}

# Create podcasts
echo "Creating podcasts..."
TECH_ID=$(create_podcast "Tech Talk Weekly" "Weekly tech discussions")
MUSIC_ID=$(create_podcast "Music Hour" "Music reviews and interviews")

echo "Tech Talk Podcast ID: $TECH_ID"
echo "Music Hour Podcast ID: $MUSIC_ID"

# Create episodes for Tech Talk
echo -e "\nCreating Tech Talk episodes..."
TECH_EP1=$(create_episode "$TECH_ID" "Ep 1: Introduction" "Welcome to Tech Talk" "10000")
TECH_EP2=$(create_episode "$TECH_ID" "Ep 2: AI Trends" "Latest in AI" "10000")

# Create episodes for Music Hour
echo -e "\nCreating Music Hour episodes..."
MUSIC_EP1=$(create_episode "$MUSIC_ID" "Ep 1: Jazz Classics" "Best jazz albums" "5000")

# Upload audio
echo -e "\nUploading audio files..."
upload_audio "$TECH_EP1" "$AUDIO_DIR/tech-ep1.mp3"
upload_audio "$TECH_EP2" "$AUDIO_DIR/tech-ep2.mp3"
upload_audio "$MUSIC_EP1" "$AUDIO_DIR/music-ep1.mp3"

echo -e "\n✅ Setup complete! Monitor episode status and publish when ready."
echo "Episode IDs:"
echo "  Tech Talk Ep 1: $TECH_EP1"
echo "  Tech Talk Ep 2: $TECH_EP2"
echo "  Music Hour Ep 1: $MUSIC_EP1"
```

### Update Episode Before Publishing

```bash
# Edit episode metadata while in draft or ready status
curl -X PUT http://localhost:8787/admin/episodes/{episode-id} \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "description": "Updated description",
    "price_per_second": "15000"
  }'
```

---

## Troubleshooting

### "Cannot upload to a published episode"

**Problem:** Trying to re-upload audio to a published episode.

**Solution:** Published episodes are immutable. Create a new episode instead.

### "Episode must be in 'ready' status"

**Problem:** Trying to publish before transcoding completes.

**Solution:** Wait for the `processing` status to change to `ready`. Check status:
```bash
curl http://localhost:8787/admin/episodes/{id} -H "Authorization: Bearer $API_KEY"
```

### "Podcast not found"

**Problem:** Invalid podcast ID when creating an episode.

**Solution:** List podcasts to get correct IDs:
```bash
curl http://localhost:8787/admin/podcasts -H "Authorization: Bearer $API_KEY"
```

### Audio upload fails

**Problem:** File too large or wrong format.

**Solutions:**
- Check file is under 500 MB
- Check format is MP3, WAV, OGG, or AAC
- Check `Content-Type` header is not set (curl sets it automatically for multipart)

### Transcoding never completes

**Problem:** FFmpeg not installed or not in PATH.

**Solution:** Install FFmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Verify installation
ffmpeg -version
```

### "Unauthorized" errors

**Problem:** Missing or incorrect API key.

**Solution:** Check your `ADMIN_API_KEY` environment variable and ensure the `Authorization: Bearer` header is correct.

---

## Next Steps

Once your podcasts and episodes are published:

1. **Test the public API:**
   ```bash
   curl http://localhost:8787/api/podcasts
   ```

2. **Set up the frontend** to browse and play episodes

3. **Test payment flow** to ensure listeners can pay and stream

4. **Configure production deployment** using the systemd or PM2 guides

See also:
- [CLI Reference](./cli.md) - Command-line tool for managing content
- [API Reference](./API.md) - Complete API documentation
- [HLS Manual Setup](./hls-manual-setup.md) - HLS streaming setup

---

## CLI Alternative

For day-to-day operations, consider using the [CLI](./cli.md) instead of direct API calls:

```bash
# Login once
fap auth login --api-key "your-key"

# Manage podcasts interactively
fap podcast create --interactive
fap podcast list
fap podcast get <id> --include-episodes

# Manage episodes with full workflow
fap episode create \
  --podcast-id <podcast-id> \
  --title "Episode 1" \
  --file ./audio.mp3 \
  --wait \
  --publish
```

The CLI provides:
- Interactive prompts for data entry
- Formatted tables and JSON output
- Automatic retry and error handling
- Progress indicators for uploads
- Status polling with `--wait` flag

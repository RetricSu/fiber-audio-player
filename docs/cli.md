# CLI Reference

The Fiber Audio Player CLI (`fap`) is a command-line tool for managing podcasts and episodes. It provides a complete interface to the admin API without needing to write curl commands or scripts.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [Authentication](#authentication)
  - [Podcast Management](#podcast-management)
  - [Episode Management](#episode-management)
- [Episode Status Workflow](#episode-status-workflow)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Tips](#tips)

---

## Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd fiber-audio-player

# Install dependencies
pnpm install

# Build the CLI
cd apps/cli
pnpm build

# Link globally (optional)
pnpm link --global
```

### Local Development

```bash
# Run directly without building
pnpm dev

# Or use tsx
cd apps/cli
npx tsx src/index.ts --help
```

### Verify Installation

```bash
fap --version
fap --help
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FAP_API_KEY` | API key for authentication | none |
| `FAP_URL` | Backend URL | `http://localhost:8787` |

### Config File

Configuration is stored at `~/.fiber-audio-player/cli.json`:

```json
{
  "apiUrl": "http://localhost:8787",
  "apiToken": "your-api-key-here"
}
```

The config file is created automatically when you run `fap auth login`.

### Using Environment Variables

```bash
# Set for current session
export FAP_API_KEY="your-api-key"
export FAP_URL="http://localhost:8787"

# Or use with any command
FAP_API_KEY="your-key" fap podcast list
```

---

## Quick Start

```bash
# 1. Authenticate with the backend
fap auth login
# Enter your API key when prompted

# 2. Verify everything is working
fap auth doctor

# 3. Create your first podcast
fap podcast create --title "My Podcast" --description "A great podcast"

# 4. Create an episode with audio upload
fap episode create \
  --podcast-id <podcast-id> \
  --title "Episode 1" \
  --description "Welcome to the show" \
  --file ./audio.mp3

# 5. Publish when transcoding is complete
fap episode publish <episode-id>

# 6. List all your content
fap podcast list
fap episode list --podcast-id <podcast-id>
```

---

## Commands

### Authentication

#### `fap auth login`

Authenticate with the Fiber Audio Player backend.

**Options:**

| Option | Description |
|--------|-------------|
| `-k, --api-key <key>` | API key for authentication |
| `-u, --backend-url <url>` | Backend URL (default: http://localhost:8787) |

**Examples:**

```bash
# Interactive login (prompts for API key)
fap auth login

# Non-interactive login
fap auth login --api-key "your-key" --backend-url "http://localhost:8787"

# Using environment variables
export FAP_API_KEY="your-key"
export FAP_URL="http://localhost:8787"
fap auth login
```

**Note:** The CLI validates the API key before saving the configuration.

---

#### `fap auth logout`

Remove stored credentials.

```bash
fap auth logout
```

This deletes the config file at `~/.fiber-audio-player/cli.json`.

---

#### `fap auth config`

Show current configuration.

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --show-token` | Show the full API token (default: masked) |

**Examples:**

```bash
# Show config with masked token
fap auth config

# Show config with full token
fap auth config --show-token
```

---

#### `fap auth doctor`

Check authentication health and connectivity.

```bash
fap auth doctor
```

This command verifies:

1. Configuration file exists
2. Backend is reachable
3. API token is valid

Use this to troubleshoot connection issues.

---

### Podcast Management

#### `fap podcast create`

Create a new podcast.

**Options:**

| Option | Description | Required |
|--------|-------------|----------|
| `-t, --title <title>` | Podcast title | Yes |
| `-d, --description <description>` | Podcast description | No |
| `-i, --interactive` | Use interactive prompts | No |

**Examples:**

```bash
# Create with flags
fap podcast create --title "Tech Talk" --description "Weekly tech discussions"

# Interactive mode
fap podcast create --interactive

# Minimal creation
fap podcast create -t "My Podcast"
```

---

#### `fap podcast list`

List all podcasts.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --format <format>` | Output format: table, json, csv | table |
| `-o, --output <file>` | Write output to file | none |

**Examples:**

```bash
# Default table view
fap podcast list

# JSON output
fap podcast list --format json

# CSV output to file
fap podcast list --format csv --output podcasts.csv

# JSON for scripting
PODCASTS=$(fap podcast list --format json)
echo $PODCASTS | jq '.[0].id'
```

---

#### `fap podcast get`

Get podcast details.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Podcast ID (UUID) |

**Options:**

| Option | Description |
|--------|-------------|
| `-e, --include-episodes` | Include episode list |

**Examples:**

```bash
# Basic details
fap podcast get 550e8400-e29b-41d4-a716-446655440000

# With episodes
fap podcast get 550e8400-e29b-41d4-a716-446655440000 --include-episodes
```

---

#### `fap podcast update`

Update podcast metadata.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Podcast ID (UUID) |

**Options:**

| Option | Description |
|--------|-------------|
| `-t, --title <title>` | New title |
| `-d, --description <description>` | New description |

**Examples:**

```bash
# Update title
fap podcast update 550e8400-e29b-41d4-a716-446655440000 --title "New Title"

# Update description
fap podcast update 550e8400-e29b-41d4-a716-446655440000 --description "New description"

# Update both
fap podcast update 550e8400-e29b-41d4-a716-446655440000 -t "New Title" -d "New description"
```

**Note:** Cannot update podcasts with published episodes.

---

#### `fap podcast delete`

Delete a podcast and all its episodes.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Podcast ID (UUID) |

**Options:**

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

**Examples:**

```bash
# With confirmation prompt
fap podcast delete 550e8400-e29b-41d4-a716-446655440000

# Skip confirmation
fap podcast delete 550e8400-e29b-41d4-a716-446655440000 --force
```

**Warning:** This permanently deletes the podcast and ALL its episodes and audio files.

---

### Episode Management

#### `fap episode create`

Create a new episode.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--podcast-id <id>` | Podcast ID | Required |
| `--title <title>` | Episode title | Required |
| `--description <desc>` | Episode description | none |
| `--price-per-second <price>` | Price per second in shannon | 10000 |
| `--file <path>` | Audio file to upload after creation | none |
| `--publish` | Publish episode after upload (if ready) | false |
| `--wait` | Wait for transcoding to complete | false |

**Examples:**

```bash
# Create draft episode
fap episode create \
  --podcast-id 550e8400-e29b-41d4-a716-446655440000 \
  --title "Episode 1" \
  --description "Welcome to the show"

# Create with custom pricing
fap episode create \
  --podcast-id 550e8400-e29b-41d4-a716-446655440000 \
  --title "Premium Episode" \
  --price-per-second 50000

# Create and upload in one command
fap episode create \
  --podcast-id 550e8400-e29b-41d4-a716-446655440000 \
  --title "Episode 1" \
  --file ./audio.mp3

# Full workflow: create, upload, wait, and publish
fap episode create \
  --podcast-id 550e8400-e29b-41d4-a716-446655440000 \
  --title "Episode 1" \
  --file ./audio.mp3 \
  --wait \
  --publish
```

---

#### `fap episode list`

List episodes.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--podcast-id <id>` | Filter by podcast ID | none |
| `--status <status>` | Filter by status | all |

Valid statuses: `draft`, `processing`, `ready`, `published`, `all`

**Examples:**

```bash
# All episodes
fap episode list

# Episodes for specific podcast
fap episode list --podcast-id 550e8400-e29b-41d4-a716-446655440000

# Only published episodes
fap episode list --status published

# Draft episodes ready for upload
fap episode list --status draft
```

---

#### `fap episode get`

Get episode details.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Episode ID (UUID) |

**Examples:**

```bash
fap episode get 550e8400-e29b-41d4-a716-446655440001
```

---

#### `fap episode update`

Update episode metadata.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Episode ID (UUID) |

**Options:**

| Option | Description |
|--------|-------------|
| `--title <title>` | New title |
| `--description <desc>` | New description |
| `--price-per-second <price>` | New price per second in shannon |

**Examples:**

```bash
# Update title
fap episode update 550e8400-e29b-41d4-a716-446655440001 --title "New Title"

# Update price
fap episode update 550e8400-e29b-41d4-a716-446655440001 --price-per-second 20000

# Update multiple fields
fap episode update 550e8400-e29b-41d4-a716-446655440001 \
  --title "New Title" \
  --description "New description" \
  --price-per-second 15000
```

**Note:** Cannot update published episodes.

---

#### `fap episode publish`

Publish an episode. Episode status must be `ready`.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Episode ID (UUID) |

**Examples:**

```bash
fap episode publish 550e8400-e29b-41d4-a716-446655440001
```

**Important:** Once published, you cannot:

- Edit the episode metadata
- Re-upload audio
- Change pricing

Make sure everything is correct before publishing!

---

#### `fap episode unpublish`

Unpublish an episode (change status from `published` to `ready`).

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Episode ID (UUID) |

**Examples:**

```bash
fap episode unpublish 550e8400-e29b-41d4-a716-446655440001
```

**Note:** Requires backend support for the unpublish endpoint.

---

#### `fap episode delete`

Delete an episode.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Episode ID (UUID) |

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompt |
| `--delete-files` | Also delete associated files |

**Examples:**

```bash
# With confirmation
fap episode delete 550e8400-e29b-41d4-a716-446655440001

# Skip confirmation
fap episode delete 550e8400-e29b-41d4-a716-446655440001 --force
```

---

#### `fap episode upload`

Upload audio file for an episode.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<id>` | Episode ID (UUID) |

**Options:**

| Option | Description |
|--------|-------------|
| `--file <path>` | Path to audio file (required) |
| `--wait` | Wait for transcoding to complete |

**Examples:**

```bash
# Upload file
fap episode upload 550e8400-e29b-41d4-a716-446655440001 --file ./audio.mp3

# Upload and wait for transcoding
fap episode upload 550e8400-e29b-41d4-a716-446655440001 --file ./audio.mp3 --wait
```

**Supported formats:** MP3, WAV, OGG, AAC

**Max file size:** 500 MB

---

## Episode Status Workflow

Episodes follow a lifecycle from creation to publication:

```
draft → processing → ready → published
```

| Status | Description | Actions Allowed |
|--------|-------------|-----------------|
| `draft` | Episode created, no audio uploaded | Edit metadata, upload audio, delete |
| `processing` | Audio uploaded, transcoding in progress | Monitor status only |
| `ready` | Transcoding complete, ready to publish | Publish, edit metadata, delete |
| `published` | Live and available to listeners | None (read-only) |

### Status Transitions

1. **Create Episode** -> Status: `draft`
2. **Upload Audio** -> Status: `processing`
3. **Transcoding Complete** -> Status: `ready`
4. **Publish** -> Status: `published`

Check status with: `fap episode get <id>` or `fap episode list --status processing`

---

## Examples

### Complete Podcast Setup

```bash
#!/bin/bash
# setup-podcast.sh

# Configuration
API_KEY="your-api-key"
AUDIO_DIR="./audio-files"

# Login
fap auth login --api-key "$API_KEY"

# Create podcast
echo "Creating podcast..."
PODCAST_OUTPUT=$(fap podcast create --title "My Show" --description "A great show" --format json)
PODCAST_ID=$(echo "$PODCAST_OUTPUT" | jq -r '.id')
echo "Podcast ID: $PODCAST_ID"

# Create and upload episodes
for file in "$AUDIO_DIR"/*.mp3; do
  filename=$(basename "$file" .mp3)
  echo "Creating episode: $filename"
  
  fap episode create \
    --podcast-id "$PODCAST_ID" \
    --title "$filename" \
    --file "$file" \
    --wait
done

# List ready episodes and publish
echo "Publishing episodes..."
fap episode list --podcast-id "$PODCAST_ID" --status ready --format json | \
  jq -r '.[].id' | \
  while read -r episode_id; do
    fap episode publish "$episode_id"
  done

echo "Done!"
```

### Batch Operations

```bash
# Export all podcasts to CSV
fap podcast list --format csv --output podcasts.csv

# Find all draft episodes and upload audio
for episode_id in $(fap episode list --status draft --format json | jq -r '.[].id'); do
  # Assuming audio files are named by episode ID
  if [ -f "audio/${episode_id}.mp3" ]; then
    fap episode upload "$episode_id" --file "audio/${episode_id}.mp3" --wait
    fap episode publish "$episode_id"
  fi
done
```

### CI/CD Integration

```yaml
# .github/workflows/deploy-content.yml
name: Deploy Podcast Content

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install CLI
        run: npm install -g @fiber-audio/cli
      
      - name: Authenticate
        run: fap auth login --api-key "${{ secrets.FAP_API_KEY }}" --backend-url "${{ vars.FAP_URL }}"
      
      - name: Verify connection
        run: fap auth doctor
      
      - name: Sync content
        run: |
          # Your content sync script here
          ./scripts/sync-podcasts.sh
```

---

## Troubleshooting

### "Not authenticated. Run 'fap login' first"

**Problem:** No valid configuration found.

**Solution:**

```bash
# Check if logged in
fap auth config

# Login
fap auth login

# Verify with doctor
fap auth doctor
```

### "API error (401): Invalid API key"

**Problem:** API key is invalid or expired.

**Solution:**

1. Check your API key in the backend configuration
2. Re-authenticate: `fap auth login`
3. Verify environment variables aren't overriding: `env | grep FAP`

### "Cannot upload to a published episode"

**Problem:** Trying to re-upload audio to a published episode.

**Solution:** Published episodes are immutable. Create a new episode instead.

### "Episode must be in 'ready' status"

**Problem:** Trying to publish before transcoding completes.

**Solution:**

```bash
# Check current status
fap episode get <episode-id>

# Wait for transcoding (if uploading)
fap episode upload <episode-id> --file audio.mp3 --wait

# Then publish
fap episode publish <episode-id>
```

### "Podcast not found"

**Problem:** Invalid podcast ID.

**Solution:**

```bash
# List podcasts to get correct IDs
fap podcast list

# Use the full UUID from the output
```

### Audio upload fails

**Problem:** File too large or wrong format.

**Solutions:**

- Check file is under 500 MB
- Check format is MP3, WAV, OGG, or AAC
- Verify file exists and is readable: `ls -la <file>`

### Connection refused errors

**Problem:** Backend not running or wrong URL.

**Solution:**

```bash
# Check backend is running
curl http://localhost:8787/healthz

# Verify config
fap auth config

# Update if needed
fap auth login --backend-url http://localhost:8787
```

---

## Tips

### Use JSON Output for Scripting

```bash
# Get podcast ID for use in scripts
PODCAST_ID=$(fap podcast list --format json | jq -r '.[0].id')

# Create episode and capture ID
EPISODE_ID=$(fap episode create \
  --podcast-id "$PODCAST_ID" \
  --title "New Episode" \
  --format json | jq -r '.id')

# Check if any episodes are still processing
PROCESSING_COUNT=$(fap episode list --status processing --format json | jq 'length')
if [ "$PROCESSING_COUNT" -gt 0 ]; then
  echo "Still processing $PROCESSING_COUNT episodes..."
fi
```

### Combine Commands with Wait

The `--wait` flag is useful for automation:

```bash
# Complete workflow in one go
fap episode create \
  --podcast-id "$PODCAST_ID" \
  --title "Episode 1" \
  --file ./audio.mp3 \
  --wait && \
fap episode publish "$EPISODE_ID"
```

### Filter by Status

```bash
# Quick status overview
fap episode list --status published | wc -l
fap episode list --status ready | wc -l
fap episode list --status processing | wc -l
fap episode list --status draft | wc -l
```

### Environment-Based Configuration

```bash
# .bashrc or .zshrc
alias fap-prod='FAP_URL=https://api.example.com fap'
alias fap-dev='FAP_URL=http://localhost:8787 fap'

# Usage
fap-prod podcast list
fap-dev episode list
```

### Backup Your Content

```bash
# Export all podcasts and episodes
mkdir -p backup/$(date +%Y%m%d)
fap podcast list --format json > backup/$(date +%Y%m%d)/podcasts.json
fap episode list --format json > backup/$(date +%Y%m%d)/episodes.json
```

### Use Interactive Mode for Exploration

```bash
# When you're unsure of fields, use interactive mode
fap podcast create --interactive
```

---

## See Also

- [Admin Guide](./admin-guide.md) - Web API alternative to CLI
- [API Reference](./API.md) - Complete API documentation
- [Testing Guide](./testing-guide.md) - End-to-end testing with CLI

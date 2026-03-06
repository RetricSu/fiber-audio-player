#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_FILE="${1:-$ROOT_DIR/media/source/episode.mp3}"
OUTPUT_DIR="${2:-$ROOT_DIR/media/hls}"
SEGMENT_DURATION="${HLS_SEGMENT_DURATION_SEC:-6}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Error: ffmpeg not found. Please install ffmpeg first." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl not found." >&2
  exit 1
fi

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: input audio file not found: $INPUT_FILE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

KEY_FILE="$OUTPUT_DIR/enc.key"
KEY_INFO_FILE="$OUTPUT_DIR/enc.keyinfo"
PLAYLIST_FILE="$OUTPUT_DIR/playlist.m3u8"
SEGMENT_PATTERN="$OUTPUT_DIR/segment_%03d.ts"

openssl rand 16 > "$KEY_FILE"
IV_HEX="$(openssl rand -hex 16)"

cat > "$KEY_INFO_FILE" <<EOF
enc.key
$KEY_FILE
$IV_HEX
EOF

rm -f "$OUTPUT_DIR"/*.ts "$PLAYLIST_FILE"

ffmpeg -y \
  -i "$INPUT_FILE" \
  -c:a aac \
  -b:a 128k \
  -f hls \
  -hls_time "$SEGMENT_DURATION" \
  -hls_playlist_type vod \
  -hls_segment_filename "$SEGMENT_PATTERN" \
  -hls_key_info_file "$KEY_INFO_FILE" \
  "$PLAYLIST_FILE"

rm -f "$KEY_INFO_FILE"

echo "Encrypted HLS generated:"
echo "  Playlist: $PLAYLIST_FILE"
echo "  Key:      $KEY_FILE"
echo "  Segments: $OUTPUT_DIR/segment_*.ts"

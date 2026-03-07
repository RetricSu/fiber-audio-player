# Fiber Audio Player API Documentation

Complete API reference for the Fiber Audio Player backend.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Health & Node Info](#health--node-info)
- [Public API](#public-api)
- [Payment API](#payment-api)
- [Streaming API](#streaming-api)
- [Admin API - Podcasts](#admin-api---podcasts)
- [Admin API - Episodes](#admin-api---episodes)

---

## Overview

**Base URL:** `http://localhost:8787` (default)  
**Content-Type:** `application/json` for all endpoints except file uploads

### Request Size Limits

| Endpoint Type | Max Size |
|--------------|----------|
| JSON requests | 10 MB |
| File uploads (`/upload`) | 500 MB |

---

## Authentication

### Admin API Authentication

All admin endpoints require Bearer token authentication using the `ADMIN_API_KEY` environment variable.

**Header Format:**
```
Authorization: Bearer {ADMIN_API_KEY}
```

**Example:**
```bash
curl -H "Authorization: Bearer my-secret-api-key" \
     http://localhost:8787/admin/podcasts
```

### Public API

Public endpoints do not require authentication.

### Payment API

Payment endpoints are open but require valid session and invoice data.

---

## Error Handling

### Error Response Format

All errors follow this standardized format:

```json
{
  "ok": false,
  "error": "Human-readable error message"
}
```

Validation errors may include additional details:

```json
{
  "ok": false,
  "error": "title: Title is required; description: Description must be 1000 characters or less",
  "details": [
    {
      "path": ["title"],
      "message": "Title is required"
    }
  ]
}
```

### HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Missing or invalid API key |
| 402 | Payment Required - Payment verification failed |
| 403 | Forbidden - Segment not authorized |
| 404 | Not Found - Resource does not exist |
| 413 | Payload Too Large - Request exceeds size limits |
| 500 | Internal Server Error |
| 502 | Bad Gateway - Fiber node unreachable |

---

## Health & Node Info

### Health Check

Check if the backend service is running.

**GET** `/healthz`

**Auth Required:** No

**Response (200):**
```json
{
  "ok": true,
  "service": "fiber-audio-backend"
}
```

---

### Get Node Info

Get information about the connected Fiber Network node.

**GET** `/node-info`

**Auth Required:** No

**Response (200):**
```json
{
  "ok": true,
  "node": {
    "nodeName": "MyFiberNode",
    "nodeId": "03abc123...",
    "addresses": ["/ip4/127.0.0.1/tcp/8228/p2p/Qm..."],
    "openChannelAutoAcceptMin": "0x64"
  }
}
```

**Response (502) - Node Unreachable:**
```json
{
  "ok": false,
  "error": "Failed to reach Fiber node"
}
```

---

## Public API

### List All Podcasts

Get a list of all published podcasts.

**GET** `/api/podcasts`

**Auth Required:** No

**Caching:** `public, max-age=300` (5 minutes)

**Response (200):**
```json
{
  "ok": true,
  "podcasts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "My Awesome Podcast",
      "description": "A podcast about awesome things",
      "created_at": 1704067200000
    }
  ]
}
```

---

### List Episodes for a Podcast

Get all published episodes for a specific podcast.

**GET** `/api/podcasts/:id/episodes`

**Auth Required:** No

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Podcast ID |

**Caching:** `public, max-age=300` (5 minutes)

**Response (200):**
```json
{
  "ok": true,
  "episodes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Episode 1: Getting Started",
      "description": "Welcome to the first episode",
      "duration": 1800,
      "price_per_second": "10000",
      "status": "published",
      "hls_url": "/stream/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/hls/playlist.m3u8",
      "created_at": 1704067200000
    }
  ]
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "Podcast not found"
}
```

---

### Get Episode Details

Get detailed information about a specific published episode.

**GET** `/api/episodes/:id`

**Auth Required:** No

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Episode ID |

**Caching:** `public, max-age=60` (1 minute)

**Response (200):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Getting Started",
    "description": "Welcome to the first episode",
    "duration": 1800,
    "price_per_second": "10000",
    "status": "published",
    "hls_url": "/stream/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/hls/playlist.m3u8",
    "created_at": 1704067200000
  }
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "Episode not found"
}
```

---

## Payment API

### Create Streaming Session

Start a new streaming session for an episode. This must be called before creating invoices.

**POST** `/sessions/create`

**Auth Required:** No

**Request Body:**
```json
{
  "episodeId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Field Constraints:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| episodeId | UUID | Yes | ID of the published episode to stream |

**Response (200):**
```json
{
  "ok": true,
  "session": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440002",
    "episodeId": "550e8400-e29b-41d4-a716-446655440001",
    "pricePerSecondShannon": "10000",
    "segmentDurationSec": 6
  }
}
```

**Response (404) - Episode Not Found:**
```json
{
  "ok": false,
  "error": "Episode not found"
}
```

**Response (400) - Episode Not Published:**
```json
{
  "ok": false,
  "error": "Episode is not published (status: draft)"
}
```

---

### Create Invoice

Create a hold invoice for N seconds of streaming time. The invoice must be paid before claiming.

**POST** `/invoices/create`

**Auth Required:** No

**Request Body:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440002",
  "seconds": 30
}
```

**Field Constraints:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sessionId | UUID | Yes | Session ID from `/sessions/create` |
| seconds | integer | No | Seconds to purchase (default: 30, min: 1, max: 3600) |

**Response (200):**
```json
{
  "ok": true,
  "invoice": {
    "invoiceAddress": "fiber:...",
    "paymentHash": "0x1234abcd...",
    "amountShannon": "0x12c00",
    "seconds": 30
  }
}
```

**Response (400) - Invalid Session:**
```json
{
  "ok": false,
  "error": "Invalid sessionId"
}
```

---

### Claim Invoice

Verify payment has been received and settle the invoice to unlock streaming segments.

**POST** `/invoices/claim`

**Auth Required:** No

**Request Body:**
```json
{
  "paymentHash": "0x1234abcd..."
}
```

**Field Constraints:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| paymentHash | string | Yes | Payment hash from invoice creation |

**Response (200) - Success:**
```json
{
  "ok": true,
  "stream": {
    "token": "550e8400-e29b-41d4-a716-446655440003",
    "expiresAt": 1704067500000,
    "grantedSeconds": 30,
    "segmentDurationSec": 6,
    "maxSegmentIndex": 4,
    "playlistUrl": "/stream/hls/playlist.m3u8?token=550e8400-e29b-41d4-a716-446655440003"
  }
}
```

**Response (402) - Payment Failed:**
```json
{
  "ok": false,
  "error": "Payment not confirmed: invoice status is Cancelled"
}
```

**Response (400) - Unknown Payment Hash:**
```json
{
  "ok": false,
  "error": "Unknown payment hash"
}
```

---

## Streaming API

### Stream HLS Content

Stream HLS playlist or segment files. Requires a valid stream token.

**GET** `/stream/hls/:fileName`

**Auth Required:** Stream token via query parameter

**Path Parameters:**
| Parameter | Description |
|-----------|-------------|
| fileName | HLS file name (e.g., `playlist.m3u8`, `segment_0.ts`) |

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| token | Yes | Stream token from `/invoices/claim` |

**Response:**
- `.m3u8` files: `Content-Type: application/vnd.apple.mpegurl`
- `.ts` files: `Content-Type: video/mp2t`
- `.key` files: `Content-Type: application/octet-stream`

**Response (401) - Missing Token:**
```
Missing token
```

**Response (401) - Invalid/Expired Token:**
```
Invalid or expired token
```

**Response (403) - Unauthorized Segment:**
```
Segment not authorized
```

---

## Admin API - Podcasts

All podcast admin endpoints require Bearer token authentication.

### Create Podcast

Create a new podcast.

**POST** `/admin/podcasts`

**Auth Required:** Yes (Bearer token)

**Headers:**
```
Authorization: Bearer {ADMIN_API_KEY}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "My New Podcast",
  "description": "A podcast about interesting topics"
}
```

**Field Constraints:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| title | string | Yes | 1-255 characters |
| description | string | No | Max 1000 characters |

**Response (201):**
```json
{
  "ok": true,
  "podcast": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My New Podcast",
    "description": "A podcast about interesting topics",
    "created_at": 1704067200000
  }
}
```

---

### List All Podcasts

Get a list of all podcasts (including unpublished).

**GET** `/admin/podcasts`

**Auth Required:** Yes (Bearer token)

**Headers:**
```
Authorization: Bearer {ADMIN_API_KEY}
```

**Response (200):**
```json
{
  "ok": true,
  "podcasts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "My New Podcast",
      "description": "A podcast about interesting topics",
      "created_at": 1704067200000
    }
  ]
}
```

---

### Get Podcast Details

Get detailed information about a specific podcast.

**GET** `/admin/podcasts/:id`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Podcast ID |

**Response (200):**
```json
{
  "ok": true,
  "podcast": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My New Podcast",
    "description": "A podcast about interesting topics",
    "created_at": 1704067200000
  }
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "Podcast not found"
}
```

---

### Update Podcast

Update podcast metadata.

**PUT** `/admin/podcasts/:id`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Podcast ID |

**Request Body:**
```json
{
  "title": "Updated Podcast Title",
  "description": "Updated description"
}
```

**Field Constraints:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| title | string | No | 1-255 characters |
| description | string | No | Max 1000 characters |

**Response (200):**
```json
{
  "ok": true,
  "podcast": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Updated Podcast Title",
    "description": "Updated description",
    "created_at": 1704067200000
  }
}
```

**Response (400) - No Fields:**
```json
{
  "ok": false,
  "error": "No fields to update"
}
```

---

### Delete Podcast

Delete a podcast and all its associated episodes.

**DELETE** `/admin/podcasts/:id`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Podcast ID |

**Response (200):**
```json
{
  "ok": true,
  "message": "Podcast and associated episodes deleted successfully"
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "Podcast not found"
}
```

---

## Admin API - Episodes

All episode admin endpoints require Bearer token authentication.

### Create Episode

Create a new episode (metadata only, no audio file yet).

**POST** `/admin/episodes`

**Auth Required:** Yes (Bearer token)

**Headers:**
```
Authorization: Bearer {ADMIN_API_KEY}
Content-Type: application/json
```

**Request Body:**
```json
{
  "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Episode 1: Introduction",
  "description": "Welcome to our first episode",
  "price_per_second": "10000"
}
```

**Field Constraints:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| podcast_id | UUID | Yes | Must exist in podcasts table |
| title | string | Yes | 1-255 characters |
| description | string | No | Max 1000 characters |
| price_per_second | string | No | Numeric string (defaults to env value) |

**Response (201):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Introduction",
    "description": "Welcome to our first episode",
    "duration": null,
    "storage_path": "",
    "price_per_second": "10000",
    "status": "draft",
    "created_at": 1704067200000
  }
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "Podcast not found"
}
```

---

### Upload Episode Audio

Upload an audio file for an episode. Triggers transcoding to HLS format.

**POST** `/admin/episodes/:id/upload`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Episode ID |

**Headers:**
```
Authorization: Bearer {ADMIN_API_KEY}
Content-Type: multipart/form-data
```

**Request Body (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Audio file (MP3, WAV, OGG, AAC) |

**Allowed File Types:**
- `audio/mpeg`, `audio/mp3`
- `audio/wav`
- `audio/ogg`
- `audio/aac`

**Max File Size:** 500 MB

**Response (200):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Introduction",
    "description": "Welcome to our first episode",
    "duration": null,
    "storage_path": "/path/to/uploads/podcast_id/episode_id/source.mp3",
    "price_per_second": "10000",
    "status": "processing",
    "created_at": 1704067200000
  },
  "message": "File uploaded and transcoding queued"
}
```

**Response (400) - Published Episode:**
```json
{
  "ok": false,
  "error": "Cannot upload to a published episode"
}
```

**Response (400) - Invalid File:**
```json
{
  "ok": false,
  "error": "Invalid file type: application/pdf. Allowed types: audio/mpeg, audio/mp3, audio/wav, audio/ogg, audio/aac"
}
```

---

### List Episodes

Get all episodes for a podcast (including unpublished).

**GET** `/admin/episodes`

**Auth Required:** Yes (Bearer token)

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| podcast_id | Yes | Podcast ID |

**Response (200):**
```json
{
  "ok": true,
  "episodes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Episode 1: Introduction",
      "description": "Welcome to our first episode",
      "duration": null,
      "storage_path": "/path/to/uploads/...",
      "price_per_second": "10000",
      "status": "draft",
      "created_at": 1704067200000
    }
  ]
}
```

**Response (400) - Missing Parameter:**
```json
{
  "ok": false,
  "error": "podcast_id query parameter is required"
}
```

---

### Get Episode Details

Get detailed information about a specific episode.

**GET** `/admin/episodes/:id`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Episode ID |

**Response (200):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Introduction",
    "description": "Welcome to our first episode",
    "duration": 1800,
    "storage_path": "/path/to/uploads/...",
    "price_per_second": "10000",
    "status": "ready",
    "created_at": 1704067200000
  }
}
```

---

### Update Episode

Update episode metadata. Cannot edit published episodes.

**PUT** `/admin/episodes/:id`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Episode ID |

**Request Body:**
```json
{
  "title": "Updated Episode Title",
  "description": "Updated description",
  "price_per_second": "15000"
}
```

**Field Constraints:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| title | string | No | 1-255 characters |
| description | string | No | Max 1000 characters |
| price_per_second | string | No | Numeric string |

**Response (200):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Updated Episode Title",
    "description": "Updated description",
    "duration": 1800,
    "storage_path": "/path/to/uploads/...",
    "price_per_second": "15000",
    "status": "draft",
    "created_at": 1704067200000
  }
}
```

**Response (400) - Published Episode:**
```json
{
  "ok": false,
  "error": "Cannot edit a published episode"
}
```

---

### Delete Episode

Delete an episode and its associated files.

**DELETE** `/admin/episodes/:id`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Episode ID |

**Response (200):**
```json
{
  "ok": true,
  "message": "Episode and associated files deleted successfully"
}
```

---

### Publish Episode

Publish an episode to make it available for streaming. Episode must be in `ready` status.

**POST** `/admin/episodes/:id/publish`

**Auth Required:** Yes (Bearer token)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | UUID | Episode ID |

**Response (200):**
```json
{
  "ok": true,
  "episode": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "podcast_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Episode 1: Introduction",
    "description": "Welcome to our first episode",
    "duration": 1800,
    "storage_path": "/path/to/uploads/...",
    "price_per_second": "10000",
    "status": "published",
    "created_at": 1704067200000
  },
  "message": "Episode published successfully"
}
```

**Response (400) - Not Ready:**
```json
{
  "ok": false,
  "error": "Cannot publish episode with status: processing. Episode must be in 'ready' status."
}
```

**Response (400) - No File:**
```json
{
  "ok": false,
  "error": "Episode has no uploaded file"
}
```

---

## Episode Status Lifecycle

```
draft -> processing -> ready -> published
```

| Status | Description |
|--------|-------------|
| `draft` | Episode created, no audio file uploaded |
| `processing` | Audio file uploaded, transcoding in progress |
| `ready` | Transcoding complete, ready to publish |
| `published` | Episode is live and available for streaming |

**Important:** Published episodes cannot be edited or have new files uploaded. To make changes, create a new episode.

---

## Data Types

### Podcast

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| title | string | Podcast title (1-255 chars) |
| description | string | Podcast description (max 1000 chars) |
| created_at | integer | Unix timestamp (milliseconds) |

### Episode

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| podcast_id | UUID | Parent podcast ID |
| title | string | Episode title (1-255 chars) |
| description | string | Episode description (max 1000 chars) |
| duration | integer | Duration in seconds (null until processed) |
| storage_path | string | Path to audio file |
| price_per_second | string | Price in Shannon per second |
| status | string | `draft`, `processing`, `ready`, or `published` |
| created_at | integer | Unix timestamp (milliseconds) |

### Stream Session

| Field | Type | Description |
|-------|------|-------------|
| sessionId | UUID | Session identifier |
| episodeId | UUID | Episode being streamed |
| pricePerSecondShannon | string | Price per second |
| segmentDurationSec | integer | HLS segment duration |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_API_KEY` | API key for admin endpoints | (none) |
| `PORT` | Server port | `8787` |
| `FIBER_RPC_URL` | Fiber node RPC URL | `http://127.0.0.1:8227` |
| `PRICE_PER_SECOND_SHANNON` | Default price per second | `10000` |
| `INVOICE_CURRENCY` | Invoice currency | `Fibd` |
| `INVOICE_EXPIRY_SEC` | Invoice expiry time | `600` |
| `INVOICE_HASH_ALGORITHM` | Hash algorithm for invoices | `ckb_hash` |
| `HLS_SEGMENT_DURATION_SEC` | HLS segment duration | `6` |
| `STREAM_AUTH_TTL_SEC` | Stream token lifetime | `300` |
| `HLS_DIR` | Directory for HLS files | `../media/hls` |

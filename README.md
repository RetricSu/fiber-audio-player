# Fiber Audio Player

A demo podcast player integrated with the Fiber Network (CKB Lightning Network) for streaming micropayments.

## Overview

This demo showcases how content creators can monetize their podcasts using Fiber Network's payment channels. Listeners pay only for what they actually listen to, with payments streamed in real-time as the audio plays.

### How It Works

1. **Payment Channels**: Fiber Network uses payment channels similar to Bitcoin's Lightning Network but built on CKB (Nervos Network)
2. **Streaming Payments**: As audio plays, micropayments are automatically sent to the content creator using keysend
3. **Pay-per-second**: The player charges a configurable rate per second of audio playback
4. **Instant Settlement**: Payments settle through pre-established payment channels with ~20ms latency

### Key Features

- 🎵 Full-featured audio player with waveform visualization
- 💸 Real-time streaming payments via Fiber Network
- 📊 Live payment history and flow visualization
- ⚡ Keysend support (spontaneous payments without invoices)
- 🔧 Configurable payment rates and intervals
- 🎭 Demo mode with mock payments for testing

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- (Optional) A running Fiber Network node for live payments

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

### Configuration

The demo supports two modes:

1. **Demo Mode** (default): Simulates payments without requiring a Fiber node
2. **Live Mode**: Connects to a real Fiber node and sends actual payments

Configure in the Settings panel:
- **Fiber RPC URL**: Your local Fiber node endpoint (default: `http://127.0.0.1:8229`)
- **Recipient Public Key**: The public key receiving payments

## Fiber Network RPC Integration

The player uses the following Fiber RPC methods:

### `node_info`
Get information about the connected Fiber node.

```json
{
  "jsonrpc": "2.0",
  "method": "node_info",
  "params": [{}],
  "id": 1
}
```

### `list_channels`
List all payment channels.

```json
{
  "jsonrpc": "2.0",
  "method": "list_channels",
  "params": [{}],
  "id": 1
}
```

### `send_payment` (Keysend)
Send a spontaneous payment without an invoice.

```json
{
  "jsonrpc": "2.0",
  "method": "send_payment",
  "params": [{
    "target_pubkey": "03...",
    "amount": "0x2710",
    "keysend": true
  }],
  "id": 1
}
```

### `get_payment`
Check payment status.

```json
{
  "jsonrpc": "2.0",
  "method": "get_payment",
  "params": [{
    "payment_hash": "0x..."
  }],
  "id": 1
}
```

## Architecture

```
src/
├── app/                    # Next.js app router
│   ├── globals.css        # Global styles with Tailwind
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/
│   ├── AudioPlayer.tsx    # Main audio player component
│   ├── WaveformVisualizer.tsx
│   ├── PaymentFlowVisualizer.tsx
│   ├── NodeStatus.tsx     # Fiber node connection status
│   └── PaymentHistory.tsx # Payment transaction log
├── hooks/
│   ├── use-audio-player.ts
│   ├── use-fiber-node.ts
│   └── use-streaming-payment.ts
└── lib/
    ├── fiber-rpc.ts       # Fiber RPC client
    └── streaming-payment.ts # Payment streaming service
```

## Payment Flow

1. User clicks play → Audio starts
2. `StreamingPaymentService` starts tracking playback time
3. Every 5 seconds (configurable), accumulated time is calculated
4. Keysend payment is sent via Fiber RPC for the listened duration
5. Payment status is tracked and displayed in the UI
6. User clicks pause → Payment streaming stops

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Motion** - Animations
- **Fiber Network** - CKB Lightning payments

## Resources

- [Fiber Network Repository](https://github.com/nervosnetwork/fiber)
- [Fiber Light Paper](https://github.com/nervosnetwork/fiber/blob/develop/docs/light-paper.md)
- [Fiber RPC Documentation](https://github.com/nervosnetwork/fiber/blob/develop/crates/fiber-lib/src/rpc/README.md)
- [CKB Documentation](https://docs.nervos.org/)

## License

MIT

# Make Self-Host Great Again: How I Use Fiber and OpenClaw to Run a Podcast Payment Service

*A story about running a streaming micropayment business on a home-built PC, without public IP, and managing it through Discord (with a little help from AI).*

---

## TL;DR

I built **Fiber Audio Player** - a self-hosted podcast platform with per-second micropayments. It runs on a home-assembled PC (8GB RAM, 200+GB SSD, ~¥500), uses Cloudflare Tunnel (no public IP needed), and can be managed through an AI agent on Discord. The tech stack: Fiber Network for payments, OpenClaw for operations, and a simple CLI for content management.

This isn't about saving money - it's about **autonomy**. Total control over your infrastructure, your payments, your data. In an era of platform dependency, self-hosting is a statement of independence.

**[Screenshot 1: The Home Server Placeholder]**
*Caption: The actual home-built PC running everything - small, quiet, and entirely under my control*

---

## Why Self-Host in 2026?

Let's be honest: the cheapest option is trusting centralized platforms. They handle scaling, backups, legal compliance, and customer support for "free" (while taking 30-50% of your revenue). If cost is your only concern, stop reading now and go sign up for Spotify/Apple Podcasts.

But if you believe in:
- **Data sovereignty** - your audience relationships(or anonymous) belong to you
- **Censorship resistance** - no platform can demonetize you overnight
- **Protocol-level ownership** - payments flow directly, not through intermediaries
- **The joy of understanding** - knowing exactly how your business works

Then self-hosting isn't a cost optimization - it's a **fun project** that happens to be a business.

## The Stack: Minimal but Mighty

Here's what I'm actually running:

### The Hardware: A Home-Built PC

Forget cloud VPS. I assembled a small PC that sits in my living room:

- **CPU**: Entry-level Intel (4 cores)
- **RAM**: 8GB DDR4
- **Storage**: 256GB SSD
- **Network**: Standard home broadband
- **Cost**: ~¥500 ($70) for the entire build
- **Power**: ~15W idle, whisper quiet

Why? Because **physical possession is nine-tenths of the law**. My data lives on hardware I can touch, in a location I control, running software I can audit. No terms of service changes, no account suspensions, no "we've updated our privacy policy."

**[Screenshot 3: Hardware Specs Placeholder]**
*Caption: System specs showing 8GB RAM, 200GB+ storage, and resource usage during normal operation*

### 2. The Payment Layer: Fiber Network

Instead of Stripe or PayPal taking 3% + $0.30 per transaction, I run a [Fiber Network](https://github.com/nervosnetwork/fiber) node. It's a Lightning Network-style payment channel system on Nervos CKB.

**Why this matters:**
- **Micropayments actually work** - charging $0.001 per second of audio is economically viable
- **No middleman** - payments go directly from listener to me
- **Low fees** - channel operations cost fractions of a penny
- **Streaming payments** - listeners pay in real-time as they listen

```bash
# My Fiber node setup - running on the home PC
fiber-pay config init --network testnet
fiber-pay node start --daemon
fiber-pay channel open --peer-id <public-node> --amount 1000

# Check status anytime
fiber-pay node info
fiber-pay channel list
```

**[Screenshot 4: Fiber Node Terminal Placeholder]**
*Caption: Terminal showing fiber-pay node info, channel balances, and peer connections on the home PC*

### 3. The Application: Fiber Audio Player

A Next.js frontend + Hono backend that handles:
- Audio streaming with HLS encryption
- Payment verification via Fiber RPC
- SQLite database for podcasts/episodes
- Admin API for content management

The backend automatically transcodes uploaded audio to streaming format using FFmpeg.

**[Screenshot 5: Application Interface Placeholder]**
*Caption: Web interface showing podcast player with real-time payment counter*

### 4. The Bridge: Cloudflare Tunnel

I use Cloudflare Tunnel to expose services through Cloudflare's edge network. So I don't need a public IP but only a cheap domain name.

```bash
# Install and configure
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Connect to my domain
cloudflared tunnel login
cloudflared tunnel create fiber-audio
cloudflared tunnel route dns fiber-audio api.my-domain.com

# Run as systemd service - no open ports needed!
sudo cloudflared service install
```

Result: `https://api.my-domain.com` routes to `localhost:8787` on my VPS, secured by Cloudflare's SSL and DDoS protection. My server has **zero open inbound ports**.

**[Screenshot 6: Cloudflare Tunnel Dashboard Placeholder]**
*Caption: Cloudflare Zero Trust dashboard showing tunnel status and routing rules*

### The Operator: OpenClaw

This is where it gets magical. I run [OpenClaw](https://github.com/ppoliani/openclaw) - a self-hosted AI agent that connects to Discord. Instead of SSHing into my home PC or memorizing CLI commands, I just message my Discord bot.

**How it works:**
1. OpenClaw reads the project documentation I provide
2. It has access to the `fap` CLI tool for podcast management
3. It can check PM2 logs and system status
4. I interact with it through natural language in Discord

It's like having a DevOps engineer who knows my entire stack living in my Discord server.

**[Screenshot 7: OpenClaw Discord Interface Placeholder]**
*Caption: Discord chat showing actual conversation with OpenClaw managing the podcast*

---

## A Day in the Life: Managing Through Discord

Here's what actually managing this system looks like day-to-day. I rarely SSH into the home PC anymore - I just talk to OpenClaw on Discord.

### Scenario 1: Uploading a New Episode

I'm on my phone, walking to a meeting. I have a new podcast episode ready. Instead of opening a laptop and SSHing to the server, I just message Discord:

```
Me: Upload the new episode "Interview with Dev" to Tech Talk podcast

OpenClaw: I'll help you upload that. Let me check the available podcasts and process the file.
[Processing...]
✅ Found Tech Talk podcast (ID: podcast_abc123)
✅ Episode created: "Interview with Dev" (ID: ep_550e8400)
✅ Audio uploaded via fap CLI
⏳ Transcoding in progress... (ETA: 2 minutes)

OpenClaw: Transcoding complete! Episode is now in "ready" status.
Publish it now? (Yes/No)

Me: Yes, publish it

OpenClaw: ✅ Episode published! Live at: https://api.my-domain.com/podcast/tech-talk/episodes/ep_550e8400
```

Behind the scenes, OpenClaw used the `fap` CLI to execute:
- `fap podcast list` to find the podcast
- `fap episode create` with the right parameters
- `fap episode upload` for the audio file
- `fap episode publish` when I confirmed

**[Screenshot 8: Discord Upload Conversation Placeholder]**
*Caption: Actual Discord conversation showing OpenClaw uploading and publishing an episode*

### Scenario 2: Checking System Health

Before my morning coffee:

```
Me: Good morning! How's everything running?

OpenClaw: ☕ Good morning! Let me check the system status...

🟢 Backend API: Healthy (curl http://localhost:8787/healthz)
   - Response time: 45ms
   - Service: fiber-audio-backend

🟢 Fiber Node: Online
   - 3 payment channels active
   - Total inbound capacity: 5,000 CKB
   - Total outbound capacity: 3,200 CKB

🟢 System Resources:
   - Disk Usage: 23% (58GB / 256GB)
   - Memory: 4.2GB / 8GB used
   - Uptime: 14 days, 3 hours

🟢 Cloudflare Tunnel: Connected (4 edges)

💰 Active streams: 2 listeners right now

Everything looks healthy! Want me to check the PM2 logs or Fiber node details?
```

**[Screenshot 9: Discord Health Check Placeholder]**
*Caption: Discord message showing OpenClaw reporting system status from various sources*

### Scenario 3: Troubleshooting via PM2 Logs

Something's wrong - a listener reports payment failures.

```
Me: Someone said payments aren't working. Can you check the logs?

OpenClaw: 🔍 Checking PM2 logs for payment issues...

Found recent errors in fiber-audio-backend:
```
[ERROR] 2024-03-11 09:23:45 - Invoice creation failed: No path found
[ERROR] 2024-03-11 09:24:12 - Channel liquidity insufficient
```

Diagnosis: Channel liquidity exhausted on outbound side.
Current outbound capacity: 200 CKB (too low)

💡 Solution needed: Rebalance channel or open new one

Want me to:
1. Show detailed Fiber channel status
2. Attempt automatic rebalancing
3. Show you the full PM2 logs

Me: Show channel status first

OpenClaw: 📊 Channel Status (from fiber-pay channel list):

Channel ID: 0xabc123...
Peer: QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
Local balance: 4,800 CKB
Remote balance: 200 CKB
Status: ChannelReady

The issue: Most funds are on your side. Need to push some to the remote side for routing.

I can run: fiber-pay channel push --channel-id 0xabc123 --amount 500

Proceed? (Yes/No)
```

**[Screenshot 10: Discord Troubleshooting Placeholder]**
*Caption: Discord conversation showing OpenClaw investigating logs, diagnosing, and proposing fixes*

### How OpenClaw Knows This Stuff

OpenClaw doesn't magically know my system. I provide it with:

1. **Documentation**: The devops manual, CLI reference, API docs
2. **Tools**: Access to run `fap`, `fiber-pay`, `pm2`, and `curl` commands
3. **Context**: Background info about the home PC setup, Fiber node config

When I ask "how's the system", it:
1. Reads the health endpoint via `curl`
2. Checks PM2 status for process health
3. Queries Fiber node for channel status
4. Runs standard Linux commands for disk/memory
5. Compiles everything into a human-readable Discord message

**[Screenshot 11: OpenClaw Tools Placeholder]**
*Caption: Diagram showing how OpenClaw accesses CLI tools and documentation to answer questions*

---

## The CLI That Makes It Possible

All of this works because I built a proper CLI tool (`fap` - Fiber Audio Player CLI) that OpenClaw can use:

```bash
# Authentication
fap auth login --api-key <key> --backend-url http://localhost:8787

# Podcast management
fap podcast create --title "Tech Talk" --description "Weekly tech discussions"
fap podcast list

# Episode workflow
fap episode create \
  --podcast-id <id> \
  --title "Episode 42" \
  --file ./audio.mp3 \
  --price-per-second 10000 \
  --wait \
  --publish

# Monitoring
fap episode list --status processing
fap episode get <id>
```

The CLI outputs JSON with `--format json`, making it perfect for OpenClaw to parse and present in conversational format.

**[Screenshot 13: CLI Commands Placeholder]**
*Caption: Terminal showing various fap CLI commands and their formatted output*

---

## Why This Architecture Matters

It's **Not About Cost**: self-hosting is not cheaper. Platforms exist because they're economically efficient. They pool resources, optimize for scale, and handle edge cases you'll never encounter. It's **About Autonomy**.

**Data Ownership**: My audience database lives on my SSD. Not in a cloud service that can change export policies. Not locked behind APIs that require "partnership programs." I can query it directly, back it up how I want, migrate it anywhere.

**Payment Sovereignty**: When a listener pays me, the money flows peer-to-peer through payment channels I control. No Stripe holding funds for 7 days. no PayPal freezing accounts for "review." No platform taking 30% because they can.

**Protocol-Level Relationships**: My listeners connect directly to my node. We have a direct payment relationship at the protocol level. If tomorrow I change the frontend, the backend, or the hosting - those relationships persist.

**Censorship Resistance**: This is a podcast about whatever I want. No advertiser guidelines. no platform content policies. No algorithmic demotion. The only "terms of service" are the laws of physics and the consensus rules of the Nervos blockchain.

"But isn't self-hosting complicated?" Not anymore. Once OpenClaw is integrated, even the minimal maintenance becomes conversational. It lowers the barriers to entry for self-hosting. This is the best thing AI agent brings.

## The Bigger Picture

We're entering an era where **infrastructure becomes conversational**. The complexity hasn't disappeared - it's been abstracted behind AI agents that speak human language.

This matters because:

1. **Independence is accessible again** - You don't need a DevOps team
2. **Privacy by default** - Your data stays on your hardware
3. **Censorship resistant** - No platform can deplatform you
4. **Protocol ownership** - Direct relationships without intermediaries
5. **Composable infrastructure** - Mix and match components

With the help of Fiber network, the economy feedback loop in the self-hosting service finally have the last piece to be completed. 

## Try It Yourself

Want to run your own?

**Quick start:**
```bash
git clone https://github.com/retric/fiber-audio-player.git
cd fiber-audio-player
pnpm install
pnpm build
```

**Full deployment:**
- Follow the [DevOps Manual](./devops-manual.en.md)
- Setup [Cloudflare Tunnel](./cloudflared-tunnel.en.md)
- Integrate [OpenClaw](https://github.com/ppoliani/openclaw)

**Get help:**
- Ask me anything under this post.
- Fiber docs: [GitHub](https://github.com/nervosnetwork/fiber)

## Conclusion

The future of content creation isn't platforms - it's **personal infrastructure**. With Fiber Network for payments, OpenClaw for operations, and a home-built PC, you can run a sovereign business that you fully control.

This isn't just about podcasts. The same architecture works for:
- Video streaming
- Newsletter subscriptions
- Digital downloads
- API services
- Any content business

The tools are here. The protocols are mature. The AI assistance makes it manageable.

**Make self-host great again.**

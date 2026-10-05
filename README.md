# Ring AI Assist

Watches Ring camera video, notices when someone needs help (for example, struggling to swipe a card), and speaks to them through the camera's speaker in a tone you choose.

```
motion / doorbell ──► live call (WebRTC) ──► JPEG frames ──► Claude vision ──► scenario hit?
                           ▲                                                      │
                           └──── camera speaker ◄── ElevenLabs voice (your tone) ◄┘
```

## How Ring is accessed (read this)

- **Live video and talk-back** use [`ring-client-api`](https://github.com/dgreif/ring), an **unofficial** library that logs in as your Ring account. Ring's official Partner API can't talk through a camera, so this is currently the only way to do it. Ring could break it at any time, it's against Ring's terms, and it won't pass Ring Appstore certification.
- **The official Partner API** (your Client ID, Secret, and HMAC key) is wired up in [src/ring/partnerApi.ts](src/ring/partnerApi.ts): OAuth, device listing, webhook signature checks, and account-linking nonces. Nothing uses it yet. It's there so events and video can move onto the official API later, and talk-back too if Ring adds it.
- The **"Ring MCP"** (`https://knowledge.appstore-mcp.ring.amazon.dev/mcp`) is a documentation server for AI coding assistants, not something the app connects to at runtime. Add it to your editor to look up Partner API details.

## Setup

Step-by-step directions, including where to get each API key, are in **[SETUP.md](SETUP.md)**. Short version:

1. **Node 20 or newer** (`ring-client-api` requires it): `winget install OpenJS.NodeJS.LTS`
2. `npm install`
3. `npm run auth`: log in with your Ring email, password, and 2FA code, then paste the refresh token into `.env` as `RING_REFRESH_TOKEN`.
4. In `.env`, fill in `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY`.
5. `npm run list-cameras`, then put the camera name(s) under `cameras:` in [config/assistant.yaml](config/assistant.yaml).

## Running

| Command | What it does |
|---|---|
| `npm start` | Runs the assistant. With `DRY_RUN=true` in `.env` (the default), it only logs what it would say. |
| `npm run test-voice -- calm_helpful "You have to swipe your card."` | Saves the line as an mp3 in `data/tts-cache/` so you can hear the tone. |
| `npm run test-detect -- a.jpg b.jpg c.jpg` | Runs the detector on saved images, no camera needed. |
| `npm run say -- "Front Door" firm_clear "You have to swipe your card."` | Speaks through a real camera, to test talk-back end to end. |

Suggested order: `test-voice` → `test-detect` → `say` → `npm start` with dry run → set `DRY_RUN=false`.

## Customizing ([config/assistant.yaml](config/assistant.yaml))

- **Change the tone:** edit a `tones:` entry: `voice_id` (any ElevenLabs voice), `style_tag` (a v3 audio tag such as `[gently]`, `[firmly]`, `[cheerfully]`), and `settings` (stability, style, speed). Point a scenario's `tone:` at it.
- **Add a new situation:** add a `scenarios:` entry with a `description` (what it looks like on camera, which is what Claude looks for), the `response` to say, a `tone`, and thresholds. No code changes needed.
- **Tuning false alarms:** raise `min_confidence` or `consecutive_hits`. Raise `cooldown_seconds` to repeat less often.

## Code layout

| Path | Role | Extend by… |
|---|---|---|
| [src/engine/cameraWatcher.ts](src/engine/cameraWatcher.ts) | Per-camera loop: trigger → live call → analyze → respond | Adding triggers or non-speech actions (notifications, logging) |
| [src/ring/liveSession.ts](src/ring/liveSession.ts) | One live call: frames out, audio in | — |
| [src/vision/detector.ts](src/vision/detector.ts) | `Detector` interface | Writing another detector (e.g. a fast local model as a pre-filter) |
| [src/vision/claudeDetector.ts](src/vision/claudeDetector.ts) | Claude vision with structured output | Prompt tuning |
| [src/voice/tts.ts](src/voice/tts.ts) | `TextToSpeech` interface | Swapping voice providers |
| [src/voice/elevenLabsTts.ts](src/voice/elevenLabsTts.ts) | ElevenLabs, with an on-disk clip cache | — |
| [src/ring/partnerApi.ts](src/ring/partnerApi.ts) | Official Ring Partner API helpers | Webhook server / migration |

## Costs and limits

- Each analysis sends `frames_per_analysis` images to Claude, and only while a live call is open after motion. Lower `analysis_interval_seconds` reacts faster but costs more.
- Ring live calls max out at about 10 minutes. The watcher reopens the call if motion is still happening.
- On battery cameras, live view drains the battery quickly.

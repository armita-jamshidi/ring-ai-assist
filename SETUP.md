# Setup Guide

Follow these steps in order. They take about 20 minutes. Every command runs in a terminal (PowerShell is fine) from the project folder.

## 1. Install Node.js 20 or newer

The Ring library won't run on older versions.

```powershell
winget install OpenJS.NodeJS.LTS
```

Close the terminal, open a new one, and check it:

```powershell
node --version   # should print v20 or higher
```

## 2. Get the code and install packages

If you're on a new computer, clone the repo first. Otherwise skip to `npm install`.

```powershell
git clone https://github.com/armita-jamshidi/ring-ai-assist.git
cd ring-ai-assist
npm install
```

## 3. Create your `.env` file

`.env` holds your keys and is never uploaded to GitHub. If it doesn't exist yet (for example on a fresh clone), copy the template:

```powershell
Copy-Item .env.example .env
```

Open `.env` in an editor. You'll fill it in over the next few steps.

**Ring Partner API keys** (optional for now; not used by the main app yet): paste your Client ID, Client Secret, and HMAC Signature Key into the `RING_PARTNER_*` lines.

## 4. Log in to Ring

```powershell
npm run auth
```

Enter your Ring email, password, and the 2FA code Ring sends you. It prints a long **refresh token**. Paste it into `.env`:

```
RING_REFRESH_TOKEN=<paste here>
```

You only do this once. The app saves new tokens to `data/` automatically as Ring rotates them.

## 5. Get a Claude API key

1. Go to https://console.anthropic.com and sign in.
2. **Settings → Billing**: add a payment method or credits.
3. **API Keys → Create Key**, then copy it.
4. In `.env`: `ANTHROPIC_API_KEY=<paste here>`

## 6. Get an ElevenLabs API key and choose a voice

1. Sign up at https://elevenlabs.io.
2. Click your profile → **API Keys** → create a key. In `.env`: `ELEVENLABS_API_KEY=<paste here>`
3. *(Optional)* To pick a different voice, browse https://elevenlabs.io/app/voice-library, open a voice, and copy its **Voice ID**. Put it in `voice_id:` under a tone in `config/assistant.yaml`.

## 7. Pick which camera(s) to watch

```powershell
npm run list-cameras
```

Copy the camera name exactly into `config/assistant.yaml`:

```yaml
cameras:
  - Front Door
```

Leave it as `cameras: []` to watch every camera.

## 8. Test each piece

Run these one at a time, and get each working before moving on.

**a) Hear the voice and tone.** This saves an mp3 in `data/tts-cache/`. Open it and listen.
```powershell
npm run test-voice -- calm_helpful "You have to swipe your card."
```
Try `friendly_upbeat` and `firm_clear` too. Change a tone in `config/assistant.yaml` until it sounds right.

**b) Test detection on photos.** Take 3–4 photos (or screenshots from a Ring recording) of someone struggling at a card reader. Put them in a folder and run:
```powershell
npm run test-detect -- photos\1.jpg photos\2.jpg photos\3.jpg
```
You should see `card_swipe_trouble` in the output. Run it on normal photos too and confirm it finds nothing.

**c) Speak through the real camera.** Stand by the camera to hear it.
```powershell
npm run say -- "Front Door" calm_helpful "You have to swipe your card."
```

## 9. Run it (dry run first)

`.env` starts with `DRY_RUN=true`, so the app watches and logs what it **would** say without speaking.

```powershell
npm start
```

Walk in front of the camera and act out struggling with a card. The terminal should show lines like `card_swipe_trouble (0.86, 1/2)` and then `[DRY RUN] would say...`. Press `Ctrl+C` to stop.

## 10. Go live

When dry runs look right, set this in `.env`:

```
DRY_RUN=false
```

Then run `npm start` again. To keep it running all the time, leave the terminal open on a computer that stays on, or ask for help setting it up as a background service.

---

## Tuning

All of these are in `config/assistant.yaml`. Restart the app after any change.

| Problem | Fix |
|---|---|
| Speaks when nobody needs help | Raise `min_confidence` (e.g. 0.85) or `consecutive_hits` (e.g. 3) |
| Too slow to react | Lower `analysis_interval_seconds` (costs more) or `consecutive_hits` |
| Repeats itself too much | Raise `cooldown_seconds` |
| Wrong tone | Edit the tone's `style_tag`, `settings`, or `voice_id` |
| Want a new situation | Copy a `scenarios:` entry, give it a new `id`, `description`, and `response` |

## Troubleshooting

| Error | Fix |
|---|---|
| `No Ring refresh token` | Do step 4 again |
| `Missing ANTHROPIC_API_KEY` / `ELEVENLABS_API_KEY` | Check `.env` for typos and no extra quotes |
| Ring login stops working | Delete `data/ring-refresh-token.txt` and do step 4 again |
| `Cameras not found` | Names must match `npm run list-cameras` exactly |
| `npm start` fails with a syntax/engine error | Node is too old; do step 1 |

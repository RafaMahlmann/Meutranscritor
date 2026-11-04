# Vox · My Transcriber

Think out loud. Your speech becomes text you can actually work with.

**[voxcharmai.com](https://voxcharmai.com)** — runs in your browser, install as an app.

## What it does

- **Transcribes** your voice or audio files
- **Separates speakers** in conversations (diarization)
- **Transforms** text through AI lenses — summary, action plan, translation, and more
- **Finds** notes by word or by meaning
- Works offline for reading and editing your existing notes

## Why it's different

**Vox doesn't keep your recordings and doesn't train AI with them.**

Vox runs in your browser and talks directly to whichever AI provider *you* choose, using *your* own key (BYOK — Bring Your Own Key). With your key, the audio goes straight from your device to that provider: we don't receive it. With the local transcriber, it doesn't leave your computer. Your notes live in your device's storage.

The exceptions are listed in the [Privacy Policy](privacy.html): your first few transcriptions and lenses without a key go through a small bridge of ours (code in [`ponte/`](ponte/)), usage counts happen only if you say yes, and Vox Pro is sold through Freemius.

You don't have to take our word for it. **The entire app is a single `index.html` file in this repository** — read it, audit it, run it yourself.

## Running it yourself

Clone the repo and open `index.html` in a browser. That's it — no build step, no dependencies to install.

## License

**Vox is source-available, not open source.**

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE):

| You **can** | You **cannot** |
|---|---|
| Read and audit all the code | Sell it or charge for it |
| Run it on your own devices | Offer it as a commercial service |
| Modify it for personal use | Use it commercially inside a for-profit company |
| Use it for study, research, teaching, or in a nonprofit | Republish it as your own product |

The code is open **for you to inspect** — that's the point of a privacy tool. It is not open for resale.

If you want to use Vox commercially, [get in touch](https://voxcharmai.com).

---

© 2026 Rafael Mahlmann

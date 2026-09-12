# Little Wonder

A living fairy-tale storybook made for the [Live Models Hackathon](https://luma.com/gh4256ju), hosted by Visko, Reactor, and Nebius. Work lives on the `simon` branch.

Children start with one spoken or typed idea, then shape the next page with questions, choices, and explicitly expressed feelings. GPT writes the story and directs Orbis through scene prompts. The opening book animation bridges the wait for the first page; a local illustration remains visible while live video starts.

## Run locally

Requires Node.js 22.12+ (tested with Node 24).

```sh
npm install
cp .env.example .env
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app works immediately in **illustrated demo mode**, using three curated adventures (forest, ocean, space). Demo mode does not generate original stories or live video. Narration uses the browser's synthetic voice.

## Connect the providers

Put these values in the ignored `.env` file, then restart the server and refresh the page:

```dotenv
OPENAI_API_KEY=your-openai-key
REACTOR_API_KEY=your-reactor-key
```

Do not commit keys, put them in client code, or prefix them with `VITE_`. The server exchanges the Reactor key for a 10-minute, model-scoped token limited to one session. The browser receives only that session token.

The key must have access to `reactor/visko-orbis-stable`. An Orbis/Visko credential that cannot mint tokens at Reactor is not interchangeable with a Reactor API key.

Optional configuration:

| Variable                  | Default                      | Purpose                                                           |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `OPENAI_STORY_MODEL`      | `gpt-4.1-mini`               | Structured story generation                                       |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe`     | Voice transcription                                               |
| `REACTOR_MODEL`           | `reactor/visko-orbis-stable` | Live picture generation                                           |
| `PORT`                    | `3000`                       | Local server port                                                 |
| `APP_ACCESS_CODE`         | unset                        | Shared code required by API endpoints; enter in Grown-up settings |

Open **Grown-up settings** to allow live processing and select age, simpler language, larger text, reduced motion, and narration. Without a Reactor key, GPT stories and voice still work with illustrated previews. An API failure is shown explicitly; live requests do not silently fall back to demo output.

## How it works

1. Tap the microphone, say an idea, and tap again to send it (maximum 30 seconds). Typing is always available. This prototype uses turn-by-turn recording, not an always-on microphone.
2. `/api/transcribe` handles an in-memory audio upload and asks OpenAI for the transcript.
3. `/api/story` validates and moderates input, asks the Responses API for a structured page, and moderates that output before returning it. Requests use `store: false`.
4. The browser renders the page and uses the Reactor SDK to connect to Orbis over WebRTC. It sends `set_prompt` and `start` for the first scene, then changes `set_prompt` within the same stream on later turns. Prompts re-establish the characters and setting.
5. The child can ask a question, choose a direction, request a gentler scene, or ask for a cozy ending. Previous pages remain available in memory. Narration, recording, and video can be paused; a new story releases the video session.

Story text and visual generation are asynchronous. Reactor documents multi-minute cold starts and approximately 1.8-second prompt-update boundaries after startup. The interface shows connection progress and offers reconnection. There is no frame-accurate synchronization between narration and video yet.

`public/reactor-runtime/` is generated from the installed SDK by `predev`/`prebuild`. Vite rewrites the SDK's dynamic WASM import to this stable location; both development and production ship its required JS/WASM runtime. Fonts and demo artwork are local assets.

## Data and child-oriented design

- Parent-selected age range and access preferences; no account, name, camera, or diagnosis required.
- No emotion recognition from voice. Explicit statements such as “I feel scared” and chosen story directions inform the response.
- The app does not write recordings, transcripts, profiles, or stories to disk or a database. Refreshing clears the session. Audio is held briefly in memory for transcription.
- OpenAI receives audio, story text/history, and age/language preferences. Reactor receives fictional visual prompts. Provider retention policies apply; `store: false` is not a claim of zero data retention.
- Input/output moderation and story constraints reduce risk but cannot guarantee child-safe text or video. This is a supervised hackathon prototype, not a production child-facing service. Before real child testing or a public launch, review provider requirements for minors, retention/consent, visual safety, authentication, and spending limits.
- The local server binds to loopback. There is no public app deployment yet. Use proper authentication and provider usage limits before exposing paid API endpoints; the optional shared code is only a hackathon safeguard.

## Validation

```sh
npm test
npm run build
npm start
```

Tests exercise demo continuity and calming reactions, invalid input, missing keys, origin/access-code checks, audio validation, age/accessibility prompting, and Reactor token scoping. Browser checks cover creating and steering a story, pause/resume, history, parent settings, and desktop/mobile layouts. Live provider calls require real API keys and have not yet been verified.

## API references

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI speech transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
- [Reactor Orbis Stable API](https://www.reactor.inc/models/visko-orbis-stable/api)

# Little Wonder

A living fairy-tale storybook made for the [Live Models Hackathon](https://luma.com/gh4256ju), hosted by Visko, Reactor, and Nebius. Work lives on the `simon` branch.

Children start with one spoken or typed idea, then shape the next page with questions, choices, and explicitly expressed feelings. GPT writes the story and directs Orbis through scene prompts. The opening book animation bridges the wait for the first page; a local illustration remains visible while live video starts.

There are two ways to hear a story. The **storybook** is turn-by-turn: say or type an idea, read the page, choose what happens next. A **story call** is live: an ElevenLabs storyteller joins over WebRTC and tells the story out loud in real time, listening while it speaks, and filling in the storybook pages as it goes.

## Run locally

Requires Node.js 24.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app works immediately in **illustrated demo mode**, using three curated adventures (forest, ocean, space). Demo mode does not generate original stories or live video. Narration uses the browser's synthetic voice.

## Connect the providers

Put these values in the ignored `.env.local` file, then restart the server and refresh the page. `.env.local` is read first and `.env` second, so a value set in `.env.local` wins.

```dotenv
OPENAI_API_KEY=your-openai-key
REACTOR_API_KEY=your-reactor-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```

Do not commit keys, put them in client code, or prefix them with `VITE_`. The server exchanges the Reactor key for a 10-minute, model-scoped token limited to one session, and the ElevenLabs key for a single conversation token. The browser receives only those short-lived tokens.

The Reactor key must have access to `reactor/visko-orbis-stable`. An Orbis/Visko credential that cannot mint tokens at Reactor is not interchangeable with a Reactor API key. The ElevenLabs key does two jobs: narration needs only text-to-speech, but story calls need the Agents platform, so a text-to-speech-only key narrates pages without being able to place a call.

Each provider is independent. Without a Reactor key, GPT stories and story calls still work with illustrated previews. Without an ElevenLabs key, the storybook still works with the browser voice.

Optional configuration:

| Variable                  | Default                      | Purpose                                                           |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `OPENAI_STORY_MODEL`      | `gpt-4.1-mini`               | Structured story generation                                       |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe`     | Voice transcription                                               |
| `ELEVENLABS_VOICE_ID`     | Arthur                       | Fallback voice for narration that names none; the picked voice wins |
| `ELEVENLABS_MODEL`        | `eleven_flash_v2_5`          | Narration model                                                   |
| `ELEVENLABS_AGENT_ID`     | provisioned on first call    | Pin an existing storyteller agent instead of creating one         |
| `ELEVENLABS_LLM`          | `gemini-2.5-flash`           | Model driving the live storyteller                                |
| `REACTOR_MODEL`           | `reactor/visko-orbis-stable` | Live picture generation                                           |
| `PORT`                    | `3000`                       | Local server port                                                 |
| `APP_ACCESS_CODE`         | unset                        | Shared code required by API endpoints; enter in Grown-up settings |

Open **Grown-up settings** to allow live processing and select age, storyteller voice, simpler language, larger text, reduced motion, and narration. Two voices are offered, Arthur and Victoria, and the chosen one reads the storybook pages and speaks on a story call, so a child hears one narrator throughout. Both are ElevenLabs default voices, because a free plan is refused any voice taken from the shared library. Default voices are due to expire on 31 December 2026, so both will need replacing with owned voices before then. Without a Reactor key, GPT stories and voice still work with illustrated previews. An API failure is shown explicitly; live requests do not silently fall back to demo output.

## How it works

1. Tap the microphone, say an idea, and tap again to send it (maximum 30 seconds). Typing is always available. This prototype uses turn-by-turn recording, not an always-on microphone.
2. `/api/transcribe` handles an in-memory audio upload and asks OpenAI for the transcript.
3. `/api/story` validates and moderates input, asks the Responses API for a structured page, and moderates that output before returning it. Requests use `store: false`.
4. The browser renders the page and uses the Reactor SDK to connect to Orbis over WebRTC. It sends `set_prompt`, checks direct replies or matching model events, waits for `conditions_ready`, and only then sends `start` for the first scene. Later turns change `set_prompt` within the same stream. Prompts re-establish the characters and setting.
5. In live mode with grown-up consent, `/api/narrate` sends only the narrated page text to ElevenLabs. Short MP3s are buffered in memory before playback; stopping, changing pages, or recording cancels narration. Demo mode and provider failures use browser speech synthesis.
6. The child can ask a question, choose a direction, request a gentler scene, or ask for a cozy ending. Previous pages remain available in memory. Narration, recording, and video can be paused; a new story releases the video session.
7. At any point, **Call the storyteller** swaps turn-taking for a live conversation. See [Story calls](#story-calls).

Story text and visual generation are asynchronous. Reactor documents multi-minute cold starts and approximately 1.8-second prompt-update boundaries after startup. The interface shows connection progress and offers reconnection. There is no frame-accurate synchronization between narration and video yet.

## Story calls

A story call replaces turn-taking with a conversation. Tap **Call the storyteller**, and the browser opens a WebRTC session to an ElevenLabs agent that narrates out loud, hears the child while it speaks, and can be interrupted mid-sentence.

The agent drives the rest of the app through two client tools, declared in `shared/storyteller.ts` so the agent configuration and the browser handlers cannot drift apart:

- `show_scene` sends a watercolour scene description straight to Orbis, so the picture follows the spoken story.
- `turn_page` writes a chapter into the storybook. Its title, question, and two choices come from the agent; the narrative is the transcript of what the child actually heard, so the page and the voice never disagree.

Both tools are non-blocking, so neither one stalls the storyteller mid-sentence. Pages written during a call stay in the storybook afterwards, and a later call picks the same story back up.

`/api/storyteller/token` mints a conversation token per call. On first use the server looks for an agent named `Little Wonder storyteller v1`, creates one with its client tools if none exists, and logs the id so it can be pinned with `ELEVENLABS_AGENT_ID`. The system prompt is composed server-side for each call from the age range, accessibility preferences, and the story so far, then applied as a session override; the safety rules are never sent from the browser.

Whether that override is sent depends on the agent, not on how it was configured here. The server reads the agent's security settings once and sends the per-call prompt only if the agent enables `agent.prompt.prompt`. Agents it provisions enable it, so pinning one keeps the storyteller intact; a hand-built agent that leaves overrides off keeps its own dashboard prompt instead.

Turn detection is set to `patient` with a 12-second timeout, because children think mid-sentence. Calls are capped at 15 minutes.

`public/reactor-runtime/` is generated from the installed SDK by `predev`/`prebuild`. Vite rewrites the SDK's dynamic WASM import to this stable location; both development and production ship its required JS/WASM runtime. Fonts and demo artwork are local assets.

## Data and child-oriented design

- Parent-selected age range and access preferences; no account, name, camera, or diagnosis required.
- No emotion recognition from voice. Explicit statements such as “I feel scared” and chosen story directions inform the response.
- The app does not write recordings, transcripts, profiles, or stories to disk or a database. Refreshing clears the session. Audio is held briefly in memory for transcription. Call captions live only in browser memory and disappear when the call ends.
- OpenAI receives audio, story text/history, and age/language preferences. Reactor receives fictional visual prompts. ElevenLabs receives narrated page text when live narration is enabled, and during a story call it also receives live microphone audio, the composed storyteller prompt, and the story so far. Provider retention policies apply; `store: false` is not a claim of zero data retention, and ElevenLabs retains conversations according to its own workspace settings.
- A story call is a continuously open microphone for as long as it lasts, unlike the rest of the app. The call screen shows the connection state, elapsed time, and a mute control, and ending the call closes the stream.
- Input/output moderation and story constraints reduce risk but cannot guarantee child-safe text or video. This is a supervised hackathon prototype, not a production child-facing service. Before real child testing or a public launch, review provider requirements for minors, retention/consent, visual safety, authentication, and spending limits.
- The development server binds to loopback; production listens on `0.0.0.0` and Railway’s assigned `PORT`. Use proper authentication and provider usage limits before exposing paid API endpoints; the optional shared code is only a hackathon safeguard.

## Validation

```sh
npm test
npm run build
npm start
```

Tests exercise demo continuity and calming reactions, invalid input, missing keys, origin/access-code checks, audio validation, age/accessibility prompting, Reactor token scoping, and the storyteller's one-time agent provisioning, agent reuse, pinned-agent behaviour, prompt composition, and tool contract. Browser checks cover creating and steering a story, pause/resume, history, parent settings, the call screen on desktop and mobile, and desktop/mobile layouts. OpenAI story generation and transcription have been verified against the deployment. Orbis video has also been verified locally at 2560×1440 with advancing playback, prompt updates, and pause/resume. Live story calls require an ElevenLabs key with Agents access and have not yet been verified.

## API references

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI speech transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
- [ElevenLabs text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
- [Reactor Orbis Stable API](https://www.reactor.inc/models/visko-orbis-stable/api)
- [ElevenLabs Agents React SDK](https://elevenlabs.io/docs/agents-platform/libraries/react)
- [ElevenLabs client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools)

## Organizer starter compatibility

The [organizers’ starter](https://github.com/Visko-Platform/orbis-hackathon-starter) is the reference for our Orbis session lifecycle. Both projects use Reactor SDK 3.0.2 and `reactor/visko-orbis-stable`, with server-side, model-scoped, single-session token minting. The handshake declares both `main_video` and `main_audio`: Orbis requires the full track list even when audio generation is disabled.

Our integration handles command acknowledgments, nested model event payloads, the `conditions_ready` startup gate, and completed/reset runs. Readiness listeners are installed before the prompt is sent, and cancelled when a story is stopped. Some commands return an empty acknowledgment and broadcast their confirmation separately. We subscribe before sending, accept either a direct matching reply or a matching event, and require confirmation before reporting success. Regression tests cover the track contract, early/late events, empty acknowledgments, rejected commands, timeout, and cancellation.

The starter’s optional Gemini/Nano Banana image kickoff is not required for our GPT-driven, text-to-video flow. Our application uses OpenAI and Reactor keys; a Gemini key is not needed. Audio generation is disabled in Orbis because narration comes from ElevenLabs or the browser.

## Railway deployment

The GitHub-connected Railway service deploys from `main`. `railway.json` specifies the production build, start command, and `/healthz` healthcheck. Node 24 is selected through `package.json`; the TypeScript runtime is a production dependency. Railway’s HTTPS proxy is trusted only when its environment marker is present.

Set `OPENAI_API_KEY`, `REACTOR_API_KEY`, `ELEVENLABS_API_KEY`, and optionally `APP_ACCESS_CODE` in Railway’s service Variables. Local `.env` and `.env.local` files are ignored by Git and are not sent by the GitHub deployment. Without keys the deployed app runs in demo mode. Do not set `PORT` manually unless configuring a specific target port.

Pin `ELEVENLABS_AGENT_ID` in Railway once the agent exists. Otherwise each fresh workspace provisions its own, and a deploy that cannot reach the ElevenLabs agents API will fail the first story call rather than the healthcheck.

# Little Wonder: Reactor API review

Reviewed September 12, 2026, against app commit `b5fbf16`, the installed SDK source, Reactor’s current documentation, and the live checks from this session.

## CLI connection: verified

Reactor CLI `v1.20260911.25849` is installed at `~/.local/bin/reactor`. Authentication is stored in the macOS system keychain. `reactor whoami --json` independently validated the saved credential; it does not depend on Railway injecting environment variables. New zsh terminals include the CLI on PATH.

`reactor ls --all --name visko -l` returned both `reactor/visko-orbis-stable` and `reactor/visko-orbis-dynamic` as active public models. This proves catalog visibility, not a guaranteed available GPU or quota for a new session.

`reactor doctor` passed credential and API checks. Docker is unavailable and this repository has no Reactor model workspace. Those are relevant to building/deploying our own model containers; Little Wonder consumes hosted Orbis and does not need them. The CLI primarily manages model deployments, identity, and logs. Our browser SDK still handles live commands and WebRTC. [CLI reference](https://docs.reactor.inc/deploy/cli-reference/commands), [installation](https://docs.reactor.inc/deploy/platform/installation)

Useful commands:

```sh
reactor whoami
reactor ls --all --name visko -l
reactor logs --session <our-session-id> --since 10m
```

The logs command is supported by the CLI; access to hosted Orbis session logs has not yet been tested. Capture our session ID first and scope requests to that session. Do not query the shared model’s complete logs. [Logging reference](https://docs.reactor.inc/deploy/platform/logs)

## What already works

The app has produced actual Orbis video locally and on Railway: 2560×1440 playback advanced continuously. Local checks also covered a subsequent story turn and pause/resume. All 18 regression tests passed after the fixes. Microphone transcription and ElevenLabs narration have separate integrations; Orbis is receiving visual prompts, not the child’s microphone.

Two compatibility fixes must stay: declaring both output tracks, and accepting either a direct lifecycle acknowledgment or its matching broadcast. The live SDK rejected our video-only track declaration and returned an empty `start` reply before broadcasting confirmation. Some documentation examples describe different behavior. Tested runtime behavior takes precedence over those examples.

The npm registry reports base SDK `3.0.2`, which we already use. The typed Orbis package is now published as `@reactor-models/visko-orbis-stable@2.3.0`, depending on base SDK `^3.0.0`. Older pages saying it is unpublished are stale. A typed wrapper could reduce schema mistakes, but migration needs the same live startup/cancellation tests; it is not itself a video-quality improvement.

## Recommended improvements, in order

### 1. Separate scene setup from live changes

**Current:** `shared/story.ts` explicitly tells GPT to restate character appearance and the environment on every page. `src/App.tsx` sends that full description for startup, subsequent turns, and reconnection.

**Finding:** The dedicated prompt guide recommends one complete initial scene, then one concrete visible change per update. New characters should enter through an action. It describes several chunks, usually 2–4 seconds, for a change to become visible; this excludes our transcription and GPT latency. This is guidance to test, not a guaranteed response time. [Orbis prompt guide](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide)

**Proposed implementation:** Keep two fields: `scenePrompt`, a complete scene usable at startup or after a lost connection, and `visualChange`, a short action used only to steer an existing run. Maintain a small story state for character appearance, location, and the latest visual change. Do not replace the only full-scene field with a delta: reconnecting with “the rabbit enters” would lose the world’s context.

Example live change: “A small white rabbit hops into view beside the fox and gently touches the glowing lantern.” For an explicitly frightened reaction: “The fox sits down beside the lantern. Its light becomes soft and warm. The camera stays still.”

**Acceptance:** Start a scene, introduce a rabbit, then reconnect. Verify the action occurs in the running stream, and the restored scene retains both characters. Record prompt acceptance separately from visible change.

### 2. Make reactions interrupt the experience

**Current:** Speech uses tap-to-record clips. Each submitted transcript requests another complete page. Narration and video start after GPT finishes that page. The app is not continuously listening or recognizing emotions from voice.

**Proposed implementation:** Add an explicit parent-enabled listening mode with speech activity detection and clear listening status. Speech onset should stop narration immediately. Route questions, next-story requests, and stated discomfort differently. For a discomfort response, pause video immediately while preparing a moderated, calmer scene rather than continuing the previous motion through the full generation delay. Keep manual input available.

This is our application architecture, not a feature the Orbis API supplies. Preserve echo cancellation and avoid interpreting the narrator’s own speech as a child’s instruction. Measure speech-end → transcript → story → prompt accepted → visible change before selecting a faster speech/GPT transport.

**Acceptance:** A spoken interruption stops narration, causes one intended action, and does not record the app’s own playback as a new turn.

### 3. Track actual playback and session state

**Current:** We mainly use a `started` boolean and label the picture live when `chunk_complete` reports emitted frames. We do not retain the session ID or display first-frame/steering diagnostics. `generation_complete` changes a label, but does not offer a dedicated continuation control.

**Proposed implementation:** Use the model’s `state` snapshot for run state, pause state, and available resolutions. Distinguish connecting, waiting for generation, receiving the first frame, playing, paused, and finished. Mark video as playing from the video element’s actual playback/frame events. Add session ID, last error code, retry delay, and timing measurements to a grown-up diagnostics panel. Offer continuation when the model reports a finished run.

The first generated chunk can emit zero frames. Runs can finish at their chunk limit; they do not automatically restart. [Model schema](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/schema)

**Acceptance:** A zero-frame warm-up never appears as a failure, lost playback does not keep claiming live video, and diagnostics identify the exact session for CLI investigation.

### 4. Recover without creating overlapping sessions

**Current:** Every SDK error destroys the client. Reconnect creates another session. Disconnect is launched without awaiting completion before a replacement can start. Error handling discards `recoverable`, `operation`, and `retry_after_ms`. Tokens expire after ten minutes, but contain no session-duration cap.

**Proposed implementation:** Serialize teardown and replacement; classify fatal errors versus recoverable transport failures using the installed SDK’s contract. Respect retry delays with bounded backoff and preserve the latest scene. Add an explicit maximum session duration to token constraints and an idle/end-session policy. Keep “pause the story” distinct from “release the video session.”

Token expiry does not end an already-running session. Paused/idle sessions may still reserve and bill for GPU time. The earlier rate-limit errors cleared, but we did not establish whether they were caused by account concurrency, burst quota, or a model-specific limit. [Rate limits](https://docs.reactor.inc/resources/rate-limits), [billing](https://docs.reactor.inc/resources/billing)

**Acceptance:** New story, rapid reconnect, navigation, and connection failure release the previous session; repeated errors do not produce an unbounded reconnect loop.

### 5. Improve visual consistency after steering works

Use a 16:9 reference image to anchor the chosen storybook style and character design. Maintain appearance in story state; use the image for the opening or a deliberate restart, not every reaction. Start with text-only steering tests so image generation does not obscure the basic control loop. Reference images strengthen style guidance, but drift remains possible. [Prompt guide](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide)

Prefer a supported 1080p delivery tier for a small book panel when bandwidth matters, selecting it from `available_resolutions`. The observed 2560×1440 stream is upscaled delivery; documentation lists native generation at 832×480. A higher output tier does not establish more native model detail. [Model overview](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/overview)

## Next implementation slice

Start with separate full-scene and live-change prompts, plus session/first-frame diagnostics. They directly address weak reaction steering and make every later improvement measurable. Then implement interruption handling and bounded recovery. Compare Stable versus Dynamic on the same scripted reactions before changing models; their names and catalog availability alone do not establish which will perform better.

This review changes no application behavior. CLI installation/authentication is complete; the items above are proposed implementation work.

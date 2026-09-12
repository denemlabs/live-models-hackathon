# Little Wonder: adaptive adventure direction

Implemented camera-free scope, following Simon’s product notes.

## Pitch

Remember shouting answers at Dora, knowing she would carry on exactly the same way?

Little Wonder makes that conversation real. A child suggests an adventure, asks a question, or changes their mind—and the story responds. The characters, narration, and choices can change around their contribution, so they help create the adventure instead of only watching it.

The prototype accepts submitted voice, text, and choices and generates stories, narration, and live video. The interface now changes between story choices, factual answers, simplified retellings, calm breaks, and endings. Voice remains tap-to-record, then tap-to-send (30-second maximum); continuous listening is not implemented.

## First version: interaction without a camera

Use deliberate speech, text, choices, and replay requests as the strongest signals. Pointer movement and hovering are not tracked. Pointer-down and keyboard events reset a local 30-second quiet timer; no coordinates or interaction telemetry are sent to providers. Inactivity is not treated as measured attention, interest, or emotion. A child can be listening closely without touching anything.

Keep touch and keyboard interaction equivalent to mouse interaction. Do not rearrange a control while the child is pointing at it. Respect the grown-up’s reduced-motion and large-text settings throughout.

| Child interaction | Implemented response |
| --- | --- |
| “Can the fox meet a rabbit?” | Introduce the rabbit through one visible action and offer story choices involving it. |
| “Why is the moon following us?” | Answer briefly in the adventure, then offer to continue; do not automatically jump to another chapter. |
| “Make it gentler” button | Immediately stop narration and the Orbis session, cancel a pending story request, and prepare a calm page. Stay paused until “Continue gently.” Submitted discomfort is routed to a calm page after GPT responds. |
| Replays the current page twice | Enlarge the choices and offer an explicit “Use simpler words” action. A simplified retelling preserves the chapter and enables simple language for subsequent pages. |
| Pauses without input | Offer a quiet, dismissible “Take your time / Hear it again” helper; do not assume disengagement. |
| Uses a mouse or touch target | Give clear focus/pressed feedback; do not silently rewrite the story based on pointer position. |

## How the interface adapts

The application’s code renders a small set of familiar components: story, listening, answering a question, choosing, and taking a break. GPT returns a validated response kind, acknowledgment, story text, and choices. Explicit button actions override response-kind routing. Answers preserve the existing scene on the server and render as an aside on the client, without adding a chapter or steering Orbis. The last six question/answer pairs provide follow-up context. The app selects the appropriate components and keeps navigation predictable.

This does not require generating interface images. Orbis remains responsible for the live fictional scene; the web app is responsible for controls and layout. Runtime execution of arbitrary generated code is unnecessary for this version.

## What would make the demonstration convincing

1. Start a fox adventure.
2. Ask for a rabbit and see it enter the ongoing scene.
3. Ask a question and receive a relevant answer rather than an unrelated next page.
4. Interrupt with a request to slow down; narration stops and the experience becomes calmer.
5. Continue using either speech or visible choices.

The live video receives a complete scene on startup/reconnect and a short visible transition on ordinary story updates. Startup coalescing uses the latest complete scene to avoid losing intermediate context. Provider rendering remains asynchronous; a submitted change is not proof that its requested character is already visible.

The interface never advances a chapter automatically. “Take your time” is a silent, dismissible helper, suppressed during recording, narration, requests, pauses, and settings. No camera permission, emotion inference, stored child profile, or arbitrary generated code is involved.

## Validation

Build and 20 API/protocol tests pass. Browser checks cover chapter-preserving answers, replay-driven simplification, calm pause/resume, and an ending that offers a new adventure. Live GPT checks confirmed a question stayed on chapter 1 and a fox-meets-rabbit request created chapter 2. Orbis rendered the fox, blue scarf, lantern, and white rabbit in a real 2560×1440 video stream. A subsequent request introduced a red butterfly into the running video, visibly confirming a live transition. Clicking “Make it gentler” during a pending continuation immediately detached and paused the video. Rendering latency and instruction adherence remain provider-dependent.

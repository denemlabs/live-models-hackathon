# WonderBook immersive experience

Implemented locally on `julian`, 2026-09-12. No commit, push or deployment in this scope. Existing branding assets and unrelated work were preserved.

## What changed

- One full-viewport audiovisual stage with `object-fit: cover`, a centered crop and safe-area controls. No framed player or page scroll.
- Original option-3 wordmark, pause, narration toggle and adult settings float above the world.
- The question and microphone appear immediately. Typed input works during the opening. Nothing records or narrates on arrival.
- An eight-second local opening plays once, followed by a twelve-second forest loop. Both are silent H.264 MP4s. The welcome uses no provider calls and has no generation cost per visit.
- Separate intro, ambient and live video elements. Explicit `opening`, `ambient`, `connecting`, `live` and `paused` phases.
- `requestVideoFrameCallback`, with a guarded legacy fallback, reveals live video only after a **playing** decoded frame. A loaded first frame while autoplay is blocked is not readiness.
- The forest stays decoded beneath live playback. An early live connection advances the local fallback to the forest; a disconnected stream cannot bring the book back. Empty streams are hidden immediately rather than fading through black.
- Reduced-motion and rejected autoplay preserve a still view with Play background. Pause freezes local video, stops microphone/narration, and cancels incomplete story or initial Orbis work.
- One sentence at a time, manual sentence navigation, and a full-page reading overlay with page navigation. There is no word-level audio synchronization claim.
- Existing story, transcription, narration and Orbis hook/API contracts remain intact. No public endpoint or HyperFrames runtime dependency was added.

## Delivered media

All files are under `public/media/welcome/`.

| File | Duration / format | Bytes |
| --- | --- | ---: |
| intro-desktop.mp4 | 8s, 1920 × 1080, 30fps | 3,852,726 |
| ambient-desktop.mp4 | 12s, 1920 × 1080, 30fps | 5,620,974 |
| intro-mobile.mp4 | 8s, 720 × 1280, 30fps | 1,214,279 |
| ambient-mobile.mp4 | 12s, 720 × 1280, 30fps | 1,666,834 |
| poster-desktop.jpg / poster-mobile.jpg | First frame, desktop / portrait | — |

MP4s have square pixels, fast-start metadata, one-second keyframe intervals and no audio streams. Mobile is a center crop, not stretched. The device variant is selected once per visit to avoid changing a playing source during rotation.

## Production and credit record

Orbis Stable footage was generated through the authenticated Reactor sandbox after the user reported closing their previous session. Three failed connection attempts did not create session rows. One successful owned session produced three 32-second captures: initial book take, forest continuation, and revised book take. No additional revision was generated.

Reactor Usage showed our session starting at **21:13 UTC / 14:13 PDT**, lasting **6m 49s**, status **CLOSED**. The account showed **zero active sessions** after capture. Existing sessions were not disconnected by this work.

Displayed rate: **97 credits/second**. Duration-rate estimate: **409 × 97 = 39,673 credits**, below the authorized 250,000 cap. **This is an estimate, not a confirmed transaction debit**: Usage exposed duration, not billed credits, and there was no exact pre-session balance. Paused time and billing rounding were not independently documented. No payment, card, top-up or recharge change was made.

Offline source project: `../videos/wonderbook-portal/` relative to this repository. It contains the three source clips, exact prompts, BRIEF, edit map, HTML/GSAP composition, master render and `prepare-web-assets.sh`. HyperFrames was used only for trimming and dissolves. The user explicitly approved the Studio preview before export.

Selected book source begins at 3.5s and plays at 1.25× for eight seconds. Forest source 15–16s dissolves over the last second; ambience uses source 16–28s with a final one-second return to source 15–16s. The raw model take did not literally complete a camera traversal through the pages; the approved dissolve completes the arrival into the forest. The loop contains no book; its seam is a gentle visible dissolve, not a claim of mathematically identical motion.

## Verification (2026-09-12)

- `npm run build`: passed with integrated assets.
- `npm test`: **24/24 passed**, including existing provider/security/protocol tests and ten media lifecycle/caption tests.
- `git diff --check`: passed.
- HyperFrames `check --snapshots --at 0,3,7.5,8,14,19.5,19.99 --timeout 30000`: passed with no lint/runtime/layout/motion issues. No text is burned in, so contrast audit had zero text checks.
- Master export: 20 seconds, 600 frames, 1920 × 1080, 30fps, video-only. Source sparse-keyframe warnings were reported; the renderer extracted source frames and completed. Exported contact-sheet inspection showed book/opening/forest rather than frozen frames.
- FFprobe confirmed four clip durations/resolutions, square pixels and no audio streams. FFmpeg black detection reported no black segments in desktop intro or ambient.
- Desktop 1280 × 720 and mobile 390 × 740: video stage matched the viewport; no document overflow at observed sizes. Question, typed input, selected logo, microphone, reactions and floating controls inspected.
- Typed sample story started during the actual opening (before its first second finished). Intro ended at exactly 8s and ambient was playing with loop enabled; the book did not replay.
- Manual sentence navigation, full-text overlay, Escape dismissal, story reactions, pause and exit checked in the browser.
- Reduced available height 390 × 400 simulated a mobile keyboard: input stayed in view. Short portrait layouts keep controls in a column to avoid clipping.
- Dev-only `tests/media-smoke.html` tested slow/empty streams, first playing frame, disconnect, pause, reduced-motion poster, denied microphone and rejected autoplay/manual recovery with synthetic media. The harness is not a production entrypoint and uses no provider credits.

## Boundaries

Real Orbis footage generation succeeded in Reactor, but the **app's voice → GPT → Orbis → narration pipeline was not tested against real providers in this work**. Local QA ran with provider keys blank and clearly labeled sample stories. The first-frame/denial/slow-connection cases used synthetic fixtures. Native iOS/Android keyboard, permission prompts and Safari autoplay still need a physical-device rehearsal; viewport simulation is not that test.

The app's sample story is deterministic. Do not pitch the local welcome clip as Live, or present a sample response as an arbitrary generated story. Configure provider keys server-side for the team's live integration test.

## Reproduction

From the app: `npm test`, `npm run build`, `npm run dev`.

From `videos/wonderbook-portal`: review `BRIEF.md`, `frame.md`, `STORYBOARD.md` and `index.html`; run HyperFrames check and Studio preview; after approved review render the master, then `sh prepare-web-assets.sh`. The asset preparation script refuses to overwrite files by default.

## Mobile follow-up (2026-09-12)

Physical iPhone feedback exposed a gap in the earlier small-window check: opening the keyboard could pan Safari independently of resizing, leaving the resized video out of view. The background now stays fixed and full-sized; only a separate floating-controls layer follows visual viewport geometry on resize and scroll. Safe-area coverage is enabled without disabling zoom. Typed entry is compact, keeps a 16px field, uses preventScroll focus, and preserves the mounted/playing video. Native browser chrome is outside the app's control.

Build and **30 tests passed** after this correction. `tests/viewport-smoke.html` (development only, not built into dist) simulates an independent 280px viewport pan with 340px and 230px visible heights while the 393x740 layout/video remains unchanged. Input stayed 12px above the visible bottom; dismissal restored geometry; sample submission and video playback passed. Public 393x340 and desktop 1280x720 checks had no overflow or observed console errors. These are synthetic checks: post-fix physical iPhone verification remains pending.

At the user's subsequent request, this build is served via a temporary HTTPS phone-preview tunnel with provider keys absent. This is not a permanent deployment, does not change team production and consumes no generation credits.

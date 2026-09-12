# WonderBook: the story after the welcome

Implemented on julian, September 12, 2026. Open `/?preview=story` on the existing server to review the shared interface without provider keys or microphone access. The preview is opt-in, labeled and uses saved forest footage with scripted text; it is not a live-generated story.

## How to review

1. Read the first caption, then use the arrows or **Preview** to see short timed cues. Timed advancement is an illustration, not audio synchronization; it starts only on request.
2. Open **Design preview** and select a stage. The selector intentionally holds states so reviewers can inspect them.
3. Use the simulated microphone twice, or **Gentler**, to see pending-reaction feedback and a gentler scripted response.
4. Try pause/resume, **Type instead** then cancel, **Read story**, **Cozy ending**, and the connection-error retry.
5. Leave design preview through the menu to check the normal app flow.

## Stage contract

| Stage | Visible experience | Evidence boundary |
| --- | --- | --- |
| Preparing story | Short arrival message over playing forest | Actual busy UI plus held simulation |
| Connecting video | Story/captions available, preparing-world feedback | Simulated connection; real first-frame gate unchanged |
| Story | Brief subtitles, smaller microphone, reactions | Shared actual components; saved video |
| Speaking / transcribing | Clear listening/transcription feedback | Scripted preview; no microphone opened |
| Adapting | Last caption retained with pending-change feedback | Scripted delay, cancellable |
| Gentler | Reassuring continuation preserving character names | Scripted text; video does not morph |
| Pause | Video stopped; timed caption preview suspended | Browser verified |
| Ending | Short final text and new-story action | Explicit The end detection, no schema change |
| Error | Saved world remains, readable message, manual retry | Simulated failure; no real provider outage induced |

## Subtitle decisions

Shared captions preserve every word and punctuation while splitting long sentences into approximately two-line reading cues at normal phone text size. Long words and large-text accessibility settings can wrap further. Manual navigation is independent of current narration. Exact synchronized captions require narration timecodes or a separate sentence-aligned audio contract; no such provider change was implemented.

The optional preview timer is explicitly labeled, stops while the experience is paused or an overlay is open, and does not fabricate spoken-word highlighting. Opening/cancelling typed entry preserves the current cue. Video elements stay mounted throughout.

## Verification

- Build and **37 tests passed**; diff whitespace check passed.
- Public mobile 393x740: all nine selectable stages, playing saved background and no page overflow.
- 393x400: subtitles and typed entry remain accessible; error recovery initially clipped, then was fixed and rechecked at bottom 386px within a 400px viewport.
- Desktop 1280x720: full stage coverage, no page overflow or observed warning/error logs.
- Timed cue movement, pause/resume, manual navigation, typed-entry cancel, full text, simulated reaction, ending, error retry and ordinary sample-story API flow checked in browser.
- Real voice/story/Orbis/narration pipeline and physical iPhone keyboard retest remain outstanding. No paid generation was activated by this preview.

React review kept media identity stable, reused App/StoryCaption/VideoStage, cleaned up timers, avoided rerendering on every viewport pixel change and retained keyboard-focus continuity. No dependency or server endpoint was added.

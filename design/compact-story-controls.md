# Compact story controls — September 12, 2026

Built on the integrated team revision `47c1392`, on `julian`. Prepared for the user-requested publication to the shared `julian` branch; this handoff does not imply a merge to `main` or deployment. At publication preparation, `main` had advanced to `5eddde1`; those newer changes are not included here.

## Experience

- Keep the video mounted and full-screen; smaller captions sit near the lower edge.
- Keep the microphone, Type instead and What next? in one compact bar.
- What next? reveals existing questions, choices, reactions and calming/replay actions. It closes on action, outside pointer or Escape; Escape returns focus to its trigger. The panel remains available when paused so Continue gently stays reachable.
- Read story is an accessible book-icon button. Pause, exit and adult settings remain available.
- Errors retain their full message in a disclosure, with a visible retry and saved-background label. A recorded clip is never relabeled Live.
- Mobile controls fit a 320px viewport; short-height panels scroll. Large-text preference remains supported.

## Integration boundary

Changes are limited to App composition, captions, new StoryOptions/StoryNotice components, CSS and tests. Existing story actions, voice/provider hooks, server contracts, video stage and first-frame narration gate are preserved. This does not fix or diagnose an Orbis disconnect.

## Verification

`npm run build`, `npm test` (78/78) and `git diff --check` passed. Vite retains its large StoryCall/HLS chunk warnings.

At 1280x720, the same default-size scripted scene's reading dock decreased from 354.375px to 161.672px in height, approximately 54%. This is a dock-height comparison, not a claim about every state or all occupied pixels.

Browser checks covered 842x780, 1280x720, 393x740, 393x400 and 320x568. Verified disclosure/focus, typed input over playing video, error details/retry, full text, larger text, quiet-story pause/resume, ending and restart. Paid providers and microphone permission were not activated. Resized viewports do not replace a physical iPhone keyboard retest.

Use `/?preview=story` for the labeled scripted preview; it never calls live providers. For normal sample-mode testing leave provider credentials unset. Preserve production sessions when reviewing this UI.

## Integration with simon

Merged with the topic-first storybook and voice/video fixes. The current question and numbered choices remain visible while extra actions use What next?. Live mode keeps the complete narrated page in a compact scrollable caption; only the design preview has manual subtitle cues. Narration retry, hands-free answers, received-answer feedback, and same-session picture regeneration remain available. The video error notice avoids claiming a saved background is visible when the live-story loading state hides it.

The combined build and 88 tests passed. Browser checks covered the compact actions disclosure, visible numbered options, and the full-text sample reader.

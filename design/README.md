# Julian's WonderBook frontend handoff

## Integrated application

This design is now integrated with the current story calls, adaptive choices and open-ended questions, factual-question asides, calming controls, and server-owned Orbis sessions. The live stage's first presented frame releases the existing narration gate; the saved welcome animation cannot release it. The normal app retains automatic narration and adds a mute control. The labeled design preview keeps providers disabled.

The original handoff notes below describe the branch before integration.

This branch contains the immersive frontend reviewed on September 12, 2026: full-screen welcome/video stage, floating controls, the selected WonderBook wordmark, mobile keyboard handling, short captions, and a labeled design-preview mode.

## Run this branch

Use a clean checkout or worktree so you do not overwrite your own work. Check out `origin/julian`, use Node.js 24, then run:

```sh
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:3000/` for the normal app or `http://localhost:3000/?preview=story` for the scripted design review. In design preview, use **Design preview** to inspect the nine stages and **Preview** below the captions to illustrate timed advancement.

The design preview does not request microphone access or call paid providers. The ordinary app can use configured providers; leave provider keys unset when reviewing sample mode. Do not expose `.env` files or credentials.

## Integration boundary

This frontend branch is based on `de5706a` (the earlier shared main revision). At publication preparation, remote main was `694e332`, containing newer story-call, adaptive-choice and Orbis-session work. Those changes are **not included in this frontend snapshot**. Both lines of work change `src/App.tsx`, so a reviewed integration is required; do not resolve it by replacing the newer main file wholesale with this one.

The existing server and provider hooks in this snapshot are unchanged by the frontend work. Passing this branch's build and tests is not proof that its design is integrated with the latest main or that the live voice-to-video loop works.

No merge to main, pull request, permanent deployment, or live-provider activation is part of this branch publication. The local private project wiki and production source captures are not included.

## Review documents

- [Current immersive experience and welcome media](immersive-experience.md)
- [Story-stage and subtitle preview](story-stage-preview.md)

Other documents and screenshots in this directory preserve earlier design iterations. Their dated "no push" statements describe their original implementation scope, before this branch handoff; the earlier framed layouts are not the current experience.

The rendered MP4s and posters needed to run the app are included. The offline video-authoring project referenced in the production notes is not required at runtime and is not part of this repository.

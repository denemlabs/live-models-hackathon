# WonderBook interface — design handoff

Local design implementation, September 12, 2026. Branch: `julian`, based on `de5706a`. No deployment or push.

## Visual direction

Forest-green playful wordmark, warm cream paper, and golden voice/action accents. Editorial display type is paired with readable DM Sans controls. The welcome page pairs a compact working story composer with a portrait storybook illustration; the reader keeps the artwork and narrative in a paper spread, with reactions outside the page.

- Selected wordmark: [original PNG](../public/brand/wonderbook-round2/03-playful-wordmark.png), unchanged; transparent padding is hidden by a CSS viewport.
- New welcome illustration: [PNG, 1122 × 1402](../public/brand/wonderbook-welcome-v1.png). This is decorative onboarding art, never represented as live Orbis output or as the current demo story.
- New presentational components: `src/Brand.tsx`.
- Visual layer: `src/wonderbook.css`, imported after the team's original stylesheet.
- Layout and English interface copy: `src/App.tsx`; page metadata: `index.html`.

No added dependencies. No edits to story generation, microphone, narration, Orbis, server endpoints, tests, or package/lockfiles.

## Checks

- TypeScript and production Vite build: passed.
- Existing API/protocol tests: 14 passed.
- Local browser: rendered without observed JS errors or Vite overlay.
- Welcome visually inspected at 1440, 768, and 390 px. Home and reader checked for horizontal overflow at 320 and 390 px: none.
- Demonstration story creation, written response, gentler reaction, cozy ending, previous/next page, pause/resume, large text, reduced-motion setting, and mobile settings dialog/Escape focus restoration checked.
- React review: presentational components are module-level; no effects, fetches, or duplicated story state added. Existing request cancellation and event handlers remain unchanged.
- Live voice/video/narration providers were deliberately disabled for these tests. Their real behavior is not verified by this design pass.

## Preview captures

- [Desktop welcome](previews/wonderbook-home-desktop.png)
- [Mobile welcome](previews/wonderbook-home-mobile.png)
- [Desktop reader](previews/wonderbook-story-desktop.png)
- [Mobile reader](previews/wonderbook-story-mobile.png)

## Welcome image provenance

Generated using the built-in image-generation tool, not the CLI. Exact model version is not exposed by the tool. Original generated image was preserved, and the PNG was copied into the app. No changes were made to the selected wordmark.

### Exact generation prompt

Use case: illustration-story
Asset type: welcome-page hero illustration for WonderBook, a voice-driven children's fairy-tale storybook.
Primary request: a breathtaking, tender storybook illustration of a small brave princess and a friendly young forest-green dragon discovering a magical open book in an enchanted woodland at twilight. This is the decorative welcome illustration, not an example of live generated output.
Scene: lush layered woodland with velvety deep evergreen foliage framing the scene, small wildflowers and ferns, a winding pale path, a tiny warm distant castle between the trees. A few golden fireflies and a softly glowing crescent moon.
Subject: a little princess with warm brown skin, a short dark bob, tiny gold crown and soft cream-and-saffron dress, seated beside an endearing round green dragon. Both gaze down with wonder at a glowing open storybook between them. Cozy companionship, not peril.
Style: richly textured hand-painted children's picture book, gouache and colored pencil, expressive simple faces, organic shapes, exquisite subtle paper grain, sophisticated editorial color design, not plastic 3D, not anime.
Composition: portrait 4:5 composition for the right side of a website; characters and book grouped near the lower-middle, beautiful tall arching trees at the top. Scene fills every edge. No frame, no UI. Keep the main figures comfortably inside the center 75 percent for responsive cropping.
Palette: forest green, sage, warm cream, golden yellow, touches of dusty terracotta and muted teal. Warm luminous book light against emerald dusk.
Constraints: gentle and age-appropriate, no scary elements, no text, no typography, no logo, no watermark. Illustration only.

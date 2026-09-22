# POV CUT verification — 2026-09-22

## Scope

GPT-6 Astra agents independently reviewed the media engine and usability. The owner implemented changes and performed browser checks in the Codex Chromium browser on Windows.

Changes: sequential preview decoding, guarded play/stop startup, explicit slider locking, accessible slider names, grouped undo preserving selection, clip crop positioning, batch style/transition actions, local autosave, JSON export/import and original-file relinking. Saved recipes contain no video payloads. Imported recipes are schema/size/range validated.

## Checks

- `npx tsc --noEmit`
- `node scripts/test.mjs`: 21 assertions/test cases passed, including reusable decoder canvas pools, cancellation while awaiting a frame, project schema failures and crop geometry.
- Targeted oxlint: app/page.tsx, lib/project.ts, lib/video-engine.ts, lib/timeline.ts, components/ui/slider.tsx and scripts/test.mjs passed. The portable GitHub edition omits unused UI catalog components.
- Browser harness: `/scripts/browser-qa/index.html` while running `npm run dev`. Fixtures: 5.2-second long-GOP H.264/AAC and 1-second H.264/AAC, 1280×720, colored regions, animated marker, 440 Hz tone. No personal footage used.

| Export         |      Size | Audio | Result |
| -------------- | --------: | ----- | ------ |
| Portrait MP4   |  720×1280 | AAC   | Passed |
| Landscape WebM |  1280×720 | Opus  | Passed |
| Portrait MP4   | 1080×1920 | Off   | Passed |
| Landscape WebM | 1920×1080 | Off   | Passed |

Each output contained 150 video packets for two 2.5-second clips. Video duration was 5 seconds; AAC container duration included 13.3 ms of encoder padding. Verified intro/outro black frames, red/blue edge crops, frozen short-source tail, fade compositing, audio toggle and decoded audio peak (~0.25). WebM frame lookup used 4.999 seconds for the last frame because its timestamps are quantized to milliseconds.

Sequential preview checks passed for a clip jump and short-source freeze. Active export cancellation returned AbortError. UI checks covered uploading two fixtures, Japanese captions/hashtags, crop slider keyboard input, batch style application, one-step undo of continuous typing on clip 2, playback, UI export completion, locked trim/crop sliders during export, JSON download/import, page reload/autosave restoration and file relinking. Restored clip count remained two and caption, color, crop and hashtag settings matched the saved JSON.

## Portable GitHub edition

The standalone React/Vite edition passed full `npm run lint`, all 21 tests and the TypeScript/production build with `BASE_PATH=/pov-cut/`. The production preview at the same subdirectory loaded successfully in Chromium. A generated H.264/AAC fixture imported, Japanese caption editing worked, and portrait 720p MP4 export completed with a download link. No browser console errors were observed. This smoke test supplements the media matrix above; it does not extend the device coverage.

## Limits

This verifies the tested Chromium environment, not every device or codec. Actual Rokid/other glasses footage, Safari/iOS, HEVC variants, 2 GB files, 30 sources/150-second stress workloads and low-memory phones have not been exercised. No absolute claim of zero bugs is made. This report originally covered the private Sites edition. GitHub publication is a separate release of the same client-side editor.

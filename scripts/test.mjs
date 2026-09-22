import { readFile, writeFile, mkdir } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
await mkdir(new URL('../.test-build/', import.meta.url), { recursive: true });
for (const name of ['timeline', 'video-engine', 'project']) {
  const source = await readFile(
    new URL('../lib/' + name + '.ts', import.meta.url),
    'utf8',
  );
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  await writeFile(
    new URL('../.test-build/' + name + '.js', import.meta.url),
    result.outputText.replaceAll("'./timeline'", "'./timeline.js'"),
  );
}
const t = await import('../.test-build/timeline.js');
const { paintFrame, wrapText, checkAbort, drawFit, Renderer } =
  await import('../.test-build/video-engine.js');
const { parseProject, sourceMatches } =
  await import('../.test-build/project.js');
const clip = {
  id: 'c1',
  assetId: 'a1',
  start: 0,
  text: '',
  style: t.DEFAULT_STYLE,
  transition: 'fade',
  fit: 'cover',
};
const base = { ...t.DEFAULT_SETTINGS, intro: 'none', outro: 'none' };
test('75 frames per clip, 150 seconds maximum', () => {
  assert.equal(t.CLIP_SECONDS * t.FPS, 75);
  assert.equal(t.MAX_CLIPS * t.CLIP_SECONDS, 150);
});
test('Splits exact durations, partial tails, and invalid input', () => {
  assert.deepEqual(t.splitStarts(5), [0, 2.5]);
  assert.deepEqual(t.splitStarts(5.1), [0, 2.5, 5]);
  assert.deepEqual(t.splitStarts(0.3), [0]);
  for (const v of [0, -1, Infinity, NaN])
    assert.deepEqual(t.splitStarts(v), []);
  assert.equal(t.splitStarts(100000).length, 60);
});
test('Seeking clamps to valid first and last frames', () => {
  assert.deepEqual(t.locateTime(-2, 2), { index: 0, local: 0 });
  assert.deepEqual(t.locateTime(2.5, 2), { index: 1, local: 0 });
  const last = t.locateTime(5, 2);
  assert.equal(last.index, 1);
  assert.ok(Math.abs(last.local - (2.5 - 1 / 30)) < 1e-10);
});
test('Short sources never seek beyond the end', () => {
  assert.equal(t.sourceTime(0, 2, 1), 0.999);
  assert.equal(t.sourceTime(5, 2.4, 6), 5.999);
  assert.equal(t.sourceTime(0, 0, 0.0001), 0);
});
test('Both orientations and resolutions have exact dimensions', () => {
  assert.deepEqual(t.outputSize({ aspect: 'portrait', resolution: 720 }), {
    width: 720,
    height: 1280,
  });
  assert.deepEqual(t.outputSize({ aspect: 'landscape', resolution: 720 }), {
    width: 1280,
    height: 720,
  });
  assert.deepEqual(t.outputSize({ aspect: 'portrait', resolution: 1080 }), {
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(t.outputSize({ aspect: 'landscape', resolution: 1080 }), {
    width: 1920,
    height: 1080,
  });
});
test('Japanese hashtags with mixed separators', () => {
  assert.deepEqual(t.normalizeTags('  #POV、＃日本語\n散歩,##空　カメラ '), [
    '#POV',
    '#日本語',
    '#散歩',
    '#空',
    '#カメラ',
  ]);
  assert.deepEqual(t.normalizeTags(' # ＃\n'), []);
});
test('Timecodes at second and minute boundaries', () => {
  assert.equal(t.timecode(2.5), '00:02.5');
  assert.equal(t.timecode(150), '02:30.0');
  assert.equal(t.timecode(59.999), '00:59.9');
});
test('Audio edge fades preserve volume away from edges', () => {
  assert.equal(t.edgeEnvelope(0, 'fade', 'none'), 0);
  assert.equal(t.edgeEnvelope(0.075, 'fade', 'none'), 0.5);
  assert.equal(t.edgeEnvelope(1.25, 'fade', 'black'), 1);
  assert.equal(t.edgeEnvelope(0, 'none', 'none'), 1);
  assert.ok(t.edgeEnvelope(2.49, 'none', 'black') < 0.1);
});
test('Japanese and emoji clusters wrap without corrupting glyphs', () => {
  const ctx = {
    measureText: (value) => ({
      width:
        [
          ...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(
            value,
          ),
        ].length * 10,
    }),
  };
  assert.deepEqual(wrapText(ctx, '今日の発見', 20), ['今日', 'の発', '見']);
  assert.deepEqual(wrapText(ctx, 'a👨‍👩‍👧‍👦b', 10), ['a', '👨‍👩‍👧‍👦', 'b']);
  assert.deepEqual(wrapText(ctx, '朝\n夜', 100), ['朝', '夜']);
});
function pixelContext() {
  return {
    pixel: [0, 0, 0],
    globalAlpha: 1,
    fillStyle: '#000000',
    blend(rgb) {
      this.pixel = this.pixel.map(
        (v, i) => v * (1 - this.globalAlpha) + rgb[i] * this.globalAlpha,
      );
    },
    fillRect() {
      this.blend(this.fillStyle === '#ffffff' ? [255, 255, 255] : [0, 0, 0]);
    },
    drawImage(image) {
      this.blend(image.pixel);
    },
  };
}
const red = { width: 10, height: 10, pixel: [255, 0, 0] },
  blue = { width: 10, height: 10, pixel: [0, 0, 255] };
test('No transition preserves the source color', () => {
  const ctx = pixelContext();
  paintFrame(ctx, red, null, clip, 0, [clip], base, 0);
  assert.deepEqual(ctx.pixel, [255, 0, 0]);
});
test('Fade blends previous and current scenes equally at its midpoint', () => {
  const ctx = pixelContext();
  paintFrame(ctx, red, blue, clip, 1, [clip, clip], base, 0.15);
  assert.deepEqual(ctx.pixel, [127.5, 0, 127.5]);
  assert.equal(ctx.globalAlpha, 1);
});
test('Intro fade starts black and ends with the full source', () => {
  const ctx = pixelContext(),
    s = { ...base, intro: 'fade' };
  paintFrame(ctx, red, null, clip, 0, [clip], s, 0);
  assert.deepEqual(ctx.pixel, [0, 0, 0]);
  paintFrame(ctx, red, null, clip, 0, [clip], s, 0.3);
  assert.deepEqual(ctx.pixel, [255, 0, 0]);
});
test('Black and white cuts reach the correct boundary color', () => {
  for (const [transition, expected] of [
    ['black', [0, 0, 0]],
    ['white', [255, 255, 255]],
  ]) {
    const ctx = pixelContext();
    paintFrame(
      ctx,
      red,
      null,
      { ...clip, transition },
      1,
      [clip, clip],
      base,
      0,
    );
    assert.deepEqual(ctx.pixel, expected);
  }
});
test('Outro ends on full black at the last encoded frame', () => {
  const ctx = pixelContext();
  paintFrame(
    ctx,
    red,
    null,
    clip,
    0,
    [clip],
    { ...base, outro: 'fade' },
    2.5 - 1 / 30,
  );
  assert.ok(ctx.pixel.every((v) => v < 1e-9));
});
test('Cancellation throws AbortError', () => {
  const c = new AbortController();
  c.abort();
  assert.throws(() => checkAbort(c.signal), { name: 'AbortError' });
});

const projectFixture = () => ({
  app: 'POV CUT',
  version: 1,
  sources: [
    {
      id: 'a1',
      name: 'source.mp4',
      size: 100,
      lastModified: 1000,
      duration: 5,
    },
  ],
  clips: [{ ...clip, cropX: 0, cropY: 1 }],
  settings: structuredClone(base),
});
test('Editing recipe roundtrips settings, captions and crop without video data', () => {
  const value = projectFixture();
  value.clips[0].text = '今日の目線 👓';
  assert.deepEqual(parseProject(JSON.stringify(value)), value);
  assert.equal(
    sourceMatches(value.sources[0], { name: 'source.mp4', size: 100 }),
    true,
  );
  assert.equal(
    sourceMatches(value.sources[0], { name: 'source.mp4', size: 101 }),
    false,
  );
});
test('Recipe rejects malformed, unsupported and over-limit data', () => {
  for (const mutate of [
    (p) => (p.version = 2),
    (p) => (p.clips[0].assetId = 'missing'),
    (p) => (p.clips[0].cropX = 2),
    (p) => (p.clips[0].start = 6),
    (p) => (p.settings.audio = 'true'),
    (p) => (p.clips[0].text = 'a'.repeat(121)),
    (p) => p.clips.push({ ...p.clips[0] }),
    (p) =>
      (p.sources = Array.from({ length: 31 }, (_, i) => ({
        ...p.sources[0],
        id: 'a' + i,
      }))),
    (p) => (p.settings.tagStyle.color = 'url(x)'),
  ]) {
    const p = projectFixture();
    mutate(p);
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
  assert.throws(() => parseProject('{'));
  assert.throws(() => parseProject(' '.repeat(1_000_001)));
});
test('Older crop-free recipe defaults to centered crop', () => {
  const p = projectFixture();
  delete p.clips[0].cropX;
  delete p.clips[0].cropY;
  const c = parseProject(JSON.stringify(p)).clips[0];
  assert.equal(c.cropX, 0.5);
  assert.equal(c.cropY, 0.5);
});
test('Crop reaches both edges and contain stays centered', () => {
  const calls = [],
    ctx = {
      fillRect() {},
      drawImage(...v) {
        calls.push(v);
      },
    };
  drawFit(ctx, { width: 1280, height: 720 }, 720, 1280, 'cover', 0, 1);
  assert.ok(calls[0][1] === 0);
  drawFit(ctx, { width: 1280, height: 720 }, 720, 1280, 'cover', 1, 0);
  assert.ok(calls[1][1] < -1500);
  drawFit(ctx, { width: 1280, height: 720 }, 720, 1280, 'contain', 0, 0);
  assert.equal(calls[2][1], 0);
  assert.equal(calls[2][2], (1280 - 405) / 2);
});
function fakeCanvas() {
  const image = { width: 10, height: 10, pixel: [0, 0, 0] };
  const ctx = {
    ...pixelContext(),
    fillRect() {
      this.blend(this.fillStyle === '#ffffff' ? [255, 255, 255] : [0, 0, 0]);
      image.pixel = [...this.pixel];
    },
    drawImage(other) {
      this.blend(other.pixel);
      image.pixel = [...this.pixel];
    },
  };
  image.getContext = () => ctx;
  return image;
}
test('Sequential preview copies reusable pool frames and holds short tails', async () => {
  const oldDocument = globalThis.document;
  const fakeDocument = { createElement: fakeCanvas };
  globalThis.document = fakeDocument;
  let closed = 0,
    opens = 0;
  try {
    const pooled = fakeCanvas();
    const asset = {
      id: 'a1',
      firstTimestamp: 0,
      duration: 1,
      sink: {
        async *canvases() {
          opens++;
          try {
            for (const [timestamp, pixel] of [
              [0, [255, 0, 0]],
              [0.2, [0, 255, 0]],
              [0.5, [0, 0, 255]],
            ]) {
              pooled.pixel = pixel;
              yield { canvas: pooled, timestamp, duration: 0.2 };
            }
          } finally {
            closed++;
          }
        },
      },
    };
    const renderer = new Renderer(
        [asset],
        [clip],
        { ...base, tags: '' },
        10,
        10,
      ),
      out = fakeCanvas();
    let now = 0.35;
    await renderer.drawPlaying(
      out.getContext(),
      () => now,
      new AbortController().signal,
    );
    assert.deepEqual(out.pixel, [0, 255, 0]);
    now = 0.7;
    await renderer.drawPlaying(
      out.getContext(),
      () => now,
      new AbortController().signal,
    );
    assert.deepEqual(out.pixel, [0, 0, 255]);
    now = 2.2;
    await renderer.drawPlaying(
      out.getContext(),
      () => now,
      new AbortController().signal,
    );
    assert.deepEqual(out.pixel, [0, 0, 255]);
    await renderer.close();
    assert.equal(opens, 1);
    assert.equal(closed, 1);
  } finally {
    globalThis.document = oldDocument;
  }
});
test('Cancellation during a pending decoder read never paints and releases iterator', async () => {
  const oldDocument = globalThis.document;
  const fakeDocument = { createElement: fakeCanvas };
  globalThis.document = fakeDocument;
  const controller = new AbortController();
  let closed = 0;
  try {
    const asset = {
      id: 'a1',
      firstTimestamp: 0,
      duration: 1,
      sink: {
        async *canvases() {
          try {
            await Promise.resolve();
            controller.abort();
            yield { canvas: red, timestamp: 0, duration: 1 };
          } finally {
            closed++;
          }
        },
      },
    };
    const renderer = new Renderer(
        [asset],
        [clip],
        { ...base, tags: '' },
        10,
        10,
      ),
      out = fakeCanvas();
    await assert.rejects(
      () =>
        renderer.drawPlaying(out.getContext(), () => 0.5, controller.signal),
      { name: 'AbortError' },
    );
    assert.deepEqual(out.pixel, [0, 0, 0]);
    await renderer.close();
    assert.equal(closed, 1);
  } finally {
    globalThis.document = oldDocument;
  }
});

import {
  Quality,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  CanvasSource,
  AudioBufferSource,
  Input,
  BlobSource,
  ALL_FORMATS,
  CanvasSink,
  AudioBufferSink,
  EncodedPacketSink,
} from 'mediabunny';
import {
  importAsset,
  exportVideo,
  Renderer,
  disposeAsset,
} from '../../lib/video-engine.ts';
import {
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
  outputSize,
} from '../../lib/timeline.ts';
const status = document.querySelector('#status'),
  downloads = document.querySelector('#downloads');
const log = (s) => (status.textContent += '\n' + s);
let files = [];
async function fixture(seconds, name) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const target = new BufferTarget(),
    output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: 2_000_000 }),
    keyFrameInterval: 5,
  });
  const audio = new AudioBufferSource({
    codec: 'aac',
    quality: new Quality({ bitrate: 128_000 }),
  });
  output.addVideoTrack(video, { frameRate: 30 });
  output.addAudioTrack(audio);
  await output.start();
  const buffer = new AudioBuffer({
    numberOfChannels: 2,
    length: Math.round(seconds * 48000),
    sampleRate: 48000,
  });
  for (let c = 0; c < 2; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < channel.length; i++)
      channel[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / 48000);
  }
  await audio.add(buffer);
  for (let i = 0; i < seconds * 30; i++) {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 427, 720);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(427, 0, 426, 720);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(853, 0, 427, 720);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((i * 9) % 1200, 550, 80, 50);
    ctx.font = '60px sans-serif';
    ctx.fillText('POV QA ' + i, 30, 690);
    await video.add(i / 30, 1 / 30);
  }
  video.close();
  audio.close();
  await output.finalize();
  return new File([target.buffer], name, {
    type: 'video/mp4',
    lastModified: 1000,
  });
}
document.querySelector('#fixture').addEventListener('click', async () => {
  try {
    status.textContent = 'Generating fixtures';
    files = [
      await fixture(5.2, 'pov-qa-long.mp4'),
      await fixture(1, 'pov-qa-short.mp4'),
    ];
    for (const file of files) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.textContent = 'Download ' + file.name;
      downloads.append(a, document.createElement('br'));
    }
    document.querySelector('#matrix').disabled = false;
    log('Fixtures ready');
  } catch (e) {
    log('FAIL ' + String(e));
  }
});
function assert(value, message) {
  if (!value) throw new Error(message);
  log('PASS ' + message);
}
document.querySelector('#matrix').addEventListener('click', async () => {
  const assets = [];
  try {
    status.textContent = 'Starting matrix';
    for (const f of files) assets.push(await importAsset(f));
    const clips = assets.map((a, i) => ({
      id: 'c' + i,
      assetId: a.id,
      start: i ? 0 : 1,
      text: '日本語 👓',
      style: { ...DEFAULT_STYLE },
      transition: 'fade',
      fit: 'cover',
      cropX: i ? 1 : 0,
      cropY: 0.5,
    }));
    for (const variant of [
      { aspect: 'portrait', resolution: 720, format: 'mp4', audio: true },
      { aspect: 'landscape', resolution: 720, format: 'webm', audio: true },
      { aspect: 'portrait', resolution: 1080, format: 'mp4', audio: false },
      { aspect: 'landscape', resolution: 1080, format: 'webm', audio: false },
    ]) {
      const settings = { ...DEFAULT_SETTINGS, ...variant },
        label = JSON.stringify(variant);
      log('EXPORT ' + label);
      const blob = await exportVideo(
        assets,
        clips,
        settings,
        () => {},
        new AbortController().signal,
      );
      const input = new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      });
      const track = await input.getPrimaryVideoTrack();
      const size = outputSize(settings);
      const sink = new CanvasSink(track);
      const first = await sink.getCanvas(0);
      assert(
        first?.canvas.width === size.width &&
          first?.canvas.height === size.height,
        'dimensions ' + label,
      );
      const duration = await input.computeDuration();
      assert(Math.abs(duration - 5) < 0.06, 'duration 5 seconds ' + duration);
      let packets = 0;
      for await (const _ of new EncodedPacketSink(track).packets()) packets++;
      assert(packets === 150, '150 encoded frames');
      const pixel = async (time) => {
        const frame = await sink.getCanvas(time);
        return Array.from(
          frame.canvas
            .getContext('2d')
            .getImageData(
              Math.floor(size.width / 2),
              Math.floor(size.height / 4),
              1,
              1,
            ).data,
        ).slice(0, 3);
      };
      assert(
        (await pixel(0)).every((v) => v < 12),
        'intro black',
      );
      assert(
        (await pixel(4.999)).every((v) => v < 12),
        'outro black',
      );
      if (variant.aspect === 'portrait') {
        const left = await pixel(0.5),
          right = await pixel(4);
        assert(left[0] > 220 && left[2] < 25, 'left crop red');
        assert(
          right[2] > 220 && right[0] < 25,
          'right crop blue; short-source freeze',
        );
        const blend = await pixel(2.65);
        assert(
          blend[0] > 60 && blend[2] > 60,
          'transition blends previous and current',
        );
      }
      const audio = await input.getPrimaryAudioTrack();
      assert(!!audio === variant.audio, 'audio toggle');
      if (audio) {
        let peak = 0;
        for await (const wrapped of new AudioBufferSink(audio).buffers()) {
          for (const v of wrapped.buffer.getChannelData(0))
            peak = Math.max(peak, Math.abs(v));
        }
        assert(
          peak > 0.1 && peak < 0.5,
          'decoded audio amplitude ' + peak.toFixed(3),
        );
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qa-${variant.aspect}-${variant.resolution}.${variant.format}`;
      a.textContent = 'Download ' + a.download;
      downloads.append(a, document.createElement('br'));
      input.dispose();
    }
    const settings = { ...DEFAULT_SETTINGS, audio: false },
      size = outputSize(settings),
      canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    const renderer = new Renderer(
      assets,
      clips,
      settings,
      size.width,
      size.height,
    );
    let time = 0.5;
    await renderer.drawPlaying(ctx, () => time, new AbortController().signal);
    assert(
      ctx.getImageData(360, 320, 1, 1).data[0] > 220,
      'sequential preview first frame',
    );
    time = 4;
    await renderer.drawPlaying(ctx, () => time, new AbortController().signal);
    assert(
      ctx.getImageData(360, 320, 1, 1).data[2] > 220,
      'sequential preview clip jump and freeze',
    );
    await renderer.close();
    const controller = new AbortController();
    const canceled = exportVideo(
      assets,
      clips,
      DEFAULT_SETTINGS,
      (p) => {
        if (p > 0.05) controller.abort();
      },
      controller.signal,
    );
    let aborted = false;
    try {
      await canceled;
    } catch (e) {
      aborted = e instanceof DOMException && e.name === 'AbortError';
    }
    assert(aborted, 'cancel active export');
    log('ALL MEDIA CHECKS PASSED');
  } catch (e) {
    log('FAIL ' + (e instanceof Error ? e.stack : String(e)));
  } finally {
    assets.forEach(disposeAsset);
  }
});

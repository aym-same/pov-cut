import {
  Quality,
  Input,
  BlobSource,
  ALL_FORMATS,
  CanvasSink,
  AudioBufferSink,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  AudioBufferSource,
  canEncodeVideo,
  canEncodeAudio,
} from 'mediabunny';
import {
  CLIP_SECONDS,
  FPS,
  TRANSITION_SECONDS,
  normalizeTags,
  outputSize,
  sourceTime,
  transitionAt,
  edgeEnvelope,
  locateTime,
  type Clip,
  type Settings,
  type TextStyle,
} from './timeline';

export type Asset = {
  id: string;
  file: File;
  url: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
  input: Input;
  sink: CanvasSink;
  audioSink: AudioBufferSink | null;
  hasAudio: boolean;
  audioDecodable: boolean;
  firstTimestamp: number;
};
const fontFamilies = {
  sans: 'Arial, "Yu Gothic", Meiryo, sans-serif',
  serif: 'Georgia, "Yu Mincho", serif',
  mono: '"Courier New", "Yu Gothic", monospace',
};
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('中止しました', 'AbortError');
}
export async function importAsset(file: File): Promise<Asset> {
  if (file.size > 2 * 1024 ** 3)
    throw new Error('1ファイル2GB以下の動画を選んでください。');
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error(
        'この動画をデコードできません。Chrome / Edgeで開くか、H.264のMP4に変換して追加してください。',
      );
    const firstTimestamp = await track.getFirstTimestamp();
    const duration = (await input.computeDuration([track])) - firstTimestamp;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('動画の長さを読み取れませんでした。');
    const sink = new CanvasSink(track, { poolSize: 2 });
    const first = await sink.getCanvas(firstTimestamp);
    if (!first) throw new Error('動画の最初のフレームを読み取れませんでした。');
    const thumb = document.createElement('canvas');
    thumb.width = 320;
    thumb.height = 180;
    const ctx = thumb.getContext('2d')!;
    drawFit(ctx, first.canvas, 320, 180, 'cover');
    const audio = await input.getPrimaryAudioTrack();
    const audioDecodable = audio ? await audio.canDecode() : true;
    return {
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      duration,
      width: first.canvas.width,
      height: first.canvas.height,
      thumbnail: thumb.toDataURL('image/jpeg', 0.75),
      input,
      sink,
      audioSink: audio && audioDecodable ? new AudioBufferSink(audio) : null,
      hasAudio: !!audio,
      audioDecodable,
      firstTimestamp,
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
export function disposeAsset(asset: Asset) {
  URL.revokeObjectURL(asset.url);
  asset.input.dispose();
}
type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function drawFit(
  ctx: Context,
  image: Canvas,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
  cropX = 0.5,
  cropY = 0.5,
) {
  const scale = (fit === 'cover' ? Math.max : Math.min)(
    width / image.width,
    height / image.height,
  );
  const w = image.width * scale,
    h = image.height * scale;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(
    image,
    (width - w) * (fit === 'cover' ? cropX : 0.5),
    (height - h) * (fit === 'cover' ? cropY : 0.5),
    w,
    h,
  );
}
export function wrapText(
  ctx: Pick<Context, 'measureText'>,
  text: string,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  // Preserve Japanese glyphs and emoji sequences when wrapping.
  const segmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
      : null;
  for (const paragraph of text.split('\n')) {
    let line = '';
    const chars = segmenter
      ? Array.from(segmenter.segment(paragraph), (v) => v.segment)
      : Array.from(paragraph);
    for (const char of chars) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        result.push(line);
        line = char;
      } else line += char;
    }
    result.push(line);
  }
  return result;
}
function textBlock(
  ctx: Context,
  text: string,
  style: TextStyle,
  width: number,
  height: number,
  placement: 'center' | 'bottom',
) {
  if (!text.trim()) return;
  const unit = Math.min(width, height) / 720;
  let size = style.size * unit;
  let lines: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    ctx.font = `600 ${size}px ${fontFamilies[style.font]}`;
    lines = wrapText(ctx, text, width * 0.82);
    if (
      lines.length * size * 1.4 <
      height * (placement === 'center' ? 0.48 : 0.22)
    )
      break;
    size *= 0.86;
  }
  const lineHeight = size * 1.4;
  const top =
    placement === 'center'
      ? height / 2 - ((lines.length - 1) * lineHeight) / 2
      : height * 0.88 - (lines.length - 1) * lineHeight;
  ctx.save();
  ctx.fillStyle = style.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = size * 0.2;
  lines.forEach((line, i) => {
    ctx.strokeText(line, width / 2, top + i * lineHeight);
    ctx.fillText(line, width / 2, top + i * lineHeight);
  });
  ctx.restore();
}
export function paintScene(
  ctx: Context,
  image: Canvas,
  clip: Clip,
  settings: Settings,
  width: number,
  height: number,
) {
  drawFit(ctx, image, width, height, clip.fit, clip.cropX, clip.cropY);
  textBlock(ctx, clip.text, clip.style, width, height, 'center');
  textBlock(
    ctx,
    normalizeTags(settings.tags).join('  '),
    settings.tagStyle,
    width,
    height,
    'bottom',
  );
}
export function paintFrame(
  ctx: Context,
  scene: Canvas,
  previous: Canvas | null,
  clip: Clip,
  index: number,
  clips: Clip[],
  settings: Settings,
  local: number,
) {
  const w = scene.width,
    h = scene.height;
  const incoming = transitionAt(clip, index, settings);
  const outgoing =
    index === clips.length - 1 ? settings.outro : clips[index + 1].transition;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  if (incoming === 'fade' && local < TRANSITION_SECONDS) {
    if (previous) ctx.drawImage(previous, 0, 0, w, h);
    ctx.globalAlpha = local / TRANSITION_SECONDS;
  }
  ctx.drawImage(scene, 0, 0);
  ctx.globalAlpha = 1;
  let alpha = 0,
    color = '#000000';
  if (
    (incoming === 'black' || incoming === 'white') &&
    local < TRANSITION_SECONDS / 2
  ) {
    alpha = 1 - local / (TRANSITION_SECONDS / 2);
    color = incoming === 'white' ? '#ffffff' : '#000000';
  }
  const tail = CLIP_SECONDS - local;
  const endDuration =
    outgoing === 'fade' && index === clips.length - 1
      ? TRANSITION_SECONDS
      : TRANSITION_SECONDS / 2;
  if (
    (outgoing === 'black' ||
      outgoing === 'white' ||
      (outgoing === 'fade' && index === clips.length - 1)) &&
    tail <= endDuration
  ) {
    alpha = Math.max(
      alpha,
      1 -
        Math.max(0, tail - 1 / FPS) / Math.max(1 / FPS, endDuration - 1 / FPS),
    );
    color = outgoing === 'white' ? '#ffffff' : '#000000';
  }
  if (alpha > 0) {
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
function canvas(width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}
export class Renderer {
  scene: HTMLCanvasElement;
  previous: HTMLCanvasElement;
  previousIndex = -1;
  private stream: ReturnType<CanvasSink['canvases']> | null = null;
  private lookahead: Awaited<ReturnType<CanvasSink['getCanvas']>> = null;
  private streamIndex = -1;
  constructor(
    public assets: Asset[],
    public clips: Clip[],
    public settings: Settings,
    width: number,
    height: number,
  ) {
    this.scene = canvas(width, height);
    this.previous = canvas(width, height);
  }
  asset(clip: Clip) {
    const asset = this.assets.find((a) => a.id === clip.assetId);
    if (!asset)
      throw new Error('元動画が見つかりません。動画を追加し直してください。');
    return asset;
  }
  async previousScene(index: number) {
    if (index === 0) return null;
    if (this.previousIndex === index) return this.previous;
    const clip = this.clips[index - 1],
      asset = this.asset(clip);
    const frame = await asset.sink.getCanvas(
      asset.firstTimestamp +
        sourceTime(clip.start, CLIP_SECONDS - 1 / FPS, asset.duration),
    );
    if (!frame) throw new Error('切り替え前のフレームを読み取れませんでした。');
    paintScene(
      this.previous.getContext('2d')!,
      frame.canvas,
      clip,
      this.settings,
      this.previous.width,
      this.previous.height,
    );
    this.previousIndex = index;
    return this.previous;
  }
  async draw(ctx: Context, index: number, local: number, signal?: AbortSignal) {
    checkAbort(signal);
    const clip = this.clips[index],
      asset = this.asset(clip);
    // Read previous first: its source can share the decoder canvas pool with this clip.
    const prev =
      transitionAt(clip, index, this.settings) === 'fade' &&
      local < TRANSITION_SECONDS
        ? await this.previousScene(index)
        : null;
    checkAbort(signal);
    const frame = await asset.sink.getCanvas(
      asset.firstTimestamp + sourceTime(clip.start, local, asset.duration),
    );
    checkAbort(signal);
    if (!frame) throw new Error('動画フレームを読み取れませんでした。');
    paintScene(
      this.scene.getContext('2d')!,
      frame.canvas,
      clip,
      this.settings,
      this.scene.width,
      this.scene.height,
    );
    paintFrame(
      ctx,
      this.scene,
      prev,
      clip,
      index,
      this.clips,
      this.settings,
      local,
    );
  }
  async close() {
    const stream = this.stream;
    this.stream = null;
    this.lookahead = null;
    this.streamIndex = -1;
    await stream?.return(undefined);
  }
  // Reuse a sequential decoder while playing; the audio clock determines which frames to present.
  async drawPlaying(ctx: Context, clock: () => number, signal: AbortSignal) {
    checkAbort(signal);
    const at = locateTime(clock(), this.clips.length),
      clip = this.clips[at.index],
      asset = this.asset(clip);
    if (at.index !== this.streamIndex) {
      await this.close();
      checkAbort(signal);
      if (transitionAt(clip, at.index, this.settings) === 'fade')
        await this.previousScene(at.index);
      checkAbort(signal);
      this.stream = asset.sink.canvases(
        asset.firstTimestamp + sourceTime(clip.start, at.local, asset.duration),
        asset.firstTimestamp +
          Math.min(clip.start + CLIP_SECONDS, asset.duration),
      );
      this.streamIndex = at.index;
      this.lookahead = (await this.stream.next()).value ?? null;
      checkAbort(signal);
      if (!this.lookahead)
        throw new Error('動画フレームを読み取れませんでした。');
      paintScene(
        this.scene.getContext('2d')!,
        this.lookahead.canvas,
        clip,
        this.settings,
        this.scene.width,
        this.scene.height,
      );
    }
    let consumed = 0;
    while (this.lookahead) {
      const current = locateTime(clock(), this.clips.length);
      if (current.index !== at.index) return;
      const target =
        asset.firstTimestamp +
        sourceTime(clip.start, current.local, asset.duration);
      if (this.lookahead.timestamp > target + 0.000001) break;
      // Copy before advancing: the next read can reuse the source canvas pool.
      paintScene(
        this.scene.getContext('2d')!,
        this.lookahead.canvas,
        clip,
        this.settings,
        this.scene.width,
        this.scene.height,
      );
      this.lookahead = (await this.stream!.next()).value ?? null;
      checkAbort(signal);
      if (++consumed % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        checkAbort(signal);
      }
    }
    const current = locateTime(clock(), this.clips.length);
    if (current.index !== at.index) return;
    const previous =
      at.index > 0 && this.previousIndex === at.index ? this.previous : null;
    paintFrame(
      ctx,
      this.scene,
      previous,
      clip,
      at.index,
      this.clips,
      this.settings,
      current.local,
    );
  }
}
export async function clipAudio(
  asset: Asset,
  clip: Clip,
  incoming: import('./timeline').Transition,
  outgoing: import('./timeline').Transition,
  signal?: AbortSignal,
) {
  const rate = 48000;
  const offline = new OfflineAudioContext(2, rate * CLIP_SECONDS, rate);
  if (asset.hasAudio && !asset.audioDecodable)
    throw new Error(
      `${asset.name}: 音声を読み取れません。「元の音声」をオフにするか、AAC音声のMP4を使ってください。`,
    );
  if (asset.audioSink) {
    const start = asset.firstTimestamp + clip.start;
    const end = Math.min(
      start + CLIP_SECONDS,
      asset.firstTimestamp + asset.duration,
    );
    for await (const wrapped of asset.audioSink.buffers(start, end)) {
      checkAbort(signal);
      const left = Math.max(start, wrapped.timestamp),
        right = Math.min(end, wrapped.timestamp + wrapped.buffer.duration);
      if (right <= left) continue;
      const node = offline.createBufferSource();
      node.buffer = wrapped.buffer;
      node.connect(offline.destination);
      node.start(left - start, left - wrapped.timestamp, right - left);
    }
  }
  const buffer = await offline.startRendering();
  checkAbort(signal);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++)
      data[i] *= edgeEnvelope(i / rate, incoming, outgoing);
  }
  return buffer;
}
export async function exportVideo(
  assets: Asset[],
  clips: Clip[],
  settings: Settings,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
) {
  if (!clips.length)
    throw new Error('タイムラインにクリップを追加してください。');
  const { width, height } = outputSize(settings);
  const videoCodec = settings.format === 'mp4' ? 'avc' : 'vp9';
  const audioCodec = settings.format === 'mp4' ? 'aac' : 'opus';
  const quality = new Quality({
    bitrate: settings.resolution === 1080 ? 8_000_000 : 4_000_000,
  });
  if (!(await canEncodeVideo(videoCodec, { width, height, quality })))
    throw new Error(
      `${settings.format.toUpperCase()}の書き出しに対応していません。別の形式、720p、またはChrome / Edgeをお試しください。`,
    );
  if (
    settings.audio &&
    !(await canEncodeAudio(audioCodec, {
      numberOfChannels: 2,
      sampleRate: 48000,
    }))
  )
    throw new Error(
      'この環境では音声付きの書き出しができません。WebMを選ぶか、「元の音声」をオフにしてください。',
    );
  checkAbort(signal);
  const outputCanvas = canvas(width, height),
    ctx = outputCanvas.getContext('2d')!;
  const renderer = new Renderer(assets, clips, settings, width, height);
  const target = new BufferTarget();
  const output = new Output({
    format:
      settings.format === 'mp4'
        ? new Mp4OutputFormat({ fastStart: 'in-memory' })
        : new WebMOutputFormat(),
    target,
  });
  const videoSource = new CanvasSource(outputCanvas, {
    codec: videoCodec,
    quality,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });
  const audioSource = settings.audio
    ? new AudioBufferSource({
        codec: audioCodec,
        quality: new Quality({ bitrate: 128_000 }),
      })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);
  try {
    await output.start();
    for (let index = 0; index < clips.length; index++) {
      checkAbort(signal);
      const clip = clips[index],
        asset = renderer.asset(clip);
      const prev =
        transitionAt(clip, index, settings) === 'fade'
          ? await renderer.previousScene(index)
          : null;
      if (audioSource) {
        const audio = await clipAudio(
          asset,
          clip,
          transitionAt(clip, index, settings),
          index === clips.length - 1
            ? settings.outro
            : clips[index + 1].transition,
          signal,
        );
        await audioSource.add(audio);
      }
      const timestamps = Array.from(
        { length: CLIP_SECONDS * FPS },
        (_, frame) =>
          asset.firstTimestamp +
          sourceTime(clip.start, frame / FPS, asset.duration),
      );
      let frame = 0;
      for await (const wrapped of asset.sink.canvasesAtTimestamps(timestamps)) {
        checkAbort(signal);
        if (!wrapped)
          throw new Error(`${asset.name}: フレームを読み取れませんでした。`);
        paintScene(
          renderer.scene.getContext('2d')!,
          wrapped.canvas,
          clip,
          settings,
          width,
          height,
        );
        paintFrame(
          ctx,
          renderer.scene,
          prev,
          clip,
          index,
          clips,
          settings,
          frame / FPS,
        );
        await videoSource.add(index * CLIP_SECONDS + frame / FPS, 1 / FPS);
        frame++;
        onProgress(
          ((index * CLIP_SECONDS * FPS + frame) /
            (clips.length * CLIP_SECONDS * FPS)) *
            0.98,
        );
        // Yield between small batches so cancellation and progress remain responsive.
        if (frame % 10 === 0)
          await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    videoSource.close();
    audioSource?.close();
    checkAbort(signal);
    await output.finalize();
    checkAbort(signal);
    onProgress(1);
    if (!target.buffer)
      throw new Error('書き出しデータを作成できませんでした。');
    return new Blob([target.buffer], {
      type: settings.format === 'mp4' ? 'video/mp4' : 'video/webm',
    });
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled')
      await output.cancel().catch(() => {});
    throw error;
  }
}

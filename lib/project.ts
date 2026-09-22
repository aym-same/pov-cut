import {
  MAX_CLIPS,
  type Clip,
  type Settings,
  type TextStyle,
} from './timeline';

export const PROJECT_STORAGE_KEY = 'pov-cut.project.v1';
export type SourceFile = {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  duration: number;
};
export type Project = {
  app: 'POV CUT';
  version: 1;
  sources: SourceFile[];
  clips: Clip[];
  settings: Settings;
};
export function describeSource(asset: {
  id: string;
  file: File;
  duration: number;
}): SourceFile {
  return {
    id: asset.id,
    name: asset.file.name,
    size: asset.file.size,
    lastModified: asset.file.lastModified,
    duration: asset.duration,
  };
}
export function sourceMatches(
  source: SourceFile,
  file: Pick<File, 'name' | 'size'>,
) {
  return source.name === file.name && source.size === file.size;
}
// Accept only bounded, known fields. Project files are untrusted input.
export function parseProject(text: string): Project {
  const fail = (): never => {
    throw new Error(
      '編集ファイルの形式が正しくありません。POV CUTで保存したJSONを選んでください。',
    );
  };
  if (text.length > 1_000_000) fail();
  const object = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail();
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.length <= max ? v : fail();
  const id = (v: unknown) => str(v, 200) || fail();
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
      ? v
      : fail();
  const one = <T extends string | number>(
    v: unknown,
    choices: readonly T[],
  ): T => (choices.includes(v as T) ? (v as T) : fail());
  const effect = (v: unknown) =>
    one(v, ['none', 'fade', 'black', 'white'] as const);
  const style = (v: unknown): TextStyle => {
    const s = object(v);
    const color = str(s.color, 7);
    if (!/^#[0-9a-f]{6}$/i.test(color)) fail();
    return {
      font: one(s.font, ['sans', 'serif', 'mono'] as const),
      size: num(s.size, 18, 72),
      color,
    };
  };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail();
  }
  const p = object(raw);
  if (
    p.app !== 'POV CUT' ||
    p.version !== 1 ||
    !Array.isArray(p.sources) ||
    p.sources.length > 30 ||
    !Array.isArray(p.clips) ||
    p.clips.length > MAX_CLIPS
  )
    fail();
  const sources: SourceFile[] = (p.sources as unknown[]).map((value) => {
    const s = object(value);
    return {
      id: id(s.id),
      name: str(s.name, 1024) || fail(),
      size: num(s.size, 1, 2 * 1024 ** 3),
      lastModified: num(s.lastModified, 0, Number.MAX_SAFE_INTEGER),
      duration: num(s.duration, 0.00001, 86400 * 7),
    };
  });
  const clips: Clip[] = (p.clips as unknown[]).map((value) => {
    const c = object(value),
      assetId = id(c.assetId),
      source = sources.find((s) => s.id === assetId);
    if (!source) return fail();
    return {
      id: id(c.id),
      assetId,
      start: num(c.start, 0, source.duration),
      text: str(c.text, 120),
      style: style(c.style),
      transition: effect(c.transition),
      fit: one(c.fit, ['cover', 'contain'] as const),
      cropX: c.cropX === undefined ? 0.5 : num(c.cropX, 0, 1),
      cropY: c.cropY === undefined ? 0.5 : num(c.cropY, 0, 1),
    };
  });
  if (
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    new Set(clips.map((c) => c.id)).size !== clips.length
  )
    fail();
  const s = object(p.settings);
  if (typeof s.audio !== 'boolean') fail();
  const settings: Settings = {
    aspect: one(s.aspect, ['portrait', 'landscape'] as const),
    resolution: one(s.resolution, [720, 1080] as const),
    tags: str(s.tags, 180),
    tagStyle: style(s.tagStyle),
    intro: effect(s.intro),
    outro: effect(s.outro),
    audio: s.audio as boolean,
    format: one(s.format, ['mp4', 'webm'] as const),
  };
  return { app: 'POV CUT', version: 1, sources, clips, settings };
}

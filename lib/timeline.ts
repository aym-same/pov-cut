export const CLIP_SECONDS = 2.5;
export const FPS = 30;
export const MAX_CLIPS = 60;
export const TRANSITION_SECONDS = 0.3;
export type Transition = 'none' | 'fade' | 'black' | 'white';
export type TextStyle = {
  font: 'sans' | 'serif' | 'mono';
  size: number;
  color: string;
};
export type Clip = {
  id: string;
  assetId: string;
  start: number;
  text: string;
  style: TextStyle;
  transition: Transition;
  fit: 'cover' | 'contain';
  cropX?: number;
  cropY?: number;
};
export type Settings = {
  aspect: 'portrait' | 'landscape';
  resolution: 720 | 1080;
  tags: string;
  tagStyle: TextStyle;
  intro: Transition;
  outro: Transition;
  audio: boolean;
  format: 'mp4' | 'webm';
};
export const DEFAULT_STYLE: TextStyle = {
  font: 'sans',
  size: 44,
  color: '#ffffff',
};
export const DEFAULT_SETTINGS: Settings = {
  aspect: 'portrait',
  resolution: 720,
  tags: '#POV #スマートグラス',
  tagStyle: { font: 'sans', size: 24, color: '#ffffff' },
  intro: 'fade',
  outro: 'fade',
  audio: true,
  format: 'mp4',
};
export function outputSize(settings: Pick<Settings, 'aspect' | 'resolution'>) {
  const short = settings.resolution;
  const long = (short * 16) / 9;
  return settings.aspect === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
}
export function splitStarts(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  return Array.from(
    { length: Math.min(MAX_CLIPS, Math.ceil(duration / CLIP_SECONDS)) },
    (_, i) => i * CLIP_SECONDS,
  );
}
export function locateTime(time: number, count: number) {
  const safe = Math.max(
    0,
    Math.min(time, Math.max(0, count * CLIP_SECONDS - 1 / FPS)),
  );
  const index = Math.floor(safe / CLIP_SECONDS);
  return { index, local: safe - index * CLIP_SECONDS };
}
export function sourceTime(start: number, local: number, duration: number) {
  return Math.max(0, Math.min(start + local, duration - 0.001));
}
export function normalizeTags(value: string): string[] {
  return value
    .split(/[\s,、，]+/u)
    .map((s) => s.replace(/^[#＃]+/u, ''))
    .filter(Boolean)
    .map((s) => '#' + s);
}
export function transitionAt(
  clip: Clip,
  index: number,
  settings: Settings,
): Transition {
  return index === 0 ? settings.intro : clip.transition;
}
export function edgeEnvelope(
  local: number,
  incoming: Transition,
  outgoing: Transition,
) {
  const fade = TRANSITION_SECONDS / 2;
  return Math.min(
    incoming === 'none' ? 1 : local / fade,
    outgoing === 'none' ? 1 : (CLIP_SECONDS - local) / fade,
    1,
  );
}
export function timecode(time: number) {
  const deci = Math.max(0, Math.floor(time * 10 + 1e-6));
  return `${String(Math.floor(deci / 600)).padStart(2, '0')}:${String(Math.floor(deci / 10) % 60).padStart(2, '0')}.${deci % 10}`;
}

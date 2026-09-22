'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Download,
  Film,
  Glasses,
  GripVertical,
  Hash,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  SkipBack,
  Smartphone,
  Trash2,
  Type,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  CLIP_SECONDS,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
  FPS,
  MAX_CLIPS,
  locateTime,
  normalizeTags,
  outputSize,
  splitStarts,
  timecode,
  transitionAt,
  type Clip,
  type Settings,
  type TextStyle,
  type Transition,
} from '@/lib/timeline';
import {
  PROJECT_STORAGE_KEY,
  describeSource,
  parseProject,
  sourceMatches,
  type Project,
  type SourceFile,
} from '@/lib/project';
import {
  Renderer,
  checkAbort,
  clipAudio,
  disposeAsset,
  exportVideo,
  importAsset,
  type Asset,
} from '@/lib/video-engine';

const transitions = [
  { value: 'none', label: 'なし' },
  { value: 'fade', label: 'フェード' },
  { value: 'black', label: 'ブラックアウト' },
  { value: 'white', label: 'ホワイトフラッシュ' },
];
const fonts = [
  { value: 'sans', label: 'ゴシック' },
  { value: 'serif', label: '明朝' },
  { value: 'mono', label: '等幅' },
];
const colors = [
  { value: '#ffffff', label: 'ホワイト' },
  { value: '#d8f275', label: 'ライム' },
  { value: '#ffcf70', label: 'イエロー' },
  { value: '#ffa6b8', label: 'ピンク' },
  { value: '#89d9ff', label: 'ブルー' },
  { value: '#111111', label: 'ブラック' },
];
type UndoEntry = { clips: Clip[]; selectedId: string; time: number };
type Choice = { value: string; label: string };
function ChoiceSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      disabled={disabled}
      items={options}
    >
      <SelectTrigger aria-label={label} className="choice-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function StyleControls({
  value,
  onChange,
  prefix,
  small = false,
}: {
  value: TextStyle;
  onChange: (value: TextStyle) => void;
  prefix: string;
  small?: boolean;
}) {
  return (
    <div className="style-controls">
      <div className="two-fields">
        <div>
          <span className="field-label">フォント</span>
          <ChoiceSelect
            label={prefix + 'のフォント'}
            value={value.font}
            options={fonts}
            onChange={(v) =>
              onChange({ ...value, font: v as TextStyle['font'] })
            }
          />
        </div>
        <div>
          <span className="field-label">サイズ</span>
          <ChoiceSelect
            label={prefix + 'のサイズ'}
            value={String(value.size)}
            options={(small ? [18, 24, 30, 36] : [28, 36, 44, 56, 72]).map(
              (v) => ({ value: String(v), label: String(v) + ' px' }),
            )}
            onChange={(v) => onChange({ ...value, size: Number(v) })}
          />
        </div>
      </div>
      <div className="color-field">
        <span className="field-label">カラー</span>
        <div className="swatches">
          {colors.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={prefix + '：' + c.label}
              aria-pressed={value.color === c.value}
              title={c.label}
              style={{
                background: c.value,
                color: c.value === '#111111' ? '#fff' : '#111',
              }}
              onClick={() => onChange({ ...value, color: c.value })}
            >
              {value.color === c.value && <Check size={14} />}
            </button>
          ))}
          <input
            type="color"
            value={value.color}
            aria-label={prefix + 'のカスタムカラー'}
            onChange={(e) => onChange({ ...value, color: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : '処理に失敗しました。もう一度お試しください。';
}

export default function Home() {
  const projectPicker = useRef<HTMLInputElement>(null),
    picker = useRef<HTMLInputElement>(null),
    preview = useRef<HTMLCanvasElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]),
    [clips, setClips] = useState<Clip[]>([]),
    [selectedId, setSelectedId] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS),
    [importMode, setImportMode] = useState('first');
  const [notice, setNotice] = useState<{
      text: string;
      error?: boolean;
    } | null>(null),
    [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false),
    [preparing, setPreparing] = useState(false),
    [seekTime, setSeekTime] = useState(0),
    [displayTime, setDisplayTime] = useState(0);
  const [exporting, setExporting] = useState(false),
    [progress, setProgress] = useState(0),
    [result, setResult] = useState<{
      url: string;
      name: string;
      size: number;
    } | null>(null);
  const [history, setHistory] = useState<UndoEntry[]>([]),
    [dragged, setDragged] = useState<string | null>(null),
    [dragOver, setDragOver] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const previewAbort = useRef<AbortController | null>(null),
    exportAbort = useRef<AbortController | null>(null),
    previewJob = useRef<Promise<void>>(Promise.resolve());
  const audioContext = useRef<AudioContext | null>(null),
    assetRef = useRef<Asset[]>([]),
    resultRef = useRef<string | null>(null);
  const importBusy = useRef(false),
    exportBusy = useRef(false),
    playGeneration = useRef(0),
    playPending = useRef(false);
  const editGroup = useRef<string | null>(null);
  const storageBlocked = useRef(false),
    savedSafely = useRef(false);
  const [sources, setSources] = useState<SourceFile[]>([]),
    [savedProject, setSavedProject] = useState<Project | null>(null);
  const [storageReady, setStorageReady] = useState(false),
    [saveStatus, setSaveStatus] = useState('');
  const missing = sources.filter(
    (s) =>
      clips.some((c) => c.assetId === s.id) &&
      !assets.some((a) => a.id === s.id),
  );
  const project = useCallback(
    (): Project => ({
      app: 'POV CUT',
      version: 1,
      sources: [
        ...sources.filter((s) => !assets.some((a) => a.id === s.id)),
        ...assets.map(describeSource),
      ],
      clips,
      settings,
    }),
    [sources, assets, clips, settings],
  );
  const selectedIndex = clips.findIndex((c) => c.id === selectedId),
    selected = clips[selectedIndex],
    selectedAsset = assets.find((a) => a.id === selected?.assetId);
  const duration = clips.length * CLIP_SECONDS,
    disabled = loading || exporting;
  const stop = () => {
    playGeneration.current++;
    playPending.current = false;
    previewAbort.current?.abort();
    const audio = audioContext.current;
    audioContext.current = null;
    if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
    setPlaying(false);
    setPreparing(false);
  };
  const moveTo = (time: number) => {
    stop();
    setSeekTime(time);
    setDisplayTime(time);
  };
  const updateSettings = (patch: Partial<Settings>) => {
    if (disabled || importBusy.current || exportBusy.current) return;
    editGroup.current = null;
    stop();
    setSeekTime(displayTime);
    setSettings((s) => ({ ...s, ...patch }));
  };
  const changeClips = (next: Clip[], group = '') => {
    stop();
    if (!group || editGroup.current !== group)
      setHistory((h) => [
        ...h.slice(-24),
        { clips, selectedId, time: displayTime },
      ]);
    editGroup.current = group || null;
    setClips(next);
  };
  const updateClip = (patch: Partial<Clip>) => {
    if (!selected || disabled || importBusy.current || exportBusy.current)
      return;
    const key = Object.keys(patch)[0];
    changeClips(
      clips.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)),
      ['text', 'start', 'cropX', 'cropY', 'style'].includes(key)
        ? selected.id + ':' + key
        : '',
    );
    setSeekTime(selectedIndex * CLIP_SECONDS + 0.35);
  };
  const createClip = (assetId: string, start = 0): Clip => ({
    id: crypto.randomUUID(),
    assetId,
    start,
    text: '',
    style: { ...DEFAULT_STYLE },
    transition: 'fade',
    fit: 'cover',
    cropX: 0.5,
    cropY: 0.5,
  });

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted)
        setSupported(
          typeof VideoDecoder !== 'undefined' &&
            typeof VideoEncoder !== 'undefined',
        );
    });
    return () => {
      mounted = false;
      previewAbort.current?.abort();
      exportAbort.current?.abort();
      assetRef.current.forEach(disposeAsset);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      void audioContext.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    assetRef.current = assets;
  }, [assets]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (loading || exporting || (clips.length > 0 && !savedSafely.current)) {
        event.preventDefault();
        // preventDefault requests the browser's unsaved-work dialog.
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [loading, exporting, clips.length]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
        if (raw) {
          const saved = parseProject(raw);
          if (saved.clips.length) setSavedProject(saved);
        }
      } catch {
        storageBlocked.current = true;
        setSaveStatus(
          '自動保存を利用できません。編集ファイルを保存してください。',
        );
      }
      setStorageReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    savedSafely.current = false;
    if (!storageReady || savedProject || storageBlocked.current) return;
    let active = true,
      message = '編集内容をこのブラウザに自動保存';
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project()));
      savedSafely.current = true;
    } catch {
      message = '自動保存できません。編集ファイルを保存してください。';
    }
    queueMicrotask(() => {
      if (active) setSaveStatus(message);
    });
    return () => {
      active = false;
    };
  }, [project, storageReady, savedProject]);
  async function restoreProject(value: Project) {
    if (disabled || importBusy.current || exportBusy.current) return;
    if (
      clips.length &&
      !window.confirm(
        '現在の編集を置き換えます。必要なら先に「編集を保存」でJSONを保存してください。',
      )
    )
      return;
    stop();
    importBusy.current = true;
    setLoading(true);
    try {
      await previewJob.current.catch(() => {});
      storageBlocked.current = false;
      assets.forEach(disposeAsset);
      setAssets([]);
      setSources(value.sources);
      setClips(value.clips);
      setSettings(value.settings);
      setSelectedId(value.clips[0]?.id ?? '');
      setHistory([]);
      editGroup.current = null;
      setSavedProject(null);
      setSeekTime(0.35);
      setDisplayTime(0);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      resultRef.current = null;
      setResult(null);
      setNotice({
        text: '編集内容を開きました。元動画を選び直すと、プレビューと書き出しを再開できます。',
      });
    } finally {
      importBusy.current = false;
      setLoading(false);
    }
  }
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error('編集ファイルは1MB以下のJSONを選んでください。');
      const value = parseProject(await file.text());
      await restoreProject(value);
    } catch (error) {
      setNotice({ text: errorText(error), error: true });
    } finally {
      if (projectPicker.current) projectPicker.current.value = '';
    }
  }
  function saveProject() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project(), null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pov-cut-edit.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => {
    if (
      !clips.length ||
      !preview.current ||
      exporting ||
      loading ||
      missing.length
    )
      return;
    const controller = new AbortController();
    previewAbort.current = controller;
    const ctx = preview.current.getContext('2d')!;
    const { width, height } = outputSize({ ...settings, resolution: 720 });
    preview.current.width = width;
    preview.current.height = height;
    const renderer = new Renderer(assets, clips, settings, width, height);
    const start = Math.max(0, Math.min(seekTime, duration - 1 / FPS));
    let audio: AudioContext | null = null;
    previewJob.current = previewJob.current
      .catch(() => {})
      .then(async () => {
        checkAbort(controller.signal);
        if (!playing) {
          const at = locateTime(start, clips.length);
          await renderer.draw(ctx, at.index, at.local, controller.signal);
          setDisplayTime(start);
          return;
        }
        setPreparing(true);
        const buffers: { buffer: AudioBuffer; offset: number; when: number }[] =
          [];
        if (settings.audio) {
          audio = audioContext.current;
          const first = locateTime(start, clips.length);
          for (let i = first.index; i < clips.length; i++) {
            checkAbort(controller.signal);
            const clip = clips[i],
              asset = renderer.asset(clip);
            const buffer = await clipAudio(
              asset,
              clip,
              transitionAt(clip, i, settings),
              i === clips.length - 1 ? settings.outro : clips[i + 1].transition,
              controller.signal,
            );
            buffers.push({
              buffer,
              offset: i === first.index ? first.local : 0,
              when: Math.max(0, i * CLIP_SECONDS - start),
            });
          }
        }
        checkAbort(controller.signal);
        if (audio && audio.state === 'suspended') await audio.resume();
        checkAbort(controller.signal);
        const audioStart = audio ? audio.currentTime + 0.05 : 0;
        if (audio)
          for (const item of buffers) {
            const node = audio.createBufferSource();
            node.buffer = item.buffer;
            node.connect(audio.destination);
            node.start(audioStart + item.when, item.offset);
          }
        setPreparing(false);
        const wallStart = performance.now() + 50;
        const clock = () =>
          start +
          (audio
            ? Math.max(0, audio.currentTime - audioStart)
            : Math.max(0, (performance.now() - wallStart) / 1000));
        while (!controller.signal.aborted) {
          const time = clock();
          if (time >= duration) {
            setPlaying(false);
            setSeekTime(duration - 1 / FPS);
            setDisplayTime(duration);
            break;
          }
          await renderer.drawPlaying(ctx, clock, controller.signal);
          setDisplayTime(Math.min(duration, clock()));
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setNotice({ text: errorText(error), error: true });
          setPlaying(false);
          setPreparing(false);
        }
      })
      .finally(async () => {
        await renderer.close();
        if (audio && audio.state !== 'closed')
          void audio.close().catch(() => {});
        if (audioContext.current === audio) audioContext.current = null;
      });
    return () => {
      controller.abort();
      if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
    };
  }, [
    assets,
    clips,
    settings,
    seekTime,
    playing,
    exporting,
    loading,
    duration,
    missing.length,
  ]);

  async function addFiles(files: File[]) {
    if (!files.length || importBusy.current || exportBusy.current) return;
    stop();
    importBusy.current = true;
    setLoading(true);
    setNotice(null);
    const added: Asset[] = [],
      newClips: Clip[] = [],
      errors: string[] = [];
    try {
      if (missing.length) {
        for (const source of missing) {
          const file = files.find((f) => sourceMatches(source, f));
          if (!file) continue;
          try {
            const asset = await importAsset(file);
            if (
              clips.some(
                (c) => c.assetId === source.id && c.start >= asset.duration,
              )
            ) {
              disposeAsset(asset);
              throw new Error(
                '保存時の開始位置が動画の範囲外です。元の動画を選んでください。',
              );
            }
            asset.id = source.id;
            added.push(asset);
          } catch (error) {
            errors.push(source.name + '：' + errorText(error));
          }
        }
        if (added.length) setAssets((a) => [...a, ...added]);
        setNotice({
          text: [
            added.length + '本の元動画を再接続しました。',
            missing.length > added.length
              ? '残りの元動画も、同じ名前・容量のファイルを選んでください。'
              : '編集を再開できます。',
            ...errors,
          ].join(' '),
          error: errors.length > 0 || !added.length,
        });
        return;
      }
      for (const file of files) {
        if (clips.length + newClips.length >= MAX_CLIPS) {
          errors.push('タイムラインは最大60クリップ（150秒）です。');
          break;
        }
        if (
          sources.filter((s) => !assets.some((a) => a.id === s.id)).length +
            assets.length +
            added.length >=
          30
        ) {
          errors.push('未接続の素材を含め、素材は最大30本です。');
          break;
        }
        try {
          const asset = await importAsset(file);
          added.push(asset);
          const starts =
            importMode === 'split' ? splitStarts(asset.duration) : [0];
          const room = MAX_CLIPS - clips.length - newClips.length;
          starts
            .slice(0, room)
            .forEach((start) => newClips.push(createClip(asset.id, start)));
          if (
            starts.length > room ||
            (importMode === 'split' &&
              asset.duration > MAX_CLIPS * CLIP_SECONDS)
          )
            errors.push(asset.name + '：150秒の上限まで追加しました。');
          if (!asset.audioDecodable)
            errors.push(
              asset.name +
                '：音声の読み取りに非対応です。音声をオフにすると書き出せます。',
            );
        } catch (error) {
          errors.push(file.name + '：' + errorText(error));
        }
      }
      if (added.length) {
        storageBlocked.current = false;
        setSavedProject(null);
        setAssets((a) => [...a, ...added]);
        changeClips([...clips, ...newClips]);
        setSelectedId(newClips[0].id);
        moveTo(clips.length * CLIP_SECONDS + 0.35);
      }
      setNotice({
        text: [
          added.length
            ? added.length +
              '本の素材・' +
              newClips.length +
              'クリップを追加しました。'
            : '動画を追加できませんでした。',
          ...errors,
        ].join(' '),
        error: errors.length > 0,
      });
    } finally {
      importBusy.current = false;
      setLoading(false);
      if (picker.current) picker.current.value = '';
    }
  }
  function appendAsset(asset: Asset, all = false) {
    if (disabled || importBusy.current || exportBusy.current || missing.length)
      return;
    const starts = all ? splitStarts(asset.duration) : [0],
      room = MAX_CLIPS - clips.length;
    if (!room) {
      setNotice({
        text: '最大60クリップ（150秒）まで追加できます。',
        error: true,
      });
      return;
    }
    const additions = starts
      .slice(0, room)
      .map((start) => createClip(asset.id, start));
    changeClips([...clips, ...additions]);
    setSelectedId(additions[0].id);
    moveTo(clips.length * CLIP_SECONDS + 0.35);
    if (starts.length > room || (all && asset.duration > 150))
      setNotice({ text: '150秒の上限までクリップを追加しました。' });
  }
  function reorder(id: string, target: number) {
    if (disabled || importBusy.current || exportBusy.current) return;
    const from = clips.findIndex((c) => c.id === id);
    if (from < 0 || target < 0 || target >= clips.length || from === target)
      return;
    const next = [...clips];
    const [clip] = next.splice(from, 1);
    next.splice(target, 0, clip);
    changeClips(next);
    setSelectedId(id);
    moveTo(target * CLIP_SECONDS + 0.35);
  }
  function removeClip(id: string) {
    if (disabled || importBusy.current || exportBusy.current) return;
    const next = clips.filter((c) => c.id !== id);
    changeClips(next);
    const index = Math.max(0, Math.min(selectedIndex, next.length - 1));
    setSelectedId(next[index]?.id ?? '');
    moveTo(next.length ? index * CLIP_SECONDS + 0.35 : 0);
  }
  async function togglePlay() {
    if (disabled || importBusy.current || exportBusy.current || missing.length)
      return;
    if (playing || playPending.current) {
      moveTo(displayTime);
      return;
    }
    if (!clips.length) return;
    const generation = ++playGeneration.current;
    playPending.current = true;
    setPreparing(true);
    let audio: AudioContext | null = null;
    try {
      if (settings.audio) {
        audio = new AudioContext();
        audioContext.current = audio;
        await audio.resume();
      }
      if (generation !== playGeneration.current) {
        if (audio && audio.state !== 'closed')
          await audio.close().catch(() => {});
        return;
      }
      setSeekTime(displayTime >= duration - 1 / FPS ? 0 : displayTime);
      setPlaying(true);
    } catch (error) {
      if (generation === playGeneration.current) {
        stop();
        setNotice({ text: errorText(error), error: true });
      }
    } finally {
      if (generation === playGeneration.current) playPending.current = false;
    }
  }
  async function doExport() {
    if (
      importBusy.current ||
      exportBusy.current ||
      missing.length ||
      !clips.length
    )
      return;
    exportBusy.current = true;
    stop();
    setExporting(true);
    setProgress(0);
    setNotice(null);
    const controller = new AbortController();
    exportAbort.current = controller;
    try {
      await previewJob.current.catch(() => {});
      const blob = await exportVideo(
        assets,
        clips,
        settings,
        setProgress,
        controller.signal,
      );
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      const url = URL.createObjectURL(blob);
      resultRef.current = url;
      const name =
        'pov-cut-' +
        new Date().toISOString().slice(0, 10) +
        '.' +
        settings.format;
      setResult({ url, name, size: blob.size });
      setNotice({
        text: '書き出しが完了しました。「動画を保存」からダウンロードできます。',
      });
    } catch (error) {
      setNotice({
        text: controller.signal.aborted
          ? '書き出しを中止しました。'
          : errorText(error),
        error: !controller.signal.aborted,
      });
    } finally {
      exportBusy.current = false;
      setExporting(false);
      exportAbort.current = null;
    }
  }
  const choose = (id: string) => {
    if (disabled || importBusy.current || exportBusy.current) return;
    editGroup.current = null;
    const index = clips.findIndex((c) => c.id === id);
    setSelectedId(id);
    moveTo(index * CLIP_SECONDS + 0.35);
  };
  const currentIndex = locateTime(displayTime, clips.length).index;

  return (
    <main className="studio">
      <header className="topbar">
        <a
          href={import.meta.env.BASE_URL}
          className="brand"
          aria-label="POV CUT ホーム"
        >
          <span className="brand-mark">
            <Glasses size={25} />
          </span>
          POV<span className="brand-light">CUT</span>
          <span className="beta">BETA</span>
        </a>
        <span className="top-note">その目線を、2.5秒ずつ。</span>
        <span className="local-note">
          <LockKeyhole size={14} />
          動画は端末内で編集
        </span>
      </header>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">YOUR EVERYDAY, REFRAMED</span>
          <h1>今日の目線を、つなごう。</h1>
        </div>
        <button
          className="button primary"
          disabled={
            disabled || !clips.length || !!missing.length || supported === false
          }
          onClick={() => void doExport()}
        >
          {exporting ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Download size={17} />
          )}
          <span>{exporting ? '書き出し中…' : '書き出す'}</span>
        </button>
      </div>
      <div className="project-bar">
        <div className="project-buttons">
          <button
            className="button"
            disabled={disabled || !clips.length}
            onClick={saveProject}
          >
            編集を保存
          </button>
          <button
            className="button"
            disabled={disabled}
            onClick={() => projectPicker.current?.click()}
          >
            編集を開く
          </button>
        </div>
        <p className="fineprint">
          {saveStatus}
          <br />
          保存するのは編集内容のみ。再開時は元動画を選び直します。
        </p>
      </div>
      {savedProject && (
        <div className="notice">
          <span>
            前回の編集（{savedProject.clips.length}
            クリップ）が保存されています。
          </span>
          <button
            disabled={disabled}
            onClick={() => void restoreProject(savedProject)}
          >
            前回の編集を再開
          </button>
          <button disabled={disabled} onClick={() => setSavedProject(null)}>
            新しく始める
          </button>
        </div>
      )}
      {!!missing.length && (
        <div className="notice">
          <div>
            <strong>元動画を再接続（残り{missing.length}本）</strong>
            <p>{missing.map((s) => s.name).join(' / ')}</p>
            <p className="fineprint">
              同じ名前・容量の元動画を選択してください。動画は端末内で処理します。
            </p>
          </div>
          <button disabled={disabled} onClick={() => picker.current?.click()}>
            元動画を選ぶ
          </button>
        </div>
      )}
      <input
        hidden
        ref={projectPicker}
        type="file"
        accept=".json,application/json"
        onChange={(e) => void openProject(e.target.files?.[0])}
      />
      {supported === false && (
        <div role="alert" className="notice error">
          このブラウザは動画編集に必要な機能に対応していません。最新版のChrome /
          Edgeで開いてください。
        </div>
      )}
      {notice && (
        <div
          role={notice.error ? 'alert' : 'status'}
          className={'notice ' + (notice.error ? 'error' : '')}
        >
          <span>{notice.text}</span>
          <button aria-label="お知らせを閉じる" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {exporting && (
        <output className="export-progress">
          <div>
            <LoaderCircle className="spin" size={18} />
            <strong>動画をつないでいます</strong>
            <span>{Math.round(progress * 100)}%</span>
            <button
              className="text-button"
              onClick={() => exportAbort.current?.abort()}
            >
              中止
            </button>
          </div>
          <Progress value={progress * 100} aria-label="動画の書き出し進捗" />
          <p className="fineprint">
            完了するまでこのページを開いておいてください。
          </p>
        </output>
      )}
      {result && (
        <div className="download-result">
          <Check size={20} />
          <div>
            <strong>動画ができました</strong>
            <p className="fineprint">
              {result.name} · {(result.size / 1024 / 1024).toFixed(1)} MB ·
              書き出し時の編集内容
            </p>
          </div>
          <a
            className="button primary"
            href={result.url}
            download={result.name}
          >
            <Download size={16} />
            動画を保存
          </a>
          <button
            className="icon-button"
            aria-label="書き出し結果を閉じる"
            onClick={() => setResult(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <input
        hidden
        ref={picker}
        type="file"
        multiple
        accept="video/*,.mp4,.mov,.webm"
        onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
      />
      <fieldset
        disabled={disabled}
        className="editor-fieldset"
        onBlurCapture={() => {
          editGroup.current = null;
        }}
      >
        <div className="editor-grid">
          <aside className="panel media-panel">
            <div className="panel-heading">
              <h2>
                <Film size={17} />
                素材
              </h2>
              <span className="small-tag">
                {String(assets.length).padStart(2, '0')}
              </span>
            </div>
            <ChoiceSelect
              label="動画の追加方法"
              value={importMode}
              options={[
                { value: 'first', label: '各動画から2.5秒' },
                { value: 'split', label: '全体を2.5秒ずつ分割' },
              ]}
              onChange={setImportMode}
            />
            <button
              className={'upload-zone ' + (dragOver ? 'drag-over' : '')}
              disabled={supported === false}
              onClick={() => picker.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!disabled) void addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              {loading ? (
                <LoaderCircle className="spin" size={26} />
              ) : (
                <Upload size={26} />
              )}
              <strong>{loading ? '読み込み中…' : '動画を読み込む'}</strong>
              <span>または、ここにドロップ</span>
              <span>MP4・MOV・WebM</span>
            </button>
            {assets.length === 0 ? (
              <>
                <p className="fineprint">
                  スマートグラスやスマートフォンで撮影した動画を追加してください。
                </p>
                <div className="workflow-note">
                  <span>01 — IMPORT</span>
                  <p>
                    目線のままに撮った動画を
                    <br />
                    小さなストーリーへ。
                  </p>
                  <Scissors size={24} />
                </div>
              </>
            ) : (
              <div className="asset-list">
                {assets.map((asset) => (
                  <article className="asset-card" key={asset.id}>
                    <div className="asset-image">
                      <img
                        src={asset.thumbnail}
                        alt={asset.name}
                        loading="lazy"
                      />
                      <span>{timecode(asset.duration)}</span>
                    </div>
                    <strong title={asset.name}>{asset.name}</strong>
                    <div className="asset-meta">
                      {asset.width} × {asset.height}
                      <span>{asset.hasAudio ? '音声あり' : '音声なし'}</span>
                    </div>
                    <div className="asset-actions">
                      <button onClick={() => appendAsset(asset)}>
                        <Plus size={14} />
                        2.5秒追加
                      </button>
                      <button
                        onClick={() => appendAsset(asset, true)}
                        title="全体を2.5秒ずつに分割して末尾に追加"
                      >
                        全分割して追加
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="fineprint media-limit">
              最大30本・1本2GBまで
              <br />
              元動画はアップロードされません。
            </p>
          </aside>
          <section className="preview-section">
            <div className="preview-toolbar">
              <span className="eyebrow">PREVIEW</span>
              <div className="segmented">
                <button
                  aria-pressed={settings.aspect === 'portrait'}
                  aria-label="縦型 9対16"
                  onClick={() => updateSettings({ aspect: 'portrait' })}
                >
                  <Smartphone size={15} />
                  9:16
                </button>
                <button
                  aria-pressed={settings.aspect === 'landscape'}
                  aria-label="横型 16対9"
                  onClick={() => updateSettings({ aspect: 'landscape' })}
                >
                  <Monitor size={15} />
                  16:9
                </button>
              </div>
            </div>
            <div className="stage">
              {clips.length ? (
                <div className={'video-frame ' + settings.aspect}>
                  <canvas ref={preview} aria-label="編集した動画のプレビュー" />
                  {preparing && (
                    <div className="preview-preparing">
                      <LoaderCircle className="spin" size={22} />
                      <span>プレビューを準備中…</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className={'empty-frame ' + settings.aspect}>
                  <span className="frame-counter">POV / 001</span>
                  <div className="frame-center">
                    <Glasses size={44} strokeWidth={1} />
                    <h2>
                      あなたの目線が、
                      <br />
                      ストーリーになる。
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => picker.current?.click()}
                    >
                      最初の動画を追加
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <span className="frame-bottom">
                    2.5 SECONDS. YOUR PERSPECTIVE.
                  </span>
                </div>
              )}
            </div>
            <div className="playback-bar">
              <div className="play-controls">
                <button
                  className="icon-button"
                  aria-label="先頭へ戻る"
                  disabled={disabled || !clips.length || !!missing.length}
                  onClick={() => moveTo(0)}
                >
                  <SkipBack size={17} />
                </button>
                <button
                  className="play-button"
                  disabled={disabled || !clips.length || !!missing.length}
                  onClick={() =>
                    void togglePlay().catch((e) =>
                      setNotice({ text: errorText(e), error: true }),
                    )
                  }
                  aria-label={playing ? '一時停止' : 'プレビューを再生'}
                >
                  {playing ? <Pause size={17} /> : <Play size={17} />}
                </button>
              </div>
              <span className="timecode">
                {timecode(displayTime)} <span>/ {timecode(duration)}</span>
              </span>
              <span className="fineprint">30 fps</span>
            </div>
            <div className="scrubber">
              <Slider
                aria-label="再生位置"
                min={0}
                max={Math.max(duration - 1 / FPS, 0.01)}
                step={1 / FPS}
                value={[Math.min(displayTime, Math.max(0, duration - 1 / FPS))]}
                disabled={disabled || !clips.length || !!missing.length}
                onValueChange={(v) => {
                  if (
                    !disabled &&
                    !importBusy.current &&
                    !exportBusy.current &&
                    !missing.length
                  )
                    moveTo(Array.isArray(v) ? v[0] : v);
                }}
              />
            </div>
            <div className="project-settings">
              <div className="section-label">
                <Hash size={16} />
                全体のハッシュタグ<span>すべてのクリップに表示</span>
              </div>
              <label className="sr-only" htmlFor="tags">
                ハッシュタグ
              </label>
              <textarea
                id="tags"
                rows={2}
                maxLength={180}
                value={settings.tags}
                onChange={(e) => updateSettings({ tags: e.target.value })}
                placeholder="#POV #今日の発見"
              />
              <p className="fineprint">
                スペース・改行・カンマで区切る ·{' '}
                {normalizeTags(settings.tags).length}個
              </p>
              <StyleControls
                value={settings.tagStyle}
                onChange={(tagStyle) => updateSettings({ tagStyle })}
                prefix="ハッシュタグ"
                small
              />
            </div>
          </section>
          <aside className="panel settings-panel">
            <div className="panel-heading">
              <h2>
                <Type size={17} />
                クリップの編集
              </h2>
              <span className="small-tag">
                {selected
                  ? String(selectedIndex + 1).padStart(2, '0')
                  : '—'} /{' '}
                {String(clips.length).padStart(2, '0')}
              </span>
            </div>
            {selected && selectedAsset ? (
              <div className="clip-settings">
                <div className="selected-source">
                  <span>{selectedAsset.name}</span>
                  <strong>
                    2.5 <small>SEC</small>
                  </strong>
                </div>
                <label className="field-label" htmlFor="clip-start">
                  切り出し開始位置 <span>{selected.start.toFixed(2)} 秒</span>
                </label>
                <Slider
                  disabled={disabled || selectedAsset.duration <= CLIP_SECONDS}
                  aria-label="切り出し開始位置"
                  min={0}
                  max={Math.max(
                    0.001,
                    selectedAsset.duration - CLIP_SECONDS,
                    selected.start,
                  )}
                  step={0.05}
                  value={[selected.start]}
                  onValueChange={(v) =>
                    updateClip({ start: Array.isArray(v) ? v[0] : v })
                  }
                />
                <div className="start-row">
                  <input
                    id="clip-start"
                    type="number"
                    min={0}
                    max={Math.max(0, selectedAsset.duration - 0.001)}
                    step={0.05}
                    value={selected.start}
                    onChange={(e) => {
                      const start = Number(e.target.value);
                      if (Number.isFinite(start))
                        updateClip({
                          start: Math.max(
                            0,
                            Math.min(start, selectedAsset.duration - 0.001),
                          ),
                        });
                    }}
                  />
                  <span className="fineprint">秒から2.5秒間</span>
                </div>
                {selected.start + CLIP_SECONDS >
                  selectedAsset.duration + 0.01 && (
                  <p className="fineprint short-note">
                    不足分は最後のフレームで静止します。
                  </p>
                )}
                <span className="field-label">画面への収め方</span>
                <ChoiceSelect
                  label="画面への収め方"
                  value={selected.fit}
                  options={[
                    { value: 'cover', label: '画面いっぱいに切り抜く' },
                    { value: 'contain', label: '全体を収める（黒い余白）' },
                  ]}
                  onChange={(v) => updateClip({ fit: v as Clip['fit'] })}
                />
                {selected.fit === 'cover' && (
                  <div className="crop-controls">
                    <span className="field-label">
                      切り抜き位置{' '}
                      <button
                        className="text-button"
                        onClick={() => updateClip({ cropX: 0.5, cropY: 0.5 })}
                      >
                        中央に戻す
                      </button>
                    </span>
                    <span className="field-label">
                      左右 <span>左 ← → 右</span>
                    </span>
                    <Slider
                      aria-label="切り抜き左右"
                      disabled={disabled}
                      min={0}
                      max={100}
                      step={1}
                      value={[(selected.cropX ?? 0.5) * 100]}
                      onValueChange={(v) =>
                        updateClip({
                          cropX: (Array.isArray(v) ? v[0] : v) / 100,
                        })
                      }
                    />
                    <span className="field-label">
                      上下 <span>上 ← → 下</span>
                    </span>
                    <Slider
                      aria-label="切り抜き上下"
                      disabled={disabled}
                      min={0}
                      max={100}
                      step={1}
                      value={[(selected.cropY ?? 0.5) * 100]}
                      onValueChange={(v) =>
                        updateClip({
                          cropY: (Array.isArray(v) ? v[0] : v) / 100,
                        })
                      }
                    />
                    <p className="fineprint">
                      はみ出す方向を調整して、被写体を画面に。
                    </p>
                  </div>
                )}
                <div className="settings-divider" />
                <label className="field-label" htmlFor="clip-caption">
                  中央に表示する文字<span>{selected.text.length}/120</span>
                </label>
                <textarea
                  id="clip-caption"
                  value={selected.text}
                  maxLength={120}
                  rows={3}
                  placeholder="この瞬間の、ひとこと。"
                  onChange={(e) => updateClip({ text: e.target.value })}
                />
                <StyleControls
                  value={selected.style}
                  onChange={(style) => updateClip({ style })}
                  prefix="クリップ文字"
                />
                <button
                  className="text-button batch-button"
                  disabled={clips.length < 2}
                  onClick={() =>
                    changeClips(
                      clips.map((c) => ({
                        ...c,
                        style: { ...selected.style },
                      })),
                    )
                  }
                >
                  この文字スタイルを全クリップに適用
                </button>
                <div className="settings-divider" />
                <label className="field-label">
                  {selectedIndex === 0
                    ? '最初のクリップの入り方'
                    : '前のクリップとの切り替え'}
                </label>
                <ChoiceSelect
                  label="クリップのトランジション"
                  value={
                    selectedIndex === 0 ? settings.intro : selected.transition
                  }
                  options={transitions}
                  onChange={(v) =>
                    selectedIndex === 0
                      ? updateSettings({ intro: v as Transition })
                      : updateClip({ transition: v as Transition })
                  }
                />
                <button
                  className="text-button batch-button"
                  disabled={clips.length < 2}
                  onClick={() =>
                    changeClips(
                      clips.map((c) => ({
                        ...c,
                        transition:
                          selectedIndex === 0
                            ? settings.intro
                            : selected.transition,
                      })),
                    )
                  }
                >
                  この効果をすべてのクリップ間に適用
                </button>
                <p className="fineprint">
                  効果は0.3秒 · クリップの長さは変わりません。
                </p>
              </div>
            ) : (
              <div className="settings-empty">
                <Scissors size={25} />
                <p>
                  {missing.length
                    ? '元動画を再接続すると、文字と効果の編集を再開できます。'
                    : '動画を追加すると、文字と効果を編集できます。'}
                </p>
              </div>
            )}
            <div className="output-settings">
              <div className="section-label">Vlog全体</div>
              <div className="two-fields">
                <div>
                  <span className="field-label">最初の効果</span>
                  <ChoiceSelect
                    label="最初の効果"
                    value={settings.intro}
                    options={transitions}
                    onChange={(v) => updateSettings({ intro: v as Transition })}
                  />
                </div>
                <div>
                  <span className="field-label">最後の効果</span>
                  <ChoiceSelect
                    label="最後の効果"
                    value={settings.outro}
                    options={transitions}
                    onChange={(v) => updateSettings({ outro: v as Transition })}
                  />
                </div>
              </div>
              <div className="audio-setting">
                <label htmlFor="source-audio">
                  <Volume2 size={16} />
                  元の音声
                </label>
                <Switch
                  id="source-audio"
                  disabled={disabled}
                  aria-label="元の音声"
                  checked={settings.audio}
                  onCheckedChange={(audio) => updateSettings({ audio })}
                />
              </div>
              <div className="two-fields">
                <div>
                  <span className="field-label">解像度</span>
                  <ChoiceSelect
                    label="書き出し解像度"
                    value={String(settings.resolution)}
                    options={[
                      { value: '720', label: '720p' },
                      { value: '1080', label: '1080p' },
                    ]}
                    onChange={(v) =>
                      updateSettings({ resolution: Number(v) as 720 | 1080 })
                    }
                  />
                </div>
                <div>
                  <span className="field-label">保存形式</span>
                  <ChoiceSelect
                    label="書き出し形式"
                    value={settings.format}
                    options={[
                      { value: 'mp4', label: 'MP4' },
                      { value: 'webm', label: 'WebM' },
                    ]}
                    onChange={(v) =>
                      updateSettings({ format: v as Settings['format'] })
                    }
                  />
                </div>
              </div>
              <p className="fineprint">
                {outputSize(settings).width} × {outputSize(settings).height} px
                · 30 fps
                <br />
                Chrome / Edge 推奨。対応形式は端末によって異なります。
              </p>
            </div>
          </aside>
        </div>
        <section className="timeline">
          <div className="panel-heading">
            <h2>
              <Scissors size={17} />
              タイムライン
              <span className="small-tag">{clips.length} CLIPS</span>
            </h2>
            <div className="timeline-actions">
              <span className="fineprint">1クリップ = 2.5秒</span>
              <button
                className="icon-button"
                title="クリップの編集を元に戻す"
                aria-label="クリップの編集を元に戻す"
                disabled={!history.length}
                onClick={() => {
                  const previous = history[history.length - 1];
                  stop();
                  editGroup.current = null;
                  setClips(previous.clips);
                  setHistory((h) => h.slice(0, -1));
                  setSelectedId(previous.selectedId);
                  moveTo(
                    Math.min(
                      previous.time,
                      Math.max(
                        0,
                        previous.clips.length * CLIP_SECONDS - 1 / FPS,
                      ),
                    ),
                  );
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          {clips.length ? (
            <>
              <div className="timeline-track">
                {clips.map((clip, index) => {
                  const asset = assets.find((a) => a.id === clip.assetId);
                  return (
                    <article
                      key={clip.id}
                      className={
                        'timeline-clip ' +
                        (selectedId === clip.id ? 'selected ' : '') +
                        (playing && currentIndex === index ? 'active' : '')
                      }
                    >
                      <button
                        draggable={!disabled}
                        onDragStart={() => setDragged(clip.id)}
                        onDragEnd={() => setDragged(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragged && !disabled) reorder(dragged, index);
                          setDragged(null);
                        }}

                        className="clip-face"
                        onClick={() => choose(clip.id)}
                        aria-label={
                          'クリップ' +
                          (index + 1) +
                          'を編集：' +
                          (asset?.name ??
                            sources.find((s) => s.id === clip.assetId)?.name ??
                            '未接続の動画')
                        }
                        aria-pressed={selectedId === clip.id}
                      >
                        {asset && (
                          <img src={asset.thumbnail} alt="" draggable={false} />
                        )}
                        <span className="clip-number">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="clip-length">2.5s</span>
                        <span className="clip-caption">
                          {clip.text || 'テキストを追加'}
                        </span>
                      </button>
                      <div className="clip-under">
                        <span>
                          <GripVertical size={13} />
                          {timecode(index * CLIP_SECONDS)}
                        </span>
                        <div>
                          <button
                            aria-label={'クリップ' + (index + 1) + 'を前へ'}
                            disabled={index === 0}
                            onClick={() => reorder(clip.id, index - 1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            aria-label={'クリップ' + (index + 1) + 'を後ろへ'}
                            disabled={index === clips.length - 1}
                            onClick={() => reorder(clip.id, index + 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            aria-label={'クリップ' + (index + 1) + 'を削除'}
                            onClick={() => removeClip(clip.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                <button
                  className="timeline-add"
                  onClick={() => picker.current?.click()}
                  disabled={clips.length >= MAX_CLIPS}
                  aria-label="動画を追加"
                >
                  <Plus size={24} />
                  <span>追加</span>
                </button>
              </div>
              <p className="fineprint timeline-help">
                ドラッグまたは矢印で並べ替え · クリックして編集 · 合計{' '}
                {duration.toFixed(1)} 秒 / 最大150秒
              </p>
            </>
          ) : (
            <button
              className="timeline-empty"
              disabled={supported === false}
              onClick={() => picker.current?.click()}
            >
              <Plus size={20} />
              動画を追加して、Vlogをつくる
            </button>
          )}
        </section>
      </fieldset>
      <footer>
        <span>POV CUT</span>
        <span>カメラ付きメガネから、日常の小さな発見を。</span>
      </footer>
    </main>
  );
}

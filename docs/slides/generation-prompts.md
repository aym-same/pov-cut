# POV CUT 説明スライド画像

2026-09-22 / 内蔵 image_gen を使用。モデルのバージョンを指定・確認するパラメーターは提供されていません。

公開版の package.json、README.md、lib/timeline.ts、lib/video-engine.ts、lib/project.ts、app/page.tsx、.github/workflows/check.yml を参照。技術構成と機能を各1枚、16:9の画像で制作。以前添付された展示資料の黒・グリーンの雰囲気を踏襲。

## 01 技術構成：生成プロンプト

```text
Use case: productivity-visual.
Create one polished Japanese presentation slide as a single raster image, landscape 16:9, ideally 2560x1440. This is a real project explainer, not a webpage and not a photograph of a slide. Full bleed slide with an even 5% safe margin.
Design system: inspired by scientific exhibition placards and dark terminal schematics. Near-black green background #050b08, crisp luminous emerald #36e76a for main titles and rules, muted green for tiny technical annotation, pale mint #d4efdc for body copy. A thin green border with tiny registration crosses and ruler ticks at the outside, a restrained fine dot grid only within diagram areas. Large bold modern Japanese Gothic sans typography, monospaced Latin technology labels. Very subtle title glow only; all other typography razor sharp, no bloom that reduces readability. Strong hierarchy, generous negative space, aligned baselines. Bright enough for projection. No decorative lorem ipsum, no invented metrics, no QR code, no sponsor/AI model credits, no extra claims. All Japanese and Latin copy must be accurately typeset, never garbled. This belongs to a coherent two-slide set for POV CUT.
Slide 1 of 2: explain the real technical architecture of the currently published GitHub edition.
HEADER, exact: "POV CUT / 技術構成"
Large headline, exact: "動画編集は、ブラウザの中で完結"
Small subtitle, exact: "元動画をサーバーへ送らず、端末内で編集・書き出し"

Composition: title across top. Below it, a shallow hosting band occupying about 15% of slide height, then a much larger browser-processing diagram occupying 45%, and one clean footer. Visual arrows belong to the diagram, not bullet text.
HOSTING BAND: header "アプリの配信". Three understated outlined blocks connected left-to-right:
"GitHub" / "ソースコード"
"GitHub Actions" / "テスト・Viteでビルド"
"GitHub Pages" / "静的サイトを無料公開"
From GitHub Pages draw one thin downward arrow clearly labeled "アプリを配信" to the large browser region. This arrow represents application files only. No video arrow goes to hosting.

LARGE BROWSER REGION: a finely outlined boundary titled "利用者のブラウザ". At its top left place a UI layer label "編集画面" and immediately beside it "React + TypeScript" and below in smaller size "Tailwind CSS + Base UI".
Within the region draw a single unambiguous left-to-right media pipeline with five stages, using small minimal line icons and strong typography:
1. source video/file icon: "元動画" then "MP4 / MOV / WebM"
2. decoder icon: "読み込み" then "Mediabunny" then "WebCodecs"
3. image layers and waveform icon: "映像・音声を編集" then "Canvas 2D" then "Web Audio API"
4. encoding chip icon: "書き出し" then "Mediabunny" then "WebCodecs"
5. download/file icon: "端末に保存" then "MP4 / WebM"
Stages 2-4 have equal width. Arrows are straight and do not touch text.
Below the editing/UI area in the SAME browser boundary, include a secondary horizontal storage row:
"編集内容の保存" then "localStorage / JSON"
and the caption "動画本体は保存せず、再開時に元動画を選び直す"
Keep the storage row visually subordinate but easy to read.
Footer separated by a thin line, left "POV CUT" and center "aym-same.github.io/pov-cut/" and right "01 / 02".
No cloud processing, database, Next.js, FFmpeg, generative AI or AI automatic editing in this architecture. Do not add versions or detailed codecs. This diagram explains the app, not the illustration tool.
```

## 02 主な機能：生成プロンプト

```text
Use case: productivity-visual.
Create one polished Japanese presentation slide as a single raster image, landscape 16:9, ideally 2560x1440. This is a real project explainer, not a webpage and not a photograph of a slide. Full bleed slide with an even 5% safe margin.
Design system: inspired by scientific exhibition placards and dark terminal schematics. Near-black green background #050b08, crisp luminous emerald #36e76a for main titles and rules, muted green for tiny technical annotation, pale mint #d4efdc for body copy. A thin green border with tiny registration crosses and ruler ticks at the outside, a restrained fine dot grid only within diagram areas. Large bold modern Japanese Gothic sans typography, monospaced Latin technology labels. Very subtle title glow only; all other typography razor sharp, no bloom that reduces readability. Strong hierarchy, generous negative space, aligned baselines. Bright enough for projection. No decorative lorem ipsum, no invented metrics, no QR code, no sponsor/AI model credits, no extra claims. All Japanese and Latin copy must be accurately typeset, never garbled. This belongs to a coherent two-slide set for POV CUT.
Slide 2 of 2: explain what users can do with POV CUT. A visually appealing feature overview with an illustrative mini timeline, then six concise feature descriptions.
HEADER, exact: "POV CUT / 主な機能"
Large headline, exact: "その目線を、2.5秒ずつ。"
Subtitle, exact: "Rokid Glassesなどで撮った日常を、短いVlogへ"

Upper-middle hero visual: a small elegant camera-glasses line illustration leading into three adjacent cinematic first-person video thumbnails, each clearly labeled "2.5 SEC". Use tasteful generated illustrations of a walk down a Japanese street, a hand holding coffee, and a seaside stroll. They are visual examples, not footage evidence. Keep illustrations dark and softly tinted green to fit the exhibition scheme, while recognizable. The three equal-width thumbnails form a real editing timeline, linked to a vertical 9:16 output frame and a smaller horizontal 16:9 output frame on the right. Put one centered caption "今日の発見" and bottom hashtags "#POV #スマートグラス" inside the larger vertical frame. Use the small label "編集イメージ" beside the hero visual to make clear this is an illustration. The result is a diagram of editing, NOT a fake detailed application screenshot.

Lower-middle: six feature blocks arranged as a disciplined 3-column by 2-row editorial grid, with simple emerald icons and hairline separators rather than heavy card boxes. Large clear bold headings and readable body copy. Exact copy:
01 heading "2.5秒でつなぐ"
body "切り出し位置を調整"
body "動画全体の自動分割も"
02 heading "文字とハッシュタグ"
body "クリップの中央文字・複数タグ"
body "フォント・サイズ・色を選択"
03 heading "縦型・横型に対応"
body "9:16 / 16:9"
body "切り抜き位置も調整"
04 heading "シーンの切り替え"
body "フェード・ブラックアウト"
body "ホワイトフラッシュ"
05 heading "続きを編集できる"
body "自動保存・JSON保存"
body "再開時は元動画を選択"
06 heading "投稿用に書き出す"
body "MP4 / WebM・720p / 1080p"
body "保存した動画をSNSへ"

Below the grid, a restrained single line "動画は端末内で編集　／　Chrome・Edge推奨". Do not say any browser guaranteed.
Footer separated by a thin rule, left "POV CUT", center "aym-same.github.io/pov-cut/", right "02 / 02".
Do not imply direct posting to SNS, automatic AI highlight selection, background music, facial blur, device wireless sync, video cloud backup, or features beyond this exact content. Keep every label clear at presentation scale.
```

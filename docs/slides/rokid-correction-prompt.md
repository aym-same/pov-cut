# スライド② Rokid Glasses 形状修正

2026-09-22 / 内蔵 image_gen による部分編集。

対象: 02-features.png。公式のディスプレイ搭載Rokid Glassesを参照。

参照ページ: https://global.rokid.com/pages/rokid-glasses

製品写真: https://global.rokid.com/cdn/shop/files/001_8c854eae-1297-4a66-a5bc-808f5e127dfc.jpg?v=1786429759&width=1600

カメラ詳細: https://global.rokid.com/cdn/shop/files/navigation1_png_da3c6e2d-4653-40db-ba1b-f21ad6df167c.webp?v=1751361288

公式写真は形状を確認するためのローカル参照用。公開版には修正済み説明画像のみを配置。

## Prompt

```text
Use case: precise-object-edit.
Edit Image 1, the existing Japanese POV CUT feature slide. Image 2 is the authoritative official product photograph of the actual Rokid Glasses WITH DISPLAY. Image 3 is an official close-up showing its camera corner. Images 2 and 3 are SHAPE REFERENCES ONLY, not slide backgrounds.

The user's request is faithful product reproduction. The existing glasses illustration in Image 1 is generic and inaccurate. Replace ONLY the green glasses illustration at the far left of the middle visual strip, just above the label "Rokid Glasses". Make the replacement an accurate, delicately rendered emerald technical line illustration of the real glasses in Image 2. Trace/reproduce the actual product geometry closely, with the same three-quarter perspective as Image 2, scaled to fit the existing illustration slot. Do not try to preserve the old incorrect silhouette.

Specific fidelity requirements from the reference photograph:
- The front frame is a rounded rectangular / subtly trapezoidal shape, with a fairly straight substantial upper brow rim and much thinner lower rims. Do not make round lenses or a wraparound visor.
- In the official reference perspective, the image-left lens is smaller/farther and the image-right lens is larger/nearer.
- ONE clearly visible circular camera lens is embedded in the OUTER UPPER CORNER OF THE FRONT FRAME at the image-right end, above/outside the larger near lens. It faces forward, not sideways. Match its inset ring and relation to the outer frame edge from Image 3. Do not draw a square camera on the temple.
- Match the actual centered bridge profile and the two small separate transparent nose pads on supports, visible below/behind the bridge.
- Match the chunky near temple extending back diagonally toward image-right, tapering into the gently curved thin ear end; the farther temple is visible diagonally behind the lenses toward the lower left as in Image 2.
- Include only a subtle small "Rokid" mark on the outside of the near temple in the location seen in the reference, if legible at this size.
- Clear see-through lenses with thin optical edge details, not opaque sunglasses. No extra sensors, invented giant cameras, floating extra arms, extra bridge, invented buttons or futuristic goggles.
- Translate the authentic black product into the slide's crisp mint/emerald outline drawing style, with sparse near-black translucent shading to convey depth. Preserve accurate proportions. No white rectangular photo background and no red dot award logo.

Editable region is only the existing glasses object slot roughly x=94..362, y=285..403 in the 1672x941 target. Fit naturally in that slot without colliding with "編集イメージ" above, "Rokid Glasses" below, the connector arrow to the right, or the frame border. The far temple/earpiece must remain wholly inside the slot.

KEEP EVERYTHING ELSE UNCHANGED: exact original 1672x941 landscape canvas/aspect ratio, entire green/black design, every Japanese and Latin text including labels and URL, the top title, all six feature blocks, all icons in the lower grid, all three timeline photographs, both vertical/horizontal output pictures, borders, dotted background, connecting arrows and footer. Do not reword or retype anything. Do not introduce additional design changes or crop any content. Deliver the complete corrected slide, not a standalone glasses crop.
```

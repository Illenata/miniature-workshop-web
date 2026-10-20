import sharp from "sharp";

export type Derived = { data: Buffer; width: number; height: number };
export type CardDerivatives = { thumb400: Derived; thumb800: Derived; og: Derived };

export const THUMB_WIDTHS = [400, 800] as const;
export const OG_SIZE = { width: 1200, height: 630 } as const;

// Cards are 3:4 (1200×1600); thumbs are cropped to exactly 3:4 so tiles never shift
// even if a card arrives a pixel or two off (spec allows ±2 px).
const thumbHeight = (w: number) => Math.round((w * 4) / 3);

async function thumb(card: Buffer, width: number): Promise<Derived> {
  const height = thumbHeight(width);
  const data = await sharp(card)
    .resize(width, height, { fit: "cover", position: "centre" })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  return { data, width, height };
}

/**
 * Open Graph image 1200×630: the card centred over a blurred, darkened copy of itself.
 * PNG because the files origin only serves model/gltf-binary, image/png and image/webp
 * (spec section 3), and some link-preview bots still ignore WebP.
 * TODO: add the game logo once Anton provides it.
 */
async function ogImage(card: Buffer): Promise<Derived> {
  const { width, height } = OG_SIZE;
  const pad = 32;
  const fgHeight = height - pad * 2;
  const fgWidth = Math.round((fgHeight * 3) / 4);

  const [background, foreground] = await Promise.all([
    sharp(card)
      .resize(width, height, { fit: "cover", position: "centre" })
      .blur(28)
      .modulate({ brightness: 0.55 })
      .toBuffer(),
    sharp(card).resize(fgWidth, fgHeight, { fit: "cover", position: "centre" }).toBuffer(),
  ]);

  const data = await sharp(background)
    .composite([{ input: foreground, left: Math.round((width - fgWidth) / 2), top: pad }])
    .removeAlpha()
    .png({ compressionLevel: 9, effort: 7, palette: false })
    .toBuffer();
  return { data, width, height };
}

/** Everything the pages need from one card PNG. Used by uploads and by the seed script. */
export async function deriveFromCard(card: Buffer): Promise<CardDerivatives> {
  const [thumb400, thumb800, og] = await Promise.all([
    thumb(card, 400),
    thumb(card, 800),
    ogImage(card),
  ]);
  return { thumb400, thumb800, og };
}

import 'server-only';
import sharp, { type Metadata } from 'sharp';
import { IMAGE_SPECS, MAX_UPLOAD_BYTES, type MediaKind } from '@/domain/branding';

// Every uploaded image is decoded and re-encoded here before it is stored, so what reaches Storage
// is always a plain WebP of a sensible size: no SVG or other active content, no EXIF (which can
// hold the owner's GPS location), and rotation applied. Free and local (sharp ships with Next.js).

export type Processed = { ok: true; data: Buffer; width: number; height: number } | { ok: false; message: string };

const MAX_PIXELS = 40_000_000; // refuse decompression bombs before decoding

// The real format is read from the bytes, never from the file name or the browser's type.
function sniff(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function processImage(input: Buffer, kind: MediaKind): Promise<Processed> {
  const spec = IMAGE_SPECS[kind];
  if (input.length === 0) return { ok: false, message: 'That file is empty.' };
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, message: 'That image is over 10 MB. Choose a smaller one.' };
  const format = sniff(input);
  if (!format) return { ok: false, message: 'Use a JPEG, PNG or WebP image.' };

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    return { ok: false, message: 'That image couldn’t be read. It may be damaged — try exporting it again.' };
  }
  if (meta.format !== format) return { ok: false, message: 'That image couldn’t be read. Try exporting it again as JPEG or PNG.' };
  if ((meta.pages ?? 1) > 1) return { ok: false, message: 'Animated images aren’t supported. Use a still photo.' };
  // Width/height as displayed (EXIF orientation 5–8 swaps them).
  const rotated = (meta.orientation ?? 1) >= 5;
  const w = (rotated ? meta.height : meta.width) ?? 0;
  const h = (rotated ? meta.width : meta.height) ?? 0;
  if (w < spec.minWidth || h < spec.minHeight)
    return { ok: false, message: `That image is ${w} × ${h} px. ${spec.label}s need at least ${spec.minWidth} × ${spec.minHeight} px.` };

  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: spec.maxWidth, height: spec.maxHeight, fit: 'inside', withoutEnlargement: true })
      .webp(kind === 'logo' ? { quality: 90, alphaQuality: 100, effort: 5 } : { quality: 80, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > 4 * 1024 * 1024) return { ok: false, message: 'That image is too detailed to store. Try a smaller one.' };
    return { ok: true, data, width: info.width, height: info.height };
  } catch {
    return { ok: false, message: 'That image couldn’t be processed. Try exporting it again as JPEG or PNG.' };
  }
}

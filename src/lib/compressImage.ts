import { ChatError, type PreparedImage } from '../chat/types';
import { ACCEPTED_IMAGE_TYPES, IMAGE_BYTES_MAX } from './validation';

const MAX_EDGE = 1600;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * 在使用者的裝置上先壓縮圖片：長邊最多 1600 像素，轉成 WebP。
 * 重新繪製一次也會清掉照片裡的拍攝地點等資訊。
 * GIF 不壓縮（壓縮會讓動畫消失），但必須小於 5 MB。
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const type = file.type.toLowerCase();
  if (type === 'image/svg+xml' || (type && !ACCEPTED_IMAGE_TYPES.includes(type))) {
    throw new ChatError('IMAGE_UNSUPPORTED');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ChatError('IMAGE_UNSUPPORTED');
  }

  if (type === 'image/gif') {
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (file.size > IMAGE_BYTES_MAX) throw new ChatError('IMAGE_TOO_LARGE');
    return { blob: file, ...size };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ChatError('IMAGE_UNSUPPORTED');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.6]) {
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    // 舊版 Safari 不支援輸出 WebP，會給 PNG，這時改用 JPEG
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= IMAGE_BYTES_MAX) return { blob, width, height };
  }
  throw new ChatError('IMAGE_TOO_LARGE');
}

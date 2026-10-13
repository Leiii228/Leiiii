import type { PreparedImage } from '../types';

// 示範模式用的圖片：在瀏覽器裡畫一張簡單的風景，不需要任何圖檔。

const SKIES: Array<[string, string, string]> = [
  ['#F6C59A', '#F3A27A', '#7A5A6E'], // 晚霞
  ['#BFD8E8', '#E9D7C0', '#6E8A5C'], // 晴天
  ['#E8C9D6', '#F5DEC0', '#8A6F5A'], // 清晨
  ['#9FB7C9', '#D7C4B0', '#4F6B5A'], // 陰天
];

export async function makeDemoImage(seed = Math.floor(Math.random() * 1000)): Promise<PreparedImage> {
  const width = 800;
  const height = 600;
  const [top, bottom, hill] = SKIES[seed % SKIES.length];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 248, 235, 0.85)';
  ctx.beginPath();
  ctx.arc(200 + (seed % 5) * 90, 230, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hill;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, 420);
  ctx.quadraticCurveTo(220, 330 + (seed % 3) * 20, 430, 430);
  ctx.quadraticCurveTo(620, 520, 800, 400);
  ctx.lineTo(width, height);
  ctx.fill();

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/jpeg', 0.85),
  );
  return { blob, width, height };
}

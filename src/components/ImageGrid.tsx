import type { ImageRef } from '../chat/types';

interface Props {
  images: ImageRef[];
  srcOf: (index: number) => string;
  onOpen: (index: number) => void;
  /** 上傳中時是 0～1 */
  progress?: number;
}

function layoutClass(n: number): string {
  if (n <= 4) return `images--${n}`;
  return 'images--many';
}

export function ImageGrid({ images, srcOf, onOpen, progress }: Props) {
  const single = images.length === 1 ? images[0] : null;

  return (
    <div className={`images ${layoutClass(images.length)}`}>
      {images.map((img, i) => (
        <button
          key={img.path}
          type="button"
          className="image-cell"
          aria-label={`放大第 ${i + 1} 張圖片`}
          onClick={() => onOpen(i)}
          style={single ? { aspectRatio: `${single.width} / ${single.height}` } : undefined}
        >
          <img src={srcOf(i)} alt="" width={img.width} height={img.height} loading="lazy" decoding="async" />
        </button>
      ))}
      {progress !== undefined && (
        <div className="images__progress" aria-live="polite">
          <span>{Math.round(progress * 100)}%</span>
        </div>
      )}
    </div>
  );
}

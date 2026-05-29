export type CompressedImage = {
  dataUrl: string;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
  resized: boolean;
  compressed: boolean;
};

type CompressionOptions = {
  maxBytes: number;
  maxLongSide: number;
  mimeType: 'image/webp' | 'image/jpeg';
};

const defaultOptions: CompressionOptions = {
  maxBytes: 1_000_000,
  maxLongSide: 1600,
  mimeType: 'image/webp',
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = URL.createObjectURL(file);
  });

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('画像データを読み込めませんでした。'));
    reader.readAsDataURL(file);
  });

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('画像の圧縮に失敗しました。'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('画像データを読み込めませんでした。'));
    reader.readAsDataURL(blob);
  });

export const compressImageFile = async (
  file: File,
  options: Partial<CompressionOptions> = {},
): Promise<CompressedImage> => {
  const { maxBytes, maxLongSide, mimeType } = { ...defaultOptions, ...options };
  const image = await loadImage(file);
  const scale = Math.min(1, maxLongSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const needsResize = scale < 1;

  if (file.size <= maxBytes && !needsResize) {
    URL.revokeObjectURL(image.src);
    return {
      dataUrl: await fileToDataUrl(file),
      fileName: file.name,
      originalSize: file.size,
      compressedSize: file.size,
      width: image.naturalWidth,
      height: image.naturalHeight,
      mimeType: file.type || 'image/*',
      resized: false,
      compressed: false,
    };
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('画像処理用のCanvasを作成できませんでした。');
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);

  const outputMimeType = file.size <= maxBytes ? file.type || mimeType : mimeType;
  let quality = file.size <= maxBytes ? 1 : 0.86;
  let blob = await canvasToBlob(canvas, outputMimeType, quality);

  while (file.size > maxBytes && blob.size > maxBytes && quality > 0.46) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, outputMimeType, quality);
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    fileName: file.name,
    originalSize: file.size,
    compressedSize: blob.size,
    width,
    height,
    mimeType: blob.type || outputMimeType,
    resized: needsResize,
    compressed: file.size > maxBytes,
  };
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

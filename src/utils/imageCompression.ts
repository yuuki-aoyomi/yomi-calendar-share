export type CompressedImage = {
  dataUrl: string;
  blob: Blob;
  fileName: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
  resized: boolean;
  compressed: boolean;
};

export class ImageCompressionSizeError extends Error {
  compressedImage: CompressedImage;

  constructor(message: string, compressedImage: CompressedImage) {
    super(message);
    this.name = 'ImageCompressionSizeError';
    this.compressedImage = compressedImage;
  }
}

type CompressionOptions = {
  maxBytes: number;
  maxAllowedBytes: number;
  maxLongSide: number;
  mimeType: 'image/webp' | 'image/jpeg';
};

const defaultOptions: CompressionOptions = {
  maxBytes: 1_000_000,
  maxAllowedBytes: 2 * 1024 * 1024,
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
  const { maxBytes, maxAllowedBytes, maxLongSide, mimeType } = { ...defaultOptions, ...options };
  const image = await loadImage(file);
  const scale = Math.min(1, maxLongSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const needsResize = scale < 1;

  if (file.size <= maxBytes && !needsResize) {
    URL.revokeObjectURL(image.src);
    return {
      dataUrl: await fileToDataUrl(file),
      blob: file,
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

  const shouldKeepOriginal = file.size <= maxAllowedBytes && blob.size > file.size;
  const resultBlob = shouldKeepOriginal ? file : blob;
  const resultDataUrl = shouldKeepOriginal ? await fileToDataUrl(file) : await blobToDataUrl(blob);
  const compressedImage = {
    dataUrl: resultDataUrl,
    blob: resultBlob,
    fileName: file.name,
    originalSize: file.size,
    compressedSize: resultBlob.size,
    width: shouldKeepOriginal ? image.naturalWidth : width,
    height: shouldKeepOriginal ? image.naturalHeight : height,
    mimeType: resultBlob.type || outputMimeType,
    resized: shouldKeepOriginal ? false : needsResize,
    compressed: !shouldKeepOriginal && file.size > maxBytes,
  };

  if (compressedImage.compressedSize > maxAllowedBytes) {
    throw new ImageCompressionSizeError(
      '画像の圧縮後サイズが2MBを超えたため追加できませんでした。別の画像を選ぶか、画像を小さくしてください。',
      compressedImage,
    );
  }

  return compressedImage;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
};

import { useState } from 'react';
import type { DailyPhoto, EventImageMeta } from '../types/calendar';
import { compressImageFile, formatBytes } from '../utils/imageCompression';
import { createId } from '../utils/id';

type DailyPhotoPanelProps = {
  selectedDate: string;
  photos: DailyPhoto[];
  onPhotosChange: React.Dispatch<React.SetStateAction<DailyPhoto[]>>;
};

export function DailyPhotoPanel({ selectedDate, photos, onPhotosChange }: DailyPhotoPanelProps) {
  const [memo, setMemo] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageMeta, setImageMeta] = useState<EventImageMeta | undefined>();
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState('');
  const selectedPhotos = photos.filter((photo) => photo.date === selectedDate);

  const reset = () => {
    setMemo('');
    setImageUrl('');
    setImageMeta(undefined);
    setError('');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setError('');

    try {
      const compressedImage = await compressImageFile(file);
      setImageUrl(compressedImage.dataUrl);
      setImageMeta({
        fileName: compressedImage.fileName,
        originalSize: compressedImage.originalSize,
        compressedSize: compressedImage.compressedSize,
        width: compressedImage.width,
        height: compressedImage.height,
        mimeType: compressedImage.mimeType,
        resized: compressedImage.resized,
        compressed: compressedImage.compressed,
      });
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : '画像の読み込みに失敗しました。');
    } finally {
      setIsCompressing(false);
      event.target.value = '';
    }
  };

  const handleAddPhoto = () => {
    if (!imageUrl && !memo.trim()) return;

    const now = new Date().toISOString();
    onPhotosChange((current) => [
      ...current,
      {
        id: createId(),
        date: selectedDate,
        imageUrl,
        memo: memo.trim() || undefined,
        imageMeta,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    reset();
  };

  return (
    <section className="daily-photo-panel">
      <div className="section-title">
        <h3>{selectedDate} の写真</h3>
        <span>{selectedPhotos.length}枚</span>
      </div>

      <div className="daily-photo-form">
        <input type="file" accept="image/*" onChange={handleFileChange} />
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="写真メモ" />
        {isCompressing && <p className="helper-text">画像を軽量化しています...</p>}
        {error && <p className="error-text">{error}</p>}
        {imageUrl && (
          <figure className="image-preview-card">
            <img src={imageUrl} alt="追加予定の日別写真" />
            {imageMeta && (
              <figcaption>
                {imageMeta.fileName} / {imageMeta.width}x{imageMeta.height} / {formatBytes(imageMeta.originalSize)} →{' '}
                {formatBytes(imageMeta.compressedSize)}
                {!imageMeta.compressed && ' / 画質圧縮なし'}
                {imageMeta.resized && ' / 比率維持リサイズ'}
              </figcaption>
            )}
          </figure>
        )}
        <button type="button" className="primary-button" onClick={handleAddPhoto}>
          写真を追加
        </button>
      </div>

      {selectedPhotos.length > 0 && (
        <div className="daily-photo-grid">
          {selectedPhotos.map((photo) => (
            <article className="daily-photo-card" key={photo.id}>
              {photo.imageUrl && <img src={photo.imageUrl} alt={photo.memo || `${photo.date} の写真`} />}
              {photo.memo && <p>{photo.memo}</p>}
              {photo.imageMeta && (
                <span>
                  {photo.imageMeta.width}x{photo.imageMeta.height} / {formatBytes(photo.imageMeta.compressedSize)}
                </span>
              )}
              <button
                type="button"
                className="ghost-button danger"
                onClick={() => onPhotosChange((current) => current.filter((item) => item.id !== photo.id))}
              >
                削除
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

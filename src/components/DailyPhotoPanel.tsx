import { useState } from 'react';
import { shouldUseRemoteApi, uploadDailyPhoto, withReadToken } from '../api/calendarApi';
import type { DailyPhoto, EventImageMeta } from '../types/calendar';
import { compressImageFile, formatBytes, ImageCompressionSizeError, type CompressedImage } from '../utils/imageCompression';
import { createId } from '../utils/id';

type DailyPhotoPanelProps = {
  calendarId: string;
  writeToken: string;
  selectedDate: string;
  photos: DailyPhoto[];
  onPhotosChange: React.Dispatch<React.SetStateAction<DailyPhoto[]>>;
};

const toImageMeta = (compressedImage: CompressedImage): EventImageMeta => ({
  fileName: compressedImage.fileName,
  originalSize: compressedImage.originalSize,
  compressedSize: compressedImage.compressedSize,
  width: compressedImage.width,
  height: compressedImage.height,
  mimeType: compressedImage.mimeType,
  resized: compressedImage.resized,
  compressed: compressedImage.compressed,
});

export function DailyPhotoPanel({ calendarId, writeToken, selectedDate, photos, onPhotosChange }: DailyPhotoPanelProps) {
  const [memo, setMemo] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | undefined>();
  const [imageMeta, setImageMeta] = useState<EventImageMeta | undefined>();
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const selectedPhotos = photos.filter((photo) => photo.date === selectedDate);
  const canCancel = Boolean(imageUrl || imageMeta || memo.trim() || error);

  const reset = () => {
    setMemo('');
    setImageUrl('');
    setImageBlob(undefined);
    setImageMeta(undefined);
    setError('');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    setError('');
    setImageUrl('');
    setImageBlob(undefined);
    setImageMeta(undefined);

    try {
      const compressedImage = await compressImageFile(file);
      setImageUrl(compressedImage.dataUrl);
      setImageBlob(compressedImage.blob);
      setImageMeta(toImageMeta(compressedImage));
    } catch (photoError) {
      if (photoError instanceof ImageCompressionSizeError) {
        setImageMeta(toImageMeta(photoError.compressedImage));
      }
      setError(photoError instanceof Error ? photoError.message : '画像の読み込みに失敗しました。');
    } finally {
      setIsCompressing(false);
      event.target.value = '';
    }
  };

  const handleAddPhoto = async () => {
    if (isUploading || (!imageUrl && !memo.trim())) return;

    const now = new Date().toISOString();
    const photoId = createId();
    let savedImageUrl = imageUrl;
    let imageKey: string | undefined;
    setError('');

    if (shouldUseRemoteApi() && imageBlob) {
      if (!writeToken.trim()) {
        setError('設定で書き込みトークンを入力してください。');
        return;
      }

      try {
        setIsUploading(true);
        const uploadedImage = await uploadDailyPhoto({
          calendarId,
          date: selectedDate,
          photoId,
          file: imageBlob,
          writeToken,
        });

        savedImageUrl = uploadedImage.publicUrl;
        imageKey = uploadedImage.key;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : '画像アップロードに失敗しました。');
        return;
      } finally {
        setIsUploading(false);
      }
    }

    onPhotosChange((current) => [
      ...current,
      {
        id: photoId,
        date: selectedDate,
        imageUrl: savedImageUrl,
        imageKey,
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
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={isCompressing || isUploading} />
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="写真メモ"
          disabled={isUploading}
        />
        {isCompressing && <p className="helper-text">画像を軽量化しています...</p>}
        {isUploading && <p className="helper-text">画像をアップロードしています...</p>}
        {error && <p className="error-text">{error}</p>}
        {imageMeta && (
          <figure className="image-preview-card">
            {imageUrl && <img src={imageUrl} alt="追加予定の日別写真" />}
            <figcaption>
              {imageMeta.fileName} / {imageMeta.width}x{imageMeta.height} / 圧縮前 {formatBytes(imageMeta.originalSize)} → 圧縮後{' '}
              {formatBytes(imageMeta.compressedSize)}
              {!imageMeta.compressed && ' / 画質圧縮なし'}
              {imageMeta.resized && ' / 比率維持リサイズ'}
            </figcaption>
          </figure>
        )}
        <div className="form-actions">
          {canCancel && (
            <button type="button" className="ghost-button" onClick={reset} disabled={isUploading}>
              キャンセル
            </button>
          )}
          <button type="button" className="primary-button" onClick={handleAddPhoto} disabled={isCompressing || isUploading}>
            {isUploading ? 'アップロード中' : '写真を追加'}
          </button>
        </div>
      </div>

      {selectedPhotos.length > 0 && (
        <div className="daily-photo-grid">
          {selectedPhotos.map((photo) => (
            <article className="daily-photo-card" key={photo.id}>
              {photo.imageUrl && <img src={withReadToken(photo.imageUrl, writeToken)} alt={photo.memo || `${photo.date} の写真`} />}
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

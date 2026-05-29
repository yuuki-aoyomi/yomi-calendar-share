export type StoredObject = {
  key: string;
  contentType: string;
  size: number;
  updatedAt: string;
};

export type UploadObjectInput = {
  key: string;
  body: Blob | ArrayBuffer;
  contentType: string;
};

export type StorageService = {
  uploadObject(input: UploadObjectInput): Promise<StoredObject>;
  getObject(key: string): Promise<Blob>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  listObjects(prefix: string): Promise<StoredObject[]>;
};

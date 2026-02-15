export type DocumentRole = 'source' | 'template' | 'model';
export type DocumentStatus = 'uploaded' | 'processing' | 'extracted' | 'failed' | 'deleted';
export type DocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'xls' | 'png' | 'jpg' | 'tiff';

export interface DocumentFile {
  _id: string;
  projectId: string;
  userId: string;
  originalFilename: string;
  role: DocumentRole;
  format: DocumentFormat;
  sizeBytes: number;
  sha256: string;
  r2Key: string;
  status: DocumentStatus;
  mimeType: string;
  pageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadDocumentInput {
  projectId: string;
  role: DocumentRole;
  file: File;
}

export const ACCEPTED_FORMATS: DocumentFormat[] = ['pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'tiff'];
export const MAX_FILE_SIZE_MB = 25;
export const MAX_SOURCE_FILES = 10;
export const MAX_MODEL_FILES = 2;

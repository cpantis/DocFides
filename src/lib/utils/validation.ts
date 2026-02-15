import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Project name too long'),
});

export const uploadDocumentSchema = z.object({
  projectId: z.string().min(1),
  role: z.enum(['source', 'template', 'model']),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
  'image/tiff',
] as const;

export const FILE_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/tiff': 'tiff',
};

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
export const MAX_SOURCE_FILES = 10;
export const MAX_MODEL_FILES = 2;

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_BYTES;
}

export function validateMimeType(mimeType: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

// Romanian-specific validations
export function validateCUI(cui: string): boolean {
  const cleaned = cui.replace(/^RO/i, '').trim();
  if (!/^\d{2,10}$/.test(cleaned)) return false;
  const weights = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  const digits = cleaned.split('').map(Number);
  const checkDigit = digits.pop()!;
  while (digits.length < 9) digits.unshift(0);
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i]!, 0);
  const expected = (sum * 10) % 11 === 10 ? 0 : (sum * 10) % 11;
  return checkDigit === expected;
}

export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return /^RO\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(cleaned);
}

export function validateRomanianDate(date: string): boolean {
  const match = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;
  const [, day, month, year] = match;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.getDate() === Number(day) && d.getMonth() === Number(month) - 1;
}

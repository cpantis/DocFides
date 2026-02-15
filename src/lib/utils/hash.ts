import { createHash } from 'crypto';

export async function hashFile(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

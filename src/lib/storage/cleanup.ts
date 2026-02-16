import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getR2Client, getBucketName } from './client';

export async function deleteFile(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
}

export async function deleteProjectFiles(
  userId: string,
  projectId: string
): Promise<number> {
  const client = getR2Client();
  const prefix = `${userId}/${projectId}/`;

  const listResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucketName(),
      Prefix: prefix,
    })
  );

  const objects = listResponse.Contents ?? [];
  let deleted = 0;

  for (const obj of objects) {
    if (obj.Key) {
      await deleteFile(obj.Key);
      deleted++;
    }
  }

  return deleted;
}

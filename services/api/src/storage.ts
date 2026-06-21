import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

// Object storage for hidden test data (FR-4, high-level arch §8).
export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});

/** Implemented: object-storage read for test-case bundles (was a TODO). */
export async function readTestBundle(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const body = res.Body as AsyncIterable<Uint8Array> | undefined;
  if (!body) throw new Error(`empty object: ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

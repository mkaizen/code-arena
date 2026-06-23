import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as tar from "tar";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

export interface TestCase {
  input: string;
  expected: string;
}

/**
 * Implemented (was TODO): pull a problem's hidden test bundle from object storage.
 * Bundle layout: NN.in / NN.out pairs inside a tar archive at `key`.
 */
export async function loadTests(key: string): Promise<TestCase[]> {
  const res = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  const body = res.Body as AsyncIterable<Uint8Array>;

  const files = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    const parser = new tar.Parser();
    parser.on("entry", (entry: any) => {
      let buf = "";
      entry.on("data", (c: Buffer) => (buf += c.toString("utf8")));
      entry.on("end", () => { files.set(entry.path, buf); });
    });
    parser.on("end", () => resolve());
    parser.on("error", reject);
    (async () => { for await (const chunk of body) parser.write(chunk); parser.end(); })().catch(reject);
  });

  const cases: TestCase[] = [];
  const ins = [...files.keys()].filter((k) => k.endsWith(".in")).sort();
  for (const inKey of ins) {
    const base = inKey.slice(0, -3);
    const expected = files.get(`${base}.out`);
    if (expected !== undefined) cases.push({ input: files.get(inKey)!, expected });
  }
  return cases;
}

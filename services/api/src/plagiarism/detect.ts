import type { PlagiarismPair } from "@arena/shared";
import { fingerprint, similarity, type FingerprintOpts } from "./fingerprint.js";

/** One submission to compare — the caller picks a single representative per user. */
export interface CodeDoc {
  submissionId: string;
  userId: string;
  handle: string;
  source: string;
}

export interface DetectOpts extends FingerprintOpts {
  /** Minimum containment score (0..1) for a pair to be reported. Default 0.8. */
  threshold?: number;
  /**
   * Ignore submissions whose fingerprint set is smaller than this — trivially
   * short solutions (one-liners) collide by chance and aren't a useful signal.
   * Default 5.
   */
  minFingerprints?: number;
}

/**
 * Compare every pair of distinct-user documents and return those whose
 * structural similarity meets the threshold, most similar first. Pure over its
 * inputs so it is unit-testable without a database.
 */
export function findSimilarPairs(docs: CodeDoc[], opts: DetectOpts = {}): PlagiarismPair[] {
  const { threshold = 0.8, minFingerprints = 5, k, w } = opts;

  const prints = docs.map((d) => ({ doc: d, fp: fingerprint(d.source, { k, w }) }));
  const pairs: PlagiarismPair[] = [];

  for (let i = 0; i < prints.length; i++) {
    for (let j = i + 1; j < prints.length; j++) {
      const A = prints[i];
      const B = prints[j];
      if (A.doc.userId === B.doc.userId) continue; // never flag a user against themselves
      if (A.fp.size < minFingerprints || B.fp.size < minFingerprints) continue;

      const { score, shared } = similarity(A.fp, B.fp);
      if (score < threshold) continue;

      pairs.push({
        a: { userId: A.doc.userId, handle: A.doc.handle, submissionId: A.doc.submissionId },
        b: { userId: B.doc.userId, handle: B.doc.handle, submissionId: B.doc.submissionId },
        similarity: Math.round(score * 1000) / 1000,
        sharedFingerprints: shared,
      });
    }
  }

  pairs.sort((x, y) => y.similarity - x.similarity || y.sharedFingerprints - x.sharedFingerprints);
  return pairs;
}

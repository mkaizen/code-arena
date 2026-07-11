/**
 * Pure mapping between a problem's live definition and an immutable
 * ProblemVersion snapshot (FR-7). Kept I/O-free so the field mapping — the
 * thing most likely to silently drop a column when the schema grows — is
 * unit-tested independently of Prisma.
 */

export interface VersionSample {
  input: string;
  output: string;
}

/** The subset of a live Problem that is versioned. */
export interface VersionableProblem {
  version: number;
  title: string;
  statement: string;
  editorial: string | null;
  difficulty: string;
  ratingValue: number;
  tags: string[];
  timeMs: number;
  memoryKb: number;
  testCount: number;
  samples: VersionSample[];
}

/** A stored snapshot as read back from the database. */
export interface StoredVersion extends VersionableProblem {
  // `samples` is persisted as JSON, so it comes back loosely typed.
  samples: VersionSample[];
}

/**
 * Build the row that snapshots a problem's current state as `problem.version`.
 * `editorHandle` is whoever performed the edit that supersedes this version.
 */
export function snapshotData(problem: VersionableProblem, editorHandle: string | null) {
  return {
    version: problem.version,
    title: problem.title,
    statement: problem.statement,
    editorial: problem.editorial,
    difficulty: problem.difficulty,
    ratingValue: problem.ratingValue,
    tags: problem.tags,
    timeMs: problem.timeMs,
    memoryKb: problem.memoryKb,
    samples: problem.samples,
    testCount: problem.testCount,
    editorHandle,
  };
}

/**
 * Fields to write back onto the live Problem when restoring `snapshot`. The
 * caller bumps `version` separately (a restore is itself a new version) and
 * re-creates the samples rows. Hidden judge tests are not restored — they live
 * in object storage and are replaced in place — so `testCount` is intentionally
 * left off the live update.
 */
export function restoreData(snapshot: StoredVersion) {
  return {
    title: snapshot.title,
    statement: snapshot.statement,
    editorial: snapshot.editorial,
    difficulty: snapshot.difficulty,
    ratingValue: snapshot.ratingValue,
    tags: snapshot.tags,
    timeMs: snapshot.timeMs,
    memoryKb: snapshot.memoryKb,
  };
}

/** Normalize a JSON `samples` value from the DB into typed sample objects. */
export function parseSamples(raw: unknown): VersionSample[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ input: String(s.input ?? ""), output: String(s.output ?? "") }));
}

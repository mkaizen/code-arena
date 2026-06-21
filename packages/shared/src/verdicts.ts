/** FR-15: the standard verdict set returned by the judge. */
export const Verdict = {
  AC: "ACCEPTED",
  WA: "WRONG_ANSWER",
  TLE: "TIME_LIMIT_EXCEEDED",
  MLE: "MEMORY_LIMIT_EXCEEDED",
  RE: "RUNTIME_ERROR",
  CE: "COMPILATION_ERROR",
  IE: "INTERNAL_ERROR",
  PENDING: "PENDING",
  JUDGING: "JUDGING",
} as const;

export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export interface CaseResult {
  index: number;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
}

export interface JudgeResult {
  verdict: Verdict;
  /** 1-based index of the first failing case, when applicable (FR-15). */
  failedCase?: number;
  maxTimeMs: number;
  maxMemoryKb: number;
  compileLog?: string;
  cases: CaseResult[];
}

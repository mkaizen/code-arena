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
  /** Total number of test cases run, for "failed on test X of Y" context. */
  totalCases?: number;
  maxTimeMs: number;
  maxMemoryKb: number;
  /** Compiler stderr, present on COMPILATION_ERROR. */
  compileLog?: string;
  /** Program stderr, present on RUNTIME_ERROR. */
  runtimeLog?: string;
  /** The failing test's own stdout (your prints), truncated. Hidden test
   *  input/expected are never revealed — only your program's own output. */
  failedStdout?: string;
  /** The failing test's stderr (debug prints), truncated. */
  failedStderr?: string;
  /** Human-readable one-line explanation of the verdict. */
  message?: string;
  cases: CaseResult[];
}

/** One case of a Run (test against samples / custom input — never hidden tests). */
export interface RunCaseResult {
  label: string;
  input: string;
  /** Expected output for a sample case; null for custom input. */
  expected: string | null;
  stdout: string;
  stderr: string;
  timeMs: number;
  /** PASS/FAIL for samples; RAN for custom input; or a failure verdict. */
  status: "PASS" | "FAIL" | "RAN" | "COMPILATION_ERROR" | "RUNTIME_ERROR" | "TIME_LIMIT_EXCEEDED" | "MEMORY_LIMIT_EXCEEDED";
}

/** Result of a Run — full I/O detail, since it only touches public samples. */
export interface RunResult {
  runId: string;
  compileLog?: string;
  cases: RunCaseResult[];
}

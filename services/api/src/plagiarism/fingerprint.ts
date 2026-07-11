/**
 * Structural code fingerprinting for plagiarism/duplicate detection (NFR-4).
 *
 * The pipeline is the classic MOSS approach: normalize the source into a token
 * stream that is insensitive to formatting and identifier renaming, hash every
 * k-gram of that stream, then *winnow* the hashes to a compact, position-robust
 * fingerprint set. Two submissions that share long structural passages share
 * many fingerprints regardless of whitespace, comments, or variable names.
 *
 * Everything here is pure and I/O-free so it can be unit-tested directly.
 */

// Union of keywords across the languages we judge (C/C++, Java, JS/TS, Go,
// Rust, Python). Keeping keywords literal while collapsing user identifiers is
// what makes the fingerprint survive a rename-everything obfuscation: the
// control-flow skeleton still matches. A keyword of one language appearing as an
// identifier in another just stays literal — negligible effect on the signal.
const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break",
  "continue", "return", "goto", "try", "catch", "finally", "throw", "throws",
  "new", "delete", "class", "struct", "enum", "union", "interface", "trait",
  "impl", "def", "lambda", "func", "fn", "function", "void", "int", "long",
  "short", "char", "bool", "boolean", "float", "double", "string", "str",
  "auto", "const", "let", "var", "static", "public", "private", "protected",
  "final", "abstract", "virtual", "override", "template", "typename", "using",
  "namespace", "import", "from", "package", "include", "print", "println",
  "printf", "cout", "cin", "scanf", "range", "in", "is", "and", "or", "not",
  "true", "false", "null", "none", "nil", "self", "this", "super", "yield",
  "async", "await", "match", "with", "as", "pass", "elif", "unsigned", "size_t",
  "vector", "map", "set", "pair", "std", "mut", "pub", "type",
]);

/**
 * Normalize source into a comparable token stream. Comments and string/char
 * literals are erased (contents can't identify structure), user identifiers and
 * numbers collapse to placeholders, keywords and punctuation are kept.
 */
export function tokenize(source: string): string[] {
  let s = source;
  // Order matters: block comments, then strings (so a `//` or `#` inside a
  // string is gone before line-comment stripping), then line comments.
  s = s.replace(/\/\*[\s\S]*?\*\//g, " "); // /* ... */
  s = s.replace(/"(?:\\.|[^"\\\n])*"/g, " S "); // "..."
  s = s.replace(/'(?:\\.|[^'\\\n])*'/g, " S "); // '...'
  s = s.replace(/`(?:\\.|[^`\\])*`/g, " S "); // `...` templates
  s = s.replace(/\/\/[^\n]*/g, " "); // // ...
  s = s.replace(/#[^\n]*/g, " "); // # ... (Python/shell)

  const tokens: string[] = [];
  // Words, numbers, or single punctuation characters.
  const re = /[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[^\sA-Za-z0-9_]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const t = m[0];
    if (/^[A-Za-z_]/.test(t)) {
      const lower = t.toLowerCase();
      tokens.push(lower === "s" ? "S" : KEYWORDS.has(lower) ? lower : "W");
    } else if (/^[0-9]/.test(t)) {
      tokens.push("N");
    } else {
      tokens.push(t);
    }
  }
  return tokens;
}

/** Deterministic 32-bit rolling-ish hash of a k-gram (djb2 over the joined tokens). */
function hashKgram(tokens: string[], start: number, k: number): number {
  let h = 5381;
  for (let i = start; i < start + k; i++) {
    const t = tokens[i];
    for (let j = 0; j < t.length; j++) {
      h = (((h << 5) + h) ^ t.charCodeAt(j)) | 0; // h*33 ^ c
    }
    h = (((h << 5) + h) ^ 0x2c) | 0; // separator so ["ab","c"] != ["a","bc"]
  }
  return h >>> 0;
}

/** Hashes of every contiguous k-gram of the token stream. */
export function kgramHashes(tokens: string[], k: number): number[] {
  if (tokens.length < k) return [];
  const out: number[] = [];
  for (let i = 0; i + k <= tokens.length; i++) out.push(hashKgram(tokens, i, k));
  return out;
}

/**
 * Winnowing: slide a window of `w` hashes and keep the minimum in each window
 * (rightmost on ties). This bounds the fingerprint density while guaranteeing
 * that any shared run of at least (k + w - 1) tokens yields a shared fingerprint.
 */
export function winnow(hashes: number[], w: number): Set<number> {
  const fps = new Set<number>();
  if (hashes.length === 0) return fps;
  if (hashes.length < w) {
    // Short document: fall back to keeping its minimum hash so it still has one.
    fps.add(Math.min(...hashes));
    return fps;
  }
  let prevMinPos = -1;
  for (let i = 0; i + w <= hashes.length; i++) {
    let minPos = i;
    for (let j = i + 1; j < i + w; j++) {
      if (hashes[j] <= hashes[minPos]) minPos = j; // <= => rightmost min
    }
    if (minPos !== prevMinPos) {
      fps.add(hashes[minPos]);
      prevMinPos = minPos;
    }
  }
  return fps;
}

export interface FingerprintOpts {
  /** k-gram length in tokens. */
  k?: number;
  /** winnowing window in hashes. */
  w?: number;
}

/** Full pipeline: source → structural fingerprint set. */
export function fingerprint(source: string, opts: FingerprintOpts = {}): Set<number> {
  const { k = 5, w = 4 } = opts;
  return winnow(kgramHashes(tokenize(source), k), w);
}

/**
 * Containment similarity: shared fingerprints over the size of the *smaller*
 * set, 0..1. Containment (rather than Jaccard) flags a copy even when the thief
 * pads their file with extra dead code. Empty inputs score 0.
 */
export function similarity(a: Set<number>, b: Set<number>): { score: number; shared: number } {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const fp of small) if (big.has(fp)) shared++;
  return { score: shared / small.size, shared };
}

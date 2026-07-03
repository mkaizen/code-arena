/**
 * Canonicalize program output for comparison against expected output:
 * normalize CRLF → LF, strip trailing whitespace on each line, and trim
 * trailing blank lines. Matches the leniency most judges apply so a stray
 * trailing newline or space never fails an otherwise-correct answer.
 */
export function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

---
title: "Catching Copied Code: Structural Plagiarism Detection with Winnowing"
date: "2026-08-11"
author: "Matthew"
description: "How Code Arena flags copied contest submissions with a MOSS-style pipeline — tokenizing away formatting and variable names, hashing k-grams, winnowing to a compact fingerprint, and scoring with containment so padding doesn't hide a copy."
---

# Catching Copied Code: Structural Plagiarism Detection with Winnowing

Every competitive-programming platform eventually has to answer an uncomfortable question: *did these two people write the same solution independently, or did one copy the other?* On a rated contest, the answer moves ratings and standings, so it matters. But it's also genuinely hard, because a copy is almost never a byte-for-byte duplicate. The person copying renames every variable, reformats the braces, strips the comments, maybe pads the file with a few dead functions to throw off a naive diff.

A plain text comparison is useless against any of that. What we actually want to detect is **structural** similarity — the shape of the control flow and the sequence of operations — regardless of the cosmetic surface. That's exactly the problem [MOSS](https://theory.stanford.edu/~aiken/moss/) solved for university courses, and Code Arena's detector (NFR-4) is built on the same three ideas: normalize, fingerprint, winnow. Here's how it works, and why each step is shaped the way it is.

## The threat model: what a copy actually looks like

Before writing a line of detection code, it helps to be precise about what we're defending against. Ranked from lazy to determined:

1. **Copy-paste verbatim.** Trivial to catch, and nobody does it.
2. **Reformat.** Change whitespace, brace style, blank lines.
3. **Rename.** Rename every identifier — `n` → `count`, `dp` → `memo`.
4. **Recomment.** Strip or rewrite all the comments.
5. **Pad.** Add unused helper functions or dead branches to change the file's length and shape.

A good detector has to be blind to 1–4 entirely, and resistant to 5. The design goal is a signal that depends only on the *structural skeleton* of the program — the order of keywords, operators, and the general flow — and ignores everything a copier can trivially change.

## Step 1: Tokenize away everything cosmetic

The first stage turns raw source into a normalized token stream where all the noise has been erased. Comments and string/char literals go first — their *contents* can't identify structure, and leaving them in would let a shared copyright header or a common error message create false matches:

```typescript
s = s.replace(/\/\*[\s\S]*?\*\//g, " ");        // /* ... */
s = s.replace(/"(?:\\.|[^"\\\n])*"/g, " S ");    // "..."
s = s.replace(/'(?:\\.|[^'\\\n])*'/g, " S ");    // '...'
s = s.replace(/`(?:\\.|[^`\\])*`/g, " S ");      // `...` templates
s = s.replace(/\/\/[^\n]*/g, " ");               // // ...
s = s.replace(/#[^\n]*/g, " ");                  // # ... (Python/shell)
```

Order matters here in a way that's easy to get wrong. Block comments are stripped first, then string literals, *then* line comments — so a `//` or `#` sitting inside a string literal is already gone before the line-comment pass runs and mistakes it for the start of a comment. Every string collapses to a single placeholder token `S`, so `"hello"` and `"goodbye"` are indistinguishable; only the *fact* that a string is there survives.

Then the stream is walked token by token, and each token is mapped to one of a small alphabet:

```typescript
const re = /[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[^\sA-Za-z0-9_]/g;
// ...
if (/^[A-Za-z_]/.test(t)) {
  const lower = t.toLowerCase();
  tokens.push(lower === "s" ? "S" : KEYWORDS.has(lower) ? lower : "W");
} else if (/^[0-9]/.test(t)) {
  tokens.push("N");
} else {
  tokens.push(t);          // punctuation kept literally
}
```

The rule is the whole trick:

- **Keywords stay literal** — `if`, `for`, `return`, `while`, `class`, `func`…
- **Every user identifier collapses to `W`** — variable names, function names, type names, all of it.
- **Every number collapses to `N`**, every string to `S`.
- **Punctuation is kept as-is** — braces, parens, operators, semicolons.

So `for (int i = 0; i < n; i++)` and `for (long idx = 0; idx < total; idx++)` both normalize to the *identical* stream `for ( int W = N ; W < W ; W ++ )`. The rename attack is defeated at the front door: user identifiers never enter the signal in the first place, but the control-flow keywords and the operator skeleton remain. That's the part a copier can't change without changing what the program actually does.

### Why keep language keywords across all languages?

The keyword set is a union across every language we judge — C/C++, Java, JS/TS, Go, Rust, Python. You might worry about collisions: `map` is a keyword-ish identifier in C++ (`std::map`) but an ordinary function in JS. In practice it doesn't matter. If a word appears as a keyword in *some* language, we keep it literal everywhere; if it happens to be a user identifier in another language, keeping it literal instead of collapsing it to `W` has a negligible effect on the signal — one token in a stream of hundreds. Two genuinely different programs don't suddenly match because they both used the word `set`.

## Step 2: Hash k-grams so local structure is the unit of comparison

A normalized token stream is comparable, but comparing whole streams is brittle — insert one token near the top and everything after it shifts. So instead of comparing streams, we compare *every contiguous window of k tokens* (a k-gram). Two files that share a long structural passage will share a long run of identical k-grams even if the surrounding code is completely different.

Each k-gram is hashed to a 32-bit integer with a small djb2-style hash:

```typescript
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
```

The separator mixed in between tokens is a subtle but real detail: without it, the k-grams `["ab", "c"]` and `["a", "bc"]` would hash to the same value, because the character stream fed into the hash would be identical. Injecting a fixed separator byte between tokens keeps token boundaries meaningful. We use `k = 5` by default — long enough that a shared 5-token run is unlikely to be coincidental, short enough to still catch a copied inner loop.

## Step 3: Winnow so the fingerprint is compact *and* alignment-proof

If we kept a hash for every k-gram, a 400-token file would produce ~400 fingerprints, and storing/comparing all of them is wasteful. The obvious fix — keep every *n*-th hash — is a trap: it's not robust to insertion. Add one token at the top and every "every 4th" position shifts, so two near-identical files select disjoint samples and appear unrelated.

**Winnowing** solves this. Slide a window of `w` hashes across the sequence and keep the *minimum* hash in each window:

```typescript
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
```

Because selection is based on the *value* of the hash, not its absolute position, the same local minimum gets selected in both files regardless of what came before it. This gives winnowing its guarantee: **any shared run of at least `k + w - 1` tokens is guaranteed to contribute at least one shared fingerprint.** With `k = 5, w = 4` that's an 8-token match floor — you can't hide a copied passage longer than that, and the fingerprint set stays a fraction of the size of the full hash list. (The `<=` comparison keeps the *rightmost* minimum on ties, which is just a consistent tie-break so both files agree.)

There's a small edge case worth calling out: a document shorter than one window still needs *a* fingerprint, so we fall back to keeping its single minimum hash. That keeps even tiny files representable — though, as we'll see, tiny files are deliberately excluded from scoring anyway.

## Step 4: Score with containment, not Jaccard

Now every submission is a `Set<number>` of fingerprints. To compare two, the intuitive metric is Jaccard similarity — intersection over union. But Jaccard has a hole that maps *exactly* onto attack #5, padding. If a copier takes a solution and appends 200 lines of dead code, the union balloons while the intersection stays fixed, and the Jaccard score collapses — the copy hides behind its own padding.

So we score with **containment** instead: shared fingerprints over the size of the *smaller* set.

```typescript
export function similarity(a: Set<number>, b: Set<number>): { score: number; shared: number } {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const fp of small) if (big.has(fp)) shared++;
  return { score: shared / small.size, shared };
}
```

Containment asks a sharper question: *how much of the smaller submission appears inside the larger one?* If A is entirely contained in B — B being A plus a heap of padding — containment is ~1.0 no matter how much padding B carries. Padding inflates the *big* set, but we're dividing by the *small* one. The attack that defeats Jaccard is exactly the attack containment is built to catch.

## Turning a score into a review queue, not a verdict

The pairwise detector compares every pair of distinct-user submissions and keeps the ones above a threshold, most similar first:

```typescript
for (let i = 0; i < prints.length; i++) {
  for (let j = i + 1; j < prints.length; j++) {
    const A = prints[i], B = prints[j];
    if (A.doc.userId === B.doc.userId) continue;         // never self-compare
    if (A.fp.size < minFingerprints || B.fp.size < minFingerprints) continue;
    const { score, shared } = similarity(A.fp, B.fp);
    if (score < threshold) continue;
    pairs.push({ /* a, b, similarity, sharedFingerprints */ });
  }
}
pairs.sort((x, y) => y.similarity - x.similarity || y.sharedFingerprints - x.sharedFingerprints);
```

Two guardrails keep the noise down. Same-user pairs are skipped — a user resubmitting their own solution isn't plagiarism. And submissions with fewer than `minFingerprints` (default 5) are ignored entirely: a two-line solution to an easy problem has only one reasonable shape, so a dozen people will "match" by sheer necessity. Flagging those would bury the real signal in false positives. The default threshold is a strict `0.8` containment — we'd rather miss a borderline case than accuse an innocent competitor.

The most important design decision isn't in the algorithm at all: **this is a signal, not a verdict.** The API endpoint (`GET /admin/contests/:id/plagiarism`, admin/setter only) picks each user's latest submission per problem, runs the detector, and returns the flagged pairs to a "Similarity Scan" admin page — colour-graded by confidence, with links to each user. Nothing is actioned automatically. No rating is docked, no account flagged, no submission rejected by a machine. A human looks at the two solutions side by side and decides. Structural similarity is strong evidence, but "these two files have the same shape" and "this person cheated" are different claims, and only a person should bridge that gap.

## Why it's all pure functions

One last thing worth noting: every stage — `tokenize`, `kgramHashes`, `winnow`, `fingerprint`, `similarity`, `findSimilarPairs` — is a pure, I/O-free function. No database, no filesystem, no network. That's not incidental. Plagiarism detection is precisely the kind of code where a silent off-by-one in the winnowing window or a botched hash separator produces output that *looks* plausible but is quietly wrong — and wrong here means either missing real copies or accusing innocent people. Making the whole pipeline pure means it's directly unit-testable, and it ships with 13 tests pinning down tokenizer normalization (the same code in different clothes must produce identical streams), the winnowing guarantee, and the detector's thresholds, dedup, and sort order.

## Takeaways

- **Detect structure, not text.** Normalize source to a token stream where identifiers, numbers, strings, comments, and formatting are erased but keywords and operators survive. The rename/reformat/recomment attacks die at this stage.
- **Compare local windows, not whole files.** k-grams make the signal robust to insertions and rearrangement — a shared passage matches even when everything around it differs.
- **Winnow for compactness with a guarantee.** Position-independent minimum selection keeps the fingerprint small while guaranteeing any shared run past a known length is caught.
- **Choose the metric that matches the attack.** Containment over the smaller set defeats the padding trick that quietly defeats Jaccard.
- **Ship a signal, not a sentence.** Surface ranked pairs to a human reviewer. The algorithm finds suspicious shapes; only a person should decide what they mean.

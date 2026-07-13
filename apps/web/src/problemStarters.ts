import type { Language } from "@arena/shared";
import { STARTERS } from "./starters.js";

/**
 * Per-problem starter code.
 *
 * The generic {@link STARTERS} templates read stdin the same way for every
 * problem, which is confusing on a page whose statement talks about a specific
 * input (e.g. "read an integer n"). Here we describe each problem's input as a
 * small ordered list of reads and generate a starter, in every language, that
 * declares exactly those inputs with the names used in the statement and leaves
 * a TODO for the solution. Anything without a spec falls back to the generic
 * template.
 */

type RowKind = "ints" | "str" | "csvInts";

type IoRead =
  | { kind: "int"; name: string }
  | { kind: "ints"; names: string[] }
  | { kind: "str"; name: string }
  | { kind: "intArr"; name: string }
  | { kind: "strArr"; name: string }
  | { kind: "rows"; name: string; count: string; row: RowKind };

interface Spec {
  reads: IoRead[];
  hint: string;
}

// Compact constructors for the spec table below.
const I = (name: string): IoRead => ({ kind: "int", name });
const Is = (...names: string[]): IoRead => ({ kind: "ints", names });
const S = (name: string): IoRead => ({ kind: "str", name });
const A = (name: string): IoRead => ({ kind: "intArr", name });
const SA = (name: string): IoRead => ({ kind: "strArr", name });
const R = (name: string, count: string, row: RowKind): IoRead => ({ kind: "rows", name, count, row });

// ── Per-language code generators ─────────────────────────────────────────────
// Each returns the body lines (already indented for that language) that read
// the inputs. The wrappers below splice them into a compiling, runnable
// skeleton that prints nothing yet — a fresh submission is a no-op, never a
// crash or a compile error.

function pyBody(reads: IoRead[]): string[] {
  const out: string[] = [];
  for (const r of reads) {
    switch (r.kind) {
      case "int":
        out.push(`${r.name} = int(sys.stdin.readline())`);
        break;
      case "ints":
        out.push(`${r.names.join(", ")} = map(int, sys.stdin.readline().split())`);
        break;
      case "str":
        out.push(`${r.name} = sys.stdin.readline().rstrip("\\n")`);
        break;
      case "intArr":
        out.push(`${r.name} = list(map(int, sys.stdin.readline().split()))`);
        break;
      case "strArr":
        out.push(`${r.name} = sys.stdin.readline().split()`);
        break;
      case "rows":
        out.push(`${r.name} = []`);
        out.push(`for _ in range(${r.count}):`);
        if (r.row === "ints") out.push(`    ${r.name}.append(list(map(int, sys.stdin.readline().split())))`);
        else if (r.row === "csvInts") out.push(`    ${r.name}.append([int(x) for x in sys.stdin.readline().split(",")])`);
        else out.push(`    ${r.name}.append(sys.stdin.readline().rstrip("\\n"))`);
        break;
    }
  }
  return out;
}

function jsBody(reads: IoRead[]): string[] {
  const out: string[] = [];
  for (const r of reads) {
    switch (r.kind) {
      case "int":
        out.push(`const ${r.name} = Number(next().trim());`);
        break;
      case "ints":
        out.push(`const [${r.names.join(", ")}] = next().trim().split(/\\s+/).map(Number);`);
        break;
      case "str":
        out.push(`const ${r.name} = next().replace(/\\r$/, "");`);
        break;
      case "intArr":
        out.push(`const ${r.name} = next().trim().split(/\\s+/).filter(Boolean).map(Number);`);
        break;
      case "strArr":
        out.push(`const ${r.name} = next().trim().split(/\\s+/).filter(Boolean);`);
        break;
      case "rows":
        out.push(`const ${r.name} = [];`);
        out.push(`for (let r = 0; r < ${r.count}; r++) {`);
        if (r.row === "ints") out.push(`  ${r.name}.push(next().trim().split(/\\s+/).filter(Boolean).map(Number));`);
        else if (r.row === "csvInts") out.push(`  ${r.name}.push(next().split(",").map((x) => Number(x.trim())));`);
        else out.push(`  ${r.name}.push(next().replace(/\\r$/, ""));`);
        out.push(`}`);
        break;
    }
  }
  return out;
}

function cppBody(reads: IoRead[]): string[] {
  const out: string[] = [];
  const push = (s: string) => out.push("    " + s);
  for (const r of reads) {
    switch (r.kind) {
      case "int":
        push(`long long ${r.name};`);
        push(`getline(cin, line); { stringstream ss(line); ss >> ${r.name}; }`);
        break;
      case "ints":
        push(`long long ${r.names.join(", ")};`);
        push(`getline(cin, line); { stringstream ss(line); ss >> ${r.names.join(" >> ")}; }`);
        break;
      case "str":
        push(`string ${r.name};`);
        push(`getline(cin, ${r.name});`);
        break;
      case "intArr":
        push(`vector<long long> ${r.name};`);
        push(`getline(cin, line); { stringstream ss(line); long long x; while (ss >> x) ${r.name}.push_back(x); }`);
        break;
      case "strArr":
        push(`vector<string> ${r.name};`);
        push(`getline(cin, line); { stringstream ss(line); string t; while (ss >> t) ${r.name}.push_back(t); }`);
        break;
      case "rows":
        if (r.row === "str") {
          push(`vector<string> ${r.name};`);
          push(`for (long long i = 0; i < ${r.count}; i++) { string s; getline(cin, s); ${r.name}.push_back(s); }`);
        } else {
          push(`vector<vector<long long>> ${r.name};`);
          push(`for (long long i = 0; i < ${r.count}; i++) {`);
          push(`    getline(cin, line);`);
          if (r.row === "csvInts") push(`    for (char &c : line) if (c == ',') c = ' ';`);
          push(`    stringstream ss(line); vector<long long> row; long long x;`);
          push(`    while (ss >> x) row.push_back(x);`);
          push(`    ${r.name}.push_back(row);`);
          push(`}`);
        }
        break;
    }
  }
  return out;
}

function javaBody(reads: IoRead[]): string[] {
  const out: string[] = [];
  const push = (s: string) => out.push("        " + s);
  let tk = 0;
  for (const r of reads) {
    switch (r.kind) {
      case "int":
        push(`long ${r.name} = Long.parseLong(br.readLine().trim());`);
        break;
      case "ints": {
        const st = `st${tk++}`;
        push(`StringTokenizer ${st} = new StringTokenizer(br.readLine());`);
        for (const n of r.names) push(`long ${n} = Long.parseLong(${st}.nextToken());`);
        break;
      }
      case "str":
        push(`String ${r.name} = br.readLine();`);
        break;
      case "intArr": {
        const st = `st${tk++}`;
        push(`StringTokenizer ${st} = new StringTokenizer(br.readLine());`);
        push(`ArrayList<Long> ${r.name} = new ArrayList<>();`);
        push(`while (${st}.hasMoreTokens()) ${r.name}.add(Long.parseLong(${st}.nextToken()));`);
        break;
      }
      case "strArr": {
        const st = `st${tk++}`;
        push(`StringTokenizer ${st} = new StringTokenizer(br.readLine());`);
        push(`ArrayList<String> ${r.name} = new ArrayList<>();`);
        push(`while (${st}.hasMoreTokens()) ${r.name}.add(${st}.nextToken());`);
        break;
      }
      case "rows":
        if (r.row === "str") {
          push(`String[] ${r.name} = new String[(int) ${r.count}];`);
          push(`for (int i = 0; i < ${r.count}; i++) ${r.name}[i] = br.readLine();`);
        } else {
          push(`long[][] ${r.name} = new long[(int) ${r.count}][];`);
          push(`for (int i = 0; i < ${r.count}; i++) {`);
          const sep = r.row === "csvInts" ? `br.readLine().split(",")` : `br.readLine().trim().split("\\\\s+")`;
          push(`    String[] parts = ${sep};`);
          push(`    long[] row = new long[parts.length];`);
          push(`    for (int j = 0; j < parts.length; j++) row[j] = Long.parseLong(parts[j].trim());`);
          push(`    ${r.name}[i] = row;`);
          push(`}`);
        }
        break;
    }
  }
  return out;
}

function goBody(reads: IoRead[]): { lines: string[]; needStrconv: boolean; discards: string[] } {
  const out: string[] = [];
  const discards: string[] = [];
  let needStrconv = false;
  let fi = 0;
  const push = (s: string) => out.push("\t" + s);
  for (const r of reads) {
    switch (r.kind) {
      case "int":
        needStrconv = true;
        push(`${r.name}, _ := strconv.ParseInt(readLine(), 10, 64)`);
        discards.push(r.name);
        break;
      case "ints": {
        needStrconv = true;
        const f = `f${fi++}`;
        push(`${f} := strings.Fields(readLine())`);
        r.names.forEach((n, k) => push(`${n}, _ := strconv.ParseInt(${f}[${k}], 10, 64)`));
        discards.push(...r.names);
        break;
      }
      case "str":
        push(`${r.name} := readLine()`);
        discards.push(r.name);
        break;
      case "intArr": {
        needStrconv = true;
        const f = `f${fi++}`;
        push(`${f} := strings.Fields(readLine())`);
        push(`${r.name} := make([]int64, len(${f}))`);
        push(`for i, v := range ${f} { ${r.name}[i], _ = strconv.ParseInt(v, 10, 64) }`);
        discards.push(r.name);
        break;
      }
      case "strArr":
        push(`${r.name} := strings.Fields(readLine())`);
        discards.push(r.name);
        break;
      case "rows":
        if (r.row === "str") {
          push(`${r.name} := make([]string, 0, ${r.count})`);
          push(`for i := int64(0); i < ${r.count}; i++ {`);
          push(`\t${r.name} = append(${r.name}, readLine())`);
          push(`}`);
        } else {
          needStrconv = true;
          const split = r.row === "csvInts" ? `strings.Split(readLine(), ",")` : `strings.Fields(readLine())`;
          push(`${r.name} := make([][]int64, 0, ${r.count})`);
          push(`for i := int64(0); i < ${r.count}; i++ {`);
          push(`\tparts := ${split}`);
          push(`\trow := make([]int64, len(parts))`);
          push(`\tfor j, v := range parts { row[j], _ = strconv.ParseInt(strings.TrimSpace(v), 10, 64) }`);
          push(`\t${r.name} = append(${r.name}, row)`);
          push(`}`);
        }
        discards.push(r.name);
        break;
    }
  }
  return { lines: out, needStrconv, discards };
}

function rustBody(reads: IoRead[]): string[] {
  const out: string[] = [];
  const push = (s: string) => out.push("    " + s);
  for (const r of reads) {
    switch (r.kind) {
      case "int":
        push(`let ${r.name}: i64 = lines.next().unwrap().trim().parse().unwrap();`);
        break;
      case "ints":
        push(`let mut it = lines.next().unwrap().split_whitespace();`);
        for (const n of r.names) push(`let ${n}: i64 = it.next().unwrap().parse().unwrap();`);
        break;
      case "str":
        push(`let ${r.name} = lines.next().unwrap().to_string();`);
        break;
      case "intArr":
        push(`let ${r.name}: Vec<i64> = lines.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();`);
        break;
      case "strArr":
        push(`let ${r.name}: Vec<String> = lines.next().unwrap().split_whitespace().map(|x| x.to_string()).collect();`);
        break;
      case "rows":
        if (r.row === "str") {
          push(`let mut ${r.name}: Vec<String> = Vec::new();`);
          push(`for _ in 0..${r.count} {`);
          push(`    ${r.name}.push(lines.next().unwrap().to_string());`);
          push(`}`);
        } else {
          const iter = r.row === "csvInts"
            ? `split(',').map(|x| x.trim().parse().unwrap())`
            : `split_whitespace().map(|x| x.parse().unwrap())`;
          push(`let mut ${r.name}: Vec<Vec<i64>> = Vec::new();`);
          push(`for _ in 0..${r.count} {`);
          push(`    let row: Vec<i64> = lines.next().unwrap().${iter}.collect();`);
          push(`    ${r.name}.push(row);`);
          push(`}`);
        }
        break;
    }
  }
  return out;
}

function generate(spec: Spec, lang: Language): string {
  const { reads, hint } = spec;
  switch (lang) {
    case "py":
      return `import sys

${pyBody(reads).join("\n")}

# TODO: ${hint}
`;
    case "js":
      return `const lines = require('fs').readFileSync(0, 'utf8').split('\\n');
let idx = 0;
const next = () => lines[idx++];

${jsBody(reads).join("\n")}

// TODO: ${hint}
// Print your answer with console.log(...)
`;
    case "cpp":
      return `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);
    string line;

${cppBody(reads).join("\n")}

    // TODO: ${hint}
    // Write your answer to cout.
    return 0;
}
`;
    case "java":
      return `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();

${javaBody(reads).join("\n")}

        // TODO: ${hint}
        // Append your answer to sb, then it is printed below.
        System.out.print(sb);
    }
}
`;
    case "go": {
      const { lines, needStrconv, discards } = goBody(reads);
      const imports = ["\t\"bufio\"", "\t\"os\"", "\t\"strings\""];
      if (needStrconv) imports.splice(2, 0, "\t\"strconv\"");
      const discardLines = discards.map((d) => `\t_ = ${d}`).join("\n");
      return `package main

import (
${imports.join("\n")}
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	readLine := func() string {
		s, _ := reader.ReadString('\\n')
		return strings.TrimRight(s, "\\r\\n")
	}

${lines.join("\n")}

	// TODO: ${hint}
	// Print your answer with fmt.Println(...) (add "fmt" to the imports).
${discardLines}
}
`;
    }
    case "rs":
      return `use std::io::{self, Read, Write};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let mut lines = input.lines();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());

${rustBody(reads).join("\n")}

    // TODO: ${hint}
    // Write your answer with write!(out, ...) / writeln!(out, ...).
    let _ = out.write_all(b"");
}
`;
  }
}

// ── Per-problem input specs ──────────────────────────────────────────────────
// Keyed by problem slug. Variable names mirror each statement.
const SPECS: Record<string, Spec> = {
  "sum-of-two": { reads: [Is("a", "b")], hint: "print a + b" },
  "hello-name": { reads: [S("name")], hint: "print \"Hello, \" + name + \"!\"" },
  "reverse-string": { reads: [S("s")], hint: "print s reversed" },
  "fizzbuzz": { reads: [I("n")], hint: "for i from 1 to n, print Fizz / Buzz / FizzBuzz / i, one per line" },
  "count-vowels": { reads: [S("s")], hint: "print the number of vowels in s" },
  "sort-array": { reads: [I("n"), A("a")], hint: "print a sorted ascending, space-separated" },
  "gcd-two": { reads: [Is("a", "b")], hint: "print the greatest common divisor of a and b" },
  "is-prime": { reads: [I("n")], hint: "print YES if n is prime, otherwise NO" },
  "max-subarray": { reads: [I("n"), A("a")], hint: "print the maximum contiguous subarray sum" },
  "balanced-brackets": { reads: [S("s")], hint: "print YES if the brackets are balanced, otherwise NO" },
  "edit-distance": { reads: [S("a"), S("b")], hint: "print the edit distance between a and b" },
  "coin-change": { reads: [Is("amount", "k"), A("coins")], hint: "print the fewest coins summing to amount, or -1" },
  "array-sum": { reads: [I("n"), A("a")], hint: "print the sum of a" },
  "max-of-three": { reads: [Is("a", "b", "c")], hint: "print the largest of a, b, c" },
  "even-or-odd": { reads: [I("n")], hint: "print Even if n is even, otherwise Odd" },
  "count-words": { reads: [S("s")], hint: "print the number of whitespace-separated words in s" },
  "digit-sum": { reads: [I("n")], hint: "print the sum of the digits of n" },
  "factorial": { reads: [I("n")], hint: "print n! (n factorial)" },
  "nth-fibonacci": { reads: [I("n")], hint: "print the n-th Fibonacci number" },
  "second-largest": { reads: [I("n"), A("a")], hint: "print the second-largest distinct value in a" },
  "count-primes": { reads: [I("n")], hint: "print how many primes are <= n" },
  "palindrome-check": { reads: [S("s")], hint: "print YES if s is a palindrome, otherwise NO" },
  "anagram-check": { reads: [S("a"), S("b")], hint: "print YES if a and b are anagrams, otherwise NO" },
  "gcd-array": { reads: [I("n"), A("a")], hint: "print the greatest common divisor of all values in a" },
  "longest-common-subsequence": { reads: [S("a"), S("b")], hint: "print the length of the longest common subsequence of a and b" },
  "longest-increasing-subsequence": { reads: [I("n"), A("a")], hint: "print the length of the longest strictly increasing subsequence" },
  "knapsack": { reads: [Is("n", "W"), A("weights"), A("values")], hint: "print the maximum value that fits in capacity W" },
  "min-of-array": { reads: [I("n"), A("a")], hint: "print the smallest value in a" },
  "multiply-two": { reads: [Is("a", "b")], hint: "print a * b" },
  "absolute-value": { reads: [I("n")], hint: "print the absolute value of n" },
  "last-digit": { reads: [I("n")], hint: "print the last digit of n, ignoring sign" },
  "to-uppercase": { reads: [S("s")], hint: "print s with every letter uppercased" },
  "is-leap-year": { reads: [I("year")], hint: "print YES if year is a leap year, otherwise NO" },
  "count-evens": { reads: [I("n"), A("a")], hint: "print how many values in a are even" },
  "sum-range": { reads: [Is("a", "b")], hint: "print the sum of all integers from a to b inclusive" },
  "char-count": { reads: [S("s"), S("c")], hint: "print how many times c appears in s" },
  "binary-to-decimal": { reads: [S("bits")], hint: "print the decimal value of the binary string bits" },
  "decimal-to-binary": { reads: [I("n")], hint: "print n in binary with no leading zeros" },
  "power-mod": { reads: [Is("a", "b", "m")], hint: "print a^b mod m" },
  "sum-of-divisors": { reads: [I("n")], hint: "print the sum of all positive divisors of n" },
  "count-set-bits": { reads: [I("n")], hint: "print the number of 1 bits in n" },
  "reverse-integer": { reads: [I("n")], hint: "print n with its digits reversed, preserving the sign" },
  "two-sum-target": { reads: [Is("n", "t"), A("a")], hint: "print YES if two values sum to t, otherwise NO" },
  "missing-number": { reads: [I("n"), A("a")], hint: "print the missing number from the range 0..n" },
  "kth-largest": { reads: [Is("n", "k"), A("a")], hint: "print the k-th largest value in a" },
  "most-frequent": { reads: [I("n"), A("a")], hint: "print the most frequent value (smallest on a tie)" },
  "subset-sum": { reads: [Is("n", "t"), A("a")], hint: "print YES if some subset of a sums to t, otherwise NO" },
  "house-robber": { reads: [I("n"), A("a")], hint: "print the maximum sum with no two adjacent values" },
  "unique-paths": { reads: [Is("m", "n")], hint: "print the number of distinct paths in an m x n grid" },
  "longest-palindromic-substring": { reads: [S("s")], hint: "print the length of the longest palindromic substring of s" },
  "max-product-subarray": { reads: [I("n"), A("a")], hint: "print the maximum product of a contiguous subarray" },
  "nth-prime": { reads: [I("n")], hint: "print the n-th prime number" },
  "two-sum": { reads: [Is("n", "t"), A("a")], hint: "print the 0-indexed positions of the two values summing to t" },
  "best-time-to-buy-and-sell-stock": { reads: [I("n"), A("prices")], hint: "print the maximum profit from one buy and one later sell" },
  "contains-duplicate": { reads: [I("n"), A("a")], hint: "print YES if any value in a repeats, otherwise NO" },
  "move-zeroes": { reads: [I("n"), A("a")], hint: "print a with all zeroes moved to the end, order preserved" },
  "single-number": { reads: [I("n"), A("a")], hint: "print the value in a that appears exactly once" },
  "majority-element": { reads: [I("n"), A("a")], hint: "print the value that appears more than n/2 times" },
  "roman-to-integer": { reads: [S("s")], hint: "print the integer value of the Roman numeral s" },
  "valid-palindrome": { reads: [S("s")], hint: "print YES if s is a palindrome (alphanumeric, case-insensitive), otherwise NO" },
  "plus-one": { reads: [A("digits")], hint: "print the digits after adding one, space-separated" },
  "search-insert-position": { reads: [A("nums"), I("target")], hint: "print the index where target is or would be inserted" },
  "product-of-array-except-self": { reads: [I("n"), A("a")], hint: "print the product-of-all-others array, space-separated" },
  "climbing-stairs": { reads: [I("n")], hint: "print the number of distinct ways to climb n steps" },
  "merge-sorted-arrays": { reads: [A("a"), A("b")], hint: "print a and b merged into one sorted list, space-separated" },
  "valid-parentheses": { reads: [S("s")], hint: "print YES if every bracket is correctly closed, otherwise NO" },
  "length-of-last-word": { reads: [S("s")], hint: "print the length of the last word in s" },
  "cart-total": { reads: [I("n"), A("prices")], hint: "print the total of all prices" },
  "bulk-discount": { reads: [Is("p", "d")], hint: "print p after a d% discount" },
  "sales-tax": { reads: [Is("p", "r")], hint: "print p plus r% tax, rounded down" },
  "passing-students": { reads: [I("n"), A("scores")], hint: "print how many scores are 60 or above" },
  "class-average": { reads: [I("n"), A("scores")], hint: "print the average of scores, rounded down" },
  "temperature-swing": { reads: [I("n"), A("a")], hint: "print the highest value minus the lowest" },
  "low-stock-alert": { reads: [Is("n", "t"), A("stock")], hint: "print how many stock levels are strictly below t" },
  "pagination-pages": { reads: [Is("t", "s")], hint: "print the number of pages of size s needed for t items" },
  "unique-visitors": { reads: [I("n"), SA("ids")], hint: "print the number of distinct ids" },
  "dna-hamming": { reads: [S("a"), S("b")], hint: "print the Hamming distance between a and b" },
  "gc-content": { reads: [S("dna")], hint: "print the percentage of G or C in dna, rounded down" },
  "top-word": { reads: [S("line")], hint: "print the most frequent word (lexicographically smallest on a tie)" },
  "distinct-words": { reads: [S("line")], hint: "print how many distinct words line contains" },
  "duration-to-seconds": { reads: [S("hms")], hint: "print the total seconds for the HH:MM:SS duration" },
  "format-duration": { reads: [I("n")], hint: "print n seconds formatted as H:MM:SS" },
  "make-change": { reads: [I("cents")], hint: "print the fewest coins (25/10/5/1) that make cents" },
  "caesar-cipher": { reads: [S("text"), I("k")], hint: "print text with each letter shifted forward by k" },
  "run-length-encode": { reads: [S("s")], hint: "print the run-length encoding of s" },
  "luhn-check": { reads: [S("number")], hint: "print whether number passes the Luhn checksum" },
  "leaderboard-ranking": { reads: [I("n"), R("players", "n", "str")], hint: "print the player names ordered by score, highest first" },
  "matrix-transpose": { reads: [Is("r", "c"), R("grid", "r", "ints")], hint: "print the transpose of grid" },
  "budget-shopping": { reads: [Is("n", "b"), A("prices")], hint: "print the most items you can buy within budget b" },
  "meeting-overlap": { reads: [I("n"), R("meetings", "n", "ints")], hint: "print YES if no two meetings overlap, otherwise NO" },
  "meeting-rooms": { reads: [I("n"), R("meetings", "n", "ints")], hint: "print the minimum number of rooms needed" },
  "ip-to-int": { reads: [S("ip")], hint: "print the 32-bit integer value of the IPv4 address ip" },
  "grade-histogram": { reads: [I("n"), A("scores")], hint: "print five space-separated counts: A B C D F" },
  "win-streak": { reads: [S("s")], hint: "print the longest run of consecutive W in s" },
  "csv-column-sum": { reads: [Is("k", "n"), R("rows", "n", "csvInts")], hint: "print the sum of column k across the rows" },
  "bracket-depth": { reads: [S("s")], hint: "print the maximum bracket nesting depth of s" },
  "spend-threshold": { reads: [I("total")], hint: "print the amount paid after any promotion" },
  "tip-total": { reads: [Is("bill", "pct")], hint: "print bill plus a pct% tip" },
  "change-due": { reads: [Is("cost", "paid")], hint: "print paid - cost" },
  "seconds-to-hms": { reads: [I("n")], hint: "print n seconds as HH:MM:SS, each field at least two digits" },
  "discount-price": { reads: [Is("price", "pct")], hint: "print price after a pct% discount" },
  "grade-letter": { reads: [I("score")], hint: "print the letter grade for score" },
  "count-uppercase": { reads: [S("s")], hint: "print how many characters of s are uppercase A-Z" },
  "bank-balance": { reads: [I("n"), A("tx")], hint: "print the final balance starting from 0" },
  "rgb-to-hex": { reads: [Is("r", "g", "b")], hint: "print the color as #rrggbb, lowercase" },
  "title-case": { reads: [S("s")], hint: "print s in title case" },
  "url-slug": { reads: [S("s")], hint: "print the URL slug of s" },
  "parking-fee": { reads: [Is("hours", "rate", "cap")], hint: "print the fee: hours * rate, capped at cap" },
  "overtime-pay": { reads: [Is("hours", "rate")], hint: "print the pay, time-and-a-half beyond 40 hours" },
  "bill-split": { reads: [Is("total", "n")], hint: "print each person's share, rounded up" },
  "array-median": { reads: [I("n"), A("a")], hint: "print the median of a" },
  "array-mode": { reads: [I("n"), A("a")], hint: "print the most frequent value (smallest on a tie)" },
  "shift-duration": { reads: [S("start"), S("end")], hint: "print the minutes between start and end (HH:MM)" },
  "election-winner": { reads: [I("n"), R("votes", "n", "str")], hint: "print the name with the most votes" },
  "password-strength": { reads: [S("password")], hint: "print Strong or Weak" },
  "longest-word": { reads: [S("line")], hint: "print the longest word (first on a tie)" },
  "digit-product": { reads: [I("n")], hint: "print the product of the digits of n" },
  "collatz-steps": { reads: [I("n")], hint: "print the number of Collatz steps to reach 1" },
  "sum-multiples": { reads: [I("n")], hint: "print the sum of multiples of 3 or 5 below n" },
  "pair-sum-count": { reads: [Is("n", "target"), A("a")], hint: "print the number of index pairs i<j with a[i]+a[j]==target" },
  "subarray-sum-k": { reads: [Is("n", "k"), A("a")], hint: "print how many contiguous subarrays sum to k" },
  "longest-run": { reads: [I("n"), A("a")], hint: "print the length of the longest run of equal values" },
  "rotate-array": { reads: [Is("n", "k"), A("a")], hint: "print a rotated right by k, space-separated" },
  "max-row-sum": { reads: [Is("r", "c"), R("grid", "r", "ints")], hint: "print the 1-based index of the row with the largest sum" },
  "anagram-groups": { reads: [I("n"), R("words", "n", "str")], hint: "print the number of anagram groups" },
  "min-subset-diff": { reads: [I("n"), A("a")], hint: "print the minimum absolute difference between two subset sums" },
  "restock-count": { reads: [I("n"), R("items", "n", "ints")], hint: "print how many items have stock below their threshold" },
};

const cache = new Map<string, string>();

/** The starter for a problem+language: a tailored template when we have a spec
 * for the slug, else the shared generic fallback. */
export function starterFor(slug: string, lang: Language): string {
  const spec = SPECS[slug];
  if (!spec) return STARTERS[lang];
  const key = `${slug}:${lang}`;
  let code = cache.get(key);
  if (code === undefined) {
    code = generate(spec, lang);
    cache.set(key, code);
  }
  return code;
}

/** Exposed for tests. */
export const _internal = { SPECS, generate };

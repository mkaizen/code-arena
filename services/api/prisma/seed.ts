/**
 * Seed script: creates an admin user, two solvable problems (with hidden test
 * bundles uploaded to object storage), and a live contest wiring them together.
 *
 * Run with infra up and env loaded:
 *   pnpm --filter @arena/api exec tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";
import argon2 from "argon2";

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
});
const BUCKET = process.env.S3_BUCKET ?? "arena-testcases";

async function packAndUpload(key: string, tests: { input: string; output: string }[]): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "seed-tests-"));
  const tarPath = join(tmpdir(), `seed-${Date.now()}.tar`);
  try {
    const files: string[] = [];
    for (let i = 0; i < tests.length; i++) {
      const n = String(i + 1).padStart(2, "0");
      await writeFile(join(dir, `${n}.in`), tests[i].input);
      await writeFile(join(dir, `${n}.out`), tests[i].output);
      files.push(`${n}.in`, `${n}.out`);
    }
    await tar.create({ file: tarPath, cwd: dir }, files);
    const body = await readFile(tarPath);
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "application/x-tar" }));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(tarPath).catch(() => {});
  }
}

interface ProblemSeed {
  slug: string;
  title: string;
  statement: string;
  difficulty: "easy" | "med" | "hard";
  ratingValue: number;
  tags: string[];
  samples: { input: string; output: string }[];
  tests: { input: string; output: string }[];
}

const PROBLEMS: ProblemSeed[] = [
  {
    slug: "sum-of-two",
    title: "Sum of Two",
    statement:
      "<p>Read two space-separated integers <code>a</code> and <code>b</code> on a single line. " +
      "Print their sum.</p><p><strong>Constraints:</strong> -10<sup>9</sup> &le; a, b &le; 10<sup>9</sup></p>",
    difficulty: "easy",
    ratingValue: 800,
    tags: ["math", "implementation"],
    samples: [
      { input: "2 3\n", output: "5\n" },
      { input: "-4 10\n", output: "6\n" },
    ],
    tests: [
      { input: "2 3\n", output: "5\n" },
      { input: "-4 10\n", output: "6\n" },
      { input: "1000000000 1000000000\n", output: "2000000000\n" },
      { input: "0 0\n", output: "0\n" },
      { input: "-1000000000 -1000000000\n", output: "-2000000000\n" },
    ],
  },
  {
    slug: "hello-name",
    title: "Greeting",
    statement:
      "<p>Read a single line containing a name. Print <code>Hello, &lt;name&gt;!</code></p>" +
      "<p>For example, if the input is <code>World</code>, print <code>Hello, World!</code></p>",
    difficulty: "easy",
    ratingValue: 900,
    tags: ["strings", "implementation"],
    samples: [{ input: "World\n", output: "Hello, World!\n" }],
    tests: [
      { input: "World\n", output: "Hello, World!\n" },
      { input: "Arena\n", output: "Hello, Arena!\n" },
      { input: "Claude\n", output: "Hello, Claude!\n" },
    ],
  },
  {"slug": "reverse-string", "title": "Reverse a String", "statement": "<p>Read a single line and print it reversed.</p><p>For input <code>hello</code>, print <code>olleh</code>.</p>", "difficulty": "easy", "ratingValue": 950, "tags": ["strings", "implementation"], "samples": [{"input": "hello\n", "output": "olleh\n"}, {"input": "Code Arena\n", "output": "anerA edoC\n"}], "tests": [{"input": "hello\n", "output": "olleh\n"}, {"input": "Code Arena\n", "output": "anerA edoC\n"}, {"input": "a\n", "output": "a\n"}, {"input": "racecar\n", "output": "racecar\n"}, {"input": "level\n", "output": "level\n"}]},
  {"slug": "fizzbuzz", "title": "FizzBuzz", "statement": "<p>Read an integer <code>n</code>. For each <code>i</code> from 1 to <code>n</code>, print <code>Fizz</code> if <code>i</code> is divisible by 3, <code>Buzz</code> if divisible by 5, <code>FizzBuzz</code> if divisible by both, otherwise the number itself \u2014 one per line.</p><p><strong>Constraints:</strong> 1 &le; n &le; 10000</p>", "difficulty": "easy", "ratingValue": 1000, "tags": ["implementation", "math"], "samples": [{"input": "5\n", "output": "1\n2\nFizz\n4\nBuzz\n"}, {"input": "3\n", "output": "1\n2\nFizz\n"}], "tests": [{"input": "5\n", "output": "1\n2\nFizz\n4\nBuzz\n"}, {"input": "3\n", "output": "1\n2\nFizz\n"}, {"input": "1\n", "output": "1\n"}, {"input": "15\n", "output": "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n"}, {"input": "20\n", "output": "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n16\n17\nFizz\n19\nBuzz\n"}]},
  {"slug": "count-vowels", "title": "Count the Vowels", "statement": "<p>Read a single line and print the number of vowels (<code>a, e, i, o, u</code>, upper or lower case) it contains.</p>", "difficulty": "easy", "ratingValue": 1000, "tags": ["strings"], "samples": [{"input": "hello\n", "output": "2\n"}, {"input": "Code Arena\n", "output": "5\n"}], "tests": [{"input": "hello\n", "output": "2\n"}, {"input": "Code Arena\n", "output": "5\n"}, {"input": "xyz\n", "output": "0\n"}, {"input": "AEIOU\n", "output": "5\n"}, {"input": "Programming\n", "output": "3\n"}]},
  {"slug": "sort-array", "title": "Sort the Array", "statement": "<p>The first line contains <code>n</code>. The second line contains <code>n</code> space-separated integers. Print them sorted in non-decreasing order, space-separated on one line.</p><p><strong>Constraints:</strong> 1 &le; n &le; 10<sup>5</sup></p>", "difficulty": "easy", "ratingValue": 1050, "tags": ["sorting", "arrays"], "samples": [{"input": "5\n5 3 1 4 2\n", "output": "1 2 3 4 5\n"}, {"input": "3\n-1 -5 3\n", "output": "-5 -1 3\n"}], "tests": [{"input": "5\n5 3 1 4 2\n", "output": "1 2 3 4 5\n"}, {"input": "3\n-1 -5 3\n", "output": "-5 -1 3\n"}, {"input": "1\n42\n", "output": "42\n"}, {"input": "4\n2 2 1 2\n", "output": "1 2 2 2\n"}, {"input": "6\n10 -10 0 5 -5 3\n", "output": "-10 -5 0 3 5 10\n"}]},
  {"slug": "gcd-two", "title": "Greatest Common Divisor", "statement": "<p>Read two positive integers <code>a</code> and <code>b</code>. Print their greatest common divisor.</p><p><strong>Constraints:</strong> 1 &le; a, b &le; 10<sup>9</sup></p>", "difficulty": "med", "ratingValue": 1100, "tags": ["math", "number-theory"], "samples": [{"input": "12 18\n", "output": "6\n"}, {"input": "17 5\n", "output": "1\n"}], "tests": [{"input": "12 18\n", "output": "6\n"}, {"input": "17 5\n", "output": "1\n"}, {"input": "100 100\n", "output": "100\n"}, {"input": "1000000 8\n", "output": "8\n"}, {"input": "999999937 1\n", "output": "1\n"}]},
  {"slug": "is-prime", "title": "Primality Test", "statement": "<p>Read an integer <code>n</code>. Print <code>YES</code> if it is prime, otherwise <code>NO</code>.</p><p><strong>Constraints:</strong> 1 &le; n &le; 10<sup>9</sup></p>", "difficulty": "med", "ratingValue": 1200, "tags": ["number-theory", "math"], "samples": [{"input": "7\n", "output": "YES\n"}, {"input": "10\n", "output": "NO\n"}], "tests": [{"input": "7\n", "output": "YES\n"}, {"input": "10\n", "output": "NO\n"}, {"input": "1\n", "output": "NO\n"}, {"input": "2\n", "output": "YES\n"}, {"input": "999983\n", "output": "YES\n"}]},
  {"slug": "max-subarray", "title": "Maximum Subarray Sum", "statement": "<p>The first line contains <code>n</code>. The second line contains <code>n</code> integers. Print the maximum sum of any non-empty contiguous subarray (Kadane's algorithm).</p><p><strong>Constraints:</strong> 1 &le; n &le; 10<sup>5</sup>, |a<sub>i</sub>| &le; 10<sup>4</sup></p>", "difficulty": "med", "ratingValue": 1400, "tags": ["dp", "arrays"], "samples": [{"input": "9\n-2 1 -3 4 -1 2 1 -5 4\n", "output": "6\n"}, {"input": "3\n-5 -2 -3\n", "output": "-2\n"}], "tests": [{"input": "9\n-2 1 -3 4 -1 2 1 -5 4\n", "output": "6\n"}, {"input": "3\n-5 -2 -3\n", "output": "-2\n"}, {"input": "1\n7\n", "output": "7\n"}, {"input": "3\n1 2 3\n", "output": "6\n"}, {"input": "5\n-1 -2 -3 -4 -5\n", "output": "-1\n"}]},
  {"slug": "balanced-brackets", "title": "Balanced Brackets", "statement": "<p>Read a single line containing only the characters <code>()[]{}</code>. Print <code>YES</code> if the brackets are balanced and correctly nested, otherwise <code>NO</code>.</p>", "difficulty": "med", "ratingValue": 1300, "tags": ["stack", "strings"], "samples": [{"input": "([]){}\n", "output": "YES\n"}, {"input": "([)]\n", "output": "NO\n"}], "tests": [{"input": "([]){}\n", "output": "YES\n"}, {"input": "([)]\n", "output": "NO\n"}, {"input": "(((\n", "output": "NO\n"}, {"input": "\n", "output": "YES\n"}, {"input": "{[()]}\n", "output": "YES\n"}]},
  {"slug": "edit-distance", "title": "Edit Distance", "statement": "<p>Read two lines, strings <code>a</code> and <code>b</code>. Print the minimum number of single-character insertions, deletions, or substitutions needed to turn <code>a</code> into <code>b</code> (Levenshtein distance).</p><p><strong>Constraints:</strong> 0 &le; |a|, |b| &le; 1000</p>", "difficulty": "hard", "ratingValue": 1800, "tags": ["dp", "strings"], "samples": [{"input": "kitten\nsitting\n", "output": "3\n"}, {"input": "flaw\nlawn\n", "output": "2\n"}], "tests": [{"input": "kitten\nsitting\n", "output": "3\n"}, {"input": "flaw\nlawn\n", "output": "2\n"}, {"input": "abc\nabc\n", "output": "0\n"}, {"input": "\nabc\n", "output": "3\n"}, {"input": "intention\nexecution\n", "output": "5\n"}]},
  {"slug": "coin-change", "title": "Coin Change", "statement": "<p>The first line contains the target <code>amount</code> and the number of coin types <code>k</code>. The second line contains <code>k</code> coin denominations. Print the minimum number of coins that sum to exactly <code>amount</code>, or <code>-1</code> if it is impossible. You may use each denomination any number of times.</p><p><strong>Constraints:</strong> 0 &le; amount &le; 10<sup>4</sup>, 1 &le; k &le; 20</p>", "difficulty": "hard", "ratingValue": 1700, "tags": ["dp", "greedy"], "samples": [{"input": "11 3\n1 2 5\n", "output": "3\n"}, {"input": "3 2\n2 4\n", "output": "-1\n"}], "tests": [{"input": "11 3\n1 2 5\n", "output": "3\n"}, {"input": "3 2\n2 4\n", "output": "-1\n"}, {"input": "0 1\n7\n", "output": "0\n"}, {"input": "100 2\n1 50\n", "output": "2\n"}, {"input": "27 3\n1 5 10\n", "output": "5\n"}]},
  {"slug": "array-sum", "title": "Array Sum", "statement": "<p>The first line contains <code>n</code>. The second line contains <code>n</code> space-separated integers. Print their sum.</p><p><strong>Constraints:</strong> 1 &le; n &le; 10<sup>5</sup>, |a<sub>i</sub>| &le; 10<sup>9</sup></p>", "difficulty": "easy", "ratingValue": 850, "tags": ["arrays", "math"], "samples": [{"input": "4\n1 2 3 4\n", "output": "10\n"}, {"input": "3\n-5 5 10\n", "output": "10\n"}], "tests": [{"input": "4\n1 2 3 4\n", "output": "10\n"}, {"input": "3\n-5 5 10\n", "output": "10\n"}, {"input": "1\n0\n", "output": "0\n"}, {"input": "5\n1000000000 1000000000 1000000000 1000000000 1000000000\n", "output": "5000000000\n"}, {"input": "2\n-7 -3\n", "output": "-10\n"}]},
  {"slug": "max-of-three", "title": "Max of Three", "statement": "<p>Read three space-separated integers on one line. Print the largest.</p>", "difficulty": "easy", "ratingValue": 850, "tags": ["implementation"], "samples": [{"input": "3 7 5\n", "output": "7\n"}, {"input": "-1 -9 -4\n", "output": "-1\n"}], "tests": [{"input": "3 7 5\n", "output": "7\n"}, {"input": "-1 -9 -4\n", "output": "-1\n"}, {"input": "10 10 10\n", "output": "10\n"}, {"input": "1 2 3\n", "output": "3\n"}, {"input": "100 -100 0\n", "output": "100\n"}]},
  {"slug": "even-or-odd", "title": "Even or Odd", "statement": "<p>Read an integer <code>n</code>. Print <code>Even</code> if it is even, otherwise <code>Odd</code>.</p><p><strong>Constraints:</strong> -10<sup>18</sup> &le; n &le; 10<sup>18</sup></p>", "difficulty": "easy", "ratingValue": 800, "tags": ["math"], "samples": [{"input": "4\n", "output": "Even\n"}, {"input": "7\n", "output": "Odd\n"}], "tests": [{"input": "4\n", "output": "Even\n"}, {"input": "7\n", "output": "Odd\n"}, {"input": "0\n", "output": "Even\n"}, {"input": "-3\n", "output": "Odd\n"}, {"input": "1000000000000000000\n", "output": "Even\n"}]},
  {"slug": "count-words", "title": "Count Words", "statement": "<p>Read a single line. Print the number of whitespace-separated words it contains.</p>", "difficulty": "easy", "ratingValue": 950, "tags": ["strings"], "samples": [{"input": "hello world\n", "output": "2\n"}, {"input": "the quick brown fox\n", "output": "4\n"}], "tests": [{"input": "hello world\n", "output": "2\n"}, {"input": "the quick brown fox\n", "output": "4\n"}, {"input": "single\n", "output": "1\n"}, {"input": "a b c d e\n", "output": "5\n"}, {"input": "one\n", "output": "1\n"}]},
  {"slug": "digit-sum", "title": "Sum of Digits", "statement": "<p>Read a non-negative integer <code>n</code>. Print the sum of its digits.</p><p><strong>Constraints:</strong> 0 &le; n &le; 10<sup>18</sup></p>", "difficulty": "easy", "ratingValue": 950, "tags": ["math", "strings"], "samples": [{"input": "1234\n", "output": "10\n"}, {"input": "9999\n", "output": "36\n"}], "tests": [{"input": "1234\n", "output": "10\n"}, {"input": "9999\n", "output": "36\n"}, {"input": "0\n", "output": "0\n"}, {"input": "1000000000000000000\n", "output": "1\n"}, {"input": "505\n", "output": "10\n"}]},
  {"slug": "factorial", "title": "Factorial", "statement": "<p>Read an integer <code>n</code> (0 &le; n &le; 20). Print <code>n!</code> (n factorial). Note <code>0! = 1</code>.</p>", "difficulty": "easy", "ratingValue": 1000, "tags": ["math"], "samples": [{"input": "5\n", "output": "120\n"}, {"input": "0\n", "output": "1\n"}], "tests": [{"input": "5\n", "output": "120\n"}, {"input": "0\n", "output": "1\n"}, {"input": "1\n", "output": "1\n"}, {"input": "10\n", "output": "3628800\n"}, {"input": "20\n", "output": "2432902008176640000\n"}]},
  {"slug": "nth-fibonacci", "title": "Nth Fibonacci", "statement": "<p>Read an integer <code>n</code> (0 &le; n &le; 90). Print the <code>n</code>-th Fibonacci number, where <code>F(0) = 0</code>, <code>F(1) = 1</code>.</p>", "difficulty": "med", "ratingValue": 1200, "tags": ["dp", "math"], "samples": [{"input": "10\n", "output": "55\n"}, {"input": "1\n", "output": "1\n"}], "tests": [{"input": "10\n", "output": "55\n"}, {"input": "1\n", "output": "1\n"}, {"input": "0\n", "output": "0\n"}, {"input": "2\n", "output": "1\n"}, {"input": "90\n", "output": "2880067194370816120\n"}]},
  {"slug": "second-largest", "title": "Second Largest", "statement": "<p>The first line contains <code>n</code>. The second line contains <code>n</code> integers with at least two distinct values. Print the second largest <em>distinct</em> value.</p><p><strong>Constraints:</strong> 2 &le; n &le; 10<sup>5</sup></p>", "difficulty": "med", "ratingValue": 1200, "tags": ["arrays"], "samples": [{"input": "5\n3 1 4 1 5\n", "output": "4\n"}, {"input": "4\n10 20 20 8\n", "output": "10\n"}], "tests": [{"input": "5\n3 1 4 1 5\n", "output": "4\n"}, {"input": "4\n10 20 20 8\n", "output": "10\n"}, {"input": "2\n7 3\n", "output": "3\n"}, {"input": "6\n-1 -2 -3 -4 -5 -6\n", "output": "-2\n"}, {"input": "3\n100 50 100\n", "output": "50\n"}]},
  {"slug": "count-primes", "title": "Count Primes", "statement": "<p>Read an integer <code>n</code>. Print how many prime numbers are less than or equal to <code>n</code>.</p><p><strong>Constraints:</strong> 0 &le; n &le; 10<sup>6</sup></p>", "difficulty": "med", "ratingValue": 1300, "tags": ["number-theory"], "samples": [{"input": "10\n", "output": "4\n"}, {"input": "2\n", "output": "1\n"}], "tests": [{"input": "10\n", "output": "4\n"}, {"input": "2\n", "output": "1\n"}, {"input": "1\n", "output": "0\n"}, {"input": "100\n", "output": "25\n"}, {"input": "1000000\n", "output": "78498\n"}]},
  {"slug": "palindrome-check", "title": "Palindrome Check", "statement": "<p>Read a single line. Print <code>YES</code> if it reads the same forwards and backwards, otherwise <code>NO</code>.</p>", "difficulty": "med", "ratingValue": 1100, "tags": ["strings"], "samples": [{"input": "racecar\n", "output": "YES\n"}, {"input": "hello\n", "output": "NO\n"}], "tests": [{"input": "racecar\n", "output": "YES\n"}, {"input": "hello\n", "output": "NO\n"}, {"input": "a\n", "output": "YES\n"}, {"input": "abba\n", "output": "YES\n"}, {"input": "abcba\n", "output": "YES\n"}]},
  {"slug": "anagram-check", "title": "Anagram Check", "statement": "<p>Read two lines, strings <code>a</code> and <code>b</code>. Print <code>YES</code> if they are anagrams of each other (same characters in any order), otherwise <code>NO</code>.</p>", "difficulty": "med", "ratingValue": 1200, "tags": ["strings", "sorting"], "samples": [{"input": "listen\nsilent\n", "output": "YES\n"}, {"input": "hello\nworld\n", "output": "NO\n"}], "tests": [{"input": "listen\nsilent\n", "output": "YES\n"}, {"input": "hello\nworld\n", "output": "NO\n"}, {"input": "abc\ncab\n", "output": "YES\n"}, {"input": "aabb\nbbaa\n", "output": "YES\n"}, {"input": "a\nab\n", "output": "NO\n"}]},
  {"slug": "gcd-array", "title": "GCD of an Array", "statement": "<p>The first line contains <code>n</code>. The second line contains <code>n</code> positive integers. Print the greatest common divisor of all of them.</p><p><strong>Constraints:</strong> 1 &le; n &le; 10<sup>5</sup></p>", "difficulty": "med", "ratingValue": 1250, "tags": ["math", "number-theory"], "samples": [{"input": "3\n12 18 24\n", "output": "6\n"}, {"input": "2\n17 5\n", "output": "1\n"}], "tests": [{"input": "3\n12 18 24\n", "output": "6\n"}, {"input": "2\n17 5\n", "output": "1\n"}, {"input": "1\n42\n", "output": "42\n"}, {"input": "4\n8 8 8 8\n", "output": "8\n"}, {"input": "3\n100 75 50\n", "output": "25\n"}]},
  {"slug": "longest-common-subsequence", "title": "Longest Common Subsequence", "statement": "<p>Read two lines, strings <code>a</code> and <code>b</code>. Print the length of their longest common subsequence (characters need not be contiguous but must keep order).</p><p><strong>Constraints:</strong> 1 &le; |a|, |b| &le; 1000</p>", "difficulty": "hard", "ratingValue": 1700, "tags": ["dp", "strings"], "samples": [{"input": "abcde\nace\n", "output": "3\n"}, {"input": "abc\nabc\n", "output": "3\n"}], "tests": [{"input": "abcde\nace\n", "output": "3\n"}, {"input": "abc\nabc\n", "output": "3\n"}, {"input": "abc\ndef\n", "output": "0\n"}, {"input": "aggtab\ngxtxayb\n", "output": "4\n"}, {"input": "xyz\nxyz\n", "output": "3\n"}]},
  {"slug": "longest-increasing-subsequence", "title": "Longest Increasing Subsequence", "statement": "<p>The first line contains <code>n</code>. The second line contains <code>n</code> integers. Print the length of the longest strictly increasing subsequence.</p><p><strong>Constraints:</strong> 1 &le; n &le; 10<sup>5</sup></p>", "difficulty": "hard", "ratingValue": 1600, "tags": ["dp", "arrays"], "samples": [{"input": "6\n10 9 2 5 3 7\n", "output": "3\n"}, {"input": "4\n1 2 3 4\n", "output": "4\n"}], "tests": [{"input": "6\n10 9 2 5 3 7\n", "output": "3\n"}, {"input": "4\n1 2 3 4\n", "output": "4\n"}, {"input": "1\n5\n", "output": "1\n"}, {"input": "5\n5 4 3 2 1\n", "output": "1\n"}, {"input": "8\n0 8 4 12 2 10 6 14\n", "output": "4\n"}]},
  {"slug": "knapsack", "title": "0/1 Knapsack", "statement": "<p>The first line contains <code>n</code> and capacity <code>W</code>. The second line contains <code>n</code> item weights. The third line contains <code>n</code> item values. Print the maximum total value that fits in capacity <code>W</code>; each item may be taken at most once.</p><p><strong>Constraints:</strong> 1 &le; n &le; 100, 1 &le; W &le; 10<sup>4</sup></p>", "difficulty": "hard", "ratingValue": 1800, "tags": ["dp"], "samples": [{"input": "3 50\n10 20 30\n60 100 120\n", "output": "220\n"}, {"input": "2 5\n4 5\n10 20\n", "output": "20\n"}], "tests": [{"input": "3 50\n10 20 30\n60 100 120\n", "output": "220\n"}, {"input": "2 5\n4 5\n10 20\n", "output": "20\n"}, {"input": "1 10\n5\n42\n", "output": "42\n"}, {"input": "4 10\n2 3 4 5\n3 4 5 6\n", "output": "13\n"}, {"input": "3 6\n1 2 3\n10 15 40\n", "output": "65\n"}]}
];

async function ensureBucket() {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`created bucket ${BUCKET}`);
  } catch (err: any) {
    if (err?.name === "BucketAlreadyOwnedByYou" || err?.name === "BucketAlreadyExists") return;
    console.warn(`bucket ensure: ${err?.name ?? err}`);
  }
}

async function main() {
  await ensureBucket();

  // ── Admin + demo users ────────────────────────────────────────────────────
  const passwordHash = await argon2.hash("password123");
  const admin = await prisma.user.upsert({
    where: { email: "admin@codearena.dev" },
    update: { role: "ADMIN" },
    create: { handle: "admin", email: "admin@codearena.dev", passwordHash, role: "ADMIN", rating: 2400 },
  });
  await prisma.user.upsert({
    where: { email: "demo@codearena.dev" },
    update: {},
    create: { handle: "demo", email: "demo@codearena.dev", passwordHash, rating: 1500 },
  });
  console.log(`admin user: admin@codearena.dev / password123`);

  // ── Problems ──────────────────────────────────────────────────────────────
  // Each problem is isolated in its own try/catch so a single failure (e.g. a
  // transient object-storage error) can't abort the whole seed and leave the
  // bank half-populated. Re-running also self-heals any problem an earlier
  // partial run left pointing at a placeholder tests key.
  const problemIds: string[] = [];
  let nCreated = 0, nRepaired = 0, nSkipped = 0, nFailed = 0;
  for (const p of PROBLEMS) {
    try {
      const existing = await prisma.problem.findUnique({ where: { slug: p.slug } });
      if (existing) {
        problemIds.push(existing.id);
        if (existing.testsKey.startsWith("problems/pending/")) {
          // Tests never got uploaded on a prior run — repair it now.
          const testsKey = `problems/${existing.id}/tests.tar`;
          await packAndUpload(testsKey, p.tests);
          await prisma.problem.update({ where: { id: existing.id }, data: { testsKey, testCount: p.tests.length } });
          nRepaired++;
          console.log(`problem ${p.slug} repaired (tests re-uploaded)`);
        } else {
          nSkipped++;
        }
        continue;
      }
      const created = await prisma.problem.create({
        data: {
          slug: p.slug,
          title: p.title,
          statement: p.statement,
          difficulty: p.difficulty,
          ratingValue: p.ratingValue,
          tags: p.tags,
          timeMs: 2000,
          memoryKb: 262_144,
          testsKey: `problems/pending/${p.slug}.tar`,
          testCount: p.tests.length,
          samples: { create: p.samples.map((s, i) => ({ input: s.input, output: s.output, ordinal: i })) },
        },
      });
      const testsKey = `problems/${created.id}/tests.tar`;
      await packAndUpload(testsKey, p.tests);
      await prisma.problem.update({ where: { id: created.id }, data: { testsKey } });
      problemIds.push(created.id);
      nCreated++;
      console.log(`created problem ${p.slug} (${created.id})`);
    } catch (err) {
      nFailed++;
      console.error(`FAILED to seed problem ${p.slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`problems: ${nCreated} created, ${nRepaired} repaired, ${nSkipped} already present, ${nFailed} failed (of ${PROBLEMS.length} total)`);

  // ── Live contest ──────────────────────────────────────────────────────────
  // Always reset start time so re-running seed gives a fresh live contest.
  const contestStart = new Date(Date.now() - 60_000); // 1 min ago → live immediately
  const existingContest = await prisma.contest.findFirst({ where: { name: "Code Arena Round 1" } });
  if (existingContest) {
    await prisma.contest.update({
      where: { id: existingContest.id },
      data: { startsAt: contestStart, durationSec: 24 * 60 * 60 },
    });
    // Wire any newly-seeded problems into the contest (idempotent): keep
    // existing entries, append missing ones with the next available labels.
    const existingCps = await prisma.contestProblem.findMany({
      where: { contestId: existingContest.id },
      select: { problemId: true },
    });
    const have = new Set(existingCps.map((c) => c.problemId));
    let next = existingCps.length;
    for (const problemId of problemIds) {
      if (have.has(problemId)) continue;
      await prisma.contestProblem.create({
        data: { contestId: existingContest.id, problemId, label: String.fromCharCode(65 + next), points: 100 },
      });
      next++;
    }
    console.log(`reset "Code Arena Round 1" → live for 24h, ${next} problems wired`);
  } else {
    const contest = await prisma.contest.create({
      data: {
        name: "Code Arena Round 1",
        startsAt: contestStart,
        durationSec: 24 * 60 * 60, // 24h so it stays live after a fresh deploy
        scoring: "ICPC",
        rated: true,
        freezeSec: 1800,
        problems: {
          create: problemIds.map((problemId, i) => ({
            problemId,
            label: String.fromCharCode(65 + i),
            points: 100,
          })),
        },
      },
    });
    console.log(`created live contest "Code Arena Round 1" (${contest.id})`);
  }

  console.log("seed complete ✓");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

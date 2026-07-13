import type { Language } from "@arena/shared";

export const LANG_LABELS: Record<Language, string> = {
  cpp: "C++17", py: "Python 3", java: "Java 17", js: "JavaScript", go: "Go", rs: "Rust",
};

export const MONACO_LANG: Record<Language, string> = {
  cpp: "cpp", py: "python", java: "java", js: "javascript", go: "go", rs: "rust",
};

/**
 * Generic per-language starter templates. Each one compiles and runs as-is,
 * sets up fast/buffered stdin+stdout, and leaves a clear spot for the solution
 * — a fresh submission produces no output (a no-op WA) rather than a crash.
 *
 * These are the fallback used for any problem without a tailored spec; most
 * problems get input-specific starters from `problemStarters.ts` via
 * `starterFor()`.
 */
export const STARTERS: Record<Language, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    // Read input with cin, write your answer with cout.

    return 0;
}
`,

  py: `import sys

def main():
    data = sys.stdin.buffer.read().split()
    # Parse the tokens in \`data\` and print your answer.

main()
`,

  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();

        // Read from br, append your answer to sb.

        System.out.print(sb);
    }
}
`,

  js: `const data = require('fs').readFileSync(0, 'utf8');
const tokens = data.split(/\\s+/).filter(Boolean);
let idx = 0;
const next = () => tokens[idx++];

// Read values with next(), then console.log your answer.
`,

  go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1024*1024), 1024*1024)
	out := bufio.NewWriter(os.Stdout)
	defer out.Flush()

	// Read lines with in.Scan()/in.Text(); write with fmt.Fprintln(out, ...).
	for in.Scan() {
		fmt.Fprintln(out, in.Text())
	}
}
`,

  rs: `use std::io::{self, Read, Write};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());

    // Parse \`input\`, write your answer to \`out\` with write!/writeln!.
    let _ = out.write_all(b"");
}
`,
};

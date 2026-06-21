import type { Language } from "@arena/shared";

export interface Recipe {
  image: string;
  source: string;             // filename written into the sandbox
  compile?: string[];         // optional compile step (argv)
  run: string[];              // run step (argv)
}

/** Per-language compile/run recipes executed inside the sandbox image (NFR-3). */
export const RECIPES: Record<Language, Recipe> = {
  cpp: {
    image: "arena-sandbox:cpp",
    source: "main.cpp",
    compile: ["g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"],
    run: ["./main"],
  },
  py: {
    image: "arena-sandbox:py",
    source: "main.py",
    run: ["python3", "main.py"],
  },
  java: {
    image: "arena-sandbox:java",
    source: "Main.java",
    compile: ["javac", "Main.java"],
    run: ["java", "Main"],
  },
  js: {
    image: "arena-sandbox:node",
    source: "main.js",
    run: ["node", "main.js"],
  },
  go: {
    image: "arena-sandbox:go",
    source: "main.go",
    compile: ["go", "build", "-o", "main", "main.go"],
    run: ["./main"],
  },
  rs: {
    image: "arena-sandbox:rust",
    source: "main.rs",
    compile: ["rustc", "-O", "-o", "main", "main.rs"],
    run: ["./main"],
  },
};

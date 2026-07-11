import { describe, it, expect } from "vitest";
import { findSimilarPairs, type CodeDoc } from "./detect.js";

const COPIED = `
  int main() {
    long long n; std::cin >> n;
    long long total = 0;
    for (long long i = 0; i < n; i++) total += i * i;
    std::cout << total << std::endl;
    return 0;
  }
`;
// Same logic, every identifier renamed and reformatted.
const RENAMED = `
  int main(){long long q;std::cin>>q;long long acc=0;
  for(long long j=0;j<q;j++){acc+=j*j;}
  std::cout<<acc<<std::endl;return 0;}
`;
const DIFFERENT = `
  int main() {
    std::string line;
    std::map<std::string,int> freq;
    while (std::cin >> line) freq[line]++;
    for (auto& kv : freq) std::cout << kv.first << " " << kv.second << "\\n";
    return 0;
  }
`;

const doc = (submissionId: string, userId: string, source: string): CodeDoc => ({
  submissionId, userId, handle: userId, source,
});

describe("findSimilarPairs", () => {
  it("flags a renamed/reformatted copy between two users", () => {
    const pairs = findSimilarPairs([doc("s1", "alice", COPIED), doc("s2", "bob", RENAMED)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].similarity).toBeGreaterThan(0.8);
    expect([pairs[0].a.userId, pairs[0].b.userId].sort()).toEqual(["alice", "bob"]);
    expect(pairs[0].sharedFingerprints).toBeGreaterThan(0);
  });

  it("does not flag structurally different solutions", () => {
    const pairs = findSimilarPairs([doc("s1", "alice", COPIED), doc("s2", "bob", DIFFERENT)]);
    expect(pairs).toHaveLength(0);
  });

  it("never flags a user against their own other submission", () => {
    const pairs = findSimilarPairs([doc("s1", "alice", COPIED), doc("s2", "alice", RENAMED)]);
    expect(pairs).toHaveLength(0);
  });

  it("respects a custom threshold", () => {
    const docs = [doc("s1", "alice", COPIED), doc("s2", "bob", DIFFERENT)];
    // An impossibly-low threshold surfaces even the weak match.
    expect(findSimilarPairs(docs, { threshold: 0 }).length).toBe(1);
  });

  it("ignores trivially short submissions (too few fingerprints)", () => {
    const tiny = "x=1";
    const pairs = findSimilarPairs([doc("s1", "alice", tiny), doc("s2", "bob", tiny)]);
    expect(pairs).toHaveLength(0);
  });

  it("sorts the most similar pairs first", () => {
    const docs = [
      doc("s1", "alice", COPIED),
      doc("s2", "bob", RENAMED),   // near-identical to alice
      doc("s3", "carol", COPIED),  // identical to alice
    ];
    const pairs = findSimilarPairs(docs, { threshold: 0 });
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].similarity).toBeGreaterThanOrEqual(pairs[i].similarity);
    }
  });
});

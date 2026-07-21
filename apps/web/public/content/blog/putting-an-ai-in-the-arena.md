---
title: "Putting an AI in the Arena — and Making It Play Fair"
date: "2026-07-18"
author: "Matthew"
description: "Code Arena now lets you duel an AI that writes real code, judged on the same hidden tests you get, on the same clock. Here's exactly how it works — the prompt, the sandbox, the full-effort race — and why 'can you beat the AI?' is an honest question and not a party trick."
---

# Putting an AI in the Arena — and Making It Play Fair

Code Arena already had bots. Sixteen of them, with names like *OffByOneOllie* and *SegfaultSam*, seeded across the rating range so a lone player never stares at an empty lobby. But those bots are an illusion, and I've always been upfront about that: they don't write code. A bot "solves" a round when a function decides, from a rating curve, that a player of its skill probably would have by now. It's convincing theater. It is not a competitor.

So when I wanted to add a real headline feature — *duel an AI, live* — the first decision was the whole decision: the AI has to actually play. Same problem, same judge, same clock. If it's going to say "you beat the AI," that has to mean something.

This is how it works, in full, because the fairness only counts if you can see it.

## The contract

When you start a **Challenge the AI** duel, the AI opponent is a player in the match like any other. It is handed exactly the problem statement you see — no hidden hints, no test cases leaked into its prompt. It writes a complete program. That program is compiled and run in the **same Docker sandbox** that grades every human submission, against the **same hidden tests**, under the **same time and memory limits**. The verdict it gets is the verdict the judge returns. Nothing is scripted, and nothing is scored on its behalf.

The nice thing about building this on top of an existing judge is that I didn't have to trust the AI at all. The sandbox was already designed to run untrusted code — that's what a human submission *is*. The AI's program is just one more piece of untrusted code going through the same locked-down path. No new attack surface, no special case.

Mechanically, the AI's turn is almost boring: ask the model for a solution, write it into a submission row, drop it on the judge queue. The verdict comes back through the exact same pipe a human's does and drives the round — first accepted solution takes it. The code that advances the match doesn't know or care whether the submitter was a person.

## The prompt

Here is the actual instruction the model plays under. I'd rather show it than describe it:

> You are an elite competitive programmer in a timed head-to-head coding duel. Solve the problem correctly and quickly. Read all input from standard input and write the answer to standard output, matching the required format exactly. Reply with a single complete program in one of these languages: cpp, py, java, js, go, rs. Put the program in one fenced code block tagged with its language, and put nothing after that block.

Then it gets the problem title, the statement as plain text, and the public examples — the same examples printed on your screen. That's everything. If its first attempt is wrong, it's told the verdict and handed the failing example back, and it gets to try again. Same as you would.

The response is parsed for a single fenced code block, the language tag is mapped onto one the judge supports, and that becomes the submission. If the model rambles or returns nothing runnable, the opponent simply sits the attempt out — no crash, it just concedes the tempo, the way a human loses time when they're stuck.

## A real race

Here's the part I went back and forth on. An early version had a difficulty dial — an "easy" mode where the model got a long artificial thinking pause and no retries, so you could warm up against a throttled opponent. I cut it. A handicapped race isn't a race, and the whole premise of this feature is that the question "can you beat the AI?" is asked honestly.

So now there's one mode: **full effort**. The model starts the moment you do, iterates when it's wrong (up to a bounded retry budget), and submits as fast as it genuinely runs. It gets the same statement, the same judge, the same clock as you — no head start in either direction. If it beats you in forty seconds, that's what actually happened. If you beat it, you *actually beat it*, and nobody can say the bot was sandbagging.

## No signup, and no faucet

The whole thing is meant to be a ten-second demo: land on the homepage, pick your opponent, play. Requiring an account before you've even seen it defeats the purpose, so a logged-out visitor gets a throwaway guest session minted on the fly and drops straight into a duel. Win or lose, there's a nudge at the end to make a real account and keep the record.

"No signup" and "calls a paid model" are in tension, though — an open endpoint that spends money is a bad idea. So AI duels are capped per IP per hour, and each duel has a bounded worst case: a fixed retry budget caps how many times the model can be called in a single match. Generous enough to be fun, finite enough that it can't be turned into a bill.

## Keeping score

Because the AI genuinely plays, it genuinely has a record. There's now a [Humans vs AI](/vs-ai) page: the AI's win rate against real players, and a roster of everyone who's beaten it. AI duels don't touch your ladder rating — you can't farm a bot for points — but beating the AI puts your name on that list, and that list only grows as more people take a swing.

The feature ships dark until a model is actually configured on the server, so none of this turns on by accident. But the design is the message: if you're going to ask "can you beat the AI," the least you can do is make it a fair fight and show your work.

Go [find out](/battle).

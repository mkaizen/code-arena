---
title: "Polishing Game Feel in a Coding Arena"
date: "2026-07-11"
author: "Matthew"
description: "The small, no-new-logic changes that make a real-time coding match feel good to play: editor keyboard shortcuts (and the stale-closure trap they hide), a verdict flash, an auto-scrolling console, and telling the player why a button is disabled."
---

# Polishing Game Feel in a Coding Arena

Most of Code Arena's hard engineering lives in places you never see: the sandbox, the judge queue, the WebSocket fan-out, the rating math. But none of that is what a player actually *feels* during a match. What they feel is the half-second between hitting Submit and knowing whether they nailed it. Whether their hands ever have to leave the keyboard. Whether the screen tells them what just happened.

That layer — game feel — is easy to skip because nothing is broken without it. The match works. Verdicts arrive. But "works" and "feels good" are different bars, and competitive players live at the second one. So I spent a pass doing nothing but polish: no new game logic, no schema changes, just the small stuff that makes the arena feel responsive instead of merely functional. Here's what went in and the one bug that tried to sneak through with it.

## Keep your hands on the keyboard

The single biggest tell that an app wasn't built for its power users is making them reach for the mouse. In a timed match, moving your hand to click **Submit** is friction you feel every single round. Every serious judge — Codeforces, LeetCode, your local IDE — binds submit and run to the keyboard, so the arena should too.

The editor is Monaco, and Monaco lets you register editor-scoped commands on mount:

```typescript
const handleEditorMount: OnMount = (editor, m) => {
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => submitRef.current());
  editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.Enter, () => runRef.current());
};
```

`Cmd/Ctrl+Enter` submits, `Cmd/Ctrl+Shift+Enter` runs the samples. Editor-scoped is the right call here — the binding only fires when the editor has focus, so it never fights with the browser or with typing.

## The trap: commands capture a stale closure

Here's the part that looks trivial and isn't. `addCommand` registers its callback **once**, when the editor mounts. If you hand it your `handleSubmit` function directly, it closes over the version of that function — and all the state it references — from that first render. The match round advances, the problem changes, your component re-renders with fresh `handleSubmit`, and the command is still calling the frozen original. The player presses the shortcut and submits stale code, or nothing.

The fix is a tiny indirection: point the command at a ref, and keep the ref pointing at the latest handler on every render.

```typescript
const submitRef = useRef<() => void>(() => {});
const runRef = useRef<() => void>(() => {});

// Reassigned every render — the command always calls the current handler.
submitRef.current = handleSubmit;
runRef.current = handleRun;
```

The command captures `submitRef` (stable for the component's life), but reads `submitRef.current` at press time, which is always fresh. It's the same stale-closure problem you hit with `setInterval` and event listeners in React, and the same fix. Worth calling out because the buggy version *works in every quick test* — you only catch it when the round rolls over.

I wired the same two shortcuts into all three solve screens — live match, ghost race, and the solo problem page — so the muscle memory transfers everywhere. And the buttons now advertise their shortcut in a tooltip, because a keybinding nobody discovers may as well not exist.

## Make the verdict *land*

When you submit, the result comes back over a WebSocket a moment later and gets appended to the console. Functional — but your eyes are on your code, not the console, so the most important event in the whole match arrives in your peripheral vision.

So the verdict now flashes the editor itself: a green outline on Accepted, red on anything else, for about a second.

```typescript
setFlash(ev.result.verdict === "ACCEPTED" ? "ok" : "bad");
if (flashTimer.current) clearTimeout(flashTimer.current);
flashTimer.current = setTimeout(() => setFlash(null), 1100);
```

```tsx
<div style={{
  transition: "box-shadow 0.15s ease",
  boxShadow: flash === "ok" ? "inset 0 0 0 2px var(--v-ac)"
           : flash === "bad" ? "inset 0 0 0 2px var(--v-wa)"
           : "none",
}}>
```

An inset box-shadow, one state variable, a timer that clears itself. The feedback appears exactly where you're already looking, in the colors the rest of the app already uses for pass and fail. No sound, no confetti — just an unmistakable signal you can't miss.

## Small cuts that add up

Three more that each took minutes and each removed a tiny papercut:

**The console auto-scrolls.** New submissions and verdicts were being appended below the fold of a short scroll box, so the freshest — most relevant — line was the one you couldn't see. A one-line effect pins it to the bottom whenever the log or a run result changes:

```typescript
useEffect(() => {
  const el = consoleRef.current;
  if (el) el.scrollTop = el.scrollHeight;
}, [console_, run.running, run.result]);
```

**A "solved" state that actually says so.** In Battle Royale you can clear the round before it ends, and the old UI just… sat there. Now a green banner confirms it — *Solved ✓ — waiting for the round to end* — so you know you're safe and can either relax or keep sharpening your solution for the speed leaderboard.

**A disabled button that explains itself.** A greyed-out Submit with no explanation is a dead end — is it broken? Are you lagging? The button's tooltip now says *why*: the match is over, or you've been eliminated. Telling the player what's happening costs one string and turns confusion into information.

## Why bother

None of this moves a metric you could point at. It's not a feature. But polish is how a product signals that it respects the person using it — that someone sweated the moment-to-moment experience, not just the feature list. A match where your hands never leave the keyboard, where the verdict slaps you in the eye the instant it lands, where every disabled control tells you why, simply *feels* like it was made by people who play their own game.

A few takeaways from the pass:

- **Bind the keyboard for your power users.** If a timed action requires the mouse, you've added friction to the exact moment that matters most.
- **Put feedback where the eyes already are.** The verdict flash works because it's on the editor, not off in a panel you have to look for.
- **Beware commands that capture closures once.** `addCommand`, `setInterval`, and long-lived listeners all freeze the render they were created in — route them through a ref.
- **A disabled control should explain itself.** "You can't" plus a reason beats a silent grey button every time.

"Works" was never the goal. "Feels good to play" is — and it's built out of a dozen changes this small.

---
title: "Playing to an Empty Arena"
date: "2026-07-15"
author: "Matthew"
description: "Every competitive game has the same cold-start problem: it's only fun with a crowd, and you only get a crowd by being fun. A day spent making the arena feel alive for one person — bots that walk on when the lobby is empty, matches that stop repeating themselves, and a way to react without a keyboard."
---

# Playing to an Empty Arena

Here is the failure mode nobody puts in the demo video. You build a real-time competitive coding platform. The matchmaking works, the judge is fast, the rating math is honest. You open it at eleven at night, click **Queue for Royale**, and watch a counter that says `1 / 6`. It stays at `1 / 6`. It will stay there until five other people who don't exist decide to show up.

That's the whole problem with a competitive game, compressed into one number. It is only fun with a crowd, and it only earns a crowd by being fun. You can't get to the second thing without already having the first. Most of the hard engineering in Code Arena — the sandbox, the queue, the cluster fan-out — assumes the crowd is already there. None of it helps the person staring at `1 / 6`.

So I spent a day on the opposite assumption: that nobody is there. What does the arena owe a single player who showed up wanting a game? It turns out the answer is three different kinds of *aliveness*, and I'd been missing all three.

## The room has to open

The first kind is the most literal. A match has to actually start.

Royale wanted six players; a duel wanted two. Below that number, the queue did nothing but count. There was no timeout, no floor, no fallback — you either summoned a full lobby out of thin air or you sat there. For a platform that hasn't yet reached the point where six strangers are reliably online at 11pm, this isn't a rare edge case. It *is* the experience.

The fix is a piece of stagecraft every multiplayer game runs and few admit to: if the humans don't come, send in bots. Once someone's been waiting, a per-mode timer starts — forty-five seconds for Royale, twenty for a duel — and when it fires, rating-matched bots walk on to fill the empty seats. They're not props. They're the same bots that run practice mode, playing the rounds out at a believable pace, missing some, breaking through on others. The match that assembles around you feels like a lobby that filled up, because functionally it did.

The part I care about more than the timer is the honesty underneath it. A bot is a stand-in, and a stand-in should never cost you something real. So a backfilled match is rated *among the humans only* — the bots are dropped from the Elo recompute entirely, and if you're the only person in the room, the match simply doesn't touch your rating. You can't farm a ladder against a wall of bots, and you can't be punished for a lobby that never filled. The bots make the room feel inhabited without ever making it feel rigged.

Getting that right meant staring at a genuinely nasty seam: a timer firing at the *exact* instant a sixth human finally joins. Two code paths, both convinced they should open the match, both reaching for the same players. The answer was to make claiming a set of queued players atomic — you get the match only if you successfully claimed every seat you meant to, and otherwise you roll back and let the other path win. Unglamorous, but it's the difference between "a match always starts" and "a match always starts, and occasionally a player is in two of them."

## The room can't be the same room twice

The second kind of aliveness I didn't even recognize as missing until I went looking. Royale picked its problems like this: take the six easiest in the bank, in order, every single time.

Read that again with a repeat player's eyes. The *same six problems, in the same order, every match.* The first time it's a competition. The second time it's a memory test. By the third you're not solving, you're transcribing solutions you already wrote. The mode quietly stops being the thing it advertises.

Sameness, I realized, is just emptiness wearing a disguise. An arena that hands you an identical experience on every visit is telling you the same thing an empty lobby does: *nothing is really happening here.* A live game is one where the next match is not the last match.

So problem selection got rebuilt around variety that still respects the shape of a good ladder. Sort the pool by difficulty, cut it into as many bands as the match has rounds, and draw one problem at random from each band. Because the bands never overlap, round one is always from the easy tier and the final round always from the hard one — the ramp survives — but *which* easy problem, *which* hard problem, changes every time. On top of that, the picker avoids anything you've seen in your last few matches, falling back to the full bank only if dodging repeats would starve the ladder. Two matches in a row should never feel like one match played twice.

## The room has to have a pulse

The third kind is the subtlest, and it's pure feel. A match can start, and be fresh, and still feel like you're playing alone in a library. Verdicts arrive, timers tick, and the other players — human or not — are just names sliding around a leaderboard. There's no *presence*.

Real arenas have a crowd noise. Ours got a small one: a handful of emotes you can fire mid-match — a 🔥 when someone lands a brutal problem, an 😮 when the leaderboard flips, an 😅 when you've been fighting the same wrong answer for four minutes. They drift up over the board and fade. That's the entire feature, and it's deliberately tiny: no free text, nothing to moderate, nothing that pulls your hands off the keyboard for more than a keystroke. Presence, not chat.

The detail I like is that it costs the game nothing to route your own reaction through the same path as everyone else's — you send it, the server echoes it back to the whole room, and you see your own 🔥 rise alongside the others'. One code path, no special case for "me." And because the bots are real participants in the match, they react too. A practice room full of bots now has a pulse. It's a cheap trick and it works completely, which is the best kind of trick.

## The room should ask you to stay

There was one more gap, and it was at the exact moment the arena had earned the right to ask for another game and instead just… ended. You'd finish a match and land on a dead screen: here's a share card, here's a replay, goodbye. The single most important number of a ranked match — did my rating go up or down — was buried in grey text in a corner.

So the result screen now counts your new rating up (or down) to its landing spot, in the colors the rest of the app already uses for win and loss, and it puts a **Play Again** button where the dead end used to be. Same mode, one click, straight back into the loop — a fresh practice match, or back into the queue where the backfill guarantees a game is coming. The arena spent the whole match earning a "yes." It should at least ask the question.

## On faking it honestly

I'll admit there's something faintly uncomfortable about a day of work whose theme is *make it feel like more people are here than there are.* It's close to a magic trick, and magic tricks can shade into lies.

The line I settled on is this: it's fine to build the scaffolding of liveness, as long as the scaffolding never lies about stakes. Bots can fill a room — but they can't move your rating. Randomized problems can keep a mode fresh — but the difficulty ramp stays real. Emotes can give a room a pulse — but they're clearly reactions, not a fake chat. And when I found the README still advertising a whole game mode we'd removed months ago, I deleted every trace of it, because *that* is the kind of faking that actually costs you trust. Promise a room and deliver an empty one and people leave for good.

The rest is just holding the door open until the real crowd arrives. Every one of these is scaffolding I'd happily tear out the week there are consistently six humans in the Royale queue at eleven at night. Until then, the arena's job is to feel like a place worth being — even when, for now, it's just you and a room I taught to pretend it's full.

---
title: "Generating Prisma Migrations Offline, Without a Database"
date: "2026-06-20"
author: "Matthew"
description: "How to generate Prisma migration SQL with no database connection using migrate diff and --from-schema-datamodel — why it beats --from-migrations, and a subtle gotcha that can silently corrupt a migration file and break production."
---

# Generating Prisma Migrations Offline, Without a Database

Prisma's happy path for migrations is `prisma migrate dev`: it connects to a database, diffs your schema against it, writes the SQL, and applies it. Lovely — when you have a database handy. But sometimes you don't. You're in a CI job, a sandbox, or an environment where spinning up Postgres just to author a migration is overkill or impossible.

It turns out Prisma can generate a migration entirely offline, from two schema files, with no connection at all. Here's how we do it on Code Arena — and a nasty little gotcha that cost us a production outage the first time we got it wrong.

## The tool: `migrate diff`

The key is `prisma migrate diff`, a lower-level command that computes the SQL to turn one database state into another. It takes a `--from` and a `--to`, and each can be a live database, a migrations folder, or — crucially — **a schema file**.

The tempting option is `--from-migrations`, pointing at your existing `migrations/` directory:

```bash
prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script
```

But run that and Prisma stops you:

```
Error: You must pass the --shadow-database-url if you want to diff a migrations directory.
```

To replay a migrations folder into a state it can diff against, Prisma needs a scratch ("shadow") database. That's the very database dependency we're trying to avoid.

## Diff two schema *files* instead

The trick is to give both sides as schema datamodels. The "from" is the schema **as it was before your change** (i.e. the version committed in git); the "to" is your edited schema. Prisma diffs the two datamodels directly — pure schema-to-schema, no database, no shadow DB:

```bash
# The previous, committed schema:
git show HEAD:prisma/schema.prisma > /tmp/old-schema.prisma

# Diff old -> new, straight to a migration file:
prisma migrate diff \
  --from-schema-datamodel /tmp/old-schema.prisma \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > prisma/migrations/$(date +%Y%m%d%H%M%S)_my_change/migration.sql
```

That writes exactly the `ALTER TABLE` / `CREATE TABLE` statements needed, with no connection whatsoever. You review the SQL, commit it alongside the schema change, and `prisma migrate deploy` applies it in production like any other migration.

Two things make this robust in a locked-down environment:

- Prisma's engines need to be present but not *connected*. If your sandbox has them cached, point `PRISMA_SCHEMA_ENGINE_BINARY` at the cached binary and it runs fully offline.
- Because the "from" side is literally your last committed schema, the generated migration is exactly the delta of your working change — nothing more, nothing less.

## The gotcha that broke production

Here's the part worth the price of admission. Our first offline migrations worked. Then one deploy failed on boot with:

```
Database error code: 42601
ERROR: syntax error at or near "npm"
Migration name: 20260709000000_ghost_racing
```

`npm`? There's no `npm` in a SQL file. Except there was. We'd generated the migration with a command like:

```bash
npx prisma migrate diff ... --script 2>&1 | tee migration.sql
```

Two mistakes compounded. The `2>&1` merged **stderr into stdout**, and `npx`, on that run, printed a friendly notice to stderr:

```
npm notice New major version of npm available! ...
```

The `| tee migration.sql` then wrote *everything* — the SQL **and** the npm notice — into the file. The result was a `.sql` that ended with:

```sql
ALTER TABLE "GhostRun" ADD CONSTRAINT ...;

npm notice
npm notice New major version of npm available! 10.9.7 -> 11.18.0
```

Postgres parsed the valid statements, hit `npm`, and threw a syntax error. `prisma migrate deploy` failed, the API container never became healthy, and every service that depended on it refused to start. CI never caught it, because CI type-checks and builds — it doesn't run `migrate deploy` against a real database.

## The fix, and the lesson

The fix is one character's worth of discipline: **never merge stderr into a file you're generating.** Write stdout only, and let stderr go to the terminal (or `/dev/null`):

```bash
prisma migrate diff \
  --from-schema-datamodel /tmp/old-schema.prisma \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script 1> migration.sql 2>/dev/null
```

And because a migration file is generated code that you rarely re-read line by line, we added a cheap guard — a grep that fails the build if a "migration" ever contains anything that isn't SQL:

```bash
grep -qiE 'npm notice|Tip:|Prisma schema loaded' migration.sql && {
  echo "migration file is contaminated with tool output"; exit 1;
}
```

Recovering the stuck production database, once we understood it, was straightforward: the migration had rolled back cleanly (Prisma wraps each in a transaction), so we cleared the failed record from `_prisma_migrations`, shipped the corrected file, and redeployed.

## Takeaways

- **You don't need a database to author a Prisma migration.** `migrate diff --from-schema-datamodel <old> --to-schema-datamodel <new> --script` produces the SQL from two schema files alone.
- **Prefer schema-to-schema over `--from-migrations`**, which demands a shadow database and reintroduces the dependency you're trying to shed.
- **Never pipe `2>&1` into a generated artifact.** Tool chatter on stderr will silently contaminate the file, and a `.sql` full of "npm notice" fails in the worst place — production migration, not CI.
- **Guard generated files.** A one-line grep that rejects non-SQL in a migration would have turned a production outage into a failed build.

Offline migrations are a genuinely useful capability once you know the incantation. Just keep the tool's opinions out of the file.

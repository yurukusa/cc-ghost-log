# cc-ghost-log

See what your AI did while you were gone.

**Try it in your browser:** [yurukusa.github.io/cc-ghost-log](https://yurukusa.github.io/cc-ghost-log/)

```
npx cc-ghost-log
```

Shows **git commits** from **Ghost Days** — days when Claude Code's autonomous subagents ran while you had zero interactive sessions.

## Sample output

```
  cc-ghost-log  What your AI did while you were gone
  ════════════════════════════════════════════════════

  39 Ghost Days  · 52.4h total · showing 10

  ▸ 2026-02-21  Sat, Feb 21  AI: 2.2h  You: 0h
    ~/projects/cc-loop
      814df93  16:54  init: cc-loop project setup
    ~/projects/spell-cascade
      1504698  15:07  feat: Run history on title screen (improvement 216)
      725b836  14:51  feat: Title screen streak display (improvement 215)
      58439ab  14:46  feat: Daily streak counter (improvement 214)
      +17 more

  ▸ 2026-02-18  Wed, Feb 18  AI: 1.0h  You: 0h
    ~/projects/spell-cascade
      28aee3a  23:31  build: Loop 3 complete (improvements 77-100)
      c25b446  22:53  feat: quality loop 2 — improvements 21-50
      +6 more
```

## What is a Ghost Day?

A **Ghost Day** is a day where:
- You had **zero interactive Claude Code sessions** (you didn't open a terminal)
- Claude Code's **autonomous subagents ran anyway** (scheduled tasks, pipelines, etc.)

Your autonomous setup kept working while you were completely offline.

## Options

```bash
npx cc-ghost-log                       # Show last 10 Ghost Days
npx cc-ghost-log --days=20             # Show last 20 Ghost Days
npx cc-ghost-log --json                # JSON output (for scripting)

npx cc-ghost-log --yesterday           # Show yesterday's Ghost Day
npx cc-ghost-log --yesterday --summary # Markdown report of yesterday
npx cc-ghost-log --yesterday --tweet   # Tweet-ready text (280 chars)
npx cc-ghost-log --check-yesterday     # exit 0 = Ghost Day, exit 1 = not
```

## Automate your daily AI activity report

Set up a cron job that writes a Markdown report every morning Ghost Days occur:

```bash
node node_modules/cc-ghost-log/setup-cron.mjs
# or after npx install:
npx cc-ghost-log --check-yesterday && npx cc-ghost-log --yesterday --summary
```

Reports are saved to `~/ops/ghost-reports/YYYY-MM-DD.md`.

## How it works

1. Scans `~/.claude/projects/` for session transcripts
2. Separates interactive (you) vs. subagent (AI) sessions by directory structure
3. Identifies Ghost Days where subagent hours > 0 and your hours = 0
4. Runs `git log` on your local repos for those dates
5. Shows commits AI made while you were gone

**Zero dependencies. No data sent anywhere. Runs entirely local.**

## Related tools

| Tool | What it shows |
|------|---------------|
| **cc-ghost-log** | What AI committed on days you were gone |
| [cc-agent-load](https://yurukusa.github.io/cc-agent-load/) | You vs AI time split + Activity Calendar |
| [cc-session-stats](https://yurukusa.github.io/cc-session-stats/) | Total usage stats |
| [cc-personality](https://yurukusa.github.io/cc-personality/) | Your developer archetype |

All tools: [cc-toolkit](https://yurukusa.github.io/cc-toolkit/)

## License

MIT

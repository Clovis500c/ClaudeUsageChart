# ClaudeUsageChart

Your **Claude Code stats card** — sessions, messages, tokens, peak hour, favorite model and an activity heatmap — in your GitHub profile README, refreshed automatically.

<img src="example.svg" alt="example card" />

## Quick start

```bash
npx claude-usage-chart setup
```

It will:
1. read your local Claude Code history (`~/.claude/projects`),
2. render the card (dark by default),
3. upload it to your profile repo (`<you>/<you>` by default),
4. schedule an hourly refresh on your machine,
5. print the snippet to paste in your `README.md`:

```html
<img alt="Claude stats" src="https://raw.githubusercontent.com/<you>/<you>/HEAD/claude-stats/claude-stats.svg" />
```

## Themes

| `--theme` | Result |
|---|---|
| `dark` (default) | Dark card, like the Claude app |
| `light` | Light card |
| `auto` | Both versions; the README shows the one matching the visitor's GitHub theme (the snippet uses a `<picture>` tag) |

Requirements: Node 18+, and either the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`) or a `GITHUB_TOKEN` env var with `contents: write` on the target repo.

## Commands

| Command | What it does |
|---|---|
| `claude-usage-chart setup` | Guided setup (push + hourly refresh + snippet) |
| `claude-usage-chart` | Write `claude-stats.svg` in the current folder |
| `claude-usage-chart push --repo owner/name` | Render and upload (only commits when something changed) |
| `claude-usage-chart unschedule` | Remove the hourly refresh |

Options: `--theme dark|light|auto`, `--lang fr|en`, `--range all|30d|7d`, `--dir <folder in repo>`, `--branch <name>`, `--out <local folder>`.

## Why not a GitHub Action like the snake?

The contribution snake reads data that lives on GitHub. Your Claude usage only lives **on your computer** — Anthropic has no public API for personal (Pro/Max) usage. So the refresh runs locally (Windows Task Scheduler, or cron on macOS/Linux) and pushes the SVG; the card updates whenever your machine is on.

## Privacy

Only aggregated numbers end up in the SVG (counts, token total, per-day message counts, model name). No prompts, file names or project names leave your machine.

## How the numbers are computed

Same method as the Claude desktop client's stats card:
- **Sessions**: distinct session ids · **Messages**: user + assistant turns (subagents excluded)
- **Total tokens**: input + output tokens · **Peak hour**: hour at which sessions most often start
- **Heatmap**: messages per day over the last 26 weeks

Note: stats only cover the transcripts still on disk. Claude Code can clean up old transcripts (see the `cleanupPeriodDays` setting in `~/.claude/settings.json`); raise it to keep a longer history.

## License

MIT

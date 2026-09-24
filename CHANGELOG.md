# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-09-24

### Added
- `--version` / `-v` flag.
- Readable summary after a local render instead of the raw stats object.
- Unit tests (`npm test`) and CI on Linux, macOS and Windows with Node 18, 20 and 22.
- Release workflow: pushing a `v*` tag publishes the release and its `claude-usage-chart.tgz`.
- Issue templates, changelog.

### Fixed
- Scheduled refresh on macOS/Linux broke when an option (such as `--title`) contained `%`, and could expand `$`, backticks or quotes in the shell.
- Scheduled refresh when first run through `npx` pointed at a package that isn't on npm; it now uses the latest GitHub release.
- Invalid `--theme`, `--lang`, `--range` or `--repo` values are now rejected instead of silently ignored.
- `--dir` values with spaces or special characters are now URL-encoded for the GitHub API.

### Changed
- README rewritten: requirements, option tables, troubleshooting, uninstall and contributing sections.

## [0.5.1] - 2026-09-22

### Added
- Claude logo in the card header.
- Customization: heatmap palettes, accent color, title, tiles, sections, heatmap length, transparent background.

## [0.5.0] - 2026-09-22

### Added
- Token breakdown, models and top tools sections; book-length comparison.
- Configurable refresh frequency; de-duplicated, honest stats.
- English and French cards, light/dark/auto themes, guided `setup`.

[Unreleased]: https://github.com/Clovis500c/ClaudeUsageChart/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/Clovis500c/ClaudeUsageChart/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/Clovis500c/ClaudeUsageChart/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/Clovis500c/ClaudeUsageChart/releases/tag/v0.5.0

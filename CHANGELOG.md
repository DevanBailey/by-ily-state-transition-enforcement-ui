```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-03-06

### Added

- Initial extraction from enterprise portfolio management platform (MVP 1.1)
- `StateTransitionEnforcement` React component — single-file, self-contained
- Motoko backend canister with `attemptTransition`, `resolveOpenTasks`, and `getEntities` public API
- Strict forward-only transition enforcement for three entity types:
  - Projects: `draft → active → completed → archived`
  - Collections: `active → archived`
  - Tasks: `todo → inProgress → completed → archived`
- Precondition guard: blocks `active → completed` on Projects when `openTaskCount > 0`
- Inline error feedback co-located with the triggering control
- Test harness button for adversarial backward-transition coverage
- `StatusBadge` sub-component with OKLCH semantic status colors
- `useTransitionGuard` hook exposing `getValidNextStates`, `getPreviousState`, `getStatusLabel`
- `dfx.json` minimal deployment configuration
- `examples/usage.md` integration walkthrough
- MIT license

### Stripped from platform version

- Phase tracking variables and build metadata
- Inter-canister call logic and platform-specific canister IDs
- Cross-entity dependency resolution (asset tokenization, governance)
- TODO anchors and implementation stubs
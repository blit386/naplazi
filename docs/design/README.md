# Design documents

- [`game.md`](./game.md) - Beach Detector as it plays today: the feel, the loop, every system, the module map. Intent
  lives here; the code in `src/` is the source of truth for behavior.
- [`roadmap.md`](./roadmap.md) - everything planned but not built: the lane-based redesign with its tasks in build
  order, and the open code cleanup.

Keep them honest: when code changes behavior, update `game.md` in the same change; when a roadmap item ships, move its
description into `game.md` and delete it from `roadmap.md`. No dates, commit notes, or transient todos in `game.md`.

## Labels in code comments

- "PLAN.md section 4.6" (and similar) means the same section number in `game.md`.
- `TASK-nnn` refers to the task list the game was built from during the July 2026 jam. It has been retired; the original
  Czech plans and task lists are in git history (`git show a52067a:docs/design/original/TODO.md`, and
  `docs/design/revised/` in the same commit).

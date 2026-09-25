# Design documents

The planning documents of Beach Detector, brought over from the July 2026 game jam repo (recovered from its git history,
where they had been removed as superseded). Most are written in Czech. They are history, not a spec: the code in `src/`
is the source of truth, and where the two disagree the code wins. Nothing here is loaded automatically; open a file only
when you want the reasoning behind a decision.

## `original/` - what the game was built from

- `PLAN.md` - the design brief, in English. Comments in `src/` that say "PLAN.md section 4.x" point at its numbered
  sections.
- `TODO.md` - the task list, in Czech. Comments in `src/` that say `TASK-nnn` point at its tasks.

## `revised/` - the plan after the "grill session"

A later rethink of the game: the player walks on their own through five lanes, a tap changes lane, and a find panel and
backpack are added. It was written after most of the original was built.

- `PLAN_new.md` - the revised design brief, in Czech. It mentions `TODO_after.md`, which was later replaced by the
  `TODO.md` next to it.
- `TODO.md` - the revised task list, in Czech. It reuses many `TASK-nnn` numbers with different content (TASK-008 is
  lane moves here, side-steps in the original), so a `TASK-nnn` comment in `src/` means the original list. All its tasks
  are marked done, but the modules written for it (`Lanes`, `Backpack`, `Haptics`, `Pause`, `SignalBar`) are not
  imported by `src/game.ts`; the game as wired still plays the original, side-stepping design. `knip.json` lists them
  under `ignore`.
- `IDEA_suggest.md` - proposals for simplifying the code, in Czech.

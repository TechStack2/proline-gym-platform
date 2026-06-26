# CODER PROMPT PWD-FOCUS — first-login password field loses focus after every keystroke

> **For:** the coding agent · **Issued by:** Project Auditor · **Branch:** `prompt-pwd-focus` off `main`. **Frontend-only bug fix; no backend.** **Owner-reported:** on first login, the new-password field lets the user type only **one character before the cursor jumps out** — they must re-click the field for each character. Classic React remount-on-render focus loss.

## Root cause (recon-confirmed)
[`src/app/[locale]/onboarding/onboarding-client.tsx`](src/app/[locale]/onboarding/onboarding-client.tsx) builds the `steps` array — **including the password `<Input value={pw} onChange={e=>setPw(e.target.value)} />` JSX (~:84–162)** — **inside the component render body**. Every keystroke → `setPw` → parent re-render → a **new `steps` array with new `<Input>` instances** → the input is **remounted** → focus is lost after one char. (`steps.splice(...)` for the waiver step at ~:149 is part of the same per-render rebuild.) The `Input` component itself (forwardRef) is fine.

## Fix — stop the inputs remounting on each keystroke
Restructure so the password inputs are **stable across renders**:
- Pull the password step's content into a **stable component** (module-level or a memoized render) so typing doesn't recreate the `<Input>` instances — OR `useMemo` the `steps` content with correct deps such that the input elements aren't new objects per keystroke. The new-password + confirm-password inputs must **keep focus** while typing a full password.
- Keep the existing validation/gating (password rules, confirm-match, step-count) intact — note the wizard's optional-waiver step + the step-count contract ([[onboarding-wizard-step-count-contract]]): don't break the Next-click step counting.

## Out of scope
Auth/credential logic; the invite flow; other onboarding steps' behavior; backend.

## Verify
1. On the first-login onboarding password step, **type a multi-character password without re-clicking** — focus stays in the field the whole time (the bug repro: type "abc" → only "a" lands → after fix, "abc" lands). Same for the confirm field.
2. Validation + step progression unchanged; `/ar` (RTL) + `/en` correct.
3. **TARGETED run** (`-f projects="<on1/onboarding>"`) — add/extend an assertion that types a multi-char password into the new-password field and asserts the field value equals the full string (fails on the remount bug, passes on the fix).

## Acceptance
1. The new-password + confirm fields hold focus across keystrokes on first-login onboarding; validation/steps intact; `/ar`+`/en`; frontend-only; green on a targeted run (run ID/URL).

## Hygiene
Branch `prompt-pwd-focus` off `main`; **dev port 3000**; scoped `git add`; **no Claude/Co-Authored-By trailer**; **validate TARGETED**; **DO NOT merge** — report "PWD-FOCUS ready" + run ID; the auditor merges.

## Update the progress file
Append to `docs/audit/audit-cycle-update.md` → `## Cycle 6 / PWD-FOCUS — first-login password field focus`: the remount root cause (steps/inputs rebuilt per render), the stabilization fix, the typed-multichar guard, the run ID, an explicit **"new-password field holds focus across keystrokes; validation/steps intact; /ar+/en: PASS/FAIL"** line, and a DRAG READ.

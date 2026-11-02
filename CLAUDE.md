# Pixel Siege — project notes for Claude

Browser-based top-down retro shooter. Plain HTML5 canvas + vanilla JS, no build
step: open `index.html` to run. See README.md for controls and file layout.

## Workflow: always use Git + GitHub

- Remote: `origin` → GitHub repo `Chigozie-Iroegbulam/pixel-siege` (public), branch `main`.
- Hosted on GitHub Pages from `main` (root): https://chigozie-iroegbulam.github.io/pixel-siege/
  Every push to `main` redeploys the live game.
- After every meaningful change: stage, commit with a clean message, and push to `origin main`.
- Keep commits small and focused (one logical change each) so any change is easy to revert.
- Commit message style: imperative summary line (≤ 60 chars, e.g. "Add shotgun power-up"),
  blank line, then a short body describing what changed and why when it's not obvious.
- Before committing, syntax-check the JS (macOS JavaScriptCore:
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -e "checkSyntax('file.js')"`).
- Never force-push or rewrite pushed history; to undo, use `git revert`.

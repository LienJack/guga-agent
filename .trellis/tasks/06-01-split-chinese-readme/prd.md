# docs: split Chinese README from English root

## Goal

Make the root `README.md` English-only and move the Chinese content into a dedicated Chinese README that users can reach through the language switcher.

## Requirements

- Root `README.md` must contain only English prose, aside from language names in the switcher.
- Add a dedicated Simplified Chinese README.
- Update README language switchers so Chinese points to the Chinese README.
- Keep existing Japanese README available through the switcher.
- Commit and push the result to `origin/main`.

## Acceptance Criteria

- [ ] `README.md` no longer contains the Chinese documentation section.
- [ ] `README.zh.md` exists and contains the Chinese documentation.
- [ ] `README.md`, `README.en.md`, and `README.ja.md` language switchers point to `README.zh.md` for Chinese.
- [ ] Changes are committed and pushed.

## Out Of Scope

- Runtime code changes.
- Rewriting package-level READMEs.
- Translating or restructuring the Japanese README body.

## Technical Notes

- Relevant guidance: `.trellis/spec/backend/index.md` says documentation should be written in English.
- This task intentionally preserves the project-level multilingual docs while making the primary README English-first and English-only.

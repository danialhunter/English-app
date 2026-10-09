# Version 2.5.0 — simplified production workflow

The final-product request implements the simplified preview amendment recorded in `docs/learning-workflow-review-2026-09-27.md`. The daily screen uses one assessment per target, explicit Finished, and direct Practice / Review / Exam / Report navigation. Understanding observation and With help are not assessment fields.

## Learning and preservation

- Same-month early completion retains its scheduled week. Only a real blocked month boundary triggers the post-Finished checkpoint alert.
- Each child passes their own monthly exam; class statistics do not impose a shared lock. New exams require 80% overall plus a strict majority in each category, with every sampled item assessed.
- Existing exam drafts keep their original sample, scoring, answers, dates and notes. Completed attempts remain historical evidence.
- Separate review records do not change lesson marks, erase earlier achievements or invalidate a pass. Genuine exam corrections preserve the original with a dated reason and require reassessment.
- Future expectation adjustments are prospective and audited, not retroactive grading changes.
- Schema 7 preserves legacy records and adds review/goal/correction data. Mac and Windows retain the original app identities and storage locations. Installers contain no teacher records or class names.

## Verification

All data tests use synthetic fixtures, an isolated browser origin or temporary storage. Live teacher Application Support data was not accessed.

- Engine suites: model 21, scheduled weeks 13, checkpoints 10, monthly exams 33, exam policy 16, old-release migration 4 and new learning workflow 11 checks passed.
- App regression suite: 10 checks passed. Production browser teacher-flow checks cover explicit Finished, same-month progression, individual gates, direct navigation, separate review, future goals, exam pause/resume and backup-restore cache freshness.
- Native Mac WebKit test with 25 synthetic children and historical records: child switch 16 ms, Knows it 14 ms, Needs practice 12 ms, next week 12 ms, last unlocked week 13 ms, locked next month 8 ms. These are local test timings, not a guarantee for every device.
- Original PDF is bundled byte-for-byte. Curriculum and guide audits passed: 216 existing weekly lessons, 647 guide entries, 1,096 topic vocabulary terms, 220 sight words, 152 functional phrases and 44 original guide pages.
- Excel import checks passed, including Chinese names, duplicates and template structure.
- Family report suite: 27 checks passed, including two native formula-backed charts, missing-data gaps, one-child privacy, review evidence separated from historical learning and dated corrections. Artifact Tool import/recalculation/render/export/reimport checks passed for populated, single-point and empty reports.
- CUA visual checks: desktop and 390 px narrow layouts, selected-state feedback, scroll/keyboard reachability, actual Review/Exam/Report navigation and no automatic completion from Knows all. A final bounded pass consolidated duplicate completion notices.

See the release folder's package verification report for final installer hashes, bundle contents, persistence smoke results and signing/platform limitations. Windows is cross-built on macOS and has not been installed on a real Windows computer here. Mac is ad-hoc signed, not notarized; Windows is unsigned. A real teacher pilot remains necessary to evaluate educational usefulness and longer-term usability.

import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = [
  "model-regressions.mjs", "week-plan-regressions.mjs",
  "monthly-exams-regressions.mjs", "exam-policy-v3-regressions.mjs",
  "exam-checkpoint-regressions.mjs", "learning-workflow-2.5-regressions.mjs",
  "app-regressions.mjs", "progress-report-regressions.mjs",
  "family-report-regressions.mjs", "curriculum-check.mjs",
  "guide-check.mjs", "roster-import-check.mjs"
];
for (const suite of suites) {
  console.log(`\nChecking ${suite}`);
  const result = spawnSync(process.execPath, [path.join(root, "work/seahorse_app/tests", suite)], {cwd: root, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("\nAll core checks passed. Test fixtures contain no real class records.");

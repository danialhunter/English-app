import assert from 'node:assert/strict';
import {savedHistory,modules,clone,clock} from './saved-history-fixture.mjs';
const {E}=modules(),start='2026-09-01';
const state=savedHistory(3),frozen=clone(state.monthlyExams.rounds[`perf::${start}`]);
const options={week:'2026-09-14',today:new Date(clock)};
function checkFresh(s) {
  const before=JSON.stringify(s);
  const expected=s.students.filter(child=>child.active!==false).map(child=>E.checkpoint(s,child,options)).filter(result=>result.required).sort((a,b)=>a.periodStart.localeCompare(b.periodStart));
  const actual=E.classCheckpoint(s,'perf',options);
  assert.deepEqual(clone(actual.children),clone(expected),'Batch calculation must match independent fresh child checkpoints');
  assert.equal(JSON.stringify(s),before,'Checkpoint reads must not change saved history');
  return actual;
}
assert.deepEqual(clone(E.previewRound(state,'perf',start).cohort),frozen.cohort);
checkFresh(state);
// Returned snapshots cannot mutate saved data or poison subsequent reads.
const returned=E.classCheckpoint(state,'perf',options);
returned.summary.children[0].readiness.missing.length=0;
returned.summary.children[0].draft.notes='Do not save';
checkFresh(state);
assert.deepEqual(clone(state.monthlyExams.rounds[`perf::${start}`]),frozen);

// Old frozen assignments remain authoritative after a name or lesson edit.
state.students[0].englishName='Renamed synthetic child';
state.records['child-0::2026-09-14'].lesson.words[0]='Changed current plan';
state.records['child-0::2026-09-14'].manuallyAssigned=true;
assert.deepEqual(clone(E.previewRound(state,'perf',start).cohort),frozen.cohort);
checkFresh(state);

state.students.push({id:'newcomer',classId:'perf',englishName:'New synthetic child',chineseName:'',active:true,startWeek:'2026-09-21',startUnit:0,joinedAt:'2026-09-21T04:00:00.000Z'});
let preview=E.previewRound(state,'perf',start);
assert.deepEqual(clone(preview.cohort.slice(0,3)),frozen.cohort);
assert.equal(preview.cohort[3].studentId,'newcomer');assert.equal(preview.cohort[3].countsForClass,false);
assert.deepEqual(clone(preview.cohort[3].lessons.map(item=>item.weekStart)),['2026-09-21','2026-09-28']);
assert.equal(E.roundStatus(state,'perf',start).eligible,3);checkFresh(state);

state.students[1].active=false;
assert.equal(E.roundStatus(state,'perf',start).eligible,2);
assert.deepEqual(clone(E.previewRound(state,'perf',start).cohort[1]),frozen.cohort[1]);checkFresh(state);
state.students[1].active=true;
assert.equal(E.roundStatus(state,'perf',start).eligible,3);
assert.deepEqual(clone(E.previewRound(state,'perf',start).cohort[1]),frozen.cohort[1]);checkFresh(state);

// Reusing the exact same state object between edits must never reuse a stale summary.
E.setAbsence(state,'perf',start,'child-1',true);
assert.equal(E.roundStatus(state,'perf',start).absent,1);checkFresh(state);
E.setAbsence(state,'perf',start,'child-1',false);
assert.equal(E.roundStatus(state,'perf',start).absent,0);checkFresh(state);
const attempt=state.monthlyExams.rounds[`perf::${start}`].attempts['child-1'].history.at(-1);
attempt.itemIndexes.forEach(index=>attempt.itemStates[index]='known');
assert.equal(E.roundStatus(state,'perf',start).passed,1);checkFresh(state);
attempt.itemIndexes.forEach(index=>attempt.itemStates[index]='learning');
assert.equal(E.roundStatus(state,'perf',start).passed,0);checkFresh(state);
const beforeReady=E.readiness(state,'perf',start,'child-2').finished;
state.records['child-2::2026-09-14'].practiceFinished=true;
assert.equal(E.readiness(state,'perf',start,'child-2').finished,beforeReady+1);checkFresh(state);
state.records['child-2::2026-09-14'].practiceFinished=false;
assert.equal(E.readiness(state,'perf',start,'child-2').finished,beforeReady);checkFresh(state);
console.log('PASS frozen snapshots, newcomer/withdrawal/restore, pure batched reads, and fresh results after edits.');

(function () {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const marks = ["unassessed", "learning", "known"];
  const scoringRules=["overall-majority-v1","legacy-sampled-v1","legacy-full-v1"];
  const model = () => window.TrackerModel;
  const now = () => new Date().toISOString();
  const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
  function day(value = new Date()) {
    if (typeof value === "string" && validDay(value)) return value;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid exam date.");
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function addDays(value, count) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+count); return date.toISOString().slice(0,10); }
  const dayGap = (from,to) => Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000);
  const roundId = (classId,start) => `${classId}::${start}`;
  const samePolicy=(a,b)=>["startPeriod","periodKind","passPercent","classPassPercent","requireIndividualPass"].every(field=>a[field]===b[field]);
  function getClass(state,id) { const group=state.classes.find(item=>item.id===id); if (!group) throw new Error("This class is missing."); return group; }
  function defaults(group, date = new Date()) { return {startPeriod:day(date).slice(0,7)+"-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true}; }
  function validatePolicy(policy) {
    if (!object(policy) || !validDay(policy.startPeriod) || !["calendar","fourWeeks"].includes(policy.periodKind) || !Number.isInteger(policy.passPercent) || policy.passPercent<1 || policy.passPercent>100 || policy.classPassPercent!==80 || typeof policy.requireIndividualPass!=="boolean") throw new Error("The monthly exam policy is invalid. The class pass requirement must be 80%.");
    if (policy.periodKind==="calendar" && !policy.startPeriod.endsWith("-01")) throw new Error("Calendar exams must start on the first of a month.");
    if (policy.periodKind==="fourWeeks" && model().monday(policy.startPeriod)!==policy.startPeriod) throw new Error("Four-week exams must start on a Monday.");
  }
  function periodFor(group, value) {
    const date=day(value), policy=group.monthlyPolicy || defaults(group);
    let start,end,index;
    if (policy.periodKind==="fourWeeks") {
      index=Math.floor(dayGap(policy.startPeriod,date)/28); start=addDays(policy.startPeriod,index*28); end=addDays(start,27);
    } else {
      start=date.slice(0,7)+"-01";
      const next=new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1); end=addDays(next.toISOString().slice(0,10),-1);
      index=(Number(start.slice(0,4))-Number(policy.startPeriod.slice(0,4)))*12+Number(start.slice(5,7))-Number(policy.startPeriod.slice(5,7));
    }
    const label=policy.periodKind==="calendar" ? new Date(`${start}T12:00:00Z`).toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}) : `${start} – ${end}`;
    return {id:start,start,end,label,kind:policy.periodKind,index};
  }
  function periods(group,from,to) {
    const first=periodFor(group,from), last=periodFor(group,to), result=[];
    for(let current=first;current.start<=last.start;current=periodFor(group,addDays(current.end,1))) {
      if (result.length>=2400) throw new Error("Choose an exam range shorter than 200 years.");
      result.push(current);
    }
    return result;
  }
  function lessonItems(lessons) {
    return lessons.flatMap(({weekStart,unitIndex,lesson})=>[
      ...lesson.words.map((text,wordIndex)=>({id:`${weekStart}:${unitIndex}:word:${wordIndex}`,kind:"vocabulary",text,weekStart,unitIndex,wordIndex,...(lesson.expectations ? {expectation:lesson.expectations[wordIndex]} : {})})),
      {id:`${weekStart}:${unitIndex}:sentence`,kind:"sentence",text:lesson.sentence,weekStart,unitIndex,wordIndex:null,...(lesson.expectations ? {expectation:lesson.expectations[5]} : {})}
    ]);
  }
  function plannedLessons(state,child,period) {
    const lessons=[];
    let week=model().monday(period.start);
    if(week<period.start) week=addDays(week,7);
    if(week<child.startWeek) week=child.startWeek;
    if(child.joinedAt) {
      const joinedWeek=model().monday(day(child.joinedAt));
      if(week<joinedWeek)week=joinedWeek;
    }
    for(;week<=period.end;week=addDays(week,7)) {
      const plan=model().scheduledPlan(state,child,week);
      const lesson=copy(plan.lesson);
      if(window.LearningReview && !lesson.expectations)lesson.expectations=window.LearningReview.expectations(state,child,week,{unitIndex:plan.unitIndex,lesson});
      lessons.push({weekStart:week,unitIndex:plan.unitIndex,lesson,requiresOwnWeek:Boolean(plan.explicitRepeat || plan.manuallyAssigned)});
    }
    return lessons;
  }
  function buildCohort(state,group,period,existingIds) {
    return state.students.filter(child=>!existingIds?.has(child.id) && child.classId===group.id && child.active!==false && child.startWeek<=period.end).map(child=>{
      const lessons=plannedLessons(state,child,period);
      const countsForClass=!child.joinedAt || period.start>periodFor(group,day(child.joinedAt)).start;
      return {studentId:child.id,name:child.englishName || child.chineseName,englishName:child.englishName,chineseName:child.chineseName,countsForClass,lessons,items:lessonItems(lessons)};
    }).filter(child=>child.items.length);
  }
  function previewRound(state,classId,start) {
    const group=getClass(state,classId), period=periodFor(group,start);
    if(period.start!==start) throw new Error("Select the start of an exam period.");
    const existing=state.monthlyExams?.rounds?.[roundId(classId,start)];
    if(existing) {
      const round=copy(existing),ids=new Set(round.cohort.map(child=>child.studentId));
      // Frozen assignments are authoritative. Only newcomers need new plans;
      // rebuilding existing members would discard the work and their new plans.
      for(const child of buildCohort(state,group,period,ids)) {
        const student=state.students.find(item=>item.id===child.studentId);
        const countsForClass=student.joinedAt ? child.countsForClass : period.start>periodFor(group,student.startWeek).start;
        round.cohort.push({...child,countsForClass});
      }
      return {...round,frozen:true,period,label:period.label};
    }
    return {id:roundId(classId,start),classId,periodStart:period.start,periodEnd:period.end,policySnapshot:copy(group.monthlyPolicy || defaults(group)),cohort:buildCohort(state,group,period),attempts:{},absences:{},startedAt:null,frozen:false,period,label:period.label};
  }
  const allIndexes=total=>Array.from({length:total},(_,index)=>index);
  const selectedIndexes=(attempt,total)=>attempt?.itemIndexes ? [...attempt.itemIndexes] : allIndexes(total);
  const itemKind=(items,index)=>items?.[index]?.kind || (index%6===5 ? "sentence" : "vocabulary");
  function sampleIndexes(round,child) {
    let seed=0;for(const char of `${round.id}:${child.studentId}`)seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;
    const chosen=[];
    for(const kind of ["vocabulary","sentence"]) {
      const indexes=child.items.map((item,index)=>item.kind===kind ? index : -1).filter(index=>index>=0);
      const count=indexes.length ? Math.floor(indexes.length/2)+1 : 0,offset=seed%Math.max(1,indexes.length);
      for(let i=0;i<count;i++)chosen.push(indexes[(Math.floor((i+0.5)*indexes.length/count)+offset)%indexes.length]);
    }
    return chosen.sort((a,b)=>a-b);
  }
  function previewAssessment(round,studentId) {
    const child=round.cohort.find(item=>item.studentId===studentId);
    if(!child)return {itemIndexes:[],items:[],total:0,poolTotal:0,sampled:false,mode:"sampled",vocabularyTotal:0,sentenceTotal:0};
    const attempts=round.attempts[studentId],attempt=attempts?.draft || attempts?.history?.at(-1);
    const itemIndexes=attempt ? selectedIndexes(attempt,child.items.length) : sampleIndexes(round,child);
    const sampled=!attempt || Boolean(attempt.itemIndexes);
    return {itemIndexes,items:itemIndexes.map(index=>({...copy(child.items[index]),itemIndex:index})),total:itemIndexes.length,poolTotal:child.items.length,sampled,mode:sampled ? "sampled" : "legacy-full",vocabularyTotal:itemIndexes.filter(index=>child.items[index].kind==="vocabulary").length,sentenceTotal:itemIndexes.filter(index=>child.items[index].kind==="sentence").length};
  }
  function readiness(state,classId,start,studentId) {
    const member=previewRound(state,classId,start).cohort.find(child=>child.studentId===studentId);
    return readinessForMember(state,start,member);
  }
  function readinessForMember(state,start,member) {
    if(!member)return {ready:false,finished:0,total:0,missing:[]};
    const studentId=member.studentId;
    const child=state.students.find(item=>item.id===studentId);
    const sessions=Object.values(state.records).filter(record=>record.studentId===studentId).flatMap(record=>model().sessions(record).map((session,index)=>({record,session,id:`${record.id}:${index}`})));
    const used=new Set(),missing=[];
    for(const assigned of member.lessons) {
      const requiresOwnWeek=assigned.requiresOwnWeek ?? Boolean(model().scheduledPlan(state,child,assigned.weekStart).explicitRepeat);
      const matches=sessions.filter(({record,session,id})=>!used.has(id) && session.practiceFinished && session.unitIndex===assigned.unitIndex && session.lesson?.sentence===assigned.lesson.sentence && JSON.stringify(session.lesson?.words)===JSON.stringify(assigned.lesson.words) && (!session.lesson?.expectations || !assigned.lesson.expectations || JSON.stringify(session.lesson.expectations)===JSON.stringify(assigned.lesson.expectations)) && (!requiresOwnWeek || record.weekStart===assigned.weekStart) && (!session.examPreparation || (session.examPreparation.periodStart===start && session.examPreparation.weekStart===assigned.weekStart && session.examPreparation.unitIndex===assigned.unitIndex)));
      matches.sort((a,b)=>Number(b.record.weekStart===assigned.weekStart)-Number(a.record.weekStart===assigned.weekStart));
      if(matches.length)used.add(matches[0].id);else missing.push(copy(assigned));
    }
    return {ready:member.lessons.length>0 && !missing.length,finished:member.lessons.length-missing.length,total:member.lessons.length,missing};
  }
  function requireReady(state,classId,start,studentId) {
    const status=readiness(state,classId,start,studentId);
    if(!status.ready)throw new Error(`Finish ${status.total-status.finished} assigned practice lesson(s) before this exam. Saved exam answers are kept.`);
  }
  function resultForAttempt(attempt,poolTotal,passPercent,items) {
    const completed=Boolean(attempt?.completedAt),itemIndexes=selectedIndexes(attempt,poolTotal),total=itemIndexes.length,sampled=Boolean(attempt?.itemIndexes);
    const scoringRule=attempt?.scoringRule || (sampled ? "legacy-sampled-v1" : "legacy-full-v1");
    const threshold=attempt?.passPercent ?? passPercent;
    const stats=indexes=>{
      const count=indexes.length,known=completed ? indexes.filter(index=>attempt.itemStates[index]==="known").length : null;
      return {known,total:count,scorePercent:completed && count ? known*100/count : null,requiredKnown:Math.ceil(count*threshold/100),passed:Boolean(completed && count>0 && known*100>=count*threshold)};
    };
    const overall=stats(itemIndexes),vocabulary=stats(itemIndexes.filter(index=>itemKind(items,index)==="vocabulary")),sentence=stats(itemIndexes.filter(index=>itemKind(items,index)==="sentence"));
    if(scoringRule==="overall-majority-v1") {
      for(const category of [vocabulary,sentence]) {
        category.requiredKnown=category.total ? Math.floor(category.total/2)+1 : 0;
        category.passed=Boolean(completed && category.total>0 && category.known>=category.requiredKnown);
      }
    }
    const passed=scoringRule==="overall-majority-v1" ? overall.passed && vocabulary.passed && sentence.passed : scoringRule==="legacy-sampled-v1" ? vocabulary.passed && sentence.passed : overall.passed;
    return {completed,...overall,poolTotal,sampled,itemIndexes,vocabulary,sentence,scoringRule,passPercent:threshold,requiredKnown:scoringRule==="legacy-sampled-v1" ? vocabulary.requiredKnown+sentence.requiredKnown : overall.requiredKnown,passed};
  }
  function resultForChild(round,studentId) {
    const child=round.cohort.find(item=>item.studentId===studentId);
    if(!child) return {studentId,eligible:false,completed:false,passed:false,known:null,total:0,scorePercent:null,requiredKnown:0,attemptCount:0,draft:null,latestAttempt:null};
    const attempts=round.attempts[studentId] || {draft:null,history:[]}, latest=attempts.history.at(-1) || null;
    const latestCorrection=(attempts.corrections || []).find(item=>item.attemptId===latest?.id) || null;
    const upcoming=attempts.draft || {scoringRule:"overall-majority-v1",passPercent:80,itemStates:Array(child.items.length).fill("unassessed"),itemIndexes:sampleIndexes(round,child)};
    return {studentId,name:child.name,eligible:true,...resultForAttempt(latest || upcoming,child.items.length,round.policySnapshot.passPercent,child.items),...(latestCorrection ? {passed:false,corrected:true,latestCorrection:copy(latestCorrection)} : {corrected:false,latestCorrection:null}),attemptCount:attempts.history.length,draft:attempts.draft ? copy(attempts.draft) : null,latestAttempt:latest ? copy(latest) : null};
  }
  function studentResult(state,classId,start,studentId) { return roundStatus(state,classId,start).children.find(child=>child.studentId===studentId) || resultForChild(previewRound(state,classId,start),studentId); }
  function roundStatus(state,classId,start) {
    const round=previewRound(state,classId,start),children=round.cohort.map(member=>{
      const child=state.students.find(item=>item.id===member.studentId),withdrawn=child?.active===false;
      return {...resultForChild(round,member.studentId),withdrawn,countsForClass:member.countsForClass!==false && !withdrawn,absent:Boolean(round.absences?.[member.studentId]?.absent),readiness:readinessForMember(state,start,member)};
    });
    const classChildren=children.filter(child=>child.countsForClass),nonAbsentChildren=classChildren.filter(child=>!child.absent);
    const eligible=classChildren.length,nonAbsent=nonAbsentChildren.length,absent=eligible-nonAbsent;
    const completed=classChildren.filter(child=>child.completed).length,passed=nonAbsentChildren.filter(child=>child.passed).length;
    const requiredCoverage=Math.ceil(eligible*80/100),requiredPasses=Math.ceil(nonAbsent*80/100);
    const allCompleted=nonAbsent>0 && nonAbsentChildren.every(child=>child.completed),classPassed=nonAbsent>0 && passed>=requiredPasses,coverageMet=eligible>0 && completed>=requiredCoverage;
    const currentlyQualified=coverageMet && allCompleted && classPassed;
    const catchupOnly=eligible===0 && children.some(child=>!child.withdrawn && child.passed);
    return {id:round.id,classId,periodStart:round.periodStart,periodEnd:round.periodEnd,period:round.period,label:round.label,eligible,classEligible:eligible,cohortTotal:children.length,nonAbsent,absent,completed,passed,countedCompleted:nonAbsentChildren.filter(child=>child.completed).length,countedPassed:passed,coverageCompleted:completed,requiredCoverage,coverageMet,requiredPasses,allCompleted,classPassed,currentlyQualified,unlocked:Boolean(round.unlock) || currentlyQualified || catchupOnly,unlockedAt:round.unlock?.at || null,children,frozen:round.frozen};
  }
  function freezeRound(state,preview,startedAt=now()) {
    state.monthlyExams ||= {rounds:{}};
    if(!state.monthlyExams.rounds[preview.id]) {
      const {frozen,period,label,...round}=preview;
      round.startedAt=startedAt;state.monthlyExams.rounds[preview.id]=round;
    }
    const round=state.monthlyExams.rounds[preview.id],ids=new Set(round.cohort.map(child=>child.studentId));
    for(const child of preview.cohort)if(!ids.has(child.studentId))round.cohort.push(copy(child));
    return round;
  }
  function unlockEvidence(summary,at=now()) {
    const cohort=summary.children.filter(child=>child.countsForClass),counted=cohort.filter(child=>!child.absent);
    return {at,cohortIds:cohort.map(child=>child.studentId),countedIds:counted.map(child=>child.studentId),absentIds:cohort.filter(child=>child.absent).map(child=>child.studentId),completedIds:cohort.filter(child=>child.completed).map(child=>child.studentId),passedIds:counted.filter(child=>child.passed).map(child=>child.studentId)};
  }
  function refresh(state,classId) {
    for(const round of Object.values(state.monthlyExams?.rounds || {})) {
      if((classId && round.classId!==classId) || round.unlock)continue;
      const summary=roundStatus(state,round.classId,round.periodStart);
      if(summary.currentlyQualified)round.unlock=unlockEvidence(summary);
    }
    return state;
  }
  function setAbsence(state,classId,start,studentId,absent) {
    if(typeof absent!=="boolean")throw new Error("Choose a valid absence status.");
    const preview=previewRound(state,classId,start),member=preview.cohort.find(child=>child.studentId===studentId);
    if(!member)throw new Error("This child is not in this exam group.");
    if(absent && resultForChild(preview,studentId).passed)throw new Error("This child has already passed; there is no pending exam to mark absent.");
    const round=freezeRound(state,preview);round.absences ||= {};
    round.absences[studentId]={absent,updatedAt:now()};
    refresh(state,classId);
    return roundStatus(state,classId,start);
  }
  function availablePeriods(state,classId,studentId) {
    const group=getClass(state,classId),policy=group.monthlyPolicy || defaults(group),found=new Map();
    const active=state.students.filter(child=>child.classId===classId && child.active!==false);
    let current=periodFor(group,policy.startPeriod);
    if(active.length) {
      for(let count=0;count<2400;count++) {
        const summary=roundStatus(state,classId,current.start);
        if(summary.cohortTotal || summary.frozen) {
          found.set(current.start,{...current,frozen:summary.frozen,historyOnly:false,unlocked:summary.unlocked});
          const reachable=summary.children.filter(child=>!child.withdrawn && (!studentId || child.studentId===studentId));
          if(!reachable.some(child=>child.passed))break;
        } else {
          const first=active.map(child=>child.startWeek).sort()[0];
          if(first>current.end){current=periodFor(group,first);continue;}
          break;
        }
        current=periodFor(group,addDays(current.end,1));
      }
    }
    for(const round of Object.values(state.monthlyExams?.rounds || {}).filter(item=>item.classId===classId)) {
      if(!found.has(round.periodStart)) {
        // Removing the active roster cannot cancel an already frozen exam.
        // Only an unfinished earlier requirement makes a frozen round read-only.
        const historyOnly=periods(group,policy.startPeriod,round.periodStart).some(period=>{
          if(period.start>=round.periodStart)return false;
          const prior=roundStatus(state,classId,period.start);
          const children=prior.children.filter(child=>!child.withdrawn && (!studentId || child.studentId===studentId));
          return children.length>0 && !children.some(child=>child.passed);
        });
        found.set(round.periodStart,{...periodFor(group,round.periodStart),frozen:true,historyOnly,unlocked:roundStatus(state,classId,round.periodStart).unlocked});
      }
    }
    return [...found.values()].sort((a,b)=>a.start.localeCompare(b.start));
  }
  function requirement(summary,child,policy) {
    if(!summary.frozen && summary.cohortTotal===0) return "";
    const result=summary.children.find(item=>item.studentId===child.id);
    return result && !result.passed ? `${child.englishName || child.chineseName} needs to ${result.corrected ? "retake and pass" : "pass"} the ${summary.label} exam before starting the next month's content.${result.absent ? " Absent—exam pending." : ""}` : "";
  }
  function access(state,child,week,unitIndex) {
    return accessInContext(state,child,week,unitIndex);
  }
  function summaryInContext(state,classId,start,summaries) {
    if(!summaries)return roundStatus(state,classId,start);
    const id=roundId(classId,start);
    if(!summaries.has(id))summaries.set(id,roundStatus(state,classId,start));
    return summaries.get(id);
  }
  function accessInContext(state,child,week,unitIndex,summaries) {
    const group=getClass(state,child.classId), policy=group.monthlyPolicy;
    if(!policy) return {allowed:true,reason:"",blockingPeriod:null,summary:null};
    if(!validDay(week) || !Number.isInteger(unitIndex) || unitIndex<0 || unitIndex>=window.CURRICULUM.length) return {allowed:false,reason:"Choose a valid week and lesson.",blockingPeriod:null,summary:null};
    // A lesson picker must not bypass the exam by assigning October content to
    // a September row. Enrollment dates, not mutable manual plans, place content.
    const contentWeek=addDays(child.startWeek,Math.max(0,unitIndex-child.startUnit)*7);
    let target=periodFor(group,week>contentWeek ? week : contentWeek);
    const preparation=Object.values(state.monthlyExams?.rounds || {}).find(round=>round.classId===group.id && round.legacyPreparation===true && round.cohort.some(member=>member.studentId===child.id) && readiness(state,group.id,round.periodStart,child.id).missing.some(assigned=>assigned.weekStart===week && assigned.unitIndex===unitIndex));
    if(preparation)target=periodFor(group,preparation.periodStart);
    if(target.start<policy.startPeriod) return {allowed:true,reason:"",blockingPeriod:null,summary:null};
    for(const period of periods(group,policy.startPeriod,target.start)) {
      if(period.start===target.start) {
        // Only the exact missing frozen assignment may be prepared under its
        // original month after a later plan edit. Earlier exams still gate it.
        if(preparation && period.start===preparation.periodStart)continue;
        // Repeats can move a lesson into the next teaching period even when its
        // original enrollment-based date was earlier. Both schedules constrain
        // acceleration; a manual picker must not erase either checkpoint.
        const plans=plannedLessons(state,child,period);
        if(!plans.length || unitIndex<=Math.max(...plans.map(plan=>plan.unitIndex))) continue;
      }
      const summary=summaryInContext(state,group.id,period.start,summaries);
      // A class may be created before its first enrollment. Such an unfrozen
      // period has nobody to assess; a frozen cohort is never reduced this way.
      if(!summary.frozen && summary.cohortTotal===0) continue;
      const reason=requirement(summary,child,policy);
      if(reason) return {allowed:false,reason,blockingPeriod:period.start,summary};
    }
    return {allowed:true,reason:"",blockingPeriod:null,summary:null};
  }
  function checkpoint(state,child,options={}) {
    return checkpointInContext(state,child,options);
  }
  function checkpointInContext(state,child,{week,unitIndex,today=new Date()}={},summaries) {
    const empty={required:false,periodStart:null,reason:"",summary:null,trigger:null,studentId:child.id,weekStart:null,unitIndex:null};
    const group=getClass(state,child.classId),policy=group.monthlyPolicy;
    if(!policy) return empty;
    const selectedWeek=week || state.selectedWeekStart || model().monday(day(today));
    const selectedIndex=unitIndex ?? model().getRecord(state,child,selectedWeek).unitIndex;
    const candidates=[];
    const inspect=(targetWeek,targetIndex)=>{
      const result=accessInContext(state,child,targetWeek,targetIndex,summaries);
      if(!result.allowed && result.blockingPeriod) candidates.push({required:true,periodStart:result.blockingPeriod,reason:result.reason,summary:result.summary,trigger:"blocked-practice",studentId:child.id,weekStart:targetWeek,unitIndex:targetIndex});
    };
    inspect(selectedWeek,selectedIndex);
    const records=Object.values(state.records).filter(record=>record.studentId===child.id);
    for(const record of records) {
      if(record.autoOpened && record.completedLessons?.some(session=>{const status=model().status(session);return status.mastered && status.practiced;})) inspect(record.weekStart,record.unitIndex);
      // The current month now stays on its completed final lesson instead of
      // creating a next-month placeholder. Its pending advance is still due.
      if(record.awaitingMonthlyExam && model().status(record).mastered && record.practiceFinished) {
        // Use the same missing-lesson search as completion: legacy early work
        // can put the actual next practice beyond the immediately next unit.
        const next=model().nextPendingUnit(state,child,record.weekStart,record.unitIndex);
        if(next!==null)inspect(record.weekStart,next);
      }
    }
    const last=[day(today),...records.map(record=>record.weekStart),...Object.values(state.monthlyExams?.rounds || {}).filter(round=>round.classId===group.id).map(round=>round.periodStart)].sort().at(-1);
    for(const period of periods(group,policy.startPeriod,last)) {
      const frozen=state.monthlyExams?.rounds?.[roundId(group.id,period.start)];
      let trigger=frozen ? "unfinished-exam" : null;
      if(!trigger) {
        const plans=plannedLessons(state,child,period);
        if(plans.length && plans.every(plan=>model().weekPlan(state,child,plan.weekStart).completed)) trigger="completed-period";
      }
      if(!trigger) continue;
      const summary=summaryInContext(state,group.id,period.start,summaries),reason=requirement(summary,child,policy);
      if(reason) candidates.push({required:true,periodStart:period.start,reason,summary,trigger,studentId:child.id,weekStart:null,unitIndex:null});
    }
    candidates.sort((a,b)=>a.periodStart.localeCompare(b.periodStart));
    return candidates[0] || empty;
  }
  function classCheckpoint(state,classId,options={}) {
    getClass(state,classId);
    // This read-only synchronous batch shares one summary per class/month.
    // Never retain it across calls: marks, attendance and practice can change
    // the same state object immediately after this calculation returns.
    const summaries=new Map();
    const children=state.students.filter(child=>child.classId===classId && child.active!==false).map(child=>checkpointInContext(state,child,options,summaries)).filter(result=>result.required).sort((a,b)=>a.periodStart.localeCompare(b.periodStart));
    return {...(children[0] || {required:false,periodStart:null,reason:"",summary:null,trigger:null,studentId:null,weekStart:null,unitIndex:null}),children};
  }
  function configure(state,classId,input) {
    const group=getClass(state,classId), policy={...input,passPercent:80,classPassPercent:80,requireIndividualPass:true};
    validatePolicy(policy);
    const hasRounds=Object.values(state.monthlyExams?.rounds || {}).some(round=>round.classId===classId);
    if(hasRounds && !samePolicy(policy,group.monthlyPolicy)) throw new Error("Exam settings are locked after the first exam starts. Existing results and requirements cannot be changed.");
    group.monthlyPolicy=copy(policy);
    state.monthlyExams ||= {rounds:{}};
    return copy(policy);
  }
  function findRound(state,id,studentId) {
    const round=state.monthlyExams?.rounds?.[id];
    if(!round || !round.cohort.some(child=>child.studentId===studentId)) throw new Error("This child is not in the frozen exam group.");
    return round;
  }
  function getDraft(state,id,studentId) {
    const round=findRound(state,id,studentId), draft=round.attempts[studentId]?.draft;
    if(!draft) throw new Error("Start or resume this child's exam first.");
    return {round,draft};
  }
  function startAttempt(state,classId,start,studentId) {
    const group=getClass(state,classId), preview=previewRound(state,classId,start);
    if(start<(group.monthlyPolicy || defaults(group)).startPeriod) throw new Error("Exams are not required before this class's exam start period.");
    if(!preview.cohort.some(child=>child.studentId===studentId)) throw new Error("This child has no assigned lessons in this exam period.");
    const child=state.students.find(item=>item.id===studentId);
    // Exam progression depends on the period, not a legacy manual lesson
    // choice inside its snapshot: otherwise an old advanced lesson could make
    // this very exam a prerequisite for starting itself.
    const policy=group.monthlyPolicy || defaults(group);
    for(const prior of periods(group,policy.startPeriod,addDays(start,-1))) {
      const summary=roundStatus(state,group.id,prior.start),reason=requirement(summary,child,policy);
      if(reason) throw new Error(reason);
    }
    const result=resultForChild(preview,studentId);
    if(result.passed) throw new Error("This child has already passed this exam. The completed result is preserved.");
    requireReady(state,classId,start,studentId);
    if(result.draft) return result.draft;
    const member=preview.cohort.find(child=>child.studentId===studentId);
    const draft={id:`attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`,startedAt:now(),updatedAt:now(),scoringRule:"overall-majority-v1",passPercent:80,itemIndexes:sampleIndexes(preview,member),itemStates:Array(member.items.length).fill("unassessed"),notes:""};
    const round=freezeRound(state,preview,draft.startedAt);
    round.attempts[studentId] ||= {draft:null,history:[]};
    round.attempts[studentId].draft=draft;
    return copy(draft);
  }
  function setMark(state,id,studentId,itemIndex,mark) {
    const {round,draft}=getDraft(state,id,studentId);
    requireReady(state,round.classId,round.periodStart,studentId);
    if(!Number.isInteger(itemIndex) || itemIndex<0 || itemIndex>=draft.itemStates.length || !marks.includes(mark)) throw new Error("Choose a valid exam item and mark.");
    if(draft.itemIndexes && !draft.itemIndexes.includes(itemIndex))throw new Error("This item is not selected for this shorter exam. Untested items stay unassessed.");
    draft.itemStates[itemIndex]=mark; draft.updatedAt=now(); return copy(draft);
  }
  function saveNote(state,id,studentId,note) {
    const {draft}=getDraft(state,id,studentId);
    if(typeof note!=="string" || note.length>100000) throw new Error("The exam note is invalid or too long.");
    draft.notes=note; draft.updatedAt=now(); return copy(draft);
  }
  function finishAttempt(state,id,studentId) {
    const {round,draft}=getDraft(state,id,studentId);
    requireReady(state,round.classId,round.periodStart,studentId);
    if(draft.itemIndexes && draft.itemStates.some((mark,index)=>!draft.itemIndexes.includes(index) && mark!=="unassessed"))throw new Error("Items outside the shorter exam must remain unassessed.");
    if(!draft.itemStates.length || selectedIndexes(draft,draft.itemStates.length).some(index=>draft.itemStates[index]==="unassessed")) throw new Error("Assess every vocabulary word and sentence selected for this exam before finishing.");
    const completed={...copy(draft),updatedAt:now(),completedAt:now()};
    round.attempts[studentId].history.push(completed); round.attempts[studentId].draft=null;
    if(round.absences?.[studentId]?.absent)round.absences[studentId]={absent:false,updatedAt:now()};
    refresh(state,round.classId);
    return resultForChild(round,studentId);
  }
  function correctAttempt(state,id,studentId,attemptId,reason) {
    const round=findRound(state,id,studentId),bundle=round.attempts[studentId];
    if(typeof reason!=="string" || !reason.trim() || reason.length>2000)throw new Error("Enter a brief reason for correcting the original result.");
    const attempt=bundle?.history.find(item=>item.id===attemptId);
    if(!attempt || attempt!==bundle.history.at(-1))throw new Error("Only the latest completed exam can be corrected. Earlier results stay in history.");
    if(bundle.draft)throw new Error("Finish the current reassessment before correcting another result.");
    if(bundle.corrections?.some(item=>item.attemptId===attemptId))throw new Error("This result is already marked for reassessment.");
    bundle.corrections ||= [];
    bundle.corrections.push({id:`correction-${Date.now()}-${Math.random().toString(36).slice(2)}`,attemptId,at:now(),reason:reason.trim()});
    return resultForChild(round,studentId);
  }
  function validateRound(state,key,round) {
    if(!object(round) || typeof round.id!=="string" || round.id!==key || !validDay(round.periodStart) || !validDay(round.periodEnd) || !timestamp(round.startedAt) || !Array.isArray(round.cohort) || !round.cohort.length || !object(round.attempts)) throw new Error("A saved monthly exam is malformed.");
    const group=getClass(state,round.classId); validatePolicy(round.policySnapshot);
    if(round.id!==roundId(group.id,round.periodStart) || round.policySnapshot.startPeriod!==group.monthlyPolicy.startPeriod || round.policySnapshot.periodKind!==group.monthlyPolicy.periodKind) throw new Error("An exam has inconsistent class or policy details.");
    const period=periodFor(group,round.periodStart);
    if(period.start!==round.periodStart || period.end!==round.periodEnd || period.start<group.monthlyPolicy.startPeriod) throw new Error("An exam period is invalid.");
    if(!object(round.absences) || (round.legacyPreparation!==undefined && typeof round.legacyPreparation!=="boolean"))throw new Error("Saved exam membership details are invalid.");
    const cohortIds=new Set(), attemptIds=new Set();
    round.cohort.forEach(child=>{
      const student=state.students.find(item=>item.id===child?.studentId);
      if(!object(child) || !student || student.classId!==group.id || cohortIds.has(child.studentId) || typeof child.name!=="string" || typeof child.englishName!=="string" || typeof child.chineseName!=="string" || !Array.isArray(child.lessons) || child.lessons.length<1 || child.lessons.length>5 || !Array.isArray(child.items)) throw new Error("An exam has an invalid or duplicated child.");
      if(typeof child.countsForClass!=="boolean")throw new Error("A saved exam has invalid class-percentage membership.");
      cohortIds.add(child.studentId); const weeks=new Set();
      child.lessons.forEach(lesson=>{
        if(!object(lesson) || !validDay(lesson.weekStart) || model().monday(lesson.weekStart)!==lesson.weekStart || lesson.weekStart<period.start || lesson.weekStart>period.end || weeks.has(lesson.weekStart) || !Number.isInteger(lesson.unitIndex) || lesson.unitIndex<0 || lesson.unitIndex>=window.CURRICULUM.length || !object(lesson.lesson) || !Array.isArray(lesson.lesson.words) || lesson.lesson.words.length!==5 || lesson.lesson.words.some(word=>typeof word!=="string") || typeof lesson.lesson.sentence!=="string") throw new Error("A monthly exam lesson snapshot is invalid.");
        if(lesson.requiresOwnWeek!==undefined && typeof lesson.requiresOwnWeek!=="boolean")throw new Error("A saved exam assignment is invalid.");
        if(lesson.lesson.expectations!==undefined && (!Array.isArray(lesson.lesson.expectations) || lesson.lesson.expectations.length!==6 || lesson.lesson.expectations.some(text=>typeof text!=="string" || !text.trim() || text.length>250)))throw new Error("Saved exam expectations are invalid.");
        weeks.add(lesson.weekStart);
      });
      if(JSON.stringify(child.items)!==JSON.stringify(lessonItems(child.lessons))) throw new Error("Monthly exam items do not match their saved lesson snapshots.");
      const attempts=round.attempts[child.studentId];
      if(attempts===undefined) return;
      if(!object(attempts) || !Array.isArray(attempts.history) || !(attempts.draft===null || object(attempts.draft))) throw new Error("Monthly exam attempt history is invalid.");
      const corrections=attempts.corrections || [], correctedIds=new Set(),correctionIds=new Set();
      if(!Array.isArray(corrections))throw new Error("Exam correction history is invalid.");
      for(const correction of corrections) {
        const original=attempts.history.find(item=>item.id===correction?.attemptId);
        const following=attempts.history[attempts.history.indexOf(original)+1] || attempts.draft;
        if(!object(correction) || typeof correction.id!=="string" || !correction.id || correctionIds.has(correction.id) || !original || correctedIds.has(correction.attemptId) || !timestamp(correction.at) || Date.parse(correction.at)<Date.parse(original.completedAt) || (following && Date.parse(correction.at)>Date.parse(following.startedAt)) || typeof correction.reason!=="string" || !correction.reason.trim() || correction.reason.length>2000)throw new Error("A saved exam correction is invalid.");
        correctedIds.add(correction.attemptId);correctionIds.add(correction.id);
      }
      let previous=round.startedAt, passed=false;
      const validateAttempt=(attempt,complete)=>{
        if(!object(attempt) || typeof attempt.id!=="string" || !attempt.id || attemptIds.has(attempt.id) || !timestamp(attempt.startedAt) || !timestamp(attempt.updatedAt) || Date.parse(attempt.startedAt)<Date.parse(previous) || Date.parse(attempt.updatedAt)<Date.parse(attempt.startedAt) || typeof attempt.notes!=="string" || attempt.notes.length>100000 || !Array.isArray(attempt.itemStates) || attempt.itemStates.length!==child.items.length || attempt.itemStates.some(mark=>!marks.includes(mark)) || passed) throw new Error("A saved monthly exam attempt is invalid.");
        if(!scoringRules.includes(attempt.scoringRule) || !Number.isInteger(attempt.passPercent) || attempt.passPercent<1 || attempt.passPercent>100 || (attempt.scoringRule==="overall-majority-v1" ? attempt.passPercent!==80 : attempt.passPercent!==round.policySnapshot.passPercent))throw new Error("A saved exam scoring rule is invalid.");
        if((attempt.scoringRule==="legacy-sampled-v1" && !attempt.itemIndexes) || (attempt.scoringRule==="legacy-full-v1" && attempt.itemIndexes))throw new Error("A legacy exam scoring rule does not match its original question format.");
        attemptIds.add(attempt.id);
        if(attempt.itemIndexes!==undefined) {
          if(!Array.isArray(attempt.itemIndexes) || !attempt.itemIndexes.length || new Set(attempt.itemIndexes).size!==attempt.itemIndexes.length || attempt.itemIndexes.some(index=>!Number.isInteger(index) || index<0 || index>=child.items.length))throw new Error("A shorter exam has invalid selected items.");
          for(const kind of ["vocabulary","sentence"]) {
            const pool=child.items.filter(item=>item.kind===kind).length,selected=attempt.itemIndexes.filter(index=>child.items[index].kind===kind).length;
            if(selected!==(pool ? Math.floor(pool/2)+1 : 0))throw new Error("A shorter exam must sample a majority of words and a majority of sentences.");
          }
          if(attempt.itemStates.some((mark,index)=>!attempt.itemIndexes.includes(index) && mark!=="unassessed"))throw new Error("Items outside the shorter exam cannot receive knowledge marks.");
        }
        if(complete) {
          if(!timestamp(attempt.completedAt) || Date.parse(attempt.completedAt)<Date.parse(attempt.startedAt) || selectedIndexes(attempt,child.items.length).some(index=>attempt.itemStates[index]==="unassessed")) throw new Error("A finished exam is missing assessments or its actual completion date.");
          previous=attempt.completedAt; passed=!correctedIds.has(attempt.id) && resultForAttempt(attempt,child.items.length,round.policySnapshot.passPercent,child.items).passed;
        } else if(attempt.completedAt!==undefined) throw new Error("An unfinished exam cannot have a completed result.");
      };
      attempts.history.forEach(attempt=>validateAttempt(attempt,true));
      if(attempts.draft) validateAttempt(attempts.draft,false);
    });
    if(Object.keys(round.attempts).some(id=>!cohortIds.has(id))) throw new Error("An exam attempt belongs to a child outside its frozen group.");
    for(const [id,absence] of Object.entries(round.absences))if(!cohortIds.has(id) || !object(absence) || typeof absence.absent!=="boolean" || !timestamp(absence.updatedAt))throw new Error("A saved exam absence is invalid.");
    if(round.unlock!==undefined)validateUnlock(round);
  }
  function validateUnlock(round) {
    const proof=round.unlock,fields=["cohortIds","countedIds","absentIds","completedIds","passedIds"],members=new Map(round.cohort.map(child=>[child.studentId,child]));
    if(!object(proof) || !timestamp(proof.at) || Date.parse(proof.at)<Date.parse(round.startedAt) || fields.some(field=>!Array.isArray(proof[field]) || new Set(proof[field]).size!==proof[field].length || proof[field].some(id=>!members.has(id))))throw new Error("Saved class advancement evidence is invalid.");
    const cohort=new Set(proof.cohortIds),counted=new Set(proof.countedIds),absent=new Set(proof.absentIds),completed=new Set(proof.completedIds);
    if(!cohort.size || !counted.size || proof.cohortIds.some(id=>members.get(id).countsForClass===false) || proof.countedIds.some(id=>!cohort.has(id) || absent.has(id)) || proof.absentIds.some(id=>!cohort.has(id)) || counted.size+absent.size!==cohort.size || proof.completedIds.some(id=>!cohort.has(id)) || proof.countedIds.some(id=>!completed.has(id)) || completed.size<Math.ceil(cohort.size*80/100) || proof.passedIds.some(id=>!counted.has(id) || !completed.has(id)) || proof.passedIds.length<Math.ceil(counted.size*80/100))throw new Error("Saved class advancement does not meet the coverage and pass requirements.");
    for(const id of proof.completedIds) {
      const member=members.get(id),attempt=round.attempts[id]?.history.filter(item=>Date.parse(item.completedAt)<=Date.parse(proof.at)).at(-1);
      if(!attempt || (proof.passedIds.includes(id) && !resultForAttempt(attempt,member.items.length,round.policySnapshot.passPercent,member.items).passed))throw new Error("Saved class advancement is missing its completed exam evidence.");
    }
  }
  function normalize(state,{legacy=false,today=new Date()}={}) {
    if(!legacy && !object(state.monthlyExams)) throw new Error("This backup is missing its monthly exam data.");
    state.classes.forEach(group=>{
      if(group.monthlyPolicy===undefined && legacy) group.monthlyPolicy=defaults(group,today);
      validatePolicy(group.monthlyPolicy);
      if(group.monthlyPolicy.passPercent!==80 || !group.monthlyPolicy.requireIndividualPass)throw new Error("New exams require an 80% overall pass and individual passing before advancement.");
    });
    if(legacy && state.monthlyExams===undefined) state.monthlyExams={rounds:{}};
    if(!object(state.monthlyExams) || !object(state.monthlyExams.rounds)) throw new Error("Monthly exam records are invalid.");
    Object.entries(state.monthlyExams.rounds).forEach(([key,round])=>validateRound(state,key,round));
    return state;
  }
  function upgrade(state,legacySchemaVersion) {
    if(Number(legacySchemaVersion)>=6)return state;
    for(const round of Object.values(state.monthlyExams?.rounds || {})) {
      if(!object(round) || !Array.isArray(round.cohort) || !object(round.attempts))continue;
      for(const member of round.cohort)member.countsForClass ??= true;
      round.absences ||= {};
      round.legacyPreparation=true;
      for(const bundle of Object.values(round.attempts)) {
        if(!object(bundle))continue;
        for(const attempt of bundle.history || []) {
          attempt.scoringRule ||= attempt.itemIndexes ? "legacy-sampled-v1" : "legacy-full-v1";
          attempt.passPercent ??= round.policySnapshot?.passPercent ?? 80;
        }
        if(bundle.draft) {bundle.draft.scoringRule ||= bundle.draft.itemIndexes ? "legacy-sampled-v1" : "legacy-full-v1";bundle.draft.passPercent ??= round.policySnapshot?.passPercent ?? 80;}
      }
      const children=round.cohort.map(member=>({...resultForChild(round,member.studentId),countsForClass:true,absent:false}));
      if(!round.unlock && children.length && children.every(child=>child.completed) && children.filter(child=>child.passed).length>=Math.ceil(children.length*80/100)) {
        const at=[round.startedAt,...children.map(child=>child.latestAttempt.completedAt)].sort().at(-1);
        round.unlock=unlockEvidence({children},at);
      }
    }
    for(const group of state.classes || [])if(object(group.monthlyPolicy))group.monthlyPolicy={...group.monthlyPolicy,passPercent:80,classPassPercent:80,requireIndividualPass:true};
    return state;
  }
  window.MonthlyExams={periodFor,periods,availablePeriods,previewRound,previewAssessment,roundStatus,studentResult,resultForAttempt,readiness,access,checkpoint,classCheckpoint,configure,startAttempt,setMark,saveNote,finishAttempt,correctAttempt,normalize,upgrade,setAbsence,refresh};
})();

(function () {
  "use strict";
  const copy=value=>JSON.parse(JSON.stringify(value));
  const object=value=>Boolean(value && typeof value==="object" && !Array.isArray(value));
  const validDay=value=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  const timestamp=value=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
  const day=(value=new Date())=>{if(validDay(value))return value;const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error("Choose a valid review date.");return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;};
  const addDays=(value,count)=>{const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);};
  const defaults={firstDays:7,repeatDays:28,limit:3};
  const store=state=>state.learningReview ||= {settings:{...defaults},children:{},goals:[]};
  function childIn(state,id) {const child=state.students.find(item=>item.id===id);if(!child)throw new Error("Choose a child from this class.");return child;}
  function defaultExpectations(lesson) {
    const age=lesson?.ageBand || "2-3";
    const word=age==="2-3" ? "Name it independently; age-appropriate pronunciation" : age==="3-4" ? "Name it in a word or short phrase" : "Name it and use it in a familiar context";
    const sentence=age==="2-3" ? "Respond independently with words or an appropriate gesture" : age==="3-4" ? "Respond in a short phrase" : age==="4-5" ? "Respond in a simple sentence" : "Respond in a clear sentence";
    return Array(5).fill(word).concat(sentence);
  }
  function expectations(state,child,week,record) {
    const lesson=record?.lesson || window.TrackerModel.snapshot(record?.unitIndex ?? child.startUnit);
    if(Array.isArray(lesson.expectations))return [...lesson.expectations];
    const result=defaultExpectations(lesson);
    // Saved work keeps its original rubric. Prospective overrides only apply
    // before an assessment starts and are then copied into the lesson snapshot.
    if(record && window.TrackerModel.coreActivity(record))return result;
    for(const goal of state.learningReview?.goals || [])if(goal.studentId===child.id && goal.week>=week && goal.unitIndex===record?.unitIndex)result[goal.targetIndex]=goal.expectation;
    return result;
  }
  function capture(state,child,record,{today}={}) {
    childIn(state,child.id);
    if(!record?.practiceFinished || record.studentId!==child.id)return [];
    const sourceDate=day(record.practicedAt || today || new Date()),data=store(state);
    const bucket=data.children[child.id] ||= {targets:{}};
    const cues=expectations(state,child,record.weekStart,record),targets=[...record.lesson.words,record.lesson.sentence],changed=[];
    targets.forEach((text,index)=>{
      const mark=record.itemStates[index];if(!["known","learning"].includes(mark))return;
      const id=JSON.stringify([record.unitIndex,index,text]),prior=bucket.targets[id];
      if(prior) {
        // Difficulty in a later practice brings recall forward without changing
        // the original mark or inventing a separate review observation.
        if(mark==="learning")prior.dueDate=[prior.dueDate,addDays(sourceDate,data.settings.firstDays)].sort()[0];
        return;
      }
      const target={id,text,kind:index===5?"sentence":"vocabulary",expectation:cues[index],sourceWeekStart:record.weekStart,sourceUnitIndex:record.unitIndex,sourceItemIndex:index,sourceDate,sourceMark:mark,dueDate:addDays(sourceDate,data.settings.firstDays),lastMark:mark,checks:[],postponements:[]};
      bucket.targets[id]=target;changed.push(copy(target));
    });
    return changed;
  }
  function due(state,child,{today=new Date(),limit}={}) {
    const date=day(today),data=state.learningReview;
    if(!data)return [];
    const count=Math.max(1,Math.min(3,Math.floor(limit || data.settings.limit)));
    const pending=Object.values(data.children[child.id]?.targets || {}).filter(item=>item.dueDate<=date).sort((a,b)=>a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
    const chosen=[];
    // Keep one recall opportunity as well as a difficult target when both are
    // due. A long practice backlog must not hide everything already learned.
    if(count>1)for(const mark of ["learning","known"]){const target=pending.find(item=>item.lastMark===mark);if(target)chosen.push(target);}
    for(const target of pending)if(chosen.length<count && !chosen.includes(target))chosen.push(target);
    return chosen.map(copy);
  }
  function targetIn(state,childId,id) {childIn(state,childId);const target=state.learningReview?.children[childId]?.targets[id];if(!target)throw new Error("This review target is missing.");return target;}
  function mark(state,childId,id,value,{today=new Date()}={}) {
    if(!["known","learning"].includes(value))throw new Error("Choose Needs practice or Knows it.");
    const date=day(today),target=targetIn(state,childId,id),settings=store(state).settings;
    if(date<target.sourceDate || target.checks.some(check=>check.date>date))throw new Error("A review cannot be dated before its recorded learning or latest review.");
    target.checks.push({date,mark:value});target.lastMark=value;
    target.dueDate=addDays(date,value==="known" ? settings.repeatDays : settings.firstDays);
    return copy(target);
  }
  function postpone(state,childId,id,{today=new Date(),days=7}={}) {
    if(!Number.isInteger(days) || days<1 || days>90)throw new Error("Postpone by 1 to 90 days.");
    const date=day(today),target=targetIn(state,childId,id);
    if(date<target.sourceDate)throw new Error("A review cannot be postponed before its recorded learning.");
    const until=addDays(date,days);target.postponements.push({date,until});target.dueDate=until;return copy(target);
  }
  function setSettings(state,settings) {
    const next={...store(state).settings,...settings};validateSettings(next);store(state).settings=next;return copy(next);
  }
  function setGoal(state,child,{week,unitIndex,targetIndex,expectation}) {
    childIn(state,child.id);
    if(!validDay(week) || window.TrackerModel.monday(week)!==week || !Number.isInteger(unitIndex) || !window.CURRICULUM[unitIndex] || !Number.isInteger(targetIndex) || targetIndex<0 || targetIndex>5 || typeof expectation!=="string" || !expectation.trim() || expectation.length>250)throw new Error("Choose a valid future lesson, target and short expectation.");
    const selected=state.selectedWeekStart || window.TrackerModel.monday();
    if(week<=selected)throw new Error("Expectations can only change for a later, unstarted week.");
    const plan=window.TrackerModel.weekPlan(state,child,week);
    if(plan.unitIndex!==unitIndex)throw new Error("Choose the lesson assigned to this future week.");
    if(plan.completed)throw new Error("This future lesson is already completed early. Its expectations are preserved.");
    const existing=state.records[`${child.id}::${week}`];
    if(existing && (window.TrackerModel.activity(existing) || existing.completedLessons?.length))throw new Error("This practice already has saved work. Its expectations are preserved.");
    const frozen=Object.values(state.monthlyExams?.rounds || {}).some(round=>round.cohort.some(member=>member.studentId===child.id && member.lessons.some(lesson=>lesson.weekStart===week)));
    if(frozen)throw new Error("This lesson is part of a started exam. Its expectations are preserved.");
    const record={unitIndex,lesson:window.TrackerModel.snapshot(unitIndex)},previous=expectations(state,child,week,record)[targetIndex];
    const goal={id:`goal-${Date.now()}-${Math.random().toString(36).slice(2)}`,studentId:child.id,week,unitIndex,targetIndex,expectation:expectation.trim(),previous,at:new Date().toISOString()};
    store(state).goals.push(goal);
    if(existing)delete existing.lesson.expectations;
    return copy(goal);
  }
  const goalHistory=(state,childId)=>(state.learningReview?.goals || []).filter(goal=>goal.studentId===childId).slice().reverse().map(copy);
  function reportSummary(state,childId,start,end) {
    if(!validDay(start) || !validDay(end) || end<start)throw new Error("Choose a valid report date range.");
    const observations=Object.values(state.learningReview?.children[childId]?.targets || {}).flatMap(item=>item.checks.filter(check=>check.date>=start && check.date<=end).map(check=>({id:item.id,text:item.text,kind:item.kind,expectation:item.expectation,sourceMark:item.sourceMark,...check})));
    const latest=new Map();for(const item of observations)latest.set(item.id,item);
    const targets=[...latest.values()];
    return {checked:targets.length,known:targets.filter(item=>item.mark==="known").length,needsPractice:targets.filter(item=>item.mark==="learning"),observations};
  }
  function validateSettings(settings) {if(!object(settings) || !Number.isInteger(settings.firstDays) || settings.firstDays<1 || settings.firstDays>90 || !Number.isInteger(settings.repeatDays) || settings.repeatDays<1 || settings.repeatDays>180 || !Number.isInteger(settings.limit) || settings.limit<1 || settings.limit>3)throw new Error("Review timing settings are invalid.");}
  function normalize(state,{legacy=false}={}) {
    if(state.learningReview===undefined && legacy) {
      store(state);
      // One historical pass at migration, not during selection/marking. Seed the
      // latest finished session per child; do not duplicate an entire old backup.
      const latest=new Map();
      for(const record of Object.values(state.records))for(const session of window.TrackerModel.sessions(record))if(session.practiceFinished && session.itemStates?.some(mark=>mark!=="unassessed")) {
        const previous=latest.get(record.studentId),date=session.practicedAt || session.weekStart;
        if(!previous || date>(previous.practicedAt || previous.weekStart))latest.set(record.studentId,session);
      }
      for(const [id,record] of latest)capture(state,childIn(state,id),record,{today:record.weekStart});
    }
    const data=state.learningReview;
    if(!object(data) || !object(data.children) || !Array.isArray(data.goals))throw new Error("This backup is missing its review and goal history.");
    validateSettings(data.settings);
    for(const [childId,bucket] of Object.entries(data.children)) {
      childIn(state,childId);
      if(!object(bucket) || !object(bucket.targets))throw new Error("Saved review targets are invalid.");
      for(const [id,item] of Object.entries(bucket.targets)) {
        if(!object(item) || item.id!==id || typeof item.text!=="string" || !["vocabulary","sentence"].includes(item.kind) || typeof item.expectation!=="string" || item.expectation.length>250 || !validDay(item.sourceWeekStart) || !validDay(item.sourceDate) || !validDay(item.dueDate) || !Number.isInteger(item.sourceUnitIndex) || !window.CURRICULUM[item.sourceUnitIndex] || !Number.isInteger(item.sourceItemIndex) || item.sourceItemIndex<0 || item.sourceItemIndex>5 || !["known","learning"].includes(item.sourceMark) || !["known","learning"].includes(item.lastMark) || !Array.isArray(item.checks) || !Array.isArray(item.postponements))throw new Error("A saved review target is invalid.");
        if(id!==JSON.stringify([item.sourceUnitIndex,item.sourceItemIndex,item.text]) || item.kind!==(item.sourceItemIndex===5?"sentence":"vocabulary") || window.TrackerModel.monday(item.sourceWeekStart)!==item.sourceWeekStart || item.dueDate<item.sourceDate || !item.expectation.trim())throw new Error("A saved review target has inconsistent source details.");
        let last=item.sourceDate;
        for(const check of item.checks){if(!object(check) || !validDay(check.date) || check.date<last || !["known","learning"].includes(check.mark))throw new Error("A saved review observation is invalid.");last=check.date;}
        if(item.lastMark!==(item.checks.at(-1)?.mark || item.sourceMark))throw new Error("A saved review result is inconsistent.");
        for(const postponed of item.postponements)if(!object(postponed) || !validDay(postponed.date) || !validDay(postponed.until) || postponed.date<item.sourceDate || postponed.until<=postponed.date)throw new Error("A saved review postponement is invalid.");
      }
    }
    const goalIds=new Set();
    for(const goal of data.goals) {
      childIn(state,goal?.studentId);
      if(!object(goal) || typeof goal.id!=="string" || !goal.id || goalIds.has(goal.id) || !validDay(goal.week) || window.TrackerModel.monday(goal.week)!==goal.week || !Number.isInteger(goal.unitIndex) || !window.CURRICULUM[goal.unitIndex] || !Number.isInteger(goal.targetIndex) || goal.targetIndex<0 || goal.targetIndex>5 || typeof goal.expectation!=="string" || !goal.expectation.trim() || goal.expectation.length>250 || typeof goal.previous!=="string" || !timestamp(goal.at))throw new Error("A saved goal change is invalid.");
      goalIds.add(goal.id);
    }
    return state;
  }
  window.LearningReview={expectations,capture,due,mark,postpone,setSettings,setGoal,goalHistory,reportSummary,normalize};
})();

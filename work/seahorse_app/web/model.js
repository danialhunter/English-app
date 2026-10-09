(function () {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const units = () => window.CURRICULUM;
  const clamp = n => Math.max(0, Math.min(Math.floor(Number(n) || 0), units().length - 1));
  const key = (id, week) => `${id}::${week}`;
  const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  function monday(value = new Date()) {
    const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date(value);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function gap(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 604800000); }
  function snapshot(index) { const u = units()[clamp(index)]; return { ...copy(u), curriculumId: u.id }; }
  function coreActivity(r) { return Boolean(r && (r.practiceFinished || r.notes?.trim() || r.itemStates?.some(s => s !== "unassessed"))); }
  function activity(r) { return coreActivity(r) || Boolean(r?.additionalPractice?.length || r?.removedExtraPracticeIds?.length); }
  function sessions(r) { return r ? [...(r.completedLessons || []), r] : []; }
  function status(r) {
    const total = (r?.lesson?.words?.length || 5) + 1;
    const known = (r?.itemStates || []).slice(0, total).filter(s => s === "known").length;
    return {total, known, mastered: known === total, practiced: Boolean(r?.practiceFinished), needsReview: Boolean(r?.practiceFinished && known < total)};
  }
  function weekStatus(r, state, student, week) {
    const current = status(r), all = sessions(r).map(status);
    const result = {...current, practiced: all.some(s => s.practiced), mastered: all.some(s => s.mastered), needsReview: all.some(s => s.needsReview), completed: all.filter(s => s.mastered && s.practiced).length};
    if (!state || !student || !week) return result;
    const plan = weekPlan(state, student, week);
    return {...result, ...(plan.completed ? {known:6,total:6,mastered:true,practiced:true,completed:Math.max(1,result.completed)} : {}), completedEarly:plan.completedEarly, scheduledCompleted:plan.completed, plannedUnitIndex:plan.unitIndex, sourceWeekStart:plan.sourceWeekStart, completedAt:plan.completedAt};
  }
  function records(state, student) { return Object.values(state.records).filter(r => r.studentId === student.id).sort((a,b) => a.weekStart.localeCompare(b.weekStart)); }
  function anchor(r) { return activity(r) || r.manuallyAssigned || r.nextActionExplicit || r.completedLessons?.length || r.examPreparation; }
  // Calendar assignments and the next practice are different concepts. Only a
  // teacher's initial manual assignment or explicit repeat changes the calendar;
  // completing more lessons in a week never moves the later scheduled lessons.
  function scheduledPlan(state, student, week) {
    let index = clamp(student.startUnit + Math.max(0,gap(student.startWeek,week)));
    let manuallyAssigned = false, explicitRepeat = false;
    const history = records(state,student);
    for (const record of history.filter(item=>item.weekStart<=week)) {
      const first = sessions(record)[0];
      if (first.manuallyAssigned) {
        index = clamp((first.plannedUnitIndex ?? first.unitIndex) + Math.max(0,gap(record.weekStart,week)));
        manuallyAssigned = record.weekStart === week; explicitRepeat = false;
      }
      const action = sessions(record).slice().reverse().find(item=>item.nextActionExplicit || (item.manuallyAssigned && item.nextAction === "repeat"));
      if (action?.nextAction === "repeat" && record.weekStart < week) {
        index = clamp(action.unitIndex + Math.max(0,gap(record.weekStart,week)-1));
        explicitRepeat = gap(record.weekStart,week) === 1; manuallyAssigned = false;
      }
    }
    const saved = state.records[key(student.id,week)];
    let lesson;
    if (saved && anchor(saved)) {
      const first = sessions(saved)[0];
      index = clamp(saved.plannedUnitIndex ?? first.plannedUnitIndex ?? first.unitIndex);
      if (index === first.unitIndex) lesson = copy(first.lesson);
      if (saved.examPreparation && saved.unitIndex === index) lesson = copy(saved.lesson);
      manuallyAssigned = Boolean(first.manuallyAssigned);
    }
    lesson ||= snapshot(index);
    if(window.LearningReview && !lesson.expectations)lesson.expectations=window.LearningReview.expectations(state,student,week,{unitIndex:index,lesson,...(saved && anchor(saved) ? {practiceFinished:true} : {})});
    return {weekStart:week,unitIndex:index,lesson,manuallyAssigned,explicitRepeat};
  }
  function localDay(value) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function sameLesson(session, index, lesson) {
    return session.unitIndex === index && session.lesson?.sentence === lesson.sentence && JSON.stringify(session.lesson?.words) === JSON.stringify(lesson.words) && (!session.lesson?.expectations || !lesson.expectations || JSON.stringify(session.lesson.expectations)===JSON.stringify(lesson.expectations));
  }
  function completionFor(state, student, week, index, lesson, requireOwnWeek = false) {
    const found = [];
    for (const record of records(state,student)) {
      if (requireOwnWeek && record.weekStart !== week) continue;
      sessions(record).forEach((session,sessionIndex)=>{
        const assessment = status(session);
        if (!assessment.mastered || !assessment.practiced || !sameLesson(session,index,lesson)) return;
        const actualDate = session.practicedAt || session.completedAt || null;
        const actualDay = localDay(actualDate);
        // A selected future week's recorded work can be completed today. For a
        // different week, actual dates control credit; undated legacy records
        // can only establish completion at their recorded week, not earlier.
        if (record.weekStart !== week && (actualDay ? monday(actualDay) > week : record.weekStart > week)) return;
        found.push({recordId:record.id,weekStart:record.weekStart,unitIndex:session.unitIndex,lesson:copy(session.lesson),practicedAt:session.practicedAt || null,completedAt:session.completedAt || null,sessionIndex,session:copy(session),actualDate,actualDay});
      });
    }
    found.sort((a,b)=>(a.actualDay || a.weekStart).localeCompare(b.actualDay || b.weekStart) || a.weekStart.localeCompare(b.weekStart) || a.sessionIndex-b.sessionIndex);
    return found[0] || null;
  }
  function nextPracticeIndex(state, student, plan) {
    if (plan.explicitRepeat || plan.manuallyAssigned) {
      if (!completionFor(state,student,plan.weekStart,plan.unitIndex,plan.lesson,true)) return plan.unitIndex;
    }
    for (let index=plan.unitIndex;index<units().length;index++) {
      const lesson = index === plan.unitIndex ? plan.lesson : snapshot(index);
      if (!completionFor(state,student,plan.weekStart,index,lesson)) return index;
    }
    return null;
  }
  function weekPlan(state, student, week) {
    const plan = scheduledPlan(state,student,week);
    const completion = completionFor(state,student,week,plan.unitIndex,plan.lesson,plan.explicitRepeat || plan.manuallyAssigned);
    const next = nextPracticeIndex(state,student,plan);
    return {...plan,completed:Boolean(completion),completedEarly:Boolean(completion && (completion.actualDay ? completion.actualDay < week : completion.weekStart < week)),completion,sourceWeekStart:completion?.weekStart || null,completedAt:completion?.actualDate || null,nextPracticeIndex:next,curriculumFinished:next === null};
  }
  function nextPendingUnit(state,student,week,currentIndex) {
    if (currentIndex >= units().length-1) return null;
    return nextPracticeIndex(state,student,{weekStart:week,unitIndex:currentIndex+1,lesson:snapshot(currentIndex+1)});
  }
  function deriveUnitIndex(state, student, week) {
    const plan = scheduledPlan(state,student,week);
    return nextPracticeIndex(state,student,plan) ?? units().length-1;
  }
  function fresh(student, week, index, plannedIndex = index, state) {
    const lesson=snapshot(index);
    if(state && window.LearningReview)lesson.expectations=window.LearningReview.expectations(state,student,week,{unitIndex:clamp(index),lesson});
    return {id: key(student.id, week), studentId: student.id, weekStart: week, unitIndex: clamp(index), plannedUnitIndex:clamp(plannedIndex), lesson, practiceFinished: false, practicedAt: null, itemStates: Array(6).fill("unassessed"), notes: "", nextAction: "advance", manuallyAssigned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
  }
  function pendingExtras(state, student, week) {
    const latest = new Map();
    records(state,student).filter(r => r.weekStart < week).forEach(record => {
      sessions(record).forEach(session => {
        (session.removedExtraPracticeIds || []).forEach(id => latest.delete(id));
        (session.additionalPractice || []).forEach(item => latest.set(item.entryId,item));
      });
    });
    return copy([...latest.values()].filter(item => item.state !== "known" || !item.practiceFinished));
  }
  function getRecord(state, student, week, create = false) {
    let r = state.records[key(student.id, week)];
    const plan = scheduledPlan(state,student,week);
    const expected = deriveUnitIndex(state, student, week);
    if (!r) r = fresh(student, week, expected,plan.unitIndex,state);
    else if (!anchor(r) && r.unitIndex !== expected) r = {...r, ...fresh(student, week, expected,plan.unitIndex,state)};
    else if(!anchor(r) && window.LearningReview && !r.lesson.expectations) r={...r,lesson:{...r.lesson,expectations:window.LearningReview.expectations(state,student,week,r)}};
    if (!r.additionalPractice && !anchor(r)) {
      const pending = pendingExtras(state, student, week);
      if (pending?.length) r = {...r, additionalPractice:copy(pending)};
    }
    if (create) state.records[key(student.id, week)] = r;
    return r;
  }
  function validateRecord(r, ids, depth = 0) {
    if (!r || typeof r !== "object" || !ids.has(r.studentId) || !validDate(r.weekStart) || monday(r.weekStart) !== r.weekStart || !Number.isInteger(r.unitIndex) || r.unitIndex < 0 || r.unitIndex >= units().length) throw new Error("A lesson record has an invalid child, date or lesson number.");
    if (!r.lesson || !Array.isArray(r.lesson.words) || r.lesson.words.length !== 5 || !r.lesson.words.every(w => typeof w === "string") || typeof r.lesson.sentence !== "string") throw new Error("A lesson record is missing its five words or sentence.");
    if(r.lesson.expectations!==undefined && (!Array.isArray(r.lesson.expectations) || r.lesson.expectations.length!==6 || r.lesson.expectations.some(item=>typeof item!=="string" || !item.trim() || item.length>250)))throw new Error("Saved lesson expectations are invalid.");
    if (!Array.isArray(r.itemStates) || r.itemStates.length !== 6 || r.itemStates.some(s => !["known", "learning", "unassessed"].includes(s))) throw new Error("A lesson record has invalid knowledge marks.");
    if (r.notes != null && typeof r.notes !== "string") throw new Error("A lesson note is invalid.");
    if (r.practicedAt && !Number.isFinite(Date.parse(r.practicedAt))) throw new Error("A practice date is invalid.");
    if (r.awaitingMonthlyExam !== undefined && typeof r.awaitingMonthlyExam !== "boolean") throw new Error("A monthly exam checkpoint is invalid.");
    if (r.examPreparation !== undefined && (!r.examPreparation || !validDate(r.examPreparation.periodStart) || r.examPreparation.weekStart !== r.weekStart || r.examPreparation.unitIndex !== r.unitIndex)) throw new Error("An exam preparation assignment is invalid.");
    if (r.plannedUnitIndex !== undefined && (!Number.isInteger(r.plannedUnitIndex) || r.plannedUnitIndex<0 || r.plannedUnitIndex>=units().length)) throw new Error("A scheduled lesson number is invalid.");
    if (r.additionalPractice !== undefined) {
      if (!Array.isArray(r.additionalPractice) || r.additionalPractice.length > 1000) throw new Error("Extra practice is invalid.");
      const extraIds = new Set();
      r.additionalPractice.forEach(item => {
        if (!item || typeof item.entryId !== "string" || extraIds.has(item.entryId) || typeof item.title !== "string" || typeof item.text !== "string" || typeof item.category !== "string" || !["unassessed","learning","known"].includes(item.state) || typeof item.practiceFinished !== "boolean" || !Array.isArray(item.sourcePages) || item.sourcePages.some(p => !Number.isInteger(p) || p < 1 || p > 44)) throw new Error("An extra-practice record is invalid.");
        extraIds.add(item.entryId);
      });
    }
    if (r.removedExtraPracticeIds !== undefined && (!Array.isArray(r.removedExtraPracticeIds) || r.removedExtraPracticeIds.length > 1000 || r.removedExtraPracticeIds.some(id => typeof id !== "string"))) throw new Error("Extra-practice removal details are invalid.");
    if (r.completedLessons !== undefined) {
      if (depth || !Array.isArray(r.completedLessons)) throw new Error("Lesson history is invalid.");
      r.completedLessons.forEach(old => { validateRecord(old, ids, 1); if(old.studentId !== r.studentId || old.weekStart !== r.weekStart) throw new Error("Lesson history belongs to a different child or week."); });
    }
  }
  function migrate(candidate) {
    if (!candidate || !Array.isArray(candidate.students) || !candidate.records || Array.isArray(candidate.records) || typeof candidate.records !== "object") throw new Error("The file is missing its children or lesson records.");
    if (Number(candidate.schemaVersion) > (window.LearningReview ? 7 : window.MonthlyExams ? 6 : 3)) throw new Error("This backup needs a newer version of the app.");
    const s = copy(candidate), ids = new Set();
    s.students.forEach(child => {
      if (!child || typeof child.id !== "string" || !child.id || ids.has(child.id)) throw new Error("Child IDs are missing or duplicated.");
      ids.add(child.id);
      if (typeof child.englishName !== "string" || typeof child.chineseName !== "string") throw new Error("A child name is invalid.");
      if (child.deletedAt !== undefined && (child.active !== false || typeof child.deletedAt !== "string" || !Number.isFinite(Date.parse(child.deletedAt)))) throw new Error("A deleted child's recovery details are invalid.");
      if (child.joinedAt !== undefined && (typeof child.joinedAt !== "string" || !Number.isFinite(Date.parse(child.joinedAt)))) throw new Error("A child's joining date is invalid.");
      child.startUnit = clamp(child.startUnit);
    });
    Object.entries(s.records).forEach(([k,r]) => { validateRecord(r, ids); if(k !== key(r.studentId,r.weekStart)) throw new Error("A lesson record has an invalid identifier."); });
    if (!Array.isArray(s.classes)) {
      const groups = [...new Set(s.students.map(c => c.group || "Seahorse"))];
      s.classes = groups.map((name,i) => ({id: `legacy-class-${i+1}`, name, startWeek: Object.values(s.records).filter(r => s.students.some(c => c.id === r.studentId && (c.group || "Seahorse") === name)).map(r => r.weekStart).sort()[0] || monday()}));
      s.students.forEach(c => { c.classId = s.classes.find(g => g.name === (c.group || "Seahorse")).id; });
    }
    const classIds = new Set();
    s.classes.forEach(c => {
      if (!c || typeof c.id !== "string" || !c.id || classIds.has(c.id) || typeof c.name !== "string" || !c.name.trim()) throw new Error("Class details are invalid or duplicated.");
      classIds.add(c.id);
      c.startWeek = validDate(c.startWeek) ? monday(c.startWeek) : monday();
    });
    s.students.forEach(c => {
      if (!classIds.has(c.classId)) throw new Error("A child belongs to a missing class.");
      c.startWeek = validDate(c.startWeek) ? monday(c.startWeek) : s.classes.find(g => g.id === c.classId).startWeek;
    });
    if(window.MonthlyExams) {
      window.MonthlyExams.upgrade?.(s,Number(candidate.schemaVersion || 1));
      window.MonthlyExams.normalize(s,{legacy:Number(candidate.schemaVersion || 1)<4});
    }
    if(window.LearningReview)window.LearningReview.normalize(s,{legacy:Number(candidate.schemaVersion || 1)<7});
    s.schemaVersion = window.LearningReview ? 7 : window.MonthlyExams ? 6 : 3; s.appVersion = window.LearningReview ? "2.5.0" : window.MonthlyExams ? "2.4.2" : "2.1.2";
    s.selectedClassId = classIds.has(s.selectedClassId) ? s.selectedClassId : s.students.find(c => c.id === s.selectedStudentId)?.classId || s.classes[0]?.id || null;
    s.selectedWeekStart = validDate(s.selectedWeekStart) ? monday(s.selectedWeekStart) : monday();
    return s;
  }
  function prepareExamPractice(state,classId,periodStart,studentId) {
    const child=state.students.find(item=>item.id===studentId && item.classId===classId && item.active!==false);
    if(!child || !window.MonthlyExams) throw new Error("Choose an active child for practice.");
    const missing=window.MonthlyExams.readiness(state,classId,periodStart,studentId).missing[0];
    if(!missing) throw new Error("All assigned practice is already finished.");
    const access=window.MonthlyExams.access(state,child,missing.weekStart,missing.unitIndex);
    if(!access.allowed) throw new Error(access.reason);
    const id=key(child.id,missing.weekStart),existing=state.records[id];
    if(existing && !existing.practiceFinished && sameLesson(existing,missing.unitIndex,missing.lesson)) {
      existing.examPreparation={periodStart,weekStart:missing.weekStart,unitIndex:missing.unitIndex};
    } else {
      const prepared=fresh(child,missing.weekStart,missing.unitIndex,missing.unitIndex,state);
      prepared.lesson=copy(missing.lesson);
      prepared.examPreparation={periodStart,weekStart:missing.weekStart,unitIndex:missing.unitIndex};
      if(existing) {
        const history=copy(existing.completedLessons || []);
        if(activity(existing)) {const previous=copy(existing);delete previous.completedLessons;history.push(previous);}
        if(history.length) prepared.completedLessons=history;
      }
      state.records[id]=prepared;
    }
    state.selectedClassId=classId;state.selectedStudentId=studentId;state.selectedWeekStart=missing.weekStart;
    return copy(missing);
  }
  function complete(state, student, week) {
    const preview = getRecord(state,student,week);
    if(window.MonthlyExams && !window.MonthlyExams.access(state,student,week,preview.unitIndex).allowed) return false;
    const r = getRecord(state, student, week, true);
    if (!status(r).mastered || !r.practiceFinished || r.curriculumFinished) return false;
    if (r.unitIndex === units().length - 1) { r.curriculumFinished = true; return true; }
    const nextIndex = nextPendingUnit(state,student,week,r.unitIndex);
    if (nextIndex === null) { r.curriculumFinished = true; return true; }
    if (window.MonthlyExams && !window.MonthlyExams.access(state,student,week,nextIndex).allowed) {
      r.awaitingMonthlyExam = true;
      r.completedAt ||= r.practicedAt || new Date().toISOString();
      return true;
    }
    const archived = copy(r); delete archived.completedLessons; delete archived.awaitingMonthlyExam;
    archived.completedAt ||= new Date().toISOString();
    const next = fresh(student, week, nextIndex,scheduledPlan(state,student,week).unitIndex,state);
    next.completedLessons = [...(r.completedLessons || []), archived];
    if (r.additionalPractice?.length) next.additionalPractice = copy(r.additionalPractice.filter(item => item.state !== "known" || !item.practiceFinished));
    next.autoOpened = true;
    state.records[key(student.id,week)] = next;
    return true;
  }
  function deleteStudent(state, id) {
    const child = state.students.find(item => item.id === id);
    if (!child || child.active === false) return false;
    const classmates = state.students.filter(item => item.active !== false && item.classId === child.classId).sort((a,b) => (a.rosterNumber ?? 9999) - (b.rosterNumber ?? 9999));
    const position = classmates.findIndex(item => item.id === id);
    child.active = false;
    child.deletedAt = new Date().toISOString();
    window.MonthlyExams?.refresh?.(state,child.classId);
    if (state.selectedStudentId === id) {
      const remaining = classmates.filter(item => item.id !== id);
      state.selectedStudentId = remaining[Math.min(position,remaining.length-1)]?.id || null;
    }
    return true;
  }
  function restoreStudent(state, id) {
    const child = state.students.find(item => item.id === id);
    if (!child || child.active !== false) return false;
    child.active = true;
    delete child.deletedAt;
    window.MonthlyExams?.refresh?.(state,child.classId);
    return true;
  }
  window.TrackerModel = {monday, gap, snapshot, coreActivity, activity, sessions, status, weekStatus, scheduledPlan, weekPlan, nextPendingUnit, deriveUnitIndex, getRecord, migrate, prepareExamPractice, complete, deleteStudent, restoreStudent};
})();

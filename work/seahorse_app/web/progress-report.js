(function () {
  "use strict";
  const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value ?? "");
  const keyFor = value => text(value).normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase();
  const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
  function dayOf(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : null;
  }
  const inside = (day,from,to) => Boolean(day && day >= from && day <= to);
  const excelDate = value => validDay(value) ? new Date(`${value}T12:00:00`) : null;
  function monthsBetween(from,to) {
    const months=[];
    for(let date=new Date(`${from.slice(0,7)}-01T12:00:00`);;date.setMonth(date.getMonth()+1)) {
      const month=dayOf(date).slice(0,7);
      if(month>to.slice(0,7)) break;
      const last=dayOf(new Date(date.getFullYear(),date.getMonth()+1,0,12));
      months.push({month,startDate:from>`${month}-01` ? from : `${month}-01`,endDate:to<last ? to : last});
      if(months.length>1200) throw new Error("Choose a report range shorter than 100 years.");
    }
    return months;
  }
  function sessionRows(state,students) {
    const ids=new Set(students.map(child=>child.id)), rows=[];
    for(const [recordKey,record] of Object.entries(state.records || {})) {
      if(!ids.has(record.studentId)) continue;
      [...(record.completedLessons || []),record].forEach((session,index)=>{
        const states=Array.isArray(session.itemStates) ? session.itemStates : [];
        const hasMarks=states.some(mark=>mark === "known" || mark === "learning");
        const extra=(session.additionalPractice || []).filter(item=>item.practiceFinished || ["known","learning"].includes(item.state));
        if(!session.practiceFinished && !hasMarks && !text(session.notes).trim() && !extra.length) return;
        const timestamp=session.practicedAt || session.completedAt || null, actualDay=dayOf(timestamp);
        const activityDate=actualDay || record.weekStart;
        if(!validDay(activityDate)) return;
        const words=(session.lesson?.words || []).map(text), sentence=text(session.lesson?.sentence);
        const assessed=states.filter(mark=>mark === "known" || mark === "learning").length;
        const known=states.filter(mark=>mark === "known").length;
        rows.push({studentId:record.studentId,recordId:recordKey,sessionIndex:index+1,sourceKey:`${recordKey}::session-${index+1}`,recordedWeek:record.weekStart,
          activityDate,actualPracticeDate:actualDay,dateBasis:actualDay ? (session.practicedAt ? "Actual practice date" : "Completion date") : "Recorded week (actual date unavailable)",
          lastSavedEdit:dayOf(session.updatedAt),
          timestamp:timestamp || `${activityDate}T12:00:00`,unitIndex:session.unitIndex,levelName:text(session.lesson?.levelName),curriculumWeek:session.lesson?.levelWeek ?? null,
          topic:text(session.lesson?.topic),words,sentence,itemStates:states.slice(),assessed,known,practiceFinished:Boolean(session.practiceFinished),
          lessonMastered:Boolean(session.practiceFinished && words.length && states.slice(0,words.length+1).every(mark=>mark === "known") && states.length>=words.length+1),
          notes:text(session.notes),extra:copy(extra),lessonKey:JSON.stringify([session.unitIndex,words.map(keyFor),keyFor(sentence)])});
      });
    }
    return rows.sort((a,b)=>a.activityDate.localeCompare(b.activityDate) || text(a.timestamp).localeCompare(text(b.timestamp)) || a.recordedWeek.localeCompare(b.recordedWeek) || a.sessionIndex-b.sessionIndex);
  }
  function monthMetrics(all,period) {
    const inMonth=all.filter(row=>inside(row.activityDate,period.startDate,period.endDate));
    const latestWord=new Map(), latestSentence=new Map(), priorWord=new Map(), priorSentence=new Map(), becameWord=new Set(), becameSentence=new Set();
    for(const row of all.filter(item=>item.activityDate<=period.endDate)) {
      const within=inside(row.activityDate,period.startDate,period.endDate);
      row.words.forEach((word,index)=>{
        const mark=row.itemStates[index],key=keyFor(word);
        if(!key || !["known","learning"].includes(mark)) return;
        if(within) {if(mark === "known" && priorWord.get(key) === "learning") becameWord.add(key); latestWord.set(key,mark);}
        priorWord.set(key,mark);
      });
      const mark=row.itemStates[row.words.length],key=keyFor(row.sentence);
      if(key && ["known","learning"].includes(mark)) {
        if(within) {if(mark === "known" && priorSentence.get(key) === "learning") becameSentence.add(key); latestSentence.set(key,mark);}
        priorSentence.set(key,mark);
      }
    }
    const countKnown = map => [...map.values()].filter(mark=>mark === "known").length;
    return {practicesFinished:inMonth.filter(row=>row.practiceFinished).length,lessonsMastered:new Set(inMonth.filter(row=>row.lessonMastered).map(row=>row.lessonKey)).size,
      wordsAssessed:latestWord.size || null,wordsKnown:latestWord.size ? countKnown(latestWord) : null,wordsNeedPractice:latestWord.size ? latestWord.size-countKnown(latestWord) : null,
      sentencesAssessed:latestSentence.size || null,sentencesKnown:latestSentence.size ? countKnown(latestSentence) : null,sentencesNeedPractice:latestSentence.size ? latestSentence.size-countKnown(latestSentence) : null,
      wordsBecameKnown:latestWord.size ? becameWord.size : null,sentencesBecameKnown:latestSentence.size ? becameSentence.size : null,
      latestRecordedWordsKnown:priorWord.size ? countKnown(priorWord) : null,latestRecordedSentencesKnown:priorSentence.size ? countKnown(priorSentence) : null,
      assessmentStatus:latestWord.size || latestSentence.size ? "Assessment recorded" : "Not assessed in this period",
      fallbackDates:inMonth.filter(row=>!row.actualPracticeDate).length,notes:inMonth.filter(row=>row.notes).map(row=>`${row.activityDate}: ${row.notes}`).join("\n")};
  }
  function examIndexes(attempt,total) {
    return Array.isArray(attempt?.itemIndexes) ? [...new Set(attempt.itemIndexes.filter(index=>Number.isInteger(index) && index>=0 && index<total))] : Array.from({length:total},(_,index)=>index);
  }
  function examScore(attempt,items,threshold=80) {
    const states=Array.isArray(attempt?.itemStates) ? attempt.itemStates : [];
    const indexes=examIndexes(attempt,items.length),total=indexes.length,sampled=Array.isArray(attempt?.itemIndexes);
    const assessed=indexes.filter(index=>["known","learning"].includes(states[index])).length,known=indexes.filter(index=>states[index]==="known").length;
    const score=attempt?.completedAt && total>0 && states.length===items.length && assessed===total ? known/total : null;
    if(!window.MonthlyExams?.resultForAttempt) throw new Error("The saved exam scoring rules are unavailable. Reinstall the latest app.");
    // Reports and application history must use the same saved per-attempt rule.
    // The completeness guard above still keeps incomplete observations unscored.
    const result=window.MonthlyExams.resultForAttempt(attempt,items.length,threshold,items);
    return {known,assessed,total,poolTotal:items.length,sampled,indexes,score,passed:score!==null && result.passed,passPercent:result.passPercent,scoringRule:result.scoringRule};
  }
  function examRows(state,students,options) {
    const ids=new Set(students.map(child=>child.id)), summaries=[],attempts=[];
    for(const round of Object.values(state.monthlyExams?.rounds || {})) {
      if(round.classId!==options.classId || round.periodStart>options.endDate || round.periodEnd<options.startDate) continue;
      for(const member of round.cohort || []) {
        if(!ids.has(member.studentId)) continue;
        const bundle=round.attempts?.[member.studentId] || {}, total=(member.items || []).length;
        const corrections=new Map((bundle.corrections || []).filter(item=>dayOf(item.at) && dayOf(item.at)<=options.endDate).map(item=>[item.attemptId,item]));
        const history=(bundle.history || []).filter(attempt=>attempt.completedAt && (dayOf(attempt.completedAt) || round.periodStart)<=options.endDate)
          .slice().sort((a,b)=>text(a.completedAt).localeCompare(text(b.completedAt)) || text(a.id).localeCompare(text(b.id)));
        const draft=bundle.draft && (dayOf(bundle.draft.updatedAt || bundle.draft.startedAt) || round.periodStart)<=options.endDate ? bundle.draft : null;
        const threshold=round.policySnapshot?.individualPassPercent ?? round.policySnapshot?.passPercent ?? 80;
        const latest=history.at(-1),first=history[0],latestResult=latest ? examScore(latest,member.items || [],threshold) : {score:null,known:null,assessed:0,total:draft ? examIndexes(draft,total).length : total,passPercent:draft?.passPercent ?? threshold};
        const latestCorrection=corrections.get(latest?.id);
        summaries.push({studentId:member.studentId,roundId:round.id,periodStart:round.periodStart,periodEnd:round.periodEnd,periodMonth:round.periodStart.slice(0,7),
          totalItems:latestResult.total,poolTotal:total,sampled:Boolean((latest || draft)?.itemIndexes),firstScore:first && !corrections.has(first.id) ? examScore(first,member.items || [],threshold).score : null,firstAttemptDate:first ? dayOf(first.completedAt) : null,
          latestScore:latestCorrection ? null : latestResult.score,originalLatestScore:latestCorrection ? latestResult.score : null,correctionDate:latestCorrection ? dayOf(latestCorrection.at) : null,correctionReason:text(latestCorrection?.reason),latestAttemptDate:latest ? dayOf(latest.completedAt) : null,completedAttempts:history.length,retests:Math.max(0,history.length-1),
          passThreshold:latestResult.passPercent/100,status:latestCorrection ? "Corrected — reassessment required" : latestResult.score===null ? (draft ? "In progress" : total ? "Not assessed" : "No lesson items") : latestResult.passed ? "Passed" : "Needs practice",
          latestNotes:text(latest?.notes),known:latestResult.known,assessed:latestResult.assessed});
        const candidates=[...history,...(draft ? [draft] : [])];
        candidates.forEach((attempt,index)=>{
          const date=dayOf(attempt.completedAt || attempt.updatedAt || attempt.startedAt) || round.periodStart;
          if(date>options.endDate) return;
          const result=examScore(attempt,member.items || [],threshold),selected=new Set(result.indexes),correction=corrections.get(attempt.id);
          const itemDetails=(member.items || []).map((item,itemIndex)=>({text:text(item.text || item.word || item.sentence || item.label),kind:item.kind,weekStart:item.weekStart,unitIndex:item.unitIndex,assessment:!selected.has(itemIndex) ? "Not sampled" : attempt.itemStates?.[itemIndex] === "known" ? "Knows it" : attempt.itemStates?.[itemIndex] === "learning" ? "Needs practice" : "Not assessed"}));
          const items=itemDetails.map(item=>`${item.text}: ${item.assessment}`).join("\n");
          attempts.push({studentId:member.studentId,roundId:round.id,periodStart:round.periodStart,periodEnd:round.periodEnd,attemptId:attempt.id,
            attemptNumber:attempt.completedAt ? index+1 : null,attemptType:(attempt.completedAt ? index ? "Retest" : "First attempt" : "Draft")+(correction ? " (corrected)" : ""),attemptDate:date,
            dateBasis:attempt.completedAt ? "Completed attempt" : attempt.updatedAt || attempt.startedAt ? "Draft updated / started" : "Assessment period (date unavailable)",
            withinReportRange:inside(date,options.startDate,options.endDate),completed:Boolean(attempt.completedAt),totalItems:result.total,poolTotal:total,sampled:result.sampled,assessed:result.assessed,known:result.known,score:correction ? null : result.score,originalScore:correction ? result.score : null,status:correction ? "Corrected" : result.score===null ? "In progress" : result.passed ? "Passed" : "Needs practice",correctionDate:correction ? dayOf(correction.at) : null,correctionReason:text(correction?.reason),notes:text(attempt.notes),items,itemDetails});
        });
      }
    }
    summaries.sort((a,b)=>a.periodStart.localeCompare(b.periodStart) || a.studentId.localeCompare(b.studentId));
    attempts.sort((a,b)=>a.periodStart.localeCompare(b.periodStart) || a.studentId.localeCompare(b.studentId) || a.attemptDate.localeCompare(b.attemptDate) || (a.attemptNumber || 999)-(b.attemptNumber || 999));
    return {summaries,attempts};
  }
  function build(state,options) {
    if(!state || !Array.isArray(state.students) || !Array.isArray(state.classes)) throw new Error("Saved class data is unavailable.");
    if(!options || !["class","student"].includes(options.scope)) throw new Error("Choose the current class or one child for this report.");
    if(!validDay(options.startDate) || !validDay(options.endDate) || options.startDate>options.endDate) throw new Error("Choose a valid report start and end date.");
    const group=state.classes.find(item=>item.id===options.classId);
    if(!group) throw new Error("Choose a class for this report.");
    const students=state.students.filter(child=>child.classId===group.id && (options.scope === "student" ? child.id===options.studentId : child.active!==false)).map(child=>({id:child.id,englishName:text(child.englishName),chineseName:text(child.chineseName),studentCode:text(child.studentCode),classId:group.id,className:group.name,active:child.active!==false}));
    if(!students.length) throw new Error(options.scope === "student" ? "The selected child does not belong to this class." : "There are no active children in this class to report.");
    const examStudents=options.scope === "class" ? state.students.filter(child=>child.classId===group.id).map(child=>({id:child.id,englishName:text(child.englishName),chineseName:text(child.chineseName),studentCode:text(child.studentCode),active:child.active!==false})) : students;
    const months=monthsBetween(options.startDate,options.endDate),all=sessionRows(state,students),exams=examRows(state,examStudents,options);
    const individualProgress=students.flatMap(child=>months.map(period=>{
      const metrics=monthMetrics(all.filter(row=>row.studentId===child.id),period);
      const periodExams=exams.summaries.filter(exam=>exam.studentId===child.id && exam.periodStart<=period.endDate && exam.periodEnd>=period.startDate);
      const latest=periodExams.filter(exam=>exam.latestScore!==null || exam.correctionDate).at(-1) || periodExams.at(-1);
      return {studentId:child.id,...period,...metrics,examStatus:latest?.status || "Not assessed",examFirstScore:latest?.firstScore ?? null,examLatestScore:latest?.latestScore ?? null,examRetests:latest?.retests ?? null,examNotes:latest?.latestNotes || "",examPeriod:latest ? `${latest.periodStart} to ${latest.periodEnd}` : "",examPeriods:periodExams.map(exam=>`${exam.periodStart} to ${exam.periodEnd}`).join("\n")};
    }));
    const classProgress=options.scope === "class" ? months.map(period=>{
      const children=individualProgress.filter(row=>row.month===period.month),assessed=children.filter(row=>row.wordsAssessed!==null || row.sentencesAssessed!==null);
      const monthExams=exams.summaries.filter(exam=>exam.periodStart<=period.endDate && exam.periodEnd>=period.startDate),latestExam=monthExams.filter(exam=>exam.latestScore!==null || exam.correctionDate).at(-1) || monthExams.at(-1);
      const examCohort=monthExams.filter(exam=>exam.roundId===latestExam?.roundId),examResults=examCohort.filter(exam=>exam.latestScore!==null);
      const sum=field=>children.reduce((total,row)=>total+(row[field] || 0),0);
      const sumAssessed=field=>children.some(row=>row[field]!==null) ? sum(field) : null;
      return {...period,children:students.length,childrenAssessed:assessed.length,practicesFinished:sum("practicesFinished"),lessonsMastered:sum("lessonsMastered"),
        childWordsAssessed:sumAssessed("wordsAssessed"),childWordsKnown:sumAssessed("wordsKnown"),childSentencesKnown:sumAssessed("sentencesKnown"),
        examChildrenCompleted:examResults.length,examCohortSize:examCohort.length || null,examAverage:examResults.length ? examResults.reduce((total,row)=>total+row.latestScore,0)/examResults.length : null,
        examCoverage:examCohort.length ? examResults.length/examCohort.length : null,examPeriod:latestExam ? `${latestExam.periodStart} to ${latestExam.periodEnd}` : "",assessmentStatus:assessed.length ? `${assessed.length} of ${students.length} active children assessed` : "No assessments recorded"};
    }) : [];
    const report={meta:{title:"EtonHouse English Tracker",scope:options.scope,classId:group.id,className:group.name,startDate:options.startDate,endDate:options.endDate,
      generatedAt:options.generatedAt || new Date().toISOString(),studentCount:students.length,
      method:"Practice totals count saved sessions once by actual practice date. Undated legacy sessions use the labelled recorded week. Weekly marks are the latest saved version, not a full edit timeline; later edits can overwrite earlier knowledge and notes. Repeated words and sentence structures are counted once per child using the latest recorded assessment attributed to each month. Blank knowledge results mean not assessed. Newly known counts require an earlier needs-practice observation. Exam content may differ between months; scores are not a standardized growth measure.",
      examMethod:"Exam periods overlap the report range. First, retest and latest completed attempts are shown as of the report end; actual dates are separate from the lesson-plan period. A four-week period can appear in two monthly summaries, not as two exams. Scores count only items asked. New exams require 80% overall and a strict majority in vocabulary and sentences. Completed historical exams keep their saved scoring rule and threshold. Draft scores stay blank. Corrected results are excluded from valid scores and averages from their correction date; their original scores, dates and reasons remain in the audit columns. Unasked items are Not sampled in Exam item detail."},
      students,examStudents,months,individualProgress,classProgress,practiceDetail:all.filter(row=>inside(row.activityDate,options.startDate,options.endDate)).map(row=>({...row,editedAfterReportEnd:Boolean(row.lastSavedEdit && row.lastSavedEdit>options.endDate)})),monthlyExams:exams.summaries,examAttempts:exams.attempts};
    report.sheets=sheetData(report);
    return report;
  }
  function sheetData(report) {
    const byId=new Map([...report.examStudents,...report.students].map(child=>[child.id,child]));
    const identity=row=>{const child=byId.get(row.studentId);return [child?.englishName || child?.chineseName || "",child?.chineseName || "",child?.studentCode || ""];};
    const make=(name,headers,rows,types,widths,note)=>({name,headers,rows,types,widths,note});
    const sheets=[make("Individual progress",["Child","Chinese name","Student ID","Month","Practices finished","Distinct lessons mastered","Words assessed","Words known","Words need practice","Words became known","Sentences assessed","Sentences known","Sentences became known","Assessment status","First exam score","Latest exam score","Retests","Exam status","Exam period shown","Teacher note references"],
      report.individualProgress.map(row=>[...identity(row),excelDate(`${row.month}-01`),row.practicesFinished,row.lessonsMastered,row.wordsAssessed,row.wordsKnown,row.wordsNeedPractice,row.wordsBecameKnown,row.sentencesAssessed,row.sentencesKnown,row.sentencesBecameKnown,row.assessmentStatus,row.examFirstScore,row.examLatestScore,row.examRetests,row.examStatus,row.examPeriod,[row.notes ? "Notes in Practice detail" : "",row.examNotes ? "Note in Monthly exams" : ""].filter(Boolean).join("; ")]),
      {3:"month",14:"percent",15:"percent"},[23,18,15,15,18,23,17,16,20,21,20,19,25,30,18,19,13,23,32,57],"Latest saved weekly marks are attributed to practice dates, not a full edit timeline. Later edits overwrite earlier marks; see Practice detail edit flags. Blank means not assessed. Became known needs an earlier needs-practice mark. Latest completed exam period is summarized; all periods appear in Monthly exams.")];
    if(report.meta.scope === "class") sheets.push(make("Class progress",["Month","Active children","Active children assessed","Practices finished","Distinct child-lessons mastered","Child-word items assessed","Child-word items known","Child-sentence items known","Children with exam results","Mean latest exam score","Frozen cohort exam coverage","Assessment status","Frozen exam cohort size","Exam period shown"],
      report.classProgress.map(row=>[excelDate(`${row.month}-01`),row.children,row.childrenAssessed,row.practicesFinished,row.lessonsMastered,row.childWordsAssessed,row.childWordsKnown,row.childSentencesKnown,row.examChildrenCompleted,row.examAverage,row.examCoverage,row.assessmentStatus,row.examCohortSize,row.examPeriod]),
      {0:"month",9:"percent",10:"percent"},[16,20,27,21,32,28,26,30,29,25,30,43,27,32],"Practice counts cover the active roster. Exam mean and coverage use the displayed frozen exam cohort, including children since removed. The latest period with completed results is shown. Child-word counts count a word separately per child. Different content is not standardized growth."));
    sheets.push(make("Practice detail",["Child","Chinese name","Student ID","Activity date","Date basis","Actual practice date","Recorded week","Recorded month","Practice finished","All lesson items known","Known items","Assessed items","Level","Curriculum week","Topic","Vocabulary","Sentence structure","Knowledge marks","Teacher notes","Extra practice","Source record","Session","Last saved edit","Edited after report end"],
      report.practiceDetail.map(row=>[...identity(row),excelDate(row.activityDate),row.dateBasis,excelDate(row.actualPracticeDate),excelDate(row.recordedWeek),excelDate(`${row.recordedWeek.slice(0,7)}-01`),row.practiceFinished ? "Yes" : "No",row.lessonMastered ? "Yes" : "No",row.assessed ? row.known : null,row.assessed || null,row.levelName,row.curriculumWeek,row.topic,row.words.join("; "),row.sentence,row.itemStates.map(mark=>mark === "known" ? "Knows it" : mark === "learning" ? "Needs practice" : "Not assessed").join("; "),row.notes,row.extra.map(item=>`${item.title}: ${item.state}; ${item.practiceFinished ? "practised" : "not practised"}`).join("\n"),row.recordId,row.sessionIndex,excelDate(row.lastSavedEdit),row.lastSavedEdit ? row.editedAfterReportEnd ? "Yes — latest saved marks" : "No" : "Edit date unavailable"]),
      {3:"date",5:"date",6:"date",7:"month",22:"date"},[23,18,15,18,43,22,19,20,20,24,16,18,23,20,30,66,65,65,65,65,35,12,23,34],"Source: latest saved individual practice records, not a complete edit history. Early completion credit is not a second practice. Recorded week is a fallback only when the actual practice date is unavailable. Edit dates and after-range flags are shown at the right."));
    sheets.push(make("Monthly exams",["Child","Chinese name","Student ID","Assessment period start","Assessment period end","Exam items","First completed score","First attempt date","Latest completed score","Latest attempt date","Completed attempts","Retests","Pass threshold","Latest result","Latest teacher note","Current roster status","Original corrected score","Correction date","Correction reason"],
      report.monthlyExams.map(row=>[...identity(row),excelDate(row.periodStart),excelDate(row.periodEnd),row.totalItems || null,row.firstScore,excelDate(row.firstAttemptDate),row.latestScore,excelDate(row.latestAttemptDate),row.completedAttempts,row.retests,row.passThreshold,row.status,row.latestNotes,byId.get(row.studentId)?.active===false ? "Removed — frozen exam member" : "Active",row.originalLatestScore,excelDate(row.correctionDate),row.correctionReason]),
      {3:"date",4:"date",6:"percent",7:"date",8:"percent",9:"date",12:"percent",16:"percent",17:"date"},[23,18,15,27,27,16,25,22,26,23,24,14,19,38,65,35,26,22,65],report.meta.examMethod));
    sheets.push(make("Exam attempts",["Child","Chinese name","Student ID","Assessment period start","Assessment period end","Attempt date","Date basis","Date in report range","Attempt","Attempt type","Completed","Exam items","Assessed items","Known items","Score","Teacher notes","Source round","Attempt ID","Result status","Original corrected score","Correction date","Correction reason"],
      report.examAttempts.map(row=>[...identity(row),excelDate(row.periodStart),excelDate(row.periodEnd),excelDate(row.attemptDate),row.dateBasis,row.withinReportRange ? "Yes" : "No",row.attemptNumber,row.attemptType,row.completed ? "Yes" : "No",row.totalItems || null,row.assessed || null,row.assessed ? row.known : null,row.score,row.notes,row.roundId,row.attemptId,row.status,row.originalScore,excelDate(row.correctionDate),row.correctionReason]),
      {3:"date",4:"date",5:"date",14:"percent",19:"percent",20:"date"},[23,18,15,27,27,20,36,25,13,28,18,17,19,17,15,65,42,38,23,26,22,65],"Source: saved exam attempts for the assessment periods shown. First attempts and retests are retained. Draft and corrected scores remain blank. Corrected original scores and reasons are audit information, not current results. Full word-by-word and sentence marks are in Exam item detail."));
    sheets.push(make("Exam item detail",["Child","Chinese name","Student ID","Assessment period start","Assessment period end","Attempt date","Attempt","Attempt type","Completed","Lesson-plan week","Curriculum lesson","Item type","Vocabulary or sentence","Assessment","Source round","Attempt ID"],
      report.examAttempts.flatMap(row=>row.itemDetails.map(item=>[...identity(row),excelDate(row.periodStart),excelDate(row.periodEnd),excelDate(row.attemptDate),row.attemptNumber,row.attemptType,row.completed ? "Yes" : "No",excelDate(item.weekStart),Number.isInteger(item.unitIndex) ? item.unitIndex+1 : null,item.kind === "sentence" ? "Sentence structure" : "Vocabulary",item.text,item.assessment,row.roundId,row.attemptId])),
      {3:"date",4:"date",5:"date",9:"date"},[23,18,15,27,27,20,13,20,18,23,22,23,65,23,42,38],"Every saved exam item is shown separately for each attempt. The lesson-plan week identifies the frozen teaching content; attempt date identifies when it was assessed. Not assessed is different from needs practice."));
    return sheets;
  }
  function toWorkbook(report,library=window.XLSX) {
    if(!library?.utils || !library?.write) throw new Error("The offline Excel exporter is unavailable. Reinstall the latest app.");
    const book=library.utils.book_new();
    book.Props={Title:"EtonHouse English progress",Subject:`${report.meta.startDate} to ${report.meta.endDate}`,Author:"EtonHouse",Company:"EtonHouse",Comments:report.meta.method,CreatedDate:new Date(report.meta.generatedAt)};
    for(const definition of report.sheets) {
      const scope=report.meta.scope === "student" ? (report.students[0].englishName || report.students[0].chineseName) : report.meta.className;
      const matrix=[[],[`EtonHouse English Tracker: ${definition.name}`],[scope,null,null,null,`${report.meta.startDate} to ${report.meta.endDate}`],[definition.note],[],definition.headers,...definition.rows];
      const sheet=library.utils.aoa_to_sheet(matrix,{cellDates:false,dateNF:"dd mmm yyyy"});
      for(let row=6;row<matrix.length;row++) for(let col=0;col<definition.headers.length;col++) {const cell=sheet[library.utils.encode_cell({r:row,c:col})];if(cell?.t==="n") cell.z="0";}
      sheet["!cols"]=definition.widths.map(width=>({wch:width}));
      sheet["!rows"]=[{hpt:9},{hpt:25},{hpt:22},{hpt:48},{hpt:9},{hpt:38},...definition.rows.map(row=>({hpt:Math.min(125,Math.max(27,...row.map(value=>typeof value === "string" ? (value.split("\n").length+Math.floor(value.length/70))*14 : 0)))}))];
      sheet["!autofilter"]={ref:library.utils.encode_range({r:5,c:0},{r:Math.max(5,matrix.length-1),c:definition.headers.length-1})};
      Object.entries(definition.types).forEach(([col,type])=>{
        for(let row=6;row<matrix.length;row++) {const cell=sheet[library.utils.encode_cell({r:row,c:Number(col)})];if(cell) cell.z=type === "percent" ? "0.0%" : type === "month" ? "mmm yyyy" : "dd mmm yyyy";}
      });
      library.utils.book_append_sheet(book,sheet,definition.name);
    }
    return book;
  }
  // SheetJS CE preserves typed values. Its bundled, public CFB API adds only
  // presentation XML here: brand headers, readable wrapped cells and frozen panes.
  function presentation(bytes,library,definitions) {
    const cfb=library.CFB;
    if(!cfb?.read || !cfb?.write || !cfb?.find) throw new Error("The offline Excel formatter is unavailable.");
    const zip=cfb.read(bytes,{type:"array"}),decoder=new TextDecoder(),encoder=new TextEncoder();
    const read=name=>{const entry=cfb.find(zip,`/${name}`);if(!entry) throw new Error(`Excel export is missing ${name}.`);return decoder.decode(new Uint8Array(entry.content));};
    const write=(name,value)=>{const entry=cfb.find(zip,`/${name}`);entry.content=encoder.encode(value);};
    let styles=read("xl/styles.xml"),titleStyle,headerStyle,bodyStyle,noteStyle;
    const fonts=styles.match(/<fonts count="(\d+)"[^>]*>([\s\S]*?)<\/fonts>/),fills=styles.match(/<fills count="(\d+)"[^>]*>([\s\S]*?)<\/fills>/),xfs=styles.match(/<cellXfs count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/);
    if(!fonts || !fills || !xfs) throw new Error("Excel presentation styles could not be created.");
    const fontCount=Number(fonts[1]),fillCount=Number(fills[1]),xfCount=Number(xfs[1]);
    styles=styles.replace(fonts[0],`<fonts count="${fontCount+2}">${fonts[2].replace(/<font>[\s\S]*?<\/font>/,'<font><sz val="11"/><color rgb="FF26292E"/><name val="Arial"/><family val="2"/></font>')}<font><b/><sz val="15"/><color rgb="FFC40018"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>`);
    styles=styles.replace(fills[0],`<fills count="${fillCount+1}">${fills[2]}<fill><patternFill patternType="solid"><fgColor rgb="FFC40018"/><bgColor indexed="64"/></patternFill></fill></fills>`);
    titleStyle=xfCount;headerStyle=xfCount+1;bodyStyle=xfCount+2;noteStyle=xfCount+3;
    const newXfs=`<xf numFmtId="0" fontId="${fontCount}" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="${fontCount+1}" fillId="${fillCount}" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf>`;
    const alignedExisting=xfs[2].replace(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g,(_,attrs,children="")=>`<xf${attrs.replace(/\s+applyAlignment="[^"]*"/,"")} applyAlignment="1">${children.replace(/<alignment\b[^>]*\/>/g,"")}<alignment horizontal="${Number(attrs.match(/numFmtId="(\d+)"/)?.[1])>0 ? "center" : "left"}" vertical="top" wrapText="1"/></xf>`);
    styles=styles.replace(xfs[0],`<cellXfs count="${xfCount+4}">${alignedExisting}${newXfs}</cellXfs>`);
    write("xl/styles.xml",styles);
    definitions.forEach((definition,index)=>{
      const name=`xl/worksheets/sheet${index+1}.xml`;let xml=read(name);
      const view='<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="6" topLeftCell="B7" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B7" sqref="B7"/></sheetView></sheetViews>';
      xml=/<sheetViews[\s\S]*?<\/sheetViews>/.test(xml) ? xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/,view) : xml.replace(/(<dimension[^>]*\/>)/,`$1${view}`);
      xml=xml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g,(match,attrs,col,rowText)=>{
        const row=Number(rowText),existing=attrs.match(/\bs="(\d+)"/);let style=null;
        if(row===2) style=titleStyle;else if(row===6) style=headerStyle;else if(row===4) style=noteStyle;else if(row>=7 && (!existing || existing[1]==="0")) style=bodyStyle;
        return style===null ? match : `<c${attrs.replace(/\s+s="[^"]*"/,"")} s="${style}">`;
      });
      // Context rows span otherwise-empty cells; body data and table headers stay unmerged.
      const last=library.utils.encode_col(Math.min(definition.headers.length-1,7));
      const merges=`<mergeCells count="4"><mergeCell ref="A2:${last}2"/><mergeCell ref="A3:D3"/><mergeCell ref="E3:${last}3"/><mergeCell ref="A4:${last}4"/></mergeCells>`;
      xml=xml.replace(/<mergeCells[\s\S]*?<\/mergeCells>/,"");
      xml=/<autoFilter\b[^>]*\/>/.test(xml) ? xml.replace(/(<autoFilter\b[^>]*\/>)/,`$1${merges}`) : xml.replace("</sheetData>",`</sheetData>${merges}`);
      write(name,xml);
    });
    return new Uint8Array(cfb.write(zip,{fileType:"zip",compression:true}));
  }
  function exportDetailedXlsx(state,options) {
    const report=build(state,options),library=window.XLSX,book=toWorkbook(report,library);
    const bytes=presentation(new Uint8Array(library.write(book,{bookType:"xlsx",type:"array",compression:true,cellStyles:true,ignoreEC:false})),library,report.sheets);
    const label=options.scope === "student" ? report.students[0].englishName || report.students[0].chineseName : report.meta.className;
    const safe=label.replace(/[<>:"/\\|?*\u0000-\u001f]/g," ").trim().slice(0,70) || "Progress";
    return {bytes,fileName:`EtonHouse ${safe} progress ${options.startDate} to ${options.endDate}.xlsx`,mimeType:MIME,report};
  }
  const dayPlus=(day,count)=>{const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);};
  const weekOf=day=>{const date=new Date(`${day}T12:00:00Z`);return dayPlus(day,-((date.getUTCDay()+6)%7));};
  const xmlEscape=value=>text(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  const prettyDay=day=>new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
  const monthName=month=>new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"});
  function familyObservations(state,studentIds,endDate) {
    const ids=new Set(studentIds),observations=[];
    const add=(studentId,kind,value,mark,date,timestamp,source,flags={})=>{
      if(!ids.has(studentId) || !validDay(date) || !["known","learning"].includes(mark) || !keyFor(value)) return;
      observations.push({studentId,kind,text:text(value),key:`${kind}:${keyFor(value)}`,mark,date,timestamp,source,...flags});
    };
    for(const row of sessionRows(state,studentIds.map(id=>({id})))) {
      const record=state.records[row.recordId],original=row.sessionIndex<=(record.completedLessons || []).length ? record.completedLessons[row.sessionIndex-1] : record;
      const editDay=dayOf(original.updatedAt),useEdit=editDay && (editDay>row.activityDate || editDay===row.activityDate && Date.parse(original.updatedAt)>Date.parse(row.timestamp));
      const date=useEdit ? editDay : row.activityDate,timestamp=useEdit ? original.updatedAt : row.timestamp;
      const flags={usesEditDate:Boolean(useEdit && editDay>row.activityDate),usesWeekFallback:!row.actualPracticeDate && !useEdit};
      row.words.forEach((word,index)=>add(row.studentId,"vocabulary",word,row.itemStates[index],date,timestamp,"practice",flags));
      add(row.studentId,"sentence",row.sentence,row.itemStates[row.words.length],date,timestamp,"practice",flags);
    }
    for(const round of Object.values(state.monthlyExams?.rounds || {})) for(const member of round.cohort || []) {
      if(!ids.has(member.studentId)) continue;
      const bundle=round.attempts?.[member.studentId] || {};
      const corrected=new Set((bundle.corrections || []).filter(item=>(dayOf(item.at) || "9999")<=endDate).map(item=>item.attemptId));
      for(const attempt of bundle.history || []) {
        if(corrected.has(attempt.id))continue;
        const date=dayOf(attempt.completedAt);if(!date) continue;
        for(const index of examIndexes(attempt,(member.items || []).length)) {const item=member.items[index];add(member.studentId,item.kind === "sentence" ? "sentence" : "vocabulary",item.text,attempt.itemStates?.[index],date,attempt.completedAt,"exam");}
      }
    }
    // In simultaneous conflicting marks, a needs-practice observation is the conservative latest result.
    return observations.sort((a,b)=>a.date.localeCompare(b.date) || Date.parse(a.timestamp)-Date.parse(b.timestamp) || (a.mark==="learning")-(b.mark==="learning") || a.source.localeCompare(b.source));
  }
  function buildFamily(state,options) {
    const detailed=build(state,options),observations=familyObservations(state,detailed.students.map(child=>child.id),options.endDate),usedNames=new Set();
    const children=detailed.students.map(child=>{
      const all=observations.filter(item=>item.studentId===child.id && item.date<=options.endDate),within=all.filter(item=>item.date>=options.startDate);
      const firstKnown=new Map(),latest=new Map();all.forEach(item=>latest.set(item.key,item));within.forEach(item=>{if(item.mark==="known" && !firstKnown.has(item.key))firstKnown.set(item.key,item);});
      const words=[],sentences=[],practisingWords=[],practisingSentences=[];
      for(const item of firstKnown.values()) if(latest.get(item.key)?.mark==="known") (item.kind==="sentence" ? sentences : words).push({text:item.text,firstDemonstratedDate:item.date,month:item.date.slice(0,7)});
      const seenPractice=new Set();for(const item of within) if(latest.get(item.key)?.mark==="learning" && !seenPractice.has(item.key)) {seenPractice.add(item.key);(item.kind==="sentence" ? practisingSentences : practisingWords).push({text:latest.get(item.key).text,demonstratedEarlier:firstKnown.has(item.key)});}
      const seenWord=new Set(),seenSentence=new Set(),points=[];
      for(let week=weekOf(options.startDate);week<=options.endDate;week=dayPlus(week,7)) {
        const start=week<options.startDate ? options.startDate : week,end=dayPlus(week,6)>options.endDate ? options.endDate : dayPlus(week,6),items=within.filter(item=>inside(item.date,start,end));
        const wordItems=items.filter(item=>item.kind==="vocabulary"),sentenceItems=items.filter(item=>item.kind==="sentence"),priorWord=seenWord.size,priorSentence=seenSentence.size;
        wordItems.forEach(item=>{if(item.mark==="known")seenWord.add(item.key);});sentenceItems.forEach(item=>{if(item.mark==="known")seenSentence.add(item.key);});
        points.push({date:start,label:prettyDay(start),newWords:wordItems.length ? seenWord.size-priorWord : null,newSentences:sentenceItems.length ? seenSentence.size-priorSentence : null,words:wordItems.length ? seenWord.size : null,sentences:sentenceItems.length ? seenSentence.size : null});
      }
      while(points.length && points[0].words===null && points[0].sentences===null) points.shift();
      const name=[child.englishName,child.chineseName].filter((value,index,array)=>value && array.indexOf(value)===index).join(" ");
      const base=(child.englishName || child.chineseName || "Learning story").replace(/[\[\]:*?\/\\\u0000-\u001f]/g," ").replace(/^'+|'+$/g,"").trim() || "Learning story";
      const shorten=(value,limit)=>{const chars=[...value];while(chars.join("").length>limit)chars.pop();return chars.join("");};
      let sheetName=shorten(base,31),suffix=1;while(usedNames.has(sheetName.toLocaleLowerCase()) || sheetName.toLowerCase()==="history") {const tail=` (${++suffix})`;sheetName=shorten(base,31-tail.length)+tail;}usedNames.add(sheetName.toLocaleLowerCase());
      const review=window.LearningReview?.reportSummary(state,child.id,options.startDate,options.endDate) || {checked:0,known:0,needsPractice:[]};
      const nextTarget=review.needsPractice[0]?.text || practisingWords[0]?.text || practisingSentences[0]?.text;
      const nextStep=nextTarget ? `Practise “${nextTarget}” in a familiar game or everyday conversation.` : within.length ? "Revisit a few learned words and sentences during familiar play." : "Start with a short, familiar practice and record what your child can do.";
      return {studentId:child.id,name,className:detailed.meta.className,sheetName,points,demonstratedWords:seenWord.size,demonstratedSentences:seenSentence.size,words,sentences,practisingWords,practisingSentences,review,nextStep,hasAssessments:within.length>0,usesEditDates:within.some(item=>item.usesEditDate),usesWeekFallback:within.some(item=>item.usesWeekFallback)};
    });
    return {meta:{title:"EtonHouse English learning",scope:options.scope,className:detailed.meta.className,startDate:options.startDate,endDate:options.endDate,generatedAt:detailed.meta.generatedAt,studentCount:children.length},students:children.map(child=>({id:child.studentId,englishName:child.name,className:child.className})),children,sheets:children.map(child=>({name:child.sheetName}))};
  }
  function familyWorkbook(report,library,styles) {
    const book=library.utils.book_new(),definitions=[];
    book.Props={Title:"EtonHouse English learning",Subject:`${report.meta.startDate} to ${report.meta.endDate}`,Author:"EtonHouse",Company:"EtonHouse",CreatedDate:new Date(report.meta.generatedAt)};
    book.Workbook={Names:[],Sheets:[]};
    for(const child of report.children) {
      const sheet={},roles={},merges=[],heights=Array.from({length:31},()=>({hpt:18}));
      const put=(address,value,role="body",formula)=>{const cell=value instanceof Date ? {t:"n",v:(Date.UTC(value.getFullYear(),value.getMonth(),value.getDate())-Date.UTC(1899,11,30))/86400000} : typeof value==="number" ? {t:"n",v:value} : {t:"s",v:text(value)};if(formula)cell.f=formula;sheet[address]=cell;roles[address]=styles[role];};
      const span=(row,start,end,value,role="body")=>{for(let col=start;col<=end;col++) put(`${library.utils.encode_col(col)}${row}`,col===start ? value : "",role);merges.push({s:{r:row-1,c:start},e:{r:row-1,c:end}});};
      const weightedLength=value=>[...text(value)].reduce((count,char)=>count+(char.charCodeAt(0)>255?2:1),0);
      span(2,6,10,"English learning","reportTitle");merges.at(-1).e.r=2;
      const displayRange=`${prettyDay(report.meta.startDate)} ${report.meta.startDate.slice(0,4)} – ${prettyDay(report.meta.endDate)} ${report.meta.endDate.slice(0,4)}`;
      span(4,6,10,displayRange,"dateRange");merges.at(-1).e.r=4;
      span(6,1,10,"","rule");span(7,1,10,`${child.name}’s English journey`,"name");merges.at(-1).e.r=7;
      if(weightedLength(child.name)>70) {heights[6]={hpt:28};heights[7]={hpt:28};}
      span(9,1,10,child.className,"className");heights[9]={hpt:11};
      let row;
      if(child.hasAssessments) {
        const singleObservation=child.points.filter(point=>point.words!==null || point.sentences!==null).length===1;
        const caption=singleObservation ? "One recorded observation is shown. More observations are needed to show change over time." : "Counts show different words and sentences demonstrated so far in this report period. A gap means no assessment was recorded.";
        span(27,1,10,caption,"caption");merges.at(-1).e.r=27;row=30;
      } else {span(12,1,10,"No assessments recorded in this period.","section");span(14,1,10,"The next report will show the words and sentences your child demonstrates.","caption");merges.at(-1).e.r=14;row=18;}
      const extraNotes=[child.usesEditDates ? "Revised observations use the date they were last saved." : "",child.usesWeekFallback ? "Some earlier observations use their recorded week because an exact date was not saved." : ""].filter(Boolean);
      if(extraNotes.length) {span(row,1,10,extraNotes.join(" "),"quiet");heights[row-1]={hpt:32};row+=2;}
      const wordRows=items=>{for(let offset=0;offset<items.length;offset+=3) {const group=items.slice(offset,offset+3);for(const [index,item] of group.entries()) {const [from,to]=[[1,3],[4,6],[7,10]][index];span(row,from,to,item.text,"word");}heights[row-1]={hpt:Math.max(25,...group.map(item=>Math.ceil(weightedLength(item.text)/28)*16+8))};row++;}};
      const sentenceRows=items=>{for(const item of items) {span(row,1,10,item.text,"sentence");heights[row-1]={hpt:Math.max(26,Math.ceil(weightedLength(item.text)/90)*16+8)};row++;}};
      if(child.words.length || child.sentences.length) {
        span(row,1,10,"What I’ve learned","section");row+=2;
        const months=[...new Set([...child.words,...child.sentences].map(item=>item.month))].sort();
        for(const month of months) {
          span(row,1,10,monthName(month),"month");heights[row-1]={hpt:24};row+=2;
          const words=child.words.filter(item=>item.month===month),sentences=child.sentences.filter(item=>item.month===month);
          if(words.length){span(row++,1,10,"Words","label");wordRows(words);row++;}
          if(sentences.length){span(row++,1,10,"Sentence structures","label");sentenceRows(sentences);row++;}
        }
      } else if(child.hasAssessments) {span(row,1,10,"We are still building confidence with these words and sentences.","caption");heights[row-1]={hpt:32};row+=2;}
      if(child.practisingWords.length || child.practisingSentences.length) {
        span(row,1,10,"Still practising","practice");heights[row-1]={hpt:25};row+=2;
        if(child.practisingWords.length){span(row++,1,10,"Words","label");wordRows(child.practisingWords);row++;}
        if(child.practisingSentences.length){span(row++,1,10,"Sentence structures","label");sentenceRows(child.practisingSentences);row++;}
      }
      span(row,1,10,"Later review","section");row+=2;
      span(row,1,10,child.review.checked ? `${child.review.known} of ${child.review.checked} targets known at their latest review in this period. Earlier achievements remain recorded.` : "No later review recorded in this period.","caption");heights[row-1]={hpt:32};row+=2;
      span(row,1,10,"Next step","section");row+=2;
      span(row,1,10,child.nextStep,"body");heights[row-1]={hpt:Math.max(32,Math.ceil(weightedLength(child.nextStep)/90)*16+8)};row+=2;
      const visibleLastRow=row+1,pointCount=Math.max(1,child.points.length);
      put("Z1","Week date","quiet");put("AA1","Week","quiet");put("AB1","New words demonstrated","quiet");put("AC1","New sentence structures demonstrated","quiet");put("AD1","Words demonstrated","quiet");put("AE1","Sentence structures demonstrated","quiet");
      child.points.forEach((point,index)=>{const r=index+2;put(`Z${r}`,excelDate(point.date),"date");put(`AA${r}`,point.label,"quiet",`TEXT(Z${r},"d mmm")`);if(point.newWords!==null)put(`AB${r}`,point.newWords,"number");if(point.newSentences!==null)put(`AC${r}`,point.newSentences,"number");if(point.words!==null)put(`AD${r}`,point.words,"number",`IF(ISNUMBER(AB${r}),SUM($AB$2:AB${r}),"")`);if(point.sentences!==null)put(`AE${r}`,point.sentences,"number",`IF(ISNUMBER(AC${r}),SUM($AC$2:AC${r}),"")`);});
      sheet["!ref"]=`A1:AE${Math.max(visibleLastRow,pointCount+1)}`;sheet["!merges"]=merges;sheet["!cols"]=Array.from({length:31},(_,index)=>({wch:index===0 || index===11 ? 3 : 10,...(index>=25 ? {hidden:true} : {})}));sheet["!rows"]=heights;
      sheet["!margins"]={left:0.3,right:0.3,top:0.35,bottom:0.35,header:0.1,footer:0.1};
      const index=definitions.length;book.Workbook.Names.push({Name:"_xlnm.Print_Area",Sheet:index,Ref:`'${child.sheetName.replace(/'/g,"''")}'!$A$1:$L$${visibleLastRow}`});book.Workbook.Sheets.push({name:child.sheetName,Hidden:0});
      library.utils.book_append_sheet(book,sheet,child.sheetName);definitions.push({child,roles,visibleLastRow});
    }
    return {book,definitions};
  }
  function familyPresentation(bytes,library,report,definitions,template) {
    const cfb=library.CFB,zip=cfb.read(bytes,{type:"array"}),source=cfb.read(template.base64,{type:"base64"}),encoder=new TextEncoder(),decoder=new TextDecoder();
    const read=(archive,name)=>{const entry=cfb.find(archive,`/${name}`);if(!entry)throw new Error(`The report template is missing ${name}.`);return decoder.decode(new Uint8Array(entry.content));};
    const add=(name,value)=>{const data=typeof value==="string" ? encoder.encode(value) : value,entry=cfb.find(zip,`/${name}`);if(entry)entry.content=data;else cfb.utils.cfb_add(zip,`/${name}`,data);};
    add("xl/styles.xml",read(source,"xl/styles.xml"));add("xl/media/etonhouse.png",new Uint8Array(cfb.find(source,"/xl/media/image.png").content));
    let contentTypes=read(zip,"[Content_Types].xml");if(!/Extension="png"/.test(contentTypes))contentTypes=contentTypes.replace("</Types>",'<Default Extension="png" ContentType="image/png"/></Types>');
    definitions.forEach(({child,roles},index)=>{
      const number=index+1,sheetPath=`xl/worksheets/sheet${number}.xml`,drawingPath=`xl/drawings/drawing${number}.xml`;
      const chartPaths=[`xl/charts/chart${index*2+1}.xml`,`xl/charts/chart${index*2+2}.xml`];
      let xml=read(zip,sheetPath);
      xml=xml.replace(/<c\b([^>]*\br="([A-Z]+\d+)"[^>]*)>/g,(match,attrs,address)=>`<c${attrs.replace(/\s+s="[^"]*"/,"")} s="${roles[address] ?? template.styles.base}">`);
      xml=xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/,'<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90"/></sheetViews>');
      const props='<sheetPr><tabColor rgb="FFC90024"/><pageSetUpPr fitToPage="1"/></sheetPr>';
      xml=/<sheetPr\b/.test(xml) ? xml.replace(/<sheetPr\b[\s\S]*?<\/sheetPr>/,props) : xml.replace(/(<worksheet\b[^>]*>)/,`$1${props}`);
      xml=xml.replace("</worksheet>",'<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/><drawing r:id="rIdFamilyDrawing"/></worksheet>');
      add(sheetPath,xml);
      add(`xl/worksheets/_rels/sheet${number}.xml.rels`,'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFamilyDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing'+number+'.xml"/></Relationships>');
      let drawing=read(source,"xl/drawings/drawing1.xml"),rels=read(source,"xl/drawings/_rels/drawing1.xml.rels");
      rels=rels.replace('/xl/media/image.png','/xl/media/etonhouse.png').replace(/\/xl\/drawings\/charts\/chart([12])\.xml/g,(_,n)=>`/${chartPaths[Number(n)-1]}`);
      if(!child.hasAssessments) {drawing=drawing.replace(/<xdr:twoCellAnchor>[\s\S]*?<\/xdr:twoCellAnchor>/g,"");rels=rels.replace(/<Relationship\b(?=[^>]*relationships\/chart")[^>]*\/>/g,"");}
      add(drawingPath,drawing);add(`xl/drawings/_rels/drawing${number}.xml.rels`,rels);
      contentTypes=contentTypes.replace("</Types>",`<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
      if(child.hasAssessments) for(const [chartIndex,field] of ["words","sentences"].entries()) {
        const chartPath=chartPaths[chartIndex],column=chartIndex===0 ? "AD" : "AE";
        let chart=read(source,`xl/drawings/charts/chart${chartIndex+1}.xml`);
        const refName=xmlEscape(`'${child.sheetName.replace(/'/g,"''")}'`),lastRow=child.points.length+1;
        chart=chart.replace(/<c:ser>[\s\S]*?<\/c:ser>/g,series=>{
          const categories=`<c:strCache><c:ptCount val="${child.points.length}"/>${child.points.map((point,i)=>`<c:pt idx="${i}"><c:v>${xmlEscape(point.label)}</c:v></c:pt>`).join("")}</c:strCache>`;
          const values=`<c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="${child.points.length}"/>${child.points.map((point,i)=>point[field]===null ? "" : `<c:pt idx="${i}"><c:v>${point[field]}</c:v></c:pt>`).join("")}</c:numCache>`;
          let bound=series.replace(/<c:f>[^<]+<\/c:f>/g,(_,offset)=>offset<series.indexOf("<c:val>") ? `<c:f>${refName}!$AA$2:$AA$${lastRow}</c:f>` : `<c:f>${refName}!$${column}$2:$${column}$${lastRow}</c:f>`).replace(/<c:strCache>[\s\S]*?<\/c:strCache>/,categories).replace(/<c:numCache>[\s\S]*?<\/c:numCache>/,values);
          const marker='<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>';
          return /<c:marker>/.test(bound) ? bound.replace(/<c:marker>[\s\S]*?<\/c:marker>/,marker) : bound.replace("<c:cat>",`${marker}<c:cat>`);
        });
        chart=chart.replace(/<c:dispBlanksAs\b[^>]*\/>/g,"").replace(/<c:plotVisOnly\b[^>]*\/>/,'<c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/>');
        const maximum=Math.max(1,...child.points.map(point=>point[field] || 0)),step=maximum<=5 ? 1 : maximum<=20 ? 5 : maximum<=50 ? 10 : maximum<=100 ? 20 : Math.ceil(maximum/100)*20;
        chart=chart.replace(/<c:valAx>[\s\S]*?<\/c:valAx>/,axis=>axis.replace(/<c:majorUnit\b[^>]*\/>/g,"").replace(/<c:scaling>[\s\S]*?<\/c:scaling>/,'<c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling>').replace("</c:valAx>",`<c:majorUnit val="${step}"/></c:valAx>`));
        chart=chart.replace(/<c:tickLblSkip\b[^>]*\/>/g,"");if(child.points.length>5)chart=chart.replace("</c:catAx>",`<c:tickLblSkip val="${Math.ceil(child.points.length/5)}"/></c:catAx>`);
        add(chartPath,chart);contentTypes=contentTypes.replace("</Types>",`<Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      }
    });
    add("[Content_Types].xml",contentTypes);
    return new Uint8Array(cfb.write(zip,{fileType:"zip",compression:true}));
  }
  function exportXlsx(state,options) {
    const library=window.XLSX,template=window.EtonFamilyReportTemplate;if(!template?.base64)throw new Error("The family report template is unavailable. Reinstall the latest app.");
    const report=buildFamily(state,options),{book,definitions}=familyWorkbook(report,library,template.styles);
    const bytes=familyPresentation(new Uint8Array(library.write(book,{bookType:"xlsx",type:"array",compression:true,ignoreEC:false})),library,report,definitions,template);
    const label=report.meta.scope==="student" ? report.children[0].name : report.meta.className,safeChars=[...(label.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g," ").trim() || "Learning")].slice(0,70),prefix="EtonHouse ",suffix=` learning ${options.startDate} to ${options.endDate}.xlsx`;
    while(new TextEncoder().encode(prefix+safeChars.join("")+suffix).length>240)safeChars.pop();
    return {bytes,fileName:prefix+safeChars.join("")+suffix,mimeType:MIME,report};
  }
  window.ProgressReport={build,toWorkbook,exportDetailedXlsx,buildFamily,exportXlsx};
})();

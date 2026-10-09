(function () {
  "use strict";

  const STORAGE_KEY = "seahorse-english-tracker-v1";
  const curriculum = Array.isArray(window.CURRICULUM) ? window.CURRICULUM : [];
  const curriculumMeta = window.CURRICULUM_META || {};
  const guide = window.GUIDE_LIBRARY || {meta:{}, levels:[], entries:[], pages:[]};
  const $ = (id) => document.getElementById(id);
  const refs = {};
  const model = window.TrackerModel;
  const exams = window.MonthlyExams;
  const learningReview = window.LearningReview;
  let state = window.createSeedState();
  let storageBlocked = false;
  let pendingImport = null;
  let lastCompletion = null;
  let guideVisibleCount = 30;
  const guideCategories = {vocabulary:"Vocabulary", sentences:"Sentence structures", grammar:"Grammar", listening:"Listening & speaking", phonics:"Phonics", reading:"Reading & sight words", writing:"Writing", songs:"Songs & rhymes", teaching:"Teaching guidance", source:"Original guide pages"};
  let currentFilter = "all";
  let searchTerm = "";
  let editingStudentId = null;
  let curriculumLevelFilter = null;
  let noteTimer = null;
  let toastTimer = null;
  let examPeriod = null;
  let examStudentId = null;
  let pendingExamAction = null;
  let reportLength = 2;
  let reportExportPending = false;
  let currentView = "practice";
  let visibleReviewItems = [];
  let reviewChildId = null;
  let pendingCorrection = null;

  const elementIds = [
    "reviewTimingForm", "reviewFirstDays", "reviewRepeatDays", "saveReviewTimingButton", "reviewTimingMessage",
    "toolsButton", "toolsDialog", "practiceNavButton", "reviewNavButton", "reportNavButton", "practiceView", "reviewView", "reviewItems", "reviewMessage", "futureGoalButton", "futureGoalDialog", "futureGoalForm", "futureGoalWeek", "futureGoalTarget", "futureGoalExpectation", "futureGoalMessage", "examCorrectionDialog", "examCorrectionForm", "examCorrectionReason", "examCorrectionMessage", "pauseExamButton",
    "examReadinessStatus", "examPracticeButton", "examAbsenceButton",
    "examRequiredDialog", "examRequiredMessage", "examRequiredAction", "examConfirmDialog", "examConfirmMessage", "examConfirmAction",
    "monthlyExamsButton", "monthlyExamBadge", "monthlyGateNotice", "monthlyGateTitle", "monthlyGateMessage", "openRequiredExamButton", "monthlyExamsDialog", "monthlyExamsTitle", "examPeriodSelect", "examPolicyButton", "examRulesSummary", "examClassStatus", "examChildList", "examChildTitle", "examChildResult", "examInstructions", "examItems", "examTeacherNote", "examMarkProgress", "startExamButton", "finishExamButton", "examAttemptsDetails", "examAttemptsList", "examMessage", "examPolicyDialog", "examPolicyIntro", "examPeriodKind", "examPassPercent", "examIndividualRule", "examPolicyMessage", "saveExamPolicyButton", "progressReportButton", "progressReportDialog", "reportStartDate", "reportEndDate", "reportScope", "reportStudentLabel", "reportStudentSelect", "reportPreview", "reportMessage", "downloadProgressReportButton",
    "weekCompletionNotice", "weekCompletionTitle", "weekCompletionDate", "completionSourceButton", "nextPracticeLabel", "nextPracticeHint", "summaryEarlyNote",
    "guideLibraryButton", "guideDialog", "guideSearch", "guideLevelSelect", "guideCategorySelect", "guideResults", "guideSummary", "grammarCompanion", "grammarContent", "openGuideButton",
    "lessonPane", "classSelect", "manageClassesButton", "classesDialog", "classForm", "classNameInput", "classStartInput", "classLevelInput", "importRosterInput", "importPreview", "confirmImportButton", "downloadTemplateButton", "classMessage", "completeKnownButton", "completionNotice", "undoCompletionButton", "nextUnpracticedButton", "openBackupsButton", "storageAlert", "previousWeekButton", "nextWeekButton", "weekPickerButton", "weekDateInput", "weekLabel", "weekDateLabel", "todayButton",
    "studentCountBadge", "practicedCount", "masteredCount", "needsReviewCount", "summaryProgressFill",
    "studentSearch", "addStudentButton", "filterRow", "rosterWarning", "warningAddButton", "studentList",
    "curriculumButton", "dataButton", "emptyState", "lessonContent", "rosterPosition", "editStudentButton",
    "studentName", "studentChineseName", "historyButton", "changeCurriculumButton", "levelPill",
    "curriculumWeekLabel", "topicLabel", "masteryStrand", "vocabularyItems", "sentenceItem", "sentenceCountLabel", "practiceIcon",
    "practiceTitle", "practiceDescription", "practiceButton", "masteryMessage", "teacherNotes", "saveStatus",
    "previousStudentButton", "previousStudentName", "nextStudentButton", "nextStudentName", "studentNavigationStatus",
    "studentDialog", "studentForm", "studentDialogTitle", "englishNameInput", "chineseNameInput", "startingLevelInput",
    "deleteStudentButton", "recentlyDeletedButton", "deletedStudentsDialog", "deletedStudentsTitle", "deletedStudentsList", "deletedStudentsMessage",
    "saveStudentButton", "curriculumDialog", "curriculumSummary", "curriculumTabs", "curriculumList",
    "historyDialog", "historyTitle", "historyList", "dataDialog", "exportBackupButton", "importBackupInput", "resetProgressButton",
    "exportCsvButton", "dataMessage", "lessonPickerDialog", "lessonPickerSelect", "confirmLessonChangeButton", "toast"
  ];

  function initializeRefs() {
    elementIds.forEach((id) => { refs[id] = $(id); });
    if (window.ResizeObserver) {
      const header = refs.monthlyExamsDialog.querySelector(".modal-header");
      new window.ResizeObserver(()=>{
        refs.monthlyExamsDialog.style.setProperty("--exam-header-height",`${header.getBoundingClientRect().height}px`);
      }).observe(header);
    }
  }

  function mondayStart(input) {
    return model.monday(input);
  }

  function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function weeksBetween(startWeek, endWeek) {
    const start = new Date(`${startWeek}T12:00:00`);
    const end = new Date(`${endWeek}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.round((end - start) / oneWeekMs));
  }

  function formatWeekRange(isoDate) {
    const start = new Date(`${isoDate}T12:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const options = { day: "numeric", month: "short" };
    const startText = new Intl.DateTimeFormat("en-GB", options).format(start);
    const endText = new Intl.DateTimeFormat("en-GB", { ...options, year: "numeric" }).format(end);
    return `${startText} - ${endText}`;
  }

  function formatWeekName(isoDate) {
    const todayWeek = mondayStart(new Date());
    if (isoDate === todayWeek) return "This week";
    if (isoDate === addDays(todayWeek, -7)) return "Last week";
    if (isoDate === addDays(todayWeek, 7)) return "Next week";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(`${isoDate}T12:00:00`));
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function activeStudents() {
    return state.students
      .filter((student) => student.active !== false && student.classId === state.selectedClassId)
      .sort((a, b) => (a.rosterNumber ?? 9999) - (b.rosterNumber ?? 9999));
  }

  function studentInitials(student) {
    const name = String(student.englishName || student.chineseName || "?").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function recordKey(studentId, weekStart) {
    return `${studentId}::${weekStart}`;
  }

  function unitAt(index) {
    if (!curriculum.length) {
      return { id: "missing", levelId: "missing", levelName: "Curriculum unavailable", ageBand: "", levelWeek: 0, globalWeek: 0, topic: "", words: ["-", "-", "-", "-", "-"], sentence: "-" };
    }
    return curriculum[Math.max(0, Math.min(Number(index) || 0, curriculum.length - 1))];
  }

  function recordHasActivity(record) {
    return model.activity(record);
  }

  function recordsForStudent(studentId) {
    return Object.values(state.records)
      .filter((record) => record.studentId === studentId)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  function fallbackRecordForWeek(student, weekStart) { return model.getRecord(state, student, weekStart); }
  function deriveUnitIndex(student, weekStart) { return model.deriveUnitIndex(state, student, weekStart); }

  function makeSnapshot(unit) {
    return {
      curriculumId: unit.id,
      levelId: unit.levelId,
      levelName: unit.levelName,
      ageBand: unit.ageBand,
      levelWeek: unit.levelWeek,
      globalWeek: unit.globalWeek,
      topic: unit.topic,
      words: clone(unit.words),
      sentence: unit.sentence,
      sentenceIsReview: Boolean(unit.sentenceIsReview),
      reviewWordPositions: clone(unit.reviewWordPositions || []),
      sourcePages: clone(unit.sourcePages || [])
    };
  }

  function getRecord(student, weekStart, create) { return model.getRecord(state, student, weekStart, create); }

  function normalizedItemStates(record) {
    const expected = (record.lesson?.words?.length || 5) + 1;
    const values = Array.isArray(record.itemStates) ? record.itemStates.slice(0, expected) : [];
    while (values.length < expected) values.push("unassessed");
    return values.map((value) => ["unassessed", "learning", "known"].includes(value) ? value : "unassessed");
  }

  function statusForRecord(record) { return model.status(record); }
  function weeklyStatus(record) { return model.weekStatus(record,state,state.students.find(child => child.id === record.studentId),record.weekStart); }
  function weekPlan(student,week = state.selectedWeekStart) { return model.weekPlan?.(state,student,week) || null; }
  function completionDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "Exact date not recorded";
    return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"long",year:"numeric"}).format(new Date(value));
  }

  function selectedStudent() {
    return activeStudents().find((student) => student.id === state.selectedStudentId) || null;
  }

  function monthlyAccess(student, week = state.selectedWeekStart, unitIndex) {
    if (!exams || !student) return {allowed:true};
    const index = unitIndex ?? getRecord(student,week,false).unitIndex;
    return exams.access(state,student,week,index);
  }

  function requireMonthlyAccess(student, week = state.selectedWeekStart, unitIndex) {
    const access = monthlyAccess(student,week,unitIndex);
    if (access.allowed) return true;
    showRequiredExam(access);
    return false;
  }

  function examCheckpoint(student = selectedStudent()) {
    if (!student || !exams) return {required:false};
    if (exams.checkpoint) return exams.checkpoint(state,student,{week:state.selectedWeekStart});
    const access = monthlyAccess(student);
    return {...access,required:!access.allowed,periodStart:access.blockingPeriod,studentId:student.id};
  }

  function attentionFor(button, period) {
    if (!button) return;
    if (!period) {
      button.classList.remove("exam-attention");
      delete button.dataset.attentionPeriod;
    } else if (button.dataset.attentionPeriod !== period) {
      button.classList.remove("exam-attention");
      void button.offsetWidth;
      button.dataset.attentionPeriod = period;
      button.classList.add("exam-attention");
    }
  }

  function showRequiredExam(requirement) {
    const period = requirement.periodStart || (typeof requirement.blockingPeriod === "string" ? requirement.blockingPeriod : requirement.blockingPeriod?.start);
    const message = requirement.reason || "Complete the required exam before moving to the next lesson or teaching week.";
    showToast(`Exam required. ${message}`);
    if (!refs.examRequiredDialog) return;
    refs.examRequiredMessage.textContent = message;
    refs.examRequiredAction.dataset.period = period || "";
    refs.examRequiredAction.dataset.studentId = requirement.studentId || state.selectedStudentId || "";
    attentionFor(refs.examRequiredAction,null);
    if (!refs.examRequiredDialog.open) refs.examRequiredDialog.showModal();
    attentionFor(refs.examRequiredAction,period || "required");
  }

  function alertAfterCompletion(student) {
    // A saved exam (or a held completion in another week) keeps the reminder
    // visible, but must not interrupt an allowed same-month practice. Only the
    // completion just held at the exam boundary warrants an automatic modal.
    const record = getRecord(student,state.selectedWeekStart,false);
    if (!record.awaitingMonthlyExam) return;
    const checkpoint = examCheckpoint(student);
    if (checkpoint.required) showRequiredExam(checkpoint);
  }

  function selectTeachingWeek(week) {
    if (week > state.selectedWeekStart) {
      const child = selectedStudent();
      const access = monthlyAccess(child,week,child ? model.scheduledPlan(state,child,week).unitIndex : undefined);
      if (!access.allowed) {
        refs.weekDateInput.value = state.selectedWeekStart;
        showRequiredExam(access);
        return false;
      }
    }
    state.selectedWeekStart = week;
    persistState(false);
    renderAll();
    return true;
  }

  function ensureSelection() {
    const students = activeStudents();
    if (!students.length) {
      state.selectedStudentId = null;
      return;
    }
    if (!students.some((student) => student.id === state.selectedStudentId)) state.selectedStudentId = students[0].id;
  }

  function storageError(message) {
    storageBlocked = true;
    refs.storageAlert.textContent = message + " Your saved file has not been replaced. Open Backup & data to restore a backup.";
    refs.storageAlert.classList.remove("is-hidden");
    refs.saveStatus.textContent = "Not saved";
  }

  function reportSaveError(message) {
    refs.storageAlert.textContent = `${message || "Could not save."} Your changes are still open. Save a full backup before closing, or press Command/Ctrl+S to retry.`;
    refs.storageAlert.classList.remove("is-hidden");
    refs.saveStatus.textContent = "Not saved — save a backup or retry";
  }

  function persistState(showSaved, restore = false) {
    if (storageBlocked && !restore) { refs.saveStatus.textContent = "Not saved — restore a backup first"; return false; }
    try { exams?.refresh?.(state); } catch(error) { reportSaveError(error.message); return false; }
    state.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(state);
    try {
      if (window.webkit?.messageHandlers?.saveData) {
        refs.saveStatus.textContent = "Saving…";
        const result = window.webkit.messageHandlers.saveData.postMessage(restore ? {json:serialized, restore:true} : serialized);
        if (result?.catch) result.catch(error => reportSaveError(error.message || "Could not save."));
      } else {
        localStorage.setItem(STORAGE_KEY, serialized);
        refs.saveStatus.textContent = "Saved on this computer";
      }
      return true;
    } catch (error) { reportSaveError(error.message || "Could not save."); return false; }
  }

  function hydrateState(candidate) {
    const validated = model.migrate(candidate);
    state = validated;
    visibleReviewItems = []; reviewChildId = null; pendingCorrection = null;
    ensureSelection();
    renderAll();
    return true;
  }

  window.onNativeSaveResult = (ok, message) => {
    if (ok) { refs.saveStatus.textContent = "Saved on this computer"; if (!storageBlocked) refs.storageAlert.classList.add("is-hidden"); }
    else reportSaveError(message || "The app could not save.");
    if (refs.monthlyExamsDialog?.open) {
      refs.examMessage.className = `data-message${ok ? "" : " is-error"}`;
      refs.examMessage.textContent = ok ? "Exam changes saved on this computer." : "Could not save exam changes. Keep the app open and save a full backup.";
    }
  };

  function loadInitialState() {
    state.selectedWeekStart = mondayStart(new Date());
    if (window.webkit?.messageHandlers?.appReady) {
      ensureSelection();
      renderWeek();
      renderSummary();
      renderStudentList();
      refs.emptyState.classList.remove("is-hidden");
      refs.lessonContent.classList.add("is-hidden");
      refs.emptyState.querySelector("h2").textContent = "Opening saved progress...";
      refs.emptyState.querySelector("p").textContent = "Everything stays on this computer and will appear in a moment.";
      window.webkit.messageHandlers.appReady.postMessage("ready");
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && hydrateState(JSON.parse(saved))) return;
    } catch (error) {
      storageError("Saved data could not be opened.");
    }
    ensureSelection();
    renderAll();
  }

  window.onNativeDataLoaded = function onNativeDataLoaded(base64, found, metadata = {}) {
    if (metadata.ok === false) { storageError(metadata.error || "Saved data could not be opened."); renderAll(); return; }
    if (!found || !base64) {
      ensureSelection();
      renderAll();
      return;
    }
    try {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      if (!hydrateState(JSON.parse(json))) throw new Error("Saved data is not valid");
      if (metadata.recovered) {
        refs.storageAlert.textContent = "An automatic backup was recovered because the latest save could not be opened. Check History and save a full backup. The original file has been kept.";
        refs.storageAlert.classList.remove("is-hidden");
      }
    } catch (error) {
      console.error(error);
      storageError("Saved data could not be opened.");
      ensureSelection();
      renderAll();
    }
  };

  function renderWeek() {
    const week = state.selectedWeekStart;
    refs.weekLabel.textContent = formatWeekName(week);
    refs.weekDateLabel.textContent = formatWeekRange(week);
    refs.weekDateInput.value = week;
    refs.todayButton.classList.toggle("is-visible", week !== mondayStart(new Date()));
  }

  function renderSummary() {
    const students = activeStudents();
    const statuses = students.map((student) => weeklyStatus(getRecord(student, state.selectedWeekStart, false)));
    const practiced = statuses.filter((status) => status.practiced).length;
    const mastered = statuses.filter((status) => status.scheduledCompleted || status.completed > 0).length;
    const review = statuses.filter((status) => status.needsReview).length;
    refs.studentCountBadge.textContent = `${students.length} children`;
    refs.practicedCount.textContent = practiced;
    refs.masteredCount.textContent = mastered;
    refs.needsReviewCount.textContent = review;
    refs.summaryProgressFill.style.width = `${students.length ? (practiced / students.length) * 100 : 0}%`;
    const early = statuses.filter(status => status.completedEarly).length;
    refs.summaryEarlyNote.textContent = early ? `Includes ${early} completed early.` : "";
    refs.summaryEarlyNote.classList.toggle("is-hidden", !early);
    refs.rosterWarning.classList.add("is-hidden");
    const hasSavedExamRoster = Object.values(state.monthlyExams?.rounds || {}).some(round=>round.classId===state.selectedClassId && round.cohort?.length);
    refs.monthlyExamsButton.disabled = !selectedClass() || (!students.length && !hasSavedExamRoster);
    if (exams && selectedClass()) {
      const checkpoint = examCheckpoint();
      const period = exams.periodFor(selectedClass(),checkpoint.required ? checkpoint.periodStart : state.selectedWeekStart);
      const assessment = exams.roundStatus(state,state.selectedClassId,period.start);
      refs.monthlyExamBadge.textContent = checkpoint.required ? "Required" : "";
      refs.monthlyExamsButton.classList.toggle("is-exam-required",Boolean(checkpoint.required));
      refs.monthlyExamsButton.dataset.period = checkpoint.required ? period.start : "";
      refs.monthlyExamsButton.dataset.studentId = checkpoint.required ? checkpoint.studentId || "" : "";
      attentionFor(refs.monthlyExamsButton,checkpoint.required ? period.start : null);
    } else {
      refs.monthlyExamBadge.textContent = "";
      refs.monthlyExamsButton.classList.remove("is-exam-required");
      refs.monthlyExamsButton.dataset.period = "";
      refs.monthlyExamsButton.dataset.studentId = "";
      attentionFor(refs.monthlyExamsButton,null);
    }
  }

  function matchesFilter(student) {
    const record = getRecord(student, state.selectedWeekStart, false);
    const status = weeklyStatus(record);
    if (currentFilter === "not-practiced" && status.practiced) return false;
    if (currentFilter === "review" && !status.needsReview) return false;
    if (currentFilter === "mastered" && !status.scheduledCompleted && !status.completed) return false;
    const haystack = `${student.englishName} ${student.chineseName}`.toLocaleLowerCase();
    return haystack.includes(searchTerm.toLocaleLowerCase());
  }

  function strandHTML(status, mini) {
    const count = mini ? 6 : status.total;
    return Array.from({ length: count }, (_, index) => `<i class="${index < status.known ? "is-known" : ""}"></i>`).join("");
  }

  function renderStudentList() {
    const students = activeStudents().filter(matchesFilter);
    if (!students.length) {
      refs.studentList.innerHTML = '<p class="student-list-empty">No children match this view.</p>';
      return;
    }
    refs.studentList.innerHTML = students.map((student) => {
      const status = weeklyStatus(getRecord(student, state.selectedWeekStart, false));
      return `
        <button class="student-row ${student.id === state.selectedStudentId ? "is-selected" : ""}" data-student-id="${escapeHTML(student.id)}">
          <span class="student-avatar">${escapeHTML(studentInitials(student))}</span>
          <span class="student-row-text"><strong>${escapeHTML(student.englishName || student.chineseName)}</strong><small>${escapeHTML(student.chineseName)}</small></span>
          <span class="student-status">
            <span class="practice-badge ${status.scheduledCompleted || status.completed ? "is-finished" : status.needsReview ? "needs-review" : "to-practice"}">${status.scheduledCompleted || status.completed ? "Completed" : status.needsReview ? "Needs practice" : status.practiced ? "Practised" : "To practice"}</span>
            <span class="mini-strand" aria-label="${status.known} of ${status.total} known">${strandHTML(status, true)}</span>
          </span>
        </button>`;
    }).join("");
  }

  function stateSwitchHTML(itemIndex, value, disabled = false) {
    return `<div class="state-switch" role="group" aria-label="Knowledge status">
      <button data-item-index="${itemIndex}" data-state="learning" class="${value === "learning" ? "is-active" : ""}" aria-pressed="${value === "learning"}" ${disabled ? "disabled" : ""}>Needs practice</button>
      <button data-item-index="${itemIndex}" data-state="known" class="${value === "known" ? "is-active" : ""}" aria-pressed="${value === "known"}" ${disabled ? "disabled" : ""}>Knows it</button>
    </div>`;
  }

  function renderLesson() {
    const student = selectedStudent();
    if (!student) {
      refs.emptyState.classList.remove("is-hidden");
      refs.lessonContent.classList.add("is-hidden");
      refs.nextWeekButton.classList.remove("is-exam-locked");
      refs.nextWeekButton.setAttribute("aria-label","Next week");
      refs.nextWeekButton.removeAttribute("aria-haspopup");
      return;
    }
    const students = activeStudents().filter(matchesFilter).some(s => s.id === student.id) ? activeStudents().filter(matchesFilter) : activeStudents();
    const index = students.findIndex((item) => item.id === student.id);
    const record = getRecord(student, state.selectedWeekStart, false);
    const plan = weekPlan(student);
    const curriculumFinished = Boolean(record.curriculumFinished || plan?.curriculumFinished);
    const access = monthlyAccess(student,state.selectedWeekStart,record.unitIndex);
    const monthlyLocked = !access.allowed;
    const checkpoint = examCheckpoint(student);
    const examRequired = monthlyLocked || checkpoint.required;
    const awaitingExam = Boolean(record.awaitingMonthlyExam && checkpoint.required);
    const assessmentLocked = monthlyLocked || awaitingExam;
    const showCompletedPlan = Boolean(monthlyLocked && plan?.completed);
    const nextPractice = Boolean(!curriculumFinished && !showCompletedPlan && plan?.completed && record.unitIndex !== plan.unitIndex);
    const lesson = showCompletedPlan ? plan.completion.lesson : record.lesson || makeSnapshot(unitAt(record.unitIndex));
    const displayedItemStates = (curriculumFinished || showCompletedPlan) && plan?.completion ? Array(6).fill("known") : normalizedItemStates(record);
    const status = statusForRecord((curriculumFinished || showCompletedPlan) && plan?.completion?.session ? plan.completion.session : record);
    refs.emptyState.classList.add("is-hidden");
    refs.lessonContent.classList.remove("is-hidden");
    refs.rosterPosition.textContent = `Child ${index + 1} of ${students.length}`;
    refs.studentName.textContent = student.englishName || student.chineseName || "Unnamed child";
    refs.studentChineseName.textContent = student.chineseName || "";
    refs.levelPill.textContent = lesson.ageBand ? `Age ${lesson.ageBand}` : lesson.levelName;
    refs.curriculumWeekLabel.textContent = `Curriculum week ${lesson.levelWeek}`;
    refs.topicLabel.textContent = lesson.topic || lesson.levelName;
    renderWeekCompletion(plan);
    refs.monthlyGateNotice.classList.toggle("is-hidden", !examRequired);
    if (examRequired) {
      refs.monthlyGateTitle.textContent = "Exam required";
      refs.monthlyGateMessage.textContent = "Pass this child's monthly exam before starting the next month.";
      refs.openRequiredExamButton.dataset.period = checkpoint.periodStart || (typeof access.blockingPeriod === "string" ? access.blockingPeriod : access.blockingPeriod?.start) || "";
    }
    attentionFor(refs.openRequiredExamButton,examRequired ? refs.openRequiredExamButton.dataset.period : null);
    const nextWeek = addDays(state.selectedWeekStart,7);
    const nextWeekAccess = monthlyAccess(student,nextWeek,model.scheduledPlan(state,student,nextWeek).unitIndex);
    refs.nextWeekButton.classList.toggle("is-exam-locked",!nextWeekAccess.allowed);
    refs.nextWeekButton.setAttribute("aria-label",nextWeekAccess.allowed ? "Next week" : "Next week locked. Exam required");
    if (nextWeekAccess.allowed) refs.nextWeekButton.removeAttribute("aria-haspopup");
    else refs.nextWeekButton.setAttribute("aria-haspopup","dialog");
    refs.nextWeekButton.title = nextWeekAccess.allowed ? "Next week" : "Exam required before advancing. Click to open the exam alert.";
    refs.nextPracticeLabel.textContent = curriculumFinished ? "Curriculum completed" : nextPractice ? "Next practice" : "This week’s lesson";
    refs.nextPracticeHint.classList.toggle("is-hidden", !nextPractice);
    refs.nextPracticeHint.textContent = monthlyLocked ? "Next month is locked until the required exams are complete." : "Optional early practice · within the unlocked teaching month.";
    renderGrammarCompanion(record);
    refs.grammarContent.querySelectorAll("[data-extra-field], [data-remove-extra]").forEach(button => {button.disabled = assessmentLocked;});
    const expectations = learningReview?.expectations(state,student,state.selectedWeekStart,record) || [];

    refs.vocabularyItems.innerHTML = lesson.words.map((word, wordIndex) => {
      const isReviewWord = (lesson.reviewWordPositions || []).includes(wordIndex);
      return `
      <div class="learning-item">
        <span class="learning-item-number" ${isReviewWord ? 'title="Review word" aria-label="Review word"' : ""}>${isReviewWord ? "↻" : wordIndex + 1}</span>
        <span class="learning-item-text">${escapeHTML(word)}<small>${escapeHTML(expectations[wordIndex] || "Respond independently")}</small></span>
        ${stateSwitchHTML(wordIndex, displayedItemStates[wordIndex],curriculumFinished || assessmentLocked)}
      </div>`;
    }).join("");
    const sentenceIndex = lesson.words.length;
    refs.sentenceCountLabel.textContent = lesson.sentenceIsReview ? "review structure" : "1 new structure";
    refs.sentenceItem.innerHTML = `
      <div class="learning-item">
        <span class="learning-item-number" aria-hidden="true">.</span>
        <span class="learning-item-text">${escapeHTML(lesson.sentence)}<small>${escapeHTML(expectations[sentenceIndex] || "Respond independently")}</small></span>
        ${stateSwitchHTML(sentenceIndex, displayedItemStates[sentenceIndex],curriculumFinished || assessmentLocked)}
      </div>`;

    refs.masteryStrand.innerHTML = Array.from({ length: status.total }, (_, pearlIndex) => `<i class="mastery-pearl ${pearlIndex < status.known ? "is-known" : ""}"></i>`).join("");
    refs.masteryStrand.setAttribute("aria-label", `${status.known} of ${status.total} known`);

    const practicePanel = refs.practiceButton.closest(".practice-panel");
    practicePanel.classList.toggle("is-finished", status.practiced);
    refs.practiceTitle.textContent = curriculumFinished ? "Curriculum completed" : awaitingExam ? "Completed" : monthlyLocked ? "Next month locked" : `${status.known} of ${status.total} known`;
    refs.practiceDescription.textContent = curriculumFinished || awaitingExam ? "Saved in History." : monthlyLocked ? "Open the required exam to continue." : status.practiced ? "Session saved. Keep practising the remaining items." : "Press Finished when this practice is done.";
    refs.practiceButton.textContent = curriculumFinished ? "Curriculum completed" : awaitingExam ? "Completed" : monthlyLocked ? "Monthly exam required" : status.practiced && !status.mastered ? "Mark unfinished" : "Finished";
    refs.practiceButton.disabled = curriculumFinished || monthlyLocked || awaitingExam;
    refs.completeKnownButton.disabled = curriculumFinished || monthlyLocked || awaitingExam;
    refs.teacherNotes.disabled = assessmentLocked;
    refs.completeKnownButton.textContent = "Knows all";
    refs.completionNotice.classList.toggle("is-hidden", !lastCompletion || lastCompletion.studentId !== student.id || lastCompletion.week !== state.selectedWeekStart);
    refs.completionNotice.querySelector("span").textContent = curriculumFinished ? "Curriculum completed." : "Completed.";
    refs.undoCompletionButton.classList.toggle("is-hidden", !lastCompletion || lastCompletion.studentId !== student.id || lastCompletion.week !== state.selectedWeekStart);
    refs.practiceIcon.textContent = status.practiced ? "✓" : "○";

    if (status.mastered) {
      refs.masteryMessage.className = "mastery-message is-mastered";
      refs.masteryMessage.innerHTML = `<strong>Knows all 5 words + the sentence.</strong> ${curriculumFinished ? "Curriculum complete." : "Press Finished to complete this practice."}`;
    } else {
      const remaining = status.total - status.known;
      refs.masteryMessage.className = "mastery-message";
      refs.masteryMessage.innerHTML = `<strong>${nextPractice ? "Next practice: " : ""}${status.known} of ${status.total} known.</strong> ${nextPractice ? "This week’s scheduled lesson remains complete." : `${remaining} item${remaining === 1 ? "" : "s"} still need checking or practice.`}`;
    }

    if (document.activeElement !== refs.teacherNotes) refs.teacherNotes.value = record.notes || "";
    const displayNextAction = record.nextAction === "repeat" && !(record.manuallyAssigned || record.nextActionExplicit) ? "advance" : record.nextAction;
    document.querySelectorAll("[data-next-action]").forEach((button) => {button.classList.toggle("is-active", button.dataset.nextAction === displayNextAction); button.disabled = assessmentLocked;});

    const previous = students[index - 1] || students.at(-1);
    const next = students[index + 1] || students[0];
    refs.previousStudentName.textContent = previous?.englishName || previous?.chineseName || "-";
    refs.nextStudentName.textContent = next?.englishName || next?.chineseName || "-";
    refs.previousStudentButton.dataset.studentId = previous?.id || "";
    refs.nextStudentButton.dataset.studentId = next?.id || "";
    refs.studentNavigationStatus.textContent = `${index + 1} of ${students.length}`;
    refs.changeCurriculumButton.disabled = storageBlocked;
    refs.futureGoalButton.disabled = storageBlocked || !learningReview;
    renderWorkflowView();
  }

  function setWorkflowView(view) {
    currentView = view === "review" ? "review" : "practice";
    if (currentView === "review") { visibleReviewItems = []; reviewChildId = null; }
    renderWorkflowView();
    refs.lessonPane.scrollTo({top:0});
  }

  function renderWorkflowView() {
    refs.practiceView.classList.toggle("is-hidden",currentView !== "practice");
    refs.reviewView.classList.toggle("is-hidden",currentView !== "review");
    for (const [button,view] of [[refs.practiceNavButton,"practice"],[refs.reviewNavButton,"review"]]) {
      button.classList.toggle("is-active",currentView === view);
      if (currentView === view) button.setAttribute("aria-current","page"); else button.removeAttribute("aria-current");
    }
    if (currentView === "review") renderReview();
  }

  function renderReview() {
    const child = selectedStudent();
    if (!child) return;
    if (reviewChildId !== child.id) {
      visibleReviewItems = learningReview?.due(state,child,{limit:3}) || [];
      reviewChildId = child.id;
    }
    refs.reviewItems.innerHTML = visibleReviewItems.map(item=>`<div class="review-item"><div><strong>${escapeHTML(item.text)}</strong><small>${escapeHTML(item.expectation || "Respond independently")}</small></div><div class="review-item-actions"><div class="state-switch" role="group" aria-label="Review ${escapeHTML(item.text)}"><button data-review-id="${escapeHTML(item.id)}" data-review-mark="learning" class="${item.checkedNow === "learning" ? "is-active" : ""}" aria-pressed="${item.checkedNow === "learning"}" ${storageBlocked || item.postponed ? "disabled" : ""}>Needs practice</button><button data-review-id="${escapeHTML(item.id)}" data-review-mark="known" class="${item.checkedNow === "known" ? "is-active" : ""}" aria-pressed="${item.checkedNow === "known"}" ${storageBlocked || item.postponed ? "disabled" : ""}>Knows it</button></div><button class="text-button" data-postpone-review="${escapeHTML(item.id)}" ${storageBlocked || item.postponed || item.checkedNow ? "disabled" : ""}>${item.postponed ? "Saved for next week" : "Another day"}</button></div></div>`).join("") || '<div class="view-empty"><h4>Nothing due for review</h4><p>After a Finished session, earlier learning returns here for a short check. Continue with Practice.</p></div>';
    const checked = visibleReviewItems.filter(item=>item.checkedNow).length;
    refs.reviewMessage.textContent = checked ? `${checked} of ${visibleReviewItems.length} checked. Saved separately from the original learning.` : visibleReviewItems.length ? "Check these few items, or choose Another day if the child isn't ready." : "";
  }

  function markReview(id,mark) {
    const child = selectedStudent();
    if (!child || storageBlocked || !learningReview) return;
    try {
      learningReview.mark(state,child.id,id,mark);
      const item = visibleReviewItems.find(item=>item.id===id);
      if (item) item.checkedNow = mark;
      persistState(); renderReview();
      [...refs.reviewItems.querySelectorAll("[data-review-id][data-review-mark]")].find(button=>button.dataset.reviewId===id && button.dataset.reviewMark===mark)?.focus({preventScroll:true});
    } catch(error) { refs.reviewMessage.textContent = error.message; }
  }

  function postponeReview(id) {
    const child = selectedStudent();
    if (!child || storageBlocked || !learningReview) return;
    try {
      learningReview.postpone(state,child.id,id,{days:7});
      const item = visibleReviewItems.find(item=>item.id===id);
      if (item) item.postponed = true;
      persistState(); renderReview();
    } catch(error) { refs.reviewMessage.textContent = error.message; }
  }

  function refreshFutureGoals() {
    const child = selectedStudent();
    if (!child || !refs.futureGoalWeek.value) return;
    const week = mondayStart(refs.futureGoalWeek.value);
    refs.futureGoalWeek.value = week;
    const record = getRecord(child,week,false);
    const labels = [...record.lesson.words,record.lesson.sentence];
    refs.futureGoalTarget.innerHTML = labels.map((text,index)=>`<option value="${index}">${escapeHTML(text)}</option>`).join("");
    refs.futureGoalTarget.dataset.unitIndex = String(record.unitIndex);
    refs.futureGoalExpectation.value = learningReview?.expectations(state,child,week,record)?.[0] || "Respond independently";
  }

  function openFutureGoal() {
    if (!selectedStudent()) { showToast("Choose a child first."); return; }
    refs.toolsDialog.close(); refs.futureGoalMessage.textContent = "";
    refs.futureGoalWeek.value = addDays(state.selectedWeekStart,7);
    refreshFutureGoals(); refs.futureGoalDialog.showModal();
  }

  function saveFutureGoal(event) {
    event.preventDefault();
    const child = selectedStudent();
    if (!child || storageBlocked || !learningReview) return;
    try {
      learningReview.setGoal(state,child,{week:mondayStart(refs.futureGoalWeek.value),unitIndex:Number(refs.futureGoalTarget.dataset.unitIndex),targetIndex:Number(refs.futureGoalTarget.value),expectation:refs.futureGoalExpectation.value.trim()});
      persistState(); refs.futureGoalDialog.close(); renderLesson(); showToast("Future goal saved. Earlier records unchanged.");
    } catch(error) { refs.futureGoalMessage.textContent = error.message; }
  }

  function openExamCorrection(roundId,studentId,attemptId) {
    pendingCorrection = {roundId,studentId,attemptId};
    refs.examCorrectionReason.value = ""; refs.examCorrectionMessage.textContent = "";
    refs.examCorrectionDialog.showModal();
  }

  function saveExamCorrection(event) {
    event.preventDefault();
    if (!pendingCorrection || storageBlocked) return;
    try {
      const reason = refs.examCorrectionReason.value.trim();
      if (!reason) throw new Error("Please describe the recording mistake.");
      exams.correctAttempt(state,pendingCorrection.roundId,pendingCorrection.studentId,pendingCorrection.attemptId,reason);
      pendingCorrection = null; persistState(); refs.examCorrectionDialog.close();
      if (refs.monthlyExamsDialog.open) renderMonthlyExam();
      renderAll(); showToast("Correction saved. Original attempt kept in History.");
    } catch(error) { refs.examCorrectionMessage.textContent = error.message; }
  }

  function renderWeekCompletion(plan) {
    refs.weekCompletionNotice.classList.toggle("is-hidden", !plan?.completed);
    if (!plan?.completed) return;
    refs.weekCompletionTitle.textContent = "Completed";
    refs.weekCompletionDate.textContent = plan.completedAt ? `${plan.completedEarly ? "Early · " : ""}${completionDate(plan.completedAt)}` : "";
    refs.completionSourceButton.dataset.sourceWeek = plan.sourceWeekStart || state.selectedWeekStart;
  }

  function weeklyTimelineForStudent(student) {
    const records = recordsForStudent(student.id);
    const byWeek = new Map(records.map((record) => [record.weekStart, record]));
    if (!records.length) {
      const week = state.selectedWeekStart || mondayStart(new Date());
      return [{ weekStart: week, record: null, hasActivity: false }];
    }
    const firstWeek = records[0].weekStart;
    const lastWeek = records.at(-1).weekStart;
    const start = state.selectedWeekStart < firstWeek ? state.selectedWeekStart : firstWeek;
    const end = state.selectedWeekStart > lastWeek ? state.selectedWeekStart : lastWeek;
    const timeline = [];
    for (let week = start; week <= end; week = addDays(week, 7)) {
      const record = byWeek.get(week);
      timeline.push({
        weekStart: week,
        record
      });
    }
    return timeline;
  }

  function renderAll() {
    if (!state.selectedWeekStart) state.selectedWeekStart = mondayStart(new Date());
    ensureSelection();
    renderClasses();
    renderWeek();
    renderSummary();
    renderStudentList();
    renderLesson();
  }

  function selectStudent(studentId) {
    if (!activeStudents().some((student) => student.id === studentId)) return;
    state.selectedStudentId = studentId;
    visibleReviewItems = []; reviewChildId = null;
    persistState(false);
    renderStudentList();
    renderLesson();
    renderSummary();
    refs.lessonPane?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function tryComplete(student) {
    const week = state.selectedWeekStart;
    const record = getRecord(student, week, true);
    if (!statusForRecord(record).mastered || !record.practiceFinished) return false;
    lastCompletion = {studentId: student.id, week, record: clone(record)};
    if (!model.complete(state, student, week)) return false;
    showToast(record.curriculumFinished ? "Curriculum completed. History saved." : record.awaitingMonthlyExam ? "Completed. Monthly exam required." : "Completed lesson saved. Next practice opened.");
    refs.lessonPane.scrollTo({top:0, behavior:"smooth"});
    return true;
  }

  function updateItemState(itemIndex, newState) {
    const student = selectedStudent();
    if (!student || storageBlocked || weekPlan(student)?.curriculumFinished) return;
    if (!requireMonthlyAccess(student)) return;
    lastCompletion = null;
    const record = getRecord(student, state.selectedWeekStart, true);
    record.itemStates = normalizedItemStates(record);
    record.itemStates[itemIndex] = record.itemStates[itemIndex] === newState ? "unassessed" : newState;
    // Editing knowledge starts a fresh teacher confirmation. It must never
    // reuse an earlier Finished flag to credit or advance this assessment.
    record.practiceFinished = false;
    record.practicedAt = null;
    delete record.awaitingMonthlyExam;
    delete record.completedAt;
    record.updatedAt = new Date().toISOString();
    persistState();
    renderAll();
    document.querySelector(`[data-item-index="${itemIndex}"][data-state="${newState}"]`)?.focus({preventScroll:true});
  }

  function togglePractice() {
    const student = selectedStudent();
    if (!student || storageBlocked || weekPlan(student)?.curriculumFinished) return;
    if (!requireMonthlyAccess(student)) return;
    const record = getRecord(student, state.selectedWeekStart, true);
    const resumingHeldCompletion = record.awaitingMonthlyExam && record.practiceFinished && statusForRecord(record).mastered;
    record.practiceFinished = statusForRecord(record).mastered || !record.practiceFinished;
    if (!resumingHeldCompletion) record.practicedAt = record.practiceFinished ? new Date().toISOString() : null;
    record.updatedAt = new Date().toISOString();
    if (record.practiceFinished) learningReview?.capture(state,student,record);
    const advanced = tryComplete(student);
    persistState();
    renderAll();
    if (advanced) alertAfterCompletion(student);
    if (!advanced) showToast(record.practiceFinished ? "Practice marked finished" : "Practice marked unfinished");
  }

  function completeKnown() {
    const student = selectedStudent();
    if (!student || storageBlocked || weekPlan(student)?.curriculumFinished) return;
    if (!requireMonthlyAccess(student)) return;
    const record = getRecord(student, state.selectedWeekStart, true);
    lastCompletion = null;
    record.itemStates = normalizedItemStates(record).map(()=>"known");
    record.practiceFinished = false;
    record.practicedAt = null;
    delete record.awaitingMonthlyExam;
    delete record.completedAt;
    record.updatedAt = new Date().toISOString();
    persistState(); renderAll();
    showToast("All marked known. Press Finished when done.");
  }

  function undoCompletion() {
    if (!lastCompletion || storageBlocked) return;
    const current = state.records[recordKey(lastCompletion.studentId,lastCompletion.week)];
    if (current && !current.awaitingMonthlyExam && (current.practiceFinished || current.notes?.trim() || current.itemStates.some(s => s !== "unassessed")) && !current.curriculumFinished) {
      showToast("Next practice has already been recorded. See History for the completed lesson."); return;
    }
    const restored = clone(lastCompletion.record);
    restored.practiceFinished = false;
    restored.practicedAt = null;
    delete restored.curriculumFinished;
    state.records[recordKey(lastCompletion.studentId,lastCompletion.week)] = restored;
    lastCompletion = null;
    persistState(); renderAll(); showToast("Completion undone.");
  }

  function setNextAction(action) {
    const student = selectedStudent();
    if (!student || storageBlocked || !["repeat","advance"].includes(action)) return;
    if (!requireMonthlyAccess(student)) return;
    const record = getRecord(student, state.selectedWeekStart, true);
    record.nextAction = action;
    record.nextActionExplicit = true;
    record.updatedAt = new Date().toISOString();
    persistState(); renderLesson();
  }

  function saveNotes() {
    const student = selectedStudent();
    if (!student || storageBlocked) return;
    if (!requireMonthlyAccess(student)) return;
    lastCompletion = null;
    const record = getRecord(student, state.selectedWeekStart, true);
    record.notes = refs.teacherNotes.value;
    record.updatedAt = new Date().toISOString();
    persistState();
  }

  function openStudentDialog(student) {
    if (!state.selectedClassId) { openClasses(); return; }
    editingStudentId = student?.id || null;
    refs.studentDialogTitle.textContent = student ? "Edit child" : "Add child";
    refs.englishNameInput.value = student?.englishName || "";
    refs.chineseNameInput.value = student?.chineseName || "";
    const levels = curriculumMeta.levels || [];
    refs.startingLevelInput.innerHTML = levels.map((level) => `<option value="${level.firstUnitIndex}">${escapeHTML(level.name)} (${escapeHTML(level.ageBand)})</option>`).join("");
    refs.startingLevelInput.value = String(student?.startUnit ?? selectedClass()?.startUnit ?? levels[0]?.firstUnitIndex ?? 0);
    refs.startingLevelInput.disabled = Boolean(student);
    refs.deleteStudentButton.classList.toggle("is-hidden", !student);
    refs.deleteStudentButton.disabled = storageBlocked;
    refs.studentDialog.showModal();
    setTimeout(() => refs.englishNameInput.focus(), 20);
  }

  function deleteEditedStudent() {
    if (storageBlocked || !editingStudentId) return;
    const child = activeStudents().find(item => item.id === editingStudentId);
    if (!child) return;
    const name = [child.englishName,child.chineseName].filter(Boolean).join(" · ");
    const recordCount = recordsForStudent(child.id).length;
    if (!window.confirm(`Delete ${name} from ${selectedClass()?.name || "this class"}?\n\nThey will disappear from the class list and weekly totals. ${recordCount} saved weekly record${recordCount === 1 ? "" : "s"} will be kept in Recently deleted, so you can restore this child and their results.`)) return;
    if (!model.deleteStudent(state,child.id)) return;
    editingStudentId = null; lastCompletion = null; pendingImport = null;
    currentFilter = "all"; searchTerm = ""; refs.studentSearch.value = "";
    refs.filterRow.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("is-active",button.dataset.filter === "all"));
    refs.studentDialog.close(); persistState(); renderAll();
    refs.lessonPane.scrollTo({top:0});
    showToast(`${child.englishName || child.chineseName} deleted. Restore in Classes & names → Recently deleted.`);
  }

  function deletedStudents() {
    return state.students.filter(child => child.active === false && child.classId === state.selectedClassId)
      .sort((a,b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
  }

  function renderDeletedStudents() {
    const children = deletedStudents();
    refs.deletedStudentsTitle.textContent = `Recently deleted · ${selectedClass()?.name || "Class"}`;
    refs.deletedStudentsList.innerHTML = children.map(child => {
      const count = recordsForStudent(child.id).length;
      return `<article class="deleted-child-row" data-deleted-student-id="${escapeHTML(child.id)}"><div><strong>${escapeHTML(child.englishName || child.chineseName)}</strong>${child.englishName && child.chineseName ? `<span>${escapeHTML(child.chineseName)}</span>` : ""}<small>${count} saved weekly record${count === 1 ? "" : "s"}${child.studentCode ? ` · Student ID: ${escapeHTML(child.studentCode)}` : ""}</small></div><button class="secondary-button" data-restore-student="${escapeHTML(child.id)}" ${storageBlocked ? "disabled" : ""}>Restore child</button></article>`;
    }).join("") || '<p class="deleted-empty">No deleted children in this class.</p>';
  }

  function openDeletedStudents() {
    refs.classesDialog.close();
    refs.deletedStudentsMessage.textContent = "Deleted children and their results stay here until you restore them. Full backups include these records.";
    renderDeletedStudents();
    // Let WebKit finish removing the first modal before exposing the recovery dialog to accessibility tools.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!refs.deletedStudentsDialog.open) refs.deletedStudentsDialog.showModal();
      refs.deletedStudentsDialog.querySelector("button")?.focus();
    }));
  }

  function restoreDeletedStudent(id) {
    if (storageBlocked) return;
    const child = deletedStudents().find(item => item.id === id);
    if (!child || !model.restoreStudent(state,id)) return;
    for (const record of recordsForStudent(id)) {
      if (record.awaitingMonthlyExam) model.complete(state,child,record.weekStart);
    }
    state.selectedStudentId = child.id; lastCompletion = null; pendingImport = null;
    currentFilter = "all"; searchTerm = ""; refs.studentSearch.value = "";
    refs.filterRow.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("is-active",button.dataset.filter === "all"));
    persistState(); renderAll(); renderDeletedStudents();
    refs.deletedStudentsMessage.textContent = `${child.englishName || child.chineseName} restored with all saved results. Close this window to view the child.`;
    showToast("Child restored with saved results.");
  }

  function saveStudent(event) {
    event.preventDefault();
    if (storageBlocked) return;
    const englishName = refs.englishNameInput.value.trim();
    const chineseName = refs.chineseNameInput.value.trim();
    if (!englishName && !chineseName) {
      refs.englishNameInput.focus();
      return;
    }
    if (editingStudentId) {
      const student = state.students.find((item) => item.id === editingStudentId);
      if (student) {
        student.englishName = englishName;
        student.chineseName = chineseName;

      }
    } else {
      const nextNumber = Math.max(0, ...state.students.map((student) => Number(student.rosterNumber) || 0)) + 1;
      const student = {
        id: `child-${crypto.randomUUID()}`,
        rosterNumber: nextNumber,
        chineseName,
        englishName,
        group: selectedClass()?.name || "Class",
        classId: state.selectedClassId,
        startWeek: state.selectedWeekStart,
        startUnit: Number(refs.startingLevelInput.value) || 0,
        active: true
      };
      if (classHasTeaching(state.selectedClassId)) {
        student.joinedAt = new Date().toISOString();
        student.startWeek = [student.startWeek,mondayStart(new Date())].sort().at(-1);
      }
      state.students.push(student);
      state.selectedStudentId = student.id;
    }
    persistState();
    refs.studentDialog.close();
    renderAll();
    showToast(editingStudentId ? "Child updated" : "Child added");
  }

  function openCurriculumDialog() {
    curriculumLevelFilter = curriculumLevelFilter || curriculumMeta.levels?.[0]?.id || null;
    const totalWords = curriculumMeta.totalVocabulary || curriculum.reduce((sum, unit) => sum + unit.words.length, 0);
    const uniqueSentences = curriculumMeta.totalSentenceStructures || new Set(curriculum.map((unit) => unit.sentence)).size;
    refs.curriculumSummary.innerHTML = `
      <div><strong>${curriculumMeta.levels?.length || 0}</strong><span>age levels</span></div>
      <div><strong>${curriculum.length}</strong><span>weekly lessons</span></div>
      <div><strong>${totalWords}</strong><span>source vocabulary entries</span></div>
      <div><strong>${uniqueSentences}</strong><span>source sentence structures</span></div>`;
    refs.curriculumTabs.innerHTML = (curriculumMeta.levels || []).map((level) => `<button data-level-filter="${escapeHTML(level.id)}" class="${level.id === curriculumLevelFilter ? "is-active" : ""}">${escapeHTML(level.name)} · ${escapeHTML(level.ageBand)}</button>`).join("");
    renderCurriculumList();
    refs.curriculumDialog.showModal();
  }

  function renderCurriculumList() {
    const units = curriculum.filter((unit) => !curriculumLevelFilter || unit.levelId === curriculumLevelFilter);
    refs.curriculumList.innerHTML = units.map((unit) => `
      <div class="curriculum-row">
        <strong>Week ${unit.levelWeek}<br>${escapeHTML(unit.topic)}</strong>
        <div class="curriculum-words"><small>Vocabulary</small>${unit.words.map(escapeHTML).join(" · ")}</div>
        <div class="curriculum-sentence">${escapeHTML(unit.sentence)}</div>
      </div>`).join("");
  }

  function openHistoryDialog() {
    const student = selectedStudent();
    if (!student) return;
    refs.historyTitle.textContent = `${student.englishName || student.chineseName} · history`;
    const timeline = weeklyTimelineForStudent(student).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    if (!timeline.length) {
      refs.historyList.innerHTML = '<p class="history-empty">No teaching weeks recorded for this child yet.</p>';
      refs.historyDialog.showModal();
      return;
    }
    refs.historyList.innerHTML = timeline.map((item) => {
      const record = item.record || fallbackRecordForWeek(student, item.weekStart);
      const status = weeklyStatus(record);
      const plan = weekPlan(student,item.weekStart);
      const lessons = model.sessions(record).map((session,index) => {
        const knowledge = statusForRecord(session);
        const archived = index < (record.completedLessons?.length || 0);
        const nextPractice = plan?.completed && session.unitIndex !== plan.unitIndex && !knowledge.practiced;
        const extras = (session.additionalPractice || []).map(item => `<div class="extra-practice-history"><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text).replaceAll("\n", "<br>")}<br>${item.practiceFinished ? "Practised" : "Not practised"} · ${item.state === "known" ? "Knows it" : item.state === "learning" ? "Needs practice" : "Not checked"} · Guide p. ${item.sourcePages.join(", ")}</p></div>`).join("");
        return `<div class="history-session"><strong>${nextPractice ? "Next practice · " : ""}${escapeHTML(session.lesson.levelName)} · week ${session.lesson.levelWeek}${archived ? " · completed" : ""}</strong><p>Practice: ${knowledge.practiced ? "finished" : "not finished"} · ${knowledge.known}/${knowledge.total} known${knowledge.practiced ? `<br>Actual practice date: ${escapeHTML(completionDate(session.practicedAt || session.completedAt))}` : ""}<br>${escapeHTML(session.lesson.words.join(", "))}<br>${escapeHTML(session.lesson.sentence)}${session.notes ? `<br>Note: ${escapeHTML(session.notes)}` : ""}</p>${extras}</div>`;
      }).join("");
      const completedLesson = plan?.completion?.lesson || plan?.lesson;
      const earlierCompletion = plan?.completed && plan.sourceWeekStart !== item.weekStart
        ? `<p class="history-early-credit"><strong>Scheduled lesson completed${plan.completedEarly ? " early" : ""}</strong> · ${escapeHTML(completionDate(plan.completedAt))}<br>${escapeHTML(completedLesson.words.join(", "))}<br>${escapeHTML(completedLesson.sentence)}<br>Original record: ${escapeHTML(formatWeekRange(plan.sourceWeekStart))}</p>` : "";
      return `<div class="history-row">
        <div class="history-date"><strong>${escapeHTML(formatWeekName(item.weekStart))}</strong><span>${escapeHTML(formatWeekRange(item.weekStart))}</span></div>
        <div class="history-lesson">${earlierCompletion}${lessons}</div>
        <button class="history-status ${status.mastered ? "is-mastered" : ""}" data-open-week="${escapeHTML(item.weekStart)}">Open week</button>
      </div>`;
    }).join("");
    const goalChanges = learningReview?.goalHistory(state,student.id) || [];
    if (goalChanges.length) refs.historyList.insertAdjacentHTML("beforeend",`<details class="history-supplement"><summary>Future goal changes (${goalChanges.length})</summary>${goalChanges.map(entry=>`<p><strong>${escapeHTML(completionDate(entry.at))}</strong> · week of ${escapeHTML(entry.week)}<br>${escapeHTML(entry.expectation)}</p>`).join("")}</details>`);
    const examHistory = Object.values(state.monthlyExams?.rounds || {}).filter(round=>round.attempts?.[student.id]?.history?.length).sort((a,b)=>b.periodStart.localeCompare(a.periodStart));
    if (examHistory.length) refs.historyList.insertAdjacentHTML("beforeend",`<details class="history-supplement"><summary>Monthly exam history</summary>${examHistory.map(round=>{
      const bundle=round.attempts[student.id],member=round.cohort.find(child=>child.studentId===student.id);
      return bundle.history.map(attempt=>{const result=exams.resultForAttempt(attempt,member.items.length,round.policySnapshot.passPercent,member.items),correction=(bundle.corrections || []).find(entry=>entry.attemptId===attempt.id);return `<p><strong>${escapeHTML(completionDate(attempt.completedAt))} · ${result.passed ? "Passed" : "Needs review"}</strong> · ${result.known}/${result.total} known${correction ? `<br>Recording corrected ${escapeHTML(completionDate(correction.at))}: ${escapeHTML(correction.reason)}. Original result retained.` : ""}</p>`;}).join("");
    }).join("")}</details>`);
    if (!refs.historyDialog.open) refs.historyDialog.showModal();
  }

  function openLessonPicker() {
    const student = selectedStudent();
    if (!student) return;
    const record = getRecord(student, state.selectedWeekStart, true);
    refs.lessonPickerSelect.innerHTML = curriculum.map((unit, index) => `<option value="${index}">${escapeHTML(unit.levelName)} (${escapeHTML(unit.ageBand)}) - week ${unit.levelWeek}: ${escapeHTML(unit.topic)}</option>`).join("");
    refs.lessonPickerSelect.value = String(record.unitIndex);
    refs.lessonPickerDialog.showModal();
  }

  function confirmLessonChange() {
    const student = selectedStudent();
    if (!student) return;
    const record = getRecord(student, state.selectedWeekStart, true);
    const nextIndex = Number(refs.lessonPickerSelect.value);
    if (nextIndex === record.unitIndex) {
      refs.lessonPickerDialog.close();
      return;
    }
    if (storageBlocked) return;
    if (!requireMonthlyAccess(student,state.selectedWeekStart,nextIndex)) return;
    if (model.coreActivity(record)) { showToast("This lesson has saved progress. Complete it to move on, or choose an unrecorded week."); return; }
    const unit = unitAt(nextIndex);
    record.unitIndex = nextIndex;
    if (!record.completedLessons?.length) record.plannedUnitIndex = nextIndex;
    record.lesson = makeSnapshot(unit);
    record.practiceFinished = false;
    record.practicedAt = null;
    record.itemStates = Array(unit.words.length + 1).fill("unassessed");
    record.notes = "";
    record.nextAction = "advance";
    record.manuallyAssigned = true;
    record.autoOpened = false;
    record.updatedAt = new Date().toISOString();
    persistState();
    refs.lessonPickerDialog.close();
    renderAll();
    showToast("Lesson changed for this child");
  }

  function timestampForFile() {
    return new Date().toISOString().slice(0, 10);
  }

  function browserDownload(contents, fileName, mimeType) {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    const contents = JSON.stringify({
      format: "EtonHouse English Tracker Backup",
      exportedAt: new Date().toISOString(),
      curriculumVersion: curriculumMeta.version || "1",
      data: state
    }, null, 2);
    if (window.webkit?.messageHandlers?.exportBackup) {
      window.webkit.messageHandlers.exportBackup.postMessage(contents);
    } else {
      browserDownload(contents, `EtonHouse English Tracker Backup ${timestampForFile()}.json`, "application/json");
    }
    refs.dataMessage.className = "data-message";
    refs.dataMessage.textContent = "Backup is ready to save.";
  }

  function csvCell(value) {
    const raw = String(value ?? "");
    const text = /^[=+@\-\t\r]/.test(raw) ? `\'${raw}` : raw;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCSV() {
    const headers = ["Class", "Teaching week", "No.", "Student ID", "English name", "Chinese name", "Practice finished", "Known", "Knows all", "Level", "Curriculum week", "Vocabulary", "Sentence", "Teacher note", "Session", "Extra practice", "Scheduled lesson completed", "Completed early", "Actual practice date", "Recorded week", "Entry type"];
    const rows = activeStudents().flatMap((student) => {
      const record = getRecord(student, state.selectedWeekStart, false);
      const plan = weekPlan(student);
      const entries = model.sessions(record).map((session,index) => ({session,index:index+1,sourceWeek:record.weekStart,type:plan?.completed && session.unitIndex !== plan.unitIndex ? "Next practice (week already complete)" : "Practice record"}));
      if (plan?.completed && plan.sourceWeekStart !== state.selectedWeekStart) {
        const session = plan.completion.session || model.sessions(state.records[plan.completion.recordId])[plan.completion.sessionIndex];
        if (session) entries.unshift({session,index:"Scheduled completion",sourceWeek:plan.sourceWeekStart,type:plan.completedEarly ? "Scheduled lesson completed early" : "Scheduled lesson completed"});
      }
      return entries.map(({session,index,sourceWeek,type}) => {
        const status = statusForRecord(session), lesson = session.lesson;
        return [selectedClass()?.name || "", state.selectedWeekStart, student.rosterNumber, student.studentCode || "", student.englishName, student.chineseName,
          status.practiced ? "Yes" : "No", `${status.known}/${status.total}`, status.mastered ? "Yes" : "No",
          lesson.levelName, lesson.levelWeek, lesson.words.join(" | "), lesson.sentence, session.notes || "", index,
          (session.additionalPractice || []).map(item => `${item.title}: ${item.text.replaceAll("\n", " / ")} (${item.state}; ${item.practiceFinished ? "practised" : "not practised"}; guide p.${item.sourcePages.join(",")})`).join(" | "),
          plan?.completed ? "Yes" : "No", plan?.completedEarly ? "Yes" : "No", status.practiced ? completionDate(session.practicedAt || session.completedAt) : "", sourceWeek, type
        ].map(csvCell).join(",");
      });
    });
    const contents = `\ufeff${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}`;
    if (window.webkit?.messageHandlers?.exportCSV) window.webkit.messageHandlers.exportCSV.postMessage(contents);
    else browserDownload(contents, `EtonHouse Weekly Summary ${state.selectedWeekStart}.csv`, "text/csv;charset=utf-8");
    refs.dataMessage.className = "data-message";
    refs.dataMessage.textContent = "Weekly summary is ready to save, including early completions and actual practice dates.";
  }

  async function importBackup(file) {
    refs.dataMessage.className = "data-message";
    refs.dataMessage.textContent = "Checking backup…";
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("The backup is too large (maximum 30 MB).");
      const parsed = JSON.parse(await file.text());
      const candidate = ["Seahorse English Tracker Backup", "EtonHouse English Tracker Backup"].includes(parsed.format) ? parsed.data : parsed;
      const validated = model.migrate(candidate);
      if (!window.confirm(`Restore ${validated.students.length} children? A safety copy of your current data will be kept before replacement.`)) {
        refs.dataMessage.textContent = "Restore cancelled."; return;
      }
      if (!window.webkit?.messageHandlers?.saveData) {
        const previous = localStorage.getItem(STORAGE_KEY);
        if (previous) localStorage.setItem(STORAGE_KEY + "-before-restore", previous);
      }
      state = validated; storageBlocked = false;
      visibleReviewItems = []; reviewChildId = null; pendingCorrection = null; lastCompletion = null;
      refs.storageAlert.classList.add("is-hidden");
      persistState(true, true); renderAll();
      refs.dataMessage.textContent = "Backup restored successfully.";
      showToast("Backup restored");
    } catch (error) {
      refs.dataMessage.className = "data-message is-error";
      refs.dataMessage.textContent = (error.message || "The backup is invalid.") + " Current data was not changed.";
    } finally { refs.importBackupInput.value = ""; }
  }

  function resetAllProgress() {
    showToast("To start fresh, create a new class. Your existing records stay in the old class.");
    refs.dataDialog.close(); openClasses();
  }

  function selectedClass() { return state.classes?.find(c => c.id === state.selectedClassId); }

  function openGuideLibrary(levelId) {
    const currentLesson = selectedStudent() ? getRecord(selectedStudent(),state.selectedWeekStart,false).lesson : null;
    refs.guideLevelSelect.innerHTML = '<option value="all">All age levels</option>' + (curriculumMeta.levels || []).map(level => `<option value="${escapeHTML(level.id)}">Age ${escapeHTML(level.ageBand)} · ${escapeHTML(level.name)}</option>`).join("");
    refs.guideCategorySelect.innerHTML = '<option value="all">All learning areas</option>' + Object.entries(guideCategories).map(([id,label]) => `<option value="${id}">${label}</option>`).join("");
    refs.guideLevelSelect.value = levelId || currentLesson?.levelId || "all";
    refs.guideCategorySelect.value = "all"; refs.guideSearch.value = ""; guideVisibleCount = 30;
    renderGuideLibrary(); refs.guideDialog.showModal();
  }

  function renderGuideLibrary() {
    const level = refs.guideLevelSelect.value || "all", category = refs.guideCategorySelect.value || "all";
    const query = refs.guideSearch.value.trim().toLocaleLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const student = selectedStudent();
    const current = student ? getRecord(student,state.selectedWeekStart,false) : null;
    const added = new Set((current?.additionalPractice || []).map(item => item.entryId));
    const originalPages = category === "source";
    const items = (originalPages ? guide.pages : guide.entries).filter(item => {
      if (level !== "all" && item.levelId !== level && item.levelId !== "all") return false;
      if (!originalPages && category !== "all" && item.category !== category) return false;
      const content = `${item.title || ""} ${item.text || ""} ${(item.items || []).join(" ")}`.toLocaleLowerCase();
      return terms.every(term => content.includes(term));
    });
    refs.guideSummary.textContent = `${items.length} ${originalPages ? "pages" : "teaching resources"} · ${guide.meta.sourcePageCount || 44}-page EtonHouse guide. ${student ? `Add extra practice for ${student.englishName || student.chineseName}, ${formatWeekRange(state.selectedWeekStart)}.` : "Choose a child to add extra practice."}`;
    refs.guideResults.innerHTML = items.slice(0,guideVisibleCount).map(entry => originalPages
      ? `<details class="guide-result guide-source"><summary><span class="guide-category">Page ${entry.pageNumber}</span><strong>${escapeHTML(entry.title)}</strong></summary><pre>${escapeHTML(entry.text)}</pre></details>`
      : `<article class="guide-result"><div class="guide-result-heading"><span class="guide-category">${escapeHTML(guideCategories[entry.category] || entry.category)}</span><small>Guide p. ${(entry.sourcePages || []).join(", ")}</small></div><h3>${escapeHTML(entry.title)}</h3>${entry.isSummary ? '<p class="guide-note">Teacher companion · summary of the guide</p>' : ""}${entry.text && entry.text !== (entry.items || []).join(" · ") && !(entry.items || []).includes(entry.text) ? `<p>${escapeHTML(entry.text)}</p>` : ""}${entry.items?.length ? `<ul class="guide-items">${entry.items.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : ""}${entry.guidance ? `<p class="guide-note">${escapeHTML(entry.guidance)}</p>` : ""}<button class="secondary-button" data-use-guide="${escapeHTML(entry.id)}" ${!student || storageBlocked || added.has(entry.id) ? "disabled" : ""}>${added.has(entry.id) ? "Added to this practice" : student ? "Add to this child's practice" : "Choose a child first"}</button></article>`
    ).join("") || '<p class="guide-empty">No matches. Try fewer search words, another age level, or Original guide pages.</p>';
    if (items.length > guideVisibleCount) refs.guideResults.innerHTML += `<button class="secondary-button guide-more" data-guide-more>Show more (${items.length-guideVisibleCount} remaining)</button>`;
    // Keep printed wording visible for the few classroom adaptations, without changing the original PDF.
    refs.guideResults.querySelectorAll("[data-use-guide]").forEach(button => {
      const entry = guide.entries.find(item => item.id === button.dataset.useGuide);
      if (!entry?.sourceOriginal) return;
      const note = document.createElement("p"); note.className = "guide-note";
      note.textContent = `Classroom wording adapted. Printed in the guide: “${entry.sourceOriginal}”`;
      button.before(note);
    });
  }

  function attachGuideEntry(id) {
    const student = selectedStudent(), entry = guide.entries.find(item => item.id === id);
    if (!student || !entry || storageBlocked) return;
    if (!requireMonthlyAccess(student)) return;
    const record = getRecord(student,state.selectedWeekStart,true);
    if (!record.additionalPractice) record.additionalPractice = [];
    if (record.additionalPractice.some(item => item.entryId === id)) return;
    if (record.additionalPractice.length >= 200) { showToast("This practice already has 200 extra resources. Finish some before adding more."); return; }
    const repeatsItems = entry.text === (entry.items || []).join(" · ") || (entry.items || []).includes(entry.text);
    const text = [entry.isSummary ? "Teacher companion · summary of the guide" : "", repeatsItems ? "" : entry.text, ...(entry.items || []), entry.guidance].filter(Boolean).join("\n");
    record.additionalPractice.push({entryId:entry.id,title:entry.title,text,category:entry.category,sourcePages:clone(entry.sourcePages || []),state:"unassessed",practiceFinished:false});
    if (record.removedExtraPracticeIds) record.removedExtraPracticeIds = record.removedExtraPracticeIds.filter(id => id !== entry.id);
    record.updatedAt = new Date().toISOString(); lastCompletion = null;
    persistState(); renderLesson(); refs.grammarCompanion.open = true; renderGuideLibrary();
    showToast("Added to this child's extra practice.");
  }

  function renderGrammarCompanion(record) {
    if (!refs.grammarContent) return;
    const levelId = record.lesson.levelId;
    const skill = record.lesson.sentenceKind || unitAt(record.unitIndex).sentenceKind || "Sentence structure";
    const extra = record.additionalPractice || [];
    refs.grammarContent.innerHTML = `<div class="grammar-focus"><span class="guide-category">Sentence focus</span><p><strong>${escapeHTML(skill)}</strong></p><p>${escapeHTML(record.lesson.sentence)}</p>${levelId === "pre-nursery" ? '<p class="guide-note">Age 2–3: model the phrase and accept appropriate words, gestures or understanding. The guide does not require complete spoken sentences at this stage.</p>' : ""}<button class="text-button" data-browse-guide="${escapeHTML(levelId)}">Browse grammar, phonics &amp; more for this age</button></div>` +
      extra.map((item,index) => `<article class="extra-practice"><div class="guide-result-heading"><span class="guide-category">${escapeHTML(guideCategories[item.category] || item.category)}</span><small>Guide p. ${item.sourcePages.join(", ")}</small></div><h4>${escapeHTML(item.title)}</h4><p class="extra-practice-text">${escapeHTML(item.text)}</p><div class="extra-practice-controls"><label>Knowledge<select data-extra-index="${index}" data-extra-field="state"><option value="unassessed" ${item.state === "unassessed" ? "selected" : ""}>Not checked</option><option value="learning" ${item.state === "learning" ? "selected" : ""}>Needs practice</option><option value="known" ${item.state === "known" ? "selected" : ""}>Knows it</option></select></label><label class="extra-finished"><input type="checkbox" data-extra-index="${index}" data-extra-field="practiceFinished" ${item.practiceFinished ? "checked" : ""}> Practised</label></div></article>`).join("") +
      (extra.length ? '<p class="guide-note">Extra practice is saved separately from the five words and sentence. Unfinished extras stay available when the next practice opens.</p>' : '<p class="guide-note">Add resources from the teaching guide to record grammar, speaking, phonics, reading or writing alongside this lesson.</p>');
    refs.grammarContent.querySelectorAll(".extra-practice").forEach((card,index) => {
      const button = document.createElement("button"); button.className = "text-button";
      button.dataset.removeExtra = String(index); button.textContent = "Remove from this practice";
      card.append(button);
    });
  }

  function removeExtraPractice(index) {
    const student = selectedStudent(); if (!student || storageBlocked) return;
    if (!requireMonthlyAccess(student)) return;
    const preview = getRecord(student,state.selectedWeekStart,false), item = preview.additionalPractice?.[Number(index)];
    if (!item || !window.confirm("Remove this extra activity and its marks from this practice? Earlier lesson history will be kept.")) return;
    const record = getRecord(student,state.selectedWeekStart,true);
    record.additionalPractice = record.additionalPractice.filter(entry => entry.entryId !== item.entryId);
    record.removedExtraPracticeIds = [...new Set([...(record.removedExtraPracticeIds || []),item.entryId])];
    record.updatedAt = new Date().toISOString(); lastCompletion = null;
    persistState(); renderLesson(); showToast("Extra activity removed. Earlier history kept.");
  }

  function updateExtraPractice(element) {
    const student = selectedStudent(); if (!student || storageBlocked) return;
    if (!requireMonthlyAccess(student)) return;
    const record = getRecord(student,state.selectedWeekStart,true);
    const item = record.additionalPractice?.[Number(element.dataset.extraIndex)];
    if (!item) return;
    const field = element.dataset.extraField;
    if (field === "state" && ["known","learning","unassessed"].includes(element.value)) item.state = element.value;
    if (field === "practiceFinished") item.practiceFinished = element.checked;
    record.updatedAt = new Date().toISOString(); lastCompletion = null; persistState();
  }

  function openOriginalGuide() {
    const handler = window.webkit?.messageHandlers?.openGuide;
    if (handler) handler.postMessage("open");
    else window.open("assets/teacher-guide.pdf", "_blank", "noopener");
  }

  function renderClasses() {
    refs.classSelect.innerHTML = state.classes.length
      ? state.classes.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join("")
      : '<option value="">Create your first class</option>';
    refs.classSelect.value = state.selectedClassId || "";
    refs.recentlyDeletedButton.textContent = `Recently deleted (${deletedStudents().length})`;
    refs.emptyState.querySelector("h2").textContent = state.classes.length ? "Add children to this class" : "Welcome to EtonHouse English tracker";
    refs.emptyState.querySelector("p").textContent = deletedStudents().length
      ? "Open Tools → Classes & import names → Recently deleted to restore a child with saved results."
      : "Use + to add a child, or Tools → Classes & import names to upload your Excel list. Restore existing records in Backups & exports.";
  }

  function switchClass(id) {
    state.selectedClassId = id; searchTerm = ""; currentFilter = "all";
    refs.studentSearch.value = "";
    refs.filterRow.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("is-active", b.dataset.filter === "all"));
    ensureSelection(); persistState(false); renderAll();
  }

  function openClasses() {
    pendingImport = null;
    refs.importPreview.innerHTML = "";
    refs.confirmImportButton.disabled = true;
    refs.classMessage.textContent = selectedClass() ? `Uploads will add children to ${selectedClass().name}. Existing progress is kept.` : "Create a class first, then upload its children's names.";
    refs.classStartInput.value = mondayStart(new Date());
    refs.classLevelInput.innerHTML = (curriculumMeta.levels || []).map(l => `<option value="${l.firstUnitIndex}">Age ${escapeHTML(l.ageBand)} · ${escapeHTML(l.name)}</option>`).join("");
    refs.classesDialog.showModal();
  }

  function createClass(event) {
    event.preventDefault();
    if (storageBlocked) return;
    const name = refs.classNameInput.value.trim();
    if (!name) return;
    if (state.classes.some(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { refs.classMessage.textContent = "That class already exists. Choose it in the class menu."; return; }
    const group = {id: `class-${crypto.randomUUID()}`, name, startWeek:mondayStart(refs.classStartInput.value), startUnit:Number(refs.classLevelInput.value) || 0};
    state.classes.push(group); state.selectedWeekStart = group.startWeek;
    if (exams) exams.configure(state,group.id,{startPeriod:`${group.startWeek.slice(0,7)}-01`,periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});
    switchClass(group.id); refs.classNameInput.value = "";
    pendingImport = null; refs.importPreview.innerHTML = ""; refs.confirmImportButton.disabled = true;
    refs.classMessage.textContent = `${name} created. Upload its Excel list below, or close this window and use + to add a child.`;
  }

  async function previewRoster(file) {
    pendingImport = null; refs.confirmImportButton.disabled = true; refs.importPreview.innerHTML = "";
    try {
      if (!selectedClass()) throw new Error("Create or select a class first.");
      const parsed = await window.RosterImport.read(file);
      const existing = state.students.filter(s => s.classId === state.selectedClassId);
      const normalized = value => String(value || "").trim().toLocaleLowerCase();
      const nameKey = row => `${normalized(row.englishName)}::${normalized(row.chineseName)}`;
      let skipped = 0;
      const rows = parsed.rows.filter(row => {
        const sameCode = row.studentCode && existing.find(s => normalized(s.studentCode) === normalized(row.studentCode));
        const deletedMatch = sameCode?.active === false ? sameCode : existing.find(s => s.active === false && nameKey(s) === nameKey(row) && (!row.studentCode || !s.studentCode));
        if (deletedMatch) throw new Error(`${deletedMatch.englishName || deletedMatch.chineseName} is in Recently deleted. Restore that child to keep their results, or remove this row from the upload. Deleted children are not added again automatically.`);
        if (sameCode && nameKey(sameCode) !== nameKey(row)) throw new Error(`Student ID ${row.studentCode} already belongs to another name. Check the spreadsheet.`);
        const sameNames = existing.filter(s => nameKey(s) === nameKey(row));
        if (!row.studentCode && sameNames.length > 1) throw new Error(`More than one child is named ${row.englishName || row.chineseName}. Give each child a different Student ID.`);
        if (sameCode || sameNames.some(s => !row.studentCode || !s.studentCode)) { skipped++; return false; }
        return true;
      });
      pendingImport = {classId:state.selectedClassId, rows};
      refs.classMessage.textContent = `${rows.length} new children ready for ${selectedClass().name}. ${skipped} existing children skipped. ${(parsed.warnings || []).join(" ")}`;
      refs.importPreview.innerHTML = rows.map(row => `<div class="import-preview-row"><strong>${escapeHTML(row.englishName || row.chineseName)}</strong><span>${escapeHTML(row.chineseName)}</span><small>${escapeHTML(row.studentCode || "")}</small></div>`).join("");
      refs.confirmImportButton.disabled = !rows.length;
    } catch(error) { refs.classMessage.textContent = error.message || "The names file could not be opened."; }
    finally { refs.importRosterInput.value = ""; }
  }

  function confirmRosterImport() {
    if (!pendingImport || pendingImport.classId !== state.selectedClassId || storageBlocked) return;
    const group = selectedClass();
    const joinedAt = classHasTeaching(group.id) ? new Date().toISOString() : null;
    let number = Math.max(0,...state.students.filter(s => s.classId === group.id).map(s => s.rosterNumber || 0));
    pendingImport.rows.forEach(row => state.students.push({id:`child-${crypto.randomUUID()}`, rosterNumber:++number, classId:group.id, group:group.name, englishName:row.englishName, chineseName:row.chineseName, studentCode:row.studentCode || "", startUnit:row.startUnit ?? group.startUnit ?? 0, startWeek:joinedAt ? [group.startWeek,mondayStart(new Date())].sort().at(-1) : group.startWeek, ...(joinedAt ? {joinedAt} : {}), active:true}));
    const count = pendingImport.rows.length; pendingImport = null;
    persistState(); renderAll(); refs.classesDialog.close(); showToast(`${count} children added. Existing progress kept.`);
  }

  async function downloadTemplate() {
    try {
      const nativeHandler = window.webkit?.messageHandlers?.exportFile;
      if (nativeHandler) { nativeHandler.postMessage({asset:"Student names template.xlsx"}); return; }
      const response = await fetch("assets/Student names template.xlsx");
      if (!response.ok) throw new Error("Template could not be opened.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const handler = window.webkit?.messageHandlers?.exportFile;
      if (handler) {
        let binary = ""; bytes.forEach(b => { binary += String.fromCharCode(b); });
        handler.postMessage({base64:btoa(binary),filename:"Student names template.xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      } else browserDownload(bytes,"Student names template.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch(error) { refs.classMessage.textContent = error.message; }
  }

  function nextUnpracticed() {
    const students = activeStudents();
    const index = students.findIndex(s => s.id === state.selectedStudentId);
    const queue = [...students.slice(index+1),...students.slice(0,index+1)];
    const next = queue.find(s => !weeklyStatus(getRecord(s,state.selectedWeekStart,false)).practiced);
    if (next) { currentFilter = "all"; searchTerm = ""; refs.studentSearch.value = ""; refs.filterRow.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("is-active",b.dataset.filter === "all")); selectStudent(next.id); }
    else showToast("Everyone in this class has practised this week.");
  }

  function openMonthlyExams(requiredPeriod = null, requiredStudentId = null) {
    const group = selectedClass();
    if (!exams || !group) { showToast("Create a class first."); return; }
    const targetChild = state.students.find(child=>child.id===(requiredStudentId || state.selectedStudentId));
    const checkpoint = targetChild ? exams.checkpoint(state,targetChild,{week:state.selectedWeekStart}) : {required:false};
    const periods = exams.availablePeriods(state,group.id,targetChild?.id);
    const requested = requiredPeriod || (checkpoint.required ? checkpoint.periodStart : state.selectedWeekStart);
    const normalized = exams.periodFor(group,requested).start;
    const available = periods.find(period=>!period.unlocked && !period.historyOnly) || periods.at(-1);
    examPeriod = periods.some(period=>period.start===normalized && !period.historyOnly) ? normalized : available?.start;
    if (!examPeriod) { showToast("Add a child to begin monthly exams."); return; }
    refs.examPeriodSelect.innerHTML = periods.map(period => `<option value="${period.start}">${escapeHTML(period.label)}</option>`).join("");
    refs.examPeriodSelect.value = examPeriod;
    examStudentId = requiredStudentId || (checkpoint.required ? checkpoint.studentId : null) || state.selectedStudentId;
    refs.examMessage.textContent = "";
    renderMonthlyExam();
    if (!refs.monthlyExamsDialog.open) refs.monthlyExamsDialog.showModal();
  }

  function examScore(result) {
    return result?.completed ? `${result.known}/${result.total} · ${Number(result.scorePercent).toFixed(1)}%` : "Not completed";
  }

  function classHasTeaching(classId) {
    const ids=new Set(state.students.filter(child=>child.classId===classId).map(child=>child.id));
    return Object.values(state.records).some(record=>ids.has(record.studentId) && model.sessions(record).some(session=>model.activity(session))) || Object.values(state.monthlyExams?.rounds || {}).some(round=>round.classId===classId);
  }

  function examPracticeReadiness(member) {
    return member ? exams.readiness(state,state.selectedClassId,examPeriod,member.studentId) : {ready:false,finished:0,total:0,missing:[]};
  }

  function renderMonthlyExam() {
    const group = selectedClass();
    if (!exams || !group || !examPeriod) return;
    const preview = exams.previewRound(state,group.id,examPeriod);
    const shownPeriod = exams.availablePeriods(state,group.id,examStudentId).find(period=>period.start===examPeriod);
    const historyOnly = !shownPeriod || Boolean(shownPeriod.historyOnly);
    const summary = exams.roundStatus(state,group.id,examPeriod);
    const policy = preview.policySnapshot || group.monthlyPolicy;
    refs.monthlyExamsTitle.textContent = `${group.name} · monthly exams`;
    refs.examRulesSummary.textContent = "Each child passes their own exam before next month: 80% overall, with a majority of both words and sentences correct. Saved older exams keep their original rules.";
    refs.examClassStatus.classList.toggle("is-ready", summary.unlocked);
    const cohortTotal=summary.eligible,nonAbsent=summary.nonAbsent ?? summary.eligible;
    const tested=summary.coverageCompleted ?? summary.completed,passed=summary.countedPassed ?? summary.passed;
    const requiredCoverage=summary.requiredCoverage ?? Math.ceil(cohortTotal*0.8),absent=summary.absent || 0;
    refs.examClassStatus.innerHTML = `<div class="exam-class-counts"><span><strong>${tested}/${cohortTotal}</strong> tested</span><span><strong>${passed}/${nonAbsent}</strong> passed</span><span><strong>${absent}</strong> absent</span></div><p>Information only. Children who pass can advance independently.</p>`;
    const children = summary.children || [];
    if (!children.some(child => child.studentId === examStudentId)) examStudentId = children[0]?.studentId || null;
    refs.examChildList.innerHTML = children.map(child => `<button class="exam-child-row ${child.studentId === examStudentId ? "is-selected" : ""}" data-exam-child="${escapeHTML(child.studentId)}"><strong>${escapeHTML(child.name)}</strong><small class="${child.passed ? "is-passed" : ""}">${child.withdrawn ? "Withdrawn · history saved" : child.absent ? "Absent—exam pending" : child.passed ? "Passed" : child.draft ? "Exam in progress" : child.completed ? "Review and retest" : "Not examined"}${child.completed ? ` · ${Number(child.scorePercent).toFixed(1)}%` : ""}${!child.withdrawn && child.countsForClass === false ? " · Catch-up" : ""}</small></button>`).join("") || '<p class="modal-intro">No eligible children.</p>';
    const member = preview.cohort.find(child => child.studentId === examStudentId);
    const result = children.find(child => child.studentId === examStudentId);
    const draft = result?.draft;
    const readiness=examPracticeReadiness(member);
    const examLocked=storageBlocked || historyOnly || result?.withdrawn || result?.absent || !readiness.ready;
    refs.examChildTitle.textContent = member?.name || "No child selected";
    refs.examChildResult.textContent = result?.completed ? `${result.passed ? "Passed" : "Needs review"} · ${examScore(result)}` : "";
    refs.examChildResult.style.color = result?.passed ? "var(--known)" : "var(--learning)";
    const pool = member?.items || [];
    const assessment = member ? exams.previewAssessment(preview,examStudentId) : null;
    const items = assessment?.items || [];
    const shown = draft || result?.latestAttempt;
    const states = shown?.itemStates || [];
    refs.examInstructions.textContent = !member ? "Choose a month with eligible children." : draft ? "Check the items below, then Finish exam. Answers save as you go; pause whenever the child needs a break." : result?.passed ? "Completed. This child can move on; the result stays in History." : result?.completed ? "Practise missed targets, then start a fresh retest. Earlier attempts stay saved." : "Finish the month's practice, then start this short check.";
    if (assessment?.sampled) refs.examInstructions.textContent += ` Short check: ${assessment.vocabularyTotal} vocabulary + ${assessment.sentenceTotal} sentence items (${assessment.total} of ${assessment.poolTotal} in the month). Items not asked are not marked known.`;
    else if (shown) refs.examInstructions.textContent += " Saved checklist, answers and original scoring retained.";
    refs.examReadinessStatus.textContent=!member ? "" : result?.passed && !draft ? "Saved completed result—no practice needs to be repeated for this exam." : `${readiness.finished}/${readiness.total} assigned lessons marked Finished.${readiness.ready ? " Ready for assessment." : " Finish the missing practice first. Saved exam answers are kept."}${result?.absent ? " Mark this child returned before resuming." : ""}`;
    refs.examReadinessStatus.classList.toggle("is-ready",Boolean(readiness.ready));
    refs.examPracticeButton.classList.toggle("is-hidden",!member || readiness.ready || result?.passed || result?.withdrawn);
    refs.examPracticeButton.disabled=storageBlocked || historyOnly || Boolean(result?.absent);
    refs.examAbsenceButton.classList.toggle("is-hidden",!member || result?.withdrawn || result?.passed);
    refs.examAbsenceButton.textContent=result?.absent ? "Child returned" : "Mark absent—exam pending";
    refs.examAbsenceButton.disabled=storageBlocked || historyOnly;
    if (member?.lessons.some(entry=>entry.lesson.levelId === "pre-nursery")) refs.examInstructions.textContent += " Age 2–3: follow the guide's expectations for words, gestures and understanding. Full spoken sentences are not required at this stage.";
    refs.examItems.innerHTML = items.map(item => {const index=item.itemIndex; return `<div class="exam-item"><div class="exam-item-text"><small>${item.kind === "sentence" ? "Sentence" : "Vocabulary"} · week of ${escapeHTML(item.weekStart)}</small><strong>${escapeHTML(item.text)}</strong><small>${escapeHTML(item.expectation || "Saved assessment format")}</small></div><div class="state-switch" role="group" aria-label="${escapeHTML(item.text)}"><button data-exam-item="${index}" data-exam-mark="learning" class="${states[index] === "learning" ? "is-active" : ""}" aria-pressed="${states[index] === "learning"}" ${!draft || examLocked ? "disabled" : ""}>Needs practice</button><button data-exam-item="${index}" data-exam-mark="known" class="${states[index] === "known" ? "is-active" : ""}" aria-pressed="${states[index] === "known"}" ${!draft || examLocked ? "disabled" : ""}>Knows it</button></div></div>`;}).join("");
    if (document.activeElement !== refs.examTeacherNote) refs.examTeacherNote.value = shown?.notes || "";
    refs.examTeacherNote.disabled = !draft || examLocked;
    const checked = items.filter(item => ["known","learning"].includes(states[item.itemIndex])).length;
    const known = items.filter(item => states[item.itemIndex] === "known").length;
    const shownRule=shown?.scoringRule || (shown && !draft ? assessment?.sampled ? "legacy-sampled-v1" : "legacy-full-v1" : "overall-majority-v1");
    const threshold=shown?.passPercent ?? policy.passPercent;
    const passHint=shownRule === "overall-majority-v1" ? `Pass: ${Math.ceil(items.length*0.8)}/${items.length} overall, at least ${Math.floor((assessment?.vocabularyTotal || 0)/2)+1}/${assessment?.vocabularyTotal || 0} vocabulary and ${Math.floor((assessment?.sentenceTotal || 0)/2)+1}/${assessment?.sentenceTotal || 0} sentences.` : assessment?.sampled ? `Original rule: ${Math.ceil(assessment.vocabularyTotal*threshold/100)}/${assessment.vocabularyTotal} vocabulary and ${Math.ceil(assessment.sentenceTotal*threshold/100)}/${assessment.sentenceTotal} sentences.` : `Original rule: ${Math.ceil(items.length*threshold/100)}/${items.length} overall.`;
    refs.examMarkProgress.textContent = member ? `${draft ? `${checked}/${items.length} checked · ${known} known. ` : ""}${passHint}` : "";
    if (!draft && result?.completed && result.sampled) refs.examMarkProgress.textContent = `Result: vocabulary ${result.vocabulary.known}/${result.vocabulary.total}; sentences ${result.sentence.known}/${result.sentence.total}. ${passHint}`;
    refs.startExamButton.classList.toggle("is-hidden", Boolean(draft || result?.passed || !member));
    refs.startExamButton.textContent = result?.completed ? "Start retest" : "Start exam";
    refs.startExamButton.disabled = Boolean(examLocked);
    if (historyOnly) refs.examInstructions.textContent = "Saved exam history. Complete the earlier required month before continuing this exam.";
    refs.finishExamButton.classList.toggle("is-hidden", !draft);
    refs.pauseExamButton.classList.toggle("is-hidden", !draft);
    refs.finishExamButton.disabled = !draft || !items.length || checked !== items.length || Boolean(examLocked);
    const history = state.monthlyExams?.rounds?.[preview.id]?.attempts?.[examStudentId]?.history || [];
    refs.examAttemptsList.innerHTML = history.map((attempt,index) => {
      const assessed = exams.resultForAttempt(attempt,pool.length,policy.passPercent,pool);
      const indexes = attempt.itemIndexes || pool.map((_,i)=>i);
      const correction = (state.monthlyExams?.rounds?.[preview.id]?.attempts?.[examStudentId]?.corrections || []).find(entry=>entry.attemptId===attempt.id);
      return `<div class="exam-attempt"><strong>Attempt ${index+1} · ${assessed.passed ? "Passed" : "Needs review"} · ${Number(assessed.scorePercent).toFixed(1)}%</strong><p>${escapeHTML(completionDate(attempt.completedAt))} · ${assessed.known}/${assessed.total} checked items known</p>${attempt.notes ? `<p>${escapeHTML(attempt.notes)}</p>` : ""}${correction ? `<p class="correction-note">Recording corrected ${escapeHTML(completionDate(correction.at))}: ${escapeHTML(correction.reason)}. Original attempt retained.</p>` : ""}<details><summary>View assessed items</summary><ul>${indexes.map(i=>`<li>${escapeHTML(pool[i]?.text || "Saved item")}: ${attempt.itemStates[i] === "known" ? "Knows it" : "Needs practice"}</li>`).join("")}</ul>${!correction && index===history.length-1 && !draft && attempt.id && exams.correctAttempt ? `<button class="text-button" data-correct-round="${escapeHTML(preview.id)}" data-correct-child="${escapeHTML(examStudentId)}" data-correct-attempt="${escapeHTML(attempt.id)}">Correct a recording mistake</button>` : ""}</details></div>`;
    }).join("") || '<p class="modal-intro">No completed attempts yet.</p>';
  }

  function persistExamChange() {
    // Only a qualified exam can release a held next-month lesson. Preserve
    // the original completion date when moving it into history.
    for (const record of Object.values(state.records)) {
      if (!record.awaitingMonthlyExam) continue;
      const child = state.students.find(item=>item.id===record.studentId);
      if (child && child.active !== false && child.classId===state.selectedClassId) model.complete(state,child,record.weekStart);
    }
    const ok = persistState();
    refs.examMessage.className = `data-message${ok ? "" : " is-error"}`;
    refs.examMessage.textContent = ok ? window.webkit?.messageHandlers?.saveData ? "Saving exam changes…" : "Exam changes saved on this computer." : "Exam changes could not be saved. Keep the app open and save a full backup.";
    renderAll();
  }

  function confirmExamAction(message, action) {
    pendingExamAction = action;
    refs.examConfirmMessage.textContent = message;
    refs.examConfirmAction.textContent = action === "finish" ? "Finish exam" : action === "absent" ? "Confirm absence" : action === "returned" ? "Confirm return" : "Start exam";
    refs.examConfirmDialog.showModal();
  }

  function startMonthlyAttempt(confirmed = false) {
    if (storageBlocked || !examStudentId) return;
    try {
      const summary = exams.roundStatus(state,state.selectedClassId,examPeriod);
      const preview=exams.previewRound(state,state.selectedClassId,examPeriod);
      const member=preview.cohort.find(child=>child.studentId===examStudentId);
      const readiness=examPracticeReadiness(member);
      if(!readiness.ready) throw new Error(`Finish the ${readiness.total-readiness.finished} missing practice lesson(s) before starting this exam. Use Finish missing practice.`);
      if (confirmed !== true && !summary.frozen) {
        const message = `Start ${member.name}'s exam? The assigned questions will be saved. Marks save as you go, but the result is only completed when you press Finish exam.`;
        confirmExamAction(message,"start"); return;
      }
      exams.startAttempt(state,state.selectedClassId,examPeriod,examStudentId);
      persistExamChange(); renderMonthlyExam();
    } catch(error) { refs.examMessage.textContent = error.message; refs.examMessage.className = "data-message is-error"; }
  }

  function setMonthlyAbsence(absent,confirmed=false) {
    if(storageBlocked || !examStudentId) return;
    try {
      requireCurrentExamAccess();
      const member=exams.previewRound(state,state.selectedClassId,examPeriod).cohort.find(child=>child.studentId===examStudentId);
      if(!member) return;
      if(confirmed!==true) {
        confirmExamAction(absent ? `Mark ${member.name} absent? Their exam stays pending and their own next month stays locked. Classmates can continue independently.` : `Mark ${member.name} returned? Their saved answers remain available. Finish their practice and exam to continue.`,absent ? "absent" : "returned");
        return;
      }
      exams.setAbsence(state,state.selectedClassId,examPeriod,examStudentId,absent);
      persistExamChange();renderMonthlyExam();
    } catch(error) {refs.examMessage.textContent=error.message;refs.examMessage.className="data-message is-error";}
  }

  function openMissingExamPractice() {
    if(storageBlocked || !examStudentId) return;
    try {
      requireCurrentExamAccess();
      const target=model.prepareExamPractice(state,state.selectedClassId,examPeriod,examStudentId);
      currentFilter="all";searchTerm="";refs.studentSearch.value="";
      refs.filterRow.querySelectorAll("[data-filter]").forEach(button=>button.classList.toggle("is-active",button.dataset.filter==="all"));
      lastCompletion=null;persistState();refs.monthlyExamsDialog.close();renderAll();refs.lessonPane.scrollTo({top:0});
      showToast(`Practise the lesson for ${completionDate(target.weekStart)}, then press Finished.`);
    } catch(error) {refs.examMessage.textContent=error.message;refs.examMessage.className="data-message is-error";}
  }

  function markMonthlyItem(index,mark) {
    if (storageBlocked) return;
    try {
      requireCurrentExamAccess();
      const round = exams.previewRound(state,state.selectedClassId,examPeriod);
      exams.setMark(state,round.id,examStudentId,index,mark);
      persistExamChange(); renderMonthlyExam();
      refs.examItems.querySelector(`[data-exam-item="${index}"][data-exam-mark="${mark}"]`)?.focus({preventScroll:true});
    } catch(error) { refs.examMessage.textContent = error.message; refs.examMessage.className = "data-message is-error"; }
  }

  function finishMonthlyAttempt(confirmed = false) {
    if (storageBlocked || !examStudentId) return;
    try {
      requireCurrentExamAccess();
      const round = exams.previewRound(state,state.selectedClassId,examPeriod);
      const child = round.cohort.find(member=>member.studentId===examStudentId);
      if (confirmed !== true) { confirmExamAction(`Finish ${child.name}'s monthly exam? These assessed marks will be kept in the exam history.`,"finish"); return; }
      exams.finishAttempt(state,round.id,examStudentId);
      persistExamChange(); renderMonthlyExam();
    } catch(error) { refs.examMessage.textContent = error.message; refs.examMessage.className = "data-message is-error"; }
  }

  function openExamPolicy() {
    const group = selectedClass();
    if (!group || !exams) return;
    const policy = group.monthlyPolicy;
    const frozen = Object.values(state.monthlyExams?.rounds || {}).some(round=>round.classId===group.id);
    refs.examPolicyIntro.textContent = `For ${group.name}. Exams apply from ${completionDate(policy.startPeriod)}. ${frozen ? "These rules are fixed because monthly exams have started." : "Set the rules before starting the first exam. They are fixed once assessment begins."} Earlier saved practice stays available and is not counted as an exam.`;
    refs.examPeriodKind.value = policy.periodKind;
    refs.examPassPercent.value = "80";
    refs.examIndividualRule.value = "hold";
    [refs.examPeriodKind,refs.saveExamPolicyButton].forEach(element=>{element.disabled=frozen || storageBlocked;});
    refs.examPassPercent.disabled=true;refs.examIndividualRule.disabled=true;
    refs.examPolicyMessage.textContent = "";
    refs.examPolicyDialog.showModal();
  }

  function requireCurrentExamAccess() {
    const period = exams.availablePeriods(state,state.selectedClassId,examStudentId).find(period=>period.start===examPeriod);
    if (!period || period.historyOnly) throw new Error("Complete this child's earlier required exam before continuing this month.");
  }

  function saveExamPolicy() {
    if (storageBlocked) return;
    try {
      const group = selectedClass();
      const kind = refs.examPeriodKind.value;
      let start = group.monthlyPolicy.startPeriod;
      if (kind === "calendar") start = `${start.slice(0,7)}-01`;
      else {const monday=mondayStart(start); start=monday < start ? addDays(monday,7) : monday; if(group.startWeek > start) start=group.startWeek;}
      exams.configure(state,group.id,{...group.monthlyPolicy,startPeriod:start,periodKind:kind,passPercent:80,requireIndividualPass:true});
      persistState(); renderAll(); refs.examPolicyDialog.close();
      const requested = examPeriod; refs.monthlyExamsDialog.close(); openMonthlyExams(requested);
    } catch(error) { refs.examPolicyMessage.textContent = error.message; }
  }

  function reportEndForMonths(start,count) {
    const date = new Date(`${start}T12:00:00`);
    const end = new Date(date.getFullYear(),date.getMonth()+count,0,12);
    return `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,"0")}-${String(end.getDate()).padStart(2,"0")}`;
  }

  function openProgressReport() {
    const group = selectedClass();
    if (!group) { showToast("Create a class first."); return; }
    refs.dataDialog.close();
    const children = activeStudents();
    refs.reportStudentSelect.innerHTML = children.map(child=>`<option value="${escapeHTML(child.id)}">${escapeHTML(child.englishName || child.chineseName)}</option>`).join("");
    refs.reportStudentSelect.value = selectedStudent()?.id || children[0]?.id || "";
    refs.reportScope.value = selectedStudent() ? "student" : "class";
    refs.reportStartDate.value = `${group.startWeek.slice(0,7)}-01`;
    reportLength = 2;
    refs.reportEndDate.value = reportEndForMonths(refs.reportStartDate.value,reportLength);
    refs.reportMessage.textContent = "";
    renderReportPreview(); refs.progressReportDialog.showModal();
  }

  function renderReportPreview() {
    const individual = refs.reportScope.value === "student";
    refs.reportStudentLabel.classList.toggle("is-hidden", !individual);
    document.querySelectorAll("[data-report-months]").forEach(button=>{button.classList.toggle("is-active",button.dataset.reportMonths===String(reportLength));button.disabled=reportExportPending;});
    [refs.reportStartDate,refs.reportEndDate,refs.reportScope,refs.reportStudentSelect].forEach(input=>{input.disabled=reportExportPending;});
    refs.reportPreview.textContent = individual ? "A private report with a learning graph, demonstrated words and sentence structures. Gaps are not counted as zero scores." : `${activeStudents().length} separate child report sheets in one workbook. This file contains the whole class: export One child when sharing with a family.`;
    refs.downloadProgressReportButton.disabled = reportExportPending || !activeStudents().length || !refs.reportStartDate.value || !refs.reportEndDate.value || (individual && !refs.reportStudentSelect.value);
  }

  function reportExportResult(result) {
    if (!reportExportPending) return;
    const operation = result?.operation;
    if (operation && !["file","exportFile"].includes(operation)) return;
    reportExportPending = false;
    refs.reportMessage.className = `data-message${!result.ok && !result.canceled ? " is-error" : ""}`;
    refs.reportMessage.textContent = result.canceled ? "Export cancelled. Your records were not changed." : result.ok ? "Excel progress report saved." : result.message || result.error || "The report could not be saved. Try exporting again.";
    renderReportPreview();
  }

  async function exportProgressReport() {
    if (reportExportPending) return;
    try {
      refs.reportMessage.className = "data-message";
      refs.reportMessage.textContent = "Preparing the progress report…";
      reportExportPending = true; renderReportPreview();
      const output = await window.ProgressReport.exportXlsx(state,{scope:refs.reportScope.value,classId:state.selectedClassId,studentId:refs.reportScope.value === "student" ? refs.reportStudentSelect.value : undefined,startDate:refs.reportStartDate.value,endDate:refs.reportEndDate.value});
      if (output.bytes.byteLength > 20000000) throw new Error("This report is too large. Choose a shorter period or one child.");
      const handler = window.webkit?.messageHandlers?.exportFile;
      if (handler) {
        let binary = "";
        for (let start=0;start<output.bytes.length;start+=32768) binary += String.fromCharCode(...output.bytes.subarray(start,start+32768));
        reportExportPending = true; renderReportPreview();
        refs.reportMessage.textContent = "Choose where to save the Excel report.";
        const result = handler.postMessage({filename:output.fileName,base64:btoa(binary),mimeType:output.mimeType});
        if (result?.then) result.then(value=>{if(value?.canceled || value?.ok===false) reportExportResult(value);}).catch(error=>reportExportResult({ok:false,error:error.message}));
      } else {
        browserDownload(output.bytes,output.fileName,output.mimeType);
        reportExportPending = false; renderReportPreview();
        refs.reportMessage.textContent = "Excel report downloaded. Your records were not changed.";
      }
    } catch(error) { reportExportPending=false; refs.reportMessage.className="data-message is-error"; refs.reportMessage.textContent=error.message; renderReportPreview(); }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => refs.toast.classList.remove("is-visible"), 2300);
  }

  function bindEvents() {
    refs.toolsButton.addEventListener("click",()=>{
      const selected = Boolean(selectedStudent());
      refs.reviewFirstDays.value = String(state.learningReview?.settings.firstDays ?? 7);
      refs.reviewRepeatDays.value = String(state.learningReview?.settings.repeatDays ?? 28);
      refs.reviewTimingMessage.textContent = "";
      [refs.reviewFirstDays,refs.reviewRepeatDays,refs.saveReviewTimingButton].forEach(input=>{ input.disabled = storageBlocked || !learningReview; });
      refs.changeCurriculumButton.disabled = !selected || storageBlocked;
      refs.futureGoalButton.disabled = !selected || storageBlocked || !learningReview;
      document.querySelectorAll("[data-next-action]").forEach(button=>{ if (!selected) button.disabled = true; });
      refs.toolsDialog.showModal();
    });
    refs.reviewTimingForm.addEventListener("submit",event=>{
      event.preventDefault();
      if (storageBlocked || !learningReview) return;
      try {
        const firstDays = Number(refs.reviewFirstDays.value), repeatDays = Number(refs.reviewRepeatDays.value);
        if (!Number.isInteger(firstDays) || firstDays<1 || firstDays>90 || !Number.isInteger(repeatDays) || repeatDays<1 || repeatDays>180) throw new Error("Use whole days: 1–90 for first review and 1–180 after Knows it.");
        learningReview.setSettings(state,{firstDays,repeatDays,limit:3});
        refs.reviewTimingMessage.textContent = persistState() ? "Review timing saved." : "Timing could not be saved. Keep the app open and save a full backup.";
      } catch(error) { refs.reviewTimingMessage.textContent = error.message; }
    });
    [refs.manageClassesButton,refs.dataButton,refs.curriculumButton,refs.changeCurriculumButton].forEach(button=>button.addEventListener("click",()=>refs.toolsDialog.close()));
    refs.practiceNavButton.addEventListener("click",()=>setWorkflowView("practice"));
    refs.reviewNavButton.addEventListener("click",()=>setWorkflowView("review"));
    refs.reportNavButton.addEventListener("click",openProgressReport);
    refs.reviewItems.addEventListener("click",event=>{
      const mark = event.target.closest("[data-review-id][data-review-mark]");
      const postpone = event.target.closest("[data-postpone-review]");
      if (mark) markReview(mark.dataset.reviewId,mark.dataset.reviewMark);
      else if (postpone) postponeReview(postpone.dataset.postponeReview);
    });
    refs.futureGoalButton.addEventListener("click",openFutureGoal);
    refs.futureGoalWeek.addEventListener("change",refreshFutureGoals);
    refs.futureGoalTarget.addEventListener("change",()=>{
      const child = selectedStudent(),week = refs.futureGoalWeek.value;
      if (child && week) refs.futureGoalExpectation.value = learningReview?.expectations(state,child,week,getRecord(child,week,false))?.[Number(refs.futureGoalTarget.value)] || "Respond independently";
    });
    refs.futureGoalForm.addEventListener("submit",saveFutureGoal);
    refs.examCorrectionForm.addEventListener("submit",saveExamCorrection);
    refs.examAttemptsList.addEventListener("click",event=>{
      const button = event.target.closest("[data-correct-attempt]");
      if (button) openExamCorrection(button.dataset.correctRound,button.dataset.correctChild,button.dataset.correctAttempt);
    });
    refs.pauseExamButton.addEventListener("click",()=>{
      if (persistState()) { refs.monthlyExamsDialog.close(); showToast("Exam paused. Your answers are saved; open Exam to resume."); }
    });
    refs.monthlyExamsButton.addEventListener("click",()=>openMonthlyExams(refs.monthlyExamsButton.dataset.period,refs.monthlyExamsButton.dataset.studentId));
    refs.openRequiredExamButton.addEventListener("click",()=>openMonthlyExams(refs.openRequiredExamButton.dataset.period));
    refs.examRequiredAction.addEventListener("click",()=>{
      refs.examRequiredDialog.close();
      if (refs.lessonPickerDialog.open) refs.lessonPickerDialog.close();
      openMonthlyExams(refs.examRequiredAction.dataset.period,refs.examRequiredAction.dataset.studentId);
    });
    refs.examPeriodSelect.addEventListener("change",()=>{examPeriod=refs.examPeriodSelect.value; refs.examMessage.textContent=""; renderMonthlyExam();});
    refs.examPolicyButton.addEventListener("click",openExamPolicy);
    refs.saveExamPolicyButton.addEventListener("click",saveExamPolicy);
    refs.examChildList.addEventListener("click",event=>{const button=event.target.closest("[data-exam-child]"); if(button) openMonthlyExams(null,button.dataset.examChild);});
    refs.examItems.addEventListener("click",event=>{const button=event.target.closest("[data-exam-item][data-exam-mark]"); if(button) markMonthlyItem(Number(button.dataset.examItem),button.dataset.examMark);});
    refs.startExamButton.addEventListener("click",startMonthlyAttempt);
    refs.finishExamButton.addEventListener("click",finishMonthlyAttempt);
    refs.examPracticeButton.addEventListener("click",openMissingExamPractice);
    refs.examAbsenceButton.addEventListener("click",()=>{
      const child=exams.roundStatus(state,state.selectedClassId,examPeriod).children.find(item=>item.studentId===examStudentId);
      if(child)setMonthlyAbsence(!child.absent);
    });
    refs.examConfirmAction.addEventListener("click",()=>{
      const action = pendingExamAction; pendingExamAction = null;
      refs.examConfirmDialog.close();
      if (action === "start") startMonthlyAttempt(true);
      else if (action === "finish") finishMonthlyAttempt(true);
      else if (action === "absent") setMonthlyAbsence(true,true);
      else if (action === "returned") setMonthlyAbsence(false,true);
    });
    refs.examConfirmDialog.addEventListener("close",()=>{pendingExamAction=null;});
    refs.examTeacherNote.addEventListener("input",()=>{
      if (storageBlocked) return;
      try { requireCurrentExamAccess(); const round=exams.previewRound(state,state.selectedClassId,examPeriod); exams.saveNote(state,round.id,examStudentId,refs.examTeacherNote.value); persistExamChange(); }
      catch(error) {refs.examMessage.textContent=error.message;}
    });
    refs.progressReportButton.addEventListener("click",openProgressReport);
    document.querySelectorAll("[data-report-months]").forEach(button=>button.addEventListener("click",()=>{
      reportLength=button.dataset.reportMonths === "custom" ? "custom" : Number(button.dataset.reportMonths);
      if(reportLength !== "custom" && refs.reportStartDate.value) refs.reportEndDate.value=reportEndForMonths(refs.reportStartDate.value,reportLength);
      renderReportPreview();
    }));
    refs.reportStartDate.addEventListener("change",()=>{if(reportLength !== "custom" && refs.reportStartDate.value) refs.reportEndDate.value=reportEndForMonths(refs.reportStartDate.value,reportLength); renderReportPreview();});
    refs.reportEndDate.addEventListener("change",()=>{reportLength="custom"; renderReportPreview();});
    refs.reportScope.addEventListener("change",renderReportPreview);
    refs.reportStudentSelect.addEventListener("change",renderReportPreview);
    refs.downloadProgressReportButton.addEventListener("click",exportProgressReport);
    refs.guideLibraryButton?.addEventListener("click", () => openGuideLibrary());
    refs.openGuideButton?.addEventListener("click", openOriginalGuide);
    [refs.guideSearch,refs.guideLevelSelect,refs.guideCategorySelect].forEach(element => element?.addEventListener(element === refs.guideSearch ? "input" : "change", () => {guideVisibleCount = 30; renderGuideLibrary();}));
    refs.guideResults?.addEventListener("click", event => {
      const add = event.target.closest("[data-use-guide]");
      if (add) attachGuideEntry(add.dataset.useGuide);
      if (event.target.closest("[data-guide-more]")) {guideVisibleCount += 30; renderGuideLibrary();}
    });
    refs.grammarContent?.addEventListener("click", event => {
      const button=event.target.closest("[data-browse-guide]"); if(button) openGuideLibrary(button.dataset.browseGuide);
      const remove=event.target.closest("[data-remove-extra]"); if(remove) removeExtraPractice(remove.dataset.removeExtra);
    });
    refs.grammarContent?.addEventListener("change", event => {if(event.target.dataset.extraField) updateExtraPractice(event.target);});
    refs.classSelect.addEventListener("change", () => switchClass(refs.classSelect.value));
    refs.manageClassesButton.addEventListener("click", openClasses);
    refs.classForm.addEventListener("submit", createClass);
    refs.importRosterInput.addEventListener("change", event => { if(event.target.files?.[0]) previewRoster(event.target.files[0]); });
    refs.confirmImportButton.addEventListener("click", confirmRosterImport);
    refs.downloadTemplateButton.addEventListener("click", downloadTemplate);
    refs.completeKnownButton.addEventListener("click", completeKnown);
    refs.undoCompletionButton.addEventListener("click", undoCompletion);
    refs.nextUnpracticedButton.addEventListener("click", nextUnpracticed);
    refs.openBackupsButton.addEventListener("click", () => {
      const handler = window.webkit?.messageHandlers?.openBackups;
      if (handler) handler.postMessage("open");
      else refs.dataMessage.textContent = "Use Save full backup to keep a copy outside your browser.";
    });
    if (window.SeahorseDesktop) {
      window.SeahorseDesktop.onDataLoaded(d => window.onNativeDataLoaded(d.base64,d.found,d));
      window.SeahorseDesktop.onSaveResult(d => window.onNativeSaveResult(d.ok,d.error));
      window.SeahorseDesktop.onExportResult?.(reportExportResult);
      window.SeahorseDesktop.onError(d => {showToast(d.error || d.message || "The operation could not be completed."); if(reportExportPending && ["file","exportFile"].includes(d.operation)) reportExportResult({...d,ok:false});});
    } else {
      window.addEventListener("seahorse-native-data-loaded", event => { const d=event.detail || {}; window.onNativeDataLoaded(d.base64,d.found,d); });
      window.addEventListener("seahorse-native-save-result", event => { const d=event.detail || {}; window.onNativeSaveResult(d.ok,d.error); });
      window.addEventListener("seahorse-native-export-result",event=>reportExportResult(event.detail || {}));
      window.addEventListener("seahorse-native-error",event=>{const d=event.detail || {}; if(reportExportPending && ["file","exportFile"].includes(d.operation)) reportExportResult({...d,ok:false});});
    }
    refs.previousWeekButton.addEventListener("click", () => selectTeachingWeek(addDays(state.selectedWeekStart, -7)));
    refs.nextWeekButton.addEventListener("click", () => selectTeachingWeek(addDays(state.selectedWeekStart, 7)));
    refs.todayButton.addEventListener("click", () => selectTeachingWeek(mondayStart(new Date())));
    refs.weekPickerButton.addEventListener("click", () => {
      if (typeof refs.weekDateInput.showPicker === "function") refs.weekDateInput.showPicker();
      else refs.weekDateInput.click();
    });
    refs.weekDateInput.addEventListener("change", (event) => {
      if (!event.target.value) return;
      selectTeachingWeek(mondayStart(`${event.target.value}T12:00:00`));
    });
    refs.studentSearch.addEventListener("input", (event) => { searchTerm = event.target.value.trim(); renderStudentList(); });
    refs.filterRow.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      currentFilter = button.dataset.filter;
      refs.filterRow.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderStudentList();
    });
    refs.studentList.addEventListener("click", (event) => {
      const row = event.target.closest("[data-student-id]");
      if (row) selectStudent(row.dataset.studentId);
    });
    refs.addStudentButton.addEventListener("click", () => openStudentDialog(null));
    refs.warningAddButton.addEventListener("click", () => openStudentDialog(null));
    refs.editStudentButton.addEventListener("click", () => openStudentDialog(selectedStudent()));
    refs.studentForm.addEventListener("submit", saveStudent);
    refs.deleteStudentButton.addEventListener("click", deleteEditedStudent);
    refs.recentlyDeletedButton.addEventListener("click", openDeletedStudents);
    refs.deletedStudentsList.addEventListener("click", event => {
      const button = event.target.closest("[data-restore-student]");
      if (button) restoreDeletedStudent(button.dataset.restoreStudent);
    });
    refs.vocabularyItems.addEventListener("click", (event) => {
      const button = event.target.closest("[data-item-index][data-state]");
      if (button) updateItemState(Number(button.dataset.itemIndex), button.dataset.state);
    });
    refs.sentenceItem.addEventListener("click", (event) => {
      const button = event.target.closest("[data-item-index][data-state]");
      if (button) updateItemState(Number(button.dataset.itemIndex), button.dataset.state);
    });
    refs.practiceButton.addEventListener("click", togglePractice);
    document.querySelector(".next-choice").addEventListener("click", (event) => {
      const button = event.target.closest("[data-next-action]");
      if (button) setNextAction(button.dataset.nextAction);
    });
    refs.teacherNotes.addEventListener("input", () => {
      saveNotes();
    });
    refs.previousStudentButton.addEventListener("click", () => selectStudent(refs.previousStudentButton.dataset.studentId));
    refs.nextStudentButton.addEventListener("click", () => selectStudent(refs.nextStudentButton.dataset.studentId));
    refs.curriculumButton.addEventListener("click", openCurriculumDialog);
    refs.curriculumTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-level-filter]");
      if (!button) return;
      curriculumLevelFilter = button.dataset.levelFilter;
      refs.curriculumTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
      renderCurriculumList();
    });
    refs.historyButton.addEventListener("click", openHistoryDialog);
    refs.completionSourceButton.addEventListener("click", () => {
      openHistoryDialog();
      const sourceWeek = refs.completionSourceButton.dataset.sourceWeek;
      const sourceButton = [...refs.historyList.querySelectorAll("[data-open-week]")].find(button => button.dataset.openWeek === sourceWeek);
      sourceButton?.closest(".history-row")?.scrollIntoView({block:"nearest"});
    });
    refs.historyList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-week]");
      if (!button) return;
      state.selectedWeekStart = button.dataset.openWeek;
      persistState(false);
      renderAll();
      refs.historyDialog.close();
      showToast(`Opening ${formatWeekName(state.selectedWeekStart)}`);
    });
    refs.changeCurriculumButton.addEventListener("click", openLessonPicker);
    refs.confirmLessonChangeButton.addEventListener("click", confirmLessonChange);
    refs.dataButton.addEventListener("click", () => { refs.dataMessage.textContent = ""; refs.dataDialog.showModal(); });
    refs.exportBackupButton.addEventListener("click", exportBackup);
    refs.exportCsvButton.addEventListener("click", exportCSV);
    refs.resetProgressButton.addEventListener("click", resetAllProgress);
    refs.importBackupInput.addEventListener("change", (event) => { if (event.target.files?.[0]) importBackup(event.target.files[0]); });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $(button.dataset.closeDialog)?.close()));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        refs.studentSearch.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        persistState();
        if (!storageBlocked) showToast("Save requested");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initializeRefs();
    bindEvents();
    loadInitialState();
  });
})();

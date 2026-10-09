// Fresh installations contain no children's personal data.
window.createSeedState = function () {
  return {schemaVersion: 7, appVersion: "2.5.0", classes: [], students: [], records: {}, monthlyExams: {rounds: {}}, learningReview: {settings:{firstDays:7,repeatDays:28,limit:3},children:{},goals:[]}, selectedClassId: null, selectedStudentId: null, selectedWeekStart: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
};

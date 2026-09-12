// 本番相当の初期値。ダミー確認時は coolingQuestionCount: 1,
// coolingHours: 0, restingDays: 0.001 などに変更してください。
export const config = Object.freeze({
  // 収録問題数以上にすると、間に挟む問題が尽きて復習が再開しない。node tools/audit-data.cjs で検出する。
  coolingQuestionCount: 30,
  coolingHours: 24,
  restingDays: 7,
  maxDepth: 2,
});

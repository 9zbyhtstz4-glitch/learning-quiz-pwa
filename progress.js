export function initialProgress(questionId) {
  return { questionId, state: 'unseen', lastSeenAt: null,
    seenSinceCount: 0, correctStreak: 0, answerHistory: [] };
}

export function refresh(records, now, config) {
  for (const p of records) {
    if (p.lastSeenAt === null) continue;
    if (p.state === 'cooling' && p.seenSinceCount >= config.coolingQuestionCount &&
        now - p.lastSeenAt >= config.coolingHours * 3600000) p.state = 'due';
    if (p.state === 'resting' && now - p.lastSeenAt >= config.restingDays * 86400000)
      p.state = 'due';
  }
}

export function recordPresentation(records, id, now, config) {
  refresh(records, now, config);
  for (const p of records) {
    if (p.questionId === id) {
      if (p.state === 'unseen') p.state = 'cooling';
      p.lastSeenAt = now;
      p.seenSinceCount = 0;
    } else if (p.state !== 'unseen') p.seenSinceCount += 1;
  }
  refresh(records, now, config);
}

export function recordAnswer(records, question, choiceIndex, now, config) {
  refresh(records, now, config);
  const p = records.find(p => p.questionId === question.id);
  const correct = choiceIndex === question.answerIndex;
  p.correctStreak = correct ? p.correctStreak + 1 : 0;
  p.answerHistory.push({ choiceIndex, correct, timestamp: now });
  if (p.state === 'due' && p.correctStreak >= 2) p.state = 'resting';
  else if (p.state === 'resting' && !correct) p.state = 'due';
}

export function selectNext(records) {
  for (const state of ['unseen', 'due', 'resting']) {
    const candidates = records.filter(p => p.state === state)
      .sort((a, b) => (a.lastSeenAt ?? -1) - (b.lastSeenAt ?? -1));
    if (candidates.length) return candidates[0].questionId;
  }
  return null;
}

export function shuffledIndices(random = Math.random) {
  const result = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

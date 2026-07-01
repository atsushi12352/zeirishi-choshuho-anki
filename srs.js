// 間隔反復（SM-2ベース）＋ランク重み付けのスケジューリングロジック

const RANK_MULTIPLIER = { A: 0.6, B: 1.0, C: 1.4 };
const MASTERED_INTERVAL_DAYS = 14;

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toLocalDateStr(new Date());
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function createInitialState(rank) {
  return {
    rank: rank || "B",
    ease: 2.5,
    interval: 0,
    reps: 0,
    due: todayStr(),
    lastReviewed: null,
  };
}

// grade: "again" | "hard" | "good" | "easy"
function reviewItem(state, grade) {
  const mult = RANK_MULTIPLIER[state.rank] || 1.0;
  const next = { ...state, lastReviewed: todayStr() };

  if (grade === "again") {
    next.reps = 0;
    next.ease = Math.max(1.3, state.ease - 0.2);
    next.interval = Math.max(1, Math.round(1 * mult));
  } else if (grade === "hard") {
    next.reps = state.reps + 1;
    next.ease = Math.max(1.3, state.ease - 0.15);
    const base = state.interval > 0 ? state.interval * 1.2 : 1;
    next.interval = Math.max(1, Math.round(base * mult));
  } else if (grade === "good") {
    next.reps = state.reps + 1;
    if (next.reps === 1) next.interval = Math.max(1, Math.round(1 * mult));
    else if (next.reps === 2) next.interval = Math.max(1, Math.round(6 * mult));
    else next.interval = Math.max(1, Math.round(state.interval * state.ease * mult));
  } else if (grade === "easy") {
    next.reps = state.reps + 1;
    next.ease = state.ease + 0.15;
    const base =
      next.reps === 1 ? 2 : next.reps === 2 ? 7 : state.interval * next.ease;
    next.interval = Math.max(1, Math.round(base * 1.3 * mult));
  }

  next.due = addDays(next.lastReviewed, next.interval);
  return next;
}

function isMastered(state) {
  return state.interval >= MASTERED_INTERVAL_DAYS && state.reps >= 3;
}

function isDue(state, onDateStr) {
  return state.due <= onDateStr;
}

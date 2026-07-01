const STORAGE_KEY = "zeirishi-memory-app-v1";
const RANKS = ["A", "B", "C"];
const GRADE_LABELS = [
  { grade: "again", label: "忘れた" },
  { grade: "hard", label: "曖昧" },
  { grade: "good", label: "できた" },
  { grade: "easy", label: "完璧" },
];

let state = loadState();
let todayQueue = [];
let currentCard = null;
let extraMode = false;
let expandedThemes = new Set();
let expandedNotes = new Set();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return migrateState(JSON.parse(raw));
    } catch (e) {
      /* fall through to fresh state */
    }
  }
  return createFreshState();
}

function createFreshState() {
  const items = {};
  ITEMS.forEach((i) => {
    items[i.id] = createInitialState("B");
  });
  return {
    items,
    itemNotes: {},
    examDate: null,
    today: { date: todayStr(), doneIds: [] },
  };
}

function migrateState(loaded) {
  const fresh = createFreshState();
  loaded.items = loaded.items || {};
  ITEMS.forEach((i) => {
    if (!loaded.items[i.id]) loaded.items[i.id] = fresh.items[i.id];
  });
  loaded.itemNotes = loaded.itemNotes || {};
  if (loaded.examDate === undefined) loaded.examDate = null;
  if (!loaded.today || loaded.today.date !== todayStr()) {
    loaded.today = { date: todayStr(), doneIds: [] };
  }
  return loaded;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function themeName(themeId) {
  return THEMES.find((t) => t.id === themeId).name;
}

function itemById(id) {
  return ITEMS.find((i) => i.id === id);
}

function rankOrder(rank) {
  return RANKS.indexOf(rank);
}

function buildTodayQueue() {
  const today = todayStr();
  const done = new Set(state.today.doneIds);
  let candidates = ITEMS.filter(
    (i) => !done.has(i.id) && isDue(state.items[i.id], today)
  );
  candidates.sort((a, b) => {
    const sa = state.items[a.id];
    const sb = state.items[b.id];
    const overdueA = daysBetween(sa.due, today);
    const overdueB = daysBetween(sb.due, today);
    if (overdueB !== overdueA) return overdueB - overdueA;
    const ra = rankOrder(sa.rank);
    const rb = rankOrder(sb.rank);
    if (ra !== rb) return ra - rb;
    return sa.interval - sb.interval;
  });
  return candidates;
}

function buildExtraQueue() {
  const done = new Set(state.today.doneIds);
  let candidates = ITEMS.filter((i) => !done.has(i.id));
  candidates.sort((a, b) => {
    const sa = state.items[a.id];
    const sb = state.items[b.id];
    if (sa.due !== sb.due) return sa.due < sb.due ? -1 : 1;
    return rankOrder(sa.rank) - rankOrder(sb.rank);
  });
  return candidates;
}

function computeDailyTarget() {
  if (!state.examDate) return null;
  const today = todayStr();
  const daysRemaining = Math.max(1, daysBetween(today, state.examDate));
  const notMastered = ITEMS.filter(
    (i) => !isMastered(state.items[i.id])
  ).length;
  return Math.ceil(notMastered / daysRemaining);
}

function renderHeader() {
  const el = document.getElementById("exam-countdown");
  if (!state.examDate) {
    el.textContent = "";
    return;
  }
  const days = daysBetween(todayStr(), state.examDate);
  if (days < 0) {
    el.textContent = "試験日を過ぎています";
  } else if (days === 0) {
    el.textContent = "本日が試験日です";
  } else {
    el.textContent = `試験まであと ${days} 日`;
  }
}

function renderToday() {
  todayQueue = extraMode ? buildExtraQueue() : buildTodayQueue();
  const summaryEl = document.getElementById("today-summary");
  const target = computeDailyTarget();
  const doneCount = state.today.doneIds.length;
  const requiredQueueLen = extraMode ? null : buildTodayQueue().length;

  let summaryText = `本日の復習: 残り ${requiredQueueLen ?? todayQueue.length} 問`;
  if (target !== null) {
    summaryText += ` ／ 今日の目標 ${target} 問（本日実施 ${doneCount} 問）`;
  } else {
    summaryText += `（本日実施 ${doneCount} 問）`;
  }
  summaryEl.textContent = summaryText;

  const cardArea = document.getElementById("card-area");
  const gradeArea = document.getElementById("grade-buttons");
  const doneArea = document.getElementById("today-done");

  if (todayQueue.length === 0) {
    cardArea.classList.add("hidden");
    gradeArea.classList.add("hidden");
    doneArea.classList.remove("hidden");
    doneArea.innerHTML = extraMode
      ? `<p>これで全項目の復習が完了しました。お疲れ様でした！</p>`
      : `<p>本日の復習は終了です。お疲れ様でした！</p>
         <button id="extra-btn" class="secondary-btn">追加でもう少し復習する</button>`;
    if (!extraMode) {
      document.getElementById("extra-btn").addEventListener("click", () => {
        extraMode = true;
        renderToday();
      });
    }
    currentCard = null;
    return;
  }

  doneArea.classList.add("hidden");
  cardArea.classList.remove("hidden");
  gradeArea.classList.remove("hidden");

  currentCard = todayQueue[0];
  const s = state.items[currentCard.id];
  cardArea.innerHTML = `
    <div class="card-theme">${themeName(currentCard.themeId)}</div>
    <div class="card-title">${currentCard.id} ${currentCard.title}</div>
    <div class="card-rank rank-${s.rank}">${s.rank}ランク</div>
  `;

  gradeArea.innerHTML = "";
  GRADE_LABELS.forEach(({ grade, label }) => {
    const btn = document.createElement("button");
    btn.className = `grade-btn grade-${grade}`;
    btn.textContent = label;
    btn.addEventListener("click", () => handleGrade(grade));
    gradeArea.appendChild(btn);
  });
}

function handleGrade(grade) {
  if (!currentCard) return;
  const id = currentCard.id;
  state.items[id] = reviewItem(state.items[id], grade);
  state.today.doneIds.push(id);
  saveState();
  renderToday();
}

function renderThemes() {
  const container = document.getElementById("themes-list");
  container.innerHTML = "";
  const today = todayStr();

  THEMES.forEach((theme) => {
    const items = ITEMS.filter((i) => i.themeId === theme.id);
    const masteredCount = items.filter((i) =>
      isMastered(state.items[i.id])
    ).length;
    const rate = Math.round((masteredCount / items.length) * 100);

    const card = document.createElement("div");
    card.className = "theme-card";

    const header = document.createElement("div");
    header.className = "theme-header";
    header.innerHTML = `
      <div class="theme-title">テーマ${theme.id}　${theme.name}</div>
      <div class="theme-rate">
        <div class="rate-bar"><div class="rate-fill" style="width:${rate}%"></div></div>
        <span>定着率 ${rate}%</span>
      </div>
    `;
    header.addEventListener("click", () => {
      if (expandedThemes.has(theme.id)) expandedThemes.delete(theme.id);
      else expandedThemes.add(theme.id);
      renderThemes();
    });

    const body = document.createElement("div");
    body.className =
      "theme-body" + (expandedThemes.has(theme.id) ? "" : " hidden");

    const itemList = document.createElement("div");
    itemList.className = "item-list";
    items.forEach((i) => {
      const s = state.items[i.id];
      const dueLabel =
        s.due <= today ? "本日期限" : `次回 ${s.due}`;
      const noteOpen = expandedNotes.has(i.id);
      const hasNote = !!(state.itemNotes[i.id] && state.itemNotes[i.id].trim());

      const block = document.createElement("div");
      block.className = "item-block";

      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <div class="item-info">
          <div class="item-title">${i.id} ${i.title}</div>
          <div class="item-due">${dueLabel}</div>
        </div>
        <div class="item-controls">
          <div class="rank-select" data-item="${i.id}">
            ${RANKS.map(
              (r) =>
                `<button class="rank-opt ${r === s.rank ? "active" : ""} rank-${r}" data-rank="${r}">${r}</button>`
            ).join("")}
          </div>
          <button type="button" class="note-toggle-btn ${hasNote ? "has-note" : ""}">メモ</button>
        </div>
      `;
      row
        .querySelectorAll(".rank-opt")
        .forEach((btn) =>
          btn.addEventListener("click", () => {
            state.items[i.id].rank = btn.dataset.rank;
            saveState();
            renderThemes();
          })
        );
      row.querySelector(".note-toggle-btn").addEventListener("click", () => {
        if (expandedNotes.has(i.id)) expandedNotes.delete(i.id);
        else expandedNotes.add(i.id);
        renderThemes();
      });

      const noteArea = document.createElement("div");
      noteArea.className = "item-note-area" + (noteOpen ? "" : " hidden");
      const noteTextarea = document.createElement("textarea");
      noteTextarea.className = "item-memo";
      noteTextarea.placeholder = "この論点についてのメモ";
      noteTextarea.value = state.itemNotes[i.id] || "";
      let noteTimer = null;
      noteTextarea.addEventListener("input", () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => {
          state.itemNotes[i.id] = noteTextarea.value;
          saveState();
        }, 400);
      });
      noteArea.appendChild(noteTextarea);

      block.appendChild(row);
      block.appendChild(noteArea);
      itemList.appendChild(block);
    });

    body.appendChild(itemList);
    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function renderSettings() {
  const dateInput = document.getElementById("exam-date-input");
  dateInput.value = state.examDate || "";
}

function setupSettingsHandlers() {
  document.getElementById("exam-date-input").addEventListener("change", (e) => {
    state.examDate = e.target.value || null;
    saveState();
    renderHeader();
    renderToday();
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zeirishi-memory-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = migrateState(JSON.parse(reader.result));
        saveState();
        renderAll();
        alert("データを読み込みました。");
      } catch (err) {
        alert("読み込みに失敗しました。ファイル形式を確認してください。");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("すべての学習データを削除して初期化します。よろしいですか？")) {
      state = createFreshState();
      saveState();
      renderAll();
    }
  });
}

function renderAll() {
  renderHeader();
  extraMode = false;
  renderToday();
  renderThemes();
  renderSettings();
}

function setupTabs() {
  const views = {
    today: document.getElementById("view-today"),
    themes: document.getElementById("view-themes"),
    settings: document.getElementById("view-settings"),
  };
  document.querySelectorAll("#tabbar button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#tabbar button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(views).forEach((v) => v.classList.add("hidden"));
      views[btn.dataset.view].classList.remove("hidden");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupSettingsHandlers();
  renderAll();
});

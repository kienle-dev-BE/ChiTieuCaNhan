(() => {
  const STORAGE_KEY = "chi_tieu_personal_v1";
  const MAX_TOP_CATEGORIES = 7;
  const FIRESTORE_COLLECTION = "appData";
  const FIRESTORE_DOC_ID = "main";

  const els = {
    app: document.getElementById("app"),
    modal: document.getElementById("modal"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalFooter: document.getElementById("modalFooter"),
    modalClose: document.getElementById("modalClose"),
    periodPickerWrap: document.getElementById("periodPickerWrap"),
    monthPickerToggle: document.getElementById("monthPickerToggle"),
    monthPickerDisplay: document.getElementById("monthPickerDisplay"),
    monthPickerPanel: document.getElementById("monthPickerPanel"),
    monthPickerGrid: document.getElementById("monthPickerGrid"),
    yearPickerToggle: document.getElementById("yearPickerToggle"),
    yearPickerDisplay: document.getElementById("yearPickerDisplay"),
    yearPickerPanel: document.getElementById("yearPickerPanel"),
    yearPickerRange: document.getElementById("yearPickerRange"),
    yearPickerGrid: document.getElementById("yearPickerGrid"),
    yearPickerPrev: document.getElementById("yearPickerPrev"),
    yearPickerNext: document.getElementById("yearPickerNext"),
    btnQuickAdd: document.getElementById("btnQuickAdd"),
    btnExport: document.getElementById("btnExport"),
    importFile: document.getElementById("importFile"),
    navItems: Array.from(document.querySelectorAll(".nav__item")),
  };

  const $ = (id) => document.getElementById(id);

  const state = {
    view: "dashboard",
    month: "", // YYYY-MM
    data: null,
    linkedFileHandle: null,
    autoSaveToFile: false,
    backendAvailable: false,
    firebaseReady: false,
    firebaseError: "",
    yearPickerViewStart: 0,
    txDisplayMode: "month",
    txSelectedDate: "",
    txDayTimeStart: "06:00",
    txDayTimeEnd: "06:00",
    txWeekStart: "",
    txDrillBackTo: null, // null | "month" | "week"
  };

  let firestoreDb = null;

  const palette = [
    "#7c3aed",
    "#a78bfa",
    "#22c55e",
    "#60a5fa",
    "#f59e0b",
    "#f97316",
    "#ef4444",
    "#06b6d4",
    "#eab308",
    "#ec4899",
  ];

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback (not cryptographically strong, but fine for local IDs).
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function toISODate(d) {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function currentMonthValue() {
    const dt = new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function parseMonthValue(ym) {
    const [y, m] = ym.split("-").map((x) => Number(x));
    return { year: y, month: m };
  }

  function formatMonthOnlyLabel(ym) {
    const { month } = parseMonthValue(ym);
    return String(month);
  }

  function formatYearOnlyLabel(ym) {
    const { year } = parseMonthValue(ym);
    return String(year);
  }

  const MONTH_SHORT_LABELS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
  const YEAR_GRID_SIZE = 12;

  function applyPeriodChange(year, month) {
    state.month = `${year}-${String(month).padStart(2, "0")}`;
    syncTxViewToMonth();
    updatePeriodPickerDisplay();
    renderMonthPickerGrid();
    renderYearPickerGrid();
    closePeriodPanels();
    render();
  }

  function updatePeriodPickerDisplay() {
    if (els.monthPickerDisplay) {
      els.monthPickerDisplay.textContent = formatMonthOnlyLabel(state.month);
    }
    if (els.yearPickerDisplay) {
      els.yearPickerDisplay.textContent = formatYearOnlyLabel(state.month);
    }
    if (els.yearPickerRange) {
      const end = state.yearPickerViewStart + YEAR_GRID_SIZE - 1;
      els.yearPickerRange.textContent = `${state.yearPickerViewStart} – ${end}`;
    }
  }

  function renderMonthPickerGrid() {
    if (!els.monthPickerGrid) return;
    const { month: selectedMonth } = parseMonthValue(state.month);

    els.monthPickerGrid.innerHTML = MONTH_SHORT_LABELS.map((label, idx) => {
      const monthNum = idx + 1;
      const isActive = monthNum === selectedMonth;
      return `
        <button
          class="period-picker__box${isActive ? " is-active" : ""}"
          type="button"
          data-month="${monthNum}"
          aria-label="Tháng ${monthNum}"
          aria-pressed="${isActive}"
        >
          <span class="period-picker__box-label">${label}</span>
          <span class="period-picker__box-num">${monthNum}</span>
        </button>
      `;
    }).join("");
  }

  function renderYearPickerGrid() {
    if (!els.yearPickerGrid) return;
    const { year: selectedYear } = parseMonthValue(state.month);
    const start = state.yearPickerViewStart;

    els.yearPickerGrid.innerHTML = Array.from({ length: YEAR_GRID_SIZE }, (_, idx) => {
      const year = start + idx;
      const isActive = year === selectedYear;
      return `
        <button
          class="period-picker__box period-picker__box--year${isActive ? " is-active" : ""}"
          type="button"
          data-year="${year}"
          aria-label="Năm ${year}"
          aria-pressed="${isActive}"
        >
          <span class="period-picker__box-num">${year}</span>
        </button>
      `;
    }).join("");
  }

  function closePeriodPanels() {
    if (els.monthPickerPanel) els.monthPickerPanel.hidden = true;
    if (els.yearPickerPanel) els.yearPickerPanel.hidden = true;
    els.monthPickerToggle?.setAttribute("aria-expanded", "false");
    els.yearPickerToggle?.setAttribute("aria-expanded", "false");
  }

  function openMonthPickerPanel() {
    closePeriodPanels();
    if (!els.monthPickerPanel) return;
    els.monthPickerPanel.hidden = false;
    els.monthPickerToggle?.setAttribute("aria-expanded", "true");
    renderMonthPickerGrid();
  }

  function openYearPickerPanel() {
    closePeriodPanels();
    if (!els.yearPickerPanel) return;
    const { year } = parseMonthValue(state.month);
    state.yearPickerViewStart = year - Math.floor(YEAR_GRID_SIZE / 2);
    els.yearPickerPanel.hidden = false;
    els.yearPickerToggle?.setAttribute("aria-expanded", "true");
    updatePeriodPickerDisplay();
    renderYearPickerGrid();
  }

  function toggleMonthPickerPanel() {
    if (els.monthPickerPanel?.hidden) openMonthPickerPanel();
    else closePeriodPanels();
  }

  function toggleYearPickerPanel() {
    if (els.yearPickerPanel?.hidden) openYearPickerPanel();
    else closePeriodPanels();
  }

  function setupMonthPicker() {
    if (!els.periodPickerWrap) return;

    els.monthPickerToggle?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMonthPickerPanel();
    });

    els.yearPickerToggle?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleYearPickerPanel();
    });

    els.yearPickerPrev?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.yearPickerViewStart -= YEAR_GRID_SIZE;
      updatePeriodPickerDisplay();
      renderYearPickerGrid();
    });

    els.yearPickerNext?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.yearPickerViewStart += YEAR_GRID_SIZE;
      updatePeriodPickerDisplay();
      renderYearPickerGrid();
    });

    els.monthPickerGrid?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-month]");
      if (!btn) return;
      const monthNum = Number(btn.dataset.month);
      const { year } = parseMonthValue(state.month);
      applyPeriodChange(year, monthNum);
    });

    els.yearPickerGrid?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-year]");
      if (!btn) return;
      const year = Number(btn.dataset.year);
      const { month } = parseMonthValue(state.month);
      applyPeriodChange(year, month);
    });

    document.addEventListener("click", (e) => {
      if (!els.periodPickerWrap.contains(e.target)) closePeriodPanels();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePeriodPanels();
    });
  }

  function monthToRange(ym) {
    const [y, m] = ym.split("-").map((x) => Number(x));
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end };
  }

  function inMonth(dateISO, ym) {
    if (!dateISO) return false;
    const dt = new Date(dateISO + "T00:00:00");
    const { start, end } = monthToRange(ym);
    return dt >= start && dt <= end;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(amount, opts = {}) {
    const { locale, currency } = state.data.settings;
    return new Intl.NumberFormat(locale, {
      style: opts.withCurrency ? "currency" : "decimal",
      currency,
      maximumFractionDigits: 2,
      ...opts,
    }).format(amount);
  }

  function formatAmount(amount, type) {
    const abs = Math.abs(amount);
    const formatted = formatNumber(abs, { withCurrency: true });
    if (type === "expense") return `- ${formatted}`;
    return `+ ${formatted}`;
  }

  function parseMoneyInput(str) {
    const digits = String(str ?? "")
      .replace(/,/g, "")
      .trim();
    if (!digits) return NaN;
    const n = Number(digits);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatMoneyInputValue(raw) {
    const digits = String(raw ?? "")
      .replace(/,/g, "")
      .replace(/\D/g, "");
    if (!digits) return "";
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatMoneyInitial(num) {
    const n = Number(num);
    if (!Number.isFinite(n) || n === 0) return "";
    return formatMoneyInputValue(String(Math.trunc(n)));
  }

  function bindMoneyInput(inputEl) {
    if (!inputEl) return;
    inputEl.type = "text";
    inputEl.inputMode = "numeric";
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.classList.add("input--money");

    inputEl.addEventListener("input", () => {
      const formatted = formatMoneyInputValue(inputEl.value);
      inputEl.value = formatted;
      inputEl.setSelectionRange(formatted.length, formatted.length);
    });
  }

  function readMoneyInput(id) {
    return parseMoneyInput($(id)?.value);
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    queueWriteToLinkedFile();
    queueWriteToBackend();
    queueWriteToFirestore();
  }

  function isFirebaseConfigured() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || typeof cfg !== "object") return false;
    if (!cfg.apiKey || cfg.apiKey === "YOUR_API_KEY") return false;
    if (!cfg.projectId) return false;
    return typeof firebase !== "undefined";
  }

  async function initFirebase() {
    if (!isFirebaseConfigured()) return false;
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      firestoreDb = firebase.firestore();
      await firebase.auth().signInAnonymously();
      state.firebaseReady = true;
      state.firebaseError = "";
      return true;
    } catch (err) {
      state.firebaseReady = false;
      state.firebaseError = err?.message || String(err);
      return false;
    }
  }

  let firestoreWriteChain = Promise.resolve();
  function queueWriteToFirestore() {
    if (!state.firebaseReady || !firestoreDb || !state.data) return;
    const payload = state.data;
    firestoreWriteChain = firestoreWriteChain
      .catch(() => {})
      .then(async () => {
        await firestoreDb
          .collection(FIRESTORE_COLLECTION)
          .doc(FIRESTORE_DOC_ID)
          .set(payload);
      })
      .catch((err) => {
        state.firebaseError = err?.message || String(err);
      });
  }

  async function tryLoadFromFirestore() {
    if (!state.firebaseReady || !firestoreDb) return null;
    try {
      const snap = await firestoreDb
        .collection(FIRESTORE_COLLECTION)
        .doc(FIRESTORE_DOC_ID)
        .get();
      if (!snap.exists) return null;
      const parsed = snap.data();
      if (parsed && parsed.version === 1) return parsed;
      return null;
    } catch (err) {
      state.firebaseError = err?.message || String(err);
      return null;
    }
  }

  async function ensureFirestoreSeed() {
    if (!state.firebaseReady || !firestoreDb) return;
    const seeded = seedData();
    state.data = seeded;
    await firestoreDb.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID).set(seeded);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  }

  let writeChain = Promise.resolve();
  function queueWriteToLinkedFile() {
    if (!state.linkedFileHandle || !state.autoSaveToFile) return;
    const payload = JSON.stringify(state.data, null, 2);
    writeChain = writeChain
      .catch(() => {})
      .then(async () => {
        // File System Access API (Chromium-based browsers).
        if (!state.linkedFileHandle.createWritable) return;
        const writable = await state.linkedFileHandle.createWritable();
        await writable.write(payload);
        await writable.close();
      });
  }

  let backendWriteChain = Promise.resolve();
  function queueWriteToBackend() {
    if (!state.backendAvailable) return;
    const payload = state.data;
    backendWriteChain = backendWriteChain
      .catch(() => {})
      .then(async () => {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Backend write failed");
        return res.json().catch(() => ({}));
      })
      .catch(() => {
        // If backend becomes unavailable, stop trying to write to it.
        state.backendAvailable = false;
      });
  }

  async function tryLoadStaticDataJson() {
    // Load shared database (read-only) from the repo folder: ./data.json
    try {
      const url = new URL("./data.json", window.location.href);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const text = await res.text();
      const parsed = safeParseJson(text);
      if (parsed && parsed.version === 1) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  async function tryLoadFromBackend() {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (!res.ok) return null;
      const parsed = await res.json();
      if (parsed && parsed.version === 1) {
        state.backendAvailable = true;
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  function loadDataFromLocalOrSeed() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParseJson(raw) : null;
    if (parsed && parsed.version === 1) return parsed;
    return seedData();
  }

  async function loadDataAsync() {
    if (isFirebaseConfigured()) {
      const firebaseOk = await initFirebase();
      if (firebaseOk) {
        const fromFirestore = await tryLoadFromFirestore();
        if (fromFirestore) return fromFirestore;
        await ensureFirestoreSeed();
        return state.data;
      }
    }

    const fromBackend = await tryLoadFromBackend();
    if (fromBackend) return fromBackend;

    const fromFile = await tryLoadStaticDataJson();
    if (fromFile) return fromFile;

    return loadDataFromLocalOrSeed();
  }

  function seedData() {
    const ym = currentMonthValue();
    const today = toISODate(new Date());
    const accounts = [
      { id: uuid(), name: "Tiền mặt", startingBalance: 0 },
      { id: uuid(), name: "Ngân hàng", startingBalance: 0 },
    ];

    const categories = [
      { id: uuid(), type: "income", name: "Lương", color: "#7c3aed" },
      { id: uuid(), type: "income", name: "Khác", color: "#a78bfa" },

      { id: uuid(), type: "expense", name: "Ăn uống", color: "#f97316" },
      { id: uuid(), type: "expense", name: "Nhà ở", color: "#60a5fa" },
      { id: uuid(), type: "expense", name: "Đi lại", color: "#06b6d4" },
      { id: uuid(), type: "expense", name: "Điện/Nước", color: "#22c55e" },
      { id: uuid(), type: "expense", name: "Giải trí", color: "#ec4899" },
      { id: uuid(), type: "expense", name: "Sức khỏe", color: "#ef4444" },
      { id: uuid(), type: "expense", name: "Giáo dục", color: "#eab308" },
      { id: uuid(), type: "expense", name: "Tiết kiệm", color: "#a78bfa" },
    ];

    const findCat = (type, name) => categories.find((c) => c.type === type && c.name === name);
    const cash = accounts[0].id;
    const bank = accounts[1].id;

    const tx = [
      {
        id: uuid(),
        type: "income",
        amount: 15000000,
        date: today,
        categoryId: findCat("income", "Lương").id,
        accountId: bank,
        description: "Nhận lương",
        time: "08:30",
        createdAt: Date.now(),
      },
      {
        id: uuid(),
        type: "expense",
        amount: 280000,
        date: today,
        categoryId: findCat("expense", "Ăn uống").id,
        accountId: cash,
        description: "Cà phê & bữa trưa",
        time: "12:15",
        createdAt: Date.now(),
      },
      {
        id: uuid(),
        type: "expense",
        amount: 1250000,
        date: today,
        categoryId: findCat("expense", "Điện/Nước").id,
        accountId: bank,
        description: "Thanh toán điện nước",
        time: "19:40",
      },
    ];

    const budgets = [
      {
        id: uuid(),
        month: ym,
        type: "expense",
        categoryId: findCat("expense", "Ăn uống").id,
        limit: 3500000,
        createdAt: Date.now(),
      },
      {
        id: uuid(),
        month: ym,
        type: "expense",
        categoryId: findCat("expense", "Nhà ở").id,
        limit: 2500000,
        createdAt: Date.now(),
      },
      {
        id: uuid(),
        month: ym,
        type: "expense",
        categoryId: findCat("expense", "Đi lại").id,
        limit: 1000000,
        createdAt: Date.now(),
      },
    ];

    return {
      version: 1,
      settings: {
        locale: "vi-VN",
        currency: "VND",
      },
      accounts,
      categories,
      transactions: tx,
      budgets,
    };
  }

  function byId(list, id) {
    return list.find((x) => x.id === id);
  }

  function categoriesByType(type) {
    return state.data.categories.filter((c) => c.type === type);
  }

  function transactionMatchesFilters(tx, filters) {
    if (filters.type !== "all" && tx.type !== filters.type) return false;
    if (filters.accountId !== "all" && tx.accountId !== filters.accountId) return false;
    if (filters.categoryId !== "all" && tx.categoryId !== filters.categoryId) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const desc = (tx.description || "").toLowerCase();
      if (!desc.includes(s)) return false;
    }
    return true;
  }

  function getMonthTransactions() {
    return state.data.transactions.filter((tx) => inMonth(tx.date, state.month));
  }

  function getWeekTransactions(weekStartISO) {
    const weekDates = new Set(getWeekDates(weekStartISO));
    return state.data.transactions.filter((tx) => weekDates.has(tx.date));
  }

  function getDayViewTransactions(selectedDate) {
    const nextDate = addDaysISO(selectedDate, 1);
    return state.data.transactions.filter((tx) => tx.date === selectedDate || tx.date === nextDate);
  }

  function getTransactionsForView() {
    if (state.txDisplayMode === "week") {
      const weekStart = state.txWeekStart || getMondayOfWeek(defaultTxSelectedDate());
      return getWeekTransactions(weekStart);
    }
    if (state.txDisplayMode === "day") {
      return getDayViewTransactions(state.txSelectedDate || defaultTxSelectedDate());
    }
    return getMonthTransactions();
  }

  function sumTransactions(txs) {
    return txs.reduce((acc, t) => acc + Number(t.amount || 0), 0);
  }

  function accountBalance(accountId) {
    const acc = byId(state.data.accounts, accountId);
    if (!acc) return 0;
    let delta = 0;
    for (const tx of state.data.transactions) {
      if (tx.accountId !== accountId) continue;
      const amt = Number(tx.amount || 0);
      delta += tx.type === "income" ? amt : -amt;
    }
    return Number(acc.startingBalance || 0) + delta;
  }

  function spentByCategory(monthTxs, type) {
    const map = new Map();
    for (const tx of monthTxs) {
      if (tx.type !== type) continue;
      const key = tx.categoryId;
      map.set(key, (map.get(key) || 0) + Number(tx.amount || 0));
    }
    return map;
  }

  function showModal({ title, bodyHtml, footerHtml }) {
    els.modalTitle.textContent = title || "Tiêu đề";
    els.modalBody.innerHTML = bodyHtml || "";
    els.modalFooter.innerHTML = footerHtml || "";
    els.modal.hidden = false;
    els.modalBackdrop.hidden = false;
    els.modalBackdrop.scrollTop = 0;
    // Focus close for accessibility
    els.modalClose.focus();
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modalBackdrop.hidden = true;
    els.modalBody.innerHTML = "";
    els.modalFooter.innerHTML = "";
  }

  function setupModalHandlers() {
    els.modalClose.addEventListener("click", closeModal);
    els.modalBackdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modal.hidden) closeModal();
    });
  }

  function setActiveView(view) {
    state.view = view;
    for (const item of els.navItems) {
      item.classList.toggle("is-active", item.dataset.view === view);
    }
    render();
  }

  function getCategoryName(id) {
    const c = byId(state.data.categories, id);
    return c ? c.name : "Không rõ";
  }

  function getAccountName(id) {
    const a = byId(state.data.accounts, id);
    return a ? a.name : "Không rõ";
  }

  function renderDashboard() {
    const monthTxs = getMonthTransactions();
    const incomes = monthTxs.filter((t) => t.type === "income");
    const expenses = monthTxs.filter((t) => t.type === "expense");

    const totalIncome = sumTransactions(incomes);
    const totalExpense = sumTransactions(expenses);
    const net = totalIncome - totalExpense;

    const expenseByCat = spentByCategory(monthTxs, "expense");
    const topExpenseCats = [...expenseByCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOP_CATEGORIES);

    const budgetsForMonth = state.data.budgets.filter((b) => b.month === state.month);
    const budgetRows = budgetsForMonth
      .map((b) => {
        const spent = sumTransactions(
          monthTxs.filter((t) => t.type === b.type && t.categoryId === b.categoryId)
        );
        return { budget: b, spent };
      })
      .sort((a, b) => b.spent - a.spent);

    const accountCards = state.data.accounts.map((acc) => {
      const bal = accountBalance(acc.id);
      return { acc, bal };
    });

    const topExpenseListHtml =
      topExpenseCats.length === 0
        ? `<div class="muted">Chưa có dữ liệu chi tiêu cho tháng này.</div>`
        : topExpenseCats
            .map(([catId, amount]) => {
              const cat = byId(state.data.categories, catId);
              const color = cat ? cat.color : "#7c3aed";
              return `
                <div class="card" style="padding:12px; display:flex; align-items:flex-start; gap:12px;">
                  <div class="pill" style="border-color: rgba(255,255,255,0.14); background: rgba(255,255,255,0.06);">
                    <span aria-hidden="true" style="width:10px; height:10px; border-radius:999px; display:inline-block; background:${color};"></span>
                    ${escapeHtml(cat ? cat.name : "Không rõ")}
                  </div>
                  <div style="margin-left:auto; font-weight:900;">
                    ${escapeHtml(formatNumber(amount, { withCurrency: true }))}
                  </div>
                </div>
              `;
            })
            .join("");

    const budgetsHtml =
      budgetRows.length === 0
        ? `<div class="muted">Chưa có ngân sách cho tháng ${escapeHtml(state.month)}. Bạn có thể thêm ở tab "Ngân sách".</div>`
        : `<div class="grid-2">${budgetRows
            .slice(0, 6)
            .map(({ budget, spent }) => {
              const cat = byId(state.data.categories, budget.categoryId);
              const color = cat ? cat.color : "#7c3aed";
              const limit = Number(budget.limit || 0);
              const pct = limit > 0 ? Math.min(120, (spent / limit) * 100) : 0;
              const over = limit > 0 && spent > limit;
              return `
                <div class="card">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div class="pill" style="color: var(--text); border-color: rgba(255,255,255,0.14);">
                      <span aria-hidden="true" style="width:10px; height:10px; border-radius:999px; display:inline-block; background:${color};"></span>
                      ${escapeHtml(cat ? cat.name : "Không rõ")}
                    </div>
                    <div class="muted" style="font-weight:800;">
                      ${over ? `<span style="color: rgba(239,68,68,0.95);">Vượt</span>` : "OK"}
                    </div>
                  </div>
                  <div style="margin-top:10px; display:flex; align-items:flex-end; justify-content:space-between; gap:10px;">
                    <div>
                      <div class="card__title">Đã chi</div>
                      <div style="font-weight:900; font-size:18px;">${escapeHtml(formatNumber(spent, { withCurrency: true }))}</div>
                    </div>
                    <div style="text-align:right;">
                      <div class="card__title">Giới hạn</div>
                      <div style="font-weight:900; font-size:18px;">${escapeHtml(formatNumber(limit, { withCurrency: true }))}</div>
                    </div>
                  </div>
                  <div class="bar" style="margin-top:10px;">
                    <div class="bar__fill" style="width:${pct}%; background: ${over ? "linear-gradient(90deg, rgba(239,68,68,0.95), rgba(245,158,11,0.85))" : "linear-gradient(90deg, rgba(124,58,237,0.9), rgba(167,139,250,0.8))"};"></div>
                  </div>
                  <div class="muted" style="font-size:12px; margin-top:8px;">
                    ${escapeHtml(String(Math.round(pct)))}% sử dụng
                  </div>
                </div>
              `;
            })
            .join("")}</div>
        `;

    const chartCanvasId = "chartExpenseTopCategories";
    const chartHtml = `
      <div class="card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div>
            <div class="card__title">Top chi tiêu theo danh mục</div>
            <div style="margin-top:6px; font-weight:900;">${escapeHtml(state.month)}</div>
          </div>
          <div class="pill">Số liệu theo giao dịch tháng</div>
        </div>
        <div style="margin-top:12px;">
          <canvas id="${chartCanvasId}" height="130"></canvas>
        </div>
      </div>
    `;

    els.app.innerHTML = `
      <div class="grid-3">
        <div class="card">
          <div class="card__title">Tổng thu</div>
          <div class="card__value" style="color: rgba(34,197,94,0.95);">${escapeHtml(
            formatNumber(totalIncome, { withCurrency: true })
          )}</div>
        </div>
        <div class="card">
          <div class="card__title">Tổng chi</div>
          <div class="card__value" style="color: rgba(239,68,68,0.95);">${escapeHtml(
            formatNumber(totalExpense, { withCurrency: true })
          )}</div>
        </div>
        <div class="card">
          <div class="card__title">Chênh lệch</div>
          <div class="card__value" style="color: ${
            net >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)"
          };">${escapeHtml(formatNumber(net, { withCurrency: true }))}</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">
            ${net >= 0 ? "Bạn đang dương" : "Bạn đang âm"}
          </div>
        </div>
      </div>

      <div class="split" style="align-items:start;">
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${chartHtml}
          <div class="card">
            <div class="card__title">Số dư theo tài khoản</div>
            <div style="margin-top:10px;" class="grid-2">
              ${accountCards
                .map(({ acc, bal }) => {
                  const balColor = bal >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
                  return `
                    <div class="card" style="background: rgba(255,255,255,0.04);">
                      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                        <div class="pill">${escapeHtml(acc.name)}</div>
                        <div style="font-weight:900; color:${balColor};">${escapeHtml(
                          formatNumber(bal, { withCurrency: true })
                        )}</div>
                      </div>
                      <div class="muted" style="font-size:12px; margin-top:8px;">
                        Tính từ giao dịch + số dư ban đầu
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px;">
          <div class="card">
            <div class="card__title">Chi tiêu nổi bật</div>
            <div class="muted" style="font-size:12px; margin-top:6px;">Tự động lấy danh mục có số tiền cao nhất.</div>
            <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              ${topExpenseListHtml}
            </div>
          </div>
          ${budgetsHtml}
        </div>
      </div>
    `;

    // Render chart after DOM mount
    requestAnimationFrame(() => {
      try {
        const ctx = document.getElementById(chartCanvasId);
        if (!ctx || !window.Chart) return;
        const labels = topExpenseCats.map(([catId]) => {
          const cat = byId(state.data.categories, catId);
          return cat ? cat.name : "Không rõ";
        });
        const values = topExpenseCats.map(([, amount]) => amount);
        const colors = topExpenseCats.map(([catId]) => {
          const cat = byId(state.data.categories, catId);
          return cat ? cat.color : "#7c3aed";
        });

        // If chart already exists, update it.
        if (window.__expenseChart) window.__expenseChart.destroy();

        window.__expenseChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Chi tiêu",
                data: values,
                backgroundColor: colors.map((c) => `${c}CC`),
                borderColor: colors.map((c) => c),
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const v = context.parsed.y;
                    return ` ${formatNumber(v, { withCurrency: true })}`;
                  },
                },
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (value) => formatNumber(value, { withCurrency: true }),
                },
              },
            },
          },
        });
      } catch {
        // Chart rendering can fail if CDN not available.
      }
    });
  }

  function getTxTime(tx) {
    if (tx.time && /^\d{2}:\d{2}$/.test(tx.time)) return tx.time;
    if (tx.createdAt) {
      const d = new Date(tx.createdAt);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return "12:00";
  }

  function timeToMinutes(timeStr) {
    const [h, m] = String(timeStr || "00:00").split(":").map((x) => Number(x));
    return h * 60 + m;
  }

  function minutesToTime(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  function addDaysISO(dateISO, days) {
    const dt = new Date(dateISO + "T00:00:00");
    dt.setDate(dt.getDate() + days);
    return toISODate(dt);
  }

  function defaultTxSelectedDate() {
    if (state.txSelectedDate && inMonth(state.txSelectedDate, state.month)) {
      return state.txSelectedDate;
    }
    const today = toISODate(new Date());
    return inMonth(today, state.month) ? today : `${state.month}-01`;
  }

  function getMondayOfWeek(dateISO) {
    const dt = new Date(dateISO + "T00:00:00");
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    return toISODate(dt);
  }

  function getWeekDates(weekStartISO) {
    return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i));
  }

  function txInDayWindow(tx, selectedDate, startTime, endTime) {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const txMin = timeToMinutes(getTxTime(tx));
    const nextDate = addDaysISO(selectedDate, 1);

    if (endMin <= startMin) {
      if (tx.date === selectedDate && txMin >= startMin) return true;
      if (tx.date === nextDate && txMin < endMin) return true;
      return false;
    }
    if (tx.date !== selectedDate) return false;
    return txMin >= startMin && txMin < endMin;
  }

  function generateTimeSlots(startTime, endTime) {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const slots = [];
    if (endMin <= startMin) {
      for (let m = startMin; m < 1440; m += 60) slots.push({ label: minutesToTime(m), min: m, dayOffset: 0 });
      for (let m = 0; m < endMin; m += 60) slots.push({ label: minutesToTime(m), min: m, dayOffset: 1 });
    } else {
      for (let m = startMin; m < endMin; m += 60) slots.push({ label: minutesToTime(m), min: m, dayOffset: 0 });
    }
    return slots;
  }

  function getTxSortKey(tx, selectedDate) {
    const dayOffset = tx.date === selectedDate ? 0 : 1;
    return dayOffset * 1440 + timeToMinutes(getTxTime(tx));
  }

  function sumExpense(txs) {
    return txs.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  function getTxFiltersFromDom() {
    return {
      type: $("fltType")?.value || "all",
      accountId: $("fltAccount")?.value || "all",
      categoryId: $("fltCategory")?.value || "all",
      search: ($("fltSearch")?.value || "").trim(),
    };
  }

  function filterTransactions(txs, filters) {
    return txs.filter((t) => transactionMatchesFilters(t, filters));
  }

  function txMiniHtml(tx, compact = false) {
    const cat = byId(state.data.categories, tx.categoryId);
    const amount = Number(tx.amount || 0);
    const color = tx.type === "income" ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
    const time = getTxTime(tx);
    return `
      <div class="tx-mini${compact ? " tx-mini--compact" : ""}" data-tx-id="${escapeHtml(tx.id)}">
        <div class="tx-mini__top">
          <span class="tx-mini__time">${escapeHtml(time)}</span>
          <span class="tx-mini__amount" style="color:${color};">${escapeHtml(formatNumber(amount, { withCurrency: true }))}</span>
        </div>
        <div class="tx-mini__desc">${escapeHtml(tx.description || cat?.name || "Giao dịch")}</div>
        <div class="row-actions tx-mini__actions">
          <button class="link-btn" type="button" data-action="edit-tx" data-id="${escapeHtml(tx.id)}">Sửa</button>
          <button class="link-btn link-btn--danger" type="button" data-action="delete-tx" data-id="${escapeHtml(tx.id)}">Xóa</button>
        </div>
      </div>
    `;
  }

  function getDaysInMonth(year, month) {
    if (!year || !month) return 31;
    return new Date(year, month, 0).getDate();
  }

  function getDaysInSelectedMonth(ym = state.month) {
    const { year, month } = parseMonthValue(ym);
    return getDaysInMonth(year, month);
  }

  function parseDateISO(dateISO) {
    const [year, month, day] = String(dateISO || "")
      .split("-")
      .map((x) => Number(x));
    return {
      year: year || new Date().getFullYear(),
      month: month || new Date().getMonth() + 1,
      day: day || new Date().getDate(),
    };
  }

  function toDateISOParts({ year, month, day }) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function clampDayInMonth(year, month, day) {
    const maxDay = getDaysInMonth(year, month);
    return Math.min(Math.max(Number(day) || 1, 1), maxDay);
  }

  function renderModalDatePickerHTML(initialDateISO) {
    const { year, month, day } = parseDateISO(initialDateISO);
    const safeDay = clampDayInMonth(year, month, day);
    const iso = toDateISOParts({ year, month, day: safeDay });

    return `
      <div class="tx-modal-date" id="txModalDate">
        <input type="hidden" id="txDate" value="${escapeHtml(iso)}" />
        <div class="period-picker period-picker--modal">
          <div class="period-picker__group">
            <button
              class="period-picker__display period-picker__display--day"
              id="txModalDayToggle"
              type="button"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <span class="period-picker__label">Ngày</span>
              <span class="period-picker__value" id="txModalDayDisplay">${safeDay}</span>
            </button>
            <div class="period-picker__panel period-picker__panel--day" id="txModalDayPanel" hidden>
              <div class="tx-day-picker__panel-title" id="txModalDayPanelTitle"></div>
              <div class="tx-day-picker__weekdays">
                <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
              </div>
              <div class="tx-day-picker__grid" id="txModalDayGrid"></div>
            </div>
          </div>

          <div class="period-picker__group">
            <button
              class="period-picker__display"
              id="txModalMonthToggle"
              type="button"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <span class="period-picker__label">Tháng</span>
              <span class="period-picker__value" id="txModalMonthDisplay">${month}</span>
            </button>
            <div class="period-picker__panel" id="txModalMonthPanel" hidden>
              <div class="period-picker__grid period-picker__grid--months" id="txModalMonthGrid"></div>
            </div>
          </div>

          <div class="period-picker__group">
            <button
              class="period-picker__display period-picker__display--year"
              id="txModalYearToggle"
              type="button"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <span class="period-picker__label">Năm</span>
              <span class="period-picker__value" id="txModalYearDisplay">${year}</span>
            </button>
            <div class="period-picker__panel period-picker__panel--year" id="txModalYearPanel" hidden>
              <div class="period-picker__header">
                <button class="period-picker__nav" id="txModalYearPrev" type="button" aria-label="Nhóm năm trước">‹</button>
                <span class="period-picker__range" id="txModalYearRange">—</span>
                <button class="period-picker__nav" id="txModalYearNext" type="button" aria-label="Nhóm năm sau">›</button>
              </div>
              <div class="period-picker__grid period-picker__grid--years" id="txModalYearGrid"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindModalDatePicker(initialDateISO) {
    const root = $("txModalDate");
    const hiddenInput = $("txDate");
    if (!root || !hiddenInput) return;

    const picker = parseDateISO(initialDateISO);
    picker.day = clampDayInMonth(picker.year, picker.month, picker.day);
    let yearViewStart = picker.year - Math.floor(YEAR_GRID_SIZE / 2);

    const dayPanel = $("txModalDayPanel");
    const monthPanel = $("txModalMonthPanel");
    const yearPanel = $("txModalYearPanel");
    const panels = [dayPanel, monthPanel, yearPanel];

    const closePanels = (except) => {
      for (const panel of panels) {
        if (!panel || panel === except) continue;
        panel.hidden = true;
      }
      $("txModalDayToggle")?.setAttribute("aria-expanded", "false");
      $("txModalMonthToggle")?.setAttribute("aria-expanded", "false");
      $("txModalYearToggle")?.setAttribute("aria-expanded", "false");
    };

    const syncHidden = () => {
      picker.day = clampDayInMonth(picker.year, picker.month, picker.day);
      hiddenInput.value = toDateISOParts(picker);
      if ($("txModalDayDisplay")) $("txModalDayDisplay").textContent = String(picker.day);
      if ($("txModalMonthDisplay")) $("txModalMonthDisplay").textContent = String(picker.month);
      if ($("txModalYearDisplay")) $("txModalYearDisplay").textContent = String(picker.year);
    };

    const renderDayGrid = () => {
      const grid = $("txModalDayGrid");
      const title = $("txModalDayPanelTitle");
      if (!grid) return;

      const daysInMonth = getDaysInMonth(picker.year, picker.month);
      const selectedDay = clampDayInMonth(picker.year, picker.month, picker.day);
      const firstDay = new Date(picker.year, picker.month - 1, 1);
      const startPad = (firstDay.getDay() + 6) % 7;

      if (title) {
        title.textContent = `Tháng ${picker.month}/${picker.year} · ${daysInMonth} ngày`;
      }

      let dayCells = "";
      for (let i = 0; i < startPad; i++) {
        dayCells += `<div class="tx-day-picker__box tx-day-picker__box--empty" aria-hidden="true"></div>`;
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const isActive = day === selectedDay;
        dayCells += `
          <button
            type="button"
            class="tx-day-picker__box${isActive ? " is-active" : ""}"
            data-tx-modal-day="${day}"
            aria-label="Ngày ${day}"
            aria-pressed="${isActive}"
          >${day}</button>
        `;
      }
      grid.innerHTML = dayCells;
    };

    const renderMonthGrid = () => {
      const grid = $("txModalMonthGrid");
      if (!grid) return;
      grid.innerHTML = MONTH_SHORT_LABELS.map((label, idx) => {
        const monthNum = idx + 1;
        const isActive = monthNum === picker.month;
        return `
          <button
            class="period-picker__box${isActive ? " is-active" : ""}"
            type="button"
            data-tx-modal-month="${monthNum}"
            aria-label="Tháng ${monthNum}"
            aria-pressed="${isActive}"
          >
            <span class="period-picker__box-label">${label}</span>
            <span class="period-picker__box-num">${monthNum}</span>
          </button>
        `;
      }).join("");
    };

    const renderYearGrid = () => {
      const grid = $("txModalYearGrid");
      const range = $("txModalYearRange");
      if (!grid) return;

      const end = yearViewStart + YEAR_GRID_SIZE - 1;
      if (range) range.textContent = `${yearViewStart} – ${end}`;

      grid.innerHTML = Array.from({ length: YEAR_GRID_SIZE }, (_, idx) => {
        const year = yearViewStart + idx;
        const isActive = year === picker.year;
        return `
          <button
            class="period-picker__box period-picker__box--year${isActive ? " is-active" : ""}"
            type="button"
            data-tx-modal-year="${year}"
            aria-label="Năm ${year}"
            aria-pressed="${isActive}"
          >
            <span class="period-picker__box-num">${year}</span>
          </button>
        `;
      }).join("");
    };

    const refresh = () => {
      syncHidden();
      renderDayGrid();
      renderMonthGrid();
      renderYearGrid();
    };

    $("txModalDayToggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = dayPanel?.hidden;
      closePanels(willOpen ? dayPanel : null);
      if (dayPanel && willOpen) {
        dayPanel.hidden = false;
        $("txModalDayToggle")?.setAttribute("aria-expanded", "true");
        renderDayGrid();
      }
    });

    $("txModalMonthToggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = monthPanel?.hidden;
      closePanels(willOpen ? monthPanel : null);
      if (monthPanel && willOpen) {
        monthPanel.hidden = false;
        $("txModalMonthToggle")?.setAttribute("aria-expanded", "true");
        renderMonthGrid();
      }
    });

    $("txModalYearToggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = yearPanel?.hidden;
      closePanels(willOpen ? yearPanel : null);
      if (yearPanel && willOpen) {
        yearViewStart = picker.year - Math.floor(YEAR_GRID_SIZE / 2);
        yearPanel.hidden = false;
        $("txModalYearToggle")?.setAttribute("aria-expanded", "true");
        renderYearGrid();
      }
    });

    $("txModalYearPrev")?.addEventListener("click", (e) => {
      e.stopPropagation();
      yearViewStart -= YEAR_GRID_SIZE;
      renderYearGrid();
    });

    $("txModalYearNext")?.addEventListener("click", (e) => {
      e.stopPropagation();
      yearViewStart += YEAR_GRID_SIZE;
      renderYearGrid();
    });

    $("txModalDayGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tx-modal-day]");
      if (!btn) return;
      picker.day = Number(btn.dataset.txModalDay);
      refresh();
      closePanels();
    });

    $("txModalMonthGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tx-modal-month]");
      if (!btn) return;
      picker.month = Number(btn.dataset.txModalMonth);
      refresh();
      closePanels();
    });

    $("txModalYearGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tx-modal-year]");
      if (!btn) return;
      picker.year = Number(btn.dataset.txModalYear);
      refresh();
      closePanels();
    });

    const onDocClick = (e) => {
      if (!root.isConnected) {
        document.removeEventListener("click", onDocClick);
        return;
      }
      if (e.target.closest(".period-picker__panel") || e.target.closest(".period-picker__display")) return;
      closePanels();
    };
    document.addEventListener("click", onDocClick);

    refresh();
  }

  function syncTxSelectedDateToMonth() {
    const maxDay = getDaysInSelectedMonth();
    if (!state.txSelectedDate || !state.txSelectedDate.startsWith(`${state.month}-`)) {
      const today = toISODate(new Date());
      if (today.startsWith(`${state.month}-`)) {
        state.txSelectedDate = today;
        return;
      }
      const prevDay = state.txSelectedDate ? Number(state.txSelectedDate.slice(8, 10)) : 1;
      const day = Math.min(Math.max(prevDay, 1), maxDay);
      state.txSelectedDate = `${state.month}-${String(day).padStart(2, "0")}`;
      return;
    }
    const day = Number(state.txSelectedDate.slice(8, 10));
    if (day > maxDay) {
      state.txSelectedDate = `${state.month}-${String(maxDay).padStart(2, "0")}`;
    }
  }

  function syncTxViewToMonth() {
    syncTxSelectedDateToMonth();
    state.txWeekStart = getMondayOfWeek(defaultTxSelectedDate());
  }

  function renderTxDayPicker(selectedDate) {
    const [y, m] = state.month.split("-").map(Number);
    const daysInMonth = getDaysInSelectedMonth();
    const selectedDay = Math.min(Number(selectedDate.slice(8, 10)) || 1, daysInMonth);
    const firstDay = new Date(y, m - 1, 1);
    const startPad = (firstDay.getDay() + 6) % 7;

    let dayCells = "";
    for (let i = 0; i < startPad; i++) {
      dayCells += `<div class="tx-day-picker__box tx-day-picker__box--empty" aria-hidden="true"></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const isActive = day === selectedDay;
      dayCells += `
        <button
          type="button"
          class="tx-day-picker__box${isActive ? " is-active" : ""}"
          data-action="pick-day"
          data-day="${day}"
          aria-label="Ngày ${day}"
          aria-pressed="${isActive}"
        >${day}</button>
      `;
    }

    return `
      <div class="tx-day-picker" id="txDayPicker">
        <button type="button" class="tx-day-picker__display" id="txDayPickerToggle" aria-haspopup="true" aria-expanded="false">
          <span class="tx-day-picker__label">Ngày</span>
          <span class="tx-day-picker__value">${selectedDay}</span>
        </button>
        <div class="tx-day-picker__panel" id="txDayPickerPanel" hidden>
          <div class="tx-day-picker__panel-title">Tháng ${m}/${y} · ${daysInMonth} ngày</div>
          <div class="tx-day-picker__weekdays">
            <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
          </div>
          <div class="tx-day-picker__grid">${dayCells}</div>
        </div>
      </div>
    `;
  }

  function renderTxDayView(txs, filters) {
    const selectedDate = state.txSelectedDate || defaultTxSelectedDate();
    const startTime = state.txDayTimeStart || "06:00";
    const endTime = state.txDayTimeEnd || "06:00";
    const dayTxs = filterTransactions(
      txs.filter((t) => txInDayWindow(t, selectedDate, startTime, endTime)),
      filters
    ).sort((a, b) => getTxSortKey(a, selectedDate) - getTxSortKey(b, selectedDate));

    const slots = generateTimeSlots(startTime, endTime);
    const slotMap = new Map(slots.map((s) => [`${s.dayOffset}-${s.min}`, []]));
    for (const tx of dayTxs) {
      const txMin = timeToMinutes(getTxTime(tx));
      const dayOffset = tx.date === selectedDate ? 0 : 1;
      const slotMin = Math.floor(txMin / 60) * 60;
      const key = `${dayOffset}-${slotMin}`;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key).push(tx);
    }

    const backLabels = { month: "← Quay lại lịch tháng", week: "← Quay lại tuần" };
    const backBtn = state.txDrillBackTo
      ? `<button class="btn btn--secondary tx-back-btn" type="button" id="txBackDrill">${backLabels[state.txDrillBackTo] || "← Quay lại"}</button>`
      : "";

    const rows = slots
      .map((slot) => {
        const key = `${slot.dayOffset}-${slot.min}`;
        const items = slotMap.get(key) || [];
        const dayLabel = slot.dayOffset === 1 ? `<span class="tx-day-slot__next">+1 ngày</span>` : "";
        return `
          <div class="tx-day-row">
            <div class="tx-day-row__time">
              ${escapeHtml(slot.label)}${dayLabel}
            </div>
            <div class="tx-day-row__content">
              ${
                items.length
                  ? items.map((tx) => txMiniHtml(tx)).join("")
                  : `<div class="tx-day-row__empty"></div>`
              }
            </div>
          </div>
        `;
      })
      .join("");

    return `
      ${backBtn}
      <div class="tx-day-controls card">
        <div class="tx-day-controls__row">
          ${renderTxDayPicker(selectedDate)}
          <div class="tx-day-controls__times">
            <div class="tx-day-controls__time-field">
              <div class="label">Bắt đầu</div>
              <input id="txDayStart" class="input" type="time" value="${escapeHtml(startTime)}" />
            </div>
            <div class="tx-day-controls__time-field">
              <div class="label">Kết thúc</div>
              <input id="txDayEnd" class="input" type="time" value="${escapeHtml(endTime)}" />
            </div>
          </div>
        </div>
        <div class="muted tx-day-controls__hint">Mặc định: 06:00 hôm nay → 06:00 hôm sau (nếu kết thúc ≤ bắt đầu)</div>
      </div>
      <div class="tx-day-timeline">
        ${rows || `<div class="muted">Không có giao dịch trong khung thời gian này.</div>`}
      </div>
    `;
  }

  function renderTxWeekView(txs, filters) {
    const weekStart = state.txWeekStart || getMondayOfWeek(defaultTxSelectedDate());
    const weekDates = getWeekDates(weekStart);
    const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

    const columns = weekDates
      .map((dateISO, idx) => {
        const dayTxs = filterTransactions(
          txs.filter((t) => t.date === dateISO),
          filters
        ).sort((a, b) => timeToMinutes(getTxTime(a)) - timeToMinutes(getTxTime(b)));
        const dayInMonth = inMonth(dateISO, state.month);
        return `
          <div
            class="tx-week-col tx-week-col--clickable${dayInMonth ? "" : " tx-week-col--outside"}"
            data-action="view-day"
            data-date="${escapeHtml(dateISO)}"
            data-drill-from="week"
            role="button"
            tabindex="0"
            aria-label="Xem giao dịch ngày ${escapeHtml(dateISO)}"
          >
            <div class="tx-week-col__head">
              <div class="tx-week-col__name">${dayNames[idx]}</div>
              <div class="tx-week-col__date">${escapeHtml(dateISO.slice(8, 10))}/${escapeHtml(dateISO.slice(5, 7))}</div>
            </div>
            <div class="tx-week-col__body">
              ${
                dayTxs.length
                  ? dayTxs.map((tx) => txMiniHtml(tx, true)).join("")
                  : `<div class="muted" style="font-size:12px; padding:8px;">Trống</div>`
              }
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="tx-week-nav card">
        <button class="btn btn--secondary" type="button" id="txWeekPrev">← Tuần trước</button>
        <div class="tx-week-nav__label">
          <div class="tx-week-nav__range">${escapeHtml(weekDates[0])} → ${escapeHtml(weekDates[6])}</div>
          <div class="muted" style="font-size:12px; margin-top:4px;">Tháng đang chọn: ${escapeHtml(state.month)}</div>
        </div>
        <button class="btn btn--secondary" type="button" id="txWeekNext">Tuần sau →</button>
      </div>
      <div class="tx-week-grid">${columns}</div>
    `;
  }

  function renderTxMonthView(txs, filters) {
    const [y, m] = state.month.split("-").map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startPad = (firstDay.getDay() + 6) % 7;
    const cells = [];

    for (let i = 0; i < startPad; i++) cells.push({ empty: true });
    for (let day = 1; day <= daysInMonth; day++) {
      const dateISO = `${state.month}-${String(day).padStart(2, "0")}`;
      const dayTxs = filterTransactions(
        txs.filter((t) => t.date === dateISO),
        filters
      );
      cells.push({ empty: false, dateISO, day, txs: dayTxs });
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true });

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const head = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
      .map((d) => `<div class="tx-cal-head">${d}</div>`)
      .join("");

    const body = weeks
      .map((week) => {
        return `<div class="tx-cal-row">${week
          .map((cell) => {
            if (cell.empty) return `<div class="tx-cal-cell tx-cal-cell--empty"></div>`;
            const expenses = cell.txs.filter((t) => t.type === "expense");
            const totalExpense = sumExpense(cell.txs);
            const showTxs = expenses.slice(0, 2);
            const hasMore = expenses.length > 2;
            return `
              <button class="tx-cal-cell" type="button" data-action="view-day" data-drill-from="month" data-date="${escapeHtml(cell.dateISO)}">
                <div class="tx-cal-cell__head">
                  <span class="tx-cal-cell__day">${cell.day}</span>
                  ${
                    totalExpense > 0
                      ? `<span class="tx-cal-cell__total">${escapeHtml(formatNumber(totalExpense, { withCurrency: true }))}</span>`
                      : `<span class="tx-cal-cell__total tx-cal-cell__total--zero">—</span>`
                  }
                </div>
                <div class="tx-cal-cell__list">
                  ${showTxs
                    .map((tx) => {
                      const cat = byId(state.data.categories, tx.categoryId);
                      return `<div class="tx-cal-item">${escapeHtml(formatNumber(Number(tx.amount || 0), { withCurrency: true }))} · ${escapeHtml(tx.description || cat?.name || "Chi")}</div>`;
                    })
                    .join("")}
                  ${hasMore ? `<div class="tx-cal-more">...</div>` : ""}
                </div>
              </button>
            `;
          })
          .join("")}</div>`;
      })
      .join("");

    return `
      <div class="tx-calendar card">
        <div class="tx-cal-head-row">${head}</div>
        ${body}
      </div>
    `;
  }

  function renderTxViewContent(txs, filters) {
    if (state.txDisplayMode === "day") return renderTxDayView(txs, filters);
    if (state.txDisplayMode === "week") return renderTxWeekView(txs, filters);
    return renderTxMonthView(txs, filters);
  }

  function setupTxDayPickerGlobal() {
    document.addEventListener("click", (e) => {
      if (state.view !== "transactions" || state.txDisplayMode !== "day") return;
      const picker = $("txDayPicker");
      const panel = $("txDayPickerPanel");
      if (!picker || !panel || panel.hidden) return;
      if (picker.contains(e.target)) return;
      panel.hidden = true;
      $("txDayPickerToggle")?.setAttribute("aria-expanded", "false");
    });
  }

  function goToDayViewFromDrill(dateISO, drillFrom) {
    state.txDisplayMode = "day";
    state.txSelectedDate = dateISO;
    state.txDrillBackTo = drillFrom;

    const ym = dateISO.slice(0, 7);
    if (ym !== state.month) {
      state.month = ym;
      updatePeriodPickerDisplay();
      renderMonthPickerGrid();
      renderYearPickerGrid();
    }
    render();
  }

  function bindTxViewInnerEvents(monthTxs, rerenderView) {
    $("txBackDrill")?.addEventListener("click", () => {
      const backTo = state.txDrillBackTo;
      state.txDrillBackTo = null;
      if (backTo === "week") {
        state.txDisplayMode = "week";
      } else if (backTo === "month") {
        state.txDisplayMode = "month";
      }
      render();
    });

    $("txDayPickerToggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const panel = $("txDayPickerPanel");
      if (!panel) return;
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      $("txDayPickerToggle")?.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    $("txDayStart")?.addEventListener("change", (e) => {
      state.txDayTimeStart = e.target.value || "06:00";
      rerenderView();
    });
    $("txDayEnd")?.addEventListener("change", (e) => {
      state.txDayTimeEnd = e.target.value || "06:00";
      rerenderView();
    });

    $("txWeekPrev")?.addEventListener("click", () => {
      state.txWeekStart = addDaysISO(state.txWeekStart || getMondayOfWeek(defaultTxSelectedDate()), -7);
      rerenderView();
    });
    $("txWeekNext")?.addEventListener("click", () => {
      state.txWeekStart = addDaysISO(state.txWeekStart || getMondayOfWeek(defaultTxSelectedDate()), 7);
      rerenderView();
    });
  }

  function renderTransactions() {
    syncTxViewToMonth();

    const filters = getTxFiltersFromDom();
    const viewTxs = getTransactionsForView();
    const monthTxs = getMonthTransactions();
    const modeLabel =
      state.txDisplayMode === "day" ? "theo ngày" : state.txDisplayMode === "week" ? "theo tuần" : "theo tháng";

    els.app.innerHTML = `
      <div class="filters">
        <div class="field">
          <div class="label">Hiển thị</div>
          <select id="txDisplayMode" class="select">
            <option value="day" ${state.txDisplayMode === "day" ? "selected" : ""}>Theo ngày</option>
            <option value="week" ${state.txDisplayMode === "week" ? "selected" : ""}>Theo tuần</option>
            <option value="month" ${state.txDisplayMode === "month" ? "selected" : ""}>Theo tháng</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Loại</div>
          <select id="fltType" class="select">
            <option value="all" selected>Tất cả</option>
            <option value="expense">Chi</option>
            <option value="income">Thu</option>
          </select>
        </div>
        <div class="field">
          <div class="label">Tài khoản</div>
          <select id="fltAccount" class="select">
            <option value="all" selected>Tất cả</option>
            ${state.data.accounts
              .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <div class="label">Danh mục</div>
          <select id="fltCategory" class="select">
            <option value="all" selected>Tất cả</option>
            ${state.data.categories
              .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <div class="label">Tìm kiếm</div>
          <input id="fltSearch" class="input" placeholder="Nhập mô tả..." />
        </div>
      </div>

      <div class="card" style="padding:12px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="card__title">Giao dịch tháng ${escapeHtml(state.month)} · ${modeLabel}</div>
            <div class="muted" style="font-size:12px; margin-top:6px;">
              Có ${monthTxs.length} giao dịch trong tháng.
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn--secondary" type="button" id="btnClearFilters">Làm mới lọc</button>
            <button class="btn btn--primary" type="button" id="btnAddTx">+ Thêm giao dịch</button>
          </div>
        </div>
      </div>

      <div style="margin-top:12px;" id="txViewWrap">
        ${renderTxViewContent(viewTxs, filters)}
      </div>
    `;

    const rerenderView = () => {
      const flt = getTxFiltersFromDom();
      const txs = getTransactionsForView();
      $("txViewWrap").innerHTML = renderTxViewContent(txs, flt);
      bindTxViewInnerEvents(monthTxs, rerenderView);
    };

    $("txDisplayMode").addEventListener("change", (e) => {
      state.txDisplayMode = e.target.value;
      if (state.txDisplayMode === "day") {
        if (!state.txSelectedDate) state.txSelectedDate = defaultTxSelectedDate();
      }
      if (state.txDisplayMode === "week") {
        state.txWeekStart = getMondayOfWeek(defaultTxSelectedDate());
      }
      if (state.txDisplayMode !== "day") state.txDrillBackTo = null;
      rerenderView();
    });

    $("txViewWrap").addEventListener("click", (e) => {
      const dayPick = e.target.closest("[data-action='pick-day']");
      if (dayPick) {
        const day = Number(dayPick.dataset.day);
        state.txSelectedDate = `${state.month}-${String(day).padStart(2, "0")}`;
        rerenderView();
        return;
      }
      const btn = e.target.closest("[data-action='view-day']");
      if (!btn) return;
      goToDayViewFromDrill(btn.dataset.date, btn.dataset.drillFrom || "month");
    });

    $("txViewWrap").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const btn = e.target.closest("[data-action='view-day']");
      if (!btn || btn.tagName === "BUTTON") return;
      e.preventDefault();
      goToDayViewFromDrill(btn.dataset.date, btn.dataset.drillFrom || "month");
    });

    $("fltType").addEventListener("change", rerenderView);
    $("fltAccount").addEventListener("change", rerenderView);
    $("fltCategory").addEventListener("change", rerenderView);
    $("fltSearch").addEventListener("input", rerenderView);

    $("btnClearFilters").addEventListener("click", () => {
      $("fltType").value = "all";
      $("fltAccount").value = "all";
      $("fltCategory").value = "all";
      $("fltSearch").value = "";
      rerenderView();
    });

    $("btnAddTx").addEventListener("click", () => openTransactionModal());
    bindTxViewInnerEvents(monthTxs, rerenderView);
  }

  function renderCategories() {
    const cats = [...state.data.categories].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));

    els.app.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900; font-size:16px;">Danh mục</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">
            Tạo danh mục để phân loại thu/chi. Gợi ý: đặt màu để dễ nhìn.
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn--primary" type="button" id="btnAddCategory">+ Thêm danh mục</button>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div class="grid-2">
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
              <div>
                <div class="card__title">Danh mục thu</div>
                <div class="muted" style="font-size:12px; margin-top:6px;">${cats.filter((c) => c.type === "income").length} danh mục</div>
              </div>
              <div class="pill">income</div>
            </div>
            <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              ${cats
                .filter((c) => c.type === "income")
                .map((c) => categoryRowHtml(c))
                .join("") || `<div class="muted">Chưa có.</div>`}
            </div>
          </div>

          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
              <div>
                <div class="card__title">Danh mục chi</div>
                <div class="muted" style="font-size:12px; margin-top:6px;">${cats.filter((c) => c.type === "expense").length} danh mục</div>
              </div>
              <div class="pill">expense</div>
            </div>
            <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              ${cats
                .filter((c) => c.type === "expense")
                .map((c) => categoryRowHtml(c))
                .join("") || `<div class="muted">Chưa có.</div>`}
            </div>
          </div>
        </div>
      </div>
    `;

    $("btnAddCategory").addEventListener("click", () => openCategoryModal());
  }

  function categoryRowHtml(cat) {
    const usage = state.data.transactions.filter((t) => t.categoryId === cat.id).length;
    return `
      <div class="card" style="background: rgba(255,255,255,0.04); padding:12px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span aria-hidden="true" style="width:12px; height:12px; border-radius:999px; display:inline-block; background:${cat.color};"></span>
            <div>
              <div style="font-weight:900;">${escapeHtml(cat.name)}</div>
              <div class="muted" style="font-size:12px; margin-top:6px;">
                Số giao dịch: ${usage}
              </div>
            </div>
          </div>
          <div class="row-actions">
            <button class="link-btn" type="button" data-action="edit-category" data-id="${escapeHtml(cat.id)}">Sửa</button>
            <button class="link-btn link-btn--danger" type="button" data-action="delete-category" data-id="${escapeHtml(cat.id)}">Xóa</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderBudgets() {
    const month = state.month;
    const budgets = [...state.data.budgets].filter((b) => b.month === month);
    budgets.sort((a, b) => (a.type === b.type ? a.categoryId.localeCompare(b.categoryId) : a.type.localeCompare(b.type)));

    const monthTxs = getMonthTransactions();
    const rows =
      budgets.length === 0
        ? `<div class="muted">Chưa có ngân sách cho tháng này. Bấm “+ Thêm ngân sách” để bắt đầu.</div>`
        : budgets.map((b) => budgetCardHtml(b, monthTxs)).join("");

    els.app.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900; font-size:16px;">Ngân sách - ${escapeHtml(month)}</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">
            So sánh số tiền đã thực tế với giới hạn bạn đặt ra.
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn--primary" type="button" id="btnAddBudget">+ Thêm ngân sách</button>
        </div>
      </div>

      <div style="margin-top:12px; display:flex; flex-direction:column; gap:12px;">
        ${rows}
      </div>
    `;

    $("btnAddBudget").addEventListener("click", () => openBudgetModal());
  }

  function budgetCardHtml(budget, monthTxs) {
    const cat = byId(state.data.categories, budget.categoryId);
    const color = cat ? cat.color : "#7c3aed";
    const limit = Number(budget.limit || 0);
    const spent = sumTransactions(
      monthTxs.filter((t) => t.type === budget.type && t.categoryId === budget.categoryId)
    );
    const pct = limit > 0 ? Math.min(130, (spent / limit) * 100) : 0;
    const over = limit > 0 && spent > limit;

    return `
      <div class="card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span aria-hidden="true" style="width:12px; height:12px; border-radius:999px; display:inline-block; background:${color};"></span>
              <div style="font-weight:900;">${escapeHtml(cat ? cat.name : "Không rõ")}</div>
              <div class="pill">${budget.type === "expense" ? "Chi" : "Thu"}</div>
            </div>
            <div class="muted" style="font-size:12px; margin-top:8px;">
              Đã thực tế: ${escapeHtml(formatNumber(spent, { withCurrency: true }))} / Giới hạn: ${escapeHtml(
      formatNumber(limit, { withCurrency: true })
    )}
            </div>
          </div>
          <div class="row-actions">
            <button class="link-btn" type="button" data-action="edit-budget" data-id="${escapeHtml(
              budget.id
            )}">Sửa</button>
            <button class="link-btn link-btn--danger" type="button" data-action="delete-budget" data-id="${escapeHtml(
              budget.id
            )}">Xóa</button>
          </div>
        </div>

        <div class="bar" style="margin-top:12px;">
          <div class="bar__fill" style="width:${pct}%; background: ${
            over ? "linear-gradient(90deg, rgba(239,68,68,0.95), rgba(245,158,11,0.85))" : "linear-gradient(90deg, rgba(124,58,237,0.9), rgba(167,139,250,0.8))"
          };"></div>
        </div>
        <div class="muted" style="font-size:12px; margin-top:8px;">
          ${escapeHtml(String(limit > 0 ? Math.round(pct) : 0))}% sử dụng ${over ? " (vượt)" : ""}
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const settings = state.data.settings;
    const firebaseStatus = state.firebaseReady
      ? "Đã kết nối Firestore"
      : isFirebaseConfigured()
        ? "Chưa kết nối (kiểm tra config/rules)"
        : "Chưa cấu hình firebase-config.js";
    const firebaseStatusColor = state.firebaseReady
      ? "rgba(34,197,94,0.95)"
      : "rgba(245,158,11,0.95)";
    const fileSupported =
      typeof window !== "undefined" &&
      typeof window.showSaveFilePicker === "function" &&
      state.linkedFileHandle;
    const linkedName = state.linkedFileHandle?.name || "Chưa liên kết";
    const accountsHtml = state.data.accounts
      .map((a) => {
        const bal = accountBalance(a.id);
        return `
          <div class="card" style="background: rgba(255,255,255,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
              <div>
                <div style="font-weight:900;">${escapeHtml(a.name)}</div>
                <div class="muted" style="font-size:12px; margin-top:8px;">
                  Số dư ban đầu: ${escapeHtml(formatNumber(Number(a.startingBalance || 0), { withCurrency: true }))}
                </div>
                <div style="margin-top:8px; font-weight:900;">
                  Số dư hiện tại: <span style="color:${bal >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)"};">${escapeHtml(
                    formatNumber(bal, { withCurrency: true })
                  )}</span>
                </div>
              </div>
              <div class="row-actions">
                <button class="link-btn" type="button" data-action="edit-account" data-id="${escapeHtml(a.id)}">Sửa</button>
                <button class="link-btn link-btn--danger" type="button" data-action="delete-account" data-id="${escapeHtml(
                  a.id
                )}">Xóa</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    els.app.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900; font-size:16px;">Cài đặt</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">
            Thiết lập hiển thị và quản lý dữ liệu.
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:12px;">
        <div class="card">
          <div style="font-weight:900;">Firebase / Firestore</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">
            Database: collection <code>appData</code>, document <code>main</code>
          </div>
          <div style="margin-top:12px;">
            <div class="pill" style="color:${firebaseStatusColor}; border-color: rgba(255,255,255,0.14);">
              ${escapeHtml(firebaseStatus)}
            </div>
            ${
              state.firebaseError
                ? `<div class="muted" style="font-size:12px; margin-top:8px; color: rgba(239,68,68,0.95);">${escapeHtml(state.firebaseError)}</div>`
                : ""
            }
          </div>
        </div>

        <div class="card">
          <div style="font-weight:900;">Định dạng tiền tệ</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">Ảnh hưởng đến cách hiển thị số tiền.</div>
          <div style="margin-top:12px;" class="form-grid">
            <div>
              <div class="label">Locale</div>
              <input id="settingLocale" class="input" value="${escapeHtml(settings.locale)}" />
            </div>
            <div>
              <div class="label">Currency (ISO 4217)</div>
              <input id="settingCurrency" class="input" value="${escapeHtml(settings.currency)}" />
            </div>
          </div>
          <div style="margin-top:12px; display:flex; justify-content:flex-end;">
            <button class="btn btn--primary" type="button" id="btnSaveSettings">Lưu cài đặt</button>
          </div>
        </div>

        <div class="card">
          <div style="font-weight:900;">Tài khoản</div>
          <div class="muted" style="font-size:12px; margin-top:6px;">Dùng để lọc giao dịch và tính số dư.</div>
          <div style="margin-top:12px;">
            <div class="btn-row" style="justify-content:flex-end; margin-bottom:10px;">
              <button class="btn btn--secondary" type="button" id="btnAddAccount">+ Thêm tài khoản</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${accountsHtml || `<div class="muted">Chưa có tài khoản.</div>`}
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;">Lưu dữ liệu ra file JSON</div>
            <div class="muted" style="font-size:12px; margin-top:6px;">
              Nếu trình duyệt hỗ trợ File System Access API, app sẽ ghi trực tiếp vào file liên kết. Nếu không, bạn vẫn có thể dùng “Xuất dữ liệu”.
            </div>
          </div>
          <div class="pill" id="fileSupportPill">${fileSupported ? "Đang liên kết" : "Chưa liên kết"}</div>
        </div>

        <div style="margin-top:12px;" class="form-grid">
          <div class="span-2">
            <div class="label">File hiện tại</div>
            <div class="pill" id="linkedFileName">${escapeHtml(linkedName)}</div>
          </div>

          <div class="span-2" style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            <label class="btn btn--secondary" for="loadJsonFileInput" role="button" tabindex="0">
              Tải từ file JSON
              <input id="loadJsonFileInput" type="file" accept=".json" hidden />
            </label>

            <button class="btn btn--primary" type="button" id="btnLinkSaveFile" ${typeof window.showSaveFilePicker !== "function" ? "disabled" : ""}>
              Chọn nơi lưu (liên kết)
            </button>
            <button class="btn btn--secondary" type="button" id="btnSaveNow">Lưu ngay</button>
          </div>

          <div class="span-2">
            <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
              <input id="autoSaveToFileCheckbox" type="checkbox" ${state.autoSaveToFile ? "checked" : ""} />
              <span class="muted">Lưu tự động vào file liên kết (nếu được phép)</span>
            </label>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-weight:900;">Dữ liệu</div>
            <div class="muted" style="font-size:12px; margin-top:6px;">
              Bạn có thể xuất dữ liệu bằng nút “Xuất dữ liệu” trên thanh trên cùng.
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn--secondary" type="button" id="btnResetData" style="border-color: rgba(239,68,68,0.5); color: rgba(239,68,68,0.95);">
              Reset dữ liệu
            </button>
          </div>
        </div>
      </div>
    `;

    $("btnSaveSettings").addEventListener("click", () => {
      const locale = ($("settingLocale").value || "vi-VN").trim() || "vi-VN";
      const currency = ($("settingCurrency").value || "VND").trim().toUpperCase() || "VND";
      state.data.settings.locale = locale;
      state.data.settings.currency = currency;
      saveData();
      renderSettings();
    });

    $("btnAddAccount").addEventListener("click", () => openAccountModal());
    $("btnResetData").addEventListener("click", () => {
      showModal({
        title: "Xác nhận reset dữ liệu?",
        bodyHtml: `
          <div class="muted">
            Thao tác này sẽ xóa toàn bộ giao dịch, danh mục, tài khoản và ngân sách hiện tại.
          </div>
        `,
        footerHtml: `
          <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
          <button class="btn btn--primary" type="button" id="modalConfirm" style="background: rgba(239,68,68,0.28); border-color: rgba(239,68,68,0.7);">
            Reset
          </button>
        `,
      });
      $("modalCancel").addEventListener("click", closeModal);
      $("modalConfirm").addEventListener("click", () => {
        state.data = seedData();
        saveData();
        closeModal();
        render();
      });
    });

    // File JSON import/export (file-based persistence)
    $("autoSaveToFileCheckbox").addEventListener("change", (e) => {
      state.autoSaveToFile = Boolean(e.target.checked);
      saveData(); // keep file & localStorage consistent
      renderSettings();
    });

    $("loadJsonFileInput").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        importJson(text);
        // After replacing data, persist to linked file if auto-save is enabled.
        queueWriteToLinkedFile();
        renderSettings();
        render();
        alert("Tải file JSON thành công.");
      } catch (err) {
        alert("Tải file JSON thất bại: " + (err?.message || String(err)));
      } finally {
        $("loadJsonFileInput").value = "";
      }
    });

    $("btnLinkSaveFile").addEventListener("click", async () => {
      try {
        if (typeof window.showSaveFilePicker !== "function") {
          alert("Trình duyệt của bạn không hỗ trợ ghi trực tiếp vào file.");
          return;
        }
        const handle = await window.showSaveFilePicker({
          suggestedName: "chi-tieu.json",
          types: [
            {
              description: "JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        state.linkedFileHandle = handle;
        state.autoSaveToFile = true;
        queueWriteToLinkedFile();
        renderSettings();
      } catch (err) {
        // User may cancel picker.
      }
    });

    $("btnSaveNow").addEventListener("click", async () => {
      try {
        if (state.linkedFileHandle && state.linkedFileHandle.createWritable) {
          const payload = JSON.stringify(state.data, null, 2);
          const writable = await state.linkedFileHandle.createWritable();
          await writable.write(payload);
          await writable.close();
          alert("Đã lưu vào file liên kết.");
          return;
        }
        // Fallback: trigger a download
        exportJson();
      } catch (err) {
        alert("Lưu file thất bại: " + (err?.message || String(err)));
      }
    });
  }

  function openTransactionModal(txToEdit) {
    const isEdit = Boolean(txToEdit);
    const type = isEdit ? txToEdit.type : "expense";
    const categories = categoriesByType(type);
    const accounts = state.data.accounts;

    const initialAmount = isEdit ? Number(txToEdit.amount || 0) : 0;
    const initialDate = isEdit ? txToEdit.date : toISODate(new Date());
    const initialCatId = isEdit ? txToEdit.categoryId : categories[0]?.id || "";
    const initialAccId = isEdit ? txToEdit.accountId : accounts[0]?.id || "";
    const initialTime = isEdit ? getTxTime(txToEdit) : `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;

    const initialDesc = isEdit ? txToEdit.description || "" : "";

    const bodyHtml = `
      ${renderModalDatePickerHTML(initialDate)}
      <div class="form-grid">
        <div>
          <div class="label">Loại giao dịch</div>
          <select id="txType" class="select">
            <option value="expense" ${type === "expense" ? "selected" : ""}>Chi</option>
            <option value="income" ${type === "income" ? "selected" : ""}>Thu</option>
          </select>
        </div>
        <div>
          <div class="label">Giờ</div>
          <input id="txTime" class="input" type="time" value="${escapeHtml(initialTime)}" />
        </div>
        <div>
          <div class="label">Số tiền</div>
          <input id="txAmount" class="input input--money" type="text" inputmode="numeric" placeholder="0" value="${escapeHtml(formatMoneyInitial(initialAmount))}" />
        </div>

        <div>
          <div class="label">Danh mục</div>
          <select id="txCategory" class="select">
            ${categories.map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === initialCatId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>

        <div>
          <div class="label">Tài khoản</div>
          <select id="txAccount" class="select">
            ${accounts.map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === initialAccId ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}
          </select>
        </div>

        <div class="span-2">
          <div class="label">Mô tả</div>
          <textarea id="txDesc" class="textarea" placeholder="VD: Ăn trưa, tiền điện...">${escapeHtml(initialDesc)}</textarea>
        </div>
      </div>
      <div class="muted" style="font-size:12px; margin-top:10px;">
        Dữ liệu được đồng bộ lên Firebase/local khi bạn lưu.
      </div>
    `;

    showModal({
      title: isEdit ? "Sửa giao dịch" : "Thêm giao dịch",
      bodyHtml,
      footerHtml: `
        <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
        <button class="btn btn--primary" type="button" id="modalSave">Lưu</button>
      `,
    });

    $("modalCancel").addEventListener("click", closeModal);
    bindMoneyInput($("txAmount"));
    bindModalDatePicker(initialDate);

    const updateCategoryOptions = () => {
      const newType = $("txType").value;
      const cats = categoriesByType(newType);
      const current = $("txCategory").value;
      $("txCategory").innerHTML = cats
        .map((c) => `<option value="${escapeHtml(c.id)}" ${
          c.id === current ? "selected" : ""
        }>${escapeHtml(c.name)}</option>`)
        .join("");
    };

    $("txType").addEventListener("change", () => {
      updateCategoryOptions();
      // if current category doesn't exist for new type, select first
      if (!categoriesByType($("txType").value).some((c) => c.id === $("txCategory").value)) {
        $("txCategory").value = categoriesByType($("txType").value)[0]?.id || "";
      }
    });

    $("modalSave").addEventListener("click", () => {
      const newType = $("txType").value;
      const amount = readMoneyInput("txAmount");
      const date = $("txDate").value;
      const time = ($("txTime").value || "12:00").slice(0, 5);
      const categoryId = $("txCategory").value;
      const accountId = $("txAccount").value;
      const description = $("txDesc").value.trim();

      if (!date) return alert("Vui lòng chọn ngày.");
      if (!categoryId) return alert("Vui lòng chọn danh mục.");
      if (!accountId) return alert("Vui lòng chọn tài khoản.");
      if (!Number.isFinite(amount) || amount <= 0) return alert("Số tiền phải lớn hơn 0.");

      if (isEdit) {
        txToEdit.type = newType;
        txToEdit.amount = amount;
        txToEdit.date = date;
        txToEdit.time = time;
        txToEdit.categoryId = categoryId;
        txToEdit.accountId = accountId;
        txToEdit.description = description;
      } else {
        state.data.transactions.push({
          id: uuid(),
          type: newType,
          amount,
          date,
          time,
          categoryId,
          accountId,
          description,
          createdAt: Date.now(),
        });
      }

      saveData();
      closeModal();
      render();
    });
  }

  function openCategoryModal(catToEdit) {
    const isEdit = Boolean(catToEdit);
    const initialType = isEdit ? catToEdit.type : "expense";
    const initialName = isEdit ? catToEdit.name : "";
    const initialColor = isEdit ? catToEdit.color : palette[0];

    showModal({
      title: isEdit ? "Sửa danh mục" : "Thêm danh mục",
      bodyHtml: `
        <div class="form-grid">
          <div>
            <div class="label">Loại</div>
            <select id="catType" class="select">
              <option value="expense" ${initialType === "expense" ? "selected" : ""}>Chi</option>
              <option value="income" ${initialType === "income" ? "selected" : ""}>Thu</option>
            </select>
          </div>
          <div>
            <div class="label">Màu</div>
            <input id="catColor" class="input" type="color" value="${escapeHtml(initialColor)}" />
          </div>
          <div class="span-2">
            <div class="label">Tên danh mục</div>
            <input id="catName" class="input" value="${escapeHtml(initialName)}" placeholder="VD: Ăn uống, Lương..." />
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
        <button class="btn btn--primary" type="button" id="modalSave">Lưu</button>
      `,
    });

    $("modalCancel").addEventListener("click", closeModal);

    $("modalSave").addEventListener("click", () => {
      const type = $("catType").value;
      const name = $("catName").value.trim();
      const color = $("catColor").value;

      if (!name) return alert("Vui lòng nhập tên danh mục.");
      const exists = state.data.categories.some(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase() && c.type === type && c.id !== (catToEdit?.id || "")
      );
      if (exists) return alert("Danh mục với tên này đã tồn tại (cùng loại).");

      if (isEdit) {
        catToEdit.type = type;
        catToEdit.name = name;
        catToEdit.color = color;
      } else {
        state.data.categories.push({
          id: uuid(),
          type,
          name,
          color,
        });
      }

      saveData();
      closeModal();
      render();
    });
  }

  function openBudgetModal(budgetToEdit) {
    const isEdit = Boolean(budgetToEdit);
    const initialType = isEdit ? budgetToEdit.type : "expense";
    const initialCatId = isEdit ? budgetToEdit.categoryId : categoriesByType(initialType)[0]?.id || "";
    const initialLimit = isEdit ? Number(budgetToEdit.limit || 0) : 0;

    showModal({
      title: isEdit ? "Sửa ngân sách" : "Thêm ngân sách",
      bodyHtml: `
        <div class="form-grid">
          <div>
            <div class="label">Loại</div>
            <select id="budgetType" class="select">
              <option value="expense" ${initialType === "expense" ? "selected" : ""}>Chi</option>
              <option value="income" ${initialType === "income" ? "selected" : ""}>Thu</option>
            </select>
          </div>
          <div>
            <div class="label">Tháng</div>
            <input id="budgetMonth" class="input" type="text" value="${escapeHtml(state.month)}" disabled />
          </div>
          <div>
            <div class="label">Danh mục</div>
            <select id="budgetCategory" class="select">
              ${categoriesByType(initialType)
                .map(
                  (c) =>
                    `<option value="${escapeHtml(c.id)}" ${
                      c.id === initialCatId ? "selected" : ""
                    }>${escapeHtml(c.name)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div>
            <div class="label">Giới hạn</div>
            <input id="budgetLimit" class="input input--money" type="text" inputmode="numeric" placeholder="0" value="${escapeHtml(formatMoneyInitial(initialLimit))}" />
          </div>
        </div>
        <div class="muted" style="font-size:12px; margin-top:10px;">
          Ngân sách dùng để so sánh “đã thực tế” trong tháng với “giới hạn”.
        </div>
      `,
      footerHtml: `
        <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
        <button class="btn btn--primary" type="button" id="modalSave">Lưu</button>
      `,
    });

    $("modalCancel").addEventListener("click", closeModal);
    bindMoneyInput($("budgetLimit"));

    const updateBudgetCategory = () => {
      const t = $("budgetType").value;
      const cats = categoriesByType(t);
      const current = $("budgetCategory").value;
      $("budgetCategory").innerHTML = cats
        .map((c) => `<option value="${escapeHtml(c.id)}" ${c.id === current ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
        .join("");
      if (!cats.some((c) => c.id === $("budgetCategory").value)) {
        $("budgetCategory").value = cats[0]?.id || "";
      }
    };

    $("budgetType").addEventListener("change", updateBudgetCategory);

    $("modalSave").addEventListener("click", () => {
      const type = $("budgetType").value;
      const categoryId = $("budgetCategory").value;
      const limit = readMoneyInput("budgetLimit");
      const month = state.month;

      if (!categoryId) return alert("Vui lòng chọn danh mục.");
      if (!Number.isFinite(limit) || limit <= 0) return alert("Giới hạn phải lớn hơn 0.");

      const dup = state.data.budgets.some(
        (b) =>
          b.month === month &&
          b.type === type &&
          b.categoryId === categoryId &&
          b.id !== (budgetToEdit?.id || "")
      );
      if (dup) return alert("Danh sách ngân sách này đã tồn tại cho tháng và danh mục đã chọn.");

      if (isEdit) {
        budgetToEdit.type = type;
        budgetToEdit.categoryId = categoryId;
        budgetToEdit.limit = limit;
      } else {
        state.data.budgets.push({
          id: uuid(),
          month,
          type,
          categoryId,
          limit,
          createdAt: Date.now(),
        });
      }

      saveData();
      closeModal();
      render();
    });
  }

  function openAccountModal(accountToEdit) {
    const isEdit = Boolean(accountToEdit);
    const initialName = isEdit ? accountToEdit.name : "";
    const initialBalance = isEdit ? Number(accountToEdit.startingBalance || 0) : 0;

    showModal({
      title: isEdit ? "Sửa tài khoản" : "Thêm tài khoản",
      bodyHtml: `
        <div class="form-grid">
          <div class="span-2">
            <div class="label">Tên tài khoản</div>
            <input id="accName" class="input" value="${escapeHtml(initialName)}" placeholder="VD: Tiền mặt, Ngân hàng..." />
          </div>
          <div class="span-2">
            <div class="label">Số dư ban đầu</div>
            <input id="accStarting" class="input input--money" type="text" inputmode="numeric" placeholder="0" value="${escapeHtml(formatMoneyInitial(initialBalance))}" />
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
        <button class="btn btn--primary" type="button" id="modalSave">Lưu</button>
      `,
    });

    $("modalCancel").addEventListener("click", closeModal);
    bindMoneyInput($("accStarting"));
    $("modalSave").addEventListener("click", () => {
      const name = $("accName").value.trim();
      const balanceRaw = ($("accStarting").value || "").trim();
      const startingBalance = balanceRaw === "" ? 0 : readMoneyInput("accStarting");

      if (!name) return alert("Vui lòng nhập tên tài khoản.");
      if (!Number.isFinite(startingBalance)) return alert("Số dư ban đầu không hợp lệ.");

      if (isEdit) {
        accountToEdit.name = name;
        accountToEdit.startingBalance = startingBalance;
      } else {
        state.data.accounts.push({
          id: uuid(),
          name,
          startingBalance,
        });
      }

      saveData();
      closeModal();
      render();
    });
  }

  function downloadBlob(filename, content, mime = "application/octet-stream") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const payload = JSON.stringify(state.data, null, 2);
    const ym = state.month.replace("-", "");
    downloadBlob(`chi-tieu_${ym}.json`, payload, "application/json");
  }

  function transactionsToCsv(txs) {
    const headers = ["date", "type", "amount", "category", "account", "description"];
    const lines = [headers.join(",")];
    for (const tx of txs) {
      const cat = byId(state.data.categories, tx.categoryId);
      const acc = byId(state.data.accounts, tx.accountId);
      const row = [
        tx.date,
        tx.type,
        Number(tx.amount || 0).toString(),
        (cat ? cat.name : "").replaceAll('"', '""'),
        (acc ? acc.name : "").replaceAll('"', '""'),
        (tx.description || "").replaceAll('"', '""'),
      ].map((v) => `"${String(v)}"`);
      lines.push(row.join(","));
    }
    // Add UTF-8 BOM so Excel opens Vietnamese correctly.
    return "\ufeff" + lines.join("\n");
  }

  function exportCsvForTransactions() {
    const txs = state.data.transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const csv = transactionsToCsv(txs);
    const ym = state.month.replace("-", "");
    downloadBlob(`transactions_${ym}.csv`, csv, "text/csv;charset=utf-8");
  }

  function parseCsv(text) {
    // Simple CSV parser for our exported format (quoted values).
    // Not a full CSV implementation but sufficient for basic import.
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());

    const idx = {
      date: headers.indexOf("date"),
      type: headers.indexOf("type"),
      amount: headers.indexOf("amount"),
      category: headers.indexOf("category"),
      account: headers.indexOf("account"),
      description: headers.indexOf("description"),
    };

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Split by commas not inside quotes.
      const parts = [];
      let cur = "";
      let inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"' && line[j + 1] === '"' ) {
          cur += '"';
          j++;
          continue;
        }
        if (ch === '"') {
          inQ = !inQ;
          continue;
        }
        if (ch === "," && !inQ) {
          parts.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      parts.push(cur);

      const date = idx.date >= 0 ? parts[idx.date] : "";
      const typeRaw = idx.type >= 0 ? parts[idx.type] : "";
      const amountRaw = idx.amount >= 0 ? parts[idx.amount] : "";
      const categoryName = idx.category >= 0 ? parts[idx.category] : "";
      const accountName = idx.account >= 0 ? parts[idx.account] : "";
      const description = idx.description >= 0 ? parts[idx.description] : "";

      const amount = Number(String(amountRaw).replaceAll(",", "."));
      const type = String(typeRaw).toLowerCase() === "income" ? "income" : "expense";

      rows.push({
        date: String(date),
        type,
        amount,
        categoryName,
        accountName,
        description: String(description || ""),
      });
    }
    return rows;
  }

  function importJson(text) {
    const parsed = safeParseJson(text);
    if (!parsed || parsed.version !== 1) throw new Error("File JSON không đúng định dạng.");
    state.data = parsed;
    saveData();
  }

  function importCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("CSV không có dữ liệu giao dịch.");

    // Map category/account by name+type; create if missing.
    const catByKey = new Map(); // `${type}:${name}` => id
    for (const c of state.data.categories) catByKey.set(`${c.type}:${c.name}`.toLowerCase(), c.id);

    const accByKey = new Map(); // name => id
    for (const a of state.data.accounts) accByKey.set(a.name.toLowerCase(), a.id);

    const ensureCategory = (type, name) => {
      const key = `${type}:${name}`.toLowerCase();
      if (catByKey.has(key)) return catByKey.get(key);
      const color = palette[catByKey.size % palette.length];
      const newCat = { id: uuid(), type, name: name.trim(), color };
      state.data.categories.push(newCat);
      catByKey.set(key, newCat.id);
      return newCat.id;
    };

    const ensureAccount = (name) => {
      const key = String(name || "").trim().toLowerCase();
      if (accByKey.has(key)) return accByKey.get(key);
      const newAcc = { id: uuid(), name: name.trim(), startingBalance: 0 };
      state.data.accounts.push(newAcc);
      accByKey.set(key, newAcc.id);
      return newAcc.id;
    };

    for (const r of rows) {
      if (!r.date || !Number.isFinite(r.amount) || r.amount <= 0) continue;
      const categoryName = (r.categoryName || "").trim();
      const accountName = (r.accountName || "").trim();
      const categoryId = ensureCategory(r.type, categoryName || "Khác");
      const accountId = ensureAccount(accountName || "Tài khoản");
      state.data.transactions.push({
        id: uuid(),
        type: r.type,
        amount: Number(r.amount),
        date: r.date,
        categoryId,
        accountId,
        description: r.description,
        createdAt: Date.now(),
      });
    }
  }

  function openExportModal() {
    showModal({
      title: "Xuất dữ liệu",
      bodyHtml: `
        <div class="muted" style="margin-bottom:10px;">
          Chọn định dạng bạn muốn xuất. JSON dùng để sao lưu toàn bộ, CSV dùng cho Excel.
        </div>
        <div class="card" style="background: rgba(255,255,255,0.04);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div>
              <div style="font-weight:900;">JSON (Backup)</div>
              <div class="muted" style="font-size:12px; margin-top:6px;">Xuất toàn bộ dữ liệu app.</div>
            </div>
            <button class="btn btn--primary" type="button" id="exportJsonBtn">Xuất JSON</button>
          </div>
        </div>

        <div class="card" style="background: rgba(255,255,255,0.04); margin-top:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div>
              <div style="font-weight:900;">JSON chuẩn data.json</div>
              <div class="muted" style="font-size:12px; margin-top:6px;">Dùng để thay file database cạnh index.html.</div>
            </div>
            <button class="btn btn--primary" type="button" id="exportDataJsonBtn">Xuất data.json</button>
          </div>
        </div>

        <div class="card" style="background: rgba(255,255,255,0.04); margin-top:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div>
              <div style="font-weight:900;">CSV (Giao dịch)</div>
              <div class="muted" style="font-size:12px; margin-top:6px;">Xuất danh sách giao dịch để mở bằng Excel/Google Sheets.</div>
            </div>
            <button class="btn btn--primary" type="button" id="exportCsvBtn">Xuất CSV</button>
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn--secondary" type="button" id="modalCancel">Đóng</button>
      `,
    });

    $("modalCancel").addEventListener("click", closeModal);
    $("exportJsonBtn").addEventListener("click", () => {
      exportJson();
      closeModal();
    });
    $("exportDataJsonBtn").addEventListener("click", () => {
      downloadBlob("data.json", JSON.stringify(state.data, null, 2), "application/json");
      closeModal();
    });
    $("exportCsvBtn").addEventListener("click", () => {
      exportCsvForTransactions();
      closeModal();
    });
  }

  function wireGlobalActions() {
    // Delegated actions in #app
    els.app.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action) return;

      if (action === "edit-tx") {
        const tx = byId(state.data.transactions, id);
        if (tx) openTransactionModal(tx);
      } else if (action === "delete-tx") {
        const tx = byId(state.data.transactions, id);
        if (!tx) return;
        showModal({
          title: "Xóa giao dịch?",
          bodyHtml: `<div class="muted">Bạn có chắc muốn xóa giao dịch này không?</div>`,
          footerHtml: `
            <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
            <button class="btn btn--primary" type="button" id="modalConfirm" style="background: rgba(239,68,68,0.28); border-color: rgba(239,68,68,0.7);">
              Xóa
            </button>
          `,
        });
        $("modalCancel").addEventListener("click", closeModal);
        $("modalConfirm").addEventListener("click", () => {
          state.data.transactions = state.data.transactions.filter((t) => t.id !== id);
          saveData();
          closeModal();
          render();
        });
      } else if (action === "edit-category") {
        const cat = byId(state.data.categories, id);
        if (cat) openCategoryModal(cat);
      } else if (action === "delete-category") {
        const cat = byId(state.data.categories, id);
        if (!cat) return;
        const used = state.data.transactions.filter((t) => t.categoryId === cat.id).length;
        if (used > 0) {
          alert("Không thể xóa danh mục vì đang có giao dịch sử dụng danh mục này.");
          return;
        }
        showModal({
          title: "Xóa danh mục?",
          bodyHtml: `<div class="muted">Danh mục này sẽ bị xóa vĩnh viễn.</div>`,
          footerHtml: `
            <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
            <button class="btn btn--primary" type="button" id="modalConfirm" style="background: rgba(239,68,68,0.28); border-color: rgba(239,68,68,0.7);">
              Xóa
            </button>
          `,
        });
        $("modalCancel").addEventListener("click", closeModal);
        $("modalConfirm").addEventListener("click", () => {
          state.data.categories = state.data.categories.filter((c) => c.id !== id);
          saveData();
          closeModal();
          render();
        });
      } else if (action === "edit-budget") {
        const b = byId(state.data.budgets, id);
        if (b) openBudgetModal(b);
      } else if (action === "delete-budget") {
        const b = byId(state.data.budgets, id);
        if (!b) return;
        showModal({
          title: "Xóa ngân sách?",
          bodyHtml: `<div class="muted">Bạn có chắc muốn xóa ngân sách này không?</div>`,
          footerHtml: `
            <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
            <button class="btn btn--primary" type="button" id="modalConfirm" style="background: rgba(239,68,68,0.28); border-color: rgba(239,68,68,0.7);">
              Xóa
            </button>
          `,
        });
        $("modalCancel").addEventListener("click", closeModal);
        $("modalConfirm").addEventListener("click", () => {
          state.data.budgets = state.data.budgets.filter((x) => x.id !== id);
          saveData();
          closeModal();
          render();
        });
      } else if (action === "edit-account") {
        const a = byId(state.data.accounts, id);
        if (a) openAccountModal(a);
      } else if (action === "delete-account") {
        const a = byId(state.data.accounts, id);
        if (!a) return;
        const used = state.data.transactions.filter((t) => t.accountId === a.id).length;
        if (used > 0) {
          alert("Không thể xóa tài khoản vì đang có giao dịch sử dụng tài khoản này.");
          return;
        }
        showModal({
          title: "Xóa tài khoản?",
          bodyHtml: `<div class="muted">Tài khoản này sẽ bị xóa vĩnh viễn.</div>`,
          footerHtml: `
            <button class="btn btn--secondary" type="button" id="modalCancel">Hủy</button>
            <button class="btn btn--primary" type="button" id="modalConfirm" style="background: rgba(239,68,68,0.28); border-color: rgba(239,68,68,0.7);">
              Xóa
            </button>
          `,
        });
        $("modalCancel").addEventListener("click", closeModal);
        $("modalConfirm").addEventListener("click", () => {
          state.data.accounts = state.data.accounts.filter((x) => x.id !== id);
          saveData();
          closeModal();
          render();
        });
      }
    });

    els.btnQuickAdd.addEventListener("click", () => openTransactionModal());
    els.btnExport.addEventListener("click", openExportModal);
  }

  function handleImportFile() {
    els.importFile.addEventListener("change", async () => {
      const file = els.importFile.files && els.importFile.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          importJson(text);
        } else if (file.name.toLowerCase().endsWith(".csv")) {
          // Import CSV will merge (append) transactions.
          importCsv(text);
        } else {
          throw new Error("Định dạng file không được hỗ trợ.");
        }
        saveData();
        closeModal();
        render();
        alert("Import thành công.");
      } catch (err) {
        alert("Import thất bại: " + (err?.message || String(err)));
      } finally {
        els.importFile.value = "";
      }
    });
  }

  function render() {
    if (!state.data) return;
    if (state.view === "dashboard") return renderDashboard();
    if (state.view === "transactions") return renderTransactions();
    if (state.view === "categories") return renderCategories();
    if (state.view === "budgets") return renderBudgets();
    if (state.view === "settings") return renderSettings();
    renderDashboard();
  }

  async function init() {
    setupModalHandlers();
    try {
      state.data = await loadDataAsync();
    } catch {
      state.data = loadDataFromLocalOrSeed();
    }
    state.month = currentMonthValue();
    const { year } = parseMonthValue(state.month);
    state.yearPickerViewStart = year - Math.floor(YEAR_GRID_SIZE / 2);
    updatePeriodPickerDisplay();
    renderMonthPickerGrid();
    renderYearPickerGrid();
    setupMonthPicker();
    setupTxDayPickerGlobal();

    els.navItems.forEach((item) => {
      item.addEventListener("click", () => setActiveView(item.dataset.view));
    });

    wireGlobalActions();
    handleImportFile();

    render();
  }

  init();
})();


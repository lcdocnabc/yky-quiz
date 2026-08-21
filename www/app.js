/* 应知应会答题 App —— 核心逻辑（V3：题库为顶层独立单元）
 * 功能：每个题库(知识库)独立、互不干扰；按知识类型(填空/单选/多选)答题；
 *       答错即显答案；记忆曲线(SRS)按错题每天强化；一周掌握跟踪；
 *       手机端表格增删改 + CSV 文件导入(建新库)/导出/删除题库。
 * 存储：localStorage（安卓 WebView 启用 DOM storage 后持久化）。
 */
(function () {
  "use strict";
  const Y = window.YKY;
  const K_BANKS = "yky_banks_v5", K_PROG = "yky_progress_v5", K_SET = "yky_settings_v5";
  const OLD_KEYS = ["yky_banks_v3", "yky_progress_v3", "yky_settings_v3", "yky_banks_v4", "yky_progress_v4", "yky_settings_v4"];
  const APP_VERSION = "v5"; // App 结构版本：升级时强制清空旧数据重载种子
  const DAY = 86400000;
  const INTERVAL = [1, 2, 4, 7]; // 答对后下次复习间隔(天)：层级1/2/3/4

  // ---------- 存储 ----------
  // BANKS: [{id,name,items:[{id,type,q,a,options}]}]
  // PROG:  { [bankId]: { [itemId]: {level,due,history,wrong,last,mastered} } }  ← 每个题库进度隔离
  // SET:   全局设置
  let BANKS = [], PROG = {}, SET = { startDate: null, theme: "light", lastTab: "bank", activeBank: null };
  let bankView = { mode: "list", id: null }; // 题库页：列表 / 详情

  function load() {
    // 结构/解析标准已升级，旧 key 数据可能污染新解析（如单选把全部选项拼成答案），直接废弃
    try {
      OLD_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    try {
      const s = JSON.parse(localStorage.getItem(K_SET));
      if (s) SET = Object.assign(SET, s);
      // App 版本升级时强制重置题库与进度，避免旧结构数据污染新解析逻辑
      if (SET.appVersion !== APP_VERSION) {
        localStorage.removeItem(K_BANKS);
        localStorage.removeItem(K_PROG);
        SET = { startDate: null, theme: "light", lastTab: "bank", activeBank: null, appVersion: APP_VERSION };
      }
      BANKS = JSON.parse(localStorage.getItem(K_BANKS)) || null;
      if (!BANKS || !BANKS.length) { BANKS = deepCopy(Y.SEED_BANKS); saveBanks(); }
      PROG = JSON.parse(localStorage.getItem(K_PROG)) || {};
      SET.appVersion = APP_VERSION; saveSet();
      // 数据健康检查：若残留旧解析的畸形单选题（options 含「 | 」分隔符），强制重置
      if (needsReset(BANKS)) {
        localStorage.removeItem(K_BANKS); localStorage.removeItem(K_PROG);
        BANKS = deepCopy(Y.SEED_BANKS); PROG = {}; saveBanks(); saveProg();
      }
    } catch (e) { BANKS = deepCopy(Y.SEED_BANKS); PROG = {}; }
  }
  function needsReset(banks) {
    if (!Array.isArray(banks)) return true;
    return banks.some((b) => {
      if (!b || !Array.isArray(b.items)) return false;
      return b.items.some((it) => {
        if (!it) return false;
        if ((it.type === "单选" || it.type === "多选") && it.options && /\s*\|\s*/.test(String(it.options))) return true;
        return false;
      });
    });
  }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function saveBanks() { try { localStorage.setItem(K_BANKS, JSON.stringify(BANKS)); } catch (e) {} }
  function saveProg() { try { localStorage.setItem(K_PROG, JSON.stringify(PROG)); } catch (e) {} }
  function saveSet() { try { localStorage.setItem(K_SET, JSON.stringify(SET)); } catch (e) {} }

  // ---------- 工具 ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const $all = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  function escapeHtml(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }
  function findBank(id) { return BANKS.find((b) => b.id === id) || null; }
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  // 自建确认框：替代原生 confirm（安卓 WebView 下原生 confirm 不弹窗，导致删除等功能失效）
  // 返回 Promise<boolean>；cancelText/okText 可定制，danger=true 时确认按钮标红
  function modalConfirm(text, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "modal-mask confirm-mask";
      mask.innerHTML = `
        <div class="confirm-box">
          <div class="ctext">${escapeHtml(text)}</div>
          <div class="crow">
            <button class="btn ghost" data-act="cancel">${escapeHtml(opts.cancelText || "取消")}</button>
            <button class="btn ${opts.danger ? "danger" : "primary"}" data-act="ok">${escapeHtml(opts.okText || "确定")}</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      const close = (v) => { document.body.removeChild(mask); resolve(v); };
      mask.addEventListener("click", (e) => { if (e.target === mask) close(false); });
      mask.querySelector('[data-act="cancel"]').addEventListener("click", () => close(false));
      mask.querySelector('[data-act="ok"]').addEventListener("click", () => close(true));
    });
  }
  function blankHint(a, n) {
    n = n || 4;
    const clean = (a || "").replace(/[\s，。、；：？?]/g, "");
    return clean.slice(0, n);
  }

  // ---------- 进度 / SRS（按题库隔离） ----------
  function P(bankId, itemId) { const b = PROG[bankId]; return b ? b[itemId] : null; }
  function setP(bankId, itemId, p) { if (!PROG[bankId]) PROG[bankId] = {}; PROG[bankId][itemId] = p; saveProg(); }
  function isMastered(bankId, itemId) { const p = P(bankId, itemId); return !!(p && p.level >= 4); }
  function isWrong(bankId, itemId) { const p = P(bankId, itemId); return !!(p && p.wrong > 0 && p.level < 4); }
  function reviewDue(bankId, itemId) {
    const p = P(bankId, itemId);
    if (!p || p.level >= 4) return false;
    return (p.due || 0) <= Date.now() + 60000;
  }
  function recordAnswer(bankId, itemId, correct) {
    const p = P(bankId, itemId) || { level: 0, due: 0, history: [], wrong: 0, last: 0 };
    p.history = p.history || [];
    p.history.push(correct ? 1 : 0);
    if (p.history.length > 60) p.history.shift();
    p.last = Date.now();
    if (correct) {
      const nl = Math.min(p.level + 1, 4);
      p.level = nl;
      if (nl >= 4) { p.due = Infinity; p.mastered = true; }
      else { p.due = Date.now() + INTERVAL[nl - 1] * DAY; }
      p.wrong = 0;
    } else {
      p.level = 0; p.wrong = (p.wrong || 0) + 1; p.due = Date.now() + 10 * 60000;
    }
    if (!SET.startDate) { SET.startDate = new Date().toISOString().slice(0, 10); saveSet(); }
    setP(bankId, itemId, p);
  }
  // 某题库统计
  function statsFor(bank) {
    let total = bank.items.length, mastered = 0, due = 0, wrong = 0, histOk = 0, histAll = 0;
    bank.items.forEach((x) => {
      const p = P(bank.id, x.id);
      if (p) {
        if (p.level >= 4) mastered++;
        if (reviewDue(bank.id, x.id)) due++;
        if (p.wrong > 0 && p.level < 4) wrong++;
        (p.history || []).forEach((h) => { histAll++; if (h) histOk++; });
      }
    });
    return { total, mastered, due, wrong, accuracy: histAll ? Math.round(histOk / histAll * 100) : 0 };
  }
  // 全部题库汇总
  function statsAll() {
    let total = 0, mastered = 0, due = 0, wrong = 0;
    BANKS.forEach((b) => {
      const s = statsFor(b);
      total += s.total; mastered += s.mastered; due += s.due; wrong += s.wrong;
    });
    return { total, mastered, due, wrong };
  }

  // ---------- Tab ----------
  function showTab(name) {
    SET.lastTab = name; saveSet();
    $all(".bottom-nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    ["bank", "quiz", "review", "stats"].forEach((n) => $("#view-" + n).classList.toggle("hidden", n !== name));
    if (name === "bank") { bankView = { mode: "list", id: null }; renderBank(); }
    else if (name === "quiz") renderQuizHome();
    else if (name === "review") renderReview();
    else if (name === "stats") renderStats();
    window.scrollTo(0, 0);
  }

  // ---------- 题库列表（顶层独立单元） ----------
  function renderBank() {
    const root = $("#view-bank");
    if (bankView.mode === "detail" && findBank(bankView.id)) return renderBankDetail(bankView.id);
    const list = BANKS.map((b) => ({ b, s: statsFor(b) }));
    root.innerHTML = `
      <div class="card">
        <h3>我的题库（${BANKS.length} 个）</h3>
        <p class="muted">每个题库是独立知识体系，进度与复习互不干扰。点「导入题库」从手机文件新建（支持 Excel .xlsx 或 CSV，第一列是题库名，可一次建多个题库）。</p>
        <div class="row">
          <button class="btn" id="bk-import">导入题库</button>
        </div>
        <input type="file" id="bk-file" accept="*/*" class="hidden" />
      </div>
      <div id="bk-list" class="list"></div>`;
    const draw = () => {
      const el = $("#bk-list", root);
      if (!list.length) { el.innerHTML = `<div class="empty">还没有题库，点「导入题库」从手机文件新建。</div>`; return; }
      el.innerHTML = list.map(({ b, s }) => {
        const cp = s.total ? Math.round(s.mastered / s.total * 100) : 0;
        return `<div class="item bank-item" data-id="${escapeAttr(b.id)}">
          <div class="body">
            <div class="q">${escapeHtml(b.name)} <span class="tag">${s.total} 题</span></div>
            <div class="bank-bar"><div class="bank-bar-fill" style="width:${cp}%"></div></div>
            <div class="a">掌握 ${s.mastered}/${s.total} · 待复习 ${s.due} · 薄弱 ${s.wrong}</div>
          </div>
          <div class="ops">
            <button class="btn ghost sm" data-open="${escapeAttr(b.id)}">打开</button>
            <button class="btn ghost sm" data-delbank="${escapeAttr(b.id)}" style="color:var(--bad)">删除</button>
          </div>
        </div>`;
      }).join("");
      $all("[data-open]", el).forEach((b2) => b2.addEventListener("click", () => {
        bankView = { mode: "detail", id: b2.dataset.open }; renderBank();
      }));
      $all("[data-delbank]", el).forEach((b2) => b2.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteBank(b2.dataset.delbank);
      }));
    };
    $("#bk-import", root).addEventListener("click", () => $("#bk-file", root).click());
    $("#bk-file", root).addEventListener("change", importFileAsBanks);
    draw();
  }

  // 删除整个题库（彻底清题目与进度）
  function deleteBank(bankId) {
    const bank = findBank(bankId); if (!bank) return;
    modalConfirm(`确定删除题库「${bank.name}」及其全部 ${bank.items.length} 道题和进度？\n此操作不可恢复。`, { okText: "删除", danger: true })
      .then((ok) => {
        if (!ok) return;
        BANKS = BANKS.filter((b) => b.id !== bankId);
        delete PROG[bankId];
        if (SET.activeBank === bankId) SET.activeBank = null;
        saveBanks(); saveProg(); saveSet();
        bankView = { mode: "list", id: null };
        toast("已删除题库"); renderBank(); renderStats();
      });
  }

  // 题库详情：该库内的练习/复习/编辑/导出/删除
  function renderBankDetail(bankId) {
    const bank = findBank(bankId); if (!bank) { bankView = { mode: "list", id: null }; return renderBank(); }
    SET.activeBank = bankId; saveSet();
    const s = statsFor(bank);
    const cp = s.total ? Math.round(s.mastered / s.total * 100) : 0;
    const root = $("#view-bank");
    root.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:center;">
          <button class="btn ghost sm" id="bk-back">‹ 题库列表</button>
          <h3 style="margin:0 0 0 8px;">${escapeHtml(bank.name)}</h3>
        </div>
        <div class="bank-bar big" style="margin:12px 0 6px;"><div class="bank-bar-fill" style="width:${cp}%"></div></div>
        <div class="muted">${s.total} 题 · 掌握 ${s.mastered} · 待复习 ${s.due} · 薄弱 ${s.wrong}</div>
        <div class="row" style="margin-top:12px;">
          <button class="btn primary" id="bd-prac">开始练习</button>
          <button class="btn" id="bd-review">复习(${s.due})</button>
        </div>
        <div class="row" style="margin-top:8px;">
          <button class="btn ghost" id="bd-edit">编辑题库</button>
          <button class="btn ghost" id="bd-export">导出CSV</button>
          <button class="btn ghost" id="bd-imp">导入覆盖</button>
          <button class="btn ghost" id="bd-del" style="color:var(--bad)">删除题库</button>
        </div>
        <input type="file" id="bd-file" accept="*/*" class="hidden" />
      </div>
      <div id="bd-editor"></div>`;
    $("#bk-back", root).addEventListener("click", () => { bankView = { mode: "list", id: null }; renderBank(); });
    $("#bd-prac", root).addEventListener("click", () => { SET.activeBank = bankId; saveSet(); showTab("quiz"); });
    $("#bd-review", root).addEventListener("click", () => { SET.activeBank = bankId; saveSet(); startReview({ bankId }); });
    $("#bd-edit", root).addEventListener("click", () => renderBankEditor(bankId));
    $("#bd-export", root).addEventListener("click", () => exportCsv(bank));
    $("#bd-imp", root).addEventListener("click", () => $("#bd-file", root).click());
    $("#bd-file", root).addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const apply = (items) => {
        if (!items || !items.length) { toast("未解析到题目"); e.target.value = ""; return; }
        modalConfirm(`将用这 ${items.length} 题「覆盖」题库「${bank.name}」？\n原有题目与进度会被清空。`, { okText: "覆盖", danger: true })
          .then((ok) => {
            if (!ok) { e.target.value = ""; return; }
            bank.items = items; delete PROG[bankId]; saveBanks(); saveProg();
            e.target.value = "";
            toast(`已覆盖题库「${bank.name}」`); renderBankDetail(bankId); renderStats();
          });
      };
      if (isExcel) {
        if (!window.XLSX) { toast("表格解析库未加载"); e.target.value = ""; return; }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const banks = Y.parseXlsx(reader.result);
            if (banks.length) apply(banks[0].items); else toast("Excel 中未解析到题目");
          } catch (err) { toast("Excel 解析失败：" + (err.message || err)); }
          e.target.value = "";
        };
        reader.onerror = () => { toast("读取失败"); e.target.value = ""; };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => { apply(Y.parseCsv(reader.result)); e.target.value = ""; };
        reader.onerror = () => { toast("读取失败"); e.target.value = ""; };
        reader.readAsText(file, "UTF-8");
      }
    });
    $("#bd-del", root).addEventListener("click", () => deleteBank(bankId));
  }

  // 题库内表格编辑（知识类型/题干/答案/选项，输入即存）
  function renderBankEditor(bankId) {
    const bank = findBank(bankId); if (!bank) return;
    const box = $("#bd-editor");
    box.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:flex-end;">
          <input type="text" id="ed-search" class="cell" placeholder="搜题干/答案…" style="flex:1;min-width:120px;" />
          <button class="btn" id="ed-add">+ 新增题目</button>
        </div>
        <div class="muted" style="margin-top:6px;">知识类型填 填空/单选/多选。<b>选择题</b>：正确项前加 *（如 *北京），其余选项正常列在后面；Excel 里每列一个选项、CSV 里用 | 分隔各选项（| 等同 Excel 的列，不会出现在答案里）。<b>填空题</b>：题干用 ____ 标空位、答案用 ｜ 分隔多空。修改自动保存。</div>
      </div>
      <div class="table-wrap">
        <table class="bank-table">
          <thead><tr><th>知识类型</th><th>题干</th><th>答案</th><th>选项(|分隔)</th><th></th></tr></thead>
          <tbody id="ed-tbody"></tbody>
        </table>
      </div>`;
    let kw = "";
    const draw = () => {
      const tb = $("#ed-tbody", box);
      let list = bank.items;
      if (kw) list = list.filter((x) => (x.q + x.a + (x.options || "")).toLowerCase().includes(kw.toLowerCase()));
      if (!list.length) { tb.innerHTML = `<tr><td colspan="5" class="empty">没有题目，点「+ 新增题目」。</td></tr>`; return; }
      tb.innerHTML = list.map((x, idx) => {
        const st = P(bankId, x.id);
        const badge = isMastered(bankId, x.id) ? '<span class="tag ok">已掌握</span>'
          : isWrong(bankId, x.id) ? '<span class="tag bad">薄弱</span>'
          : st ? '<span class="tag blue">学习中</span>' : '<span class="tag">未学</span>';
        return `<tr data-id="${escapeAttr(x.id)}">
          <td><select class="cell type" data-f="type">${Y.TYPES.map((t) => `<option ${t === x.type ? "selected" : ""}>${t}</option>`).join("")}</select></td>
          <td><textarea class="cell q" data-f="q" rows="2">${escapeHtml(x.q)}</textarea></td>
          <td><textarea class="cell a" data-f="a" rows="2">${escapeHtml(x.a)}</textarea></td>
          <td><textarea class="cell opt" data-f="options" rows="2" placeholder="选择题填，用|分隔">${escapeHtml(x.options || "")}</textarea></td>
          <td><div class="cell-ops">${badge}<button class="btn ghost sm del" data-del="${escapeAttr(x.id)}" style="color:var(--bad)">删</button></div></td>
        </tr>`;
      }).join("");
      $all(".cell", tb).forEach((inp) => inp.addEventListener("input", () => {
        const tr = inp.closest("tr"); const id = tr.dataset.id;
        const it = bank.items.find((x) => x.id === id); if (!it) return;
        let v = inp.value;
        if (inp.dataset.f === "type" && !Y.TYPES.includes(v)) v = "填空";
        it[inp.dataset.f] = v;
        clearTimeout(inp._t); inp._t = setTimeout(() => { saveBanks(); }, 400);
      }));
      $all("[data-del]", tb).forEach((b2) => b2.addEventListener("click", () => {
        const it = bank.items.find((x) => x.id === b2.dataset.del);
        const name = it ? it.q.slice(0, 20) : "";
        modalConfirm(`删除题目：「${name}…」？`, { okText: "删除", danger: true })
          .then((ok) => {
            if (!ok) return;
            bank.items = bank.items.filter((x) => x.id !== b2.dataset.del);
            delete (PROG[bankId] || {})[b2.dataset.del];
            saveBanks(); saveProg();
            draw(); renderBankDetail(bankId);
          });
      }));
    };
    $("#ed-search", box).addEventListener("input", (e) => { kw = e.target.value; draw(); });
    $("#ed-add", box).addEventListener("click", () => {
      bank.items.unshift({ id: Y.genId(), type: "填空", q: "", a: "", options: "" });
      saveBanks(); draw();
      const first = $("#ed-tbody tr .cell.q", box); if (first) first.focus();
      toast("已新增一行，填写后自动保存");
    });
    draw();
  }

  // ---------- 答题配置首页（按题库 + 知识类型） ----------
  function bankOptions(selected) {
    const opts = BANKS.map((b) => `<option value="${escapeAttr(b.id)}" ${b.id === selected ? "selected" : ""}>${escapeHtml(b.name)}（${b.items.length}）</option>`).join("");
    return `<option value="all" ${selected === "all" ? "selected" : ""}>全部题库</option>` + opts;
  }
  function renderQuizHome() {
    const root = $("#view-quiz");
    const sel = SET.activeBank && findBank(SET.activeBank) ? SET.activeBank : "all";
    root.innerHTML = `
      <div class="card">
        <h3>开始答题</h3>
        <div class="field"><label>选择题库（独立知识体系）</label>
          <select id="qz-bank">${bankOptions(sel)}</select>
        </div>
        <div class="field"><label>知识类型</label>
          <select id="qz-type">
            <option value="all">全部题型</option>
            <option value="填空">填空题</option>
            <option value="单选">单选题</option>
            <option value="多选">多选题</option>
          </select>
        </div>
        <div class="field"><label>顺序</label>
          <select id="qz-order">
            <option value="rand">随机</option>
            <option value="seq">顺序</option>
          </select>
        </div>
        <button class="btn primary block" id="qz-start">开始练习</button>
        <button class="btn ghost block" id="qz-start-wrong" style="margin-top:8px;">只练薄弱/错题</button>
      </div>`;
    const start = (filterWrong) => {
      const cfg = { bankId: $("#qz-bank", root).value, type: $("#qz-type", root).value, order: $("#qz-order", root).value };
      SET.activeBank = cfg.bankId === "all" ? SET.activeBank : cfg.bankId; saveSet();
      if (filterWrong) cfg.onlyWrong = true;
      startQuiz(cfg);
    };
    $("#qz-start", root).addEventListener("click", () => start(false));
    $("#qz-start-wrong", root).addEventListener("click", () => start(true));
  }

  // ---------- 答题流程 ----------
  const Q = { queue: [], pos: 0, correct: 0, wrong: 0, cfg: null, mode: "quiz" };
  let keyHandler = null;
  function clearKey() { if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; } }

  // 收集题目为队列条目 {bankId, item}
  function collect(cfg) {
    let entries = [];
    const banks = cfg.bankId && cfg.bankId !== "all" ? [findBank(cfg.bankId)] : BANKS;
    banks.forEach((b) => {
      if (!b) return;
      b.items.forEach((it) => {
        if (cfg.type && cfg.type !== "all" && it.type !== cfg.type) return;
        if (cfg.onlyWrong && !(isWrong(b.id, it.id) || reviewDue(b.id, it.id))) return;
        entries.push({ bankId: b.id, item: it });
      });
    });
    return entries;
  }

  function startQuiz(cfg) {
    let list = collect(cfg);
    if (!list.length) { toast("没有符合条件的题目"); return; }
    if (cfg.order === "rand") list = Y.shuffle(list);
    Q.queue = list; Q.pos = 0; Q.correct = 0; Q.wrong = 0; Q.cfg = cfg; Q.mode = "quiz";
    showTab("quiz");
    renderQuestion();
  }
  function startReview(cfg) {
    let list = collect(Object.assign({}, cfg, { onlyWrong: true }));
    if (!list.length) { toast("当前没有待复习的题目 🎉"); return; }
    list = Y.shuffle(list);
    Q.queue = list; Q.pos = 0; Q.correct = 0; Q.wrong = 0; Q.cfg = cfg; Q.mode = "review";
    showTab("quiz");
    renderQuestion();
  }

  function getOptions(bankId, item) {
    if (item.options && item.options.trim()) return item.options.split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
    if (item.type === "填空") return [];
    const bank = findBank(bankId);
    return Y.buildChoices(bank ? bank.items : [], item);
  }

  function renderQuestion() {
    clearKey();
    if (Q.pos >= Q.queue.length) return finishQuiz();
    const entry = Q.queue[Q.pos];
    const item = entry.item, bankId = entry.bankId;
    const area = $("#view-quiz");
    const typeCls = item.type === "填空" ? "t-fill" : item.type === "单选" ? "t-single" : "t-multi";
    let body = "";
    if (item.type === "填空") {
      const blanks = Y.fillBlankCount(item.q, item.a);
      const ansParts = Y.splitFillAnswer(item.a);
      const stem = (item.q || "").split(Y.FILL_BLANK);
      // 题干片段与输入框交错渲染：片段0 + 框0 + 片段1 + 框1 ...
      let stemHtml = "", ph = "";
      if (stem.length > 1) {
        for (let i = 0; i < stem.length - 1; i++) {
          stemHtml += `<span class="stem-seg">${escapeHtml(stem[i])}</span>`;
          stemHtml += `<input class="fill-input" data-k="${i}" placeholder="第${i + 1}空" autocomplete="off" />`;
        }
        stemHtml += `<span class="stem-seg">${escapeHtml(stem[stem.length - 1])}</span>`;
      } else {
        // 题干无下划线占位：退化为一串连续填空框
        for (let i = 0; i < blanks; i++) stemHtml += `<input class="fill-input" data-k="${i}" placeholder="第${i + 1}空" autocomplete="off" /> `;
      }
      body = `<div class="fill-wrap">${stemHtml}</div>`;
    } else {
      const opts = getOptions(bankId, item);
      const inputType = item.type === "单选" ? "radio" : "checkbox";
      body = opts.map((o, i) => `
        <label class="opt"><input type="${inputType}" name="opt" value="${escapeAttr(o)}" /> <span>${escapeHtml(o)}</span></label>`).join("");
    }
    const bankName = (findBank(bankId) || {}).name || "";
    area.innerHTML = `
      <div class="q-card">
        <div class="q-meta">
          <span class="badge-type ${typeCls}">${item.type}</span>
          <span class="badge-cat">${escapeHtml(bankName)}</span>
          <span class="q-idx">${Q.pos + 1}/${Q.queue.length}${Q.mode === "review" ? " · 复习" : ""}</span>
        </div>
        <div class="q-stem">${escapeHtml(item.q)}</div>
        <div class="q-body">${body}</div>
        <button class="btn primary block" id="submit-btn">提交</button>
        <div class="q-feedback" id="q-feedback"></div>
      </div>`;
    const submit = () => submitAnswer(entry);
    $("#submit-btn", area).addEventListener("click", submit);
    if (item.type === "填空") {
      const fills = $all(".fill-input", area);
      fills.forEach((fi, i) => {
        if (i === 0) fi.focus();
        fi.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (i < fills.length - 1) fills[i + 1].focus();
            else submit();
          }
        });
      });
    } else { const first = $(".opt input", area); if (first) first.focus(); }
  }

  function submitAnswer(entry) {
    const item = entry.item;
    let userAns, correct;
    if (item.type === "填空") {
      const inputs = $all(".fill-input", $("#view-quiz"));
      const ansParts = Y.splitFillAnswer(item.a);
      const got = inputs.map((el) => el.value.trim());
      const res = Y.checkFillAnswer(item, got);
      correct = res.ok;
      // 逐框高亮：严格模式按位；宽松模式只标记「是否填了有效答案」
      if (Y.isStrictFill(item)) {
        for (let i = 0; i < inputs.length; i++) {
          const a = ansParts[i] || "";
          const pass = (got[i] || "") && Y.normalize(got[i]) === Y.normalize(a);
          const el = inputs[i];
          el.classList.remove("fi-ok", "fi-bad"); el.classList.add(pass ? "fi-ok" : "fi-bad");
          el.dataset.correct = pass ? "" : a;
        }
      } else {
        // 宽松模式：框只标是否非空格（对错由集合比对决定，不按位标红）
        const hitCount = res.per.filter(Boolean).length;
        inputs.forEach((el, i) => {
          const filled = !!(got[i] && got[i].trim());
          el.classList.remove("fi-ok", "fi-bad");
          el.classList.add(filled ? "fi-ok" : "fi-bad");
          el.dataset.correct = ""; // 集合模式不按位给标准答案
        });
        void hitCount;
      }
      userAns = got.join(" / ");
    } else if (item.type === "单选") {
      const sel = $(".opt input:checked", $("#view-quiz"));
      userAns = sel ? sel.value : "";
      correct = sel ? Y.normalize(sel.value) === Y.normalize(item.a) : false;
    } else {
      const sels = $all(".opt input:checked", $("#view-quiz")).map((x) => x.value);
      userAns = sels.join(" | ");
      const ans = item.a.split(/[｜|]/).map((s) => Y.normalize(s)).sort();
      const got = sels.map((s) => Y.normalize(s)).sort();
      correct = ans.length === got.length && ans.every((v, i) => v === got[i]);
    }
    if (item.type !== "填空" && !userAns) { toast("请先作答"); return; }
    if (item.type === "填空" && !userAns.trim()) { toast("请先作答"); return; }
    correct ? Q.correct++ : Q.wrong++;
    recordAnswer(entry.bankId, item.id, correct);
    showFeedback(entry, correct);
  }

  function showFeedback(entry, correct) {
    const item = entry.item;
    const fb = $("#q-feedback", $("#view-quiz"));
    let answerHtml;
    if (item.type === "填空") {
      const ansParts = Y.splitFillAnswer(item.a);
      if (Y.isStrictFill(item)) {
        // 严格模式：逐位展示标准答案与你的填写
        answerHtml = `<div class="fb-fill-ans">` + ansParts.map((a, i) => {
          const el = $(`.fill-input[data-k="${i}"]`, $("#view-quiz"));
          const wrong = el && el.dataset.correct !== undefined && el.dataset.correct !== "";
          return `<div class="fb-blank ${wrong ? "wrong" : "right"}"><b>第${i + 1}空：</b>${escapeHtml(a)}${wrong ? ` <span class="fb-your">（你填：${escapeHtml(el.value || "（空）")}）</span>` : ` <span class="fb-your">（你填对 ✓）</span>`}</div>`;
        }).join("") + `</div>`;
      } else {
        // 宽松模式（顺序无关，集合比对）：列全部标准答案，命中打勾、未命中提示
        const res = Y.checkFillAnswer(item, $all(".fill-input", $("#view-quiz")).map((el) => el.value.trim()));
        answerHtml = `<div class="fb-fill-ans"><div class="fb-note muted">本题空位顺序不限，填对全部要点即可。</div>` +
          ansParts.map((a, i) => `<div class="fb-blank ${res.per[i] ? "right" : "wrong"}"><b>${res.per[i] ? "✓" : "✗"} ${escapeHtml(a)}</b></div>`).join("") +
          `</div>`;
      }
    } else {
      const answerText = item.type === "多选" ? item.a.split(/[｜|]/).join("、") : item.a;
      answerHtml = `<div class="fb-ans"><span>正确答案：</span>${escapeHtml(answerText)}</div>`;
    }
    fb.className = "q-feedback " + (correct ? "ok" : "bad");
    fb.innerHTML = `
      <div class="fb-head">${correct ? "✓ 回答正确" : "✗ 回答错误"}</div>
      ${answerHtml}
      <button class="btn primary block" id="next-btn">${Q.pos + 1 >= Q.queue.length ? "查看结果" : "下一题"}</button>`;
    const go = () => { clearKey(); Q.pos++; renderQuestion(); };
    $("#next-btn", fb).addEventListener("click", go);
    keyHandler = (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    document.addEventListener("keydown", keyHandler);
  }

  function finishQuiz() {
    clearKey();
    const area = $("#view-quiz");
    const total = Q.queue.length, acc = total ? Math.round(Q.correct / total * 100) : 0;
    area.innerHTML = `
      <div class="card result">
        <div class="big-pct">${acc}<span>%</span></div>
        <div class="hero-sub">本次 ${Q.mode === "review" ? "复习" : "练习"}共 ${total} 题 · 对 ${Q.correct} · 错 ${Q.wrong}</div>
        <div class="bar"><div class="bar-fill" style="width:${acc}%"></div></div>
        <button class="btn primary block" id="again">再来一组</button>
        <button class="btn ghost block" id="to-stats" style="margin-top:8px;">返回统计</button>
      </div>`;
    $("#again", area).addEventListener("click", () => startQuiz(Q.cfg));
    $("#to-stats", area).addEventListener("click", () => showTab("stats"));
    renderStats();
  }

  // ---------- 复习 ----------
  function renderReview() {
    const root = $("#view-review");
    const sel = SET.activeBank && findBank(SET.activeBank) ? SET.activeBank : "all";
    const dueAll = collect({ bankId: "all", onlyWrong: true });
    const dueSel = collect({ bankId: sel, onlyWrong: true });
    root.innerHTML = `
      <div class="card">
        <h3>记忆曲线复习</h3>
        <p class="muted">答错的题 10 分钟后重练；答对按第 1/2/4/7 天强化，到 7 天即掌握。</p>
        <div class="field"><label>选择题库（独立复习）</label>
          <select id="rv-bank">${bankOptions(sel)}</select>
        </div>
        <div class="row">
          <button class="btn primary" id="rv-go">开始复习（${dueSel.length}）</button>
          <button class="btn ghost" id="rv-all">全部题库（${dueAll.length}）</button>
        </div>
      </div>
      <div class="card">
        <h3>待复习清单（${dueAll.length}）</h3>
        ${dueAll.length ? `<div class="list">` + dueAll.map((e) => {
          const b = findBank(e.bankId);
          return `<div class="item"><div class="body"><div class="q">${escapeHtml(e.item.q)} <span class="badge-type ${e.item.type === "填空" ? "t-fill" : e.item.type === "单选" ? "t-single" : "t-multi"}">${e.item.type}</span></div>
          <div class="a">${escapeHtml(b ? b.name : "")} · 正确答案：${escapeHtml(e.item.type === "多选" ? e.item.a.split(/[｜|]/).join("、") : e.item.a)}</div></div></div>`;
        }).join("") + `</div>` : `<div class="empty">暂无待复习题目 🎉</div>`}
      </div>`;
    $("#rv-go", root).addEventListener("click", () => {
      const bankId = $("#rv-bank", root).value;
      SET.activeBank = bankId === "all" ? SET.activeBank : bankId; saveSet();
      startReview({ bankId });
    });
    $("#rv-all", root).addEventListener("click", () => startReview({ bankId: "all" }));
  }

  // ---------- 统计（总体 + 各题库独立） ----------
  function renderStats() {
    const root = $("#view-stats");
    const all = statsAll();
    const remain = SET.startDate ? Math.max(0, 7 - Math.floor((Date.now() - new Date(SET.startDate).getTime()) / DAY)) : 7;
    const pct = all.total ? Math.round(all.mastered / all.total * 100) : 0;
    const cards = BANKS.map((b) => {
      const s = statsFor(b); const cp = s.total ? Math.round(s.mastered / s.total * 100) : 0;
      return `<div class="bank-card" data-id="${escapeAttr(b.id)}">
        <div class="bank-name">${escapeHtml(b.name)}</div>
        <div class="bank-bar"><div class="bank-bar-fill" style="width:${cp}%"></div></div>
        <div class="bank-meta">掌握 ${s.mastered}/${s.total} · 待复习 ${s.due} · 薄弱 ${s.wrong}</div>
      </div>`;
    }).join("");
    root.innerHTML = `
      <div class="card hero">
        <div class="hero-title">一周掌握进度（全部题库）</div>
        <div class="big-pct">${pct}<span>%</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="hero-sub">已掌握 ${all.mastered} / ${all.total} 题${SET.startDate ? (remain > 0 ? ` · 距目标还有 ${remain} 天` : ` · 已超期，建议延长节奏`) : " · 开始答题即启动倒计时"}</div>
        <div class="row stats">
          <div class="stat"><div class="num">${all.due}</div><div class="lbl">待复习</div></div>
          <div class="stat"><div class="num">${all.wrong}</div><div class="lbl">薄弱题</div></div>
          <div class="stat"><div class="num">${BANKS.length}</div><div class="lbl">题库数</div></div>
        </div>
      </div>
      <div class="card">
        <h3>各题库掌握情况（独立统计）</h3>
        <p class="muted">每个题库进度独立，互不干扰。点击进入该题库。</p>
        <div class="bank-grid">${cards}</div>
      </div>`;
    $all(".bank-card", root).forEach((el) => el.addEventListener("click", () => {
      bankView = { mode: "detail", id: el.dataset.id }; showTab("bank");
    }));
  }

  // ---------- 文件导入（Excel .xlsx/.xls 或 CSV）建题库 ----------
  // Excel/CSV 第一列=题库名，可一次建多个题库；同名题库询问覆盖/副本。
  function importFileAsBanks(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // 不再靠文件名/扩展名判断格式（微信转发常截断扩展名），改读文件头魔数
    const isExcel = (buf) => {
      if (!buf || buf.byteLength < 4) return false;
      const u = new Uint8Array(buf, 0, 4);
      // xlsx: PK\x03\x04 或 PK\x05\x06; xls: D0CF11E0A1B11AE1
      if (u[0] === 0x50 && u[1] === 0x4B) return true;
      if (u[0] === 0xD0 && u[1] === 0xCF && u[2] === 0x11 && u[3] === 0xE0) return true;
      return false;
    };
    const decodeText = (buf) => {
      try { return new TextDecoder("utf-8").decode(buf); } catch (e) {}
      return "";
    };
    const decodeGbk = (buf) => {
      try { return new TextDecoder("gbk").decode(buf); } catch (e) {}
      return "";
    };
    const finish = async (banksData) => {
      if (!banksData || !banksData.length) { toast("未解析到题目，请检查文件格式"); e.target.value = ""; return; }
      let totalItems = 0, newCount = 0, coverCount = 0;
      for (const bd of banksData) {
        const exist = findBankName(bd.name);
        let name = bd.name;
        if (exist) {
          const cover = await modalConfirm(`已存在同名题库「${name}」(${exist.items.length}题)。\n\n点「覆盖」替换它；点「取消」以「${name}_副本」新建。`, { okText: "覆盖", cancelText: "副本", danger: true });
          if (cover) {
            exist.items = bd.items; delete PROG[exist.id]; saveProg(); coverCount++;
            totalItems += bd.items.length; continue;
          }
          name = name + "_副本";
        }
        const bank = { id: "u" + Date.now() + Math.random().toString(36).slice(2, 5), name, items: bd.items };
        BANKS.push(bank); newCount++;
        totalItems += bd.items.length;
      }
      saveBanks();
      e.target.value = "";
      toast(`已导入 ${banksData.length} 个题库、共 ${totalItems} 题（新建${newCount}/覆盖${coverCount}）`);
      renderBank(); renderStats();
    };
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      if (isExcel(buf)) {
        if (!window.XLSX) { toast("表格解析库未加载，请重试或改用CSV"); e.target.value = ""; return; }
        try { finish(Y.parseXlsx(buf)); }
        catch (err) { toast("Excel 解析失败：" + (err.message || err)); }
        e.target.value = "";
        return;
      }
      // 非 Excel 一律尝试当 CSV 解析，依次试 UTF-8 / GBK
      let text = decodeText(buf);
      let banksData;
      try { banksData = Y.parseCsvBanks(text, file.name); } catch (err) { banksData = null; }
      if (!banksData || !banksData.length) {
        text = decodeGbk(buf);
        if (text) try { banksData = Y.parseCsvBanks(text, file.name); } catch (err) { banksData = null; }
      }
      if (!banksData || !banksData.length) { toast("未解析到题目，请检查文件格式"); e.target.value = ""; return; }
      finish(banksData);
    };
    reader.onerror = () => { toast("读取文件失败"); e.target.value = ""; };
    reader.readAsArrayBuffer(file);
  }
  function findBankName(name) { return BANKS.find((b) => b.name === name) || null; }

  function exportCsv(bank) {
    const csv = Y.toCsv(bank.items);
    const fname = (bank.name || "题库") + ".csv";
    // 安卓 WebView：通过 JS 桥把文件写到本机；桌面浏览器退化为复制框
    if (window.Android && window.Android.saveCsv) {
      try { window.Android.saveCsv(fname, csv); return; } catch (e) {}
    }
    if (navigator.share) {
      const file = new File([csv], fname, { type: "text/csv;charset=utf-8" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: bank.name }).catch(() => {}); return;
      }
    }
    fallbackCopy(csv);
  }
  function fallbackCopy(csv) {
    let box = $("#export-box");
    if (!box) { box = document.createElement("div"); box.id = "export-box"; box.className = "modal-mask"; document.body.appendChild(box); }
    box.innerHTML = `<div class="card" style="max-width:520px;">
      <h3>导出题库 CSV</h3>
      <p class="muted">复制下面内容，粘贴到手机文件管理器新建的「题库名.csv」中保存，之后可再次导入。</p>
      <textarea class="export-area" readonly>${escapeHtml(csv)}</textarea>
      <div class="spread"><button class="btn" id="ex-copy">复制全部</button><button class="btn ghost" id="ex-close">关闭</button></div>
    </div>`;
    box.style.display = "flex";
    $("#ex-copy", box).addEventListener("click", () => {
      const ta = $(".export-area", box); ta.select();
      try { document.execCommand("copy"); toast("已复制"); } catch (e) { toast("请手动长按复制"); }
    });
    $("#ex-close", box).addEventListener("click", () => { box.style.display = "none"; });
  }

  // ---------- 主题 ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", SET.theme);
    const btn = $("#theme-btn"); if (btn) btn.textContent = SET.theme === "dark" ? "☀️" : "🌙";
  }
  function toggleTheme() { SET.theme = SET.theme === "dark" ? "light" : "dark"; saveSet(); applyTheme(); }

  // ---------- 初始化 ----------
  function init() {
    load(); applyTheme();
    $all(".bottom-nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    const tb = $("#theme-btn"); if (tb) tb.addEventListener("click", toggleTheme);
    showTab(SET.lastTab || "bank");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

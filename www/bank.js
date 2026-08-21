/* 应知应会答题 App —— 题库数据与解析（V4：题库为顶层独立单元）
 *
 * 数据模型：
 *   题库 Bank = { id, name, items:[{id,type,q,a,options}] }  —— 每个题库是独立知识体系，互不干扰
 *   知识类型 type ∈ 填空 | 单选 | 多选  —— 仅作用于单个题库内部
 *   CSV（每个文件=一个题库）：表头 知识类型,题干,答案,选项
 *
 * 题库标准（Build 2026-08-21，来自《党建知识要点汇总.xlsx》）：
 *   题型列 → type；题干列 → q（题干中的 $ 符号表示空位，渲染时转 ____ 四个下划线）；
 *   答案列(第三列及以后，可多列) → 各空答案，用 ｜ 连接成一个字符串；
 *   整张表 = 一个独立题库。后续导入(Excel/CSV)均按此标准执行。
 */
(function () {
  // ===== 种子题库：党建知识要点汇总（由 Excel 转换，已清空旧题库）=====
  const SEED_BANK_NAME = "党员应知应会";
  const SEED_ITEMS = [
{ type: "填空", q: "“四个意识”是指什么:", a: "政治意识｜大局意识｜核心意识｜看齐意识", options: "" },
{ type: "填空", q: "“四个自信”是指什么:", a: "道路自信｜理论自信｜制度自信｜文化自信", options: "" },
{ type: "填空", q: "“两个维护”是指什么:", a: "坚决维护习近平总书记党中央的核心｜全党的核心地位，坚决维护党中央权威和集中统一领导", options: "" },
{ type: "填空", q: "“四个伟大”是指什么：", a: "伟大斗争，伟大工程，伟大事业，伟大梦想", options: "" },
{ type: "填空", q: "中国共产党人的初心和使命是什么：", a: "为中国人民谋幸福，为中华民族谋复兴", options: "" },
{ type: "填空", q: "“两学一做”是指什么", a: "学党章党规｜学系列讲话，做合格党员", options: "" },
{ type: "填空", q: "“三严三实”是指什么", a: "严以修身｜严以用权｜严以律己｜谋事要实｜创业要实｜做人要实", options: "" },
{ type: "填空", q: "党的三大作风是什么", a: "理论联系实际｜密切联系群众｜批评与自我批评", options: "" },
{ type: "填空", q: "党内政治生活“四性”是指什么", a: "政治性｜时代性｜原则性｜战斗性", options: "" },
{ type: "填空", q: "“四个全面”是指什么", a: "全面建成小康社会｜全面深化改革｜全面依法治国｜全面从严治党", options: "" },
{ type: "填空", q: "“四大考验”是指什么", a: "执政考验｜改革开放考验｜市场经济考验｜外部环境考验", options: "" },
{ type: "填空", q: "“四大危险”是指什么", a: "精神懈怠的危险｜能力不足的危险｜脱离群众的危险｜消极腐败的危险", options: "" },
{ type: "填空", q: "“四讲四有”是指什么", a: "讲政治有信念，讲规矩有纪律，讲道德有品行，讲奉献有作为", options: "" },
{ type: "填空", q: "“四个合格”是指什么", a: "政治合格，执行纪律合格，品德合格，发挥作用合格", options: "" },
{ type: "填空", q: "“三大攻坚战”是指什么", a: "防范化解重大风险｜精准脱贫｜污染防治", options: "" },
{ type: "填空", q: "“两个一百年”奋斗目标是什么", a: "到建党一百年时，全面建成小康社会；到新中国成立一百年时，全面建成社会主义现代化强国", options: "" },
{ type: "填空", q: "“两步走”战略安排是什么", a: "从2020年到2035年，在全面建成小康社会的基础上，再奋斗十五年，基本实现社会主义现代化；从2035年到本世纪中叶，在基本实现现代化的基础上，再奋斗十五年，把我国建成富强民主文明和谐美丽的社会主义现代化强国", options: "" },
{ type: "填空", q: "党的“三大历史任务”是什么", a: "推进现代化建设｜完成祖国统一｜维护世界和平与促进共同发展", options: "" },
{ type: "填空", q: "社会主义核心价值观的内容是什么", a: "富强｜民主｜文明｜和谐｜自由｜平等｜公正｜法治｜爱国｜敬业｜诚信｜友善", options: "" },
{ type: "填空", q: "共产党人价值观是什么", a: "忠诚老实｜公道正派｜实事求是｜清正廉洁", options: "" },
{ type: "填空", q: "“五位一体”总体布局是指什么", a: "经济建设｜政治建设｜文化建设｜社会建设｜生态文明建设", options: "" },
{ type: "填空", q: "五大发展理念是什么", a: "创新｜协调｜绿色｜开放｜共享", options: "" },
{ type: "填空", q: "“五个文明”是指什么", a: "物质文明｜政治文明｜精神文明｜社会文明｜生态文明", options: "" },
{ type: "填空", q: "“中国梦”是指什么", a: "实现中华民族伟大复兴，是近代以来中国人民最伟大的梦想", options: "" },
{ type: "填空", q: "党的根本宗旨是什么", a: "全心全意为人民服务", options: "" },
{ type: "填空", q: "党的群众路线是什么", a: "一切为了群众，一切依靠群众，从群众中来，到群众中去，把党的正确主张变为群众的自觉行为", options: "" },
{ type: "填空", q: "党的“六大建设”是指什么", a: "政治建设｜思想建设｜组织建设｜作风建设｜纪律建设，把制度建设贯穿其中", options: "" },
{ type: "填空", q: "“四风”是指什么", a: "形式主义｜官僚主义｜享乐主义和奢靡之风", options: "" },
{ type: "填空", q: "“四个自我”是指什么", a: "自我净化｜自我完善｜自我革新｜自我提高", options: "" },
{ type: "填空", q: "党的“六大纪律”是指什么", a: "政治纪律｜组织纪律｜廉洁纪律｜群众纪律｜工作纪律｜生活纪律", options: "" },
{ type: "填空", q: "党风廉政建设责任制的责任主体是什么", a: "各级党政领导班子及其成员，领导班子中的正职为本地区、本部门、本单位党风廉政建设第一责任人", options: "" },
{ type: "填空", q: "“两个责任”是指什么", a: "党委主体责任｜纪委监督责任", options: "" },
{ type: "填空", q: "“一岗双责”是指什么", a: "在履行本职岗位管理职责的同时，还要对所在单位和分管领域的党风廉政建设负责", options: "" },
{ type: "填空", q: "中央“八项规定”的内容是什么", a: "改进调查研究｜精简会议活动｜精简文件简报｜规范出访活动｜改进警卫工作｜改进新闻报道｜严格文稿发表｜厉行勤俭节约", options: "" },
{ type: "填空", q: "监督执纪“四种形态”是指什么", a: "开展批评和自我批评｜约谈函询，让“红红脸、出出汗”成为常态｜党纪轻处分、组织调整成为违纪处理的大多数；｜党纪重处分、重大职务调整的成为少数；｜严重违纪涉嫌违法立案审查的成为极少数", options: "" },
{ type: "填空", q: "对党组织的三种问责方式是什么", a: "检查｜通报｜改组", options: "" },
{ type: "填空", q: "对党的领导干部的四种问责方式是什么", a: "通报｜诫勉｜组织调整或组织处理｜纪律处分", options: "" },
{ type: "填空", q: "对党员的五种纪律处分是什么", a: "警告｜严重警告｜撤销党内职务｜留党察看｜开除党籍", options: "" },
{ type: "填空", q: "“三重一大”制度是指什么", a: "重大事项决策｜重要干部任免｜重要项目安排｜大额资金的使用", options: "" },
{ type: "填空", q: "党内监督的形式有哪些", a: "党组织（含党员所在支部）的监督｜党员群众的监督｜党员干部相互之间的监督和专职机关的监督", options: "" },
{ type: "填空", q: "党按照什么原则选拔干部", a: "德才兼备｜以德为先", options: "" },
{ type: "填空", q: "凡是有正式党员多少以上的，都应当成立党支部", a: "3", options: "" },
{ type: "填空", q: "党支部成立的批复时间一般不超过多久", a: "1个月", options: "" },
{ type: "填空", q: "党支部委员之间、委员和党员之间、党员和党员之间，每年谈心谈话一般不少于几次", a: "不少于1次", options: "" },
{ type: "填空", q: "党支部党员大会一般$召开一次，党支部委员会会议一般$召开一次", a: "每季度｜每月", options: "" },
{ type: "填空", q: "发展党员必须把什么标准放在首位", a: "政治标准", options: "" },
{ type: "填空", q: "有正式党员多少以上的党支部，应当设立党支部委员会", a: "7人以上", options: "" },
{ type: "填空", q: "党支部委员会由什么选举产生", a: "由党支部党员大会选举产生", options: "" },
{ type: "填空", q: "党支部每月相对固定几天开展主题党日", a: "1天", options: "" },
{ type: "填空", q: "党支部委员会由$人组成，一般不超过$人", a: "3至5｜7", options: "" },
{ type: "填空", q: "党支部委员会必要时可以设几名副书记", a: "1名", options: "" },
{ type: "填空", q: "党委（党组）书记每年至少讲$次党课", a: "1", options: "" },
{ type: "填空", q: "党支部一般每年开展$次民主评议党员", a: "1", options: "" },
{ type: "多选", q: "“四个意识”是指什么:", a: "政治意识｜大局意识｜核心意识｜看齐意识", options: "政治意识｜大局意识｜核心意识｜看齐意识" },
{ type: "单选", q: "凡是有正式党员多少以上的，都应当成立党支部", a: "3", options: "1｜3｜5｜6" },
  ];

const TYPES = ["填空", "单选", "多选"];

  function genId() { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ===== 题库标准（与 Excel 导入一致）=====
  // 题干中的 $ 符号 = 空位标记，渲染时转成 ____（四个下划线）
  function applyDollar(q) { return (q || "").replace(/\$/g, "____"); }
  // 答案单元格数组（第三列及以后，可能多列）→ 用 ｜ 连接成一个答案字符串
  function answersFromCells(cells) {
    const parts = (cells || []).map((c) => (c == null ? "" : String(c).trim())).filter((s) => s);
    return parts.join("｜");
  }
  function normType(t) {
    t = (t || "").trim();
    if (t === "单选" || t === "多选") return t;
    return "填空";
  }

  // 种子 = 单一独立题库（来自《党建知识要点汇总.xlsx》，已清空旧题库）
  function buildSeedBanks() {
    const items = SEED_ITEMS.map((it, i) => ({
      id: "seed_" + i,
      type: normType(it.type),
      q: applyDollar(it.q),
      a: it.a,
      options: it.options || ""
    }));
    return [{ id: "seed_main", name: SEED_BANK_NAME, items }];
  }

  const SEED_BANKS = buildSeedBanks();

  // 填空题/答案归一化：去空白与标点，转小写，宽松比对
  function normalize(s) {
    return (s || "").toLowerCase()
      .replace(/[\s，。、；：（）()《》【】“”‘’"'．·…—\-—~！？!?.,:;()\[\]{}<>]/g, "");
  }

  // 填空题分隔符：题干里的下划线占位 + 答案里多空分隔（用全角竖线｜，避免与答案标点混淆）
  const FILL_BLANK = "____";       // 题干中的空位标记
  const FILL_SEP = "｜";            // 答案中多个空的分割符（全角竖线）
  const FILL_SEP_ALT = "|";         // 兼容半角竖线

  // 把填空题答案拆成多个空（按分隔符；无分隔符则整体为 1 空）
  function splitFillAnswer(a) {
    if (!a) return [];
    const re = new RegExp("[｜|]", "g"); // 全角｜或半角| 都作分隔
    return String(a).split(re).map((s) => s.trim()).filter((s, i, arr) => s || i < arr.length - 1 || arr.length === 1);
  }

  // 题干里 ____ 占位符的数量（即空位数）；答案空位数取两者较大者
  function fillBlankCount(q, a) {
    const qn = (q || "").split(FILL_BLANK).length - 1;
    const an = splitFillAnswer(a).length;
    return Math.max(qn, an, 1);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 填空题是否「严格按位对应」：
  //   题干里含 ____ 占位符(由 $ 渲染而来) → 严格模式，每空必须填在对应位置；
  //   题干无占位符(纯用 ｜ 分隔多空) → 宽松模式，只需集合匹配，顺序可错。
  function isStrictFill(item) {
    return (item && (item.q || "").indexOf(FILL_BLANK) >= 0);
  }

  // 填空题判分（支持多空）：
  //   严格模式 -> 逐位比对；
  //   宽松模式 -> 集合比对（填的值与标准答案一一匹配即可，顺序无关）。
  // 返回 { ok, per:[bool...] }，per 长度与 ansParts 对齐，标记每个标准空是否被命中。
  function checkFillAnswer(item, gotArr) {
    const ansParts = splitFillAnswer(item.a);
    const got = (gotArr || []).map((g) => (g || "").trim());
    const strict = isStrictFill(item);
    if (strict) {
      let ok = true;
      const per = ansParts.map((a, i) => {
    const g = got[i] || "";
    const pass = Y_normalizeEqual(g, a);
    if (!pass) ok = false;
    return pass;
  });
      return { ok: ok && got.some((g) => g), per };
    }
    // 宽松：把已填值做个归一化集合，标准答案逐项去命中（每个标准答案匹配一个用户值）
    const pool = got.filter((g) => g).map((g) => normalize(g));
    const used = new Array(pool.length).fill(false);
    let allHit = true;
    const per = ansParts.map((a) => {
      const na = normalize(a);
      let hitIdx = -1;
      for (let i = 0; i < pool.length; i++) {
        if (!used[i] && pool[i] === na) { hitIdx = i; break; }
      }
      if (hitIdx >= 0) { used[hitIdx] = true; return true; }
      allHit = false; return false;
    });
    // 多填了标准里没有的值，也算错
    const extra = used.some((u) => !u);
    return { ok: allHit && !extra && got.some((g) => g), per };
  }
  function Y_normalizeEqual(g, a) { return normalize(g) === normalize(a); }

  // 选择题无 options 时，自动从「同一题库内」抽干扰项生成 4 选项（含正确答案）
  function buildChoices(items, item, n) {
    n = n || 4;
    const correct = item.a;
    const pool = items.filter((x) => x.id !== item.id && x.a !== correct && !x.options);
    const distract = [];
    const pushUnique = (arr) => {
      for (const v of arr) {
        if (distract.length >= n - 1) break;
        if (v !== correct && !distract.includes(v)) distract.push(v);
      }
    };
    pushUnique(shuffle(pool).map((x) => x.a));
    while (distract.length < n - 1) distract.push("（暂无合适干扰项）");
    return shuffle([correct].concat(distract));
  }

  // 选择题选项解析。
  // 入参 cells = 已经按「列」切好的选项数组（Excel 每列一项；CSV 已由调用方按 | 切好每 | 一段一项）。
  // 规则（用户硬标准）：
  //   - 正确答案在其选项前加 * 标记；* 仅是标记，不属于答案文字，必须去除。
  //   - 其余选项只是选项，不是正确答案。
  //   - 多选可有多个 * 正确项。
  // 返回 { a, options }：
  //   a = 正确选项（多选用 ｜ 连接），options = 全部选项（去 *，用 ｜ 连接）。
  // 若没有任何选项带 *，返回 null（交由调用方决定兜底）。
  function parseChoiceColumns(cells) {
    const cols = (cells || []).map((c) => (c == null ? "" : String(c).trim())).filter((s) => s);
    if (!cols.length) return null;
    const opts = [];
    const correct = [];
    let hasMark = false;
    for (const c of cols) {
      if (c.charAt(0) === "*") { hasMark = true; const v = c.slice(1).trim(); opts.push(v); correct.push(v); }
      else opts.push(c);
    }
    if (!hasMark) return null; // 无 * 标记 -> 不是新标准
    return { a: correct.join("｜"), options: opts.join("｜") };
  }

  // ---------- CSV（每个文件=一个题库，结构化 4 列） ----------
  function csvCell(s) {
    s = s == null ? "" : String(s);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // CSV 文本 -> 二维数组（处理引号/逗号/换行）
  function parseRows(text) {
    const out = [];
    let i = 0, field = "", row = [], inQ = false;
    const s = String(text || "");
    while (i < s.length) {
      const c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(field); field = ""; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); out.push(row); row = []; field = ""; i++; continue; }
      field += c; i++; continue;
    }
    if (field.length || row.length) { row.push(field); out.push(row); }
    return out;
  }

  // CSV 文本 -> 题目数组（一个文件=一个题库；识别表头；兼容旧 5 列含“分类”）
  // 支持的表头：
  //   A) 知识类型,题干,答案,选项   （无题库列，题库名取文件名）
  //   B) 题库,题型,题干,答案       （首列为题库名，与 Excel 一致）
  //   C) 分类,题型,题干,答案,选项   （旧 5 列格式）
  function detectCsvMode(head) {
    const h = head.map((c) => (c || "").trim());
    if (h.includes("题库")) return "bank";      // B：首列=题库名
    if (h.includes("分类")) return "cat";        // C：旧格式
    return "plain";                              // A：无题库列
  }

  function parseCsv(text) {
    const rows = parseRows(text).filter((r) => r.some((c) => (c || "").trim()));
    if (!rows.length) return [];
    const head = rows[0].map((c) => (c || "").trim());
    const isHead = (head.includes("题型") || head.includes("知识类型") || head.includes("题库")) &&
                   (head.includes("题干") || head.includes("答案"));
    let start = isHead ? 1 : 0;
    const mode = detectCsvMode(head);
    const out = [];
    for (let k = start; k < rows.length; k++) {
      const r = rows[k];
      let type, q, a, opt;
      if (mode === "bank") {            // 题库,题型,题干,答案
        type = normType(r[1]); q = applyDollar(r[2]); a = (r[3] || "").trim(); opt = "";
      } else if (mode === "cat") {      // 分类,题型,题干,答案,选项
        type = normType(r[1]); q = applyDollar(r[2]); a = (r[3] || "").trim(); opt = (r[4] || "").trim();
      } else {                          // 知识类型,题干,答案,选项
        type = normType(r[0]); q = applyDollar(r[1]); a = (r[2] || "").trim(); opt = (r[3] || "").trim();
      }
      // 选择题：第 3 列起为选项（CSV 用 | 当列分隔符，等同 Excel 的列；* 标正确项）
      // 规则：| 只作列分隔，不会出现在答案文字里。所以把第 3 列按 | 切成选项段。
      if ((type === "单选" || type === "多选")) {
        const third = (r[2] || "").trim();
        const seg = third.split(/[｜|]/).map((s) => s.trim()).filter((s) => s);
        const pc = parseChoiceColumns(seg);
        if (pc) { a = pc.a; opt = pc.options; }
      }
      if (!q || !a) continue;
      out.push({ id: genId(), type, q, a, options: opt });
    }
    return out;
  }

  // CSV 文本 -> 按题库名分组的多个题库 [{name, items}]
  // 当 CSV 首列为「题库」时使用；否则整文件作为一个题库（名字取 fileName）。
  function parseCsvBanks(text, fileName) {
    const rows = parseRows(text).filter((r) => r.some((c) => (c || "").trim()));
    if (!rows.length) return [];
    const head = rows[0].map((c) => (c || "").trim());
    const isHead = (head.includes("题型") || head.includes("知识类型") || head.includes("题库")) &&
                   (head.includes("题干") || head.includes("答案"));
    const mode = detectCsvMode(head);
    if (mode !== "bank") {
      const items = parseCsv(text);
      return items.length ? [{ name: (fileName || "导入题库").replace(/\.csv$/i, "").trim() || "导入题库", items }] : [];
    }
    let start = isHead ? 1 : 0;
    const banksMap = {};
    for (let k = start; k < rows.length; k++) {
      const r = rows[k];
      const name = String(r[0] || "").trim();
      if (!name) continue;
      const type = normType(r[1]);
      const q = applyDollar(String(r[2] || "").trim());
      let a = (r[3] || "").trim(), opt = "";
      if (type === "单选" || type === "多选") {
        const seg = a.split(/[｜|]/).map((s) => s.trim()).filter((s) => s);
        const pc = parseChoiceColumns(seg);
        if (pc) { a = pc.a; opt = pc.options; }
      }
      if (!q || !a) continue;
      if (!banksMap[name]) banksMap[name] = [];
      banksMap[name].push({ id: genId(), type, q, a, options: opt });
    }
    return Object.keys(banksMap).map((name) => ({ name, items: banksMap[name] }));
  }

  // 题目数组 -> CSV 文本（带表头 + BOM）
  // 统一 4 列：知识类型,题干,答案,选项
  //   - 选择题：第3列=选项（用 | 当列分隔符，等同 Excel 的列；正确项前加 *），与导入标准一致。
  //   - 填空：第3列=答案（多空用 | 连接），第4列留空。
  function toCsv(items) {
    const header = ["知识类型", "题干", "答案", "选项"];
    const rows = [header].concat((items || []).map((x) => {
      if (x.type === "单选" || x.type === "多选") {
        const opts = (x.options || "").split("｜").map((s) => (s || "").trim()).filter(Boolean);
        const correct = (x.a || "").split("｜").map((s) => (s || "").trim());
        const seg = opts.map((o) => (correct.includes(o) ? "*" + o : o));
        return [x.type, x.q, seg.join("|"), ""];
      }
      // 填空：答案列用 ｜ 连接多空
      return [x.type, x.q, x.a, ""];
    }));
    return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  }

  // ---------- Excel 解析（SheetJS）：第一列=题库名，第二列=题型，第三列=题干，第四列起=选项 ----------
  // 选择题：第四列起为选项（每列一个），正确项前加 *；填空题：第四列起为各空答案(用 ｜ 连接)。
  // 支持 .xlsx/.xls；一个文件可含多个题库（按第一列题库名分组）。
  // 返回 [{name, items:[{id,type,q,a,options}]}]
  function parseXlsx(arrayBuffer) {
    if (!window.XLSX) { throw new Error("未加载表格解析库"); }
    const wb = window.XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const banksMap = {};   // name -> items[]
    wb.SheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
      // 跳过空行；首行若为表头(含"题型"/"题库")则跳过
      let start = 0;
      if (rows.length) {
        const h = (rows[0] || []).map((c) => String(c || "").trim());
        if (h.includes("题库") || h.includes("题型") || h.includes("题干")) start = 1;
      }
      for (let k = start; k < rows.length; k++) {
        const r = rows[k];
        if (!r || !r.some((c) => String(c || "").trim())) continue;
        const name = String(r[0] || "").trim();
        const type = normType(r[1]);
        const q = applyDollar(String(r[2] || "").trim());
        // 第四列起：选择题=选项列(正确项加*)，填空题=各空答案
        const ansCells = [];
        for (let c = 3; c < r.length; c++) ansCells.push(r[c]);
        let a = "", opt = "";
        if (type === "单选" || type === "多选") {
          // Excel：第四列起每个单元格=一个选项，* 标正确项；无 * 则选项缺失，留空走随机兜底
          const pc = parseChoiceColumns(ansCells);
          if (pc) { a = pc.a; opt = pc.options; }
        } else {
          // 填空：第四列起各空答案，用 ｜ 连接
          a = answersFromCells(ansCells);
        }
        if (!name || !q || !a) continue;
        if (!banksMap[name]) banksMap[name] = [];
        banksMap[name].push({ id: genId(), type, q, a, options: opt });
      }
    });
    return Object.keys(banksMap).map((name) => ({ name, items: banksMap[name] }));
  }

  // 文章文本批量导入（兼容“数字. 词条：答案”格式，默认填空，用于从文章快速建库）
  function parseImportText(text) {
    const lines = (text || "").split(/\r?\n/);
    const out = [];
    const re1 = /^\s*\d+[.、)]\s*([^：:？?]+)[：:]\s*(.+)$/;
    const re2 = /^\s*\d+[.、)]\s*([^：:？?]+[？?])\s*(.+)$/;
    for (const line of lines) {
      const m = line.match(re1) || line.match(re2);
      if (m) out.push({ id: genId(), type: "填空", q: m[1].trim(), a: m[2].trim(), options: "" });
    }
    return out;
  }

  window.YKY = {
    SEED_BANKS, TYPES, genId,
    normalize, shuffle, buildChoices,
    csvCell, parseCsv, parseCsvBanks, parseXlsx, toCsv, parseImportText,
    applyDollar, answersFromCells, SEED_BANK_NAME,
    FILL_BLANK, FILL_SEP, FILL_SEP_ALT, splitFillAnswer, fillBlankCount,
    isStrictFill, checkFillAnswer, parseChoiceColumns
  };
})();

/* ============================================================
 * 间隔重复记忆引擎（基于 SM-2 算法 + 学生掌握度建模）
 *
 * 每个单词的学习状态（Card）：
 *   {
 *     word, grade,
 *     ef,        // ease factor 难度系数，初始 2.5
 *     reps,      // 连续答对次数
 *     interval,  // 当前复习间隔（天）
 *     due,       // 下次到期时间戳(ms)
 *     mastery,   // 掌握度 0~100
 *     errorCount,// 累计错误次数
 *     lastResult,// 最近一次评价
 *     wrongTypes // { spelling, similar, meaning } 各类错误累计次数
 *   }
 * ============================================================ */
window.SpacedEngine = (function () {

  const DAY = 24 * 60 * 60 * 1000;

  // SM-2 依据评分计算
  function sm2(q, ef, reps) {
    // q: 0-5 记忆质量评价
    if (q < 3) {
      // 回答出错：间隔重置，难度降低
      const newEF = Math.max(1.3, ef - 0.2);
      return { ef: newEF, interval: 0, reps: 0 };
    }
    // 回答正确：按 SM-2 递增
    let newEF = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    newEF = Math.max(1.3, Math.min(2.8, newEF));
    let interval;
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(intervalOf(reps, ef) * newEF);
    return { ef: newEF, interval: interval, reps: reps + 1 };
  }

  // 根据连续答对次数推算间隔（供算法内部使用）
  function intervalOf(reps, ef) {
    if (reps <= 1) return 6;
    if (reps === 2) return 6 * ef;
    return Math.round(6 * Math.pow(ef, reps - 1));
  }

  function defaultCard(word, grade) {
    return {
      word: word,
      grade: grade,
      ef: 2.5,
      reps: 0,
      interval: 0,
      due: Date.now(), // 新词说明立即到期（待学习）
      mastery: 0,
      errorCount: 0,
      lastResult: null,
      wrongTypes: { spelling: 0, similar: 0, meaning: 0 },
      lastType: null,
      history: []
    };
  }

  /**
   * 记录一次复习评价
   * @param card 当前 Card
   * @param q    0-5
   * @returns 更新后的 Card
   */
  function review(card, q) {
    const r = sm2(q, card.ef, card.reps);
    card.ef = r.ef;
    card.interval = r.interval;
    card.reps = r.reps;
    card.due = Date.now() + r.interval * DAY;
    // 掌握度建模
    if (q < 3) {
      card.mastery = Math.max(0, card.mastery - (5 - q) * 18);
      card.errorCount++;
    } else {
      card.mastery = Math.max(0, Math.min(100, card.mastery + q * 6 + card.interval * 1.5));
    }
    card.lastResult = q;
    card.reviewCount = (card.reviewCount || 0) + 1;
    card.history.push({ t: Date.now(), q: q, interval: card.interval });
    if (card.history.length > 50) card.history.shift();
    return card;
  }

  /**
   * 记录一次作答错误（自测/默写），标记错误类型
   */
  function recordError(card, type) {
    card.errorCount = (card.errorCount || 0) + 1;
    if (!card.wrongTypes) card.wrongTypes = { spelling: 0, similar: 0, meaning: 0 };
    card.wrongTypes[type] = (card.wrongTypes[type] || 0) + 1;
    card.lastType = type;
    // 出错会拉低掌握度、提前复习
    card.mastery = Math.max(0, (card.mastery || 0) - 12);
    card.lastResult = 0;
    card.due = Date.now(); // 落入错词本，需优先复习
    return card;
  }

  function isDue(card) {
    return !card.due || card.due <= Date.now();
  }

  function needAttention(card) {
    return isDue(card) || card.mastery < 60;
  }

  // 掌握等级中文
  function masteryLevel(m) {
    if (m >= 90) return "掌握";
    if (m >= 75) return "熟练";
    if (m >= 60) return "过关";
    if (m >= 40) return "薄弱";
    return "陌生";
  }

  function masteryColor(m) {
    if (m >= 90) return "#2ecc71";
    if (m >= 60) return "#3aa7ff";
    if (m >= 40) return "#ff9f43";
    return "#f25c5c";
  }

  return {
    DAY: DAY,
    defaultCard: defaultCard,
    review: review,
    recordError: recordError,
    isDue: isDue,
    needAttention: needAttention,
    masteryLevel: masteryLevel,
    masteryColor: masteryColor
  };
})();
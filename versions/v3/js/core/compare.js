/* ============================================================
 * NLP 比对模块
 * 用于自动识别默写/作答错误，并区分为三类：
 *   spelling  拼写失误   —— 与正确拼写接近但并非一个真实单词
 *   similar   形近词混淆 —— 写成了另一个形状相近的真实英语单词
 *   meaning   词义答错   —— 词义理解错误
 * ============================================================ */
window.CompareModule = (function () {

  // ---------- 基础距离算法 ----------
  function levenshtein(a, b) {
    a = String(a); b = String(b);
    const m = a.length, n = b.length;
    const dp = new Array(m + 1);
    for (let i = 0; i <= m; i++) dp[i] = new Array(n + 1);
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  // 相似度 0~1（1 为完全相同）
  function similarityRatio(a, b) {
    const d = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - d / maxLen;
  }

  // ---------- 词形特征：LCS 起点一致性（判断形近程度） ----------
  // 是否"从长相上"接近：字符相似度高，且首字母一致或长度相近
  function visualSimilar(a, b) {
    const sim = similarityRatio(a, b);
    const firstOK = a[0] === b[0];
    const lenOK = Math.abs(a.length - b.length) <= Math.max(1, Math.floor(a.length / 3));
    return sim >= 0.45 && (firstOK || lenOK);
  }

  // ---------- 判断是否为真实英语单词 ----------
  const _confusionSet = new Set();
  (window.CONFUSION_PAIRS || []).forEach(function (p) {
    _confusionSet.add(p[0].toLowerCase());
    _confusionSet.add(p[1].toLowerCase());
  });

  function isRealWord(s) {
    s = s.toLowerCase().trim();
    if (!/^[a-z][a-z'-]*$/.test(s)) return false;
    if (_confusionSet.has(s)) return true;
    // 内置词库
    if ((window.WORD_BANK || []).some(function (w) { return w.word === s; })) return true;
    // 常见词兜底
    return /^(the|and|is|it|in|on|of|to|a|an|you|that|this|for|with|be|at|by|we|are|he|she)$/.test(s);
  }

  function isInConfusionPair(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return false;
    return (window.CONFUSION_PAIRS || []).some(function (p) {
      const x = p[0].toLowerCase(), y = p[1].toLowerCase();
      return (a === x && b === y) || (a === y && b === x);
    });
  }

  // ---------- 定制化纠错提示 ----------
  // QWERTY 键盘相邻键位映射（用于识别"相邻按键误触"型拼写失误）
  const KEYBOARD = {
    q: "wa", w: "qes", e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yij",
    i: "uok", o: "ipl", p: "ol", a: "qsz", s: "awdx", d: "sefc", f: "drgv",
    g: "fthb", h: "gyjn", j: "hukm", k: "jil", l: "kop", z: "asx", x: "zsdc",
    c: "xdfv", v: "cfgb", b: "vghn", n: "bhjm", m: "njk"
  };
  function keyboardNeighbors(ch) { return KEYBOARD[ch] ? KEYBOARD[ch].split("") : []; }

  // 找出两词的字母差异位（教学提示用）
  function diffPositions(a, b) {
    const out = [];
    const mx = Math.max(a.length, b.length);
    for (let i = 0; i < mx; i++) {
      const ca = (a[i] || "").trim(), cb = (b[i] || "").trim();
      if (ca !== cb) out.push({ i: i, a: ca, b: cb });
    }
    return out;
  }

  // 拼写失误：定位具体差异 + 相邻按键检测
  function buildSpellingHint(correctWord, userWord) {
    const a = String(correctWord).toLowerCase();
    const b = String(userWord).toLowerCase();
    if (a.length === b.length) {
      const hits = [];
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i] && keyboardNeighbors(a[i]).indexOf(b[i]) >= 0) {
          hits.push("第 " + (i + 1) + " 位「" + a[i] + "」打成相邻键「" + b[i] + "」");
        }
      }
      if (hits.length) return "疑似键盘相邻键误触：" + hits.join("、") + "（这些键位在键盘上紧挨着）";
      const ds = diffPositions(a, b);
      if (ds.length) {
        return "对照正确拼写，第 " + ds.map(function (d) { return (d.i + 1) + " 位"; }).join("、") + " 处字母有出入，请逐字母核对";
      }
    }
    const diff = a.length - b.length;
    if (diff > 0) return "比正确拼写少了 " + diff + " 个字母，请补全下划线处（" + correctWord + "）";
    if (diff < 0) return "比正确拼写多了 " + (-diff) + " 个字母，请去掉多余字母（" + correctWord + "）";
    return "长度相同但有字母写错，请对照「" + correctWord + "」重拼一遍";
  }

  // 形近词：给出具体区分点
  function buildSimilarHint(correctWord, otherWord) {
    const a = String(correctWord).toLowerCase();
    const b = String(otherWord).toLowerCase();
    const ds = diffPositions(a, b);
    if (ds.length) {
      return "区分要点：两词在第 " + ds.map(function (d) { return (d.i + 1); }).join("、") + " 个字母处不同（" +
        ds.map(function (d) { return "\"" + (d.a || "∅") + "≠" + (d.b || "∅") + "\""; }).join("，") + "），记准这个区别就不易混淆";
    }
    return "注意对比这两个词的拼写与含义，形近词要放到例句中分辨记忆";
  }

  // ---------- 中文归一化（用于词义比对） ----------
  function normCN(s) {
    return String(s).toLowerCase().replace(/[\s，。、；;，、（）()0-9①②③④⑤]/g, "");
  }

  // ---------- 公开比对接口 ----------

  /**
   * 拼写比对（针对"写英文单词"场景）
   * @param {string} correctWord 正解单词
   * @param {string} userWord    学生输入
   * @returns {object} { correct, type, detail }
   */
  function classifySpelling(correctWord, userWord) {
    const a = String(correctWord).toLowerCase().trim();
    const b = String(userWord).toLowerCase().trim();

    if (!a && !b) return { correct: true, type: "correct", detail: "" };
    if (a === b) return { correct: true, type: "correct", detail: "拼写正确" };

    // 学生输入了另一个真实的英语单词
    if (isRealWord(b)) {
      if (isInConfusionPair(a, b)) {
        return {
          correct: false, type: "similar",
          detail: "把「" + correctWord + "」写成了形近词「" + userWord + "」，二者发音/拼写相近，容易混淆",
          hint: buildSimilarHint(correctWord, userWord)
        };
      }
      if (visualSimilar(a, b)) {
        return {
          correct: false, type: "similar",
          detail: "写出了另一个形近单词「" + userWord + "」，与 「" + correctWord + "」外形相似",
          hint: buildSimilarHint(correctWord, userWord)
        };
      }
      return {
        correct: false, type: "spelling",
        detail: "拼写存在偏差，正确拼写为「" + correctWord + "」",
        hint: buildSpellingHint(correctWord, userWord)
      };
    }

    // 学生输入的不是一个完整单词 → 拼写失误
    const sim = similarityRatio(a, b);
    let detail;
    if (b.length < 2) {
      detail = "未能正确拼出「" + correctWord + "」，只写下了「" + userWord + "」，拼写不完整";
    } else if (sim >= 0.5) {
      detail = "拼写失误：输入的「" + userWord + "」与「" + correctWord + "」非常接近，仅差少数字母";
    } else {
      detail = "拼写失误：与「" + correctWord + "」拼写差距较大，请重新记忆";
    }
    return { correct: false, type: "spelling", detail: detail, hint: buildSpellingHint(correctWord, userWord) };
  }

  /**
   * 词义比对（针对"写中文释义"场景）
   * @param {string} correctMean 正解释义
   * @param {string} userMean    学生输入
   */
  function classifyMeaning(correctMean, userMean) {
    const cmp = normCN(correctMean);
    const inpt = normCN(userMean);
    if (!inpt) return { correct: false, type: "meaning", detail: "未填写释义", hint: "回想一下这个词在学习卡片上的释义，或借助例句推测词义再作答" };
    // 允许子串/同义包含
    if (cmp === inpt || cmp.indexOf(inpt) >= 0 || inpt.indexOf(cmp) >= 0) {
      return { correct: true, type: "correct", detail: "词义理解正确" };
    }
    return {
      correct: false, type: "meaning",
      detail: "词义答错：正确释义为「" + correctMean + "」，你的答案是「" + userMean + "」",
      hint: "词义理解有偏差，建议结合该词的例句来记忆词义，不要逐字硬背"
    };
  }

  /**
   * 选择题确认（答错即词义错）
   */
  function classifyChoice(chosen, correctMean) {
    if (chosen === correctMean) return { correct: true, type: "correct", detail: "选择正确" };
    return { correct: false, type: "meaning", detail: "选错了词义，正确为「" + correctMean + "」" };
  }

  return {
    levenshtein: levenshtein,
    similarityRatio: similarityRatio,
    visualSimilar: visualSimilar,
    isRealWord: isRealWord,
    isInConfusionPair: isInConfusionPair,
    classifySpelling: classifySpelling,
    classifyMeaning: classifyMeaning,
    classifyChoice: classifyChoice,
    normCN: normCN
  };
})();
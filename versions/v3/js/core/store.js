/* ============================================================
 * 数据持久化（localStorage）
 * 存储：当前学段、每个单词的学习状态、作答历史
 * ============================================================ */
window.Store = (function () {
  const KEY_CARDS = "zimici.cards";
  const KEY_SEG = "zimici.school";
  const KEY_LOG = "zimici.log";
  const KEY_STATS = "zimici.stats";

  function loadCards() {
    try {
      const raw = localStorage.getItem(KEY_CARDS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCards(cards) {
    localStorage.setItem(KEY_CARDS, JSON.stringify(cards));
  }

  function getSchool() {
    return localStorage.getItem(KEY_SEG) || "junior";
  }
  function setSchool(s) {
    localStorage.setItem(KEY_SEG, s);
  }

  function loadLog() {
    try {
      const raw = localStorage.getItem(KEY_LOG);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveLog(log) {
    localStorage.setItem(KEY_LOG, JSON.stringify(log));
  }
  function addLog(entry) {
    const log = loadLog();
    log.push(entry);
    if (log.length > 500) log.shift();
    saveLog(log);
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(KEY_STATS);
      return raw ? JSON.parse(raw) : { tests: 0, answered: 0, correct: 0 };
    } catch (e) {
      return { tests: 0, answered: 0, correct: 0 };
    }
  }
  function saveStats(s) {
    localStorage.setItem(KEY_STATS, JSON.stringify(s));
  }

  function reset() {
    localStorage.removeItem(KEY_CARDS);
    localStorage.removeItem(KEY_LOG);
    localStorage.removeItem(KEY_STATS);
  }

  return {
    loadCards: loadCards,
    saveCards: saveCards,
    getSchool: getSchool,
    setSchool: setSchool,
    loadLog: loadLog,
    addLog: addLog,
    loadStats: loadStats,
    saveStats: saveStats,
    reset: reset
  };
})();
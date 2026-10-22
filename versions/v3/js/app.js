/* ============================================================
 * 智记单词 —— 主应用控制器
 * 负责页面路由、视图渲染、学习/自测运行流程与数据联动
 * ============================================================ */
(function () {
  "use strict";

  // ---------- 全局状态 ----------
  var App = {
    school: Store.getSchool(),
    cards: Store.loadCards(),
    run: null // 当前进行的学习/测试会话
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var tpl = function (id) { return document.getElementById(id); };

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function getCard(wordObj) {
    var c = App.cards[wordObj.word];
    if (!c) {
      c = SpacedEngine.defaultCard(wordObj.word, wordObj.grade);
      App.cards[wordObj.word] = c;
    }
    return c;
  }
  function persist() { Store.saveCards(App.cards); }

  function schoolWords() {
    return WORD_BANK.filter(function (w) { return w.grade === App.school; });
  }
  function allWords() { return WORD_BANK; }

  function learnSet() {
    var set = {};
    schoolWords().forEach(function (w) { var c = App.cards[w.word]; if (c && (c.reviewCount || 0) > 0) set[w.word] = w; });
    return set;
  }
  function newSet() {
    return schoolWords().filter(function (w) {
      var c = App.cards[w.word];
      return !c || (c.reviewCount || 0) === 0;
    }).sort(function (a, b) {
      return (a.lv === "进阶" ? 1 : 0) - (b.lv === "进阶" ? 1 : 0);
    });
  }
  function dueSet() {
    var set = learnSet();
    return schoolWords().filter(function (w) { return set[w.word] && SpacedEngine.needAttention(App.cards[w.word]); });
  }
  function weakSet() {
    return schoolWords().filter(function (w) {
      var c = App.cards[w.word];
      return c && (c.reviewCount || 0) > 0 && c.mastery < 60;
    }).sort(function (a, b) {
      return (App.cards[a.word].mastery || 0) - (App.cards[b.word].mastery || 0);
    });
  }
  function wrongSet() {
    return schoolWords().filter(function (w) {
      var c = App.cards[w.word];
      return c && c.errorCount > 0;
    });
  }

  function speak(word) {
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(word);
      u.lang = "en-US";
      u.rate = 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* 忽略 */ }
  }

  // ---------- 视图切换 ----------
  function switchView(view) {
    $all(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
    var appEl = $("#app");
    appEl.innerHTML = "";
    if (view === "home") renderHome(appEl);
    else if (view === "library") renderLibrary(appEl);
    else if (view === "test") renderTest(appEl);
    else if (view === "wrongbook") renderWrongBook(appEl);
    else if (view === "stats") renderStats(appEl);
    window.scrollTo(0, 0);
  }

  // ---------- 今日学习首页 ----------
  function renderHome(root) {
    var frag = tpl("tpl-home").content.cloneNode(true);
    var ds = dueSet(), ns = newSet(), ws = weakSet(), wr = wrongSet();

    var hour = new Date().getHours();
    var greet = hour < 12 ? "早上好" : (hour < 18 ? "下午好" : "晚上好");
    $("#greetText", frag).textContent = greet + "，同学！🚀";

    $("#dueCount", frag).textContent = ds.length + " 个";
    $("#newCount", frag).textContent = ns.length + " 个";
    $("#weakCount", frag).textContent = ws.length + " 个";
    $("#wrongCount", frag).textContent = wr.length + " 个";
    $("#dueStat", frag).textContent = ds.length;
    $("#newStat", frag).textContent = ns.length;
    $("#weakStat", frag).textContent = ws.length;
    $("#wrongStat", frag).textContent = wr.length;

    var todayPlan = ds.filter(function (w) {
      var due = App.cards[w.word].due;
      return due <= Date.now();
    }).length;
    $("#dueChip", frag).textContent = todayPlan > 0 ? ("今天需要复习 " + todayPlan + " 个单词") : "今日任务已清空";

    // 未来7天计划
    renderPlan($("#planBars", frag));

    root.appendChild(frag);
  }

  function renderPlan(el) {
    var bars = [];
    var now = Date.now();
    for (var d = 0; d < 7; d++) {
      var dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      var s = dayStart.getTime() + d * SpacedEngine.DAY;
      var e = s + SpacedEngine.DAY;
      var n = 0;
      schoolWords().forEach(function (w) {
        var c = App.cards[w.word];
        if (c && c.due >= s && c.due < e && (c.reviewCount || 0) > 0) n++;
      });
      bars.push(n);
    }
    var max = Math.max.apply(null, bars.concat([1]));
    var labels = ["今天", "明天", "后天"];
    el.innerHTML = bars.map(function (n, i) {
      var h = Math.max(6, Math.round(n / max * 100));
      var lbl = i < 3 ? labels[i] : "D" + (i + 1);
      var today = i === 0;
      return '<div class="plan-col"><span class="plan-val">' + n + '</span>' +
        '<div class="plan-bar' + (today ? " today" : "") + '" style="height:' + h + 'px"></div>' +
        '<span class="plan-label">' + lbl + "</span></div>";
    }).join("");
  }

  // ---------- 词汇库 ----------
  function renderLibrary(root) {
    var frag = tpl("tpl-library").content.cloneNode(true);
    root.appendChild(frag);
    fillWordGrid();
  }

  function fillWordGrid() {
    var grid = $("#wordGrid");
    var q = ($("#libSearch").value || "").trim().toLowerCase();
    var grade = $("#libGrade").value;
    var list = allWords().filter(function (w) {
      if (grade !== "all" && w.grade !== grade) return false;
      if (q && w.word.toLowerCase().indexOf(q) < 0 && w.mean.indexOf(q) < 0 && w.phon.indexOf(q) < 0) return false;
      return true;
    });
    $("#libCount").textContent = "共 " + list.length + " 条";
    if (!list.length) {
      grid.innerHTML = '<div class="empty-tip">没有找到相关单词</div>';
      return;
    }
    grid.innerHTML = list.map(function (w) {
      var tag = w.grade === "junior" ? "初中" : "高中";
      var c = App.cards[w.word];
      var m = c ? (c.mastery || 0) : 0;
      return '<div class="word-cell" data-whint="' + esc(w.word) + '">' +
        '<div class="w-top"><span class="w-word">' + esc(w.word) + '</span>' +
        '<span class="ptag ' + (w.lv === "进阶" ? "lv-adv" : "lv-base") + '">' + esc(w.lv) + "</span>" +
        '<span class="ptag ' + (w.grade === "junior" ? "tag-junior" : "tag-senior") + '">' + tag + "</span></div>" +
        '<div class="w-pho">' + esc(w.phon) + " " + esc(w.pos) + "</div>" +
        '<div class="w-mei">' + esc(w.mean) + "</div>" +
        (w.s ? '<div class="w-sent">' + esc(w.s) + "</div>" : "") +
        (c ? '<div class="w-tags"><span class="ptag" style="background:#eafaf1;color:#27ae60">掌握度 ' + Math.round(m) + "</span>" +
          (c.errorCount ? '<span class="ptag" style="background:#ffe4e4;color:#e74c3c">错 ' + c.errorCount + " 次</span>" : "") + "</div>" : "") +
        "</div>";
    }).join("");
  }

  // ---------- 自测设置页 ----------
  var selectedMode = "cn2en";
  function renderTest(root) {
    var frag = tpl("tpl-test").content.cloneNode(true);
    $all(".mode-card", frag).forEach(function (b) {
      b.classList.toggle("selected", b.dataset.mode === selectedMode);
    });
    // 历史记录
    var hist = Store.loadLog().filter(function (x) { return x.type === "test"; }).slice(-8).reverse();
    var histEl = $("#testHistory", frag);
    if (hist.length) {
      histEl.innerHTML = "<h3>最近测试</h3>" + hist.map(function (h) {
        var acc = h.answered ? Math.round(h.correct / h.answered * 100) : 0;
        return '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between">' +
          '<span>' + h.modeName + " · " + h.answered + " 题</span>" +
          '<span style="color:' + (acc >= 80 ? "#2ecc71" : acc >= 50 ? "#ff9f43" : "#f25c5c") + ';font-weight:700">正确率 ' + acc + "%</span></div>";
      }).join("");
    } else {
      histEl.innerHTML = '<div class="empty-tip">还没有测试记录，快去测一把吧！</div>';
    }
    root.appendChild(frag);
  }

  // ---------- 错词本 ----------
  var wrongFilter = "all";
  function renderWrongBook(root) {
    var frag = tpl("tpl-wrongbook").content.cloneNode(true);
    $all(".chip", frag).forEach(function (c) { c.classList.toggle("active", c.dataset.wfilt === wrongFilter); });
    root.appendChild(frag);
    fillWrongList();
  }

  function fillWrongList() {
    var list = wrongSet().filter(function (w) {
      var c = App.cards[w.word];
      if (wrongFilter === "all") return true;
      return (c.wrongTypes[wrongFilter] || 0) > 0 || (wrongFilter === "meaning" && c.lastType === "unknown");
    });
    $("#wrongSummary").textContent = "共收录 " + wrongSet().length + " 个曾答错/未掌握的单词，系统已自动按错误类型归类";

    var el = $("#wrongList");
    if (!list.length) {
      el.innerHTML = '<div class="empty-tip">太棒了！目前没有错词 🎉</div>';
      return;
    }
    el.innerHTML = list.map(function (w) {
      var c = App.cards[w.word];
      var badges = [];
      if ((c.wrongTypes.spelling || 0) > 0) badges.push('<span class="badge spelling">拼写失误 ×' + c.wrongTypes.spelling + "</span>");
      if ((c.wrongTypes.similar || 0) > 0) badges.push('<span class="badge similar">形近词 ×' + c.wrongTypes.similar + "</span>");
      if ((c.wrongTypes.meaning || 0) > 0) badges.push('<span class="badge meaning">词义 ×' + c.wrongTypes.meaning + "</span>");
      if (c.lastType === "unknown") badges.push('<span class="badge" style="background:#eee;color:#666">待巩固 ×1</span>');
      var hist = (c.history || []);
      var last = hist.length ? ("最近一次：" + SpacedEngine.masteryLevel(c.mastery) + " · 掌握度 " + Math.round(c.mastery)) : "尚未复习";
      return '<div class="wrong-item">' +
        '<div class="wi-top"><span class="wi-word">' + esc(w.word) + '</span>' +
        '<span class="ptag ' + (w.lv === "进阶" ? "lv-adv" : "lv-base") + '">' + esc(w.lv) + "</span>" +
        '<button class="ghost-btn dark" data-action="speak-word" data-word="' + esc(w.word) + '">🔊</button></div>' +
        '<div class="wi-mei">' + esc(w.mean) + '</div>' +
        (w.s ? '<div class="wi-sent">' + esc(w.s) + "</div>" : "") +
        '<div class="wi-badges">' + badges.join("") + "</div>" +
        '<div class="wi-history">' + last + "</div></div>";
    }).join("");
  }

  // ---------- 学习分析 ----------
  function renderStats(root) {
    var frag = tpl("tpl-stats").content.cloneNode(true);
    var words = schoolWords();
    var st = Store.loadStats();
    var learned = words.filter(function (w) { var c = App.cards[w.word]; return c && (c.reviewCount || 0) > 0; });
    var totalErr = 0; var sumMastery = 0;
    words.forEach(function (w) {
      var c = App.cards[w.word];
      if (c) { sumMastery += c.mastery; totalErr += c.errorCount || 0; }
    });
    var acc = st.answered ? Math.round(st.correct / st.answered * 100) : 0;
    var avgMastery = words.length ? Math.round(sumMastery / words.length) : 0;

    $("#statsGrid", frag).innerHTML = [
      { n: words.length, l: "本学段词汇量" },
      { n: learned.length, l: "已学习" },
      { n: Math.round(avgMastery), l: "平均掌握度" },
      { n: acc + "%", l: "自测正确率" },
      { n: totalErr, l: "累计错词次数" },
      { n: st.tests, l: "完成测试场次" }
    ].map(function (s) {
      return '<div class="stat-card"><div class="num">' + s.n + '</div><div class="lbl">' + s.l + "</div></div>";
    }).join("");

    // 掌握度分布
    var buckets = [["陌生", 0, 40, "#f25c5c"], ["薄弱", 40, 60, "#ff9f43"], ["过关", 60, 75, "#3aa7ff"], ["熟练", 75, 90, "#5b8ff0"], ["掌握", 90, 101, "#2ecc71"]];
    var distEl = $("#masteryDist", frag);
    distEl.innerHTML = buckets.map(function (b) {
      var cnt = words.filter(function (w) {
        var c = App.cards[w.word];
        return c && (c.reviewCount || 0) > 0 && c.mastery >= b[1] && c.mastery < b[2];
      }).length;
      var pct = words.length ? Math.round(cnt / words.length * 100) : 0;
      return '<div class="md-row"><span class="md-lbl">' + b[0] + "</span>" +
        '<div class="md-track"><div class="md-bar" style="width:' + pct + '%;background:' + b[3] + '"></div></div>' +
        '<span class="md-lbl">' + cnt + "</span></div>";
    }).join("");

    root.appendChild(frag);
  }

  // ---------- 运行会话 ----------
  function startRun(words, sessionType, mode, testModeName) {
    if (!words.length) { showModal("提示", "这个任务当前没有可学习的单词，先去扩充词汇库或完成一次自测吧。"); return; }
    App.run = {
      words: words,
      idx: 0,
      sessionType: sessionType,
      mode: mode || "learn",
      testMode: testModeName,
      modeName: testModeName,
      correct: 0,
      results: []
    };
    $("#app").innerHTML = "";
    $("#app").appendChild(tpl("tpl-run").content.cloneNode(true));
    renderRunStage();
  }

  function renderRunStage() {
    var run = App.run;
    var total = run.words.length;
    var bar = $("#runProgressBar");
    var count = $("#runCount");
    bar.style.width = (run.idx / total * 100) + "%";
    count.textContent = run.idx + 1 + " / " + total;

    var stage = $("#runStage");
    var w = run.words[run.idx];
    if (!w) { finishRun(); return; }

    if (run.mode === "learn") {
      stage.innerHTML = buildLearnCard(w);
    } else {
      stage.innerHTML = buildTestStage(w);
      if (run.testMode === "choice") buildChoices(w);
      var inp = $(".answer-input", stage);
      if (inp) { inp.focus(); }
    }
  }

  function buildLearnCard(w) {
    var c = getCard(w);
    var node = tpl("tpl-learn-card").content.cloneNode(true);
    var el = document.createElement("div");
    el.appendChild(node);
    var card = el.firstElementChild;
    $("[data-word]", card).textContent = w.word;
    $("[data-phonetic]", card).textContent = w.phon + " " + w.pos;
    $("[data-meaning]", card).textContent = "";
    $("[data-tag]", card).textContent = w.lv || "";
    $("[data-tag]", card).classList.add(w.grade === "junior" ? "junior" : "");
    $("[data-controls]", card).dataset.word = w.word;
    return card.outerHTML;
  }

  function buildTestStage(w) {
    var run = App.run;
    var c = getCard(w);
    var inner;
    if (run.testMode === "cn2en") {
      inner = '<div class="learn-card"><span class="word-tag junior">中→英</span>' +
        '<p class="show-meaning" style="font-size:26px;color:var(--ink);margin-top:10px">' + esc(w.mean) + "</p>" +
        '<p style="color:var(--sub);margin-top:8px">请写出对应的英文单词</p></div>' +
        '<div class="answer-panel"><div class="q-label">你的答案</div>' +
        '<input class="answer-input" data-anstype="spell" placeholder="输入英文单词…" data-word="' + esc(w.word) + '" />' +
        '<button class="primary-btn full answer-submit" data-action="submit-answer">提交</button></div>' +
        '<div class="feedback" data-fb></div>' +
        '<button class="primary-btn full next-btn hidden" data-action="next">下一题</button>';
    } else if (run.testMode === "en2cn") {
      inner = '<div class="learn-card"><div class="word-header"><span class="word-tag">英→中</span>' +
        '<button class="ghost-btn dark" data-action="speak-word" data-word="' + esc(w.word) + '">🔊 朗读</button></div>' +
        '<h1 class="show-word">' + esc(w.word) + "</h1>" +
        '<p class="phonetic">' + esc(w.phon) + " " + esc(w.pos) + "</p></div>" +
        '<div class="answer-panel"><div class="q-label">写出对应的中文释义</div>' +
        '<input class="answer-input" data-anstype="meaning" placeholder="输入中文…" data-word="' + esc(w.word) + '" />' +
        '<button class="primary-btn full answer-submit" data-action="submit-answer">提交</button></div>' +
        '<div class="feedback" data-fb></div>' +
        '<button class="primary-btn full next-btn hidden" data-action="next">下一题</button>';
    } else if (run.testMode === "listening") {
      inner = '<div class="learn-card"><div class="word-header"><span class="word-tag">听力</span>' +
        '<button class="ghost-btn dark" data-action="speak-word" data-word="' + esc(w.word) + '">🔊 播放（点击重听）</button></div>' +
        '<p class="show-meaning" style="font-size:20px;margin-top:10px">' + esc(w.mean) + "</p>" +
        '<p style="color:var(--sub);margin-top:8px">听发音，拼出该单词</p></div>' +
        '<div class="answer-panel"><div class="q-label">你的答案</div>' +
        '<input class="answer-input" data-anstype="spell" placeholder="输入英文单词…" data-word="' + esc(w.word) + '" />' +
        '<button class="primary-btn full answer-submit" data-action="submit-answer">提交</button></div>' +
        '<div class="feedback" data-fb></div>' +
        '<button class="primary-btn full next-btn hidden" data-action="next">下一题</button>';
    } else {
      inner = '<div class="learn-card"><div class="word-header"><span class="word-tag">四选一</span>' +
        '<button class="ghost-btn dark" data-action="speak-word" data-word="' + esc(w.word) + '">🔊 朗读</button></div>' +
        '<h1 class="show-word">' + esc(w.word) + "</h1>" +
        '<p class="phonetic">' + esc(w.phon) + " " + esc(w.pos) + "</p>" +
        '<p style="color:var(--sub);margin-top:6px">选择正确的词义</p></div>' +
        '<div class="choice-grid" data-word="' + esc(w.word) + '"></div>' +
        '<div class="feedback" data-fb></div>' +
        '<button class="primary-btn full next-btn hidden" data-action="next">下一题</button>';
    }
    return inner;
  }

  function buildChoices(w) {
    var grid = $(".choice-grid");
    var correct = w.mean;
    var dist = [];
    var pool = allWords().filter(function (x) { return x.mean !== correct; });
    while (dist.length < 3 && pool.length) {
      var pick = pool[Math.floor(Math.random() * pool.length)];
      if (dist.indexOf(pick.mean) < 0) { dist.push(pick.mean); }
    }
    var opts = [correct].concat(dist);
    // 打乱
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
    }
    grid.innerHTML = opts.map(function (o) {
      return '<div class="choice-item" data-correct="' + (o === correct ? "1" : "") + '" data-meaning="' + esc(o) + '">' + esc(o) + "</div>";
    }).join("");
  }

  // 学习模式打分
  function gradeWord(word, q) {
    var w = WORD_BANK.find(function (x) { return x.word === word; });
    var card = getCard(w);
    SpacedEngine.review(card, q);
    if (q < 3) {
      // 未通过 → 收录错词
      SpacedEngine.recordError(card, "unknown");
    }
    persist();
    App.run.correct += (q >= 3 ? 1 : 0);
    App.run.results.push({ word: word, ok: q >= 3, q: q });
    advance();
  }

  // 作答判定（自测/默写）
  function submitAnswer(word, anstype, input) {
    var w = WORD_BANK.find(function (x) { return x.word === word; });
    if (!w) return;
    var card = getCard(w);
    var res;
    if (anstype === "spell") {
      res = CompareModule.classifySpelling(w.word, input);
      if (res.correct) {
        SpacedEngine.review(card, 5);
      } else {
        SpacedEngine.recordError(card, res.type);
      }
    } else if (anstype === "meaning") {
      res = CompareModule.classifyMeaning(w.mean, input);
      if (res.correct) {
        SpacedEngine.review(card, 5);
      } else {
        SpacedEngine.recordError(card, res.type);
      }
    } else {
      // choice
      res = CompareModule.classifyChoice(input, w.mean);
      if (res.correct) {
        SpacedEngine.review(card, 5);
      } else {
        SpacedEngine.recordError(card, res.type);
      }
    }
    persist();

    if (res.correct) App.run.correct++;
    App.run.results.push({ word: word, ok: res.correct, type: res.type });

    showFeedback(res, w, anstype);
  }

  function showFeedback(res, w, anstype) {
    var stage = $("#runStage");
    var fb = $("[data-fb]", stage);
    var next = $(".next-btn", stage);
    var sentenceBlock = w && w.s ? '<div class="fb-sentence">📖 例句：' + esc(w.s) + "</div>" : "";
    if (res.correct) {
      fb.className = "feedback show ok";
      fb.innerHTML = "<h4>✅ 回答正确</h4><p>" + res.detail + "</p>" + sentenceBlock;
    } else {
      fb.className = "feedback show bad";
      var label = res.type === "spelling" ? "拼写失误" : res.type === "similar" ? "形近词混淆" : "词义答错";
      var color = res.type === "meaning" ? "var(--blue)" : res.type === "similar" ? "var(--orange)" : "var(--red)";
      fb.innerHTML = "<h4>❌ 答错了（自动诊断：<span style='color:" + color + "'>" + label + "</span>）</h4>" +
        '<div class="fb-err">' + esc(res.detail) + "</div>" +
        (res.hint ? '<div class="fb-tip">💡 纠错提示：' + esc(res.hint) + "</div>" : "") +
        sentenceBlock +
        "<p style='color:var(--sub);margin-top:8px'>该单词已自动收录进「错词本」，并将在适当时机优先安排复习。</p>";
    }
    // 禁用作答区
    $all(".answer-input, .choice-item, .answer-submit", stage).forEach(function (el) {
      el.disabled = true; el.style.pointerEvents = "none";
    });
    next.classList.remove("hidden");
    isTypingTest = false;
  }

  function advance() {
    var run = App.run;
    run.idx++;
    if (run.idx >= run.words.length) { finishRun(); return; }
    renderRunStage();
  }

  function finishRun() {
    var run = App.run;
    var acc = run.words.length ? Math.round(run.correct / run.words.length * 100) : 0;

    if (run.mode === "test") {
      var st = Store.loadStats();
      st.tests++;
      st.answered += run.words.length;
      st.correct += run.correct;
      Store.saveStats(st);
      Store.addLog({
        type: "test",
        modeName: run.modeName,
        answered: run.words.length,
        correct: run.correct,
        t: Date.now()
      });
    }

    $("#app").innerHTML = '<section class="view"><div class="card" style="text-align:center;padding:50px 30px">' +
      '<div style="font-size:64px;margin-bottom:10px">' + (acc >= 90 ? "🏆" : acc >= 70 ? "🎉" : acc >= 50 ? "👍" : "💪") + "</div>" +
      "<h2 style='margin-bottom:10px'>本次" + (run.mode === "test" ? "自测" : "复习") + "完成</h2>" +
      "<p style='color:var(--sub);font-size:18px'>共 " + run.words.length + " 题，答对 " + run.correct + " 题，正确率 <b style='color:var(--primary)'>" + acc + "%</b></p>" +
      '<p style="color:var(--sub);margin-top:6px">答错的单词已自动收录到错词本，并优先安排复习</p>' +
      '<div style="margin-top:24px"><button class="primary-btn" data-action="back-home">返回今日学习</button></div></div></section>';
    // 有发音按钮回首页后面会重建
  }

  // ---------- Modal ----------
  var isTypingTest = false;
  function showModal(title, msg, errorTypes) {
    $("#modalTitle").textContent = title;
    $("#modalMsg").textContent = msg;
    var et = $("#errorTypes");
    et.innerHTML = "";
    if (errorTypes) {
      errorTypes.forEach(function (e) {
        et.innerHTML += '<div class="etype">' + e + "</div>";
      });
    }
    $("#modal").classList.remove("hidden");
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 顶部学段切换
    $("#schoolSelect").value = App.school;
    $("#schoolSelect").addEventListener("change", function (e) {
      App.school = e.target.value;
      Store.setSchool(App.school);
      switchView("home");
    });
    // 重置
    $("#resetBtn").addEventListener("click", function () {
      showModal("确认重置", "将清空所有学习记录与错词本，此操作不可恢复。");
      $("#modalOk").onclick = function () {
        Store.reset();
        App.cards = Store.loadCards();
        App.school = Store.getSchool();
        App.run = null;
        $("#modal").classList.add("hidden");
        switchView("home");
        $("#schoolSelect").value = App.school;
      };
    });

    // 全局点击
    document.addEventListener("click", function (e) {
      var actionEl = e.target.closest("[data-action]");
      if (actionEl) {
        var act = actionEl.dataset.action;
        handleAction(act, actionEl, e);
        return;
      }
      var tab = e.target.closest(".tab");
      if (tab) { switchView(tab.dataset.view); return; }
      var grad = e.target.closest("[data-grade]");
      if (grad) {
        var word = grad.closest("[data-word]").dataset.word;
        if (!word) return;
        var q = parseInt(grad.dataset.grade, 10);
        gradeWord(word, q);
        return;
      }
      var modeCard = e.target.closest(".mode-card");
      if (modeCard) {
        selectedMode = modeCard.dataset.mode;
        $all(".mode-card", $("#testHistory").parentElement).forEach(function (b) {
          b.classList.toggle("selected", b === modeCard);
        });
        return;
      }
      var wfilt = e.target.closest("[data-wfilt]");
      if (wfilt) {
        wrongFilter = wfilt.dataset.wfilt;
        $all(".chip").forEach(function (c) { c.classList.toggle("active", c.dataset.wfilt === wrongFilter); });
        fillWrongList();
        return;
      }
      var choice = e.target.closest(".choice-item");
      if (choice && !choice.disabled) {
        var isCorrect = choice.dataset.correct === "1";
        var wordC = choice.closest(".choice-grid").dataset.word;
        $(".choice-item").forEach(function (c) {
          c.classList.add(c.dataset.correct === "1" ? "correct" : "wrong");
          c.disabled = true;
        });
        submitAnswer(wordC, "choice", choice.dataset.mean);
        return;
      }
      var wcell = e.target.closest(".word-cell");
      if (wcell && !e.target.closest("button")) {
        // 点击词库中的单词：朗读
        speak(wcell.dataset.whint);
        return;
      }
      $("#modalOk").onclick = function () { $("#modal").classList.add("hidden"); };
    });

    // 回车提交
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && isTypingTest && App.run) {
        var stage = $("#runStage");
        var inp = $(".answer-input", stage);
        if (inp && !inp.disabled) {
          handleSubmitTyped(inp);
        }
      }
    });
  }

  function handleAction(act, el) {
    if (act === "start-due") startRun(dueSet(), "due");
    else if (act === "start-new") startRun(newSet(), "new");
    else if (act === "start-weak") startRun(weakSet(), "weak");
    else if (act === "start-wrong") startRun(wrongSet(), "wrong");
    else if (act === "retest-wrong") startRun(shuffle(wrongSet()), "wrong", "test", "cn2en");
    else if (act === "start-test") {
      startRun(selectTestWords(), "test", "test", selectedMode);
    } else if (act === "quit-run") {
      App.run = null;
      switchView("home");
    } else if (act === "next") {
      advance();
    } else if (act === "submit-answer") {
      var inp = $(".answer-input", $("#runStage"));
      if (inp) handleSubmitTyped(inp);
    } else if (act === "reveal") {
      var word = el.closest(".learn-card").querySelector("[data-word]").textContent;
      var wObj = WORD_BANK.find(function (x) { return x.word === word; });
      var meaningEl = el.closest(".learn-card").querySelector(".show-meaning");
      meaningEl.textContent = wObj ? wObj.mean : "";
      var sentEl = el.closest(".learn-card").querySelector("[data-sentence]");
      if (wObj && wObj.s) { sentEl.textContent = wObj.s; sentEl.classList.remove("hidden"); }
      el.classList.add("hidden");
      var grades = el.closest(".learn-card").querySelector("[data-grades]");
      grades.classList.remove("hidden");
    } else if (act === "speak-word") {
      speak(el.dataset.word);
    } else if (act === "speak") {
      speak(el.parentElement.querySelector("[data-word]").textContent);
    } else if (act === "back-home") {
      App.run = null;
      switchView("home");
    }
  }

  function handleSubmitTyped(inp) {
    var input = inp.value.trim();
    if (!input) return;
    var word = inp.dataset.word;
    var anstype = inp.dataset.anstype;
    submitAnswer(word, anstype, input);
  }

  function selectTestWords() {
    var pool;
    if (selectedMode === "choice") {
      pool = schoolWords();
    } else {
      // 优先薄弱词
      pool = weakSet().concat(newSet().slice(0, 5));
      if (pool.length < 10) {
        var seen = {};
        pool.forEach(function (w) { seen[w.word] = 1; });
        schoolWords().forEach(function (w) {
          if (pool.length >= 30) return;
          if (!seen[w.word]) pool.push(w);
        });
      }
    }
    var count = 10;
    var sel = $("#testCount");
    if (sel) count = parseInt(sel.value, 10) || 10;
    return shuffle(pool).slice(0, count);
  }

  function shuffle(arr) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // 输入框失焦/聚焦时切换 isTypingTest 标志
  document.addEventListener("input", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("answer-input")) {
      isTypingTest = true;
    }
  });
  document.addEventListener("focusout", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("answer-input")) {
      isTypingTest = false;
    }
  });

  // 词汇库搜索
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "libSearch") fillWordGrid();
  });
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "libGrade") fillWordGrid();
  });

  // ---------- 启动 ----------
  bindEvents();
  switchView("home");
})();
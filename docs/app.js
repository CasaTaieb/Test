"use strict";
(function () {
  var DATA = null;
  var view = document.getElementById("view");

  /* ---------- storage (best effort) ---------- */
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------- helpers ---------- */
  var HEB = /[֐-׿יִ-ﭏ][֐-׿יִ-ﭏ \-־׳״'"0-9]*[֐-׿יִ-ﭏ]\??|[֐-׿יִ-ﭏ]/g;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Escape, then wrap runs of Hebrew so they get the Hebrew font and RTL isolation.
  function rich(s) {
    var out = esc(s).replace(HEB, function (m) { return '<span class="he" lang="he">' + m + "</span>"; });
    return out.replace(/~~(.+?)~~/g, "<s>$1</s>");
  }
  function heSpan(s, cls) {
    return '<span class="he' + (cls ? " " + cls : "") + '" lang="he">' + esc(s) + "</span>";
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(str, n) {
    var p = str.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDate(str, opts) {
    var p = str.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var s = d.toLocaleDateString("fr-FR", opts || { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function byId(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var ICON = {
    speak: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9z"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg>'
  };

  /* ---------- speech ---------- */
  var heVoice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices();
    heVoice = vs.filter(function (v) { return /^he|^iw/i.test(v.lang); })[0] || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text.replace(/\s*\/\s*/g, ", "));
    u.lang = "he-IL"; u.rate = 0.85;
    if (heVoice) u.voice = heVoice;
    speechSynthesis.speak(u);
  }
  view.addEventListener("click", function (e) {
    var b = e.target.closest("[data-speak]");
    if (b) { e.preventDefault(); e.stopPropagation(); speak(b.getAttribute("data-speak")); }
  });
  function speakBtn(text) {
    if (!("speechSynthesis" in window)) return "";
    return '<button class="icon-btn" data-speak="' + esc(text) + '" aria-label="Écouter">' + ICON.speak + "</button>";
  }

  /* ---------- spaced repetition ---------- */
  var INTERVALS = [0, 1, 3, 7, 16, 35, 75]; // days, by box
  var NEW_PER_DAY = 10;
  function srs() { return load("hm.srs", {}); }
  function dueCards() {
    var s = srs(), t = todayStr();
    return DATA.vocab.filter(function (v) { return s[v.id] && s[v.id].due <= t; });
  }
  function newCards() {
    var s = srs();
    // most recent first: this week's words, then the rest in repertoire order
    var fresh = DATA.vocab.filter(function (v) { return !s[v.id]; });
    return fresh.filter(function (v) { return v.added; }).sort(function (a, b) { return a.added < b.added ? 1 : -1; })
      .concat(fresh.filter(function (v) { return !v.added; }));
  }
  function newLeftToday() {
    var n = load("hm.new", { d: "", n: 0 });
    return NEW_PER_DAY - (n.d === todayStr() ? n.n : 0);
  }
  function countNewSeen() {
    var t = todayStr(), n = load("hm.new", { d: t, n: 0 });
    if (n.d !== t) n = { d: t, n: 0 };
    n.n++; save("hm.new", n);
  }
  function grade(id, ok) {
    var s = srs(), c = s[id], isNew = !c;
    c = c || { box: 0 };
    c.box = ok ? Math.min(c.box + 1, INTERVALS.length - 1) : 1;
    c.due = addDays(todayStr(), ok ? INTERVALS[c.box] : 1);
    c.ts = Date.now();
    s[id] = c; save("hm.srs", s);
    if (isNew) countNewSeen();
    Sync.push();
  }
  function sessionSize() {
    return dueCards().length + Math.min(Math.max(newLeftToday(), 0), newCards().length);
  }

  /* ---------- sync with a private GitHub repo ---------- */
  var Sync = (function () {
    var FILE = "progression.json", sha = null, timer = null, busy = false, last = load("hm.sync.last", null), err = null;
    function config() { return load("hm.sync", null); }
    function api(cfg, path, opts) {
      opts = opts || {};
      opts.headers = { "Authorization": "Bearer " + cfg.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
      opts.cache = "no-store";
      return fetch("https://api.github.com/repos/" + cfg.repo + path, opts);
    }
    function b64e(str) { return btoa(unescape(encodeURIComponent(str))); }
    function b64d(str) { return decodeURIComponent(escape(atob(str.replace(/\s/g, "")))); }
    function local() { return { v: 1, srs: load("hm.srs", {}), quiz: load("hm.quiz", {}), nw: load("hm.new", { d: "", n: 0 }), mode: load("hm.mode", "he") }; }
    function merge(a, b) { // returns merged; per card the most recent grading wins
      var m = { v: 1, srs: {}, quiz: {}, nw: a.nw, mode: a.mode };
      [a.srs || {}, b.srs || {}].forEach(function (src) {
        Object.keys(src).forEach(function (id) { var c = src[id]; if (!m.srs[id] || (c.ts || 0) > (m.srs[id].ts || 0)) m.srs[id] = c; });
      });
      [a.quiz || {}, b.quiz || {}].forEach(function (src) {
        Object.keys(src).forEach(function (d) { m.quiz[d] = Math.max(m.quiz[d] == null ? -1 : m.quiz[d], src[d]); });
      });
      var x = a.nw || { d: "", n: 0 }, y = b.nw || { d: "", n: 0 };
      m.nw = x.d === y.d ? { d: x.d, n: Math.max(x.n, y.n) } : (x.d > y.d ? x : y);
      return m;
    }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function done() { err = null; last = Date.now(); save("hm.sync.last", last); }
    function fail(e) { err = e && e.message ? e.message : "Erreur réseau"; }
    function friendly(r) {
      if (r.status === 401) return new Error("Jeton refusé ou expiré.");
      if (r.status === 403) return new Error("Le jeton n'a pas le droit d'écrire dans ce dépôt.");
      if (r.status === 404) return new Error("Dépôt introuvable, ou le jeton n'y a pas accès.");
      return new Error("GitHub a répondu " + r.status + ".");
    }
    function getRemote(cfg) {
      return api(cfg, "/contents/" + FILE).then(function (r) {
        if (r.status === 404) { sha = null; return null; }
        if (!r.ok) throw friendly(r);
        return r.json().then(function (j) { sha = j.sha; return JSON.parse(b64d(j.content)); });
      });
    }
    function putRemote(cfg, data, retry) {
      var body = { message: "Progression " + todayStr(), content: b64e(JSON.stringify(data)) };
      if (sha) body.sha = sha;
      return api(cfg, "/contents/" + FILE, { method: "PUT", body: JSON.stringify(body) }).then(function (r) {
        if ((r.status === 409 || r.status === 422) && !retry) return pull(true, true);
        if (!r.ok) throw friendly(r);
        return r.json().then(function (j) { sha = j.content.sha; done(); });
      });
    }
    // Fetch remote, merge with local, write back whichever side is behind.
    function pull(force, isRetry) {
      var cfg = config();
      if (!cfg || (busy && !force)) return Promise.resolve();
      busy = true;
      return getRemote(cfg).then(function (remote) {
        var loc = local(), merged = remote ? merge(loc, remote) : loc;
        var localChanged = !same({ s: merged.srs, q: merged.quiz, n: merged.nw }, { s: loc.srs, q: loc.quiz, n: loc.nw });
        if (localChanged) {
          save("hm.srs", merged.srs); save("hm.quiz", merged.quiz); save("hm.new", merged.nw);
          if (!session && !quizState) route();
        }
        var remoteBehind = !remote || !same({ s: merged.srs, q: merged.quiz, n: merged.nw }, { s: remote.srs, q: remote.quiz, n: remote.nw });
        return remoteBehind ? putRemote(cfg, merged, isRetry) : done();
      }).catch(fail).then(function () { busy = false; refreshIcon(); });
    }
    function push() {
      if (!config()) return;
      clearTimeout(timer);
      timer = setTimeout(function () { pull(); }, 1500);
    }
    function connect(repo, token) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return Promise.reject(new Error("Format attendu : propriétaire/dépôt"));
      if (!token) return Promise.reject(new Error("Collez le jeton."));
      var cfg = { repo: repo, token: token };
      return api(cfg, "").then(function (r) {
        if (!r.ok) throw friendly(r);
        return r.json();
      }).then(function (j) {
        if (!j.private) throw new Error("Ce dépôt est public : utilisez un dépôt privé.");
        save("hm.sync", cfg); sha = null;
        return pull(true).then(function () { if (err) throw new Error(err); });
      });
    }
    function disconnect() { try { localStorage.removeItem("hm.sync"); localStorage.removeItem("hm.sync.last"); } catch (e) {} last = null; err = null; refreshIcon(); }
    function status() {
      if (!config()) return { kind: "off", label: "Non configurée" };
      if (err) return { kind: "err", label: err };
      if (!last) return { kind: "off", label: "En attente" };
      var d = new Date(last);
      return { kind: "ok", label: "Synchronisée à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
        (new Date().toDateString() === d.toDateString() ? "" : " le " + d.toLocaleDateString("fr-FR")) };
    }
    function refreshIcon() {
      var a = document.querySelector('a[href="#/sauvegarde"]');
      if (a) { var st = status(); a.className = "icon-btn sync-" + st.kind; a.setAttribute("aria-label", "Sauvegarde : " + st.label); }
    }
    return { config: config, pull: pull, push: push, connect: connect, disconnect: disconnect, status: status };
  })();

  /* ---------- word card ---------- */
  function wordCard(v) {
    var ex = (v.ex || []).map(function (e) {
      return '<li><span class="he" lang="he">' + esc(e[0]) + '</span><span class="ex-tr">' + esc(e[1]) +
        '</span><span class="ex-fr">' + esc(e[2]) + "</span></li>";
    }).join("");
    return '<article class="card">' +
      '<div class="word-top">' + speakBtn(v.he) + heSpan(v.he, "he-lg") + "</div>" +
      '<p class="tr">' + esc(v.tr) + "</p>" +
      '<p class="fr">' + esc(v.fr) + "</p>" +
      (v.note ? '<p class="note">' + rich(v.note) + "</p>" : "") +
      (ex ? '<ul class="ex">' + ex + "</ul>" : "") +
      "</article>";
  }

  /* ---------- views ---------- */
  function viewToday(date) {
    var lessons = DATA.lessons.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!lessons.length) { view.innerHTML = '<h1>Aujourd\'hui</h1><div class="empty muted"><p>Aucune leçon pour l\'instant.</p></div>'; return; }
    var t = todayStr(), idx;
    if (date) idx = lessons.findIndex(function (l) { return l.date === date; });
    if (idx == null || idx < 0) {
      idx = lessons.length - 1;
      for (var i = lessons.length - 1; i >= 0; i--) { if (lessons[i].date <= t) { idx = i; break; } }
    }
    var L = lessons[idx], V = byId(DATA.vocab), G = byId(DATA.grammar);
    var isToday = L.date === t;
    var prev = lessons[idx - 1], next = lessons[idx + 1];

    var html = '<p class="eyebrow">' + (isToday ? "Leçon du jour" : "Leçon") + "</p>" +
      '<div class="head-row"><h1>' + esc(fmtDate(L.date)) + "</h1>" +
      '<div class="day-nav">' +
      '<button class="icon-btn" aria-label="Leçon précédente" ' + (prev ? 'data-go="#/aujourdhui/' + prev.date + '"' : "disabled") + ">" + ICON.prev + "</button>" +
      '<button class="icon-btn" aria-label="Leçon suivante" ' + (next ? 'data-go="#/aujourdhui/' + next.date + '"' : "disabled") + ">" + ICON.next + "</button>" +
      "</div></div>";

    html += '<div class="stack">' + L.words.map(function (id) { return V[id] ? wordCard(V[id]) : ""; }).join("") + "</div>";

    var g = G[L.grammar];
    if (g) {
      html += "<h2>Grammaire</h2><article class=\"card gram\"><h3>" + rich(g.title) + "</h3>" +
        g.body.map(function (p) { return "<p>" + rich(p) + "</p>"; }).join("") + "</article>";
    }

    // Quiz of the week (dated within 6 days before this lesson, or same day)
    var quiz = DATA.quizzes.filter(function (q) { return q.date <= L.date && q.date >= addDays(L.date, -6); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    if (quiz) {
      var best = load("hm.quiz", {})[quiz.date];
      html += "<h2>Quiz de la semaine</h2><div class=\"card stat\"><div><div>" + esc(fmtDate(quiz.date, { weekday: "long", day: "numeric", month: "long" })) +
        '</div><div class="muted small">' + (best != null ? "Meilleur score : " + best + "/" + quiz.questions.length : quiz.questions.length + " questions") +
        '</div></div><a class="btn secondary" style="width:auto" href="#/quiz/' + quiz.date + '">' + (best != null ? "Refaire" : "Commencer") + "</a></div>";
    }

    if (isToday || idx === lessons.length - 1) {
      var n = sessionSize();
      html += "<h2>Révision</h2><div class=\"card stat\"><div><b>" + n + "</b><div class=\"muted small\">" +
        (n === 0 ? "Rien à revoir aujourd'hui" : (n === 1 ? "carte à revoir" : "cartes à revoir")) + "</div></div>" +
        (n ? '<a class="btn" style="width:auto" href="#/reviser">Réviser</a>' : "") + "</div>";
    }
    view.innerHTML = html;
  }

  /* Review session */
  var session = null;
  function startSession() {
    var due = shuffle(dueCards());
    var fresh = newCards().slice(0, Math.max(newLeftToday(), 0));
    session = { queue: due.concat(fresh).map(function (v) { return v.id; }), total: 0, done: 0, shown: false, again: {} };
    session.total = session.queue.length;
  }
  function viewReview() {
    var mode = load("hm.mode", "he");
    if (!session || (!session.queue.length && session.total === 0)) startSession();
    var head = reviewTitle() +
      '<div class="seg" role="group" aria-label="Sens">' +
      '<button data-mode="he" aria-pressed="' + (mode === "he") + '">Hébreu → français</button>' +
      '<button data-mode="fr" aria-pressed="' + (mode === "fr") + '">Français → hébreu</button></div>';

    if (!session.queue.length) {
      var quizzes = DATA.quizzes.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var best = load("hm.quiz", {});
      view.innerHTML = reviewTitle() +
        '<div class="card empty"><p style="font-size:20px;font-weight:600">' + (session.total ? "Session terminée" : "Tout est à jour") + "</p>" +
        '<p class="muted small" style="margin-top:6px">' + (session.total ? session.total + " cartes revues. " : "") + "Revenez demain pour la suite.</p></div>" +
        (quizzes.length ? "<h2>Quiz</h2><ul class=\"list\">" + quizzes.map(function (q) {
          return '<li><a class="row" href="#/quiz/' + q.date + '"><span class="fr-s">' + esc(fmtDate(q.date, { day: "numeric", month: "long", year: "numeric" })) +
            '</span><span class="muted small">' + (best[q.date] != null ? best[q.date] + "/" + q.questions.length : "") + "</span>" + ICON.chev + "</a></li>";
        }).join("") + "</ul>" : "");
      session = null;
      return;
    }

    var v = byId(DATA.vocab)[session.queue[0]];
    var pct = session.total ? Math.round(100 * session.done / session.total) : 0;
    var front = mode === "he"
      ? '<div>' + heSpan(v.he, "he-xl") + "</div>"
      : '<p class="fr" style="margin:0">' + esc(v.fr) + "</p>";
    var back = "";
    if (session.shown) {
      back = mode === "he"
        ? '<p class="tr">' + esc(v.tr) + '</p><p class="fr">' + esc(v.fr) + "</p>"
        : '<div style="margin-top:18px">' + heSpan(v.he, "he-xl") + '</div><p class="tr">' + esc(v.tr) + "</p>";
      if (v.note) back += '<p class="note">' + rich(v.note) + "</p>";
      back += '<div style="margin-top:8px">' + speakBtn(v.he) + "</div>";
      if (v.ex && v.ex.length) back += '<ul class="ex">' + v.ex.map(function (e) {
        return '<li><span class="he" lang="he">' + esc(e[0]) + '</span><span class="ex-tr">' + esc(e[1]) + '</span><span class="ex-fr">' + esc(e[2]) + "</span></li>";
      }).join("") + "</ul>";
    }
    view.innerHTML = head +
      '<div class="progress" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<p class="muted small" style="margin:-12px 0 14px;text-align:right">' + (session.done + 1) + " / " + session.total + "</p>" +
      '<article class="card flash">' + front + back + "</article>" +
      '<div style="margin-top:16px">' + (session.shown
        ? '<div class="btn-row"><button class="btn bad" data-grade="0">À revoir</button><button class="btn ok" data-grade="1">Je savais</button></div>'
        : '<button class="btn" data-show>Afficher la réponse</button>') + "</div>";
  }

  function reviewTitle() {
    var st = Sync.status();
    return '<div class="head-row"><h1>Réviser</h1><a class="icon-btn sync-' + st.kind + '" href="#/sauvegarde" aria-label="Sauvegarde : ' + esc(st.label) + '" style="margin-bottom:28px">' + ICON.cloud + "</a></div>";
  }

  /* Backup view */
  function viewBackup() {
    var cfg = Sync.config(), st = Sync.status();
    var html = '<button class="back" data-back>' + ICON.prev + "Retour</button><h1>Sauvegarde</h1>" +
      '<p class="muted" style="margin:-12px 0 24px">Votre progression est copiée dans un dépôt GitHub privé. Si vous supprimez l\'app, reconnectez-la avec le même jeton : tout revient.</p>';
    if (cfg) {
      html += '<div class="card stat"><div><div class="sync-' + st.kind + '" style="font-weight:600">' + esc(st.label) + '</div><div class="muted small">' + esc(cfg.repo) + "</div></div></div>" +
        '<div class="stack" style="margin-top:16px"><button class="btn" data-sync-now>Synchroniser maintenant</button>' +
        '<button class="btn secondary" data-sync-off>Déconnecter cet appareil</button></div>';
    } else {
      html += '<form id="sync-form" class="stack" autocomplete="on">' +
        '<label class="field"><span>Dépôt privé</span><input name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="casataieb/hebreu-progression"></label>' +
        '<label class="field"><span>Jeton d\'accès</span><input name="password" type="password" autocomplete="current-password" placeholder="github_pat_…" required></label>' +
        '<p id="sync-msg" class="small" style="color:var(--bad);margin:0;min-height:1.5em"></p>' +
        '<button class="btn" type="submit">Connecter</button></form>';
    }
    view.innerHTML = html;
    var f = document.getElementById("sync-form");
    if (f) f.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = f.querySelector("button"), msg = document.getElementById("sync-msg");
      btn.disabled = true; btn.textContent = "Connexion…"; msg.textContent = "";
      Sync.connect(f.username.value.trim(), f.password.value.trim()).then(function () { viewBackup(); })
        .catch(function (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = "Connecter"; });
    });
  }

  /* Lexicon */
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-֑ͯ-ׇ']/g, ""); }
  function viewLexicon(q) {
    q = q || "";
    var html = '<h1>Lexique</h1><input class="search" type="search" placeholder="Rechercher en français ou en hébreu" value="' + esc(q) + '" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Rechercher">';
    html += '<div id="lex-results">' + lexResults(q) + "</div>";
    view.innerHTML = html;
    var input = view.querySelector(".search");
    input.addEventListener("input", function () {
      document.getElementById("lex-results").innerHTML = lexResults(input.value);
      try { history.replaceState(null, "", "#/lexique" + (input.value ? "?q=" + encodeURIComponent(input.value) : "")); } catch (e) {}
    });
  }
  function lexResults(q) {
    var nq = norm(q).trim();
    var match = function (v) {
      if (!nq) return true;
      return [v.fr, v.tr, v.he, v.note].concat((v.ex || []).map(function (e) { return e.join(" "); }))
        .some(function (s) { return norm(s).indexOf(nq) >= 0; });
    };
    var groups = [{ name: "Nouveautés de la semaine", items: DATA.vocab.filter(function (v) { return !v.theme; }) }];
    var themes = DATA.themes.slice();
    DATA.vocab.forEach(function (v) { if (v.theme && themes.indexOf(v.theme) < 0) themes.push(v.theme); });
    themes.forEach(function (t) { groups.push({ name: t, items: DATA.vocab.filter(function (v) { return v.theme === t; }) }); });
    var html = "", total = 0;
    groups.forEach(function (g) {
      var items = g.items.filter(match);
      if (!items.length) return;
      total += items.length;
      html += "<h2>" + esc(g.name) + '</h2><ul class="list">' + items.map(function (v) {
        return '<li><a class="row" href="#/mot/' + encodeURIComponent(v.id) + '"><span class="fr-s">' + esc(v.fr) + "</span>" + heSpan(v.he) + "</a></li>";
      }).join("") + "</ul>";
    });
    return total ? html : '<div class="empty muted"><p>Aucun résultat.</p></div>';
  }
  function viewWord(id) {
    var v = byId(DATA.vocab)[id];
    if (!v) { location.hash = "#/lexique"; return; }
    view.innerHTML = '<button class="back" data-back>' + ICON.prev + "Lexique</button>" +
      '<p class="eyebrow">' + esc(v.theme || "Nouveauté") + "</p>" + wordCard(v);
  }

  /* Grammar */
  function viewGrammar() {
    var items = DATA.grammar.slice().reverse();
    view.innerHTML = "<h1>Grammaire</h1>" + items.map(function (g, i) {
      return '<details class="gram-item"' + (i === 0 ? " open" : "") + "><summary><span>" + rich(g.title) + "</span>" + ICON.chev + "</summary>" +
        '<div class="gram-body">' + g.body.map(function (p) { return "<p>" + rich(p) + "</p>"; }).join("") + "</div></details>";
    }).join("");
  }

  /* Quiz */
  var quizState = null;
  function viewQuiz(date) {
    var quiz = DATA.quizzes.filter(function (q) { return q.date === date; })[0];
    if (!quiz) { location.hash = "#/aujourdhui"; return; }
    if (!quizState || quizState.date !== date) quizState = { date: date, i: 0, res: [], order: null };
    var Q = quiz.questions, s = quizState;
    var strip = '<div class="strip" aria-hidden="true">' + Q.map(function (_, j) {
      return '<span class="' + (j < s.res.length ? (s.res[j].ok ? "ok" : "bad") : (j === s.i ? "cur" : "")) + '"></span>';
    }).join("") + "</div>";
    var top = '<button class="back" data-back>' + ICON.prev + "Retour</button>" +
      '<p class="eyebrow">Quiz du ' + esc(fmtDate(date, { day: "numeric", month: "long" })) + "</p>";

    if (s.i >= Q.length) {
      var score = s.res.filter(function (r) { return r.ok; }).length;
      var bests = load("hm.quiz", {});
      if (bests[date] == null || score > bests[date]) { bests[date] = score; save("hm.quiz", bests); Sync.push(); }
      var verdict = score === Q.length ? "Sans faute." : score >= 8 ? "Solide. Revoyez les erreurs ci-dessous." :
        score >= 6 ? "Moyen. Les erreurs ci-dessous sont à reprendre." : "Insuffisant. Reprenez la semaine dans le lexique.";
      var show = function (q, k) { return q.r ? heSpan(q.o[k]) : esc(q.o[k]); };
      var errs = s.res.map(function (r, j) { return { r: r, q: Q[j] }; }).filter(function (e) { return !e.r.ok; });
      view.innerHTML = top + strip + '<div class="card"><p class="score">' + score + "<span class=\"muted\" style=\"font-size:28px\">/" + Q.length + "</span></p>" +
        '<p class="muted" style="margin:6px 0 0">' + verdict + "</p></div>" +
        (errs.length ? "<h2>À revoir</h2><div class=\"card\">" + errs.map(function (e) {
          return '<div class="err"><p style="font-weight:600">' + esc(e.q.p) + (e.q.he ? " " + heSpan(e.q.he) : "") + "</p>" +
            '<p class="good">✓ ' + show(e.q, e.q.a) + '</p><p class="yours">Votre réponse : ' + show(e.q, e.r.c) + "</p>" +
            '<p class="muted small" style="margin-top:4px">' + rich(e.q.x) + "</p></div>";
        }).join("") + "</div>" : "") +
        '<div style="margin-top:20px"><button class="btn secondary" data-restart>Recommencer</button></div>';
      return;
    }

    var q = Q[s.i];
    if (!s.order) s.order = shuffle(q.o.map(function (_, k) { return k; }));
    var answered = s.res.length > s.i ? s.res[s.i] : null;
    var opts = s.order.map(function (k) {
      var cls = "opt" + (q.r ? " rtl" : "");
      if (answered) cls += k === q.a ? " right" : (k === answered.c ? " wrong" : " dim");
      return '<button class="' + cls + '" data-pick="' + k + '"' + (answered ? " disabled" : "") + (q.r ? ' lang="he"' : "") + ">" + esc(q.o[k]) + "</button>";
    }).join("");
    view.innerHTML = top + strip +
      '<p class="eyebrow" style="color:var(--accent)">' + esc(q.k) + "</p>" +
      '<p class="q-prompt">' + esc(q.p) + (q.he ? heSpan(q.he) : "") + "</p>" +
      '<div class="opts">' + opts + "</div>" +
      (answered ? '<div class="fb ' + (answered.ok ? "ok" : "bad") + '"><b>' + (answered.ok ? "Juste." : "Faux.") + "</b><p>" + rich(q.x) + "</p></div>" +
        '<div style="margin-top:16px"><button class="btn" data-nextq>' + (s.i < Q.length - 1 ? "Question suivante" : "Voir le score") + "</button></div>" : "") +
      '<p class="muted small" style="text-align:center;margin-top:16px">' + (s.i + 1) + " / " + Q.length + "</p>";
  }

  /* ---------- events ---------- */
  view.addEventListener("click", function (e) {
    var t = e.target.closest("button, a");
    if (!t) return;
    if (t.hasAttribute("data-go")) { location.hash = t.getAttribute("data-go"); return; }
    if (t.hasAttribute("data-back")) { if (history.length > 1) history.back(); else location.hash = "#/aujourdhui"; return; }
    if (t.hasAttribute("data-sync-now")) { t.disabled = true; t.textContent = "Synchronisation…"; Sync.pull(true).then(viewBackup, viewBackup); return; }
    if (t.hasAttribute("data-sync-off")) { if (confirm("Déconnecter cet appareil ? La copie sur GitHub est conservée.")) { Sync.disconnect(); viewBackup(); } return; }
    if (t.hasAttribute("data-mode")) { save("hm.mode", t.getAttribute("data-mode")); if (session) session.shown = false; viewReview(); return; }
    if (t.hasAttribute("data-show")) { session.shown = true; viewReview(); return; }
    if (t.hasAttribute("data-grade")) {
      var ok = t.getAttribute("data-grade") === "1", id = session.queue.shift();
      grade(id, ok);
      if (!ok && !session.again[id]) { session.again[id] = 1; session.queue.push(id); session.total++; }
      session.done++; session.shown = false; viewReview(); window.scrollTo(0, 0); return;
    }
    if (t.hasAttribute("data-pick")) {
      var quiz = DATA.quizzes.filter(function (q) { return q.date === quizState.date; })[0];
      var c = +t.getAttribute("data-pick"), q = quiz.questions[quizState.i];
      quizState.res.push({ ok: c === q.a, c: c }); viewQuiz(quizState.date); return;
    }
    if (t.hasAttribute("data-nextq")) { quizState.i++; quizState.order = null; viewQuiz(quizState.date); window.scrollTo(0, 0); return; }
    if (t.hasAttribute("data-restart")) { var d = quizState.date; quizState = null; viewQuiz(d); window.scrollTo(0, 0); return; }
  });

  /* ---------- router ---------- */
  function route() {
    if (!DATA) return;
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("?")[0].split("/"), tab = parts[0] || "aujourdhui";
    var q = (h.split("?q=")[1] || "");
    var navTab = { mot: "lexique", quiz: "reviser", sauvegarde: "reviser" }[tab] || tab;
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.getAttribute("data-tab") === navTab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (tab !== "reviser" && tab !== "quiz") { /* keep review session in memory */ }
    switch (tab) {
      case "reviser": viewReview(); break;
      case "lexique": viewLexicon(decodeURIComponent(q)); break;
      case "mot": viewWord(decodeURIComponent(parts[1] || "")); break;
      case "grammaire": viewGrammar(); break;
      case "quiz": viewQuiz(parts[1]); break;
      case "sauvegarde": viewBackup(); break;
      default: viewToday(parts[1]);
    }
    if (tab !== "reviser" || !session) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  function boot(json) {
    DATA = json;
    ["vocab", "grammar", "lessons", "quizzes", "themes"].forEach(function (k) { if (!Array.isArray(DATA[k])) DATA[k] = []; });
    route();
    Sync.pull();
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && DATA) Sync.pull(); });
  fetch("data/lecons.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(boot)
    .catch(function () {
      view.innerHTML = '<h1>Hébreu médical</h1><div class="card empty"><p>Impossible de charger les leçons.</p><p class="muted small" style="margin-top:6px">Vérifiez la connexion puis rouvrez l\'app.</p></div>';
    });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();

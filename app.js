/* GeoTreino — jogo de silhuetas de países para treinar GeoGuessr.
   Depende de: d3 (v7), topojson-client (v3), WORLD_TOPO (data/world.js),
   PAISES (data/paises.js). */

(function () {
  "use strict";

  // ---------- Configuração ----------
  const START_LIVES = 3;
  const BASE_POINTS = 10;
  const STREAK_BONUS = 2; // pontos extras por acerto na sequência
  const MICRO_AREA_PX = 14; // área projetada (px²) abaixo da qual um país ganha marcador clicável
  const LANG_KEY = "geotreino_lang";
  const DIFF_KEY = "geotreino_dificuldade";
  const HARD_POOL = 8; // no nível difícil, sorteia os distratores entre os N países mais próximos

  // ---------- Textos (i18n) ----------
  const STRINGS = {
    pt: {
      htmlLang: "pt-BR",
      title: "GeoTreino — Treino de países para GeoGuessr",
      score: "Pontos", streak: "Sequência", solved: "Acertos", lives: "Vidas",
      restart: "Reiniciar",
      hint: "Clique em um país para adivinhar • use a roda do mouse para dar zoom",
      quizTitle: "Que país é este?",
      quizSub: "Escolha a bandeira e o nome corretos",
      endPoints: "pontos", endSolved: "países acertados", endBest: "maior sequência",
      playAgain: "Jogar de novo",
      hoverMystery: "🌍 país misterioso", hoverNon: "território não jogável",
      winTitle: "🏆 Você mapeou o mundo!",
      winMsg: "Incrível! Você acertou todos os países.",
      loseTitle: "Fim de jogo",
      loseMsg: "Suas vidas acabaram. Bora treinar de novo?",
      toggleTo: "EN",
      diffLabel: "Nível",
      diffEasy: "Fácil", diffMedium: "Médio", diffHard: "Difícil",
      diffEasyTip: "Distratores de qualquer lugar do mundo",
      diffMediumTip: "Distratores do mesmo continente",
      diffHardTip: "Distratores entre os países mais próximos (vizinhos)",
      setupSub: "Configure a partida",
      setupLangLabel: "Idioma · Language",
      setupDiffLabel: "Dificuldade",
      startGame: "Começar",
      quizClose: "Fechar",
    },
    en: {
      htmlLang: "en",
      title: "GeoTreino — Country training for GeoGuessr",
      score: "Score", streak: "Streak", solved: "Solved", lives: "Lives",
      restart: "Restart",
      hint: "Click a country to guess • use the mouse wheel to zoom",
      quizTitle: "Which country is this?",
      quizSub: "Pick the correct flag and name",
      endPoints: "points", endSolved: "countries solved", endBest: "best streak",
      playAgain: "Play again",
      hoverMystery: "🌍 mystery country", hoverNon: "non-playable territory",
      winTitle: "🏆 You mapped the world!",
      winMsg: "Amazing! You guessed every country.",
      loseTitle: "Game over",
      loseMsg: "You're out of lives. Ready for another round?",
      toggleTo: "PT",
      diffLabel: "Level",
      diffEasy: "Easy", diffMedium: "Medium", diffHard: "Hard",
      diffEasyTip: "Distractors from anywhere in the world",
      diffMediumTip: "Distractors from the same continent",
      diffHardTip: "Distractors among the nearest countries (neighbors)",
      setupSub: "Set up your game",
      setupLangLabel: "Language · Idioma",
      setupDiffLabel: "Difficulty",
      startGame: "Start",
      quizClose: "Close",
    },
  };
  // Idioma/dificuldade valem para a partida atual; escolhidos na tela inicial.
  let lang = localStorage.getItem(LANG_KEY) || "pt";
  let dificuldade = localStorage.getItem(DIFF_KEY) || "medio";
  // Seleções pendentes na tela de setup (só viram lang/dificuldade ao clicar em Começar).
  let setupLang = lang;
  let setupDiff = dificuldade;
  const t = () => STRINGS[lang];
  const nomeDe = (p) => (p ? p[lang] : "");

  // Normaliza o id do país (mapa usa inteiro; PAISES é chaveado por inteiro).
  const keyOf = (id) => String(parseInt(id, 10));
  const paisDe = (id) => PAISES[keyOf(id)] || null;
  const jogavel = (feature) => {
    const p = paisDe(feature.id);
    return !!(p && p.iso2);
  };
  const flagUrl = (iso2, size) => `https://flagcdn.com/${size || "w320"}/${iso2}.png`;

  // ---------- Estado do jogo ----------
  let state;
  let lastResult = null; // "win" | "lose" | null (para re-render ao trocar idioma)
  function novoEstado() {
    return {
      score: 0,
      streak: 0,
      bestStreak: 0,
      lives: START_LIVES,
      solved: new Set(), // chaves de países acertados
      answering: false, // true enquanto um popup está aberto
      totalJogaveis: 0,
    };
  }

  // ---------- Elementos ----------
  const el = {
    score: document.getElementById("score"),
    streak: document.getElementById("streak"),
    solved: document.getElementById("solved"),
    lives: document.getElementById("lives"),
    hoverName: document.getElementById("hover-name"),
    quizOverlay: document.getElementById("quiz-overlay"),
    options: document.getElementById("options"),
    endOverlay: document.getElementById("end-overlay"),
    endTitle: document.getElementById("end-title"),
    endMsg: document.getElementById("end-msg"),
    endScore: document.getElementById("end-score"),
    endSolved: document.getElementById("end-solved"),
    endBest: document.getElementById("end-best"),
    playAgain: document.getElementById("play-again"),
    restart: document.getElementById("restart-btn"),
    quizClose: document.getElementById("quiz-close"),
    gameMode: document.getElementById("game-mode"),
    setupOverlay: document.getElementById("setup-overlay"),
    setupSub: document.getElementById("setup-sub"),
    setupLangLabel: document.getElementById("setup-lang-label"),
    setupDiffLabel: document.getElementById("setup-diff-label"),
    setupLang: document.getElementById("setup-lang"),
    setupDiff: document.getElementById("setup-diff"),
    startBtn: document.getElementById("start-btn"),
  };

  // ---------- Mapa (D3) ----------
  const svg = d3.select("#map");
  const gRoot = svg.append("g");
  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);

  const countries = topojson.feature(WORLD_TOPO, WORLD_TOPO.objects.countries).features;

  // Lista de chaves jogáveis únicas (para sortear distratores e contar o total).
  // Únicas porque um id pode ter mais de uma geometria (ex.: Austrália + Ashmore).
  const chavesJogaveis = [...new Set(countries.filter(jogavel).map((f) => keyOf(f.id)))];

  // Centroide geográfico (lon/lat) por país — usado nos distratores por proximidade.
  // Para ids com várias geometrias (ex.: Austrália + Ashmore) usa a de maior área.
  const centroPorChave = {};
  {
    const maiorArea = {};
    for (const f of countries) {
      if (!jogavel(f)) continue;
      const k = keyOf(f.id);
      const area = d3.geoArea(f);
      if (!(k in maiorArea) || area > maiorArea[k]) {
        const c = d3.geoCentroid(f);
        if (isFinite(c[0]) && isFinite(c[1])) {
          maiorArea[k] = area;
          centroPorChave[k] = c;
        }
      }
    }
  }

  let paths; // seleção D3 dos <path> dos países
  let dots; // seleção D3 dos marcadores de microestados
  let microFeatures = []; // features minúsculas que ganham marcador

  function ajustarProjecao() {
    const w = svg.node().clientWidth;
    const h = svg.node().clientHeight;
    projection.fitSize([w, h], { type: "FeatureCollection", features: countries });
  }

  function calcularMicro() {
    // País jogável cuja área projetada é minúscula ganha um marcador circular clicável.
    microFeatures = countries.filter((f) => {
      if (!jogavel(f)) return false;
      const a = Math.abs(path.area(f));
      return a < MICRO_AREA_PX;
    });
  }

  function desenharMapa() {
    ajustarProjecao();
    paths = gRoot
      .selectAll("path")
      .data(countries)
      .join("path")
      .attr("d", path)
      .attr("class", (f) => "country " + (jogavel(f) ? "playable" : "non-playable"))
      .attr("data-key", (f) => keyOf(f.id))
      .on("click", (event, f) => {
        if (jogavel(f)) onClickPais(f);
      })
      .on("mousemove", (event, f) => mostrarHover(f))
      .on("mouseleave", esconderHover);

    calcularMicro();
    dots = gRoot
      .selectAll("circle.micro-dot")
      .data(microFeatures)
      .join("circle")
      .attr("class", "micro-dot")
      .attr("data-key", (f) => keyOf(f.id))
      .attr("r", 3.5)
      .attr("cx", (f) => path.centroid(f)[0])
      .attr("cy", (f) => path.centroid(f)[1])
      .on("click", (event, f) => onClickPais(f))
      .on("mousemove", (event, f) => mostrarHover(f))
      .on("mouseleave", esconderHover);
  }

  function redesenharPaths() {
    if (paths) paths.attr("d", path);
    if (dots) {
      dots
        .attr("cx", (f) => path.centroid(f)[0])
        .attr("cy", (f) => path.centroid(f)[1]);
    }
  }

  // Zoom / pan (permite chegar em microestados)
  const zoom = d3
    .zoom()
    .scaleExtent([1, 40])
    .on("zoom", (event) => gRoot.attr("transform", event.transform));
  svg.call(zoom);

  // ---------- Hover ----------
  function mostrarHover(f) {
    const p = paisDe(f.id);
    // Não revela o nome do país-alvo antes de responder — mostra só "?"
    el.hoverName.textContent = p ? t().hoverMystery : t().hoverNon;
    el.hoverName.classList.add("show");
  }
  function esconderHover() {
    el.hoverName.classList.remove("show");
  }

  // ---------- Quiz ----------
  function sortear(arr, n, excluir) {
    const pool = arr.filter((k) => k !== excluir);
    const escolhidos = [];
    while (escolhidos.length < n && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      escolhidos.push(pool.splice(i, 1)[0]);
    }
    return escolhidos;
  }
  function embaralhar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Ordena as demais chaves pela distância geográfica (grande-círculo) à correta.
  function porProximidade(chaveCorreta) {
    const c0 = centroPorChave[chaveCorreta];
    if (!c0) return null;
    return chavesJogaveis
      .filter((k) => k !== chaveCorreta && centroPorChave[k])
      .map((k) => [k, d3.geoDistance(c0, centroPorChave[k])])
      .sort((a, b) => a[1] - b[1])
      .map((x) => x[0]);
  }

  // Escolhe os distratores conforme a dificuldade escolhida.
  function escolherDistratores(chaveCorreta, n) {
    if (dificuldade === "facil") {
      return sortear(chavesJogaveis, n, chaveCorreta);
    }

    const proximos = porProximidade(chaveCorreta);

    if (dificuldade === "dificil") {
      // Sorteia entre os N mais próximos (vizinhos), com variedade.
      if (!proximos) return sortear(chavesJogaveis, n, chaveCorreta);
      const candidatos = proximos.slice(0, Math.max(HARD_POOL, n));
      return embaralhar(candidatos).slice(0, n);
    }

    // Médio: mesmo continente (aleatório); completa com os mais próximos se faltar.
    const cont = PAISES[chaveCorreta].cont;
    let pool = embaralhar(
      chavesJogaveis.filter((k) => k !== chaveCorreta && PAISES[k].cont === cont)
    ).slice(0, n);
    if (pool.length < n && proximos) {
      const tem = new Set(pool);
      for (const k of proximos) {
        if (pool.length >= n) break;
        if (!tem.has(k)) { tem.add(k); pool.push(k); }
      }
    }
    if (pool.length < n) {
      // fallback extremo: completa aleatoriamente
      for (const k of sortear(chavesJogaveis, n, chaveCorreta)) {
        if (pool.length >= n) break;
        if (!pool.includes(k)) pool.push(k);
      }
    }
    return pool;
  }

  function onClickPais(f) {
    const chave = keyOf(f.id);
    if (state.answering || state.solved.has(chave)) return;
    abrirQuiz(chave);
  }

  function abrirQuiz(chaveCorreta) {
    state.answering = true;
    esconderHover();

    const distratores = escolherDistratores(chaveCorreta, 3);
    const opcoes = embaralhar([chaveCorreta, ...distratores]);

    el.options.innerHTML = "";
    el.options.classList.remove("answered");

    for (const chave of opcoes) {
      const p = PAISES[chave];
      const btn = document.createElement("button");
      btn.className = "option";
      btn.dataset.key = chave;

      const img = document.createElement("img");
      img.src = flagUrl(p.iso2);
      img.alt = nomeDe(p);
      img.loading = "lazy";
      img.onerror = () => {
        const fb = document.createElement("span");
        fb.className = "flag-fallback";
        fb.textContent = "🏳️";
        img.replaceWith(fb);
      };

      const nome = document.createElement("span");
      nome.textContent = nomeDe(p);

      btn.append(img, nome);
      btn.addEventListener("click", () => responder(chave, chaveCorreta));
      el.options.appendChild(btn);
    }

    el.quizOverlay.classList.remove("hidden");
  }

  // Fecha o popup sem responder (sem perder vida nem pontos).
  function fecharQuiz() {
    if (el.quizOverlay.classList.contains("hidden")) return;
    if (el.options.classList.contains("answered")) return; // já respondeu; deixa o fecho automático
    el.quizOverlay.classList.add("hidden");
    state.answering = false;
  }

  function responder(chaveEscolhida, chaveCorreta) {
    if (el.options.classList.contains("answered")) return;
    el.options.classList.add("answered");

    const acertou = chaveEscolhida === chaveCorreta;

    // Marca visualmente as opções
    el.options.querySelectorAll(".option").forEach((btn) => {
      const k = btn.dataset.key;
      if (k === chaveCorreta) btn.classList.add("correct");
      else if (k === chaveEscolhida) btn.classList.add("wrong");
    });

    const paisPath = paths.filter(function (f) {
      return keyOf(f.id) === chaveCorreta;
    });
    const paisDot = dots
      ? dots.filter((f) => keyOf(f.id) === chaveCorreta)
      : d3.selectAll(null);

    if (acertou) {
      state.score += BASE_POINTS + state.streak * STREAK_BONUS;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.solved.add(chaveCorreta);
      paisPath.classed("correct", true).classed("playable", false);
      paisDot.classed("solved", true);
    } else {
      state.streak = 0;
      state.lives -= 1;
      paisPath.classed("wrong", true);
      // remove o vermelho depois de um tempo (país continua jogável)
      setTimeout(() => paisPath.classed("wrong", false), 1200);
    }

    atualizarHUD();

    // Fecha o popup e checa fim de jogo
    setTimeout(() => {
      el.quizOverlay.classList.add("hidden");
      state.answering = false;
      if (state.lives <= 0) fimDeJogo(false);
      else if (state.solved.size >= state.totalJogaveis) fimDeJogo(true);
    }, acertou ? 650 : 1250);
  }

  // ---------- HUD ----------
  function atualizarHUD() {
    el.score.textContent = state.score;
    el.streak.textContent = state.streak + " 🔥";
    el.solved.textContent = state.solved.size + " / " + state.totalJogaveis;
    el.lives.textContent = state.lives > 0 ? "❤️".repeat(state.lives) : "💀";
  }

  // ---------- Fim de jogo ----------
  function fimDeJogo(venceu) {
    lastResult = venceu ? "win" : "lose";
    renderFim();
    el.endOverlay.classList.remove("hidden");
  }
  function renderFim() {
    if (!lastResult) return;
    const venceu = lastResult === "win";
    el.endTitle.textContent = venceu ? t().winTitle : t().loseTitle;
    el.endMsg.textContent = venceu ? t().winMsg : t().loseMsg;
    el.endScore.textContent = state.score;
    el.endSolved.textContent = state.solved.size;
    el.endBest.textContent = state.bestStreak;
  }

  // ---------- Idioma / modo ----------
  function aplicarIdioma() {
    document.documentElement.lang = t().htmlLang;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (STRINGS[lang][key] != null) node.textContent = STRINGS[lang][key];
    });
    el.quizClose.title = t().quizClose;
    renderModo();
    renderFim(); // atualiza tela final se estiver visível
  }
  function renderModo() {
    const nomeDiff = { facil: t().diffEasy, medio: t().diffMedium, dificil: t().diffHard }[dificuldade];
    el.gameMode.textContent = (lang === "pt" ? "PT" : "EN") + " · " + nomeDiff;
  }

  // ---------- Tela inicial (setup da partida) ----------
  function renderSetup() {
    const s = STRINGS[setupLang];
    el.setupSub.textContent = s.setupSub;
    el.setupLangLabel.textContent = s.setupLangLabel;
    el.setupDiffLabel.textContent = s.setupDiffLabel;
    el.startBtn.textContent = s.startGame;
    el.setupLang.querySelectorAll(".seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === setupLang);
    });
    const rot = { facil: s.diffEasy, medio: s.diffMedium, dificil: s.diffHard };
    const dica = { facil: s.diffEasyTip, medio: s.diffMediumTip, dificil: s.diffHardTip };
    el.setupDiff.querySelectorAll(".seg-btn").forEach((b) => {
      b.textContent = rot[b.dataset.diff];
      b.title = dica[b.dataset.diff];
      b.classList.toggle("active", b.dataset.diff === setupDiff);
    });
  }
  function abrirSetup() {
    setupLang = lang;
    setupDiff = dificuldade;
    renderSetup();
    el.quizOverlay.classList.add("hidden");
    el.endOverlay.classList.add("hidden");
    el.setupOverlay.classList.remove("hidden");
  }
  function iniciarJogo() {
    lang = setupLang;
    dificuldade = setupDiff;
    localStorage.setItem(LANG_KEY, lang);
    localStorage.setItem(DIFF_KEY, dificuldade);
    aplicarIdioma();
    el.setupOverlay.classList.add("hidden");
    reiniciar();
  }

  // ---------- Reset ----------
  function reiniciar() {
    state = novoEstado();
    state.totalJogaveis = chavesJogaveis.length;
    lastResult = null;
    if (paths) {
      paths
        .classed("correct", false)
        .classed("wrong", false)
        .classed("playable", (f) => jogavel(f));
    }
    if (dots) dots.classed("solved", false);
    el.quizOverlay.classList.add("hidden");
    el.endOverlay.classList.add("hidden");
    atualizarHUD();
  }

  // ---------- Init ----------
  desenharMapa();
  reiniciar();
  aplicarIdioma();

  // Setup da partida: botões de idioma e dificuldade só atualizam a seleção pendente.
  el.setupLang.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => { setupLang = btn.dataset.lang; renderSetup(); });
  });
  el.setupDiff.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => { setupDiff = btn.dataset.diff; renderSetup(); });
  });
  el.startBtn.addEventListener("click", iniciarJogo);

  // Fechar o popup do país (X, clique fora do card ou tecla Esc), sem penalidade.
  el.quizClose.addEventListener("click", fecharQuiz);
  el.quizOverlay.addEventListener("click", (e) => {
    if (e.target === el.quizOverlay) fecharQuiz();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharQuiz();
  });

  // Reiniciar / jogar de novo reabrem a tela inicial (redefine idioma e dificuldade).
  el.playAgain.addEventListener("click", abrirSetup);
  el.restart.addEventListener("click", abrirSetup);

  // Toda abertura começa pela tela de setup.
  abrirSetup();

  window.addEventListener("resize", () => {
    ajustarProjecao();
    calcularMicro();
    redesenharPaths();
  });
})();

// Frontend vanilla JS (sin frameworks) para mantener el proyecto simple de
// desplegar: todo lo que hace falta es servir estos ficheros estaticos junto
// al backend Express (ya lo hace src/server.js).

const state = {
  matches: [],
  legs: [], // { matchId, market, selection, label, matchLabel, probability, odds }
  teams: [],
};

const el = (id) => document.getElementById(id);

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Error ${res.status}`), { data });
  }
  return data;
}

// ---------- Tabs ----------
function showTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  const panel = el(`tab-${tabName}`);
  if (panel) panel.classList.add("active");
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});
el("back-to-dashboard").addEventListener("click", () => showTab("dashboard"));

// ---------- Health / mode badge ----------
async function loadHealth() {
  try {
    const health = await api("/health");
    const badge = el("mode-badge");
    badge.textContent = health.mockMode ? "Modo demo (datos de ejemplo)" : "Datos en vivo";
    badge.classList.add(health.mockMode ? "demo" : "live");
    el("responsible-note").textContent = health.responsibleGamblingNote;
  } catch (e) {
    el("mode-badge").textContent = "Sin conexión con el servidor";
  }
}

// ---------- Dashboard ----------
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function loadMatches() {
  const list = el("matches-list");
  try {
    const { matches } = await api("/matches");
    state.matches = matches;
    if (!matches.length) {
      list.innerHTML = `<p class="muted">No hay partidos programados en los próximos días para las competiciones seguidas.</p>`;
      return;
    }
    list.innerHTML = matches
      .map(
        (m) => `
      <div class="match-card ${m.isPriority ? "priority" : ""}" data-id="${m.id}">
        <div class="match-competition">${escapeHtml(m.competition.name)}</div>
        <div class="match-teams">${escapeHtml(m.homeTeam.name)} vs ${escapeHtml(m.awayTeam.name)}</div>
        <div class="match-date">${formatDate(m.utcDate)}</div>
        ${m.isPriority ? '<span class="priority-badge">Barça / Real Madrid</span>' : ""}
      </div>`
      )
      .join("");
    list.querySelectorAll(".match-card").forEach((card) => {
      card.addEventListener("click", () => openReport(card.dataset.id));
    });
  } catch (e) {
    list.innerHTML = `<p class="muted">Error cargando partidos: ${escapeHtml(e.message)}</p>`;
  }
}

// ---------- Match report ----------
function probRow(label, value) {
  const pct = Math.round(value * 100);
  return `<div class="prob-row">
    <span>${label}</span>
    <span class="prob-track"><span class="prob-fill" style="width:${pct}%"></span></span>
    <span>${pct}%</span>
  </div>`;
}

function legKey(l) {
  return `${l.matchId}__${l.market}__${l.selection}`;
}

function isLegAdded(candidate) {
  return state.legs.some((l) => legKey(l) === legKey(candidate));
}

async function openReport(matchId) {
  showTab("report");
  const content = el("report-content");
  content.innerHTML = "Cargando informe…";
  try {
    const report = await api(`/matches/${matchId}/report`);
    renderReport(report);
  } catch (e) {
    content.innerHTML = `<p class="muted">Error cargando el informe: ${escapeHtml(e.message)}</p>`;
  }
}

function renderReport(report) {
  const { match, probResult, commentary, candidates } = report;
  const p = probResult.probabilities;
  const content = el("report-content");

  const marketsRows = candidates
    .map((c) => {
      const added = isLegAdded(c);
      const edgeCell =
        c.modelEdge == null
          ? '<span class="muted">—</span>'
          : `<span class="${c.modelEdge >= 0 ? "edge-pos" : "edge-neg"}">${c.modelEdge >= 0 ? "+" : ""}${Math.round(c.modelEdge * 100)}%</span>`;
      return `<tr>
        <td>${escapeHtml(c.label)}</td>
        <td>${Math.round(c.probability * 100)}%</td>
        <td>${c.odds != null ? c.odds : '<span class="muted">Sin cuota API</span>'}</td>
        <td>${edgeCell}</td>
        <td><button class="add-leg-btn" data-key="${legKey(c)}" ${added ? "disabled" : ""}>${added ? "Añadida ✓" : "+ Combinada"}</button></td>
      </tr>`;
    })
    .join("");

  content.innerHTML = `
    <div class="report-header">
      <h2>${escapeHtml(match.homeTeam.name)} vs ${escapeHtml(match.awayTeam.name)}</h2>
      <span class="muted">${escapeHtml(match.competition.name)} · ${formatDate(match.utcDate)}</span>
    </div>

    <div class="expected-goals">
      <div class="eg-box"><div class="num">${probResult.expectedGoals.home}</div><div class="lbl">Goles esperados local</div></div>
      <div class="eg-box"><div class="num">${probResult.expectedGoals.away}</div><div class="lbl">Goles esperados visitante</div></div>
    </div>

    <div class="prob-bars">
      ${probRow("Gana local", p.homeWin)}
      ${probRow("Empate", p.draw)}
      ${probRow("Gana visitante", p.awayWin)}
      ${probRow("Más de 2.5 goles", p.over25)}
      ${probRow("Ambos marcan", p.bttsYes)}
    </div>

    <div class="commentary card">
      <h3>Informe</h3>
      ${commentary.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>

    <h3 style="margin-top:20px">Todos los mercados analizados</h3>
    <p class="muted">"Valor" compara la probabilidad estimada por el modelo con la probabilidad implícita en la cuota de Winamax: en positivo, el modelo cree que la cuota paga más de lo que esa selección debería (a favor); en negativo, paga menos. Es una estimación, no una garantía.</p>
    <table class="markets-table">
      <thead><tr><th>Selección</th><th>Prob. modelo</th><th>Cuota Winamax</th><th>Valor</th><th></th></tr></thead>
      <tbody>${marketsRows}</tbody>
    </table>
  `;

  content.querySelectorAll(".add-leg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const candidate = candidates.find((c) => legKey(c) === btn.dataset.key);
      if (candidate) addLeg(candidate);
      renderReport(report); // refresca estado "Añadida ✓"
    });
  });
}

// ---------- Combinada builder ----------
function addLeg(candidate) {
  if (isLegAdded(candidate)) return;
  state.legs.push(candidate);
  renderLegsList();
}

function removeLeg(key) {
  state.legs = state.legs.filter((l) => legKey(l) !== key);
  renderLegsList();
}

function renderLegsList() {
  const list = el("legs-list");
  const analyzeBtn = el("analyze-btn");
  const clearBtn = el("clear-legs-btn");

  if (!state.legs.length) {
    list.innerHTML = `<p class="muted">Todavía no has añadido ninguna selección. Ve a "Partidos", abre un informe y pulsa "+ Combinada" en el mercado que quieras.</p>`;
    analyzeBtn.disabled = true;
    clearBtn.disabled = true;
    return;
  }

  list.innerHTML = state.legs
    .map(
      (l) => `<div class="leg-item">
      <span>${escapeHtml(l.matchLabel)} — <strong>${escapeHtml(l.label)}</strong> (${Math.round(l.probability * 100)}%, cuota ${l.odds ?? "—"})</span>
      <button class="leg-remove" data-key="${legKey(l)}" title="Quitar">✕</button>
    </div>`
    )
    .join("");
  list.querySelectorAll(".leg-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeLeg(btn.dataset.key));
  });
  analyzeBtn.disabled = false;
  clearBtn.disabled = false;
}

el("clear-legs-btn").addEventListener("click", () => {
  state.legs = [];
  renderLegsList();
  el("analysis-result").innerHTML = `<p class="muted">Analiza la combinada para ver aquí la probabilidad estimada, la cuota combinada y el valor esperado.</p>`;
  el("optimize-controls").hidden = true;
});

function legsPayload() {
  return state.legs.map((l) => ({ matchId: l.matchId, market: l.market, selection: l.selection }));
}

function renderAnalysis(analysis) {
  const confClass = `confidence-${analysis.confidence.replace(" ", "_")}`;
  el("analysis-result").innerHTML = `
    <div class="result-grid">
      <div class="result-stat"><div class="num">${Math.round(analysis.combinedProbability * 100)}%</div><div class="lbl">Probabilidad conjunta</div></div>
      <div class="result-stat"><div class="num">${analysis.combinedOdds ?? "—"}</div><div class="lbl">Cuota combinada (${analysis.oddsCoverage})</div></div>
      <div class="result-stat"><div class="num ${confClass}">${analysis.confidence}</div><div class="lbl">Confianza</div></div>
      <div class="result-stat"><div class="num">${analysis.expectedValuePerUnit != null ? (analysis.expectedValuePerUnit * 100).toFixed(1) + "%" : "—"}</div><div class="lbl">Valor esperado por unidad apostada</div></div>
    </div>
    ${analysis.warnings.map((w) => `<div class="warning-box">⚠ ${escapeHtml(w)}</div>`).join("")}
  `;
  el("optimize-controls").hidden = false;
  el("optimize-result").innerHTML = "";
}

el("analyze-btn").addEventListener("click", async () => {
  try {
    const analysis = await api("/combinada/analyze", { method: "POST", body: JSON.stringify({ legs: legsPayload() }) });
    renderAnalysis(analysis);
  } catch (e) {
    el("analysis-result").innerHTML = `<p class="muted">Error: ${escapeHtml(e.message)}</p>`;
  }
});

function renderOptimizeResult(result, goal) {
  const box = el("optimize-result");
  const swapsHtml = result.swaps
    .map((s, i) => {
      if (!s.suggested) {
        return `<div class="swap-item"><strong>${escapeHtml(s.original.label)}</strong><div class="swap-reason">${escapeHtml(s.reason)}</div></div>`;
      }
      return `<div class="swap-item">
        <strong>${escapeHtml(s.original.label)}</strong> → <strong>${escapeHtml(s.suggested.label)}</strong>
        <div class="swap-reason">${escapeHtml(s.reason)}</div>
        <button class="add-leg-btn apply-swap-btn" data-index="${i}">Aplicar este cambio</button>
      </div>`;
    })
    .join("");

  const extraHtml = result.extraLegOptions.length
    ? `<h4 style="margin-top:14px">Añadir una pata nueva para subir la cuota</h4>
       <p class="muted">Estas opciones son de otros partidos disponibles no incluidos en tu combinada, con probabilidad estimada alta. Añadir patas SIEMPRE baja la probabilidad conjunta, aunque suba la cuota total.</p>
       ${result.extraLegOptions
         .map(
           (c) =>
             `<div class="swap-item"><strong>${escapeHtml(c.matchLabel)}</strong> — ${escapeHtml(c.label)} (${Math.round(c.probability * 100)}%, cuota ${c.odds})
              <button class="add-leg-btn apply-extra-btn" data-key="${legKey(c)}">Añadir esta pata</button></div>`
         )
         .join("")}`
    : "";

  box.innerHTML = `
    <p class="muted">Combinada original: ${Math.round(result.original.combinedProbability * 100)}% de probabilidad, cuota ${result.original.combinedOdds ?? "—"}.</p>
    <p class="muted">Combinada ${goal === "probabilidad" ? "más segura" : "con más cuota"} resultante: <strong>${Math.round(result.alternative.combinedProbability * 100)}%</strong> de probabilidad, cuota <strong>${result.alternative.combinedOdds ?? "—"}</strong>.</p>
    ${swapsHtml}
    ${extraHtml}
  `;

  box.querySelectorAll(".apply-swap-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const swap = result.swaps[Number(btn.dataset.index)];
      if (!swap || !swap.suggested) return;
      state.legs = state.legs.map((l) => (legKey(l) === legKey(swap.original) ? swap.suggested : l));
      renderLegsList();
      el("analyze-btn").click();
    });
  });
  box.querySelectorAll(".apply-extra-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const candidate = result.extraLegOptions.find((c) => legKey(c) === btn.dataset.key);
      if (candidate) addLeg(candidate);
      el("analyze-btn").click();
    });
  });
}

async function runOptimize(goal) {
  el("optimize-result").innerHTML = "Calculando sugerencias…";
  try {
    const result = await api("/combinada/optimize", {
      method: "POST",
      body: JSON.stringify({ legs: legsPayload(), goal }),
    });
    renderOptimizeResult(result, goal);
  } catch (e) {
    el("optimize-result").innerHTML = `<p class="muted">Error: ${escapeHtml(e.message)}</p>`;
  }
}
el("optimize-prob-btn").addEventListener("click", () => runOptimize("probabilidad"));
el("optimize-odds-btn").addEventListener("click", () => runOptimize("cuota"));

// ---------- Injuries ----------
async function loadInjuriesTeams() {
  const { teams } = await api("/injuries/teams");
  state.teams = teams;
  el("injury-team").innerHTML = teams.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
}

function teamName(teamId) {
  const t = state.teams.find((t) => t.id === Number(teamId));
  return t ? t.name : `Equipo ${teamId}`;
}

async function loadInjuriesList() {
  const { injuries } = await api("/injuries");
  const box = el("injuries-list");
  if (!injuries.length) {
    box.innerHTML = `<p class="muted">No hay notas de lesiones/bajas todavía.</p>`;
    return;
  }
  box.innerHTML = injuries
    .map(
      (n) => `<div class="injury-note">
      <span><strong>${escapeHtml(teamName(n.teamId))}</strong>: ${escapeHtml(n.text)} (${n.affects === "defense" ? "defensa" : "ataque"}, impacto ${n.severity}%)</span>
      <button class="leg-remove" data-id="${n.id}" title="Eliminar">✕</button>
    </div>`
    )
    .join("");
  box.querySelectorAll(".leg-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/injuries/${btn.dataset.id}`, { method: "DELETE" });
      loadInjuriesList();
    });
  });
}

el("injury-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/injuries", {
    method: "POST",
    body: JSON.stringify({
      teamId: Number(el("injury-team").value),
      text: el("injury-text").value,
      severity: Number(el("injury-severity").value),
      affects: el("injury-affects").value,
    }),
  });
  el("injury-text").value = "";
  loadInjuriesList();
});

// ---------- Utils ----------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Init ----------
(async function init() {
  await loadHealth();
  await loadMatches();
  await loadInjuriesTeams();
  await loadInjuriesList();
})();

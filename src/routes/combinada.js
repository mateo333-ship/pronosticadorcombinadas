const express = require("express");
const router = express.Router();
const matchService = require("../services/matchService");
const { analyzeCombinada } = require("../models/combinada");
const { optimizeCombinada } = require("../models/optimizer");
const { RESPONSIBLE_GAMBLING_NOTE } = require("../models/commentary");

// legs de entrada esperadas: [{ matchId, market, selection, manualOdds? }]
async function resolveLegs(inputLegs, { forceRefresh = false } = {}) {
  const matchIds = [...new Set(inputLegs.map((l) => String(l.matchId)))];
  const candidatesByMatch = await matchService.getCandidatesForMatches(matchIds, { forceRefresh });

  const resolved = [];
  const missing = [];

  for (const leg of inputLegs) {
    const pool = candidatesByMatch[leg.matchId] || candidatesByMatch[String(leg.matchId)] || [];
    const found = pool.find((c) => c.market === leg.market && c.selection === leg.selection);
    if (!found) {
      missing.push(leg);
      continue;
    }
    // Si el usuario introduce una cuota manual (para mercados que la API no
    // cubre, p.ej. doble oportunidad), la usamos en vez de "null".
    const odds = found.odds ?? (leg.manualOdds ? Number(leg.manualOdds) : null);
    resolved.push({ ...found, odds });
  }

  return { resolved, missing, candidatesByMatch };
}

router.post("/analyze", async (req, res) => {
  try {
    const { legs, refresh } = req.body;
    if (!Array.isArray(legs) || !legs.length) {
      return res.status(400).json({ error: "Debes enviar al menos una selección en 'legs'." });
    }
    // refresh=true (boton "Actualizar" del frontend en la pestaña Combinada):
    // vuelve a pedir cuotas frescas a Winamax para las selecciones actuales.
    const { resolved, missing } = await resolveLegs(legs, { forceRefresh: !!refresh });
    if (missing.length) {
      return res.status(400).json({
        error: "Alguna selección no se ha podido resolver (revisa matchId/market/selection).",
        missing,
      });
    }
    const analysis = analyzeCombinada(resolved);
    // Devolvemos tambien las selecciones "resueltas" (con la probabilidad y
    // cuota mas recientes) para que el frontend pueda refrescar lo que
    // muestra en la lista de selecciones, no solo el resultado del analisis.
    res.json({ ...analysis, resolvedLegs: resolved, responsibleGamblingNote: RESPONSIBLE_GAMBLING_NOTE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error analizando la combinada", detail: err.message });
  }
});

router.post("/optimize", async (req, res) => {
  try {
    const { legs, goal, minProbability, refresh } = req.body;
    if (!Array.isArray(legs) || !legs.length) {
      return res.status(400).json({ error: "Debes enviar al menos una selección en 'legs'." });
    }
    if (!["probabilidad", "cuota"].includes(goal)) {
      return res.status(400).json({ error: 'goal debe ser "probabilidad" o "cuota"' });
    }
    const forceRefresh = !!refresh;
    const { resolved, missing, candidatesByMatch } = await resolveLegs(legs, { forceRefresh });
    if (missing.length) {
      return res.status(400).json({
        error: "Alguna selección no se ha podido resolver (revisa matchId/market/selection).",
        missing,
      });
    }

    // Para el objetivo "cuota" tambien buscamos patas nuevas en otros
    // partidos disponibles (no solo alternativas dentro de los mismos
    // partidos de la combinada).
    const { allCandidates } = await matchService.getAllCandidatesForUpcoming({ daysAhead: 14, limit: 6, forceRefresh });

    const result = optimizeCombinada({
      legs: resolved,
      candidatesByMatch,
      allCandidates,
      goal,
      minProbability: minProbability != null ? Number(minProbability) : undefined,
    });
    res.json({ ...result, responsibleGamblingNote: RESPONSIBLE_GAMBLING_NOTE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error optimizando la combinada", detail: err.message });
  }
});

module.exports = router;

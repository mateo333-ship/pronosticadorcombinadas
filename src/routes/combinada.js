const express = require("express");
const router = express.Router();
const matchService = require("../services/matchService");
const { analyzeCombinada } = require("../models/combinada");
const { optimizeCombinada } = require("../models/optimizer");
const { RESPONSIBLE_GAMBLING_NOTE } = require("../models/commentary");

// legs de entrada esperadas: [{ matchId, market, selection, manualOdds? }]
async function resolveLegs(inputLegs) {
  const matchIds = [...new Set(inputLegs.map((l) => String(l.matchId)))];
  const candidatesByMatch = await matchService.getCandidatesForMatches(matchIds);

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
    const { legs } = req.body;
    if (!Array.isArray(legs) || !legs.length) {
      return res.status(400).json({ error: "Debes enviar al menos una selección en 'legs'." });
    }
    const { resolved, missing } = await resolveLegs(legs);
    if (missing.length) {
      return res.status(400).json({
        error: "Alguna selección no se ha podido resolver (revisa matchId/market/selection).",
        missing,
      });
    }
    const analysis = analyzeCombinada(resolved);
    res.json({ ...analysis, responsibleGamblingNote: RESPONSIBLE_GAMBLING_NOTE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error analizando la combinada", detail: err.message });
  }
});

router.post("/optimize", async (req, res) => {
  try {
    const { legs, goal, minProbability } = req.body;
    if (!Array.isArray(legs) || !legs.length) {
      return res.status(400).json({ error: "Debes enviar al menos una selección en 'legs'." });
    }
    if (!["probabilidad", "cuota"].includes(goal)) {
      return res.status(400).json({ error: 'goal debe ser "probabilidad" o "cuota"' });
    }
    const { resolved, missing, candidatesByMatch } = await resolveLegs(legs);
    if (missing.length) {
      return res.status(400).json({
        error: "Alguna selección no se ha podido resolver (revisa matchId/market/selection).",
        missing,
      });
    }

    // Para el objetivo "cuota" tambien buscamos patas nuevas en otros
    // partidos disponibles (no solo alternativas dentro de los mismos
    // partidos de la combinada).
    const { allCandidates } = await matchService.getAllCandidatesForUpcoming({ daysAhead: 14, limit: 6 });

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

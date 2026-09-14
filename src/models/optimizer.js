// Sugiere formas de modificar una combinada existente para (a) subir la
// probabilidad de acertarla, o (b) subir la cuota combinada. Es un
// optimizador basado en reglas simples y transparentes (no una caja negra):
// siempre se puede ver por que se sugiere cada cambio y cual es el
// compromiso (trade-off) frente a la combinada original.

const { analyzeCombinada } = require("./combinada");

function sameSelection(a, b) {
  return a.matchId === b.matchId && a.market === b.market && a.selection === b.selection;
}

/**
 * Para cada leg de la combinada, busca en el resto de mercados del MISMO
 * partido una alternativa con mayor probabilidad (tipicamente un mercado mas
 * "seguro": p.ej. pasar de "Gana el Barça" a "Barça o empate").
 */
function suggestSaferSwaps(legs, candidatesByMatch) {
  return legs.map((leg) => {
    const pool = candidatesByMatch[leg.matchId] || [];
    const alternatives = pool
      .filter((c) => !sameSelection(c, leg) && c.probability > leg.probability)
      .sort((a, b) => b.probability - a.probability);
    const best = alternatives[0] || null;
    return {
      original: leg,
      suggested: best,
      reason: best
        ? `"${best.label}" tiene una probabilidad estimada mayor (${pct(best.probability)} vs ${pct(leg.probability)}) en el mismo partido.`
        : "No se ha encontrado una alternativa con mayor probabilidad en este partido.",
    };
  });
}

/**
 * Para cada leg, busca en el mismo partido una alternativa con mayor cuota,
 * siempre que su probabilidad no baje de un minimo razonable (por defecto
 * 35%), para no cambiar "seguro" por "temerario" sin avisar.
 */
function suggestHigherOddsSwaps(legs, candidatesByMatch, { minProbability = 0.35 } = {}) {
  return legs.map((leg) => {
    const pool = candidatesByMatch[leg.matchId] || [];
    const alternatives = pool
      .filter(
        (c) =>
          !sameSelection(c, leg) &&
          c.odds != null &&
          c.probability >= minProbability &&
          (leg.odds == null || c.odds > leg.odds)
      )
      .sort((a, b) => b.odds - a.odds);
    const best = alternatives[0] || null;
    return {
      original: leg,
      suggested: best,
      reason: best
        ? `"${best.label}" paga más (cuota ${best.odds}) y mantiene una probabilidad razonable (${pct(best.probability)}, por encima del mínimo del ${pct(minProbability)} que hemos fijado).`
        : `No hay alternativas en este partido con más cuota que mantengan al menos ${pct(minProbability)} de probabilidad estimada.`,
    };
  });
}

/**
 * Sugiere anadir una seleccion extra (de otro partido disponible, fuera de
 * la combinada actual) para subir la cuota combinada. Se avisa siempre de
 * que anadir patas baja la probabilidad conjunta.
 */
function suggestExtraLegsForOdds(currentLegs, allCandidates, { minProbability = 0.55, limit = 3 } = {}) {
  const usedMatchIds = new Set(currentLegs.map((l) => l.matchId));
  return allCandidates
    .filter((c) => !usedMatchIds.has(c.matchId) && c.odds != null && c.probability >= minProbability)
    .sort((a, b) => b.odds - a.odds)
    .slice(0, limit);
}

function buildAlternativeCombinada(currentLegs, swaps) {
  const newLegs = currentLegs.map((leg, i) => {
    const swap = swaps[i];
    return swap && swap.suggested ? swap.suggested : leg;
  });
  return analyzeCombinada(newLegs);
}

/**
 * Punto de entrada principal: dado el objetivo ("probabilidad" o "cuota"),
 * devuelve las sugerencias leg-a-leg, la combinada alternativa resultante de
 * aplicar todas las sugerencias, y (para el objetivo "cuota") opciones para
 * anadir patas nuevas en vez de sustituir las actuales.
 */
function optimizeCombinada({ legs, candidatesByMatch, allCandidates, goal, minProbability }) {
  const original = analyzeCombinada(legs);

  if (goal === "probabilidad") {
    const swaps = suggestSaferSwaps(legs, candidatesByMatch);
    const alternative = buildAlternativeCombinada(legs, swaps);
    return { goal, original, swaps, alternative, extraLegOptions: [] };
  }

  if (goal === "cuota") {
    const swaps = suggestHigherOddsSwaps(legs, candidatesByMatch, { minProbability: minProbability ?? 0.35 });
    const alternative = buildAlternativeCombinada(legs, swaps);
    const extraLegOptions = suggestExtraLegsForOdds(legs, allCandidates, {
      minProbability: minProbability ?? 0.55,
    });
    return { goal, original, swaps, alternative, extraLegOptions };
  }

  return { error: 'goal debe ser "probabilidad" o "cuota"' };
}

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

module.exports = { optimizeCombinada, suggestSaferSwaps, suggestHigherOddsSwaps, suggestExtraLegsForOdds };

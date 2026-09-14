// Calculo de una combinada (apuesta multiple) a partir de una lista de
// "legs" (selecciones), cada una con su probabilidad estimada por el modelo
// y, si esta disponible, la cuota real de Winamax.

function analyzeCombinada(legs) {
  if (!legs.length) {
    return { error: "La combinada no tiene ninguna seleccion." };
  }

  const warnings = [];

  const matchIds = legs.map((l) => l.matchId);
  const uniqueMatches = new Set(matchIds);
  if (uniqueMatches.size < legs.length) {
    warnings.push(
      "Hay varias selecciones del mismo partido. El calculo combinado asume independencia entre selecciones; combinar mercados del mismo partido normalmente NO es independiente (por ejemplo '1' y 'Más de 2.5 goles' están correlados), así que la probabilidad conjunta mostrada puede estar sub- o sobreestimada."
    );
  }

  const legsWithoutOdds = legs.filter((l) => l.odds == null);
  if (legsWithoutOdds.length) {
    warnings.push(
      `${legsWithoutOdds.length} selección(es) no tienen cuota de Winamax disponible automáticamente (mercado no cubierto por la API de cuotas). Puedes introducir la cuota manualmente para incluirla en el cálculo de cuota combinada.`
    );
  }

  const combinedProbability = legs.reduce((acc, l) => acc * l.probability, 1);

  const legsWithOdds = legs.filter((l) => l.odds != null);
  const combinedOdds = legsWithOdds.length
    ? legsWithOdds.reduce((acc, l) => acc * l.odds, 1)
    : null;

  const impliedProbabilityFromOdds = combinedOdds ? 1 / combinedOdds : null;
  const edge = combinedOdds ? combinedProbability - impliedProbabilityFromOdds : null;
  const expectedValuePerUnit = combinedOdds ? combinedProbability * combinedOdds - 1 : null;

  if (legs.length >= 5) {
    warnings.push(
      "Combinadas de 5 o más selecciones tienen, casi siempre, una probabilidad conjunta baja aunque cada selección individual parezca segura. Revisa si de verdad compensa frente al riesgo."
    );
  }

  return {
    legs,
    numLegs: legs.length,
    combinedProbability: round4(combinedProbability),
    combinedOdds: combinedOdds ? round2(combinedOdds) : null,
    oddsCoverage: `${legsWithOdds.length}/${legs.length}`,
    impliedProbabilityFromOdds: impliedProbabilityFromOdds ? round4(impliedProbabilityFromOdds) : null,
    edge: edge != null ? round4(edge) : null,
    expectedValuePerUnit: expectedValuePerUnit != null ? round4(expectedValuePerUnit) : null,
    confidence: confidenceLabel(combinedProbability, legs.length),
    warnings,
  };
}

function confidenceLabel(prob, numLegs) {
  if (prob >= 0.5) return "Alta";
  if (prob >= 0.3) return "Media";
  if (prob >= 0.15) return "Baja";
  return "Muy baja";
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
function round4(v) {
  return Math.round(v * 10000) / 10000;
}

module.exports = { analyzeCombinada };

// Convierte la salida del modelo de probabilidad + las cuotas obtenidas en
// una lista de "mercados candidatos" para un partido: cada uno con su
// probabilidad estimada por el modelo y, si esta disponible, la cuota de
// Winamax. Estos candidatos son la materia prima tanto del informe de
// partido como del constructor/optimizador de combinadas.

function buildMarketCandidates(match, probResult, odds) {
  const p = probResult.probabilities;
  const home = match.homeTeam.name;
  const away = match.awayTeam.name;

  const candidates = [
    {
      market: "1X2",
      selection: "1",
      label: `Gana ${home}`,
      probability: p.homeWin,
      odds: odds?.markets?.h2h?.home ?? null,
    },
    {
      market: "1X2",
      selection: "X",
      label: "Empate",
      probability: p.draw,
      odds: odds?.markets?.h2h?.draw ?? null,
    },
    {
      market: "1X2",
      selection: "2",
      label: `Gana ${away}`,
      probability: p.awayWin,
      odds: odds?.markets?.h2h?.away ?? null,
    },
    {
      market: "DOBLE_OPORTUNIDAD",
      selection: "1X",
      label: `${home} o empate`,
      probability: p.doubleChance1X,
      odds: null, // no disponible en The Odds API para este bookmaker/mercado
    },
    {
      market: "DOBLE_OPORTUNIDAD",
      selection: "X2",
      label: `Empate o ${away}`,
      probability: p.doubleChanceX2,
      odds: null,
    },
    {
      market: "DOBLE_OPORTUNIDAD",
      selection: "12",
      label: `${home} o ${away} (sin empate)`,
      probability: p.doubleChance12,
      odds: null,
    },
    {
      market: "GOLES",
      selection: "OVER_2_5",
      label: "Más de 2.5 goles",
      probability: p.over25,
      odds: odds?.markets?.totals_2_5?.over ?? null,
    },
    {
      market: "GOLES",
      selection: "UNDER_2_5",
      label: "Menos de 2.5 goles",
      probability: p.under25,
      odds: odds?.markets?.totals_2_5?.under ?? null,
    },
    {
      market: "GOLES",
      selection: "OVER_1_5",
      label: "Más de 1.5 goles",
      probability: p.over15,
      odds: null,
    },
    {
      market: "GOLES",
      selection: "UNDER_1_5",
      label: "Menos de 1.5 goles",
      probability: p.under15,
      odds: null,
    },
    {
      market: "AMBOS_MARCAN",
      selection: "SI",
      label: "Ambos equipos marcan",
      probability: p.bttsYes,
      odds: odds?.markets?.btts?.yes ?? null,
    },
    {
      market: "AMBOS_MARCAN",
      selection: "NO",
      label: "Al menos un equipo no marca",
      probability: p.bttsNo,
      odds: odds?.markets?.btts?.no ?? null,
    },
  ];

  return candidates.map((c) => ({
    ...c,
    matchId: match.id,
    matchLabel: `${home} vs ${away}`,
    hasOdds: c.odds != null,
    // "valor" del mercado segun el modelo si hay cuota: probabilidad estimada
    // menos la probabilidad implicita de la cuota (positivo = el modelo cree
    // que la cuota paga de mas para lo probable que lo ve).
    modelEdge: c.odds != null ? round3(c.probability - 1 / c.odds) : null,
  }));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

module.exports = { buildMarketCandidates };

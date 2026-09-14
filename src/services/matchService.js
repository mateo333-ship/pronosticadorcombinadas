// Orquesta: partidos (football-data.org) + forma de equipos + lesiones
// manuales + modelo de probabilidad + cuotas (The Odds API) + mercados
// candidatos + comentario en texto. Es el punto central que usan las rutas.

const footballData = require("./footballDataClient");
const oddsApi = require("./oddsApiClient");
const injuriesStore = require("../data/injuriesStore");
const { computeMatchProbabilities } = require("../models/probability");
const { buildMarketCandidates } = require("../models/markets");
const { generateMatchCommentary } = require("../models/commentary");
const { isPriorityTeam } = require("../data/teams");

async function getUpcomingMatchesSummary({ daysAhead = 14 } = {}) {
  const matches = await footballData.getUpcomingMatches({ daysAhead });
  return matches.map((m) => ({
    id: m.id,
    utcDate: m.utcDate,
    competition: m.competition,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    isPriority: isPriorityTeam(m.homeTeam.id) || isPriorityTeam(m.awayTeam.id),
  }));
}

async function buildFullMatchReport(matchId) {
  const matches = await footballData.getUpcomingMatches({ daysAhead: 30 });
  const match = matches.find((m) => String(m.id) === String(matchId));
  if (!match) return null;
  return buildReportForMatch(match);
}

async function buildReportForMatch(match) {
  const [homeForm, awayForm, h2h, odds, homeInjuries, awayInjuries] = await Promise.all([
    footballData.getTeamForm(match.homeTeam.id),
    footballData.getTeamForm(match.awayTeam.id),
    footballData.getHeadToHead(match.id, match.homeTeam.id, match.awayTeam.id),
    oddsApi.getOddsForMatch(match),
    injuriesStore.listForTeam(match.homeTeam.id),
    injuriesStore.listForTeam(match.awayTeam.id),
  ]);

  const probResult = computeMatchProbabilities({
    homeForm,
    awayForm,
    h2h,
    homeInjuries,
    awayInjuries,
  });

  const candidates = buildMarketCandidates(match, probResult, odds);
  const commentary = generateMatchCommentary({
    match,
    probResult,
    homeForm,
    awayForm,
    h2h,
    homeInjuries,
    awayInjuries,
  });

  return {
    match,
    probResult,
    odds,
    candidates,
    commentary,
    injuries: { home: homeInjuries, away: awayInjuries },
  };
}

/**
 * Devuelve, para una lista de matchIds, un mapa { matchId: candidates[] } y
 * tambien la lista plana de todos los candidatos (usado por el optimizador
 * para buscar patas alternativas en otros partidos disponibles).
 */
async function getCandidatesForMatches(matchIds) {
  const allMatches = await footballData.getUpcomingMatches({ daysAhead: 30 });
  const relevant = allMatches.filter((m) => matchIds.includes(String(m.id)));
  const reports = await Promise.all(relevant.map((m) => buildReportForMatch(m)));

  const candidatesByMatch = {};
  reports.forEach((r) => {
    candidatesByMatch[r.match.id] = r.candidates;
  });
  return candidatesByMatch;
}

async function getAllCandidatesForUpcoming({ daysAhead = 14, limit = 8 } = {}) {
  const allMatches = await footballData.getUpcomingMatches({ daysAhead });
  const subset = allMatches.slice(0, limit);
  const reports = await Promise.all(subset.map((m) => buildReportForMatch(m)));
  const candidatesByMatch = {};
  let all = [];
  reports.forEach((r) => {
    candidatesByMatch[r.match.id] = r.candidates;
    all = all.concat(r.candidates);
  });
  return { candidatesByMatch, allCandidates: all };
}

module.exports = {
  getUpcomingMatchesSummary,
  buildFullMatchReport,
  getCandidatesForMatches,
  getAllCandidatesForUpcoming,
};

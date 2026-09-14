// Datos de ejemplo REALISTAS (no en vivo) para poder usar y probar la plataforma
// sin necesidad de tener aun las API keys. En cuanto configures
// FOOTBALL_DATA_API_KEY y ODDS_API_KEY en el .env, la app deja de usar esto
// automaticamente y pasa a datos reales.

const now = Date.now();
const days = (n) => new Date(now + n * 24 * 60 * 60 * 1000).toISOString();

const mockMatches = [
  {
    id: "mock-1",
    utcDate: days(3),
    competition: { code: "PD", name: "La Liga (España)" },
    homeTeam: { id: 81, name: "FC Barcelona" },
    awayTeam: { id: 559, name: "Sevilla FC" },
    status: "SCHEDULED",
  },
  {
    id: "mock-2",
    utcDate: days(4),
    competition: { code: "PD", name: "La Liga (España)" },
    homeTeam: { id: 78, name: "Club Atletico de Madrid" },
    awayTeam: { id: 86, name: "Real Madrid CF" },
    status: "SCHEDULED",
  },
  {
    id: "mock-3",
    utcDate: days(10),
    competition: { code: "CL", name: "UEFA Champions League" },
    homeTeam: { id: 86, name: "Real Madrid CF" },
    awayTeam: { id: 81, name: "FC Barcelona" },
    status: "SCHEDULED",
  },
];

// "Forma" reciente simulada: goles marcados/encajados en los ultimos 5-6 partidos,
// local y visitante por separado (asi el modelo de Poisson tiene con que trabajar).
const mockForm = {
  81: { // Barcelona
    name: "FC Barcelona",
    last: [
      { scored: 2, conceded: 1, venue: "H" },
      { scored: 2, conceded: 0, venue: "A" },
      { scored: 3, conceded: 1, venue: "H" },
      { scored: 1, conceded: 1, venue: "A" },
      { scored: 2, conceded: 1, venue: "H" },
      { scored: 2, conceded: 0, venue: "A" },
    ],
  },
  86: { // Real Madrid
    name: "Real Madrid CF",
    last: [
      { scored: 2, conceded: 1, venue: "A" },
      { scored: 3, conceded: 1, venue: "H" },
      { scored: 1, conceded: 0, venue: "A" },
      { scored: 2, conceded: 2, venue: "H" },
      { scored: 4, conceded: 1, venue: "A" },
      { scored: 1, conceded: 1, venue: "H" },
    ],
  },
  559: { // Sevilla
    name: "Sevilla FC",
    last: [
      { scored: 1, conceded: 1, venue: "H" },
      { scored: 0, conceded: 2, venue: "A" },
      { scored: 2, conceded: 2, venue: "H" },
      { scored: 1, conceded: 1, venue: "A" },
      { scored: 0, conceded: 1, venue: "H" },
      { scored: 1, conceded: 2, venue: "A" },
    ],
  },
  78: { // Atletico Madrid
    name: "Club Atletico de Madrid",
    last: [
      { scored: 1, conceded: 0, venue: "H" },
      { scored: 2, conceded: 1, venue: "A" },
      { scored: 1, conceded: 1, venue: "H" },
      { scored: 0, conceded: 0, venue: "A" },
      { scored: 2, conceded: 0, venue: "H" },
      { scored: 1, conceded: 2, venue: "A" },
    ],
  },
};

const mockHeadToHead = {
  "81-86": { totalMatches: 6, homeWins: 3, draws: 1, awayWins: 2, avgGoalsHome: 2.1, avgGoalsAway: 1.8 },
  "86-81": { totalMatches: 6, homeWins: 2, draws: 1, awayWins: 3, avgGoalsHome: 1.8, avgGoalsAway: 2.1 },
  "78-86": { totalMatches: 6, homeWins: 1, draws: 2, awayWins: 3, avgGoalsHome: 1.1, avgGoalsAway: 1.9 },
  "86-78": { totalMatches: 6, homeWins: 3, draws: 2, awayWins: 1, avgGoalsHome: 1.9, avgGoalsAway: 1.1 },
};

// Cuotas de ejemplo (formato similar a The Odds API, bookmaker winamax_fr)
const mockOdds = {
  "mock-1": {
    bookmaker: "winamax_fr",
    markets: {
      h2h: { home: 1.45, draw: 4.6, away: 6.5 },
      totals_2_5: { over: 1.6, under: 2.25 },
      btts: { yes: 1.55, no: 2.35 },
    },
  },
  "mock-2": {
    bookmaker: "winamax_fr",
    markets: {
      h2h: { home: 3.4, draw: 3.5, away: 2.05 },
      totals_2_5: { over: 1.9, under: 1.85 },
      btts: { yes: 1.7, no: 2.05 },
    },
  },
  "mock-3": {
    bookmaker: "winamax_fr",
    markets: {
      h2h: { home: 2.1, draw: 3.6, away: 3.2 },
      totals_2_5: { over: 1.65, under: 2.15 },
      btts: { yes: 1.5, no: 2.5 },
    },
  },
};

module.exports = { mockMatches, mockForm, mockHeadToHead, mockOdds };

const config = require("../config");
const cache = require("./cache");
const { mockOdds } = require("../mock/mockData");

// Claves de deporte de The Odds API para las competiciones que seguimos.
// Puedes comprobarlas/actualizarlas tu mismo con:
//   curl "https://api.the-odds-api.com/v4/sports/?apiKey=TU_KEY"
const SPORT_KEYS = {
  PD: "soccer_spain_la_liga",
  CL: "soccer_uefa_champs_league",
};

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/\b(cf|fc|club)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function fetchOddsForSport(sportKey) {
  const url = new URL(`${config.oddsApi.baseUrl}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", config.oddsApi.apiKey);
  url.searchParams.set("bookmakers", config.oddsApi.bookmakerKey);
  url.searchParams.set("markets", "h2h,totals,btts");
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`the-odds-api ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  // El plan gratuito descuenta "creditos" segun cabeceras de respuesta; los
  // dejamos registrados para que puedas vigilar el consumo mensual.
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  if (remaining != null) {
    console.log(`[oddsApi] creditos usados=${used} restantes=${remaining}`);
  }
  return res.json();
}

function extractMarkets(bookmakerData) {
  const out = { h2h: null, totals_2_5: null, btts: null };
  for (const market of bookmakerData.markets || []) {
    if (market.key === "h2h") {
      const home = market.outcomes.find((o) => o.name === bookmakerData.__homeTeam);
      const away = market.outcomes.find((o) => o.name === bookmakerData.__awayTeam);
      const draw = market.outcomes.find((o) => o.name === "Draw");
      out.h2h = {
        home: home?.price ?? null,
        draw: draw?.price ?? null,
        away: away?.price ?? null,
      };
    } else if (market.key === "totals") {
      const line25 = market.outcomes.filter((o) => o.point === 2.5);
      const over = line25.find((o) => o.name === "Over");
      const under = line25.find((o) => o.name === "Under");
      if (over || under) out.totals_2_5 = { over: over?.price ?? null, under: under?.price ?? null };
    } else if (market.key === "btts") {
      const yes = market.outcomes.find((o) => o.name === "Yes");
      const no = market.outcomes.find((o) => o.name === "No");
      out.btts = { yes: yes?.price ?? null, no: no?.price ?? null };
    }
  }
  return out;
}

/**
 * Devuelve las cuotas de Winamax para un partido concreto (identificado por
 * equipos y fecha, tal y como vienen de football-data.org).
 */
async function getOddsForMatch(match) {
  if (config.useMockData) {
    return mockOdds[match.id] || null;
  }

  const sportKey = SPORT_KEYS[match.competition.code];
  if (!sportKey) return null;

  const cacheKey = `odds_${sportKey}`;
  let events = await cache.get(cacheKey);
  if (!events) {
    try {
      events = await fetchOddsForSport(sportKey);
      await cache.set(cacheKey, events, config.refresh.oddsCronHours * 60 * 60 * 1000);
    } catch (err) {
      console.error(`[oddsApi] error obteniendo cuotas de ${sportKey}:`, err.message);
      events = (await cache.getStaleValueEvenIfExpired(cacheKey)) || [];
    }
  }

  const event = events.find(
    (e) =>
      namesMatch(e.home_team, match.homeTeam.name) &&
      namesMatch(e.away_team, match.awayTeam.name) &&
      Math.abs(new Date(e.commence_time) - new Date(match.utcDate)) < 24 * 60 * 60 * 1000
  );
  if (!event) return null;

  const bookmaker = event.bookmakers?.find((b) => b.key === config.oddsApi.bookmakerKey);
  if (!bookmaker) return null;

  bookmaker.__homeTeam = event.home_team;
  bookmaker.__awayTeam = event.away_team;

  return { bookmaker: bookmaker.key, markets: extractMarkets(bookmaker) };
}

module.exports = { getOddsForMatch, SPORT_KEYS };

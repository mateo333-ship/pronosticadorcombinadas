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

// h2h = 1X2, totals = mas/menos goles (linea principal), btts = ambos marcan,
// draw_no_bet = empate no apuesta, spreads = hándicap asiático (linea
// principal que ofrezca Winamax para ese partido). Cuantos mas mercados se
// piden, mas creditos gasta cada llamada en el plan gratuito de The Odds API
// (revisa tu consumo en https://the-odds-api.com/account).
const DEFAULT_MARKETS = ["h2h", "totals", "btts", "draw_no_bet", "spreads"];

// Si The Odds API responde 422 "Markets not supported by this endpoint: X, Y"
// extraemos que mercados son los problematicos, para poder reintentar sin
// ellos en vez de perder TODOS los mercados (incluido el 1X2, que si suele
// estar disponible) por culpa de uno o dos que no lo estan para esta
// liga/bookmaker en concreto. Esto puede variar por competicion o cambiar con
// el tiempo por parte de The Odds API, asi que es mas robusto detectarlo que
// dar por hecho una lista fija.
function parseUnsupportedMarkets(message) {
  const match = /markets not supported[^:]*:\s*(.+)$/i.exec(message || "");
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchOddsForSport(sportKey, markets = DEFAULT_MARKETS) {
  const url = new URL(`${config.oddsApi.baseUrl}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", config.oddsApi.apiKey);
  url.searchParams.set("bookmakers", config.oddsApi.bookmakerKey);
  url.searchParams.set("markets", markets.join(","));
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 422) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.error_code === "INVALID_MARKET") {
          const unsupported = parseUnsupportedMarkets(parsed.message);
          const remaining = markets.filter((m) => !unsupported.includes(m));
          if (unsupported.length && remaining.length && remaining.length < markets.length) {
            console.warn(
              `[oddsApi] ${sportKey}: mercados no soportados (${unsupported.join(", ")}), reintentando con [${remaining.join(", ")}]`
            );
            return fetchOddsForSport(sportKey, remaining);
          }
        }
      } catch (e) {
        // si no podemos interpretar el cuerpo del error, caemos al error generico de abajo
      }
    }
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
  const out = { h2h: null, totals_2_5: null, btts: null, draw_no_bet: null, spreads: null };
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
    } else if (market.key === "draw_no_bet") {
      const home = market.outcomes.find((o) => o.name === bookmakerData.__homeTeam);
      const away = market.outcomes.find((o) => o.name === bookmakerData.__awayTeam);
      if (home || away) out.draw_no_bet = { home: home?.price ?? null, away: away?.price ?? null };
    } else if (market.key === "spreads") {
      // Winamax normalmente solo ofrece una linea de hándicap por partido en
      // este mercado (la "principal"); tomamos la pareja local/visitante tal
      // cual venga.
      const home = market.outcomes.find((o) => o.name === bookmakerData.__homeTeam);
      const away = market.outcomes.find((o) => o.name === bookmakerData.__awayTeam);
      if (home && away && home.point != null && away.point != null) {
        out.spreads = {
          home: { point: home.point, price: home.price ?? null },
          away: { point: away.point, price: away.price ?? null },
        };
      }
    }
  }
  return out;
}

/**
 * Devuelve las cuotas de Winamax para un partido concreto (identificado por
 * equipos y fecha, tal y como vienen de football-data.org).
 */
async function getOddsForMatch(match, { forceRefresh = false } = {}) {
  if (config.useMockData) {
    return mockOdds[match.id] || null;
  }

  const sportKey = SPORT_KEYS[match.competition.code];
  if (!sportKey) return null;

  const cacheKey = `odds_${sportKey}`;

  // Igual que en footballDataClient: "Actualizar" salta la cache, pero como
  // mucho una vez por minuto por deporte, para no gastar de mas los creditos
  // (limitados) del plan gratuito de The Odds API.
  let skipCache = false;
  if (forceRefresh) {
    skipCache = await cache.tryConsumeForceRefresh(cacheKey, 60000);
  }

  let events = skipCache ? null : await cache.get(cacheKey);
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

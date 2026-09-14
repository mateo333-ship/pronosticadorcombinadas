const config = require("../config");
const cache = require("./cache");
const { createRateLimiter } = require("./rateLimiter");
const { mockMatches, mockForm, mockHeadToHead } = require("../mock/mockData");
const { COMPETITIONS, ALL_TRACKED_TEAMS } = require("../data/teams");

// Plan Free de football-data.org: 10 peticiones/minuto. Dejamos margen (8) por
// si el scheduler y una peticion manual del usuario coinciden en el tiempo.
const limiter = createRateLimiter(8);

async function apiGet(pathname, params = {}) {
  const url = new URL(config.footballData.baseUrl + pathname);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  return limiter.schedule(async () => {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": config.footballData.apiKey },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`football-data.org ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }
    return res.json();
  });
}

/**
 * Proximos partidos de las competiciones seguidas (La Liga, Champions),
 * marcando cuales tienen a Barcelona o Real Madrid.
 */
async function getUpcomingMatches({ daysAhead = 14 } = {}) {
  if (config.useMockData) return mockMatches;

  const cacheKey = `matches_${daysAhead}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const dateFrom = new Date().toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  // Las dos competiciones se piden en paralelo (no una tras otra): el
  // limitador ya se encarga de no superar el limite de football-data.org
  // aunque salgan a la vez, y esto evita sumar latencias innecesarias en
  // una ruta que el usuario esta esperando activamente.
  const results = await Promise.all(
    COMPETITIONS.map(async (comp) => {
      try {
        const data = await apiGet(`/competitions/${comp.code}/matches`, {
          dateFrom,
          dateTo,
          status: "SCHEDULED",
        });
        return (data.matches || []).map((m) => ({
          id: m.id,
          utcDate: m.utcDate,
          competition: { code: comp.code, name: comp.name },
          homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
          awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
          status: m.status,
        }));
      } catch (err) {
        console.error(`[footballData] error obteniendo partidos de ${comp.code}:`, err.message);
        // seguimos con las demas competiciones aunque una falle
        return [];
      }
    })
  );
  const all = results.flat();

  all.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  await cache.set(cacheKey, all, config.refresh.matchesCronMinutes * 60 * 1000);
  return all.length ? all : (await cache.getStaleValueEvenIfExpired(cacheKey)) || [];
}

/**
 * Forma reciente de un equipo: goles marcados/encajados en sus ultimos N
 * partidos finalizados, indicando si jugo en casa (H) o fuera (A).
 */
async function getTeamForm(teamId, limit = 6) {
  if (config.useMockData) return mockForm[teamId] || null;

  const cacheKey = `form_${teamId}_${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiGet(`/teams/${teamId}/matches`, {
      status: "FINISHED",
      limit,
    });
    const last = (data.matches || []).slice(-limit).map((m) => {
      const isHome = m.homeTeam.id === teamId;
      const scored = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      return { scored, conceded, venue: isHome ? "H" : "A" };
    });
    const teamName = (data.matches?.[0]?.homeTeam.id === teamId
      ? data.matches?.[0]?.homeTeam.name
      : data.matches?.[0]?.awayTeam.name) || `Equipo ${teamId}`;
    const result = { name: teamName, last };
    await cache.set(cacheKey, result, 6 * 60 * 60 * 1000); // 6h
    return result;
  } catch (err) {
    console.error(`[footballData] error obteniendo forma del equipo ${teamId}:`, err.message);
    return (await cache.getStaleValueEvenIfExpired(cacheKey)) || null;
  }
}

/**
 * Historial de enfrentamientos directos para un partido concreto (requiere el
 * id de partido de football-data.org, no un id de equipo).
 */
async function getHeadToHead(matchId, homeId, awayId) {
  if (config.useMockData) {
    return mockHeadToHead[`${homeId}-${awayId}`] || null;
  }

  const cacheKey = `h2h_${matchId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiGet(`/matches/${matchId}/head2head`, { limit: 10 });
    const stats = data.aggregates;
    if (!stats) return null;
    const result = {
      totalMatches: stats.numberOfMatches,
      homeWins: stats.homeTeam?.wins ?? 0,
      draws: stats.homeTeam?.draws ?? 0,
      awayWins: stats.awayTeam?.wins ?? 0,
    };
    await cache.set(cacheKey, result, 24 * 60 * 60 * 1000); // 24h, esto cambia poco
    return result;
  } catch (err) {
    console.error(`[footballData] error obteniendo head2head del partido ${matchId}:`, err.message);
    return (await cache.getStaleValueEvenIfExpired(cacheKey)) || null;
  }
}

module.exports = { getUpcomingMatches, getTeamForm, getHeadToHead };

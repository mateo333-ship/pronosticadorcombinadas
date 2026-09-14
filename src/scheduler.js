// Refresca periodicamente la cache de partidos y cuotas para que la app este
// "siempre al dia" una vez desplegada 24/7, sin depender de que alguien abra
// la web para disparar la llamada a la API (y sin gastar peticiones de mas).

const cron = require("node-cron");
const config = require("./config");
const footballData = require("./services/footballDataClient");
const matchService = require("./services/matchService");

function start() {
  if (config.useMockData) {
    console.log("[scheduler] modo demo activo (sin API keys reales): no se programan refrescos.");
    return;
  }

  const matchesCron = `*/${config.refresh.matchesCronMinutes} * * * *`;
  cron.schedule(matchesCron, async () => {
    try {
      console.log("[scheduler] refrescando partidos...");
      await footballData.getUpcomingMatches({ daysAhead: 14 });
    } catch (err) {
      console.error("[scheduler] error refrescando partidos:", err.message);
    }
  });

  const oddsCron = `0 */${config.refresh.oddsCronHours} * * *`;
  cron.schedule(oddsCron, async () => {
    try {
      console.log("[scheduler] refrescando cuotas y candidatos...");
      await matchService.getAllCandidatesForUpcoming({ daysAhead: 14, limit: 6 });
    } catch (err) {
      console.error("[scheduler] error refrescando cuotas:", err.message);
    }
  });

  console.log(
    `[scheduler] activo: partidos cada ${config.refresh.matchesCronMinutes} min, cuotas cada ${config.refresh.oddsCronHours} h.`
  );
}

module.exports = { start };

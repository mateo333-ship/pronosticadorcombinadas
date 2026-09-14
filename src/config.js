require("dotenv").config();

function bool(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  return String(v).toLowerCase() === "true";
}

const config = {
  port: parseInt(process.env.PORT || "3000", 10),

  footballData: {
    apiKey: process.env.FOOTBALL_DATA_API_KEY || "",
    baseUrl: "https://api.football-data.org/v4",
  },

  oddsApi: {
    apiKey: process.env.ODDS_API_KEY || "",
    baseUrl: "https://api.the-odds-api.com/v4",
    bookmakerKey: process.env.ODDS_BOOKMAKER_KEY || "winamax_fr",
  },

  // Si no hay claves reales configuradas, cae automaticamente en modo demo (datos de ejemplo).
  useMockData:
    bool(process.env.USE_MOCK_DATA, false) ||
    !(process.env.FOOTBALL_DATA_API_KEY && process.env.ODDS_API_KEY),

  refresh: {
    matchesCronMinutes: parseInt(process.env.REFRESH_MATCHES_CRON_MINUTES || "30", 10),
    oddsCronHours: parseInt(process.env.REFRESH_ODDS_CRON_HOURS || "6", 10),
  },
};

module.exports = config;

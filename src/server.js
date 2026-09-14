const path = require("path");
const express = require("express");
const cors = require("cors");
const config = require("./config");
const scheduler = require("./scheduler");
const matchService = require("./services/matchService");

const matchesRouter = require("./routes/matches");
const combinadaRouter = require("./routes/combinada");
const injuriesRouter = require("./routes/injuries");
const { RESPONSIBLE_GAMBLING_NOTE } = require("./models/commentary");

// En Vercel (process.env.VERCEL="1") esta app se ejecuta como funcion
// serverless: no hay proceso encendido de forma permanente, asi que no
// tiene sentido llamar a app.listen() ni arrancar el scheduler de
// node-cron (nunca llegaria a dispararse de forma fiable). En su lugar, el
// refresco de datos ocurre "al vuelo" en cada peticion (ver cache.js: si el
// dato cacheado ha caducado, se vuelve a pedir a la API en ese momento).
const isVercel = !!process.env.VERCEL;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mockMode: config.useMockData,
    runtime: isVercel ? "vercel" : "server",
    time: new Date().toISOString(),
    responsibleGamblingNote: RESPONSIBLE_GAMBLING_NOTE,
  });
});

app.get("/favicon.ico", (req, res) => res.status(204).end());

// Endpoint pensado para un cron job (de node-cron en modo servidor, o de
// Vercel Cron Jobs en modo serverless) que "precalienta" la cache de
// partidos y cuotas para que la primera visita del dia no tenga que
// esperar a la API externa. Es opcional: aunque nunca se llame, cada ruta
// ya refresca sola sus datos cuando la cache caduca.
app.get("/api/warmup", async (req, res) => {
  try {
    await matchService.getAllCandidatesForUpcoming({ daysAhead: 14, limit: 6 });
    res.json({ ok: true, warmedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[warmup] error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use("/api/matches", matchesRouter);
app.use("/api/combinada", combinadaRouter);
app.use("/api/injuries", injuriesRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

if (!isVercel) {
  app.listen(config.port, () => {
    console.log(`Servidor escuchando en http://localhost:${config.port}`);
    console.log(
      config.useMockData
        ? "MODO DEMO: usando datos de ejemplo (configura FOOTBALL_DATA_API_KEY y ODDS_API_KEY en .env para datos reales)."
        : "Modo real: usando football-data.org y The Odds API."
    );
    scheduler.start();
  });
}

// Necesario para que Vercel detecte esta app de Express como funcion
// serverless (ver vercel.json / documentacion "Using Express with Vercel").
module.exports = app;

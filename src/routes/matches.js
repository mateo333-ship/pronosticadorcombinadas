const express = require("express");
const router = express.Router();
const matchService = require("../services/matchService");

router.get("/", async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.daysAhead || "14", 10);
    // ?refresh=1 (boton "Actualizar" del frontend): pide partidos nuevos a
    // football-data.org saltando la cache, en vez de esperar al refresco
    // automatico periodico.
    const forceRefresh = req.query.refresh === "1";
    const matches = await matchService.getUpcomingMatchesSummary({ daysAhead, forceRefresh });
    res.json({ matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo partidos", detail: err.message });
  }
});

router.get("/:id/report", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const report = await matchService.buildFullMatchReport(req.params.id, { forceRefresh });
    if (!report) return res.status(404).json({ error: "Partido no encontrado (¿está dentro de los próximos 30 días?)" });
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando el informe", detail: err.message });
  }
});

module.exports = router;

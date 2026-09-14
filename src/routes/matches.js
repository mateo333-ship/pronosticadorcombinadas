const express = require("express");
const router = express.Router();
const matchService = require("../services/matchService");

router.get("/", async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.daysAhead || "14", 10);
    const matches = await matchService.getUpcomingMatchesSummary({ daysAhead });
    res.json({ matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo partidos", detail: err.message });
  }
});

router.get("/:id/report", async (req, res) => {
  try {
    const report = await matchService.buildFullMatchReport(req.params.id);
    if (!report) return res.status(404).json({ error: "Partido no encontrado (¿está dentro de los próximos 30 días?)" });
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando el informe", detail: err.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const injuriesStore = require("../data/injuriesStore");
const { ALL_TRACKED_TEAMS } = require("../data/teams");

router.get("/teams", (req, res) => {
  res.json({ teams: ALL_TRACKED_TEAMS });
});

router.get("/", async (req, res) => {
  try {
    const injuries = await injuriesStore.listAll();
    res.json({ injuries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error leyendo las notas de lesión", detail: err.message });
  }
});

router.get("/:teamId", async (req, res) => {
  try {
    const injuries = await injuriesStore.listForTeam(req.params.teamId);
    res.json({ injuries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error leyendo las notas de lesión", detail: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { teamId, text, severity, affects } = req.body;
    if (!teamId || !text) {
      return res.status(400).json({ error: "teamId y text son obligatorios." });
    }
    const note = await injuriesStore.add({ teamId, text, severity, affects });
    res.status(201).json({ note });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error guardando la nota de lesión", detail: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await injuriesStore.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "Nota no encontrada" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error eliminando la nota de lesión", detail: err.message });
  }
});

module.exports = router;

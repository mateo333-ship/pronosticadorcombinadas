// Almacen de notas de lesiones/bajas introducidas manualmente por el
// usuario. No hay API gratuita fiable de lesiones en tiempo real, asi que
// esto es lo que el modelo usa para tener en cuenta bajas importantes.
//
// Cada nota: { id, teamId, text, severity (0-100), affects: "attack"|"defense", createdAt }
//
// Backend de fichero por defecto (local, Railway, Render, VPS); backend de
// Redis (Upstash) automatico si hay UPSTASH_REDIS_REST_URL/TOKEN, necesario
// en Vercel porque ahi el disco no persiste entre peticiones.

const fs = require("fs");
const path = require("path");
const redisBackend = require("./../services/redisBackend");

const FILE = path.join(__dirname, "injuries.json");
const REDIS_HASH_KEY = "injuries:notes";

function loadAllFromFile() {
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch (e) {
    return [];
  }
}

function saveAllToFile(notes) {
  fs.writeFileSync(FILE, JSON.stringify(notes, null, 2));
}

function makeNote({ teamId, text, severity = 20, affects = "attack" }) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    teamId: Number(teamId),
    text,
    severity: Math.max(0, Math.min(100, Number(severity))),
    affects: affects === "defense" ? "defense" : "attack",
    createdAt: new Date().toISOString(),
  };
}

async function listAll() {
  if (redisBackend.isEnabled) {
    const raw = await redisBackend.getClient().hgetall(REDIS_HASH_KEY);
    if (!raw) return [];
    // @upstash/redis puede devolver los valores ya parseados o como string
    // segun version; soportamos ambos casos.
    return Object.values(raw).map((v) => (typeof v === "string" ? JSON.parse(v) : v));
  }
  return loadAllFromFile();
}

async function listForTeam(teamId) {
  const all = await listAll();
  return all.filter((n) => n.teamId === Number(teamId));
}

async function add({ teamId, text, severity = 20, affects = "attack" }) {
  const note = makeNote({ teamId, text, severity, affects });

  if (redisBackend.isEnabled) {
    await redisBackend.getClient().hset(REDIS_HASH_KEY, { [note.id]: JSON.stringify(note) });
    return note;
  }

  const notes = loadAllFromFile();
  notes.push(note);
  saveAllToFile(notes);
  return note;
}

async function remove(id) {
  if (redisBackend.isEnabled) {
    const deletedCount = await redisBackend.getClient().hdel(REDIS_HASH_KEY, id);
    return deletedCount > 0;
  }

  const notes = loadAllFromFile();
  const next = notes.filter((n) => n.id !== id);
  saveAllToFile(next);
  return next.length !== notes.length;
}

module.exports = { listForTeam, listAll, add, remove };

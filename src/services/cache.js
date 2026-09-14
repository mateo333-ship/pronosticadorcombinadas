// Cache para no gastar de mas las cuotas de las APIs gratuitas
// (football-data.org: 10 req/min; The Odds API: 500 creditos/mes).
//
// Tiene dos backends posibles:
// - Fichero + memoria (por defecto): vale para local, Railway, Render, un
//   VPS... cualquier sitio donde el proceso de Node se quede encendido.
// - Redis (Upstash), si detecta UPSTASH_REDIS_REST_URL/TOKEN: necesario en
//   Vercel, donde el disco no persiste entre peticiones.
//
// Todas las funciones son async (aunque el backend de fichero no lo
// necesite de verdad) para que el resto del codigo funcione igual sin
// importar que backend este activo.

const fs = require("fs");
const os = require("os");
const path = require("path");
const redisBackend = require("./redisBackend");

// En Vercel el unico sitio del disco donde se puede escribir es /tmp (todo lo
// demas, incluida la carpeta del proyecto, es de solo lectura). Si Redis no
// esta configurado (o falla), usamos esa carpeta como red de seguridad para
// no reventar la peticion con un error de "no such file or directory" -
// aunque lo ideal en Vercel siempre es tener Redis activo (ver redisBackend.js).
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "barca-madrid-combinadas-cache")
  : path.join(__dirname, "..", "..", ".cache");
const memory = new Map();

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function filePathFor(key) {
  const safe = key.replace(/[^a-z0-9_.-]/gi, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function get(key) {
  if (redisBackend.isEnabled) {
    const raw = await redisBackend.getClient().get(`cache:${key}`);
    return raw == null ? null : raw;
  }

  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const fp = filePathFor(key);
  if (fs.existsSync(fp)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(fp, "utf-8"));
      if (parsed.expiresAt > Date.now()) {
        memory.set(key, parsed);
        return parsed.value;
      }
    } catch (e) {
      // cache corrupta en disco, se ignora
    }
  }
  return null;
}

async function set(key, value, ttlMs) {
  if (redisBackend.isEnabled) {
    const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
    await redisBackend.getClient().set(`cache:${key}`, value, { ex: ttlSeconds });
    // guardamos tambien una copia "stale" sin expirar, para poder devolver
    // algo si la API externa falla justo cuando la cache ya ha caducado.
    await redisBackend.getClient().set(`cache:stale:${key}`, value);
    return;
  }

  ensureCacheDir();
  const entry = { value, expiresAt: Date.now() + ttlMs };
  memory.set(key, entry);
  try {
    fs.writeFileSync(filePathFor(key), JSON.stringify(entry));
  } catch (e) {
    // si falla escribir a disco, seguimos solo con memoria
  }
}

// Devuelve el ultimo valor conocido aunque haya caducado (mejor servir algo
// desactualizado que un error, si la API externa falla momentaneamente).
async function getStaleValueEvenIfExpired(key) {
  if (redisBackend.isEnabled) {
    const raw = await redisBackend.getClient().get(`cache:stale:${key}`);
    return raw == null ? null : raw;
  }

  const hit = memory.get(key);
  if (hit) return hit.value;
  const fp = filePathFor(key);
  if (fs.existsSync(fp)) {
    try {
      return JSON.parse(fs.readFileSync(fp, "utf-8")).value;
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = { get, set, getStaleValueEvenIfExpired };

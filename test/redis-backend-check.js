// Verifica la logica del backend de Redis (cache.js / injuriesStore.js)
// SIN necesitar una cuenta real de Upstash: sustituye el paquete
// "@upstash/redis" por una implementacion en memoria que imita su API
// (get/set con TTL, hset/hgetall/hdel), inyectada en el require.cache de
// Node antes de que nuestro codigo la pida.
//
// Esto no prueba la red real de Upstash (eso solo se puede probar con una
// cuenta real, ya en Vercel), pero SI prueba que nuestro codigo llama a los
// metodos correctos, con los argumentos correctos, y maneja bien las
// respuestas — que es justo lo que puede fallar en un refactor como este.

process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.local";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

// --- Fake in-memory que imita @upstash/redis ---
const store = new Map(); // strings: key -> value
const hashes = new Map(); // hashes: key -> Map(field -> value)
const expirations = new Map(); // key -> timestamp

class FakeRedis {
  constructor() {}
  async get(key) {
    if (expirations.has(key) && expirations.get(key) < Date.now()) {
      store.delete(key);
      expirations.delete(key);
      return null;
    }
    return store.has(key) ? store.get(key) : null;
  }
  async set(key, value, opts) {
    store.set(key, value);
    if (opts && opts.ex) expirations.set(key, Date.now() + opts.ex * 1000);
    return "OK";
  }
  async hset(key, fields) {
    if (!hashes.has(key)) hashes.set(key, new Map());
    const h = hashes.get(key);
    let count = 0;
    for (const [f, v] of Object.entries(fields)) {
      if (!h.has(f)) count++;
      h.set(f, v);
    }
    return count;
  }
  async hgetall(key) {
    if (!hashes.has(key)) return null;
    return Object.fromEntries(hashes.get(key));
  }
  async hdel(key, ...fields) {
    if (!hashes.has(key)) return 0;
    const h = hashes.get(key);
    let count = 0;
    for (const f of fields) {
      if (h.delete(f)) count++;
    }
    return count;
  }
}

const fakeModulePath = require.resolve("@upstash/redis");
require.cache[fakeModulePath] = {
  id: fakeModulePath,
  filename: fakeModulePath,
  loaded: true,
  exports: { Redis: FakeRedis },
};

// --- A partir de aqui, cache.js e injuriesStore.js usaran el fake ---
const assert = require("assert");
const cache = require("../src/services/cache");
const injuriesStore = require("../src/data/injuriesStore");
const redisBackend = require("../src/services/redisBackend");

async function main() {
  assert.strictEqual(redisBackend.isEnabled, true, "redisBackend deberia detectar las env vars y activarse");

  // --- cache.js ---
  let value = await cache.get("no-existe-todavia");
  assert.strictEqual(value, null, "una clave inexistente debe devolver null");

  await cache.set("partidos", { hola: "mundo" }, 5000); // TTL 5s
  value = await cache.get("partidos");
  assert.deepStrictEqual(value, { hola: "mundo" }, "cache.get deberia devolver el mismo objeto guardado");

  const stale = await cache.getStaleValueEvenIfExpired("partidos");
  assert.deepStrictEqual(stale, { hola: "mundo" }, "getStaleValueEvenIfExpired deberia devolver el valor guardado");

  console.log("✅ cache.js (backend Redis simulado): OK");

  // --- injuriesStore.js ---
  const note = await injuriesStore.add({ teamId: 81, text: "Lesion de prueba", severity: 30, affects: "attack" });
  assert.ok(note.id, "add() deberia devolver una nota con id");

  const all = await injuriesStore.listAll();
  assert.strictEqual(all.length, 1, "listAll deberia devolver la nota anadida");
  assert.strictEqual(all[0].text, "Lesion de prueba");

  const forTeam = await injuriesStore.listForTeam(81);
  assert.strictEqual(forTeam.length, 1, "listForTeam(81) deberia encontrar la nota");
  const forOtherTeam = await injuriesStore.listForTeam(86);
  assert.strictEqual(forOtherTeam.length, 0, "listForTeam(86) no deberia encontrar nada");

  const removed = await injuriesStore.remove(note.id);
  assert.strictEqual(removed, true, "remove() deberia devolver true al borrar una nota existente");

  const allAfterRemove = await injuriesStore.listAll();
  assert.strictEqual(allAfterRemove.length, 0, "tras borrar, listAll deberia estar vacio");

  console.log("✅ injuriesStore.js (backend Redis simulado): OK");
  console.log("\n✅ Backend de Redis: toda la logica de cache.js e injuriesStore.js funciona igual que en modo fichero.");
}

main().catch((err) => {
  console.error("❌ Fallo verificando el backend de Redis:", err);
  process.exit(1);
});

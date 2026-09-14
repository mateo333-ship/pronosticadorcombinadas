// Backend de Redis (Upstash) opcional. Se activa solo si existen las
// variables de entorno UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN,
// que Vercel inyecta automaticamente cuando anades la integracion "Upstash"
// desde el Marketplace (pestana "Storage" del proyecto).
//
// Por que hace falta esto solo en Vercel: en un servidor normal (Railway,
// Render, un VPS, tu propio ordenador) el proceso de Node se queda
// encendido y puede guardar cosas en ficheros locales sin problema. En
// Vercel cada peticion puede atenderla una instancia distinta y el disco es
// efimero, asi que la cache y las notas de lesiones necesitan vivir en un
// sitio compartido y persistente: Redis.

const isEnabled = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let client = null;
function getClient() {
  if (!isEnabled) return null;
  if (!client) {
    // require perezoso: si no se usa Redis, no hace falta que el paquete
    // este siquiera instalado para que el resto de la app funcione.
    const { Redis } = require("@upstash/redis");
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return client;
}

module.exports = { isEnabled, getClient };

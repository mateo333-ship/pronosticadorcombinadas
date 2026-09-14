// Verifica que el limitador de ventana deslizante deja pasar un burst de
// llamadas sin retraso (mientras no se supere el limite) y solo frena
// cuando de verdad hace falta. Usa una ventana corta (600ms) para que el
// test se ejecute rapido, no los 60s reales de produccion.

const assert = require("assert");
const { createRateLimiter } = require("../src/services/rateLimiter");

async function main() {
  const limiter = createRateLimiter(3, 600); // maximo 3 llamadas cada 600ms
  const start = Date.now();
  const callTimes = [];

  async function call(label) {
    return limiter.schedule(async () => {
      callTimes.push({ label, t: Date.now() - start });
    });
  }

  // Simulamos justo el caso que fallaba: varias llamadas "seguidas" para
  // construir un solo informe (forma local + forma visitante + h2h).
  await Promise.all([call("forma-local"), call("forma-visitante"), call("h2h")]);

  const maxElapsedForBurst = Math.max(...callTimes.map((c) => c.t));
  assert.ok(
    maxElapsedForBurst < 100,
    `las primeras 3 llamadas (dentro del limite) no deberian esperar casi nada; tardaron ${maxElapsedForBurst}ms`
  );
  console.log(`✅ Burst de 3 llamadas (limite=3) resuelto en ${maxElapsedForBurst}ms, sin espera artificial.`);

  // Una 4a llamada SI debe esperar, porque ya hay 3 dentro de la ventana.
  await call("cuarta-llamada");
  const fourthCallTime = callTimes[3].t;
  assert.ok(
    fourthCallTime >= 550,
    `la 4a llamada deberia esperar a que se libere la ventana (~600ms); se resolvio en ${fourthCallTime}ms`
  );
  console.log(`✅ 4a llamada (fuera del límite) esperó correctamente: ${fourthCallTime}ms.`);

  console.log("\n✅ rateLimiter.js: el burst no se retrasa y el límite real sigue respetándose.");
}

main().catch((err) => {
  console.error("❌ Fallo verificando el rate limiter:", err);
  process.exit(1);
});

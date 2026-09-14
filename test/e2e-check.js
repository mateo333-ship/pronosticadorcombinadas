// Script de verificacion end-to-end con Playwright: arranca el servidor en
// modo demo, abre la web con un navegador real (headless) y comprueba el
// flujo completo: dashboard -> informe de partido -> anadir a combinada ->
// analizar -> optimizar (probabilidad y cuota) -> lesiones.
// No es un test unitario formal, es un script de humo para esta entrega.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const PORT = 3100;

function waitFor(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Forzamos modo demo para esta verificacion: es un script de humo de la
  // interfaz/flujo, no de la integracion real con las APIs externas (que
  // dependen de red y de cuota disponible). Si tienes claves reales en tu
  // .env, esto evita que el test consuma peticiones/creditos de verdad.
  const server = spawn("node", ["src/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT), USE_MOCK_DATA: "true" },
  });

  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  await waitFor(1200);

  const errors = [];
  // PLAYWRIGHT_CHROMIUM_PATH es opcional: solo hace falta en entornos donde
  // el chromium de Playwright ya viene preinstalado en una ruta concreta
  // (como el entorno usado para construir este proyecto). En un equipo
  // normal, tras `npx playwright install chromium`, no hace falta definirla.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("response", (resp) => {
    if (resp.status() >= 400) console.log(`[check] respuesta ${resp.status()} para ${resp.url()}`);
  });

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector(".match-card", { timeout: 5000 });
  const modeBadge = await page.textContent("#mode-badge");
  console.log("[check] mode badge:", modeBadge);

  const numCards = await page.locator(".match-card").count();
  console.log("[check] partidos listados:", numCards);
  if (numCards < 1) throw new Error("No se listó ningún partido");

  await page.locator(".match-card").first().click();
  await page.waitForSelector(".markets-table tbody tr", { timeout: 5000 });
  const numMarkets = await page.locator(".markets-table tbody tr").count();
  console.log("[check] mercados en el informe:", numMarkets);

  // Anadir dos selecciones a la combinada desde el primer informe
  await page.locator(".add-leg-btn").nth(0).click();
  await waitFor(200);

  await page.click("#back-to-dashboard");
  await page.waitForSelector(".match-card");
  await page.locator(".match-card").nth(1).click();
  await page.waitForSelector(".markets-table tbody tr");
  await page.locator(".add-leg-btn").nth(0).click();
  await waitFor(200);

  await page.click('.tab-btn[data-tab="combinada"]');
  const numLegs = await page.locator(".leg-item").count();
  console.log("[check] patas en la combinada:", numLegs);
  if (numLegs !== 2) throw new Error(`Se esperaban 2 patas, hay ${numLegs}`);

  await page.click("#analyze-btn");
  await page.waitForSelector(".result-grid", { timeout: 5000 });
  const resultText = await page.textContent("#analysis-result");
  console.log("[check] resultado analisis (fragmento):", resultText.replace(/\s+/g, " ").slice(0, 160));

  await page.click("#optimize-prob-btn");
  await page.waitForSelector("#optimize-result .swap-item", { timeout: 5000 });
  console.log("[check] optimizador probabilidad: sugerencias mostradas ✓");

  await page.click("#optimize-odds-btn");
  await page.waitForSelector("#optimize-result .swap-item", { timeout: 5000 });
  console.log("[check] optimizador cuota: sugerencias mostradas ✓");

  // Aplicar la primera sugerencia de "mas probabilidad" y re-analizar
  await page.click("#optimize-prob-btn");
  await page.waitForSelector(".apply-swap-btn", { timeout: 5000 });
  await page.locator(".apply-swap-btn").first().click();
  await waitFor(300);
  const resultAfterSwap = await page.textContent("#analysis-result");
  console.log("[check] resultado tras aplicar swap (fragmento):", resultAfterSwap.replace(/\s+/g, " ").slice(0, 160));

  // Lesiones
  await page.click('.tab-btn[data-tab="lesiones"]');
  await page.waitForFunction(() => document.querySelectorAll("#injury-team option").length > 0, { timeout: 5000 });
  await page.selectOption("#injury-team", { index: 0 });
  await page.fill("#injury-text", "Prueba automática: baja por lesión");
  await page.fill("#injury-severity", "30");
  await page.click('#injury-form button[type="submit"]');
  await page.waitForSelector(".injury-note", { timeout: 5000 });
  const numInjuries = await page.locator(".injury-note").count();
  console.log("[check] notas de lesión tras añadir:", numInjuries);
  await page.locator(".injury-note .leg-remove").first().click();
  await waitFor(300);

  console.log("\n[check] errores de consola/pagina detectados:", errors.length);
  errors.forEach((e) => console.log("  -", e));

  await browser.close();
  server.kill();
  await waitFor(300);

  if (errors.length) {
    console.log("\n=== SERVER LOG ===\n" + serverLog);
    process.exit(1);
  }
  console.log("\n✅ Todo el flujo funcionó sin errores de consola.");
}

main().catch((err) => {
  console.error("❌ Fallo en la verificación:", err);
  process.exit(1);
});

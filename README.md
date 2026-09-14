# Combinadas Barça &amp; Real Madrid — Análisis estadístico (proyecto educativo)

Plataforma web que analiza partidos de fútbol (con foco en FC Barcelona y
Real Madrid, aunque cubre toda La Liga y la Champions League) y estima
probabilidades de resultado con un modelo estadístico (Poisson), las
compara con las cuotas de Winamax, y ayuda a analizar y modificar una
combinada (apuesta múltiple) para buscar más probabilidad de acierto o más
cuota.

**Aviso importante:** esta herramienta tiene fines educativos y de
análisis de datos. Ninguna probabilidad calculada aquí es una garantía:
apostar implica riesgo real de pérdida de dinero. La app no está afiliada
a Winamax ni a ninguna casa de apuestas; solo consulta sus cuotas a través
de una API pública de terceros (The Odds API). Juega con responsabilidad.

---

## 1. Qué hace y qué NO hace

Hace:
- Lista los próximos partidos de La Liga y Champions League (con Barça/Madrid destacados).
- Calcula, para cada partido, goles esperados y probabilidades (1X2, doble oportunidad, over/under de goles, ambos marcan) con un modelo de Poisson basado en la forma reciente de cada equipo, ajustado por el historial de enfrentamientos directos y por lesiones que introduzcas manualmente.
- Compara esas probabilidades con la cuota real de Winamax (obtenida vía The Odds API) para ver dónde el modelo cree que hay más o menos valor.
- Deja construir una combinada seleccionando mercados de varios partidos, calcula su probabilidad conjunta, cuota combinada y valor esperado.
- Sugiere modificar la combinada para (a) subir la probabilidad de acertarla, cambiando patas por mercados más seguros del mismo partido, o (b) subir la cuota, cambiando patas por otras de más cuota (con un mínimo de probabilidad razonable) o añadiendo una pata extra de otro partido.

NO hace (y es importante saberlo):
- **No hace scraping de Winamax.** No existe una forma fiable ni permitida de "conectarse" directamente a la web de Winamax para leer sus cuotas en vivo. Las cuotas vienen de **The Odds API**, un agregador de terceros que sí tiene autorización para redistribuir cuotas de varias casas, incluida Winamax (bookmaker `winamax_fr`).
- **No tiene un parte médico de lesiones automático.** El plan gratuito de datos de partidos no incluye lesiones/alineaciones. Por eso hay una sección para añadir notas de bajas a mano, que el modelo sí tiene en cuenta.
- **No garantiza ganar nada.** Es un modelo estadístico simplificado (ataque/defensa relativos + Poisson), no un oráculo. Dos mercados del mismo partido normalmente NO son estadísticamente independientes, así que la "probabilidad conjunta" de una combinada con varias patas del mismo partido es una aproximación, no un cálculo exacto (la app avisa de esto en pantalla).

---

## 2. Arquitectura

```
src/
  server.js              -> crea la app Express (rutas /api + web); en local/Railway/Render
                            tambien la pone a escuchar y arranca el scheduler; en Vercel
                            solo la exporta, sin escuchar ni programar nada
  config.js              -> lee variables de entorno (.env)
  scheduler.js           -> refresca partidos/cuotas en segundo plano (node-cron) — no se usa en Vercel
  data/teams.js          -> equipos e IDs de football-data.org seguidos
  data/injuriesStore.js  -> notas de lesiones manuales (fichero JSON o Redis, ver mas abajo)
  services/
    footballDataClient.js -> partidos, forma, head-to-head (football-data.org)
    oddsApiClient.js       -> cuotas de Winamax (The Odds API)
    matchService.js        -> junta todo lo anterior en un "informe de partido"
    cache.js                -> cache con TTL (fichero local o Redis, ver mas abajo)
    redisBackend.js          -> cliente de Upstash Redis, activo solo si hay claves UPSTASH_*
    rateLimiter.js            -> limitador de peticiones a football-data.org
  models/
    probability.js  -> modelo de Poisson (goles esperados y probabilidades)
    markets.js       -> convierte probabilidades + cuotas en "mercados candidatos"
    combinada.js      -> cálculo de probabilidad/cuota conjunta de una combinada
    optimizer.js       -> sugerencias para modificar la combinada
    commentary.js       -> genera el texto del informe en español
  routes/            -> endpoints REST (/api/matches, /api/combinada, /api/injuries)
public/              -> frontend (HTML/CSS/JS sin frameworks)
test/
  e2e-check.js            -> verificación de toda la interfaz con Playwright (opcional)
  redis-backend-check.js  -> verifica la lógica del backend de Redis sin necesitar Upstash real
vercel.json          -> configuración opcional para desplegar en Vercel (ver sección 4, opción D)
```

Sin claves de API configuradas, la app arranca sola en **modo demo** con
datos de ejemplo (`src/mock/mockData.js`) para que puedas probarla de
inmediato.

**Cache y notas de lesiones — fichero vs. Redis:** `cache.js` y
`data/injuriesStore.js` guardan sus datos en ficheros locales por defecto,
lo cual funciona bien en local, Railway, Render o un VPS (el proceso se
queda encendido). Si detectan las variables `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` (que Vercel rellena solo al conectar la
integración de Upstash, ver sección 4), cambian de forma automática y
transparente a guardar los mismos datos en Redis — necesario en Vercel,
donde el disco no persiste entre peticiones. El resto del código no sabe
ni le importa qué backend está activo.

---

## 3. Puesta en marcha en local

Requisitos: Node.js 18+ (se ha probado con Node 22).

```bash
npm install
cp .env.example .env
npm start
```

Abre `http://localhost:3000`. Sin claves en `.env`, verás el badge "Modo
demo" y datos de ejemplo — sirve para probar toda la interfaz sin gastar
cuota de ninguna API.

### 3.1 Conseguir las claves de API reales

1. **football-data.org** (partidos, calendario, resultados — plan Free):
   - Regístrate en https://www.football-data.org/client/register
   - Plan Free: 10 peticiones/minuto, incluye La Liga y Champions League (los que usa esta app), pero **no** incluye lesiones ni alineaciones en el plan gratuito.
   - Copia el token a `FOOTBALL_DATA_API_KEY` en `.env`.

2. **The Odds API** (cuotas de Winamax y otras casas — plan Free):
   - Regístrate en https://the-odds-api.com/
   - Plan Free: 500 "créditos" al mes (cada consulta de cuotas de una liga completa consume créditos; por eso la app cachea las cuotas y solo las refresca cada `REFRESH_ODDS_CRON_HOURS` horas — 6 por defecto).
   - Copia la clave a `ODDS_API_KEY` en `.env`.
   - El bookmaker usado por defecto es `winamax_fr` (la entidad Winamax que también cubre España). Puedes cambiarlo con `ODDS_BOOKMAKER_KEY` si prefieres `winamax_de` u otra casa disponible en la región `eu`.

Con ambas claves en `.env`, reinicia (`npm start`) y la app pasa sola a
"Datos en vivo".

---

## 4. Desplegarlo 24/7

Este proyecto es un servidor Node normal: para que esté disponible las 24
horas necesitas alojarlo en algún sitio que lo mantenga siempre encendido
(no en tu propio ordenador apagándose cada noche). Opciones, de más a
menos sencilla:

### Opción A: Railway / Render (recomendado si no quieres gestionar un servidor)

1. Sube este proyecto a un repositorio de GitHub (privado si quieres).
2. En [Railway](https://railway.app) o [Render](https://render.com): "New Project" → "Deploy from GitHub repo" → selecciona el repo.
3. Configura las variables de entorno del `.env` (FOOTBALL_DATA_API_KEY, ODDS_API_KEY, etc.) en el panel del servicio.
4. Comando de arranque: `node src/server.js` (Railway/Render lo detectan solos gracias al `package.json`).
5. Ambos planes gratuitos/baratos mantienen el servicio siempre encendido (a diferencia de un ordenador personal). Listo: tendrás una URL pública tipo `https://tu-app.up.railway.app` accesible 24/7.

### Opción B: Un VPS propio (DigitalOcean, Hetzner, etc.) con Docker

```bash
git clone <tu-repo>
cd barca-madrid-combinadas
cp .env.example .env   # y rellena tus claves
docker compose up -d --build
```

Esto deja el contenedor corriendo en segundo plano y se reinicia solo si
el servidor se reinicia (`restart: unless-stopped`). Añade un proxy
inverso (Caddy/Nginx) delante si quieres HTTPS con tu propio dominio.

### Opción C: VPS sin Docker, con pm2

```bash
npm install -g pm2
npm install --omit=dev
pm2 start src/server.js --name combinadas
pm2 save
pm2 startup   # sigue las instrucciones que imprime para que arranque solo al reiniciar el servidor
```

En las opciones A, B y C, el propio proceso Node (con `node-cron`, ver
`src/scheduler.js`) se encarga de refrescar partidos y cuotas
periódicamente mientras esté encendido — no hace falta ningún cron
externo.

### Opción D: Vercel

Vercel funciona distinto a las tres opciones anteriores: en vez de un
servidor encendido de forma permanente, ejecuta la app como una "función"
que se despierta en cada petición y se apaga después. El proyecto ya está
preparado para esto (`src/server.js` detecta automáticamente si corre en
Vercel), pero hay un paso extra obligatorio: como el disco no persiste
entre peticiones, la cache y las notas de lesiones necesitan guardarse en
una base de datos externa en vez de en ficheros locales.

1. Sube el proyecto a un repositorio de GitHub e impórtalo en [vercel.com](https://vercel.com) ("Add New" → "Project").
2. En "Environment Variables" del proyecto, añade `FOOTBALL_DATA_API_KEY`, `ODDS_API_KEY` y `ODDS_BOOKMAKER_KEY` (los mismos valores que en tu `.env`).
3. **Paso obligatorio:** ve a la pestaña "Storage" del proyecto en Vercel → "Create Database" → elige "Upstash" (Redis) → plan gratuito. Vercel conecta la base de datos a tu proyecto y rellena solo las variables `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. Sin este paso, la app seguirá funcionando pero perderá la cache y las notas de lesiones entre peticiones.
4. Despliega. No hace falta tocar `vercel.json` (ya incluido): solo configura un aviso diario opcional (`/api/warmup`) para precalentar la cache una vez al día — el plan gratuito de Vercel no permite crons más frecuentes, pero no pasa nada, porque cada ruta ya refresca sus datos sola en cuanto la cache caduca, la visite o no ese aviso diario.

Limitación a tener en cuenta: en el plan gratuito (Hobby) de Vercel, ese
aviso diario puede dispararse en cualquier minuto de la hora programada
(no es preciso al segundo). Es irrelevante para esta app porque, como se
explica arriba, no depende de él para tener datos frescos.

---

## 5. Límites a tener en cuenta

- **football-data.org (Free):** 10 peticiones/minuto. La app respeta esto con un limitador interno y cachea resultados, pero si despliegas varias instancias a la vez podrías superarlo.
- **The Odds API (Free):** 500 créditos/mes. Con el refresco cada 6 horas por defecto y 2 competiciones (La Liga + Champions), el consumo mensual aproximado es bajo, pero si lo bajas a refrescos más frecuentes o añades más ligas, vigila tu consumo (la consola imprime `creditos usados/restantes` en cada llamada).
- **Lesiones:** no hay ninguna API gratuita fiable de bajas en tiempo real integrada. Añádelas a mano en la pestaña "Lesiones / bajas" cuando sepas de una baja importante.
- **Independencia estadística:** el cálculo de la combinada multiplica probabilidades asumiendo independencia entre patas. Esto es razonable si las patas son de partidos distintos y sin relación, pero **no** lo es si combinas varios mercados del mismo partido (la app te avisa con un aviso amarillo cuando lo detecta).
- **Vercel + Upstash (Free):** el plan gratuito de Upstash tiene su propio límite de peticiones diarias/mensuales (consulta el actual en tu panel de Upstash, cambia de vez en cuando). Con el tráfico típico de un proyecto personal no deberías acercarte a él, pero si notas errores relacionados con Redis en los logs de Vercel, es lo primero a revisar.

---

## 6. Cómo seguir más equipos o ligas

Edita `src/data/teams.js` (añade el equipo a `EXTRA_TEAMS` con su ID de
football-data.org) y `src/data/teams.js` → `COMPETITIONS` (añade el código
de otra competición del plan Free). Si además quieres sus cuotas, añade la
clave de deporte correspondiente de The Odds API en
`src/services/oddsApiClient.js` → `SPORT_KEYS`.

---

## 7. Juego responsable

Este proyecto no debe usarse como sustituto del juicio propio, y mucho
menos con dinero que no puedas permitirte perder. Si tú o alguien cercano
tiene problemas para controlar el juego, en España puedes llamar
gratuitamente al **900 200 225** (FEJAR — Federación Española de
Jugadores de Azar Rehabilitados). 
ACTUALIZADO.

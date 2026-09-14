// Modelo estadistico de estimacion de resultados (tipo Poisson bivariante
// simplificado). Es un modelo educativo y transparente: no es infalible, y
// siempre se debe leer junto al informe cualitativo (lesiones, contexto...).
//
// Referencia del metodo: Maher (1982) / Dixon-Coles (simplificado, sin el
// termino de correccion de baja puntuacion para mantenerlo legible).

const LEAGUE_AVG_GOALS = 1.35; // goles de media por equipo y partido (aprox. La Liga/CL)
const HOME_ADVANTAGE = 1.15; // multiplicador de goles esperados al jugar en casa
const MAX_GOALS = 7; // truncamos la distribucion de Poisson en 0..MAX_GOALS

function poissonPmf(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda) - logFactorial(k);
  return Math.exp(logP);
}

function logFactorial(n) {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * A partir de la "forma" de un equipo (ultimos partidos con goles marcados y
 * encajados, indicando si jugo en casa o fuera) calcula su fuerza de ataque y
 * defensa relativa a la media de la liga.
 */
function computeTeamStrength(formData, venue) {
  if (!formData || !formData.last || formData.last.length === 0) {
    return { attack: 1, defense: 1, sampleSize: 0 };
  }

  const venueMatches = formData.last.filter((m) => m.venue === venue);
  // Si no hay suficientes partidos en ese venue concreto, usamos todos como
  // respaldo (mejor una estimacion aproximada que ninguna).
  const sample = venueMatches.length >= 3 ? venueMatches : formData.last;

  const avgScored = average(sample.map((m) => m.scored));
  const avgConceded = average(sample.map((m) => m.conceded));

  return {
    attack: avgScored / LEAGUE_AVG_GOALS,
    defense: avgConceded / LEAGUE_AVG_GOALS,
    sampleSize: sample.length,
    avgScored,
    avgConceded,
  };
}

/**
 * Ajusta la fuerza de ataque de un equipo segun notas de lesiones/bajas
 * introducidas manualmente. impactPercent es negativo si resta capacidad
 * ofensiva (p.ej. baja un delantero clave) o afecta a la defensa si el
 * campo `affects` = "defense".
 */
function applyInjuryImpact(strength, injuryNotes = []) {
  let attackMultiplier = 1;
  let defenseMultiplier = 1;
  for (const note of injuryNotes) {
    const impact = (note.severity || 0) / 100; // severity: 0-100
    if (note.affects === "defense") {
      defenseMultiplier += impact; // mas goles encajados esperados
    } else {
      attackMultiplier -= impact; // menos goles marcados esperados
    }
  }
  attackMultiplier = Math.max(0.4, attackMultiplier);
  defenseMultiplier = Math.min(1.8, defenseMultiplier);
  return {
    ...strength,
    attack: strength.attack * attackMultiplier,
    defense: strength.defense * defenseMultiplier,
  };
}

/**
 * Calcula la matriz de probabilidad de marcador (Poisson) y agrega las
 * probabilidades de los mercados principales.
 */
function computeMatchProbabilities({ homeForm, awayForm, homeInjuries = [], awayInjuries = [], h2h = null }) {
  const homeStrengthRaw = computeTeamStrength(homeForm, "H");
  const awayStrengthRaw = computeTeamStrength(awayForm, "A");

  const homeStrength = applyInjuryImpact(homeStrengthRaw, homeInjuries);
  const awayStrength = applyInjuryImpact(awayStrengthRaw, awayInjuries);

  // Goles esperados: ataque propio x defensa rival x media de liga, con
  // ventaja de campo aplicada solo al equipo local.
  let lambdaHome = homeStrength.attack * awayStrength.defense * LEAGUE_AVG_GOALS * HOME_ADVANTAGE;
  let lambdaAway = awayStrength.attack * homeStrength.defense * LEAGUE_AVG_GOALS;

  // saneado por si hay datos extremos o ausentes
  lambdaHome = clamp(lambdaHome, 0.3, 4.5);
  lambdaAway = clamp(lambdaAway, 0.3, 4.5);

  const scoreMatrix = [];
  for (let h = 0; h <= MAX_GOALS; h++) {
    const row = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      row.push(poissonPmf(lambdaHome, h) * poissonPmf(lambdaAway, a));
    }
    scoreMatrix.push(row);
  }

  let pHomeWin = 0, pDraw = 0, pAwayWin = 0;
  let pOver25 = 0, pBttsYes = 0, pOver15 = 0, pOver35 = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = scoreMatrix[h][a];
      if (h > a) pHomeWin += p;
      else if (h === a) pDraw += p;
      else pAwayWin += p;
      if (h + a > 2.5) pOver25 += p;
      if (h + a > 1.5) pOver15 += p;
      if (h + a > 3.5) pOver35 += p;
      if (h > 0 && a > 0) pBttsYes += p;
    }
  }

  let modelProbs = {
    homeWin: pHomeWin,
    draw: pDraw,
    awayWin: pAwayWin,
    over25: pOver25,
    under25: 1 - pOver25,
    over15: pOver15,
    under15: 1 - pOver15,
    over35: pOver35,
    under35: 1 - pOver35,
    bttsYes: pBttsYes,
    bttsNo: 1 - pBttsYes,
    doubleChance1X: pHomeWin + pDraw,
    doubleChanceX2: pDraw + pAwayWin,
    doubleChance12: pHomeWin + pAwayWin,
  };

  // Ligero ajuste con el historial de enfrentamientos directos (H2H), con
  // peso bajo (15%) para no sobreajustar a un historial que puede ser viejo.
  if (h2h && h2h.totalMatches >= 3) {
    const h2hHomeWin = h2h.homeWins / h2h.totalMatches;
    const h2hDraw = h2h.draws / h2h.totalMatches;
    const h2hAwayWin = h2h.awayWins / h2h.totalMatches;
    const w = 0.15;
    const blend = (model, h2hVal) => model * (1 - w) + h2hVal * w;
    const bHome = blend(modelProbs.homeWin, h2hHomeWin);
    const bDraw = blend(modelProbs.draw, h2hDraw);
    const bAway = blend(modelProbs.awayWin, h2hAwayWin);
    const total = bHome + bDraw + bAway;
    modelProbs = {
      ...modelProbs,
      homeWin: bHome / total,
      draw: bDraw / total,
      awayWin: bAway / total,
      doubleChance1X: (bHome + bDraw) / total,
      doubleChanceX2: (bDraw + bAway) / total,
      doubleChance12: (bHome + bAway) / total,
    };
  }

  // Probabilidades "empate no apuesta" (draw no bet): igual que 1X2 pero
  // repartiendo el empate entre local/visitante segun su peso relativo, para
  // poder comparar con la cuota real que ofrece Winamax para este mercado.
  const noDrawTotal = modelProbs.homeWin + modelProbs.awayWin;
  modelProbs.homeWinDrawNoBet = noDrawTotal > 0 ? modelProbs.homeWin / noDrawTotal : 0.5;
  modelProbs.awayWinDrawNoBet = noDrawTotal > 0 ? modelProbs.awayWin / noDrawTotal : 0.5;

  return {
    expectedGoals: { home: round2(lambdaHome), away: round2(lambdaAway) },
    strengths: { home: homeStrength, away: awayStrength },
    probabilities: roundProbs(modelProbs),
    h2hUsed: !!(h2h && h2h.totalMatches >= 3),
    // Matriz completa de probabilidad por marcador (0..MAX_GOALS x 0..MAX_GOALS).
    // Se expone para poder calcular mercados cuya linea es dinamica (p.ej. el
    // hándicap asiático que ofrezca Winamax en cada partido, ver markets.js).
    scoreMatrix,
  };
}

/**
 * Probabilidad de que `side` ("home" o "away") cubra un hándicap asiático de
 * `point` goles, siguiendo el mismo convenio que The Odds API: el punto se
 * suma a los goles de ese equipo antes de comparar (p.ej. point=-1 significa
 * que ese equipo tiene que ganar por 2 o mas goles para cubrir la apuesta).
 * No se modela el "push"/reembolso de las lineas enteras: se aproxima como
 * "no cubierta" en caso de empate exacto en la linea, que es el criterio mas
 * conservador y solo afecta a lineas enteras (-1, -2...), no a las .5 o .25/.75
 * que son las mas habituales en el hándicap asiatico.
 */
function probCoverHandicap(scoreMatrix, side, point) {
  let total = 0;
  for (let h = 0; h < scoreMatrix.length; h++) {
    for (let a = 0; a < scoreMatrix[h].length; a++) {
      const diff = side === "home" ? h - a : a - h;
      if (diff + point > 0) total += scoreMatrix[h][a];
    }
  }
  return Math.round(total * 1000) / 1000;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
function roundProbs(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Math.round(v * 1000) / 1000;
  return out;
}

module.exports = {
  computeMatchProbabilities,
  computeTeamStrength,
  applyInjuryImpact,
  probCoverHandicap,
  LEAGUE_AVG_GOALS,
};

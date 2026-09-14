// Genera un comentario en texto, en español, a partir de los numeros del
// modelo. No es un LLM: son plantillas que rellenan los datos calculados,
// para que el informe sea legible sin depender de otro servicio externo.

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function formSummary(form) {
  if (!form || !form.last?.length) return "sin datos de forma reciente";
  const last = form.last.slice(-5);
  const wins = last.filter((m) => m.scored > m.conceded).length;
  const draws = last.filter((m) => m.scored === m.conceded).length;
  const losses = last.filter((m) => m.scored < m.conceded).length;
  const avgScored = (last.reduce((a, m) => a + m.scored, 0) / last.length).toFixed(1);
  const avgConceded = (last.reduce((a, m) => a + m.conceded, 0) / last.length).toFixed(1);
  return `${wins}V-${draws}E-${losses}D en los últimos ${last.length}, con una media de ${avgScored} goles a favor y ${avgConceded} en contra`;
}

function generateMatchCommentary({ match, probResult, homeForm, awayForm, h2h, homeInjuries = [], awayInjuries = [] }) {
  const p = probResult.probabilities;
  const eg = probResult.expectedGoals;
  const home = match.homeTeam.name;
  const away = match.awayTeam.name;

  const lines = [];

  lines.push(
    `El modelo estima ${eg.home} goles esperados para ${home} y ${eg.away} para ${away}, lo que da una probabilidad de ${pct(
      p.homeWin
    )} de victoria local, ${pct(p.draw)} de empate y ${pct(p.awayWin)} de victoria visitante.`
  );

  lines.push(`Forma reciente de ${home}: ${formSummary(homeForm)}.`);
  lines.push(`Forma reciente de ${away}: ${formSummary(awayForm)}.`);

  if (probResult.h2hUsed && h2h) {
    lines.push(
      `En los enfrentamientos directos recientes (${h2h.totalMatches} partidos), ${home} ganó ${h2h.homeWins}, hubo ${h2h.draws} empates y ${away} ganó ${h2h.awayWins}. Este historial se ha tenido en cuenta con un peso reducido (15%) sobre la estimación final.`
    );
  } else {
    lines.push(
      "No hay suficiente historial de enfrentamientos directos reciente para ajustar el modelo, así que la estimación se basa solo en la forma actual de cada equipo."
    );
  }

  if (homeInjuries.length || awayInjuries.length) {
    const notes = [...homeInjuries.map((n) => `${home}: ${n.text}`), ...awayInjuries.map((n) => `${away}: ${n.text}`)];
    lines.push(`Bajas/lesiones consideradas manualmente: ${notes.join("; ")}.`);
  } else {
    lines.push(
      "No se han introducido notas de lesiones o bajas para este partido. El plan gratuito de datos no incluye un parte médico automático: si conoces bajas relevantes, añádelas en la sección de lesiones para que el modelo las tenga en cuenta."
    );
  }

  lines.push(
    `El mercado de goles apunta a ${pct(p.over25)} de probabilidad de más de 2.5 goles y ${pct(
      p.bttsYes
    )} de que ambos equipos marquen.`
  );

  return lines;
}

const RESPONSIBLE_GAMBLING_NOTE =
  "Esta plataforma tiene fines educativos y de análisis estadístico. Las probabilidades son estimaciones de un modelo, no garantías de resultado; ninguna combinada es 'segura'. Apostar implica riesgo de pérdida económica. Juega con responsabilidad, fíjate límites de tiempo y dinero, y no apuestes dinero que no puedas permitirte perder. Si sientes que el juego deja de estar bajo control, en España puedes contactar con el servicio de ayuda al jugador de la FEJAR o llamar al 900 200 225 (Jugadores Anónimos España).";

module.exports = { generateMatchCommentary, RESPONSIBLE_GAMBLING_NOTE };

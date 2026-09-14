// Limitador de peticiones por "ventana deslizante": deja pasar hasta
// `maxPerWindow` llamadas sin ningun retraso artificial, y solo espera
// cuando de verdad se ha alcanzado el limite en los ultimos `windowMs`.
//
// Importante: solo se serializa la comprobacion/reserva de hueco (que es
// practicamente instantanea), NO la ejecucion de la funcion en si. Si no
// fuera asi, varias llamadas admitidas dentro del limite (por ejemplo, las
// 2-4 que hacen falta para montar el informe de un partido: forma local,
// forma visitante, enfrentamientos directos...) se ejecutarian una detras
// de otra en vez de en paralelo, sumando sus tiempos de red en lugar de
// solaparlos — exactamente el tipo de lentitud que puede hacer que una
// funcion serverless (Vercel) supere su tiempo maximo y la peticion del
// usuario se quede colgada.
function createRateLimiter(maxPerWindow, windowMs = 60000) {
  const timestamps = [];
  let gate = Promise.resolve();

  async function acquireSlot() {
    const myTurn = gate;
    let release;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    await myTurn;
    try {
      const now = Date.now();
      while (timestamps.length && timestamps[0] <= now - windowMs) {
        timestamps.shift();
      }
      if (timestamps.length >= maxPerWindow) {
        const wait = timestamps[0] + windowMs - now;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      timestamps.push(Date.now());
    } finally {
      release();
    }
  }

  async function schedule(fn) {
    await acquireSlot();
    return fn(); // se ejecuta libremente, en paralelo con otras llamadas ya admitidas
  }

  return { schedule };
}

module.exports = { createRateLimiter };

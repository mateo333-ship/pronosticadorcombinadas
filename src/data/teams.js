// IDs de football-data.org (API v4). Si alguna vez football-data.org cambiase
// estos IDs (es muy raro), se pueden corregir aqui sin tocar el resto del codigo.
// Puedes verificarlos tu mismo una vez tengas API key con:
//   curl -H "X-Auth-Token: TU_KEY" https://api.football-data.org/v4/teams/81
//   curl -H "X-Auth-Token: TU_KEY" https://api.football-data.org/v4/teams/86

const PRIORITY_TEAMS = [
  { id: 81, name: "FC Barcelona", shortName: "Barcelona", aliases: ["barcelona", "barça", "barca", "fc barcelona"] },
  { id: 86, name: "Real Madrid CF", shortName: "Real Madrid", aliases: ["real madrid", "madrid"] },
];

// Otros equipos que el usuario puede querer seguir ademas de los prioritarios.
// Se pueden anadir mas por nombre; la app resuelve el ID contra la API la primera vez
// que aparecen en un partido (se guardan en cache).
const EXTRA_TEAMS = [
  { id: 78, name: "Club Atletico de Madrid", shortName: "Atletico Madrid" },
  { id: 559, name: "Sevilla FC", shortName: "Sevilla" },
];

// Competiciones cubiertas por el plan Free de football-data.org donde juegan
// Barcelona y Real Madrid (La Liga + Champions League). Se pueden anadir mas
// codigos de competicion Free si el usuario quiere seguir otras ligas.
const COMPETITIONS = [
  { code: "PD", name: "La Liga (España)" },
  { code: "CL", name: "UEFA Champions League" },
];

const PRIORITY_TEAM_IDS = PRIORITY_TEAMS.map((t) => t.id);
const ALL_TRACKED_TEAMS = [...PRIORITY_TEAMS, ...EXTRA_TEAMS];

function isPriorityTeam(teamId) {
  return PRIORITY_TEAM_IDS.includes(teamId);
}

module.exports = {
  PRIORITY_TEAMS,
  EXTRA_TEAMS,
  ALL_TRACKED_TEAMS,
  COMPETITIONS,
  PRIORITY_TEAM_IDS,
  isPriorityTeam,
};

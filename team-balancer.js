/* AES FC Team Balancer v1
 * Uses current signups, player profiles/attributes and published results.
 * No new database tables are required.
 */

const BALANCER_ATTRIBUTE_GROUPS = {
  attack: ["finishing", "shot_power", "dribbling", "ball_control"],
  control: ["passing", "vision_positioning", "composure", "ball_control"],
  defense: ["defensive_awareness", "strength", "intensity", "stamina"],
  pace: ["speed", "stamina", "intensity"]
};

function balancerClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function balancerAttributeValue(tags = {}, key) {
  if (tags[key] === "strength") return 1;
  if (tags[key] === "weakness") return -1;
  return 0;
}

function balancerMean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function balancerZScores(rows, key) {
  const values = rows.map((row) => Number(row[key] || 0));
  const mean = balancerMean(values);
  const variance = balancerMean(values.map((value) => (value - mean) ** 2));
  const sd = Math.sqrt(variance);
  const map = new Map();
  rows.forEach((row) => map.set(normalizeName(row.name), sd > 0.0001 ? (Number(row[key] || 0) - mean) / sd : 0));
  return map;
}

function balancerCandidateNames() {
  const playing = (state.signups || [])
    .filter((signup) => signup.status === "Playing")
    .map(signupFullName)
    .filter(Boolean);
  return [...new Map(playing.map((name) => [normalizeName(name), splitFullName(name).fullName])).values()];
}

function balancerRecentFormFor(name, results = []) {
  const key = normalizeName(name);
  const appearances = [];
  [...results]
    .filter(shouldCountStatsResult)
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
    .forEach((result) => {
      const inA = (result.team_a_players || []).some((player) => normalizeName(player) === key);
      const inB = (result.team_b_players || []).some((player) => normalizeName(player) === key);
      if (!inA && !inB) return;
      const winner = resultWinner(result);
      const side = inA ? "a" : "b";
      appearances.push(winner === "draw" ? 0.5 : winner === side ? 1 : 0);
    });
  return balancerMean(appearances.slice(-5));
}

function balancerPlayerModels(names = []) {
  const countedResults = (state.results || []).filter(shouldCountStatsResult);
  const allStats = calculatePlayerStats(countedResults);
  const statsByName = new Map(allStats.map((row) => [normalizeName(row.name), row]));
  const raw = names.map((name) => {
    const stats = statsByName.get(normalizeName(name)) || {
      appearances: 0, wins: 0, draws: 0, goals: 0, assists: 0,
      goalsPerGame: 0, assistsPerGame: 0, winPct: 0.5
    };
    const appearances = Number(stats.appearances || 0);
    const goalContribPerGame = appearances ? (Number(stats.goals || 0) + Number(stats.assists || 0)) / appearances : 0;
    const winPct = appearances ? (Number(stats.wins || 0) + 0.5 * Number(stats.draws || 0)) / appearances : 0.5;
    const recentForm = appearances ? balancerRecentFormFor(name, countedResults) : 0.5;
    return { name, appearances, goalContribPerGame, winPct, recentForm, stats };
  });

  const gcZ = balancerZScores(raw, "goalContribPerGame");
  const winZ = balancerZScores(raw, "winPct");
  const formZ = balancerZScores(raw, "recentForm");

  return raw.map((row) => {
    const profile = profileForName(row.name) || {};
    const tags = profileTagsFor(profile);
    const reliability = balancerClamp(row.appearances / 6, 0, 1);
    const statisticalSignal = 0.5 * (gcZ.get(normalizeName(row.name)) || 0) +
      0.3 * (winZ.get(normalizeName(row.name)) || 0) +
      0.2 * (formZ.get(normalizeName(row.name)) || 0);
    const ability = 50 + reliability * 10 * statisticalSignal;
    const groupScore = (keys) => balancerMean(keys.map((key) => balancerAttributeValue(tags, key)));
    const attackTag = groupScore(BALANCER_ATTRIBUTE_GROUPS.attack);
    const controlTag = groupScore(BALANCER_ATTRIBUTE_GROUPS.control);
    const defenseTag = groupScore(BALANCER_ATTRIBUTE_GROUPS.defense);
    const paceTag = groupScore(BALANCER_ATTRIBUTE_GROUPS.pace);
    const allTagValues = PLAYER_ATTRIBUTE_TAGS.map(([key]) => balancerAttributeValue(tags, key));
    const attributeOverall = balancerMean(allTagValues);
    return {
      ...row,
      tags,
      ability,
      overall: ability + attributeOverall * 6,
      attack: ability + attackTag * 10 + (gcZ.get(normalizeName(row.name)) || 0) * reliability * 4,
      control: ability + controlTag * 10,
      defense: ability + defenseTag * 10,
      pace: ability + paceTag * 10
    };
  });
}

function balancerPairKey(a, b) {
  return [normalizeName(a), normalizeName(b)].sort().join("||");
}

function balancerTeamupHistory(results = state.results || []) {
  const pairs = new Map();
  results.filter(shouldCountStatsResult).forEach((result) => {
    const winner = resultWinner(result);
    [
      { side: "a", players: result.team_a_players || [] },
      { side: "b", players: result.team_b_players || [] }
    ].forEach(({ side, players }) => {
      const outcome = winner === "draw" ? 0.5 : winner === side ? 1 : 0;
      for (let i = 0; i < players.length; i += 1) {
        for (let j = i + 1; j < players.length; j += 1) {
          const key = balancerPairKey(players[i], players[j]);
          const row = pairs.get(key) || { games: 0, outcomeTotal: 0 };
          row.games += 1;
          row.outcomeTotal += outcome;
          pairs.set(key, row);
        }
      }
    });
  });
  return pairs;
}

function balancerChemistry(team, pairHistory) {
  const values = [];
  for (let i = 0; i < team.length; i += 1) {
    for (let j = i + 1; j < team.length; j += 1) {
      const row = pairHistory.get(balancerPairKey(team[i].name, team[j].name));
      if (!row) continue;
      values.push((row.outcomeTotal + 1.5) / (row.games + 3));
    }
  }
  return values.length ? balancerMean(values) : 0.5;
}

function balancerTeamMetrics(team, pairHistory) {
  const sum = (key) => team.reduce((total, player) => total + Number(player[key] || 0), 0);
  return {
    overall: sum("overall"),
    attack: sum("attack"),
    control: sum("control"),
    defense: sum("defense"),
    pace: sum("pace"),
    chemistry: balancerChemistry(team, pairHistory)
  };
}

function balancerRelativeDifference(a, b) {
  const denominator = Math.max(1, Math.abs(a) + Math.abs(b));
  return Math.abs(a - b) / denominator;
}

function balancerSplitScore(teamA, teamB, pairHistory) {
  const a = balancerTeamMetrics(teamA, pairHistory);
  const b = balancerTeamMetrics(teamB, pairHistory);
  const components = {
    overall: balancerRelativeDifference(a.overall, b.overall),
    attack: balancerRelativeDifference(a.attack, b.attack),
    defense: balancerRelativeDifference(a.defense, b.defense),
    control: balancerRelativeDifference(a.control, b.control),
    pace: balancerRelativeDifference(a.pace, b.pace),
    chemistry: Math.abs(a.chemistry - b.chemistry)
  };
  const imbalance =
    components.overall * 0.30 +
    components.attack * 0.20 +
    components.defense * 0.20 +
    components.control * 0.12 +
    components.pace * 0.08 +
    components.chemistry * 0.10;
  return { score: balancerClamp(100 * (1 - imbalance * 4), 0, 100), imbalance, components, a, b };
}

function balancerCombinations(items, choose, start = 0, prefix = [], output = []) {
  if (prefix.length === choose) {
    output.push([...prefix]);
    return output;
  }
  for (let i = start; i <= items.length - (choose - prefix.length); i += 1) {
    prefix.push(items[i]);
    balancerCombinations(items, choose, i + 1, prefix, output);
    prefix.pop();
  }
  return output;
}

function generateBalancedTeams() {
  const names = balancerCandidateNames();
  if (names.length < 4) throw new Error("At least four Playing signups are needed before teams can be balanced.");
  if (names.length % 2 !== 0) throw new Error(`There are ${names.length} Playing signups. Team Balancer v1 needs an even number of players.`);

  const players = balancerPlayerModels(names);
  const half = players.length / 2;
  const anchor = players[0];
  const rest = players.slice(1);
  const pairHistory = balancerTeamupHistory();
  const candidates = balancerCombinations(rest, half - 1).map((picked) => {
    const teamA = [anchor, ...picked];
    const selected = new Set(teamA.map((player) => normalizeName(player.name)));
    const teamB = players.filter((player) => !selected.has(normalizeName(player.name)));
    return { teamA, teamB, ...balancerSplitScore(teamA, teamB, pairHistory) };
  }).sort((a, b) => a.imbalance - b.imbalance);

  const first = candidates[0];
  const second = candidates.find((candidate) => {
    const firstA = new Set(first.teamA.map((player) => normalizeName(player.name)));
    const overlap = candidate.teamA.filter((player) => firstA.has(normalizeName(player.name))).length;
    return overlap <= Math.max(1, half - 2);
  }) || candidates[1];
  return [first, second].filter(Boolean);
}

function balancerTeamEdge(a, b) {
  const comparisons = [
    ["Attack", a.attack, b.attack],
    ["Defense", a.defense, b.defense],
    ["Control", a.control, b.control],
    ["Pace", a.pace, b.pace]
  ];
  const meaningful = comparisons
    .map(([label, av, bv]) => ({ label, delta: (av - bv) / Math.max(1, (Math.abs(av) + Math.abs(bv)) / 2) }))
    .filter((row) => Math.abs(row.delta) >= 0.015)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  if (!meaningful.length) return "The sides are very close across attack, defense, control and pace.";
  return meaningful.slice(0, 2).map((row) => `${row.delta > 0 ? "Side 1" : "Side 2"} has a slight ${row.label.toLowerCase()} edge`).join("; ") + ".";
}

function renderTeamBalancer() {
  const output = el("teamBalancerOutput");
  if (!output) return;
  try {
    assertAdmin();
    const suggestions = generateBalancedTeams();
    output.innerHTML = suggestions.map((suggestion, index) => `
      <div class="balancer-card">
        <div class="balancer-card-head">
          <strong>Option ${index + 1}</strong>
          <span>${suggestion.score.toFixed(0)}/100 balance</span>
        </div>
        <div class="balancer-teams">
          <div><h4>Side 1</h4>${suggestion.teamA.map((player) => `<span>${escapeHtml(player.name)}</span>`).join("")}</div>
          <div><h4>Side 2</h4>${suggestion.teamB.map((player) => `<span>${escapeHtml(player.name)}</span>`).join("")}</div>
        </div>
        <p class="admin-help">${escapeHtml(balancerTeamEdge(suggestion.a, suggestion.b))}</p>
      </div>
    `).join("");
  } catch (error) {
    output.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const button = el("generateBalancedTeams");
  if (button) button.addEventListener("click", renderTeamBalancer);
});

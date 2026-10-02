const cfg = window.AES_CONFIG || {};
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("PASTE_") && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes("PASTE_");
const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const ADMIN_PASSWORD = "AESfc2015";
const SIGNUP_PASSWORD = "2015";
const MAP_URL = "https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8";
const STATS_START_DATE = "2026-07-22";
const ORGANIZER_NAMES = ["Igor Sadovoi", "Miro Bandalo", "Dino Vučić", "Michael Freer"];
const DEFAULT_RULES_TITLE = "Signup rules";
const DEFAULT_RULES_TEXT = `Only Dino, Igor, Michael and Miro can share the signup sheet link. If you have access to the signup link, please keep it private. This helps us know who has access, keep contact details available, and manage updates properly.

For Wednesday 9 PM games, the signup sheet goes live every Saturday morning.

Please give regulars from our WhatsApp group the first chance to sign up in the first 24 hours of the signup sheet being posted. After the 24 hours, you have the green light for people to sign up additional players.

Please do not share the link with others. If you are signing someone else up, sign them up yourself and include their name in the comments section.

Anyone you sign up is your responsibility. If they, or you, cannot play, tell us and make an effort to find a replacement.`;

const fallbackPhotos = [
  { title: "AES FC match photo 1", url: "public/photos/aes-placeholder-1.svg", caption: "Replace this placeholder in public/photos." },
  { title: "AES FC match photo 2", url: "public/photos/aes-placeholder-2.svg", caption: "Add real game photos in the admin dashboard or public/photos." },
  { title: "AES FC match photo 3", url: "public/photos/aes-placeholder-3.svg", caption: "Mobile-friendly gallery with lightbox preview." }
];

const fallbackResults = [];

const state = {
  photos: fallbackPhotos,
  photoIndex: 0,
  results: fallbackResults,
  signups: [],
  cancelledSignups: [],
  regulars: [],
  game: null,
  settings: {
    rules_title: DEFAULT_RULES_TITLE,
    rules_text: DEFAULT_RULES_TEXT,
    youtube_channel_url: cfg.youtubeChannelUrl || "https://www.youtube.com/@dinovucic239/videos",
    youtube_video_ids: (cfg.youtubeVideoIds || []).join("\n")
  },
  adminPassword: sessionStorage.getItem("aes_admin_password") || ""
};

const el = (id) => document.getElementById(id);
const fmtDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zagreb" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zagreb" });
const fmtShortGame = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Europe/Zagreb" });
const fmtOpenDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zagreb" });

function setMessage(node, message, isError = false) {
  node.textContent = message || "";
  node.classList.toggle("error", Boolean(isError));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function requireDb() {
  if (!db) throw new Error("Supabase is not connected yet.");
}

function zagrebParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const dowMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    isoDow: dowMap[parts.weekday]
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDowFromDate(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function zagrebOffset(dateString, time = "12:00") {
  const utcGuess = new Date(`${dateString}T${time}:00Z`);
  const zoneName = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    timeZoneName: "longOffset"
  }).formatToParts(utcGuess).find((part) => part.type === "timeZoneName")?.value || "GMT+01:00";
  const match = zoneName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "+01:00";
  return `${match[1]}${match[2].padStart(2, "0")}:${match[3] || "00"}`;
}

function zagrebDateTime(dateString, time = "12:00") {
  const cleanTime = String(time || "12:00").slice(0, 5);
  return `${dateString}T${cleanTime}:00${zagrebOffset(dateString, cleanTime)}`;
}

function signupOpenForGame(gameDate) {
  const dow = isoDowFromDate(gameDate);
  const daysBeforeGame = {
    1: 3,
    2: 3,
    3: 4,
    4: 5,
    5: 6,
    6: 5,
    7: 5
  }[dow] || 4;
  return zagrebDateTime(addDays(gameDate, -daysBeforeGame), "09:00");
}

function getDefaultGameWindow() {
  const now = zagrebParts();
  const monday = addDays(now.date, -(now.isoDow - 1));
  const afterSaturdayOpen = now.isoDow === 6 && (now.hour > 9 || (now.hour === 9 && now.minute >= 0));
  const beforeWednesdayClose = now.isoDow === 3 && now.hour < 22;
  const inCurrentWindow = afterSaturdayOpen || now.isoDow === 7 || now.isoDow === 1 || now.isoDow === 2 || beforeWednesdayClose;
  const gameDate = inCurrentWindow && [1, 2, 3].includes(now.isoDow) ? addDays(monday, 2) : addDays(monday, 9);
  return {
    game_date: gameDate,
    start_time: "21:00",
    end_time: "22:00",
    location_name: "NK Bili As ADB Pitch",
    location_url: MAP_URL,
    signup_opens_at: signupOpenForGame(gameDate)
  };
}

function isGameOpen(game) {
  if (!game) return false;
  const opens = new Date(game.signup_opens_at || signupOpenForGame(game.game_date));
  const closes = new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5)));
  const now = new Date();
  return now >= opens && now < closes;
}

function rankSignups(signups) {
  return [...signups]
    .filter((signup) => !signup.cancelled_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)))
    .map((signup, index) => ({
      ...signup,
      position: index + 1,
      status: index < 12 ? "Playing" : "Sub"
    }));
}

function splitFullName(fullName) {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  const parts = clean.split(" ");
  return {
    fullName: clean,
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

function sortPlayerNames(names = []) {
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function signupFullName(signup) {
  return splitFullName(`${signup.first_name || ""} ${signup.last_name || ""}`).fullName;
}

function normalizeName(value) {
  return splitFullName(value).fullName.toLocaleLowerCase();
}

function currentSignupNameSet() {
  return new Set(state.signups.map((signup) => normalizeName(signupFullName(signup))).filter(Boolean));
}

function isValidFullName(fullName) {
  return splitFullName(fullName).fullName.split(" ").filter(Boolean).length >= 2;
}

function isKnownRegularName(fullName) {
  const clean = splitFullName(fullName).fullName;
  return state.regulars.some((regular) => regular.full_name === clean);
}

function isAllowedSignupName(fullName) {
  return isValidFullName(fullName) || isKnownRegularName(fullName);
}

async function getCurrentGame() {
  requireDb();
  const { data: games, error } = await db
    .from("aesfc_games")
    .select("*")
    .order("game_date", { ascending: false })
    .limit(20);
  if (error) throw error;

  const now = new Date();
  const active = (games || []).find((game) => now < new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5))));
  if (active) return { ...active, is_open: isGameOpen(active) };

  const defaultGame = getDefaultGameWindow();
  const { data, error: upsertError } = await db
    .from("aesfc_games")
    .upsert(defaultGame, { onConflict: "game_date" })
    .select()
    .single();
  if (upsertError) throw upsertError;
  return { ...data, is_open: isGameOpen(data) };
}

function assertAdmin() {
  if (state.adminPassword !== ADMIN_PASSWORD) throw new Error("Wrong admin password.");
}

async function loadPhotos() {
  const { data, error } = await db
    .from("aesfc_photos")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(60);
  if (error) throw error;
  return data?.length ? data : fallbackPhotos;
}

async function loadSettings() {
  const { data, error } = await db
    .from("aesfc_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return data || state.settings;
}

async function loadRegulars() {
  const { data, error } = await db
    .from("aesfc_regulars")
    .select("*")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadSignups(gameId) {
  const { data, error } = await db
    .from("aesfc_signups")
    .select("*")
    .eq("game_id", gameId)
    .is("cancelled_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return rankSignups(data || []);
}

async function loadCancelledSignups(gameId) {
  const { data, error } = await db
    .from("aesfc_signups")
    .select("*")
    .eq("game_id", gameId)
    .not("cancelled_at", "is", null)
    .order("cancelled_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function ensureOrganizerSignups(game) {
  if (!game?.id) return;
  const opens = new Date(game.signup_opens_at || signupOpenForGame(game.game_date));
  const autoSignupTime = new Date(opens.getTime() - 10 * 60 * 1000);
  const closes = new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5)));
  const now = new Date();
  if (now < autoSignupTime || now >= closes) return;

  const { data: existing, error: lookupError } = await db
    .from("aesfc_signups")
    .select("first_name,last_name")
    .eq("game_id", game.id);
  if (lookupError) throw lookupError;

  const existingNames = new Set((existing || []).map((signup) => normalizeName(signupFullName(signup))));
  const rows = ORGANIZER_NAMES
    .filter((name) => !existingNames.has(normalizeName(name)))
    .map((name, index) => {
      const player = splitFullName(name);
      return {
        game_id: game.id,
        signup_group: crypto.randomUUID(),
        first_name: player.firstName,
        last_name: player.lastName,
        email: "not-collected@aesfc.local",
        phone: "not collected",
        comments: "Organizer auto-signup",
        played_before: "no",
        cancel_token: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
        created_at: new Date(autoSignupTime.getTime() + index).toISOString()
      };
    });

  if (!rows.length) return;
  const { error } = await db.from("aesfc_signups").insert(rows);
  if (error) throw error;
}

async function loadResults() {
  const { data, error } = await db
    .from("aesfc_results")
    .select("*")
    .eq("is_active", true)
    .order("game_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("Results table is not ready yet.", error);
    return fallbackResults;
  }
  return data?.length ? data : fallbackResults;
}

function renderVideos() {
  const grid = el("videoGrid");
  const videos = String(state.settings.youtube_video_ids || "")
    .split(/\r?\n|,/)
    .map((value) => extractYouTubeId(value))
    .filter(Boolean);
  document.querySelector(".youtube-button").href = state.settings.youtube_channel_url || cfg.youtubeChannelUrl || "https://www.youtube.com/@dinovucic239/videos";
  if (videos.length === 0) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = videos.map((id) => `
    <a class="video-card" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noreferrer">
      <img src="https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt="AES FC match video thumbnail">
      <span>Watch match video</span>
    </a>
  `).join("");
}

function resultWinner(result) {
  if (Number(result.team_a_score) === Number(result.team_b_score)) return "draw";
  return Number(result.team_a_score) > Number(result.team_b_score) ? "a" : "b";
}

function renderResults() {
  const results = state.results.length ? state.results : fallbackResults;
  el("recentResults").innerHTML = results.slice(0, 3).map(renderResultCard).join("") || "<p class=\"empty-note\">No match results yet.</p>";
  el("allResultsList").innerHTML = results.map(renderResultRow).join("") || "<p class=\"empty-note\">No match results yet.</p>";
  renderPlayerStats(results);
}

function resultStats(result, playerName) {
  const stats = result.player_stats || {};
  const playerStats = stats[playerName] || stats[normalizeName(playerName)] || {};
  return {
    goals: Number(playerStats.goals || 0),
    assists: Number(playerStats.assists || 0)
  };
}

function resultHasIndividualStats(result) {
  const stats = result.player_stats || {};
  return Object.values(stats).some((entry) => Number(entry?.goals || 0) > 0 || Number(entry?.assists || 0) > 0);
}

function shouldCountStatsResult(result) {
  if (String(result.game_date) < STATS_START_DATE) return false;
  const isScorelessDraw = Number(result.team_a_score) === 0 && Number(result.team_b_score) === 0;
  return resultHasIndividualStats(result) || isScorelessDraw;
}

function calculatePlayerStats(results) {
  const table = new Map();
  const ensure = (name) => {
    const clean = splitFullName(name).fullName;
    if (!table.has(clean)) {
      table.set(clean, { name: clean, appearances: 0, wins: 0, draws: 0, goals: 0, assists: 0, points: 0 });
    }
    return table.get(clean);
  };
  results.filter(shouldCountStatsResult).forEach((result) => {
    const winner = resultWinner(result);
    const sides = [
      { key: "a", players: result.team_a_players || [] },
      { key: "b", players: result.team_b_players || [] }
    ];
    sides.forEach((side) => {
      sortPlayerNames(side.players).forEach((name) => {
        const row = ensure(name);
        const stats = resultStats(result, name);
        row.appearances += 1;
        row.wins += winner === side.key ? 1 : 0;
        row.draws += winner === "draw" ? 1 : 0;
        row.goals += stats.goals;
        row.assists += stats.assists;
      });
    });
  });
  return [...table.values()].map((row) => ({
    ...row,
    points: row.appearances + row.wins + row.draws + row.goals + row.assists
  })).sort((a, b) =>
    b.points - a.points ||
    b.goals - a.goals ||
    b.assists - a.assists ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function renderPlayerStats(results) {
  const stats = calculatePlayerStats(results);
  el("playerStatsTable").innerHTML = stats.length ? `
    <table class="stats-table">
      <thead><tr><th>Player</th><th>Pts</th><th>Apps</th><th>W</th><th>D</th><th>G</th><th>A</th></tr></thead>
      <tbody>
        ${stats.map((row) => `
          <tr>
            <td>${escapeHtml(row.name)}</td>
            <td><strong>${row.points}</strong></td>
            <td>${row.appearances}</td>
            <td>${row.wins}</td>
            <td>${row.draws}</td>
            <td>${row.goals}</td>
            <td>${row.assists}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "<p class=\"empty-note\">No player stats yet.</p>";
}

function renderResultCard(result) {
  const winner = resultWinner(result);
  const hasStats = resultHasIndividualStats(result);
  return `
    <article class="result-card">
      <div class="result-head">
        <span>
          ${escapeHtml(formatResultDate(result.game_date))}
          ${hasStats ? "" : "<small>No individual stats available</small>"}
        </span>
        <strong>${escapeHtml(result.team_a_score)}-${escapeHtml(result.team_b_score)}</strong>
      </div>
      <div class="result-teams">
        ${renderResultTeam(result.team_a_players, winner === "draw" ? "draw" : winner === "a" ? "winner" : "", result)}
        ${renderResultTeam(result.team_b_players, winner === "draw" ? "draw" : winner === "b" ? "winner" : "", result)}
      </div>
    </article>
  `;
}

function renderResultRow(result) {
  const hasStats = resultHasIndividualStats(result);
  return `
    <article class="result-row">
      <strong>
        ${escapeHtml(formatResultDate(result.game_date))}
        ${hasStats ? "" : "<small>No individual stats available</small>"}
      </strong>
      <span>${renderResultPlayers(result.team_a_players || [], result)}</span>
      <b>${escapeHtml(result.team_a_score)}-${escapeHtml(result.team_b_score)}</b>
      <span>${renderResultPlayers(result.team_b_players || [], result)}</span>
    </article>
  `;
}

function renderResultTeam(players = [], status = "", result = null) {
  const label = status === "winner" ? "WINNERS" : status === "draw" ? "DRAW" : "Players";
  return `
    <div class="result-team ${status}">
      <span>${label}</span>
      <p>${renderResultPlayers(players, result)}</p>
    </div>
  `;
}

function renderResultPlayers(players = [], result = null) {
  const hasStats = result && resultHasIndividualStats(result);
  return sortPlayerNames(players).map((name) => {
    if (!hasStats) return escapeHtml(name);
    const stats = resultStats(result, name);
    const bits = [
      stats.goals ? `${stats.goals}G` : "",
      stats.assists ? `${stats.assists}A` : ""
    ].filter(Boolean);
    return `${escapeHtml(name)}${bits.length ? ` <span class="player-stat-chip">(${escapeHtml(bits.join(", "))})</span>` : ""}`;
  }).join(", ");
}

function formatResultDate(dateString) {
  return fmtDate.format(new Date(`${dateString}T12:00:00+02:00`));
}

function extractYouTubeId(value = "") {
  const raw = String(value).trim();
  if (!raw) return "";
  const direct = raw.match(/^[a-zA-Z0-9_-]{11}$/);
  if (direct) return raw;
  const patterns = [
    /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function renderRules() {
  el("rulesTitle").textContent = state.settings.rules_title || DEFAULT_RULES_TITLE;
  el("rulesText").innerHTML = String(state.settings.rules_text || DEFAULT_RULES_TEXT)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function renderPhotos() {
  const photos = state.photos.length ? state.photos : fallbackPhotos;
  state.photoIndex = Math.min(state.photoIndex, photos.length - 1);
  el("photoGrid").innerHTML = photos.map((photo, index) => `
    <button class="photo-card" type="button" data-photo="${index}" aria-label="Open ${escapeHtml(photo.title || "football photo")}">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title || "AES FC football photo")}">
    </button>
  `).join("");
  showPhoto(state.photoIndex);
  clearInterval(window.aesSlideTimer);
  window.aesSlideTimer = setInterval(() => {
    const latest = state.photos.length ? state.photos : fallbackPhotos;
    if (latest.length > 1) showPhoto(state.photoIndex + 1);
  }, 4200);
}

function showPhoto(index) {
  const photos = state.photos.length ? state.photos : fallbackPhotos;
  if (!photos.length) return;
  state.photoIndex = (index + photos.length) % photos.length;
  document.querySelectorAll(".photo-card").forEach((card, cardIndex) => {
    card.classList.toggle("active", cardIndex === state.photoIndex);
  });
  const photo = photos[state.photoIndex];
  el("heroSlide").src = photo.url;
  el("heroSlide").alt = photo.title || "AES FC football photo";
  el("photoCounter").textContent = `Photo ${state.photoIndex + 1} of ${photos.length}`;
}

function renderLists() {
  const playing = state.signups.filter((s) => s.status === "Playing");
  const subs = state.signups.filter((s) => s.status === "Sub");
  el("playingCount").textContent = playing.length;
  el("subsCount").textContent = subs.length;
  el("playingList").innerHTML = playing.map(renderPublicSignup).join("") || "<li>No players yet.</li>";
  el("subsList").innerHTML = subs.map(renderPublicSignup).join("") || "<li>No subs yet.</li>";
}

function renderPublicSignup(signup) {
  const signedBy = String(signup.comments || "").match(/^Signed up by (.+)\.$/i)?.[1];
  return `
    <li>
      <strong>${escapeHtml(signup.first_name)} ${escapeHtml(signup.last_name || "")}</strong>
      <span class="meta">
        <span>#${signup.position}</span>
        <span>${fmtTime.format(new Date(signup.created_at))}</span>
        ${signedBy ? `<span class="signup-note">signed up by ${escapeHtml(signedBy)}</span>` : ""}
      </span>
    </li>
  `;
}

function renderSheetStatus() {
  const game = state.game;
  if (!game) {
    el("gameDate").textContent = "Connect Supabase to load the next game";
    el("listGameSummary").textContent = "Connect Supabase";
    el("sheetStatus").classList.remove("hidden");
    el("sheetStatus").textContent = "The site is ready. Connect Supabase to activate live signups.";
    return;
  }
  const gameStart = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
  const dateText = fmtDate.format(gameStart);
  const timeText = `${formatClock(game.start_time)} - ${formatClock(game.end_time)}`;
  const locationText = game.location_name || "NK Bili As ADB Pitch";
  const locationUrl = game.location_url || MAP_URL;
  el("gameDate").textContent = dateText;
  el("gameTime").textContent = timeText;
  el("gameLocation").textContent = locationText;
  el("gameLocation").href = locationUrl;
  el("listGameSummary").textContent = `${fmtShortGame.format(gameStart)}, ${formatClock(game.start_time).replace(":00 ", "")}`;
  el("sheetStatus").classList.toggle("hidden", game.is_open);
  el("sheetStatus").textContent = game.is_open
    ? ""
    : `Signup is closed now. It opens ${fmtOpenDate.format(new Date(game.signup_opens_at || signupOpenForGame(game.game_date)))} Europe/Zagreb for ${fmtDate.format(new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5))))}.`;
}

function formatClock(value) {
  if (!value) return "";
  const [hourRaw, minute = "00"] = String(value).split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${minute} ${suffix}`;
}

async function loadPublicState() {
  if (!configured) {
    state.photos = fallbackPhotos;
    renderSheetStatus();
    renderPhotos();
    renderLists();
    renderResults();
    renderRules();
    renderCancelSelector();
    renderVideos();
    return;
  }
  state.game = await getCurrentGame();
  await ensureOrganizerSignups(state.game);
  state.signups = await loadSignups(state.game.id);
  state.cancelledSignups = await loadCancelledSignups(state.game.id);
  state.photos = await loadPhotos();
  state.settings = await loadSettings();
  state.regulars = await loadRegulars();
  state.results = await loadResults();
  renderSheetStatus();
  renderPhotos();
  renderLists();
  renderResults();
  renderRules();
  renderPlayerSelectors();
  renderCancelSelector();
  renderVideos();
}

function renderPlayerSelectors() {
  const signedUpNames = currentSignupNameSet();
  const availableRegulars = state.regulars.filter((regular) => !signedUpNames.has(normalizeName(regular.full_name)));
  document.querySelectorAll(".player-select").forEach((select) => {
    const current = select.value;
    select.innerHTML = `
      <option value="">Choose a player</option>
      ${availableRegulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
      <option value="__manual">Not listed - enter manually</option>
    `;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
  toggleManualName();
  renderExtraPlayerFields();
  renderCancelSelector();
}

function renderCancelSelector() {
  const select = el("cancelSignupSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `
    <option value="">${state.signups.length ? "Choose your signup" : "No current signups yet"}</option>
    ${state.signups.map((signup) => `
      <option value="${escapeHtml(signup.id)}">${escapeHtml(signupFullName(signup))} - ${escapeHtml(signup.status)} #${signup.position}</option>
    `).join("")}
  `;
  select.disabled = state.signups.length === 0;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function selectedName(selectName, manualName) {
  const selected = document.querySelector(`[name="${selectName}"]`)?.value || "";
  if (selected === "__manual") return document.querySelector(`[name="${manualName}"]`)?.value || "";
  return selected;
}

function getExtraPlayerNames() {
  const count = Number(document.querySelector("[name='player_count']").value || 1);
  const names = [];
  for (let i = 1; i < count; i += 1) {
    names.push(selectedName(`extra_player_${i}_select`, `extra_player_${i}_manual`));
  }
  return names.map((name) => name.trim()).filter(Boolean);
}

async function submitSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = el("signupMessage");
  setMessage(message, "Submitting...");
  const formData = new FormData(form);
  if (String(formData.get("signup_password") || "") !== SIGNUP_PASSWORD) {
    setMessage(message, "Wrong signup password.", true);
    return;
  }
  const playerCount = Number(formData.get("player_count") || 1);
  const mainName = selectedName("full_name_select", "full_name_manual");
  const extraNames = getExtraPlayerNames();
  const requestedNames = [mainName, ...extraNames].map((name) => splitFullName(name).fullName).filter(Boolean);
  const signedUpNames = currentSignupNameSet();
  const alreadySignedUp = requestedNames.find((name) => signedUpNames.has(normalizeName(name)));
  const duplicateInRequest = requestedNames.find((name, index) => requestedNames.findIndex((other) => normalizeName(other) === normalizeName(name)) !== index);
  if (!isAllowedSignupName(mainName)) {
    setMessage(message, "Please choose or enter your full first and last name.", true);
    return;
  }
  if (playerCount > 1 && extraNames.length < playerCount - 1) {
    setMessage(message, "Please choose or enter the full name of each extra player.", true);
    return;
  }
  const invalidExtra = extraNames.find((name) => !isAllowedSignupName(name));
  if (invalidExtra) {
    setMessage(message, `Please use a full first and last name for ${invalidExtra}.`, true);
    return;
  }
  if (alreadySignedUp) {
    setMessage(message, `${alreadySignedUp} is already signed up for this game.`, true);
    return;
  }
  if (duplicateInRequest) {
    setMessage(message, `${duplicateInRequest} is listed more than once in this signup.`, true);
    return;
  }
  try {
    const game = state.game || await getCurrentGame();
    if (!isGameOpen(game)) throw new Error(`Signup is closed. It opens ${fmtOpenDate.format(new Date(game.signup_opens_at || signupOpenForGame(game.game_date)))} Europe/Zagreb.`);

    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const group = crypto.randomUUID();
    const baseTime = Date.now();
    const submitter = splitFullName(mainName);
    const rows = [{
      game_id: game.id,
      signup_group: group,
      first_name: submitter.firstName,
      last_name: submitter.lastName,
      email: "not-collected@aesfc.local",
      phone: "not collected",
      comments: null,
      played_before: "no",
      cancel_token: token,
      created_at: new Date(baseTime).toISOString()
    }];

    extraNames.slice(0, Math.max(0, playerCount - 1)).forEach((name, index) => {
      const player = splitFullName(name);
      rows.push({
        game_id: game.id,
        signup_group: group,
        first_name: player.firstName,
        last_name: player.lastName,
        email: "not-collected@aesfc.local",
        phone: "not collected",
        comments: `Signed up by ${submitter.fullName}.`,
        played_before: "no",
        cancel_token: token,
        created_at: new Date(baseTime + index + 1).toISOString()
      });
    });

    const { data, error } = await db.from("aesfc_signups").insert(rows).select();
    if (error) throw error;
    const ranked = rankSignups([...(state.signups || []), ...(data || [])]);
    const firstSpot = ranked.find((signup) => signup.id === data[0].id);
    const countText = rows.length === 1 ? "1 player" : `${rows.length} players`;
    const gameDateText = fmtDate.format(new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5))));
    setMessage(message, `You are signed up for the game on ${gameDateText}. Added ${countText}. First spot is ${firstSpot?.status || "Playing"}. If you need to cancel, use the Cancel signup section on this page.`);
    form.reset();
    form.player_count.value = "1";
    toggleExtraPlayers();
    renderPlayerSelectors();
    await loadPublicState();
  } catch (error) {
    setMessage(message, error.message, true);
  }
}

async function cancelSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = el("cancelSignupMessage");
  const data = new FormData(form);
  setMessage(message, "Cancelling...");
  if (String(data.get("cancel_password") || "") !== SIGNUP_PASSWORD) {
    setMessage(message, "Wrong signup password.", true);
    return;
  }
  const signupId = String(data.get("cancel_signup_id") || "");
  const signup = state.signups.find((item) => item.id === signupId);
  if (!signup) {
    setMessage(message, "Please choose your name from the current signup list.", true);
    return;
  }
  try {
    requireDb();
    const { error } = await db
      .from("aesfc_signups")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", signupId)
      .is("cancelled_at", null);
    if (error) throw error;
    form.reset();
    setMessage(message, "You have cancelled your signup. Please message the group to let them know you’ve cancelled. If this was a mistake, sign up again if spots are still available.");
    await loadPublicState();
  } catch (error) {
    setMessage(message, error.message, true);
  }
}

async function tryCancellationFromUrl() {
  const params = new URLSearchParams(location.search);
  const signupId = params.get("signup");
  const token = params.get("cancel");
  if (!signupId || !token || !configured) return;
  if (!confirm("Cancel this signup?")) return;
  try {
    const { data: signup, error: lookupError } = await db
      .from("aesfc_signups")
      .select("signup_group")
      .eq("id", signupId)
      .eq("cancel_token", token)
      .single();
    if (lookupError || !signup) throw new Error("This cancellation link is invalid or the signup was already cancelled.");
    const { error } = await db
      .from("aesfc_signups")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("signup_group", signup.signup_group)
      .eq("cancel_token", token)
      .is("cancelled_at", null);
    if (error) throw error;
    history.replaceState({}, "", location.pathname);
    setMessage(el("signupMessage"), "Your signup has been cancelled.");
    await loadPublicState();
  } catch (error) {
    setMessage(el("signupMessage"), error.message, true);
  }
}

function toggleExtraPlayers() {
  const count = Number(document.querySelector("[name='player_count']").value || 1);
  el("extraPlayersWrap").classList.toggle("hidden", count <= 1);
  el("responsibilityWarning").classList.toggle("hidden", count <= 1);
  renderExtraPlayerFields();
}

function toggleManualName() {
  const mainSelect = document.querySelector("[name='full_name_select']");
  el("manualNameWrap").classList.toggle("hidden", mainSelect.value !== "__manual");
}

function renderExtraPlayerFields() {
  const wrap = el("extraPlayersWrap");
  const count = Number(document.querySelector("[name='player_count']").value || 1);
  if (count <= 1) {
    wrap.innerHTML = "";
    return;
  }
  const existingValues = {};
  wrap.querySelectorAll("select, input").forEach((field) => {
    existingValues[field.name] = field.value;
  });
  wrap.innerHTML = Array.from({ length: count - 1 }, (_, index) => {
    const number = index + 1;
    return `
      <div class="extra-player-row" data-extra-row="${number}">
        <label>Extra player ${number}
          <select name="extra_player_${number}_select" class="player-select extra-select"></select>
        </label>
        <label class="extra-manual hidden">Full name
          <input name="extra_player_${number}_manual" placeholder="First and last name">
        </label>
      </div>
    `;
  }).join("");
  wrap.querySelectorAll(".player-select").forEach((select) => {
    const signedUpNames = currentSignupNameSet();
    const availableRegulars = state.regulars.filter((regular) => !signedUpNames.has(normalizeName(regular.full_name)));
    select.innerHTML = `
      <option value="">Choose a player</option>
      ${availableRegulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
      <option value="__manual">Not listed - enter manually</option>
    `;
    if (existingValues[select.name]) select.value = existingValues[select.name];
  });
  wrap.querySelectorAll("input").forEach((input) => {
    if (existingValues[input.name]) input.value = existingValues[input.name];
  });
  updateExtraManualVisibility();
}

function updateExtraManualVisibility() {
  el("extraPlayersWrap").querySelectorAll(".extra-player-row").forEach((row) => {
    const select = row.querySelector("select");
    row.querySelector(".extra-manual").classList.toggle("hidden", select.value !== "__manual");
  });
}

function openLightbox(index) {
  const photo = (state.photos.length ? state.photos : fallbackPhotos)[index];
  el("lightboxImage").src = photo.url;
  el("lightboxImage").alt = photo.title || "AES FC photo";
  el("lightboxCaption").textContent = photo.caption || photo.title || "";
  el("lightbox").classList.remove("hidden");
}

async function adminLogin(event) {
  event.preventDefault();
  state.adminPassword = new FormData(event.currentTarget).get("password");
  try {
    assertAdmin();
    await loadAdmin();
    sessionStorage.setItem("aes_admin_password", state.adminPassword);
    el("adminTools").classList.remove("hidden");
    setMessage(el("adminMessage"), "Admin dashboard loaded.");
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function loadAdmin() {
  assertAdmin();
  if (!state.game) state.game = await getCurrentGame();
  renderAdminGame(state.game);
  state.signups = await loadSignups(state.game.id);
  state.cancelledSignups = await loadCancelledSignups(state.game.id);
  state.photos = await loadPhotos();
  state.settings = await loadSettings();
  state.regulars = await loadRegulars();
  state.results = await loadResults();
  renderAdminSignups(state.signups);
  renderAdminCancellations(state.cancelledSignups);
  renderAdminPhotos(state.photos);
  renderAdminSettings();
  renderAdminRegulars();
  renderResultForm();
  renderAdminResults();
  renderPlayerSelectors();
}

function renderAdminGame(game) {
  if (!game) return;
  const form = el("gameForm");
  form.game_date.value = game.game_date || "";
  form.start_time.value = String(game.start_time || "21:00").slice(0, 5);
  form.end_time.value = String(game.end_time || "22:00").slice(0, 5);
  form.location_name.value = game.location_name || "NK Bili As ADB Pitch";
  form.location_url.value = game.location_url || MAP_URL;
}

function renderAdminSettings() {
  const form = el("settingsForm");
  form.rules_title.value = state.settings.rules_title || DEFAULT_RULES_TITLE;
  form.rules_text.value = state.settings.rules_text || DEFAULT_RULES_TEXT;
  form.youtube_video_ids.value = state.settings.youtube_video_ids || "";
}

function resultPlayerOptions() {
  const names = state.regulars.map((regular) => regular.full_name).filter(Boolean);
  const firstNamesWithFullNames = new Set(
    names
      .filter((name) => splitFullName(name).lastName)
      .map((name) => splitFullName(name).firstName.toLocaleLowerCase())
  );
  return names
    .filter((name) => {
      const player = splitFullName(name);
      if (!player.lastName && firstNamesWithFullNames.has(player.firstName.toLocaleLowerCase())) return false;
      if (player.lastName.length === 1 && firstNamesWithFullNames.has(player.firstName.toLocaleLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function renderResultForm() {
  const options = resultPlayerOptions().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  const selects = (team) => Array.from({ length: 6 }, (_, index) => `
    <div class="result-player-row">
      <label>Player ${index + 1}
        <select name="${team}_player_${index + 1}_select" data-result-player-select>
          <option value="">Choose player</option>
          ${options}
          <option value="__manual">Not listed - enter manually</option>
        </select>
      </label>
      <label class="result-manual hidden">Manual name
        <input name="${team}_player_${index + 1}_manual" placeholder="Full name">
      </label>
      <label>Goals
        <input name="${team}_player_${index + 1}_goals" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="0">
      </label>
      <label>Assists
        <input name="${team}_player_${index + 1}_assists" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="0">
      </label>
    </div>
  `).join("");
  el("teamAPlayers").innerHTML = selects("team_a");
  el("teamBPlayers").innerHTML = selects("team_b");
  el("resultForm").game_date.value = state.game?.game_date || new Date().toISOString().slice(0, 10);
}

function updateResultManualVisibility() {
  el("resultForm").querySelectorAll(".result-player-row").forEach((row) => {
    const select = row.querySelector("select");
    row.querySelector(".result-manual").classList.toggle("hidden", select.value !== "__manual");
  });
}

function selectedResultName(formData, team, index) {
  const selected = String(formData.get(`${team}_player_${index}_select`) || "").trim();
  if (selected !== "__manual") return selected;
  return String(formData.get(`${team}_player_${index}_manual`) || "").trim();
}

function renderAdminResults() {
  const results = state.results.length ? state.results : fallbackResults;
  el("adminResults").innerHTML = results.map((result) => `
    <details class="admin-result" data-result-row="${result.id}">
      <summary>
        <strong>${escapeHtml(formatResultDate(result.game_date))}</strong>
        <span>${escapeHtml(result.team_a_score)}-${escapeHtml(result.team_b_score)}</span>
      </summary>
      <div class="result-edit-grid">
        <label>Date<input name="result_game_date" type="date" value="${escapeHtml(result.game_date)}"></label>
        <label>Side 1 score<input name="result_team_a_score" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(result.team_a_score)}"></label>
        <label>Side 2 score<input name="result_team_b_score" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(result.team_b_score)}"></label>
      </div>
      ${renderAdminResultTeam("Side 1", "team_a", result.team_a_players || [], result)}
      ${renderAdminResultTeam("Side 2", "team_b", result.team_b_players || [], result)}
      <div class="admin-result-actions">
        ${String(result.id).startsWith("fallback-") ? "" : `<button class="secondary compact" type="button" data-save-result="${result.id}">Save result</button>`}
        ${String(result.id).startsWith("fallback-") ? "" : `<button class="icon-button" type="button" data-remove-result="${result.id}">Remove</button>`}
      </div>
    </details>
  `).join("");
}

function renderAdminResultTeam(label, team, players, result) {
  const rows = [...sortPlayerNames(players)];
  while (rows.length < 6) rows.push("");
  return `
    <fieldset class="saved-result-team">
      <legend>${label}</legend>
      ${rows.slice(0, 6).map((player, index) => {
        const stats = player ? resultStats(result, player) : { goals: 0, assists: 0 };
        return `
          <div class="saved-player-row">
            <label>Player ${index + 1}<input name="${team}_saved_player_${index + 1}" value="${escapeHtml(player)}" placeholder="Full name"></label>
            <label>Goals<input name="${team}_saved_goals_${index + 1}" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${stats.goals}"></label>
            <label>Assists<input name="${team}_saved_assists_${index + 1}" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${stats.assists}"></label>
          </div>
        `;
      }).join("")}
    </fieldset>
  `;
}

function renderAdminSignups(signups) {
  el("adminSignups").innerHTML = `
    <table>
      <thead><tr><th>Status</th><th>Edit player name</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${signups.map((s) => `
          <tr data-admin-row="${s.id}">
            <td>${escapeHtml(s.status)} #${s.position}</td>
            <td>
              <input name="full_name" value="${escapeHtml(signupFullName(s))}" aria-label="Player full name">
            </td>
            <td><small>${escapeHtml(s.comments || "One visible player spot")}</small></td>
            <td>
              <button class="secondary compact" type="button" data-save-signup="${s.id}">Save</button>
              <button class="icon-button" type="button" data-remove-signup="${s.id}">Remove</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAdminCancellations(signups) {
  el("adminCancellations").innerHTML = `
    <table>
      <thead><tr><th>Player</th><th>Cancelled</th><th>Note</th></tr></thead>
      <tbody>
        ${signups.length ? signups.map((s) => `
          <tr>
            <td>${escapeHtml(signupFullName(s))}</td>
            <td>${escapeHtml(fmtTime.format(new Date(s.cancelled_at)))}</td>
            <td><small>${escapeHtml(s.comments || "")}</small></td>
          </tr>
        `).join("") : "<tr><td colspan=\"3\">No cancellations yet.</td></tr>"}
      </tbody>
    </table>
  `;
}

function renderAdminRegulars() {
  el("adminRegulars").innerHTML = state.regulars.map((regular) => `
    <div class="admin-regular" data-regular-row="${regular.id}">
      <input name="regular_full_name" value="${escapeHtml(regular.full_name)}" aria-label="Regular player full name">
      <button class="secondary compact" type="button" data-save-regular="${regular.id}">Save</button>
      <button class="icon-button" type="button" data-remove-regular="${regular.id}">Remove</button>
    </div>
  `).join("") || "<p>No regular names yet.</p>";
}

function renderAdminPhotos(photos) {
  el("adminPhotos").innerHTML = photos.map((photo) => `
    <div class="admin-photo">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title || "photo")}">
      <div><strong>${escapeHtml(photo.title || "Untitled")}</strong><br><small>${escapeHtml(photo.url)}</small></div>
      <button class="icon-button" type="button" data-remove-photo="${photo.id}">Remove</button>
    </div>
  `).join("") || "<p>No photos yet.</p>";
}

async function addPhoto(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  let url = String(data.get("url") || "").trim();
  const file = data.get("file");
  if (!url && file && file.size) {
    setMessage(el("adminMessage"), "Preparing photo...");
    url = await fileToCompressedDataUrl(file);
  }
  if (!url) {
    setMessage(el("adminMessage"), "Add a photo path, URL, or uploaded file.", true);
    return;
  }
  try {
    assertAdmin();
    const { error } = await db.from("aesfc_photos").insert({
      title: data.get("title") || "AES FC photo",
      url,
      caption: data.get("caption") || "",
      sort_order: 100 + state.photos.length
    });
    if (error) throw error;
    form.reset();
    setMessage(el("adminMessage"), "Photo added.");
    await loadPublicState();
    await loadAdmin();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function addRegular(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fullName = String(new FormData(form).get("regular_name") || "").trim();
  if (!splitFullName(fullName).fullName) {
    setMessage(el("adminMessage"), "Please enter a player name.", true);
    return;
  }
  try {
    assertAdmin();
    const { error } = await db.from("aesfc_regulars").upsert({
      full_name: splitFullName(fullName).fullName,
      is_active: true,
      sort_order: 100 + state.regulars.length
    }, { onConflict: "full_name" });
    if (error) throw error;
    form.reset();
    setMessage(el("adminMessage"), "Regular player added.");
    state.regulars = await loadRegulars();
    renderAdminRegulars();
    renderPlayerSelectors();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function saveGameDetails(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    assertAdmin();
    const updated = {
      game_date: data.get("game_date"),
      start_time: data.get("start_time"),
      end_time: data.get("end_time"),
      location_name: data.get("location_name"),
      location_url: data.get("location_url"),
      signup_opens_at: signupOpenForGame(data.get("game_date"))
    };
    const { data: saved, error } = await db
      .from("aesfc_games")
      .update(updated)
      .eq("id", state.game.id)
      .select()
      .single();
    if (error) throw error;
    state.game = { ...saved, is_open: isGameOpen(saved) };
    setMessage(el("adminMessage"), "Game details saved.");
    await loadPublicState();
    await loadAdmin();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

function getResultTeam(formData, team) {
  return Array.from({ length: 6 }, (_, index) => selectedResultName(formData, team, index + 1))
    .filter(Boolean);
}

function getResultPlayerStats(formData, team, players) {
  return players.reduce((stats, name) => {
    const index = Array.from({ length: 6 }, (_, i) => i + 1)
      .find((number) => selectedResultName(formData, team, number) === name);
    stats[name] = {
      goals: Number(formData.get(`${team}_player_${index}_goals`) || 0),
      assists: Number(formData.get(`${team}_player_${index}_assists`) || 0)
    };
    return stats;
  }, {});
}

function collectSavedResultTeam(row, team) {
  const players = [];
  const stats = {};
  for (let index = 1; index <= 6; index += 1) {
    const name = splitFullName(row.querySelector(`[name="${team}_saved_player_${index}"]`)?.value || "").fullName;
    if (!name) continue;
    players.push(name);
    stats[name] = {
      goals: Number(row.querySelector(`[name="${team}_saved_goals_${index}"]`)?.value || 0),
      assists: Number(row.querySelector(`[name="${team}_saved_assists_${index}"]`)?.value || 0)
    };
  }
  return { players: sortPlayerNames(players), stats };
}

async function saveExistingResult(resultId) {
  const row = [...document.querySelectorAll("[data-result-row]")]
    .find((node) => node.dataset.resultRow === resultId);
  if (!row) throw new Error("Result row not found. Refresh the dashboard and try again.");
  const teamA = collectSavedResultTeam(row, "team_a");
  const teamB = collectSavedResultTeam(row, "team_b");
  if (!teamA.players.length || !teamB.players.length) throw new Error("Saved results need players on both sides.");
  const { error } = await db.from("aesfc_results").update({
    game_date: row.querySelector("[name='result_game_date']").value,
    team_a_score: Number(row.querySelector("[name='result_team_a_score']").value || 0),
    team_b_score: Number(row.querySelector("[name='result_team_b_score']").value || 0),
    team_a_players: teamA.players,
    team_b_players: teamB.players,
    player_stats: { ...teamA.stats, ...teamB.stats }
  }).eq("id", resultId);
  if (error) throw error;
  setMessage(el("adminMessage"), "Match result updated.");
}

async function addResult(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const teamA = getResultTeam(data, "team_a");
  const teamB = getResultTeam(data, "team_b");
  if (!teamA.length || !teamB.length) {
    setMessage(el("adminMessage"), "Choose or manually enter players for both sides.", true);
    return;
  }
  try {
    assertAdmin();
    const { error } = await db.from("aesfc_results").upsert({
      game_date: data.get("game_date"),
      team_a_players: sortPlayerNames(teamA),
      team_b_players: sortPlayerNames(teamB),
      team_a_score: Number(data.get("team_a_score")),
      team_b_score: Number(data.get("team_b_score")),
      player_stats: {
        ...getResultPlayerStats(data, "team_a", teamA),
        ...getResultPlayerStats(data, "team_b", teamB)
      },
      is_active: true
    }, { onConflict: "game_date" });
    if (error) throw error;
    form.reset();
    setMessage(el("adminMessage"), "Match result saved.");
    await loadPublicState();
    await loadAdmin();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    assertAdmin();
    const updated = {
      id: true,
      rules_title: data.get("rules_title"),
      rules_text: data.get("rules_text"),
      youtube_channel_url: state.settings.youtube_channel_url || cfg.youtubeChannelUrl || "https://www.youtube.com/@dinovucic239/videos",
      youtube_video_ids: normalizeYouTubeList(data.get("youtube_video_ids") || ""),
      updated_at: new Date().toISOString()
    };
    const { data: saved, error } = await db
      .from("aesfc_settings")
      .upsert(updated, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    state.settings = saved;
    renderRules();
    renderVideos();
    setMessage(el("adminMessage"), "Signup rules and videos saved.");
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

function normalizeYouTubeList(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((entry) => extractYouTubeId(entry))
    .filter(Boolean)
    .join("\n");
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      image.onload = () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleAdminClicks(event) {
  const signupId = event.target.dataset.removeSignup;
  const saveSignupId = event.target.dataset.saveSignup;
  const photoId = event.target.dataset.removePhoto;
  const saveRegularId = event.target.dataset.saveRegular;
  const removeRegularId = event.target.dataset.removeRegular;
  const removeResultId = event.target.dataset.removeResult;
  const saveResultId = event.target.dataset.saveResult;
  try {
    assertAdmin();
    if (saveResultId) {
      await saveExistingResult(saveResultId);
    }
    if (saveSignupId) {
      const row = event.target.closest("[data-admin-row]");
      const player = splitFullName(row.querySelector("[name='full_name']").value);
      if (!player.fullName) throw new Error("Please enter a player name.");
      const { error } = await db.from("aesfc_signups").update({
        first_name: player.firstName,
        last_name: player.lastName
      }).eq("id", saveSignupId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Signup updated.");
    }
    if (signupId) {
      const { error } = await db.from("aesfc_signups").update({ cancelled_at: new Date().toISOString() }).eq("id", signupId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Signup removed. The lists have been recalculated.");
    }
    if (photoId) {
      const { error } = await db.from("aesfc_photos").update({ is_active: false }).eq("id", photoId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Photo removed.");
    }
    if (saveRegularId) {
      const row = event.target.closest("[data-regular-row]");
      const fullName = splitFullName(row.querySelector("[name='regular_full_name']").value).fullName;
      if (!fullName) throw new Error("Please enter a player name.");
      const { error } = await db.from("aesfc_regulars").update({ full_name: fullName }).eq("id", saveRegularId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Regular player updated.");
    }
    if (removeRegularId) {
      const { error } = await db.from("aesfc_regulars").update({ is_active: false }).eq("id", removeRegularId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Regular player removed from options.");
    }
    if (removeResultId) {
      const { error } = await db.from("aesfc_results").update({ is_active: false }).eq("id", removeResultId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Match result removed.");
    }
    if (signupId || saveSignupId || photoId || saveRegularId || removeRegularId || removeResultId || saveResultId) {
      await loadPublicState();
      await loadAdmin();
    }
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelector("[name='player_count']").addEventListener("input", toggleExtraPlayers);
  document.querySelector("[name='full_name_select']").addEventListener("change", toggleManualName);
  el("extraPlayersWrap").addEventListener("change", (event) => {
    if (event.target.matches("select")) updateExtraManualVisibility();
  });
  el("signupForm").addEventListener("submit", submitSignup);
  el("cancelSignupForm").addEventListener("submit", cancelSignup);
  el("photoGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-photo]");
    if (card) openLightbox(Number(card.dataset.photo));
  });
  el("photoPrev").addEventListener("click", () => showPhoto(state.photoIndex - 1));
  el("photoNext").addEventListener("click", () => showPhoto(state.photoIndex + 1));
  el("openAllResults").addEventListener("click", () => {
    el("allResults").open = true;
  });
  el("closeLightbox").addEventListener("click", () => el("lightbox").classList.add("hidden"));
  el("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") el("lightbox").classList.add("hidden");
  });
  el("adminLogin").addEventListener("submit", adminLogin);
  el("gameForm").addEventListener("submit", saveGameDetails);
  el("resultForm").addEventListener("change", (event) => {
    if (event.target.matches("[data-result-player-select]")) updateResultManualVisibility();
  });
  el("resultForm").addEventListener("submit", addResult);
  el("settingsForm").addEventListener("submit", saveSettings);
  el("photoForm").addEventListener("submit", addPhoto);
  el("regularForm").addEventListener("submit", addRegular);
  el("adminTools").addEventListener("click", handleAdminClicks);
  el("refreshAdmin").addEventListener("click", loadAdmin);
  el("logoutAdmin").addEventListener("click", () => {
    sessionStorage.removeItem("aes_admin_password");
    state.adminPassword = "";
    el("adminTools").classList.add("hidden");
    setMessage(el("adminMessage"), "Logged out.");
  });
  renderVideos();
  try {
    await loadPublicState();
    await tryCancellationFromUrl();
  } catch (error) {
    renderSheetStatus();
    renderPhotos();
    renderLists();
    renderResults();
    renderRules();
    setMessage(el("signupMessage"), error.message, true);
  }
});

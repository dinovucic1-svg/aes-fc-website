const cfg = window.AES_CONFIG || {};
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("PASTE_") && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes("PASTE_");
const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const ADMIN_PASSWORD = "AESfc2015";
const SIGNUP_PASSWORD = "2015";
const MAP_URL = "https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8";
const GUSAR_MAP_URL = "https://www.google.com/maps/search/?api=1&query=Gusar%20Split";
const STATS_START_DATE = "2026-07-22";
const RESULT_PLAYERS_PER_SIDE = 8;
const TRACKER_PLAYERS_PER_SIDE = 6;
const TRACKER_DRAFT_TABLE = "aesfc_tracker_drafts";
const TRACKER_LOCAL_PREFIX = "aesfc_live_tracker_";
const TRACKER_OWN_GOAL = "__own_goal__";
const PLAYER_ATTRIBUTE_TAGS = [
  ["speed", "Speed"],
  ["stamina", "Stamina"],
  ["strength", "Strength"],
  ["intensity", "Intensity"],
  ["composure", "Composure"],
  ["defensive_awareness", "Defensive awareness"],
  ["vision_positioning", "Vision/Positioning"],
  ["ball_control", "Ball control"],
  ["passing", "Passing"],
  ["dribbling", "Dribbling"],
  ["finishing", "Finishing"],
  ["shot_power", "Shot power"]
];
const PERMANENT_RECURRING_SLOTS = [
  {
    weekday: 1,
    start_time: "20:00",
    end_time: "21:00",
    location_name: "Bili's Pitch",
    location_url: MAP_URL,
    first_date: "2026-09-21"
  },
  {
    weekday: 3,
    start_time: "19:00",
    end_time: "20:00",
    location_name: "NK Bili As ADB Pitch",
    location_url: MAP_URL,
    first_date: "2026-09-30",
    last_date: "2026-09-30"
  },
  {
    weekday: 3,
    start_time: "21:00",
    end_time: "22:00",
    location_name: "Gusar",
    location_url: GUSAR_MAP_URL,
    first_date: "2026-10-07"
  }
];
const NATIONALITY_FLAGS = {
  argentina: "🇦🇷",
  australia: "🇦🇺",
  belarus: "🇧🇾",
  canada: "🇨🇦",
  chile: "🇨🇱",
  croatia: "🇭🇷",
  england: "🇬🇧",
  france: "🇫🇷",
  germany: "🇩🇪",
  israel: "🇮🇱",
  italy: "🇮🇹",
  "new zealand": "🇳🇿",
  "north macedonia": "🇲🇰",
  romania: "🇷🇴",
  russia: "🇷🇺",
  ukraine: "🇺🇦",
  uk: "🇬🇧",
  "great britain": "🇬🇧",
  "united kingdom": "🇬🇧",
  usa: "🇺🇸",
  "united states": "🇺🇸",
  "united states of america": "🇺🇸"
};
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
  games: [],
  signups: [],
  cancelledSignups: [],
  publicGames: [],
  regulars: [],
  playerProfiles: [],
  game: null,
  realtimeChannel: null,
  realtimeGameId: null,
  liveToastTimer: null,
  statsMode: "overall",
  statsMonth: "",
  resultsMonth: "",
  tracker: {
    gameDate: "",
    teamA: [],
    teamB: [],
    events: [],
    pendingTeam: null,
    editingIndex: null,
    pendingScorer: "",
    pendingAssist: "",
    lastSavedAt: "",
    saveStatus: "",
    unsavedChanges: false,
    started: false
  },
  settings: {
    rules_title: DEFAULT_RULES_TITLE,
    rules_text: DEFAULT_RULES_TEXT
  },
  adminPassword: sessionStorage.getItem("aes_admin_password") || ""
};

const el = (id) => document.getElementById(id);
const fmtDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zagreb" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zagreb" });
const fmtShortGame = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Europe/Zagreb" });
const fmtShortResult = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Europe/Zagreb" });
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
  return fridaySignupOpenForGame(gameDate);
}

function fridaySignupOpenForGame(gameDate) {
  const dow = isoDowFromDate(gameDate);
  const daysBackToFriday = dow >= 5 ? dow - 5 : dow + 2;
  return zagrebDateTime(addDays(gameDate, -daysBackToFriday), "09:00");
}

function toDatetimeLocalValue(value, fallbackDate) {
  const source = value || signupOpenForGame(fallbackDate);
  const date = new Date(source);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function datetimeLocalToZagreb(value) {
  if (!value) return "";
  const [date, time = "09:00"] = String(value).split("T");
  return zagrebDateTime(date, time.slice(0, 5));
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
    signup_opens_at: signupOpenForGame(gameDate),
    guest_delay_hours: 24
  };
}

function isGameOpen(game) {
  if (!game) return false;
  const opens = new Date(game.signup_opens_at || signupOpenForGame(game.game_date));
  const closes = new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5)));
  const now = new Date();
  return now >= opens && now < closes;
}

function nextDisplayGame() {
  const games = (state.publicGames?.length ? state.publicGames : state.games || []).filter(Boolean);
  if (!games.length) return state.game;
  return [...games].sort((a, b) => {
    const aStart = new Date(zagrebDateTime(a.game_date, String(a.start_time || "21:00").slice(0, 5)));
    const bStart = new Date(zagrebDateTime(b.game_date, String(b.start_time || "21:00").slice(0, 5)));
    return aStart - bStart;
  })[0];
}

function guestSignupAllowed(game = state.game) {
  if (!game) return false;
  const delayHours = Number(game.guest_delay_hours ?? 24);
  if (delayHours <= 0) return true;
  const opens = new Date(game.signup_opens_at || signupOpenForGame(game.game_date));
  return new Date() >= new Date(opens.getTime() + delayHours * 60 * 60 * 1000);
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

function nationalityFlag(nationality = "") {
  return NATIONALITY_FLAGS[String(nationality || "").trim().toLocaleLowerCase()] || "";
}

function regularForName(fullName = "") {
  const clean = normalizeName(fullName);
  return state.regulars.find((regular) => normalizeName(regular.full_name) === clean);
}

function profileForName(fullName = "") {
  const clean = normalizeName(fullName);
  return state.playerProfiles.find((profile) => normalizeName(profile.full_name) === clean);
}

function nationalityForName(fullName = "") {
  return profileForName(fullName)?.nationality || regularForName(fullName)?.nationality || "";
}

function signupNationality(signup) {
  return signup.nationality || nationalityForName(signupFullName(signup));
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

function isAllowedSignupName(fullName, allowGuest = guestSignupAllowed()) {
  return isKnownRegularName(fullName) || (allowGuest && isValidFullName(fullName));
}

async function getCurrentGame() {
  requireDb();
  const games = await loadUpcomingGames();
  const active = games[0];
  if (active) return { ...active, is_open: isGameOpen(active) };

  const defaultGame = await nextRecurringGameTemplate();
  const { data, error: upsertError } = await db
    .from("aesfc_games")
    .upsert(defaultGame, { onConflict: "game_date" })
    .select()
    .single();
  if (upsertError) throw upsertError;
  state.games = [data];
  return { ...data, is_open: isGameOpen(data) };
}

async function nextRecurringGameTemplate() {
  const { data, error } = await db
    .from("aesfc_games")
    .select("*")
    .eq("is_recurring", true)
    .order("game_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ...getDefaultGameWindow(), is_recurring: true };

  let gameDate = addDays(data.game_date, 7);
  const today = zagrebParts().date;
  while (new Date(zagrebDateTime(gameDate, String(data.end_time || "22:00").slice(0, 5))) < new Date(zagrebDateTime(today, "00:00"))) {
    gameDate = addDays(gameDate, 7);
  }
  return {
    game_date: gameDate,
    start_time: data.start_time || "21:00",
    end_time: data.end_time || "22:00",
    location_name: data.location_name || "NK Bili As ADB Pitch",
    location_url: data.location_url || MAP_URL,
    signup_opens_at: signupOpenForGame(gameDate),
    is_recurring: true,
    guest_delay_hours: Number(data.guest_delay_hours ?? 24)
  };
}

async function loadUpcomingGames() {
  const today = zagrebParts().date;
  const { data: games, error } = await db
    .from("aesfc_games")
    .select("*")
    .gte("game_date", today)
    .order("game_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(30);
  if (error) throw error;
  const now = new Date();
  await ensurePermanentRecurringGames(games || []);
  const { data: refreshedGames, error: refreshedError } = await db
    .from("aesfc_games")
    .select("*")
    .gte("game_date", today)
    .order("game_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(30);
  if (refreshedError) throw refreshedError;
  state.games = (refreshedGames || []).filter((game) => now < new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5))));
  state.publicGames = state.games.slice(0, 2);
  return state.games;
}

async function ensurePermanentRecurringGames(existingGames = []) {
  if (!db) return;
  const existingDates = new Set((existingGames || []).map((game) => String(game.game_date)));
  const today = zagrebParts().date;
  const targets = [];
  for (const slot of PERMANENT_RECURRING_SLOTS) {
    let gameDate = nextDateForWeekday(today, slot.weekday);
    if (new Date(`${gameDate}T12:00:00Z`) < new Date(`${slot.first_date}T12:00:00Z`)) {
      gameDate = slot.first_date;
    }
    for (let index = 0; index < 10; index += 1) {
      const targetDate = addDays(gameDate, index * 7);
      if (slot.last_date && new Date(`${targetDate}T12:00:00Z`) > new Date(`${slot.last_date}T12:00:00Z`)) break;
      if (existingDates.has(targetDate)) continue;
      existingDates.add(targetDate);
      targets.push({
        game_date: targetDate,
        start_time: slot.start_time,
        end_time: slot.end_time,
        location_name: slot.location_name,
        location_url: slot.location_url,
        signup_opens_at: fridaySignupOpenForGame(targetDate),
        is_recurring: true,
        guest_delay_hours: 24
      });
    }
  }
  if (!targets.length) return;
  const { error } = await db
    .from("aesfc_games")
    .upsert(targets, { onConflict: "game_date", ignoreDuplicates: true });
  if (error) throw error;
}

function nextDateForWeekday(fromDate, weekday) {
  const currentDow = isoDowFromDate(fromDate);
  const daysAhead = (weekday - currentDow + 7) % 7;
  return addDays(fromDate, daysAhead);
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

async function loadPlayerProfiles() {
  const { data, error } = await db
    .from("aesfc_player_profiles")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) {
    console.warn("Player profiles table is not ready yet.", error);
    return [];
  }
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
  const autoSignupTime = opens;
  const closes = new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5)));
  const now = new Date();
  if (now < autoSignupTime || now >= closes) return;

  const { data: guaranteed, error: regularError } = await db
    .from("aesfc_regulars")
    .select("full_name,nationality")
    .eq("is_active", true)
    .eq("guaranteed_signup", true)
    .order("full_name", { ascending: true });
  if (regularError) throw regularError;
  const guaranteedPlayers = (guaranteed || []).filter((regular) => regular.full_name);
  if (!guaranteedPlayers.length) return;

  const { data: existing, error: lookupError } = await db
    .from("aesfc_signups")
    .select("first_name,last_name")
    .eq("game_id", game.id);
  if (lookupError) throw lookupError;

  const existingNames = new Set((existing || []).map((signup) => normalizeName(signupFullName(signup))));
  const rows = guaranteedPlayers
    .filter((regular) => !existingNames.has(normalizeName(regular.full_name)))
    .map((regular, index) => {
      const player = splitFullName(regular.full_name);
      return {
        game_id: game.id,
        signup_group: crypto.randomUUID(),
        first_name: player.firstName,
        last_name: player.lastName,
        nationality: regular.nationality || "",
        email: "not-collected@aesfc.local",
        phone: "not collected",
        comments: "Guaranteed signup",
        signed_up_by: null,
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

function resultWinner(result) {
  if (Number(result.team_a_score) === Number(result.team_b_score)) return "draw";
  return Number(result.team_a_score) > Number(result.team_b_score) ? "a" : "b";
}

function renderResults() {
  const results = state.results.length ? state.results : fallbackResults;
  const months = availableResultMonths(results);
  if (!state.resultsMonth || (state.resultsMonth !== "all" && !months.includes(state.resultsMonth))) {
    state.resultsMonth = months.includes(currentMonthKey()) ? currentMonthKey() : months[0] || "all";
  }
  const selectedResults = selectedResultMonthResults(results);
  const monthSelect = el("resultsMonthSelect");
  if (monthSelect) {
    monthSelect.innerHTML = `
      ${months.map((key) => `<option value="${escapeHtml(key)}" ${state.resultsMonth === key ? "selected" : ""}>${escapeHtml(monthLabel(key))}</option>`).join("")}
      <option value="all" ${state.resultsMonth === "all" ? "selected" : ""}>All-Time</option>
    `;
  }
  el("recentResults").innerHTML = selectedResults.map(renderResultCard).join("") || `<p class="empty-note">No match results for ${escapeHtml(monthLabel(state.resultsMonth))} yet.</p>`;
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
      table.set(clean, { name: clean, appearances: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, points: 0, form: [] });
    }
    return table.get(clean);
  };
  results.filter(shouldCountStatsResult).sort((a, b) =>
    new Date(a.game_date) - new Date(b.game_date) || new Date(a.created_at || 0) - new Date(b.created_at || 0)
  ).forEach((result) => {
    const winner = resultWinner(result);
    const sides = [
      { key: "a", players: result.team_a_players || [] },
      { key: "b", players: result.team_b_players || [] }
    ];
    sides.forEach((side) => {
      sortPlayerNames(side.players).forEach((name) => {
        const row = ensure(name);
        const stats = resultStats(result, name);
        const outcome = winner === "draw" ? "D" : winner === side.key ? "W" : "L";
        row.appearances += 1;
        row.wins += winner === side.key ? 1 : 0;
        row.draws += winner === "draw" ? 1 : 0;
        row.losses += winner !== "draw" && winner !== side.key ? 1 : 0;
        row.goals += stats.goals;
        row.assists += stats.assists;
        row.form.push(outcome);
      });
    });
  });
  return [...table.values()].map((row) => ({
    ...row,
    goalContributions: row.goals + row.assists,
    goalsPerGame: row.appearances ? row.goals / row.appearances : 0,
    assistsPerGame: row.appearances ? row.assists / row.appearances : 0,
    winPct: row.appearances ? row.wins / row.appearances : 0,
    points: row.appearances + row.wins + row.draws + row.goals + row.assists
  }));
}

function sortStatsRows(rows = [], mode = "overall") {
  const tieBreak = (a, b) =>
    b.points - a.points ||
    b.winPct - a.winPct ||
    b.goalContributions - a.goalContributions ||
    b.goals - a.goals ||
    b.assists - a.assists ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const sorters = {
    overall: (a, b) => tieBreak(a, b),
    scorers: (a, b) => b.goals - a.goals || b.goalsPerGame - a.goalsPerGame || b.assists - a.assists || tieBreak(a, b),
    assists: (a, b) => b.assists - a.assists || b.assistsPerGame - a.assistsPerGame || b.goals - a.goals || tieBreak(a, b),
    wins: (a, b) => b.winPct - a.winPct || b.wins - a.wins || b.appearances - a.appearances || tieBreak(a, b)
  };
  return [...rows].sort(sorters[mode] || sorters.overall);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatRate(value) {
  return Number(value || 0).toFixed(1);
}

function renderFormPills(form = []) {
  const recent = form.slice(-5);
  if (!recent.length) return "<span class=\"empty-stat\">–</span>";
  return `<span class="form-pills">${recent.map((outcome) => `<span class="form-pill ${outcome.toLowerCase()}">${outcome}</span>`).join("")}</span>`;
}

function monthKey(dateString) {
  return String(dateString || "").slice(0, 7);
}

function monthLabel(key) {
  if (key === "all") return "All-Time";
  const [year, month] = String(key || "").split("-");
  if (!year || !month) return "Current month";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "Europe/Zagreb" })
    .format(new Date(`${year}-${month}-15T12:00:00Z`));
}

function currentMonthKey() {
  return zagrebParts().date.slice(0, 7);
}

function availableStatsMonths(results = []) {
  const resultMonths = new Set(results.filter(shouldCountStatsResult).map((result) => monthKey(result.game_date)).filter((key) => key >= "2026-09"));
  const months = [];
  let cursor = "2026-09";
  const end = [...resultMonths, currentMonthKey()].sort().at(-1) || currentMonthKey();
  while (cursor <= end) {
    months.push(cursor);
    const [year, month] = cursor.split("-").map(Number);
    const next = month === 12 ? [year + 1, 1] : [year, month + 1];
    cursor = `${next[0]}-${String(next[1]).padStart(2, "0")}`;
  }
  return months.reverse();
}

function availableResultMonths(results = []) {
  return [...new Set(results.map((result) => monthKey(result.game_date)).filter(Boolean))]
    .sort()
    .reverse();
}

function selectedResultMonthResults(results = []) {
  if (state.resultsMonth === "all") return results;
  return results.filter((result) => monthKey(result.game_date) === state.resultsMonth);
}

function selectedStatsResults(results = []) {
  const months = availableStatsMonths(results);
  if (!state.statsMonth) {
    state.statsMonth = months.includes(currentMonthKey()) ? currentMonthKey() : months[0] || "all";
  }
  if (state.statsMonth === "all") return results;
  return results.filter((result) => monthKey(result.game_date) === state.statsMonth);
}

function statsRowsForMode(results = [], mode = "overall", minimumWinAppearances = 5) {
  const rows = calculatePlayerStats(results);
  return sortStatsRows(mode === "wins" ? rows.filter((row) => row.appearances >= minimumWinAppearances) : rows, mode);
}

function playerOfMonthRow(results = [], month = state.statsMonth) {
  if (!month || month === "all") return null;
  const rows = calculatePlayerStats(results.filter((result) => monthKey(result.game_date) === month));
  return sortStatsRows(rows, "overall")[0] || null;
}

function monthResults(results = [], month = "") {
  if (month === "all") return results.filter(shouldCountStatsResult);
  return results.filter((result) => monthKey(result.game_date) === month);
}

function formatResultLabel(result) {
  if (!result) return "None";
  return `${formatShortResultDate(result.game_date)} (${result.team_a_score}-${result.team_b_score})`;
}

function tiedNames(rows = [], key = "points") {
  if (!rows.length) return [];
  const max = Math.max(...rows.map((row) => Number(row[key] || 0)));
  return rows.filter((row) => Number(row[key] || 0) === max).map((row) => row.name);
}

function calculateSingleGamePoints(result, name, sideKey) {
  const winner = resultWinner(result);
  const stats = resultStats(result, name);
  return 1 +
    (winner === sideKey ? 1 : 0) +
    (winner === "draw" ? 1 : 0) +
    Number(stats.goals || 0) +
    Number(stats.assists || 0);
}

function highestSingleGamePoints(results = []) {
  const rows = [];
  results.forEach((result) => {
    [
      { key: "a", players: result.team_a_players || [] },
      { key: "b", players: result.team_b_players || [] }
    ].forEach((side) => {
      side.players.forEach((name) => {
        rows.push({
          name: splitFullName(name).fullName,
          game: result,
          points: calculateSingleGamePoints(result, name, side.key)
        });
      });
    });
  });
  if (!rows.length) return { points: 0, rows: [] };
  const max = Math.max(...rows.map((row) => row.points));
  return { points: max, rows: rows.filter((row) => row.points === max) };
}

function uniquePlayersInResults(results = []) {
  const players = new Map();
  results.forEach((result) => {
    [...(result.team_a_players || []), ...(result.team_b_players || [])].forEach((name) => {
      const fullName = splitFullName(name).fullName;
      if (fullName) players.set(normalizeName(fullName), fullName);
    });
  });
  return [...players.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function monthlySummaryData(month) {
  const results = monthResults(state.results.length ? state.results : fallbackResults, month);
  const statsRows = sortStatsRows(calculatePlayerStats(results), "overall");
  const uniquePlayers = uniquePlayersInResults(results);
  const totalGoals = results.reduce((sum, result) => sum + Number(result.team_a_score || 0) + Number(result.team_b_score || 0), 0);
  const byGoals = [...results].sort((a, b) =>
    (Number(b.team_a_score || 0) + Number(b.team_b_score || 0)) -
    (Number(a.team_a_score || 0) + Number(a.team_b_score || 0))
  );
  const byMargin = [...results].sort((a, b) =>
    Math.abs(Number(b.team_a_score || 0) - Number(b.team_b_score || 0)) -
    Math.abs(Number(a.team_a_score || 0) - Number(a.team_b_score || 0)) ||
    (Number(b.team_a_score || 0) + Number(b.team_b_score || 0)) -
    (Number(a.team_a_score || 0) + Number(a.team_b_score || 0))
  );
  const byClosest = [...results].sort((a, b) =>
    Math.abs(Number(a.team_a_score || 0) - Number(a.team_b_score || 0)) -
    Math.abs(Number(b.team_a_score || 0) - Number(b.team_b_score || 0)) ||
    (Number(b.team_a_score || 0) + Number(b.team_b_score || 0)) -
    (Number(a.team_a_score || 0) + Number(a.team_b_score || 0))
  );
  const singleGame = highestSingleGamePoints(results);
  const player = statsRows[0] || null;
  return {
    month,
    results,
    statsRows,
    totalGames: results.length,
    totalGoals,
    differentPlayers: uniquePlayers.length,
    playerNames: uniquePlayers,
    goalsPerGame: results.length ? totalGoals / results.length : 0,
    highestScoringGame: byGoals[0] || null,
    lowestScoringGame: byGoals.at(-1) || null,
    biggestWin: byMargin[0] || null,
    closestGame: byClosest[0] || null,
    playerOfMonth: player,
    mostAppearances: tiedNames(statsRows, "appearances"),
    mostGoals: tiedNames(statsRows, "goals"),
    mostAssists: tiedNames(statsRows, "assists"),
    mostContributions: tiedNames(statsRows, "goalContributions"),
    highestSingleGame: singleGame,
    top10: statsRows.slice(0, 10)
  };
}

function renderNameList(names = []) {
  return names.length ? names.map(escapeHtml).join(", ") : "None";
}

function renderAdminMonthlySummary() {
  const select = el("adminMonthlySummarySelect");
  const output = el("adminMonthlySummary");
  if (!select || !output) return;
  const months = availableResultMonths(state.results || []);
  if (!select.value) {
    select.innerHTML = `${months.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(monthLabel(key))}</option>`).join("")}<option value="all">All-Time</option>`;
    select.value = months.includes(currentMonthKey()) ? currentMonthKey() : months[0] || "";
  } else {
    const current = select.value;
    select.innerHTML = `${months.map((key) => `<option value="${escapeHtml(key)}" ${current === key ? "selected" : ""}>${escapeHtml(monthLabel(key))}</option>`).join("")}<option value="all" ${current === "all" ? "selected" : ""}>All-Time</option>`;
  }
  const month = select.value || months[0] || "";
  if (!month) {
    output.innerHTML = "<p class=\"empty-note\">No match results yet.</p>";
    return;
  }
  const summary = monthlySummaryData(month);
  const highGame = summary.highestSingleGame.rows.map((row) => `${row.name} (${row.points} pts, ${formatResultLabel(row.game)})`);
  output.innerHTML = `
    <div class="monthly-summary-grid">
      <article><span>Games</span><strong>${summary.totalGames}</strong></article>
      <article><span>Players</span><strong>${summary.differentPlayers}</strong></article>
      <article><span>Total goals</span><strong>${summary.totalGoals}</strong></article>
      <article><span>Goals/game</span><strong>${formatRate(summary.goalsPerGame)}</strong></article>
      <article><span>${summary.month === "all" ? "Top all-time player" : "Player of the Month"}</span><strong>${summary.playerOfMonth ? escapeHtml(summary.playerOfMonth.name) : "None"}</strong></article>
      <article><span>Highest scoring</span><strong>${escapeHtml(formatResultLabel(summary.highestScoringGame))}</strong></article>
      <article><span>Lowest scoring</span><strong>${escapeHtml(formatResultLabel(summary.lowestScoringGame))}</strong></article>
      <article><span>Biggest win margin</span><strong>${escapeHtml(formatResultLabel(summary.biggestWin))}</strong></article>
      <article><span>Closest game</span><strong>${escapeHtml(formatResultLabel(summary.closestGame))}</strong></article>
    </div>
    <div class="monthly-summary-lists">
      <p><strong>Highest single-game points:</strong> ${escapeHtml(highGame.join(", ") || "None")}</p>
      <p><strong>Most appearances:</strong> ${renderNameList(summary.mostAppearances)}</p>
      <p><strong>Most goals:</strong> ${renderNameList(summary.mostGoals)}</p>
      <p><strong>Most assists:</strong> ${renderNameList(summary.mostAssists)}</p>
      <p><strong>Most G+A:</strong> ${renderNameList(summary.mostContributions)}</p>
    </div>
    <table class="monthly-summary-table">
      <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>Apps</th><th>W</th><th>D</th><th>G</th><th>A</th><th>G+A</th><th>Win %</th></tr></thead>
      <tbody>
        ${summary.top10.map((row, index) => `
          <tr><td>${index + 1}</td><td>${escapeHtml(row.name)}</td><td>${row.points}</td><td>${row.appearances}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.goals}</td><td>${row.assists}</td><td>${row.goalContributions}</td><td>${formatPercent(row.winPct)}</td></tr>
        `).join("") || "<tr><td colspan=\"10\">No player stats yet.</td></tr>"}
      </tbody>
    </table>
  `;
}

function csvCell(value) {
  const raw = String(value ?? "");
  return /[",\n]/.test(raw) ? `"${raw.replaceAll("\"", "\"\"")}"` : raw;
}

function downloadTextFile(filename, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function monthlySummaryCsv(month) {
  const summary = monthlySummaryData(month);
  const highGame = summary.highestSingleGame.rows.map((row) => `${row.name} - ${row.points} pts - ${formatResultLabel(row.game)}`).join("; ");
  const lines = [
    ["AES FC Monthly Summary", monthLabel(month)],
    [],
    ["Month overview"],
    ["Total games played", summary.totalGames],
    ["Different players", summary.differentPlayers],
    ["Total goals scored", summary.totalGoals],
    ["Goals per game", formatRate(summary.goalsPerGame)],
    ["Highest-scoring game", formatResultLabel(summary.highestScoringGame)],
    ["Lowest-scoring game", formatResultLabel(summary.lowestScoringGame)],
    ["Biggest win margin", formatResultLabel(summary.biggestWin)],
    ["Closest game", formatResultLabel(summary.closestGame)],
    [],
    ["Player highlights"],
    ["Player of the Month", summary.playerOfMonth?.name || ""],
    ["Most appearances", summary.mostAppearances.join("; ")],
    ["Most goals", summary.mostGoals.join("; ")],
    ["Most assists", summary.mostAssists.join("; ")],
    ["Most G+A", summary.mostContributions.join("; ")],
    ["Highest individual points in a single game", highGame],
    [],
    ["Top 10 players"],
    ["Rank", "Player", "Pts", "Apps", "W", "D", "L", "G", "A", "G+A", "G/game", "A/game", "Win %"],
    ...summary.top10.map((row, index) => [
      index + 1,
      row.name,
      row.points,
      row.appearances,
      row.wins,
      row.draws,
      row.losses,
      row.goals,
      row.assists,
      row.goalContributions,
      formatRate(row.goalsPerGame),
      formatRate(row.assistsPerGame),
      formatPercent(row.winPct)
    ])
  ];
  return lines.map((row) => row.map(csvCell).join(",")).join("\n");
}

function downloadMonthlySummary() {
  const month = el("adminMonthlySummarySelect")?.value || currentMonthKey();
  const filename = `aes-fc-${month === "all" ? "all-time" : month}-summary.csv`;
  downloadTextFile(filename, monthlySummaryCsv(month));
  setMessage(el("adminMessage"), "Monthly summary downloaded.");
}

function renderPlayerStats(results) {
  const mode = state.statsMode || "overall";
  const months = availableStatsMonths(results);
  const scopedResults = selectedStatsResults(results);
  const isAllTime = state.statsMonth === "all";
  const minimumWinAppearances = isAllTime ? 5 : 3;
  const allStats = calculatePlayerStats(scopedResults);
  const stats = statsRowsForMode(scopedResults, mode, minimumWinAppearances);
  const movement = playerStatsMovement(scopedResults, mode, minimumWinAppearances);
  const tabs = [
    ["overall", "Overall"],
    ["scorers", "Top Scorer"],
    ["assists", "Top Assist"],
    ["wins", "Win %"]
  ];
  const controlsMarkup = `
    <div class="stats-controls">
      <label>Stats period
        <select id="statsMonthSelect">
          ${months.map((key) => `<option value="${escapeHtml(key)}" ${state.statsMonth === key ? "selected" : ""}>${escapeHtml(monthLabel(key))}</option>`).join("")}
          <option value="all" ${state.statsMonth === "all" ? "selected" : ""}>All-Time</option>
        </select>
      </label>
      <div class="stats-tabs" role="tablist" aria-label="Player stat rankings">
        ${tabs.map(([key, label]) => `
          <button class="${key === mode ? "active" : ""}" type="button" data-stats-mode="${key}" role="tab" aria-selected="${key === mode ? "true" : "false"}">${label}</button>
        `).join("")}
      </div>
    </div>
  `;
  const tableMarkup = (rows) => `
    <table class="stats-table">
      <thead><tr><th>#</th><th></th><th>Player</th><th>Pts</th><th>Form</th><th>Win %</th><th>Apps</th><th>W</th><th>D</th><th>G</th><th>A</th><th>G+A</th><th>G/game</th><th>A/game</th></tr></thead>
      <tbody>
        ${rows.map((row, index) => {
          const flag = nationalityFlag(nationalityForName(row.name));
          return `
          <tr class="${!isAllTime && index < 3 ? `podium-row podium-${index + 1}` : ""}">
            <td class="rank-cell">${!isAllTime && index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</td>
            <td class="move-cell">${renderRankMovement(movement.get(row.name))}</td>
            <td class="player-cell ${flag ? "has-flag" : ""}" style="${flag ? `--player-flag: '${flag}'` : ""}"><strong>${escapeHtml(row.name)}</strong></td>
            <td><strong>${row.points}</strong></td>
            <td>${renderFormPills(row.form)}</td>
            <td>${formatPercent(row.winPct)}</td>
            <td>${row.appearances}</td>
            <td>${row.wins}</td>
            <td>${row.draws}</td>
            <td>${row.goals}</td>
            <td>${row.assists}</td>
            <td>${row.goalContributions}</td>
            <td>${formatRate(row.goalsPerGame)}</td>
            <td>${formatRate(row.assistsPerGame)}</td>
          </tr>
        `; }).join("")}
      </tbody>
    </table>
  `;
  const emptyText = mode === "wins" && allStats.length
    ? `No players have ${minimumWinAppearances} appearances yet for this ${isAllTime ? "all-time" : "monthly"} Win % table.`
    : `No player stats yet for ${monthLabel(state.statsMonth)}.`;
  el("playerStatsTable").innerHTML = stats.length ? `
    ${controlsMarkup}
    ${tableMarkup(stats.slice(0, 10))}
    ${isAllTime && stats.length > 10 ? `
      <details class="stats-expand">
        <summary>Expand full stats list</summary>
        ${tableMarkup(stats)}
      </details>
    ` : ""}
  ` : `${controlsMarkup}<p class="empty-note">${escapeHtml(emptyText)}</p>`;
}

function playerStatsMovement(results = [], mode = "overall", minimumWinAppearances = 5) {
  const counted = results.filter(shouldCountStatsResult).sort((a, b) =>
    new Date(b.game_date) - new Date(a.game_date) || new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const latest = counted[0];
  if (!latest) return new Map();
  const previousStats = statsRowsForMode(results.filter((result) => result !== latest), mode, minimumWinAppearances);
  const currentStats = statsRowsForMode(results, mode, minimumWinAppearances);
  const previousRanks = new Map(previousStats.map((row, index) => [row.name, index + 1]));
  const movement = new Map();
  currentStats.forEach((row, index) => {
    const previousRank = previousRanks.get(row.name);
    const currentRank = index + 1;
    if (!previousRank) {
      movement.set(row.name, { direction: "same", delta: 0 });
      return;
    }
    if (currentRank < previousRank) movement.set(row.name, { direction: "up", delta: previousRank - currentRank });
    else if (currentRank > previousRank) movement.set(row.name, { direction: "down", delta: currentRank - previousRank });
    else movement.set(row.name, { direction: "same", delta: 0 });
  });
  return movement;
}

function renderRankMovement(movement) {
  if (!movement || movement.direction === "same") return "<span class=\"rank-move same\" aria-label=\"same rank\">–</span>";
  if (movement.direction === "up") return `<span class="rank-move up" aria-label="moved up">▲ ${movement.delta}</span>`;
  if (movement.direction === "down") return `<span class="rank-move down" aria-label="moved down">▼ ${movement.delta}</span>`;
  return "<span class=\"rank-move same\" aria-label=\"same rank\">–</span>";
}

function renderResultCard(result) {
  const winner = resultWinner(result);
  const hasStats = resultHasIndividualStats(result);
  const teamAStatus = winner === "draw" ? "draw" : winner === "a" ? "winner" : "";
  const teamBStatus = winner === "draw" ? "draw" : winner === "b" ? "winner" : "";
  return `
    <article class="result-card match-graphic-card">
      <div class="result-score-block">
        <span class="result-date">${escapeHtml(formatResultDate(result.game_date))}</span>
        <strong class="result-score">${escapeHtml(result.team_a_score)}-${escapeHtml(result.team_b_score)}</strong>
        ${hasStats ? "" : "<small>No individual stats available</small>"}
      </div>
      <div class="result-summary-teams">
        ${renderResultTeamCompact(result.team_a_players || [], teamAStatus, result)}
        ${renderResultTeamCompact(result.team_b_players || [], teamBStatus, result)}
      </div>
      ${renderResultExtras(result)}
    </article>
  `;
}

function renderResultRow(result) {
  const hasStats = resultHasIndividualStats(result);
  const winner = resultWinner(result);
  const winnerText = winner === "draw" ? "Draw" : winner === "a" ? "Side 1 won" : "Side 2 won";
  return `
    <article class="result-row simple-result-row">
      <strong>
        ${escapeHtml(formatResultDate(result.game_date))}
        ${hasStats ? "" : "<small>No individual stats available</small>"}
      </strong>
      <b>${escapeHtml(result.team_a_score)}-${escapeHtml(result.team_b_score)}</b>
      <span class="result-outcome">${escapeHtml(winnerText)}</span>
      <span class="result-side">${renderResultPlayers(result.team_a_players || [], result, true)}</span>
      <span class="result-side">${renderResultPlayers(result.team_b_players || [], result, true)}</span>
      ${renderResultExtras(result, true)}
    </article>
  `;
}

function renderResultTeamCompact(players = [], status = "", result = null) {
  return `
    <div class="result-team-compact ${status}">
      <ul>${renderResultPlayers(players, result, true)}</ul>
    </div>
  `;
}

function renderResultTeam(players = [], status = "", result = null, abbreviate = false) {
  const label = status === "winner" ? "WINNERS" : status === "draw" ? "DRAW" : "Players";
  return `
    <div class="result-team ${status}">
      <span>${label}</span>
      <p>${renderResultPlayers(players, result, abbreviate)}</p>
    </div>
  `;
}

function displayResultName(name, abbreviate = false) {
  if (!abbreviate) return name;
  const player = splitFullName(name);
  return player.lastName ? `${player.firstName} ${player.lastName.charAt(0)}.` : player.firstName;
}

function renderResultPlayers(players = [], result = null, abbreviate = false) {
  const hasStats = result && resultHasIndividualStats(result);
  const orderedPlayers = result ? sortPlayersByContribution(players, result) : sortPlayerNames(players);
  return orderedPlayers.map((name) => {
    const displayName = displayResultName(name, abbreviate);
    if (!hasStats) return `<li><span>${escapeHtml(displayName)}</span></li>`;
    const stats = resultStats(result, name);
    return `
      <li>
        <span>${escapeHtml(displayName)}</span>
        ${renderResultStatIcons(stats)}
      </li>
    `;
  }).join("");
}

function renderResultStatIcons(stats = {}) {
  const goals = Math.max(0, Number(stats.goals || 0));
  const assists = Math.max(0, Number(stats.assists || 0));
  const icons = [
    goals ? `<span class="goal-icons" aria-label="${goals} goals">${"⚽".repeat(goals)}</span>` : "",
    assists ? `<span class="assist-icons" aria-label="${assists} assists">${Array.from({ length: assists }, () => "<b>🅰️</b>").join("")}</span>` : ""
  ].filter(Boolean).join("");
  return icons ? `<span class="result-stat-icons">${icons}</span>` : "";
}

function sortPlayersByContribution(players = [], result = null) {
  return [...players].filter(Boolean).sort((a, b) => {
    const aStats = resultStats(result, a);
    const bStats = resultStats(result, b);
    const aContribution = aStats.goals + aStats.assists;
    const bContribution = bStats.goals + bStats.assists;
    return bContribution - aContribution ||
      bStats.goals - aStats.goals ||
      a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

function renderResultExtras(result, compact = false) {
  const flow = String(result.game_flow || "").trim();
  const photoA = String(result.team_a_photo_url || "").trim();
  const photoB = String(result.team_b_photo_url || "").trim();
  if (!flow && !photoA && !photoB) return "";
  const summary = photoA || photoB ? "View team photos" : "View details";
  return `
    <details class="${compact ? "result-extras compact-result-extras" : "result-extras"}">
      <summary>${summary}</summary>
      <div>
        ${photoA || photoB ? `
          <div class="result-team-photos">
            ${photoA ? `<a href="${escapeHtml(photoA)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(photoA)}" alt="Side 1 team photo"></a>` : ""}
            ${photoB ? `<a href="${escapeHtml(photoB)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(photoB)}" alt="Side 2 team photo"></a>` : ""}
          </div>
        ` : ""}
        ${flow ? `<p><strong>Flow:</strong> ${escapeHtml(flow)}</p>` : ""}
      </div>
    </details>
  `;
}

function formatResultDate(dateString) {
  return fmtDate.format(new Date(`${dateString}T12:00:00+02:00`));
}

function formatShortResultDate(dateString) {
  return fmtShortResult.format(new Date(`${dateString}T12:00:00+02:00`));
}

function renderRules() {
  const paragraphs = String(state.settings.rules_text || DEFAULT_RULES_TEXT)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const rulesTitle = String(state.settings.rules_title || "").trim();
  el("rulesTitle").textContent = !rulesTitle || rulesTitle.toLowerCase() === "signup rules" ? "Before You Sign Up" : rulesTitle;
  const intro = paragraphs.slice(0, 2);
  const rest = paragraphs.slice(2);
  el("rulesText").innerHTML = `
    <div class="rules-intro">
      ${intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </div>
    ${rest.length ? `
      <details class="rules-drawer">
        <summary>Full signup guidelines</summary>
        <div class="rules-full">
          ${rest.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
        </div>
      </details>
    ` : ""}
  `;
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
  if (el("photoCounter")) el("photoCounter").textContent = `Photo ${state.photoIndex + 1} of ${photos.length}`;
}

function renderLists() {
  const playing = state.signups.filter((s) => s.status === "Playing");
  const subs = state.signups.filter((s) => s.status === "Sub");
  el("playingCount").textContent = playing.length;
  el("subsCount").textContent = subs.length;
  el("playingList").innerHTML = playing.map(renderPublicSignup).join("") || "<li class=\"empty-list-item\">No players yet</li>";
  el("subsList").innerHTML = subs.map(renderPublicSignup).join("") || "<li class=\"empty-list-item\">No subs yet</li>";
}

function renderGameSelector() {
  const wrap = el("gameSelectWrap");
  const select = el("gameSelect");
  const listWrap = el("listGameSelectWrap");
  const listSelect = el("listGameSelect");
  if (!wrap || !select) return;
  const games = state.publicGames?.length ? state.publicGames : state.games || [];
  wrap.classList.toggle("hidden", games.length <= 1);
  const options = games.map((game) => {
    const start = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
    const label = `${fmtShortGame.format(start)}, ${formatClock(game.start_time).replace(":00 ", "")} - ${game.location_name || "AES FC"}`;
    return `<option value="${escapeHtml(game.id)}">${escapeHtml(label)}</option>`;
  }).join("");
  select.innerHTML = options;
  if (state.game?.id) select.value = state.game.id;
  if (listWrap && listSelect) {
    listWrap.classList.toggle("hidden", games.length < 1);
    listSelect.innerHTML = options;
    if (state.game?.id) listSelect.value = state.game.id;
  }
}

function renderPublicSignup(signup) {
  const signedBy = signup.signed_up_by || String(signup.comments || "").match(/^Signed up by (.+)\.$/i)?.[1];
  const flag = nationalityFlag(signupNationality(signup));
  return `
    <li class="${flag ? "has-flag" : ""}" style="${flag ? `--player-flag: '${flag}'` : ""}">
      <strong>${escapeHtml(signup.first_name)} ${escapeHtml(signup.last_name || "")}</strong>
      <span class="meta">
        <span>${fmtTime.format(new Date(signup.created_at))}</span>
        ${signedBy ? `<span class="signup-note">signed up by ${escapeHtml(signedBy)}</span>` : ""}
      </span>
    </li>
  `;
}

function renderSheetStatus() {
  const game = state.game;
  const heroGame = nextDisplayGame();
  if (!game || !heroGame) {
    el("gameDate").textContent = "Connect Supabase to load the next game";
    el("listGameSummary").textContent = "Connect Supabase";
    el("openSignupCount").textContent = "";
    el("sheetStatus").classList.remove("hidden");
    el("sheetStatus").textContent = "The site is ready. Connect Supabase to activate live signups.";
    return;
  }
  const heroStart = new Date(zagrebDateTime(heroGame.game_date, String(heroGame.start_time || "21:00").slice(0, 5)));
  const dateText = fmtDate.format(heroStart);
  const timeText = `${formatClock(heroGame.start_time)} - ${formatClock(heroGame.end_time)}`;
  const locationText = heroGame.location_name || "NK Bili As ADB Pitch";
  const locationUrl = heroGame.location_url || MAP_URL;
  el("gameDate").textContent = dateText;
  el("gameTime").textContent = timeText;
  el("gameLocation").textContent = locationText;
  el("gameLocation").href = locationUrl;
  const gameStart = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
  el("listGameSummary").textContent = `${fmtShortGame.format(gameStart)}, ${formatClock(game.start_time).replace(":00 ", "")}`;
  const visibleGames = state.publicGames?.length ? state.publicGames : state.games || [];
  const openCount = visibleGames.filter(isGameOpen).length;
  const upcomingCount = visibleGames.length;
  const countText = openCount || upcomingCount;
  el("openSignupCount").textContent = countText === 1
    ? `${openCount ? "Open: 1" : "Upcoming: 1"}`
    : `${openCount ? "Open" : "Upcoming"}: ${countText}`;
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

function calendarDateValue(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function calendarEventDetails(game = state.game) {
  const start = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
  const end = new Date(zagrebDateTime(game.game_date, String(game.end_time || "22:00").slice(0, 5)));
  return {
    title: "AES FC football",
    start,
    end,
    location: game.location_name || "NK Bili As ADB Pitch",
    description: `AES FC weekly football. Location: ${game.location_url || MAP_URL}`
  };
}

function buildIcsContent(game = state.game) {
  const details = calendarEventDetails(game);
  const escapeIcs = (value) => String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AES FC//Weekly Football//EN",
    "BEGIN:VEVENT",
    `UID:aesfc-${game.game_date}@aesfc-split`,
    `DTSTAMP:${calendarDateValue(new Date())}`,
    `DTSTART:${calendarDateValue(details.start)}`,
    `DTEND:${calendarDateValue(details.end)}`,
    `SUMMARY:${escapeIcs(details.title)}`,
    `LOCATION:${escapeIcs(details.location)}`,
    `DESCRIPTION:${escapeIcs(details.description)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function googleCalendarUrl(game = state.game) {
  const details = calendarEventDetails(game);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: details.title,
    dates: `${calendarDateValue(details.start)}/${calendarDateValue(details.end)}`,
    location: details.location,
    details: details.description
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderCalendarActions(game = state.game) {
  const wrap = el("calendarActions");
  if (!wrap || !game) return;
  const blob = new Blob([buildIcsContent(game)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const fileDate = String(game.game_date || "aesfc-game").replaceAll("-", "");
  wrap.innerHTML = `
    <a class="secondary calendar-button" href="${url}" download="aes-fc-${escapeHtml(fileDate)}.ics">Add to Calendar</a>
    <a class="secondary calendar-button" href="${escapeHtml(googleCalendarUrl(game))}" target="_blank" rel="noreferrer">Open in Google Calendar</a>
  `;
  wrap.classList.remove("hidden");
}

function showLiveToast(message) {
  const toast = el("liveToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(state.liveToastTimer);
  state.liveToastTimer = setTimeout(() => toast.classList.add("hidden"), 5200);
}

async function refreshAfterRealtimeChange(messageBuilder) {
  await loadPublicState();
  const playingCount = state.signups.filter((signup) => signup.status === "Playing").length;
  showLiveToast(messageBuilder(playingCount));
  if (state.adminPassword === ADMIN_PASSWORD && !el("adminTools").classList.contains("hidden")) {
    await loadAdmin();
  }
}

function setupRealtime() {
  if (!db || !state.game?.id) return;
  if (state.realtimeChannel && state.realtimeGameId === state.game.id) return;
  if (state.realtimeChannel) db.removeChannel(state.realtimeChannel);
  state.realtimeGameId = state.game.id;
  state.realtimeChannel = db
    .channel(`aesfc-signups-${state.game.id}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "aesfc_signups",
      filter: `game_id=eq.${state.game.id}`
    }, async (payload) => {
      const name = signupFullName(payload.new);
      if (payload.new?.comments === "Guaranteed signup") {
        await loadPublicState();
        return;
      }
      await refreshAfterRealtimeChange((playingCount) => `${name} signed up - ${playingCount}/12 spots filled`);
    })
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "aesfc_signups",
      filter: `game_id=eq.${state.game.id}`
    }, async (payload) => {
      if (!payload.new?.cancelled_at || payload.old?.cancelled_at) return;
      const name = signupFullName(payload.new);
      await refreshAfterRealtimeChange((playingCount) => `${name} cancelled - ${playingCount}/12 spots filled`);
    })
    .subscribe();
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
    return;
  }
  state.game = await getCurrentGame();
  await ensureOrganizerSignups(state.game);
  state.signups = await loadSignups(state.game.id);
  state.cancelledSignups = await loadCancelledSignups(state.game.id);
  state.photos = await loadPhotos();
  state.settings = await loadSettings();
  state.regulars = await loadRegulars();
  state.playerProfiles = await loadPlayerProfiles();
  state.results = await loadResults();
  renderSheetStatus();
  renderGameSelector();
  renderPhotos();
  renderLists();
  renderResults();
  renderRules();
  renderPlayerSelectors();
  renderCancelSelector();
  setupRealtime();
}

async function selectPublicGame(gameId) {
  const selected = (state.publicGames?.length ? state.publicGames : state.games || []).find((game) => game.id === gameId);
  if (!selected) return;
  state.game = { ...selected, is_open: isGameOpen(selected) };
  await ensureOrganizerSignups(state.game);
  state.signups = await loadSignups(state.game.id);
  state.cancelledSignups = await loadCancelledSignups(state.game.id);
  renderSheetStatus();
  renderGameSelector();
  renderLists();
  renderPlayerSelectors();
  renderCancelSelector();
  setupRealtime();
}

function renderPlayerSelectors() {
  const signedUpNames = currentSignupNameSet();
  const availableRegulars = state.regulars.filter((regular) => !signedUpNames.has(normalizeName(regular.full_name)));
  const allowGuest = guestSignupAllowed();
  document.querySelectorAll(".player-select").forEach((select) => {
    const current = select.value;
    select.innerHTML = `
      <option value="">Choose a player</option>
      ${availableRegulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
      ${allowGuest ? "<option value=\"__manual\">Not listed - enter manually</option>" : ""}
    `;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
  renderSignupPriorityNote();
  renderResponsibleSelector();
  toggleManualName();
  toggleResponsiblePlayer();
  renderExtraPlayerFields();
  renderCancelSelector();
}

function renderResponsibleSelector() {
  const select = el("responsiblePlayerSelect");
  if (!select) return;
  const current = select.value;
  const allowGuest = guestSignupAllowed();
  select.innerHTML = `
    <option value="">Choose your name</option>
    ${state.regulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
    ${allowGuest ? "<option value=\"__manual\">Not listed - enter manually</option>" : ""}
  `;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renderSignupPriorityNote() {
  const note = el("signupPriorityNote");
  if (!note) return;
  if (!state.game) {
    note.textContent = "";
    return;
  }
  const delayHours = Number(state.game.guest_delay_hours ?? 24);
  note.textContent = delayHours <= 0
    ? "Guests allowed."
    : guestSignupAllowed()
    ? "Guests allowed."
    : "Guests open after 24h.";
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

function selectedIsManual(selectName) {
  return document.querySelector(`[name="${selectName}"]`)?.value === "__manual";
}

function toggleResponsiblePlayer() {
  const signingForSelf = document.querySelector("[name='signup_for_self']")?.checked !== false;
  el("responsiblePlayerWrap").classList.toggle("hidden", signingForSelf);
  const responsibleSelect = el("responsiblePlayerSelect");
  el("responsibleManualWrap").classList.toggle("hidden", responsibleSelect.value !== "__manual" || signingForSelf);
}

function signedByComment(name) {
  return name ? `Signed up by ${name}.` : null;
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
  el("calendarActions").classList.add("hidden");
  el("calendarActions").innerHTML = "";
  setMessage(message, "Submitting...");
  const formData = new FormData(form);
  if (String(formData.get("signup_password") || "") !== SIGNUP_PASSWORD) {
    setMessage(message, "Wrong signup password.", true);
    return;
  }
  try {
    const game = state.game || await getCurrentGame();
    const playerCount = Number(formData.get("player_count") || 1);
    const allowGuest = guestSignupAllowed(game);
    const mainName = selectedName("full_name_select", "full_name_manual");
    const extraNames = getExtraPlayerNames();
    const signingForSelf = form.querySelector("[name='signup_for_self']")?.checked !== false;
    const responsibleName = signingForSelf
      ? splitFullName(mainName).fullName
      : splitFullName(selectedName("responsible_player_select", "responsible_player_manual")).fullName;
    const requestedNames = [mainName, ...extraNames].map((name) => splitFullName(name).fullName).filter(Boolean);
    const manualGuestRequested = selectedIsManual("full_name_select") || selectedIsManual("responsible_player_select") || Array.from({ length: Math.max(0, playerCount - 1) }, (_, index) => selectedIsManual(`extra_player_${index + 1}_select`)).some(Boolean);
    const signedUpNames = currentSignupNameSet();
    const alreadySignedUp = requestedNames.find((name) => signedUpNames.has(normalizeName(name)));
    const duplicateInRequest = requestedNames.find((name, index) => requestedNames.findIndex((other) => normalizeName(other) === normalizeName(name)) !== index);
    if (manualGuestRequested && !allowGuest) {
      throw new Error("First 24 hours are for players on the list only. Guest/manual names open after the priority window.");
    }
    if (!isAllowedSignupName(mainName, allowGuest)) {
      throw new Error(allowGuest ? "Please choose or enter your full first and last name." : "Please choose a player from the regulars list during the first 24 hours.");
    }
    if (!responsibleName || !isAllowedSignupName(responsibleName, allowGuest)) {
      throw new Error(signingForSelf ? "Please choose or enter your full first and last name." : "Please choose your own name as the person responsible for this signup.");
    }
    if (playerCount > 1 && extraNames.length < playerCount - 1) {
      throw new Error("Please choose or enter the full name of each extra player.");
    }
    const invalidExtra = extraNames.find((name) => !isAllowedSignupName(name, allowGuest));
    if (invalidExtra) {
      throw new Error(allowGuest ? `Please use a full first and last name for ${invalidExtra}.` : `${invalidExtra} is not on the regulars list. Guest/manual names open after the first 24 hours.`);
    }
    if (alreadySignedUp) {
      throw new Error(`${alreadySignedUp} is already signed up for this game.`);
    }
    if (duplicateInRequest) {
      throw new Error(`${duplicateInRequest} is listed more than once in this signup.`);
    }
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
      nationality: nationalityForName(mainName),
      email: "not-collected@aesfc.local",
      phone: "not collected",
      comments: signingForSelf ? null : signedByComment(responsibleName),
      signed_up_by: signingForSelf ? null : responsibleName,
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
        nationality: nationalityForName(name),
        email: "not-collected@aesfc.local",
        phone: "not collected",
        comments: signedByComment(responsibleName),
        signed_up_by: responsibleName,
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
    renderCalendarActions(game);
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
  if (!doubleConfirm(`Cancel signup for ${signupFullName(signup)}?`)) {
    setMessage(message, "");
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
    const allowGuest = guestSignupAllowed();
    select.innerHTML = `
      <option value="">Choose a player</option>
      ${availableRegulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
      ${allowGuest ? "<option value=\"__manual\">Not listed - enter manually</option>" : ""}
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
  await loadUpcomingGames();
  renderAdminGame(state.game);
  state.signups = await loadSignups(state.game.id);
  state.cancelledSignups = await loadCancelledSignups(state.game.id);
  state.photos = await loadPhotos();
  state.settings = await loadSettings();
  state.regulars = await loadRegulars();
  state.playerProfiles = await loadPlayerProfiles();
  state.results = await loadResults();
  renderAdminSignups(state.signups);
  renderAdminCancellations(state.cancelledSignups);
  renderAdminPhotos(state.photos);
  renderAdminSettings();
  renderAdminRegulars();
  renderAdminProfiles();
  renderResultForm();
  renderAdminResults();
  renderAdminPlayerMonthTool();
  renderAdminMonthlySummary();
  renderPlayerSelectors();
}

function renderAdminGame(game) {
  if (!game) return;
  const gameStart = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
  el("adminCurrentGame").textContent = `Editing signup for: ${fmtShortGame.format(gameStart)} · ${formatClock(game.start_time).replace(":00 ", "")}`;
  const form = el("gameForm");
  form.game_date.value = game.game_date || "";
  form.start_time.value = String(game.start_time || "21:00").slice(0, 5);
  form.end_time.value = String(game.end_time || "22:00").slice(0, 5);
  form.signup_opens_at.value = toDatetimeLocalValue(game.signup_opens_at, game.game_date);
  form.signup_open_now.checked = false;
  form.guest_delay_24h.checked = Number(game.guest_delay_hours ?? 24) > 0;
  form.is_recurring.checked = game.is_recurring !== false;
  form.location_name.value = game.location_name || "NK Bili As ADB Pitch";
  form.location_url.value = game.location_url || MAP_URL;
  updateSignupOpenMode(form);

  const newForm = el("newGameForm");
  const defaultGame = getDefaultGameWindow();
  newForm.game_date.value = defaultGame.game_date;
  newForm.start_time.value = defaultGame.start_time;
  newForm.end_time.value = defaultGame.end_time;
  newForm.signup_opens_at.value = toDatetimeLocalValue(defaultGame.signup_opens_at, defaultGame.game_date);
  newForm.signup_open_now.checked = false;
  newForm.guest_delay_24h.checked = true;
  newForm.is_recurring.checked = false;
  newForm.location_name.value = game.location_name || defaultGame.location_name;
  newForm.location_url.value = game.location_url || defaultGame.location_url;
  updateSignupOpenMode(newForm);
  renderAdminGamesList();
}

function updateSignupOpenMode(form) {
  if (!form?.signup_opens_at || !form.signup_open_now) return;
  const openNow = form.signup_open_now.checked;
  form.signup_opens_at.disabled = openNow;
  form.signup_opens_at.required = !openNow;
}

function renderAdminGamesList() {
  const node = el("adminGamesList");
  if (!node) return;
  const games = state.games || [];
  node.innerHTML = games.length ? games.map((game) => {
    const start = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
    const isCurrent = String(game.id) === String(state.game?.id);
    return `
      <div class="admin-game-row">
        <div>
          <strong>${escapeHtml(fmtShortGame.format(start))}, ${escapeHtml(formatClock(game.start_time).replace(":00 ", ""))}</strong>
          <small>${escapeHtml(game.location_name || "AES FC")}${isCurrent ? " · Main signup game" : ""}</small>
        </div>
        <div class="admin-game-actions">
          <button class="secondary compact" type="button" data-edit-game="${escapeHtml(game.id)}">Edit</button>
          <button class="icon-button" type="button" data-remove-game="${escapeHtml(game.id)}">Remove</button>
        </div>
      </div>
    `;
  }).join("") : "<p>No upcoming games found.</p>";
}

function applyDefaultSignupOpen(form) {
  const gameDate = form?.game_date?.value;
  if (form?.signup_open_now?.checked) return;
  if (!gameDate || !form.signup_opens_at) return;
  form.signup_opens_at.value = toDatetimeLocalValue(signupOpenForGame(gameDate), gameDate);
}

function renderAdminSettings() {
  const form = el("settingsForm");
  form.rules_title.value = state.settings.rules_title || DEFAULT_RULES_TITLE;
  form.rules_text.value = state.settings.rules_text || DEFAULT_RULES_TEXT;
}

function renderAdminPlayerMonthTool() {
  const select = el("adminPlayerMonthSelect");
  if (!select) return;
  const months = availableStatsMonths(state.results || []);
  const selected = state.statsMonth && state.statsMonth !== "all" ? state.statsMonth : months[0] || currentMonthKey();
  select.innerHTML = months.map((key) => `
    <option value="${escapeHtml(key)}" ${selected === key ? "selected" : ""}>${escapeHtml(monthLabel(key))}</option>
  `).join("");
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
  const selects = (team) => Array.from({ length: RESULT_PLAYERS_PER_SIDE }, (_, index) => `
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
  el("resultFlowEditor").innerHTML = renderFlowEditor("game_flow_step");
}

function resultOptionsHtml(selectedName = "") {
  return resultPlayerOptions().map((name) => (
    `<option value="${escapeHtml(name)}" ${name === selectedName ? "selected" : ""}>${escapeHtml(name)}</option>`
  )).join("");
}

function updateResultManualVisibility() {
  el("resultForm").querySelectorAll(".result-player-row").forEach((row) => {
    const select = row.querySelector("select");
    row.querySelector(".result-manual").classList.toggle("hidden", select.value !== "__manual");
  });
}

function updateSavedResultManualVisibility() {
  el("adminResults").querySelectorAll(".saved-player-row").forEach((row) => {
    const select = row.querySelector("select");
    row.querySelector(".saved-result-manual").classList.toggle("hidden", select.value !== "__manual");
  });
}

function selectedResultName(formData, team, index) {
  const selected = String(formData.get(`${team}_player_${index}_select`) || "").trim();
  if (selected !== "__manual") return selected;
  return String(formData.get(`${team}_player_${index}_manual`) || "").trim();
}

function flowSteps(flow = "") {
  return String(flow || "")
    .split(/\s*(?:→|->|>|,|\n)\s*/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function renderFlowEditor(prefix, flow = "") {
  const steps = flowSteps(flow);
  return Array.from({ length: 14 }, (_, index) => `
    <label>Score ${index + 1}
      <input name="${prefix}_${index + 1}" value="${escapeHtml(steps[index] || "")}" placeholder="${index === 0 ? "1-0" : ""}">
    </label>
  `).join("");
}

function collectFlowFromNode(node, prefix) {
  return Array.from({ length: 14 }, (_, index) => node.querySelector(`[name="${prefix}_${index + 1}"]`)?.value || "")
    .map((step) => step.trim())
    .filter(Boolean)
    .join(" → ");
}

function renderAdminResults() {
  const results = state.results.length ? state.results : fallbackResults;
  el("adminResults").innerHTML = results.map((result) => `
    <details class="admin-result" data-result-row="${result.id}">
      <summary>
        <strong>${escapeHtml(formatShortResultDate(result.game_date))}</strong>
        <span>${escapeHtml(result.team_a_score)}-${escapeHtml(result.team_b_score)}</span>
      </summary>
      <p class="admin-help-text">Edit scores, teams, goals, assists, or match flow. Click “Update published result” when done.</p>
      <details class="form-subdrawer">
        <summary>Match details</summary>
        <div class="result-edit-grid">
          <label>Date<input name="result_game_date" type="date" value="${escapeHtml(result.game_date)}"></label>
          <label>Side 1 score<input name="result_team_a_score" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(result.team_a_score)}"></label>
          <label>Side 2 score<input name="result_team_b_score" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(result.team_b_score)}"></label>
          <label>Side 1 team photo
            ${result.team_a_photo_url ? `<img class="result-photo-preview" src="${escapeHtml(result.team_a_photo_url)}" alt="Side 1 team photo">` : ""}
            <input name="result_team_a_photo_existing" type="hidden" value="${escapeHtml(result.team_a_photo_url || "")}">
            <input name="result_team_a_photo_file" type="file" accept="image/*">
          </label>
          <label>Side 2 team photo
            ${result.team_b_photo_url ? `<img class="result-photo-preview" src="${escapeHtml(result.team_b_photo_url)}" alt="Side 2 team photo">` : ""}
            <input name="result_team_b_photo_existing" type="hidden" value="${escapeHtml(result.team_b_photo_url || "")}">
            <input name="result_team_b_photo_file" type="file" accept="image/*">
          </label>
        </div>
      </details>
      <details class="flow-drawer">
        <summary>Add/edit flow of the match</summary>
        <div class="flow-editor">${renderFlowEditor("result_flow_step", result.game_flow || "")}</div>
      </details>
      ${renderAdminResultTeam("Side 1", "team_a", result.team_a_players || [], result)}
      ${renderAdminResultTeam("Side 2", "team_b", result.team_b_players || [], result)}
      <div class="admin-result-actions">
        ${String(result.id).startsWith("fallback-") ? "" : `<button class="secondary compact" type="button" data-graphic-result="${result.id}">Create match graphic</button>`}
        ${String(result.id).startsWith("fallback-") ? "" : `<button class="secondary compact" type="button" data-save-result="${result.id}">Update published result</button>`}
        ${String(result.id).startsWith("fallback-") ? "" : `<button class="icon-button" type="button" data-remove-result="${result.id}">Remove</button>`}
      </div>
    </details>
  `).join("");
  updateSavedResultManualVisibility();
}

function renderAdminResultTeam(label, team, players, result) {
  const rows = [...sortPlayerNames(players)];
  while (rows.length < RESULT_PLAYERS_PER_SIDE) rows.push("");
  const regularNames = resultPlayerOptions();
  return `
    <details class="form-subdrawer saved-result-team">
      <summary>${label} players and stats</summary>
      ${rows.slice(0, RESULT_PLAYERS_PER_SIDE).map((player, index) => {
        const stats = player ? resultStats(result, player) : { goals: 0, assists: 0 };
        const isRegular = regularNames.includes(player);
        return `
          <div class="saved-player-row">
            <label>Player ${index + 1}
              <select name="${team}_saved_player_${index + 1}_select" data-saved-result-player-select>
                <option value="">Choose player</option>
                ${resultOptionsHtml(isRegular ? player : "")}
                <option value="__manual" ${player && !isRegular ? "selected" : ""}>Not listed - enter manually</option>
              </select>
            </label>
            <label class="saved-result-manual hidden">Manual name
              <input name="${team}_saved_player_${index + 1}_manual" value="${escapeHtml(player && !isRegular ? player : "")}" placeholder="Full name">
            </label>
            <label>Goals<input name="${team}_saved_goals_${index + 1}" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${stats.goals}"></label>
            <label>Assists<input name="${team}_saved_assists_${index + 1}" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${stats.assists}"></label>
          </div>
        `;
      }).join("")}
    </details>
  `;
}

function renderAdminSignups(signups) {
  el("adminSignups").innerHTML = `
    <table>
      <thead><tr><th>Status</th><th>Edit player name</th><th>Nationality</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${signups.map((s) => `
          <tr data-admin-row="${s.id}">
            <td>${escapeHtml(s.status)} #${s.position}</td>
            <td>
              <input name="full_name" value="${escapeHtml(signupFullName(s))}" aria-label="Player full name">
            </td>
            <td>
              <input name="nationality" value="${escapeHtml(signupNationality(s))}" placeholder="Croatia" aria-label="Nationality">
            </td>
            <td><small>${escapeHtml(s.signed_up_by ? `Signed up by ${s.signed_up_by}` : s.comments || "Self signup")}</small></td>
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
      <input name="regular_nationality" value="${escapeHtml(regular.nationality || "")}" placeholder="Nationality" aria-label="Regular player nationality">
      <label class="toggle-row"><input name="regular_guaranteed" type="checkbox" ${regular.guaranteed_signup ? "checked" : ""}> Guaranteed</label>
      <button class="secondary compact" type="button" data-save-regular="${regular.id}">Save</button>
      <button class="icon-button" type="button" data-remove-regular="${regular.id}">Remove</button>
    </div>
  `).join("") || "<p>No regular names yet.</p>";
}

function profileTagsFor(profile = {}) {
  return profile?.profile_tags && typeof profile.profile_tags === "object" ? profile.profile_tags : {};
}

function renderProfileTagControls(tags = {}) {
  return PLAYER_ATTRIBUTE_TAGS.map(([key, label]) => `
    <label>${escapeHtml(label)}
      <select name="profile_tag_${escapeHtml(key)}">
        <option value="" ${!tags[key] ? "selected" : ""}>Neutral</option>
        <option value="strength" ${tags[key] === "strength" ? "selected" : ""}>Strength</option>
        <option value="weakness" ${tags[key] === "weakness" ? "selected" : ""}>Weakness</option>
      </select>
    </label>
  `).join("");
}

function collectProfileTags(row) {
  const tags = {};
  PLAYER_ATTRIBUTE_TAGS.forEach(([key]) => {
    const value = row.querySelector(`[name="profile_tag_${key}"]`)?.value || "";
    if (value) tags[key] = value;
  });
  return tags;
}

function adminProfileRows() {
  const rows = new Map();
  state.regulars.forEach((regular) => {
    const fullName = splitFullName(regular.full_name).fullName;
    if (!fullName) return;
    rows.set(normalizeName(fullName), {
      full_name: fullName,
      nationality: regular.nationality || "",
      profile_tags: {}
    });
  });
  state.playerProfiles.forEach((profile) => {
    const fullName = splitFullName(profile.full_name).fullName;
    if (!fullName) return;
    const existing = rows.get(normalizeName(fullName)) || {};
    rows.set(normalizeName(fullName), {
      ...existing,
      ...profile,
      full_name: fullName,
      profile_tags: profileTagsFor(profile)
    });
  });
  return [...rows.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" }));
}

function renderAdminProfiles() {
  const node = el("adminProfiles");
  if (!node) return;
  const profiles = adminProfileRows();
  node.innerHTML = profiles.map((profile) => `
    <details class="admin-player-profile" data-profile-row="${escapeHtml(profile.id || "")}">
      <summary>
        <strong>${escapeHtml(profile.full_name)}</strong>
        <span>${profile.id ? "Saved profile" : "Not saved yet"}</span>
      </summary>
      <div class="profile-editor">
        <div class="profile-basics">
          <label>Full name<input name="profile_full_name" value="${escapeHtml(profile.full_name)}" aria-label="Player profile full name"></label>
          <label>Nationality<input name="profile_nationality" value="${escapeHtml(profile.nationality || "")}" placeholder="Croatia" aria-label="Player profile nationality"></label>
        </div>
        <div class="profile-tags-grid">
          ${renderProfileTagControls(profileTagsFor(profile))}
        </div>
        <div class="profile-actions">
          <button class="secondary compact" type="button" data-save-profile-key="${escapeHtml(profile.id || "new")}">Save profile</button>
          ${profile.id ? `<button class="icon-button" type="button" data-remove-profile="${profile.id}">Remove</button>` : ""}
        </div>
      </div>
    </details>
  `).join("") || "<p>No player profiles yet.</p>";
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
  const formData = new FormData(form);
  const fullName = String(formData.get("regular_name") || "").trim();
  const nationality = String(formData.get("regular_nationality") || "").trim();
  if (!splitFullName(fullName).fullName) {
    setMessage(el("adminMessage"), "Please enter a player name.", true);
    return;
  }
  try {
    assertAdmin();
    const { error } = await db.from("aesfc_regulars").upsert({
      full_name: splitFullName(fullName).fullName,
      nationality,
      is_active: true,
      sort_order: 100 + state.regulars.length
    }, { onConflict: "full_name" });
    if (error) throw error;
    await upsertPlayerProfile(fullName, nationality);
    form.reset();
    setMessage(el("adminMessage"), "Regular player added.");
    state.regulars = await loadRegulars();
    state.playerProfiles = await loadPlayerProfiles();
    renderAdminRegulars();
    renderAdminProfiles();
    renderPlayerSelectors();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function upsertPlayerProfile(fullName, nationality, profileTags = null) {
  const cleanName = splitFullName(fullName).fullName;
  const cleanNationality = String(nationality || "").trim();
  if (!cleanName) return;
  const payload = {
    full_name: cleanName,
    nationality: cleanNationality
  };
  if (profileTags) payload.profile_tags = profileTags;
  const { error } = await db.from("aesfc_player_profiles").upsert(payload, { onConflict: "full_name" });
  if (error) throw error;
}

async function addProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const fullName = String(data.get("profile_name") || "").trim();
  const nationality = String(data.get("profile_nationality") || "").trim();
  if (!splitFullName(fullName).fullName) {
    setMessage(el("adminMessage"), "Please enter a player name.", true);
    return;
  }
  try {
    assertAdmin();
    await upsertPlayerProfile(fullName, nationality);
    form.reset();
    setMessage(el("adminMessage"), "Player profile saved.");
    state.playerProfiles = await loadPlayerProfiles();
    renderAdminProfiles();
    renderResults();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function saveGameDetails(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    assertAdmin();
    const gameDate = String(data.get("game_date") || "");
    const openNow = data.get("signup_open_now") === "on";
    const updated = {
      game_date: gameDate,
      start_time: data.get("start_time"),
      end_time: data.get("end_time"),
      location_name: data.get("location_name"),
      location_url: data.get("location_url"),
      signup_opens_at: openNow ? new Date().toISOString() : datetimeLocalToZagreb(data.get("signup_opens_at")) || signupOpenForGame(gameDate),
      is_recurring: data.get("is_recurring") === "on",
      guest_delay_hours: data.get("guest_delay_24h") === "on" ? 24 : 0
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
    const selectedGame = (state.games || []).find((game) => String(game.id) === String(saved.id));
    state.game = { ...(selectedGame || saved), is_open: isGameOpen(selectedGame || saved) };
    await loadAdmin();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function addGame(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    assertAdmin();
    const gameDate = String(data.get("game_date") || "");
    const openNow = data.get("signup_open_now") === "on";
    const game = {
      game_date: gameDate,
      start_time: data.get("start_time"),
      end_time: data.get("end_time"),
      location_name: data.get("location_name"),
      location_url: data.get("location_url"),
      signup_opens_at: openNow ? new Date().toISOString() : datetimeLocalToZagreb(data.get("signup_opens_at")) || signupOpenForGame(gameDate),
      is_recurring: data.get("is_recurring") === "on",
      guest_delay_hours: data.get("guest_delay_24h") === "on" ? 24 : 0
    };
    const { data: saved, error } = await db
      .from("aesfc_games")
      .upsert(game, { onConflict: "game_date" })
      .select()
      .single();
    if (error) throw error;
    form.reset();
    setMessage(el("adminMessage"), "Game added. If multiple games are upcoming, players can choose which one to sign up for.");
    await loadPublicState();
    state.game = { ...saved, is_open: isGameOpen(saved) };
    await loadAdmin();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function removeGame(gameId) {
  const game = (state.games || []).find((item) => String(item.id) === String(gameId));
  if (!game) throw new Error("Could not find that game.");
  const { count, error: countError } = await db
    .from("aesfc_signups")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (countError) throw countError;
  const label = `${fmtDate.format(new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5))))} at ${formatClock(game.start_time)}`;
  const warning = count
    ? `Remove ${label}?\n\nThis game has ${count} signup(s). Removing it will also remove those signup records.`
    : `Remove ${label}?`;
  if (!doubleConfirm(warning)) return;
  const { error } = await db.from("aesfc_games").delete().eq("id", gameId);
  if (error) throw error;
  setMessage(el("adminMessage"), "Game removed.");
}

async function selectAdminGame(gameId) {
  const game = (state.games || []).find((item) => String(item.id) === String(gameId));
  if (!game) throw new Error("Could not find that game.");
  state.game = { ...game, is_open: isGameOpen(game) };
  state.signups = await loadSignups(state.game.id);
  state.cancelledSignups = await loadCancelledSignups(state.game.id);
  renderAdminGame(state.game);
  renderAdminSignups(state.signups);
  renderAdminCancellations(state.cancelledSignups);
  renderPlayerSelectors();
  renderCancelSelector();
  setMessage(el("adminMessage"), "Now editing selected game.");
}

function getResultTeam(formData, team) {
  return Array.from({ length: RESULT_PLAYERS_PER_SIDE }, (_, index) => selectedResultName(formData, team, index + 1))
    .filter(Boolean);
}

function getResultPlayerStats(formData, team, players) {
  return players.reduce((stats, name) => {
    const index = Array.from({ length: RESULT_PLAYERS_PER_SIDE }, (_, i) => i + 1)
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
  for (let index = 1; index <= RESULT_PLAYERS_PER_SIDE; index += 1) {
    const selectValue = row.querySelector(`[name="${team}_saved_player_${index}_select"]`)?.value || "";
    const manualValue = row.querySelector(`[name="${team}_saved_player_${index}_manual"]`)?.value || "";
    const name = splitFullName(selectValue === "__manual" ? manualValue : selectValue).fullName;
    if (!name) continue;
    players.push(name);
    stats[name] = {
      goals: Number(row.querySelector(`[name="${team}_saved_goals_${index}"]`)?.value || 0),
      assists: Number(row.querySelector(`[name="${team}_saved_assists_${index}"]`)?.value || 0)
    };
  }
  return { players: sortPlayerNames(players), stats };
}

async function resultPhotoFromFormData(formData, fieldName) {
  const file = formData.get(fieldName);
  if (file && file.size) return fileToCompressedDataUrl(file);
  return "";
}

async function resultPhotoFromRow(row, fileFieldName, existingFieldName) {
  const file = row.querySelector(`[name="${fileFieldName}"]`)?.files?.[0];
  if (file && file.size) return fileToCompressedDataUrl(file);
  return row.querySelector(`[name="${existingFieldName}"]`)?.value || "";
}

async function saveExistingResult(resultId) {
  const row = [...document.querySelectorAll("[data-result-row]")]
    .find((node) => node.dataset.resultRow === resultId);
  if (!row) throw new Error("Result row not found. Refresh the dashboard and try again.");
  const teamA = collectSavedResultTeam(row, "team_a");
  const teamB = collectSavedResultTeam(row, "team_b");
  if (!teamA.players.length || !teamB.players.length) throw new Error("Saved results need players on both sides.");
  setMessage(el("adminMessage"), "Saving result...");
  const { error } = await db.from("aesfc_results").update({
    game_date: row.querySelector("[name='result_game_date']").value,
    team_a_score: Number(row.querySelector("[name='result_team_a_score']").value || 0),
    team_b_score: Number(row.querySelector("[name='result_team_b_score']").value || 0),
    team_a_players: teamA.players,
    team_b_players: teamB.players,
    player_stats: { ...teamA.stats, ...teamB.stats },
    game_flow: collectFlowFromNode(row, "result_flow_step"),
    team_a_photo_url: await resultPhotoFromRow(row, "result_team_a_photo_file", "result_team_a_photo_existing"),
    team_b_photo_url: await resultPhotoFromRow(row, "result_team_b_photo_file", "result_team_b_photo_existing")
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
    setMessage(el("adminMessage"), "Preparing result...");
    const { error } = await db.from("aesfc_results").upsert({
      game_date: data.get("game_date"),
      team_a_players: sortPlayerNames(teamA),
      team_b_players: sortPlayerNames(teamB),
      team_a_score: Number(data.get("team_a_score")),
      team_b_score: Number(data.get("team_b_score")),
      game_flow: collectFlowFromNode(form, "game_flow_step"),
      team_a_photo_url: await resultPhotoFromFormData(data, "team_a_photo_file"),
      team_b_photo_url: await resultPhotoFromFormData(data, "team_b_photo_file"),
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
    setMessage(el("adminMessage"), "Signup text saved.");
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
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

function trackerNames() {
  return trackerNameGroups().all;
}

function trackerNameGroups() {
  const signedUpNames = state.signups
    .map((signup) => signupFullName(signup))
    .map((name) => splitFullName(name).fullName)
    .filter(Boolean);
  const signedUpSet = new Set(signedUpNames.map(normalizeName));
  const remainingNames = state.regulars
    .map((regular) => splitFullName(regular.full_name).fullName)
    .filter((name) => name && !signedUpSet.has(normalizeName(name)));
  const signed = sortPlayerNames(signedUpNames.filter((name, index, all) =>
    all.findIndex((other) => normalizeName(other) === normalizeName(name)) === index
  ));
  const rest = sortPlayerNames([...new Set(remainingNames)]).filter((name) =>
    !signedUpSet.has(normalizeName(name))
  );
  const all = [
    ...signedUpNames,
    ...rest
  ].filter((name, index, all) => all.findIndex((other) => normalizeName(other) === normalizeName(name)) === index);
  return { signed, rest, all };
}

function trackerLocalKey(gameDate = state.tracker.gameDate || state.game?.game_date || "current") {
  return `${TRACKER_LOCAL_PREFIX}${gameDate}`;
}

function firstNameLabel(fullName) {
  return splitFullName(fullName).firstName || splitFullName(fullName).fullName;
}

function isTrackerOwnGoal(value = "") {
  return String(value).startsWith(TRACKER_OWN_GOAL);
}

function trackerNameLabel(fullName) {
  if (isTrackerOwnGoal(fullName)) return "Own goal";
  const player = splitFullName(fullName);
  const allPlayers = [...state.tracker.teamA, ...state.tracker.teamB].map(splitFullName);
  const duplicateFirstName = allPlayers.filter((other) =>
    other.firstName && other.firstName.toLocaleLowerCase() === player.firstName.toLocaleLowerCase()
  ).length > 1;
  if (!duplicateFirstName) return player.firstName || player.fullName;
  const lastInitial = player.lastName ? ` ${player.lastName.charAt(0).toLocaleUpperCase()}.` : "";
  return `${player.firstName}${lastInitial}`.trim() || player.fullName;
}

function trackerDraftPayload(status = "active") {
  return {
    gameDate: state.tracker.gameDate,
    teamA: state.tracker.teamA,
    teamB: state.tracker.teamB,
    events: state.tracker.events,
    started: state.tracker.started,
    status,
    updatedAt: new Date().toISOString()
  };
}

function applyTrackerDraft(draft = {}) {
  state.tracker = {
    gameDate: draft.gameDate || state.game?.game_date || getDefaultGameWindow().game_date,
    teamA: Array.isArray(draft.teamA) ? draft.teamA : [],
    teamB: Array.isArray(draft.teamB) ? draft.teamB : [],
    events: Array.isArray(draft.events) ? draft.events : [],
    pendingTeam: null,
    editingIndex: null,
    pendingScorer: "",
    pendingAssist: "",
    lastSavedAt: draft.updatedAt || "",
    saveStatus: draft.updatedAt ? `Recovered draft saved at ${new Date(draft.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "",
    unsavedChanges: false,
    started: Boolean(draft.started)
  };
}

function loadLocalTrackerDraft(gameDate) {
  try {
    const raw = localStorage.getItem(trackerLocalKey(gameDate));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadRemoteTrackerDraft(gameDate) {
  if (!db || !gameDate) return null;
  try {
    const { data, error } = await db
      .from(TRACKER_DRAFT_TABLE)
      .select("*")
      .eq("game_date", gameDate)
      .eq("is_finished", false)
      .maybeSingle();
    if (error) throw error;
    return data?.draft_data ? { ...data.draft_data, updatedAt: data.updated_at || data.draft_data.updatedAt } : null;
  } catch {
    return null;
  }
}

async function saveTrackerDraft(status = "Saved") {
  const draft = trackerDraftPayload(status === "Finished" ? "finished" : "active");
  state.tracker.unsavedChanges = true;
  state.tracker.saveStatus = `${status}: saving...`;
  renderTrackerSaveStatus();
  let savedLocally = false;
  let savedOnline = false;
  try {
    localStorage.setItem(trackerLocalKey(draft.gameDate), JSON.stringify(draft));
    savedLocally = true;
    state.tracker.lastSavedAt = draft.updatedAt;
    state.tracker.unsavedChanges = false;
    state.tracker.saveStatus = `✓ ${status} on this device at ${new Date(draft.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderTrackerSaveStatus();
  } catch {
    state.tracker.saveStatus = "⚠ Not saved. Do not close this tracker.";
    renderTrackerSaveStatus(true);
    return { local: false, online: false };
  }

  if (!db || !draft.gameDate) return { local: savedLocally, online: false };
  if (!navigator.onLine) {
    state.tracker.saveStatus = `⚠ ${status} on this device only. No internet connection.`;
    renderTrackerSaveStatus(true);
    return { local: savedLocally, online: false };
  }
  try {
    const { error } = await db.from(TRACKER_DRAFT_TABLE).upsert({
      game_date: draft.gameDate,
      draft_data: draft,
      is_finished: draft.status === "finished",
      updated_at: new Date().toISOString()
    }, { onConflict: "game_date" });
    if (error) throw error;
    savedOnline = true;
    state.tracker.saveStatus = `✓ ${status} online at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderTrackerSaveStatus();
  } catch {
    state.tracker.saveStatus = `⚠ ${status} on this device only. Online draft sync failed.`;
    renderTrackerSaveStatus(true);
  }
  return { local: savedLocally, online: savedOnline };
}

function clearTrackerDraft(gameDate = state.tracker.gameDate) {
  try {
    localStorage.removeItem(trackerLocalKey(gameDate));
  } catch {
    // Local storage may be unavailable in private browser modes.
  }
}

function renderTrackerTeamSelects() {
  const groups = trackerNameGroups();
  const signedOptions = groups.signed.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  const restOptions = groups.rest.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  const rows = (team) => Array.from({ length: TRACKER_PLAYERS_PER_SIDE }, (_, index) => `
    <div class="tracker-team-row">
      <label>Player ${index + 1}
        <select name="tracker_${team}_${index + 1}" data-tracker-player-select>
          <option value="">Choose signed-up player</option>
          ${signedOptions}
          <option value="__more">Expand more players</option>
          <option value="__manual">Manual name</option>
        </select>
      </label>
      <label class="tracker-more-wrap hidden">More players
        <select name="tracker_${team}_${index + 1}_more" data-tracker-more-select>
          <option value="">Choose player</option>
          ${restOptions}
          <option value="__manual">Manual name</option>
        </select>
      </label>
      <label class="tracker-manual-wrap hidden">Manual full name
        <input name="tracker_${team}_${index + 1}_manual" placeholder="First and last name">
      </label>
    </div>
  `).join("");
  el("trackerTeamA").innerHTML = rows("a");
  el("trackerTeamB").innerHTML = rows("b");
  updateTrackerTeamPickerVisibility();
}

function updateTrackerTeamPickerVisibility() {
  document.querySelectorAll(".tracker-team-row").forEach((row) => {
    const select = row.querySelector("[data-tracker-player-select]");
    const moreWrap = row.querySelector(".tracker-more-wrap");
    const moreSelect = row.querySelector("[data-tracker-more-select]");
    const manualWrap = row.querySelector(".tracker-manual-wrap");
    const showMore = select.value === "__more";
    const showManual = select.value === "__manual" || (showMore && moreSelect?.value === "__manual");
    moreWrap.classList.toggle("hidden", !showMore);
    manualWrap.classList.toggle("hidden", !showManual);
  });
}

function selectedTrackerName(team, index) {
  const main = document.querySelector(`[name="tracker_${team}_${index}"]`)?.value || "";
  if (main && main !== "__more" && main !== "__manual") return main;
  if (main === "__more") {
    const more = document.querySelector(`[name="tracker_${team}_${index}_more"]`)?.value || "";
    if (more && more !== "__manual") return more;
  }
  if (main === "__manual" || main === "__more") {
    return document.querySelector(`[name="tracker_${team}_${index}_manual"]`)?.value || "";
  }
  return "";
}

function trackerGoalMinute() {
  const game = state.game || getDefaultGameWindow();
  const gameDate = state.tracker.gameDate || game.game_date;
  const startTime = String(game.start_time || "21:00").slice(0, 5);
  const start = new Date(zagrebDateTime(gameDate, startTime));
  const minute = Math.floor((Date.now() - start.getTime()) / 60000);
  return Math.max(0, Math.min(60, minute));
}

function collectTrackerTeam(team) {
  return Array.from({ length: TRACKER_PLAYERS_PER_SIDE }, (_, index) =>
    splitFullName(selectedTrackerName(team, index + 1)).fullName
  ).filter(Boolean);
}

async function openTracker() {
  assertAdmin();
  const game = state.game || getDefaultGameWindow();
  const gameStart = new Date(zagrebDateTime(game.game_date, String(game.start_time || "21:00").slice(0, 5)));
  el("trackerGameTitle").textContent = `${fmtShortGame.format(gameStart)} · ${formatClock(game.start_time).replace(":00 ", "")}`;
  state.tracker = {
    gameDate: game.game_date,
    teamA: [],
    teamB: [],
      events: [],
      pendingTeam: null,
      editingIndex: null,
      pendingScorer: "",
      pendingAssist: "",
      lastSavedAt: "",
      saveStatus: "",
      unsavedChanges: false,
      started: false
    };
  renderTrackerTeamSelects();
  const localDraft = loadLocalTrackerDraft(game.game_date);
  const remoteDraft = await loadRemoteTrackerDraft(game.game_date);
  const draft = [localDraft, remoteDraft]
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
  if (draft?.events?.length || draft?.started) {
    const savedAt = draft.updatedAt ? ` from ${new Date(draft.updatedAt).toLocaleString()}` : "";
    if (window.confirm(`Resume unfinished live tracker${savedAt}?`)) {
      applyTrackerDraft(draft);
    }
  }
  renderTracker();
  el("liveTracker").classList.remove("hidden");
}

async function closeTracker() {
  if (state.tracker.started || state.tracker.events.length) {
    const result = await saveTrackerDraft("Close saved");
    if (!result.local && !doubleConfirm("Close tracker without a saved draft?")) return;
    if (result.local && !result.online && navigator.onLine) {
      window.alert("Tracker draft is saved on this device, but it did not sync online. Do not clear browser data before publishing.");
    }
  }
  el("liveTracker").classList.add("hidden");
}

async function startTrackerGame() {
  const teamA = collectTrackerTeam("a");
  const teamB = collectTrackerTeam("b");
  const duplicates = teamA.find((name) => teamB.map(normalizeName).includes(normalizeName(name))) ||
    [...teamA, ...teamB].find((name, index, all) => all.findIndex((other) => normalizeName(other) === normalizeName(name)) !== index);
  if (!teamA.length || !teamB.length) {
    setMessage(el("trackerSetupMessage"), "Choose players for both sides before tracking starts.", true);
    return;
  }
  if (duplicates) {
    setMessage(el("trackerSetupMessage"), `${duplicates} is selected more than once.`, true);
    return;
  }
  state.tracker.teamA = teamA;
  state.tracker.teamB = teamB;
  state.tracker.started = true;
  state.tracker.pendingScorer = "";
  state.tracker.pendingAssist = "";
  setMessage(el("trackerSetupMessage"), "");
  renderTracker();
  await saveTrackerDraft("Teams saved");
}

function trackerTeamPlayers(team) {
  return team === "a" ? state.tracker.teamA : state.tracker.teamB;
}

function trackerScore(events = state.tracker.events) {
  return events.reduce((score, event) => {
    score[event.team] += 1;
    return score;
  }, { a: 0, b: 0 });
}

function scoreAfterEvent(index, events = state.tracker.events) {
  return trackerScore(events.slice(0, index + 1));
}

function openTrackerGoal(team, editIndex = null) {
  const event = editIndex === null ? null : state.tracker.events[editIndex];
  state.tracker.pendingTeam = team;
  state.tracker.editingIndex = editIndex;
  state.tracker.pendingScorer = event?.scorer || "";
  state.tracker.pendingAssist = event?.assist || "";
  el("trackerGoalTitle").textContent = `${editIndex === null ? "Add" : "Edit"} goal for ${team === "a" ? "Side 1" : "Side 2"}`;
  el("trackerGoalForm").classList.remove("hidden");
  el("trackerMainActions").classList.add("hidden");
  renderTrackerGoalButtons();
}

function renderTrackerGoalButtons() {
  const players = sortPlayerNames(trackerTeamPlayers(state.tracker.pendingTeam));
  const ownGoalValue = `${TRACKER_OWN_GOAL}_${state.tracker.pendingTeam || ""}`;
  el("trackerScorerButtons").innerHTML = `
    <button class="tracker-player-button own-goal${state.tracker.pendingScorer === ownGoalValue ? " selected" : ""}" type="button" data-tracker-scorer="${escapeHtml(ownGoalValue)}">
      Own goal
    </button>
    ${players.map((name) => `
    <button class="tracker-player-button${state.tracker.pendingScorer === name ? " selected" : ""}" type="button" data-tracker-scorer="${escapeHtml(name)}">
      ${escapeHtml(trackerNameLabel(name))}
    </button>
    `).join("")}
  `;
  const assistPlayers = isTrackerOwnGoal(state.tracker.pendingScorer)
    ? []
    : players.filter((name) => name !== state.tracker.pendingScorer);
  el("trackerAssistButtons").innerHTML = `
    <button class="tracker-player-button no-assist${state.tracker.pendingAssist === "" ? " selected" : ""}" type="button" data-tracker-assist="">
      No assist
    </button>
    ${assistPlayers.map((name) => `
      <button class="tracker-player-button${state.tracker.pendingAssist === name ? " selected" : ""}" type="button" data-tracker-assist="${escapeHtml(name)}">
        ${escapeHtml(trackerNameLabel(name))}
      </button>
    `).join("")}
  `;
}

async function saveTrackerGoal() {
  const team = state.tracker.pendingTeam;
  const scorer = state.tracker.pendingScorer;
  const assist = isTrackerOwnGoal(scorer) ? "" : state.tracker.pendingAssist;
  if (!team || !scorer) {
    setMessage(el("trackerMessage"), "Choose the scorer before saving the goal.", true);
    return;
  }
  const nextEvents = [...state.tracker.events];
  const previousEvent = state.tracker.editingIndex === null ? null : state.tracker.events[state.tracker.editingIndex];
  const event = { team, scorer, assist, minute: previousEvent?.minute ?? trackerGoalMinute() };
  if (state.tracker.editingIndex === null) nextEvents.push(event);
  else nextEvents[state.tracker.editingIndex] = event;
  state.tracker.events = nextEvents;
  state.tracker.pendingTeam = null;
  state.tracker.editingIndex = null;
  state.tracker.pendingScorer = "";
  state.tracker.pendingAssist = "";
  el("trackerGoalForm").classList.add("hidden");
  setMessage(el("trackerMessage"), "");
  renderTracker();
  await saveTrackerDraft("Goal saved");
}

function cancelTrackerGoal() {
  if ((state.tracker.pendingScorer || state.tracker.pendingAssist || state.tracker.editingIndex !== null) &&
    !doubleConfirm("Cancel this goal entry?")) return;
  state.tracker.pendingTeam = null;
  state.tracker.editingIndex = null;
  state.tracker.pendingScorer = "";
  state.tracker.pendingAssist = "";
  el("trackerGoalForm").classList.add("hidden");
  el("trackerMainActions").classList.remove("hidden");
}

async function undoTrackerGoal() {
  if (!state.tracker.events.length) return;
  if (!doubleConfirm("Undo the last goal?")) return;
  state.tracker.events.pop();
  renderTracker();
  await saveTrackerDraft("Undo saved");
}

function renderTrackerEvents() {
  const events = state.tracker.events;
  el("trackerEvents").innerHTML = events.length ? events.map((event, index) => {
    const score = scoreAfterEvent(index);
    return `
      <div class="tracker-event">
        <strong>${Number.isFinite(event.minute) ? `${event.minute}' · ` : ""}${score.a}-${score.b}</strong>
        <span>${escapeHtml(trackerNameLabel(event.scorer))}${event.assist ? `, assist ${escapeHtml(trackerNameLabel(event.assist))}` : ", no assist"}</span>
        <button class="secondary compact" type="button" data-edit-tracker-goal="${index}">Edit</button>
      </div>
    `;
  }).join("") : "<p class=\"empty-note\">No goals tracked yet.</p>";
}

function renderTrackerSaveStatus(isError = false) {
  const node = el("trackerSaveStatus");
  if (!node) return;
  node.textContent = state.tracker.saveStatus || "";
  node.classList.toggle("error", Boolean(isError));
}

function updateTrackerConnectivityStatus() {
  if (el("liveTracker")?.classList.contains("hidden")) return;
  if (!navigator.onLine) {
    state.tracker.saveStatus = "⚠ You are offline. New tracker changes will save on this device only until internet returns.";
    renderTrackerSaveStatus(true);
    return;
  }
  if (state.tracker.started || state.tracker.events.length) {
    saveTrackerDraft("Connection restored");
  }
}

function renderTracker() {
  el("trackerSetup").classList.toggle("hidden", state.tracker.started);
  el("trackerActive").classList.toggle("hidden", !state.tracker.started);
  el("trackerMainActions").classList.toggle("hidden", Boolean(state.tracker.pendingTeam));
  const score = trackerScore();
  el("trackerScoreA").textContent = score.a;
  el("trackerScoreB").textContent = score.b;
  renderTrackerEvents();
  renderTrackerSaveStatus();
}

async function finishTrackerGame() {
  try {
    assertAdmin();
    const game = state.game || getDefaultGameWindow();
    if (!state.tracker.teamA.length || !state.tracker.teamB.length) throw new Error("Choose both teams before publishing.");
    if (!window.confirm("Publish this final result and update stats?")) return;
    await saveTrackerDraft("Pre-publish draft saved");
    setMessage(el("trackerMessage"), "Publishing result...");
    const score = trackerScore();
    const flow = state.tracker.events.map((_, index) => {
      const step = scoreAfterEvent(index);
      return `${step.a}-${step.b}`;
    }).join(" → ");
    const stats = {};
    [...state.tracker.teamA, ...state.tracker.teamB].forEach((name) => {
      stats[name] = { goals: 0, assists: 0 };
    });
    state.tracker.events.forEach((event) => {
      if (!isTrackerOwnGoal(event.scorer)) {
        stats[event.scorer] = stats[event.scorer] || { goals: 0, assists: 0 };
        stats[event.scorer].goals += 1;
      }
      if (event.assist) {
        stats[event.assist] = stats[event.assist] || { goals: 0, assists: 0 };
        stats[event.assist].assists += 1;
      }
    });
    const { error } = await db.from("aesfc_results").upsert({
      game_date: game.game_date,
      team_a_players: sortPlayerNames(state.tracker.teamA),
      team_b_players: sortPlayerNames(state.tracker.teamB),
      team_a_score: score.a,
      team_b_score: score.b,
      player_stats: stats,
      game_flow: flow,
      is_active: true
    }, { onConflict: "game_date" });
    if (error) throw error;
    setMessage(el("trackerMessage"), "Game has been saved and published.");
    await saveTrackerDraft("Finished");
    clearTrackerDraft(game.game_date);
    await loadPublicState();
    if (state.adminPassword === ADMIN_PASSWORD && !el("adminTools").classList.contains("hidden")) await loadAdmin();
  } catch (error) {
    setMessage(el("trackerMessage"), error.message, true);
  }
}

function loadGraphicImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((row, index) => ctx.fillText(row, x, y + index * lineHeight));
  return Math.min(lines.length, maxLines) * lineHeight;
}

function graphicPlayerStats(result, name) {
  const stats = resultStats(result, name);
  return `${"⚽".repeat(stats.goals)}${"🅰️".repeat(stats.assists)}`;
}

function graphicShortName(name) {
  const player = splitFullName(name);
  return player.lastName ? `${player.firstName} ${player.lastName.charAt(0)}.` : player.firstName || player.fullName;
}

function fitCanvasText(ctx, text, maxWidth, startSize, minSize, weight = 900) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size >= minSize);
  return minSize;
}

function graphicPitchLabel(name, teamPlayers = []) {
  const player = splitFullName(name);
  const first = player.firstName || player.fullName;
  const duplicateFirst = teamPlayers.filter((other) => {
    const otherPlayer = splitFullName(other);
    return otherPlayer.firstName && player.firstName &&
      otherPlayer.firstName.toLocaleLowerCase() === player.firstName.toLocaleLowerCase();
  }).length > 1;
  return duplicateFirst && player.lastName ? `${first} ${player.lastName.charAt(0)}.` : first;
}

function drawFloodlight(ctx, x, y, radius) {
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, "rgba(255,255,255,.24)");
  light.addColorStop(.34, "rgba(255,255,255,.08)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawGraphicBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#061426");
  bg.addColorStop(.38, "#0b1d33");
  bg.addColorStop(.68, "#071f18");
  bg.addColorStop(1, "#050b12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawFloodlight(ctx, 120, 70, 420);
  drawFloodlight(ctx, width - 120, 70, 420);

  ctx.fillStyle = "rgba(255,255,255,.035)";
  for (let i = -120; i < width; i += 82) {
    ctx.fillRect(i, 0, 38, height);
  }

  const haze = ctx.createLinearGradient(0, 140, 0, 720);
  haze.addColorStop(0, "rgba(255,255,255,.05)");
  haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, 720);
}

function drawGraphicTeamList(ctx, result, players, x, y, width, color) {
  const ordered = sortPlayersByContribution(players, result);
  const rowHeight = Math.max(34, Math.min(48, 298 / Math.max(ordered.length, 1)));
  const nameWidth = width * .55;
  const statsX = x + width * .6;
  ordered.forEach((name, index) => {
    const rowY = y + index * rowHeight;
    const displayName = graphicShortName(name);
    fitCanvasText(ctx, displayName, nameWidth, 35, 24, 900);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(displayName, x, rowY);
    const stats = graphicPlayerStats(result, name);
    if (stats) {
      ctx.fillStyle = color;
      fitCanvasText(ctx, stats, width * .38, 28, 20, 900);
      ctx.fillText(stats, statsX, rowY);
    }
  });
}

function graphicFormationPositions(count, team) {
  const layouts = {
    1: [[.5, .55]],
    2: [[.34, .52], [.66, .52]],
    3: [[.5, .38], [.24, .70], [.76, .70]],
    4: [[.32, .40], [.68, .40], [.32, .76], [.68, .76]],
    5: [[.5, .35], [.22, .60], [.78, .60], [.34, .84], [.66, .84]],
    6: [[.5, .35], [.22, .59], [.78, .59], [.18, .83], [.50, .83], [.82, .83]]
  };
  const base = layouts[Math.min(Math.max(count, 1), 6)] || layouts[6];
  return team === "a" ? base : base.map(([x, y]) => [x, 1 - y]);
}

function strokeGraphicArc(ctx, x, y, radius, startAngle, endAngle) {
  ctx.beginPath();
  ctx.arc(x, y, radius, startAngle, endAngle);
  ctx.stroke();
}

function drawGraphicPitch(ctx, result, x, y, width, height) {
  ctx.save();
  const grass = ctx.createLinearGradient(0, y, 0, y + height);
  grass.addColorStop(0, "#1e8738");
  grass.addColorStop(.5, "#14652c");
  grass.addColorStop(1, "#0d431f");
  ctx.fillStyle = grass;
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fill();

  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.clip();
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.045)";
    ctx.fillRect(x + (width / 10) * i, y, width / 10, height);
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y + height / 2);
  ctx.lineTo(x + width, y + height / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + width / 2, y + height / 2, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height / 2, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.fill();

  const areaWidth = width * .46;
  const sixWidth = areaWidth * .48;
  const penaltyHeight = 136;
  const sixHeight = 58;
  const goalWidth = width * .22;
  ctx.strokeRect(x + (width - areaWidth) / 2, y, areaWidth, penaltyHeight);
  ctx.strokeRect(x + (width - areaWidth) / 2, y + height - penaltyHeight, areaWidth, penaltyHeight);
  ctx.strokeRect(x + (width - sixWidth) / 2, y, sixWidth, sixHeight);
  ctx.strokeRect(x + (width - sixWidth) / 2, y + height - sixHeight, sixWidth, sixHeight);
  ctx.strokeRect(x + (width - goalWidth) / 2, y - 24, goalWidth, 24);
  ctx.strokeRect(x + (width - goalWidth) / 2, y + height, goalWidth, 24);

  strokeGraphicArc(ctx, x, y, 28, 0, Math.PI / 2);
  strokeGraphicArc(ctx, x + width, y, 28, Math.PI / 2, Math.PI);
  strokeGraphicArc(ctx, x, y + height, 28, -Math.PI / 2, 0);
  strokeGraphicArc(ctx, x + width, y + height, 28, Math.PI, Math.PI * 1.5);

  const drawPlayers = (players, team, color) => {
    const ordered = sortPlayersByContribution(players, result).slice(0, 6);
    const halfTop = team === "a" ? y : y + height / 2;
    const positions = graphicFormationPositions(ordered.length, team);
    const radius = ordered.length >= 6 ? 48 : ordered.length >= 4 ? 54 : 62;
    positions.forEach(([relX, relY], index) => {
      const name = ordered[index];
      if (!name) return;
      const px = x + width * relX;
      const py = halfTop + (height / 2) * relY;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = graphicPitchLabel(name, ordered);
      fitCanvasText(ctx, label, radius * 1.55, 28, 17, 900);
      ctx.fillText(label, px, py);
    });
  };
  drawPlayers(result.team_a_players || [], "a", "#0b5fb3");
  drawPlayers(result.team_b_players || [], "b", "#d71f2f");
  ctx.restore();
}

async function createMatchGraphic(resultId) {
  try {
    assertAdmin();
    const result = state.results.find((item) => String(item.id) === String(resultId));
    if (!result) throw new Error("Could not find that match result.");
    setMessage(el("adminMessage"), "Creating match graphic...");

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    drawGraphicBackground(ctx, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 30px Arial, sans-serif";
    ctx.letterSpacing = "6px";
    ctx.fillText(`AES FC • ${formatResultDate(result.game_date).toUpperCase()}`, 540, 94);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = "#fff";
    ctx.font = "900 164px Arial, sans-serif";
    ctx.fillText(`${result.team_a_score} - ${result.team_b_score}`, 540, 260);

    ctx.strokeStyle = "rgba(255,255,255,.24)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(540, 344);
    ctx.lineTo(540, 646);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    drawGraphicTeamList(ctx, result, result.team_a_players || [], 76, 390, 400, "#5bb3ff");
    drawGraphicTeamList(ctx, result, result.team_b_players || [], 612, 390, 400, "#ff5e6b");

    drawGraphicPitch(ctx, result, 70, 690, 940, 1160);

    canvas.toBlob(async (blob) => {
      const filename = `aes-fc-match-graphic-${String(result.game_date).replaceAll("-", "")}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "AES FC match graphic" });
        setMessage(el("adminMessage"), "Graphic ready. Use Save Image from the share sheet to add it to Photos.");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      link.remove();
      setMessage(el("adminMessage"), "Graphic downloaded. On phones, open/share the image and save it to Photos.");
    }, "image/png");
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

function drawStatBox(ctx, label, value, x, y, width, height) {
  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.68)";
  ctx.font = "800 24px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(label.toUpperCase(), x + width / 2, y + 20);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px Arial, sans-serif";
  ctx.fillText(String(value), x + width / 2, y + 56);
  ctx.restore();
}

async function createPlayerOfMonthGraphic(month) {
  assertAdmin();
  const targetMonth = month || state.statsMonth;
  if (!targetMonth || targetMonth === "all") return;
  const player = playerOfMonthRow(state.results || [], targetMonth);
  if (!player) {
    window.alert(`No player stats found for ${monthLabel(targetMonth)} yet.`);
    return;
  }
  const allTime = calculatePlayerStats(state.results || []).find((row) => normalizeName(row.name) === normalizeName(player.name)) || player;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  drawGraphicBackground(ctx, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,.74)";
  ctx.font = "800 38px Arial, sans-serif";
  ctx.fillText("AES FC PLAYER OF THE MONTH", 540, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 78px Arial, sans-serif";
  ctx.fillText(monthLabel(targetMonth).toUpperCase(), 540, 238);

  const gradient = ctx.createLinearGradient(180, 330, 900, 560);
  gradient.addColorStop(0, "#f6c453");
  gradient.addColorStop(.5, "#fff2b7");
  gradient.addColorStop(1, "#d69d22");
  drawRoundedRect(ctx, 120, 318, 840, 300, 34);
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fill();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 5;
  ctx.stroke();

  const flag = nationalityFlag(nationalityForName(player.name));
  if (flag) {
    ctx.globalAlpha = .14;
    ctx.font = "220px Arial, sans-serif";
    ctx.fillText(flag, 800, 475);
    ctx.globalAlpha = 1;
  }
  fitCanvasText(ctx, player.name, 760, 82, 46, 900);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(player.name, 540, 432);
  ctx.fillStyle = "#f6c453";
  ctx.font = "900 64px Arial, sans-serif";
  ctx.fillText(`${player.points} POINTS`, 540, 525);

  const statY = 710;
  const boxW = 250;
  const boxH = 124;
  const gap = 25;
  const startX = 120;
  drawStatBox(ctx, "Apps", player.appearances, startX, statY, boxW, boxH);
  drawStatBox(ctx, "Win %", formatPercent(player.winPct), startX + boxW + gap, statY, boxW, boxH);
  drawStatBox(ctx, "Goals", player.goals, startX + (boxW + gap) * 2, statY, boxW, boxH);
  drawStatBox(ctx, "Assists", player.assists, startX, statY + boxH + gap, boxW, boxH);
  drawStatBox(ctx, "G/game", formatRate(player.goalsPerGame), startX + boxW + gap, statY + boxH + gap, boxW, boxH);
  drawStatBox(ctx, "A/game", formatRate(player.assistsPerGame), startX + (boxW + gap) * 2, statY + boxH + gap, boxW, boxH);

  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = "800 34px Arial, sans-serif";
  ctx.fillText("MONTH FORM", 540, 1075);
  const form = player.form;
  const pillGap = form.length > 12 ? 48 : form.length > 8 ? 58 : 70;
  const pillRadius = form.length > 12 ? 22 : 27;
  const pillStart = 540 - ((form.length - 1) * pillGap) / 2;
  form.forEach((outcome, index) => {
    const x = pillStart + index * pillGap;
    ctx.beginPath();
    ctx.arc(x, 1148, pillRadius, 0, Math.PI * 2);
    ctx.fillStyle = outcome === "W" ? "#169b62" : outcome === "D" ? "#f1b942" : "#df2d3f";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${form.length > 12 ? 22 : 26}px Arial, sans-serif`;
    ctx.fillText(outcome, x, 1148);
  });

  drawRoundedRect(ctx, 120, 1265, 840, 320, 28);
  ctx.fillStyle = "rgba(255,255,255,.07)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 42px Arial, sans-serif";
  ctx.fillText("ALL-TIME", 540, 1335);
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.font = "800 31px Arial, sans-serif";
  [
    `Points: ${allTime.points}`,
    `Apps: ${allTime.appearances}`,
    `Win %: ${formatPercent(allTime.winPct)}`,
    `Goals: ${allTime.goals}`,
    `Assists: ${allTime.assists}`,
    `G+A: ${allTime.goalContributions}`
  ].forEach((line, index) => {
    const x = index % 2 === 0 ? 310 : 720;
    const y = 1418 + Math.floor(index / 2) * 54;
    ctx.fillText(line, x, y);
  });

  ctx.fillStyle = "rgba(255,255,255,.52)";
  ctx.font = "800 28px Arial, sans-serif";
  ctx.fillText("AES FC • Active Expats in Split", 540, 1745);

  canvas.toBlob(async (blob) => {
    const filename = `aes-fc-player-of-the-month-${targetMonth}.png`;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "AES FC Player of the Month" });
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }, "image/png");
}

function doubleConfirm(actionLabel) {
  return window.confirm(`${actionLabel}\n\nAre you sure?`) &&
    window.confirm(`${actionLabel}\n\nThis is the second confirmation. Continue?`);
}

async function handleAdminClicks(event) {
  const signupId = event.target.dataset.removeSignup;
  const saveSignupId = event.target.dataset.saveSignup;
  const photoId = event.target.dataset.removePhoto;
  const saveRegularId = event.target.dataset.saveRegular;
  const removeRegularId = event.target.dataset.removeRegular;
  const saveProfileKey = event.target.hasAttribute("data-save-profile-key") ? event.target.dataset.saveProfileKey : null;
  const removeProfileId = event.target.dataset.removeProfile;
  const editGameId = event.target.dataset.editGame;
  const removeResultId = event.target.dataset.removeResult;
  const removeGameId = event.target.dataset.removeGame;
  const saveResultId = event.target.dataset.saveResult;
  const graphicResultId = event.target.dataset.graphicResult;
  const playerMonthGraphic = event.target.hasAttribute("data-admin-player-month-graphic");
  const downloadMonthly = event.target.hasAttribute("data-download-monthly-summary");
  try {
    assertAdmin();
    if (graphicResultId) {
      await createMatchGraphic(graphicResultId);
    }
    if (playerMonthGraphic) {
      await createPlayerOfMonthGraphic(el("adminPlayerMonthSelect")?.value || state.statsMonth);
    }
    if (downloadMonthly) {
      downloadMonthlySummary();
    }
    if (editGameId) {
      await selectAdminGame(editGameId);
      return;
    }
    if (saveResultId) {
      await saveExistingResult(saveResultId);
    }
    if (saveSignupId) {
      const row = event.target.closest("[data-admin-row]");
      const player = splitFullName(row.querySelector("[name='full_name']").value);
      const nationality = row.querySelector("[name='nationality']")?.value.trim() || "";
      if (!player.fullName) throw new Error("Please enter a player name.");
      const { error } = await db.from("aesfc_signups").update({
        first_name: player.firstName,
        last_name: player.lastName,
        nationality
      }).eq("id", saveSignupId);
      if (error) throw error;
      await upsertPlayerProfile(player.fullName, nationality);
      setMessage(el("adminMessage"), "Signup updated.");
    }
    if (signupId) {
      if (!doubleConfirm("Remove this signup?")) return;
      const { error } = await db.from("aesfc_signups").update({ cancelled_at: new Date().toISOString() }).eq("id", signupId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Signup removed. The lists have been recalculated.");
    }
    if (photoId) {
      if (!doubleConfirm("Remove this photo from the site?")) return;
      const { error } = await db.from("aesfc_photos").update({ is_active: false }).eq("id", photoId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Photo removed.");
    }
    if (saveRegularId) {
      const row = event.target.closest("[data-regular-row]");
      const fullName = splitFullName(row.querySelector("[name='regular_full_name']").value).fullName;
      const nationality = row.querySelector("[name='regular_nationality']")?.value.trim() || "";
      if (!fullName) throw new Error("Please enter a player name.");
      const { error } = await db.from("aesfc_regulars").update({
        full_name: fullName,
        nationality,
        guaranteed_signup: row.querySelector("[name='regular_guaranteed']")?.checked || false
      }).eq("id", saveRegularId);
      if (error) throw error;
      await upsertPlayerProfile(fullName, nationality);
      setMessage(el("adminMessage"), "Regular player updated.");
    }
    if (saveProfileKey !== null) {
      const row = event.target.closest("[data-profile-row]");
      const fullName = splitFullName(row.querySelector("[name='profile_full_name']").value).fullName;
      const nationality = row.querySelector("[name='profile_nationality']")?.value.trim() || "";
      const profileTags = collectProfileTags(row);
      if (!fullName) throw new Error("Please enter a player name.");
      if (saveProfileKey && saveProfileKey !== "new") {
        const { error } = await db.from("aesfc_player_profiles").update({
          full_name: fullName,
          nationality,
          profile_tags: profileTags
        }).eq("id", saveProfileKey);
        if (error) throw error;
      } else {
        await upsertPlayerProfile(fullName, nationality, profileTags);
      }
      setMessage(el("adminMessage"), "Player profile updated.");
    }
    if (removeRegularId) {
      if (!doubleConfirm("Remove this player from the dropdown list?")) return;
      const { error } = await db.from("aesfc_regulars").update({ is_active: false }).eq("id", removeRegularId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Regular player removed from options.");
    }
    if (removeProfileId) {
      if (!doubleConfirm("Remove this player nationality profile?")) return;
      const { error } = await db.from("aesfc_player_profiles").delete().eq("id", removeProfileId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Player nationality profile removed.");
    }
    if (removeResultId) {
      if (!doubleConfirm("Remove this match result?")) return;
      const { error } = await db.from("aesfc_results").update({ is_active: false }).eq("id", removeResultId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Match result removed.");
    }
    if (removeGameId) {
      await removeGame(removeGameId);
    }
    if (signupId || saveSignupId || photoId || saveRegularId || removeRegularId || saveProfileKey !== null || removeProfileId || removeResultId || removeGameId || saveResultId) {
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
  document.querySelector("[name='signup_for_self']").addEventListener("change", toggleResponsiblePlayer);
  el("responsiblePlayerSelect").addEventListener("change", toggleResponsiblePlayer);
  el("extraPlayersWrap").addEventListener("change", (event) => {
    if (event.target.matches("select")) updateExtraManualVisibility();
  });
  el("signupForm").addEventListener("submit", submitSignup);
  el("gameSelect").addEventListener("change", (event) => selectPublicGame(event.currentTarget.value));
  el("listGameSelect").addEventListener("change", (event) => selectPublicGame(event.currentTarget.value));
  el("cancelSignupForm").addEventListener("submit", cancelSignup);
  el("photoGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-photo]");
    if (card) openLightbox(Number(card.dataset.photo));
  });
  el("photoPrev").addEventListener("click", () => showPhoto(state.photoIndex - 1));
  el("photoNext").addEventListener("click", () => showPhoto(state.photoIndex + 1));
  el("resultsMonthSelect").addEventListener("change", (event) => {
    state.resultsMonth = event.target.value;
    renderResults();
  });
  el("playerStatsTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-stats-mode]");
    if (button) {
      state.statsMode = button.dataset.statsMode;
      renderPlayerStats(state.results.length ? state.results : fallbackResults);
    }
  });
  el("playerStatsTable").addEventListener("change", (event) => {
    if (!event.target.matches("#statsMonthSelect")) return;
    state.statsMonth = event.target.value;
    renderPlayerStats(state.results.length ? state.results : fallbackResults);
  });
  el("adminMonthlySummarySelect").addEventListener("change", renderAdminMonthlySummary);
  el("closeLightbox").addEventListener("click", () => el("lightbox").classList.add("hidden"));
  el("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") el("lightbox").classList.add("hidden");
  });
  el("adminLogin").addEventListener("submit", adminLogin);
  el("gameForm").addEventListener("submit", saveGameDetails);
  el("gameForm").game_date.addEventListener("change", (event) => applyDefaultSignupOpen(event.currentTarget.form));
  el("gameForm").signup_open_now.addEventListener("change", (event) => updateSignupOpenMode(event.currentTarget.form));
  el("newGameForm").game_date.addEventListener("change", (event) => applyDefaultSignupOpen(event.currentTarget.form));
  el("newGameForm").signup_open_now.addEventListener("change", (event) => updateSignupOpenMode(event.currentTarget.form));
  el("newGameForm").addEventListener("submit", addGame);
  el("resultForm").addEventListener("change", (event) => {
    if (event.target.matches("[data-result-player-select]")) updateResultManualVisibility();
  });
  el("resultForm").addEventListener("submit", addResult);
  el("settingsForm").addEventListener("submit", saveSettings);
  el("photoForm").addEventListener("submit", addPhoto);
  el("regularForm").addEventListener("submit", addRegular);
  el("profileForm").addEventListener("submit", addProfile);
  el("adminTools").addEventListener("click", handleAdminClicks);
  el("adminResults").addEventListener("change", (event) => {
    if (event.target.matches("[data-saved-result-player-select]")) updateSavedResultManualVisibility();
  });
  el("openTracker").addEventListener("click", openTracker);
  el("closeTracker").addEventListener("click", closeTracker);
  el("startTrackerGame").addEventListener("click", startTrackerGame);
  el("trackerSetup").addEventListener("change", (event) => {
    if (event.target.matches("[data-tracker-player-select], [data-tracker-more-select]")) updateTrackerTeamPickerVisibility();
  });
  el("trackerScorerButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tracker-scorer]");
    if (!button) return;
    state.tracker.pendingScorer = button.dataset.trackerScorer;
    if (isTrackerOwnGoal(state.tracker.pendingScorer)) state.tracker.pendingAssist = "";
    if (state.tracker.pendingAssist === state.tracker.pendingScorer) state.tracker.pendingAssist = "";
    renderTrackerGoalButtons();
  });
  el("trackerAssistButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tracker-assist]");
    if (!button) return;
    state.tracker.pendingAssist = button.dataset.trackerAssist;
    renderTrackerGoalButtons();
  });
  el("saveTrackerGoal").addEventListener("click", saveTrackerGoal);
  el("cancelTrackerGoal").addEventListener("click", cancelTrackerGoal);
  el("undoTrackerGoal").addEventListener("click", undoTrackerGoal);
  el("finishTrackerGame").addEventListener("click", finishTrackerGame);
  document.querySelector(".tracker-goal-buttons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tracker-goal]");
    if (button) openTrackerGoal(button.dataset.trackerGoal);
  });
  el("trackerEvents").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-tracker-goal]");
    if (!button) return;
    const index = Number(button.dataset.editTrackerGoal);
    openTrackerGoal(state.tracker.events[index].team, index);
  });
  el("refreshAdmin").addEventListener("click", loadAdmin);
  el("logoutAdmin").addEventListener("click", () => {
    sessionStorage.removeItem("aes_admin_password");
    state.adminPassword = "";
    el("adminTools").classList.add("hidden");
    setMessage(el("adminMessage"), "Logged out.");
  });
  window.addEventListener("beforeunload", (event) => {
    if ((!state.tracker.started && !state.tracker.events.length) || el("liveTracker")?.classList.contains("hidden")) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("online", updateTrackerConnectivityStatus);
  window.addEventListener("offline", updateTrackerConnectivityStatus);
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

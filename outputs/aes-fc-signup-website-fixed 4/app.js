const cfg = window.AES_CONFIG || {};
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("PASTE_") && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes("PASTE_");
const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const ADMIN_PASSWORD = "AESfc2015";
const SIGNUP_PASSWORD = "2015";
const MAP_URL = "https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8";
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

const state = {
  photos: fallbackPhotos,
  signups: [],
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
    signup_opens_at: `${addDays(gameDate, -4)}T09:00:00+02:00`
  };
}

function isGameOpen(game) {
  if (!game) return false;
  const opens = new Date(game.signup_opens_at || `${addDays(game.game_date, -4)}T09:00:00+02:00`);
  const closes = new Date(`${game.game_date}T${String(game.end_time || "22:00").slice(0, 5)}:00+02:00`);
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

function isValidFullName(fullName) {
  return splitFullName(fullName).fullName.split(" ").filter(Boolean).length >= 2;
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
  const active = (games || []).find((game) => now < new Date(`${game.game_date}T${String(game.end_time || "22:00").slice(0, 5)}:00+02:00`));
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
    .order("sort_order", { ascending: true })
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
  el("photoGrid").innerHTML = photos.map((photo, index) => `
    <button class="photo-card" type="button" data-photo="${index}" aria-label="Open ${escapeHtml(photo.title || "football photo")}">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.title || "AES FC football photo")}">
    </button>
  `).join("");

  const slide = el("heroSlide");
  if (photos[0]) slide.src = photos[0].url;
  let slideIndex = 0;
  clearInterval(window.aesSlideTimer);
  window.aesSlideTimer = setInterval(() => {
    const latest = state.photos.length ? state.photos : fallbackPhotos;
    slideIndex = (slideIndex + 1) % latest.length;
    slide.src = latest[slideIndex].url;
  }, 4200);
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
  return `
    <li>
      <strong>${escapeHtml(signup.first_name)} ${escapeHtml(signup.last_name || "")}</strong>
      <span class="meta">
        <span>#${signup.position}</span>
        <span>${fmtTime.format(new Date(signup.created_at))}</span>
      </span>
    </li>
  `;
}

function renderSheetStatus() {
  const game = state.game;
  if (!game) {
    el("gameDate").textContent = "Connect Supabase to load the next game";
    el("sheetStatus").textContent = "The site is ready. Connect Supabase to activate live signups.";
    return;
  }
  el("gameDate").textContent = fmtDate.format(new Date(`${game.game_date}T${String(game.start_time || "21:00").slice(0, 5)}:00+02:00`));
  el("gameTime").textContent = `${formatClock(game.start_time)} - ${formatClock(game.end_time)}`;
  el("gameLocation").textContent = game.location_name || "NK Bili As ADB Pitch";
  el("gameLocation").href = game.location_url || MAP_URL;
  el("sheetStatus").textContent = game.is_open
    ? "Signup is open. First 12 timestamped player spots are Playing; everyone after that is Sub."
    : `Signup is closed now. It opens Saturday at 9:00 AM Europe/Zagreb for ${fmtDate.format(new Date(`${game.game_date}T${String(game.start_time || "21:00").slice(0, 5)}:00+02:00`))}.`;
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
    renderRules();
    renderVideos();
    return;
  }
  state.game = await getCurrentGame();
  state.signups = await loadSignups(state.game.id);
  state.photos = await loadPhotos();
  state.settings = await loadSettings();
  state.regulars = await loadRegulars();
  renderSheetStatus();
  renderPhotos();
  renderLists();
  renderRules();
  renderPlayerSelectors();
  renderVideos();
}

function renderPlayerSelectors() {
  document.querySelectorAll(".player-select").forEach((select) => {
    const current = select.value;
    select.innerHTML = `
      <option value="">Choose a player</option>
      ${state.regulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
      <option value="__manual">Not listed - enter manually</option>
    `;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
  toggleManualName();
  renderExtraPlayerFields();
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
  if (!isValidFullName(mainName)) {
    setMessage(message, "Please choose or enter your full first and last name.", true);
    return;
  }
  if (playerCount > 1 && extraNames.length < playerCount - 1) {
    setMessage(message, "Please choose or enter the full name of each extra player.", true);
    return;
  }
  const invalidExtra = extraNames.find((name) => !isValidFullName(name));
  if (invalidExtra) {
    setMessage(message, `Please use a full first and last name for ${invalidExtra}.`, true);
    return;
  }
  try {
    const game = state.game || await getCurrentGame();
    if (!isGameOpen(game)) throw new Error("Signup is closed. It opens every Saturday at 9:00 AM Europe/Zagreb for the following Wednesday game.");

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
    const cancelUrl = `${location.origin}${location.pathname}?signup=${data[0].id}&cancel=${token}`;
    const countText = rows.length === 1 ? "1 player" : `${rows.length} players`;
    setMessage(message, `Signup added for ${countText}. First spot is ${firstSpot?.status || "Playing"}. Save this private cancellation link: ${cancelUrl}`);
    form.reset();
    form.player_count.value = "1";
    toggleExtraPlayers();
    renderPlayerSelectors();
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
    select.innerHTML = `
      <option value="">Choose a player</option>
      ${state.regulars.map((regular) => `<option value="${escapeHtml(regular.full_name)}">${escapeHtml(regular.full_name)}</option>`).join("")}
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
  state.photos = await loadPhotos();
  state.settings = await loadSettings();
  state.regulars = await loadRegulars();
  renderAdminSignups(state.signups);
  renderAdminPhotos(state.photos);
  renderAdminSettings();
  renderAdminRegulars();
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

function renderAdminSignups(signups) {
  el("adminSignups").innerHTML = `
    <table>
      <thead><tr><th>Status</th><th>Name</th><th>Details</th><th></th></tr></thead>
      <tbody>
        ${signups.map((s) => `
          <tr data-admin-row="${s.id}">
            <td>${escapeHtml(s.status)} #${s.position}</td>
            <td>
              <input name="first_name" value="${escapeHtml(s.first_name)}" aria-label="First name">
              <input name="last_name" value="${escapeHtml(s.last_name || "")}" aria-label="Last name">
            </td>
            <td><small>One visible player spot</small></td>
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
  if (!isValidFullName(fullName)) {
    setMessage(el("adminMessage"), "Please enter a first and last name.", true);
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
      signup_opens_at: `${addDays(data.get("game_date"), -4)}T09:00:00+02:00`
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
  try {
    assertAdmin();
    if (saveSignupId) {
      const row = event.target.closest("[data-admin-row]");
      const { error } = await db.from("aesfc_signups").update({
        first_name: row.querySelector("[name='first_name']").value,
        last_name: row.querySelector("[name='last_name']").value,
        comments: null,
        played_before: "no"
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
      if (!isValidFullName(fullName)) throw new Error("Please enter a first and last name.");
      const { error } = await db.from("aesfc_regulars").update({ full_name: fullName }).eq("id", saveRegularId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Regular player updated.");
    }
    if (removeRegularId) {
      const { error } = await db.from("aesfc_regulars").update({ is_active: false }).eq("id", removeRegularId);
      if (error) throw error;
      setMessage(el("adminMessage"), "Regular player removed from options.");
    }
    if (signupId || saveSignupId || photoId || saveRegularId || removeRegularId) {
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
  el("photoGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-photo]");
    if (card) openLightbox(Number(card.dataset.photo));
  });
  el("closeLightbox").addEventListener("click", () => el("lightbox").classList.add("hidden"));
  el("lightbox").addEventListener("click", (event) => {
    if (event.target.id === "lightbox") el("lightbox").classList.add("hidden");
  });
  el("adminLogin").addEventListener("submit", adminLogin);
  el("gameForm").addEventListener("submit", saveGameDetails);
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
    renderRules();
    setMessage(el("signupMessage"), error.message, true);
  }
});

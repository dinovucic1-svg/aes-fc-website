const cfg = window.AES_CONFIG || {};
const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("PASTE_") && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes("PASTE_");
const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

const fallbackPhotos = [
  { title: "AES FC match photo 1", url: "public/photos/aes-placeholder-1.svg", caption: "Replace this placeholder in public/photos." },
  { title: "AES FC match photo 2", url: "public/photos/aes-placeholder-2.svg", caption: "Add real game photos in the admin dashboard or public/photos." },
  { title: "AES FC match photo 3", url: "public/photos/aes-placeholder-3.svg", caption: "Mobile-friendly gallery with lightbox preview." }
];

const state = {
  photos: fallbackPhotos,
  signups: [],
  game: null,
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

async function rpc(name, args = {}) {
  if (!db) throw new Error("Supabase is not connected yet. Open config.js and paste your Supabase URL and anon key.");
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

function renderVideos() {
  const grid = el("videoGrid");
  if (!cfg.youtubeVideoIds || cfg.youtubeVideoIds.length === 0) {
    grid.innerHTML = `<p class="empty-note">No match videos have been selected yet. Use the YouTube channel button above until real AES FC video IDs are added.</p>`;
    document.querySelector(".youtube-button").href = cfg.youtubeChannelUrl || "https://www.youtube.com/@dinovucic239/videos";
    return;
  }
  grid.innerHTML = (cfg.youtubeVideoIds || []).map((id) => `
    <iframe
      class="video-frame"
      src="https://www.youtube.com/embed/${encodeURIComponent(id)}"
      title="AES FC match video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen>
    </iframe>
  `).join("");
  document.querySelector(".youtube-button").href = cfg.youtubeChannelUrl || "https://www.youtube.com/@dinovucic239/videos";
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
      <strong>${escapeHtml(signup.first_name)} ${escapeHtml(signup.last_name)}</strong>
      <span class="meta">
        <span>#${signup.position}</span>
        <span>${fmtTime.format(new Date(signup.created_at))}</span>
        <span>Played before: ${escapeHtml(signup.played_before || "not sure")}</span>
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
  el("gameLocation").href = game.location_url || "https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8";
  el("sheetStatus").textContent = game.is_open
    ? "Signup is open. First 10 timestamped signups are Playing; everyone after that is Sub."
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
    renderVideos();
    return;
  }
  const data = await rpc("aes_public_state");
  state.game = data.game;
  state.signups = data.signups || [];
  state.photos = data.photos?.length ? data.photos : fallbackPhotos;
  renderSheetStatus();
  renderPhotos();
  renderLists();
  renderVideos();
}

async function submitSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = el("signupMessage");
  setMessage(message, "Submitting...");
  const formData = new FormData(form);
  const playerCount = Number(formData.get("player_count") || 1);
  if (playerCount > 1 && !String(formData.get("extra_players") || "").trim()) {
    setMessage(message, "Please add the full names of the extra players.", true);
    return;
  }
  try {
    const result = await rpc("aes_submit_signup", {
      p_first_name: formData.get("first_name"),
      p_last_name: formData.get("last_name"),
      p_email: formData.get("email"),
      p_phone: formData.get("phone"),
      p_player_count: playerCount,
      p_extra_players: formData.get("extra_players") || "",
      p_comments: formData.get("comments") || "",
      p_played_before: formData.get("played_before")
    });
    const cancelUrl = `${location.origin}${location.pathname}?signup=${result.signup_id}&cancel=${result.cancel_token}`;
    const countText = Number(result.player_count) === 1 ? "1 player" : `${result.player_count} players`;
    setMessage(message, `Signup added for ${countText}. First spot is ${result.status}. Save this private cancellation link: ${cancelUrl}`);
    form.reset();
    form.player_count.value = "1";
    toggleExtraPlayers();
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
    await rpc("aes_cancel_signup", { p_signup_id: signupId, p_cancel_token: token });
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
  document.querySelector("[name='extra_players']").required = count > 1;
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
    await loadAdmin();
    sessionStorage.setItem("aes_admin_password", state.adminPassword);
    el("adminTools").classList.remove("hidden");
    setMessage(el("adminMessage"), "Admin dashboard loaded.");
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function loadAdmin() {
  const data = await rpc("aes_admin_state", { p_admin_password: state.adminPassword });
  renderAdminGame(data.game);
  renderAdminSignups(data.signups || []);
  renderAdminPhotos(data.photos || []);
}

function renderAdminGame(game) {
  if (!game) return;
  const form = el("gameForm");
  form.game_date.value = game.game_date || "";
  form.start_time.value = String(game.start_time || "21:00").slice(0, 5);
  form.end_time.value = String(game.end_time || "22:00").slice(0, 5);
  form.location_name.value = game.location_name || "NK Bili As ADB Pitch";
  form.location_url.value = game.location_url || "https://maps.app.goo.gl/VGiFAjKSD9yt7YuB8";
}

function renderAdminSignups(signups) {
  el("adminSignups").innerHTML = `
    <table>
      <thead><tr><th>Status</th><th>Name</th><th>Contact</th><th>Details</th><th></th></tr></thead>
      <tbody>
        ${signups.map((s) => `
          <tr data-admin-row="${s.id}">
            <td>${escapeHtml(s.status)} #${s.position}</td>
            <td>
              <input name="first_name" value="${escapeHtml(s.first_name)}" aria-label="First name">
              <input name="last_name" value="${escapeHtml(s.last_name)}" aria-label="Last name">
            </td>
            <td>
              <input name="email" value="${escapeHtml(s.email)}" aria-label="Email">
              <input name="phone" value="${escapeHtml(s.phone)}" aria-label="Phone">
            </td>
            <td>
      <small>One visible player spot</small>
      <textarea name="comments" rows="2" aria-label="Comments">${escapeHtml(s.comments || "")}</textarea>
              <select name="played_before" aria-label="Played before">
                <option value="yes" ${s.played_before === "yes" ? "selected" : ""}>Played before: yes</option>
                <option value="no" ${s.played_before === "no" ? "selected" : ""}>Played before: no</option>
              </select>
            </td>
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
  if (!url && file && file.size) url = await fileToDataUrl(file);
  if (!url) {
    setMessage(el("adminMessage"), "Add a photo path, URL, or uploaded file.", true);
    return;
  }
  try {
    await rpc("aes_admin_add_photo", {
      p_admin_password: state.adminPassword,
      p_title: data.get("title") || "AES FC photo",
      p_url: url,
      p_caption: data.get("caption") || ""
    });
    form.reset();
    setMessage(el("adminMessage"), "Photo added.");
    await loadAdmin();
    await loadPublicState();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

async function saveGameDetails(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await rpc("aes_admin_update_game", {
      p_admin_password: state.adminPassword,
      p_game_date: data.get("game_date"),
      p_start_time: data.get("start_time"),
      p_end_time: data.get("end_time"),
      p_location_name: data.get("location_name"),
      p_location_url: data.get("location_url")
    });
    setMessage(el("adminMessage"), "Game details saved.");
    await loadPublicState();
    await loadAdmin();
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
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
  try {
    if (saveSignupId) {
      const row = event.target.closest("[data-admin-row]");
      await rpc("aes_admin_update_signup", {
        p_admin_password: state.adminPassword,
        p_signup_id: saveSignupId,
        p_first_name: row.querySelector("[name='first_name']").value,
        p_last_name: row.querySelector("[name='last_name']").value,
        p_email: row.querySelector("[name='email']").value,
        p_phone: row.querySelector("[name='phone']").value,
        p_player_count: 1,
        p_extra_players: "",
        p_comments: row.querySelector("[name='comments']").value,
        p_played_before: row.querySelector("[name='played_before']").value
      });
      setMessage(el("adminMessage"), "Signup updated.");
    }
    if (signupId) {
      await rpc("aes_admin_remove_signup", { p_admin_password: state.adminPassword, p_signup_id: signupId });
      setMessage(el("adminMessage"), "Signup removed. The lists have been recalculated.");
    }
    if (photoId) {
      await rpc("aes_admin_remove_photo", { p_admin_password: state.adminPassword, p_photo_id: photoId });
      setMessage(el("adminMessage"), "Photo removed.");
    }
    if (signupId || saveSignupId || photoId) {
      await loadAdmin();
      await loadPublicState();
    }
  } catch (error) {
    setMessage(el("adminMessage"), error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelector("[name='player_count']").addEventListener("input", toggleExtraPlayers);
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
  el("photoForm").addEventListener("submit", addPhoto);
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
    setMessage(el("signupMessage"), error.message, true);
  }
});

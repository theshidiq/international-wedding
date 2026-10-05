// ===== Settings — edit here =====
const CONFIG = {
  dateShort: "10 · 12 · 2026",        // shown on the cover / data page
  dateTicket: "10 DEC 2026",          // shown on the boarding pass
  passportNo: "KAS10122026MAAV",
  start: "2026-12-10T09:00:00+07:00", // countdown + calendar
  end: "2026-12-10T12:30:00+07:00",
  venue: "Horison Tasikmalaya, Jl. Yudanegara No. 63, Tasikmalaya, West Java",
  mapsQuery: "Horison Tasikmalaya",
  music: "",                          // e.g. "assets/music.mp3" — leave empty for no music
};

// ===== Guest name from the link: ?to=Bapak+Asep&table=3&seat=2 =====
const params = new URLSearchParams(location.search);
const guest = (params.get("to") || "").trim().slice(0, 60);
const table = (params.get("table") || "").trim().slice(0, 6);
const seat = (params.get("seat") || "").trim().slice(0, 6);

document.querySelectorAll("[data-fill]").forEach((el) => { el.textContent = CONFIG[el.dataset.fill] || ""; });
if (guest) document.getElementById("coverGuest").hidden = false;

// ===== Language: ?lang=en|id|ja, else the guest's last choice, else the phone's language =====
const LANGS = ["en", "id", "ja"];
function pickLang() {
  const fromUrl = (params.get("lang") || "").toLowerCase();
  if (LANGS.includes(fromUrl)) return fromUrl;
  try { const saved = localStorage.getItem("lang"); if (LANGS.includes(saved)) return saved; } catch {}
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : "en";
}
function setLang(lang) {
  const t = I18N[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { if (t[el.dataset.i18n] != null) el.textContent = t[el.dataset.i18n]; });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t[el.dataset.i18nHtml]; });
  document.querySelectorAll('[data-fill="dateTicket"]').forEach((el) => { el.textContent = t.dateTicket; });
  if (guest) document.querySelectorAll("[data-guest]").forEach((el) => { el.textContent = guest; });
  if (table && seat) {
    document.getElementById("seatText").textContent = t.seatFmt.replace("{t}", table).replace("{s}", seat);
    document.getElementById("seatSub").textContent = t.seatReserved;
  }
  document.title = guest ? `${guest} — ${t.title}` : t.title;
  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  try { localStorage.setItem("lang", lang); } catch {}
}
document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
setLang(pickLang());

// Personal check-in QR: encodes only the guest ID (no name), scanned at the entrance by the check-in app (/checkin/)
const guestId = (params.get("id") || "").toUpperCase();
if (/^G\d{2,3}$/.test(guestId) && window.qrcode) {
  const qr = qrcode(0, "M");
  qr.addData(`KA26:${guestId}`);
  qr.make();
  const box = document.getElementById("qrBox");
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  box.classList.add("has-qr");
  box.setAttribute("aria-label", `Check-in QR code ${guestId}`);
}

// ===== The flip-book (own lightweight page-turn: CSS 3D transform only) =====
const bookEl = document.getElementById("book");
const pages = [...document.querySelectorAll("#book .page")];
const RATIO = 419 / 297; // passport page proportions from the Canva design
const pageNo = document.getElementById("pageNo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
let idx = 0;
let busy = false;
let started = false;
let ready = false;

// Size the book to the screen; re-run on rotate/resize (a background tab can start at 0×0).
function sizeBook() {
  const availW = innerWidth - 24, availH = innerHeight - 140; // room for the language switch + page buttons
  if (availW < 200 || availH < 260) return false;
  const pageW = Math.floor(Math.min(480, availW, availH / RATIO));
  bookEl.style.width = `${pageW}px`;
  bookEl.style.height = `${Math.floor(pageW * RATIO)}px`;
  return true;
}

// Only the open page and the one underneath it are rendered; everything else is hidden.
function layout() {
  pages.forEach((p, n) => {
    p.style.zIndex = String(pages.length - n);
    p.classList.toggle("turned", n < idx);
    p.classList.toggle("hidden", n < idx || n > idx + 1);
  });
}

function go(n) {
  n = Math.max(0, Math.min(pages.length - 1, n));
  if (!ready || busy || n === idx) return;
  busy = true;
  const forward = n > idx;
  const moving = forward ? pages[idx] : pages[n]; // the sheet that swings
  pages[n].classList.remove("hidden");
  if (forward && pages[n + 1]) pages[n + 1].classList.remove("hidden");
  moving.classList.add("turning");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    moving.classList.toggle("turned", forward);
  }));
  const done = () => {
    moving.classList.remove("turning");
    idx = n;
    layout();
    showPage(idx);
    busy = false;
  };
  let finished = false;
  const finish = () => { if (!finished) { finished = true; done(); } };
  moving.addEventListener("transitionend", function te(e) {
    if (e.target === moving && e.propertyName === "transform") { moving.removeEventListener("transitionend", te); finish(); }
  });
  setTimeout(finish, (lowEnd ? 450 : 700) + 150); // safety net if transitionend never fires
}
const next = () => go(idx + 1);
const prev = () => go(idx - 1);

function showPage(i) {
  // "on" = the open page (the small plane loops run only here)
  pages.forEach((p, n) => p.classList.toggle("on", n === i));
  if (mapSvg) { if (pages[i].contains(mapSvg) && !lowEnd) mapSvg.unpauseAnimations(); else mapSvg.pauseAnimations(); }
  pageNo.textContent = `${i + 1} / ${pages.length}`;
  prevBtn.disabled = i === 0;
  nextBtn.disabled = i >= pages.length - 1;
  if (i > 0 && !started) { started = true; startMusic(); }
}

prevBtn.addEventListener("click", prev);
nextBtn.addEventListener("click", next);
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
});

// Swipe left/right, or tap the right/left side of the page.
let sx = 0, sy = 0, st = 0;
bookEl.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; st = Date.now(); });
bookEl.addEventListener("pointerup", (e) => {
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev();
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - st < 500 && !e.target.closest("a, button")) {
    const r = bookEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x > 0.6) next(); else if (x < 0.4) prev();
  }
});

addEventListener("resize", () => { if (sizeBook() && !ready) start(); });

function start() {
  ready = true;
  layout();
  showPage(0); // every link always opens on the front cover
}

// ===== Music (starts on the first page turn) =====
const music = document.getElementById("music");
const musicBtn = document.getElementById("musicBtn");
function startMusic() {
  if (!CONFIG.music) return;
  music.src = CONFIG.music;
  music.volume = 0.5;
  musicBtn.hidden = false;
  music.play().catch(() => musicBtn.classList.add("off"));
}
musicBtn.addEventListener("click", () => {
  if (music.paused) music.play(); else music.pause();
  musicBtn.classList.toggle("off", music.paused);
});

// ===== Performance: lighter effects on low-end phones or when "reduce motion" is on =====
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowEnd = reduceMotion || (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4;
if (lowEnd) document.documentElement.classList.add("lite");
const mapSvg = document.querySelector(".route");
// ===== Countdown =====
const startAt = new Date(CONFIG.start).getTime();
function tick() {
  let ms = Math.max(0, startAt - Date.now());
  const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5;
  const m = Math.floor(ms / 6e4); ms -= m * 6e4;
  const s = Math.floor(ms / 1e3);
  for (const [k, v] of Object.entries({ d, h, m, s })) {
    document.querySelector(`[data-cd="${k}"]`).textContent = String(v).padStart(2, "0");
  }
}
tick();
setInterval(tick, 1000);

// ===== Maps + calendar =====
document.getElementById("mapsBtn").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONFIG.mapsQuery)}`;
document.getElementById("calBtn").addEventListener("click", () => {
  const fmt = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kamal & Airiam//Wedding//EN", "BEGIN:VEVENT",
    `UID:kamal-airiam-nikah-2026@wedding`, `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(CONFIG.start)}`, `DTEND:${fmt(CONFIG.end)}`,
    "SUMMARY:Nikah of Kamal & Airiam", `LOCATION:${CONFIG.venue.replace(/,/g, "\\,")}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "kamal-airiam-wedding.ics";
  a.click();
});

// Start the book last, after everything it may call (music, effects) is defined.
if (sizeBook()) start(); else requestAnimationFrame(() => { if (!ready && sizeBook()) start(); });

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

// QR code per invitation (generated later): ?qr=<image url> or assets/qr/<id>.png via ?id=<id>
const qrSrc = params.get("qr") || (params.get("id") ? `assets/qr/${encodeURIComponent(params.get("id"))}.png` : "");
if (qrSrc) {
  const img = new Image();
  img.alt = "Your personal QR code";
  img.onload = () => document.getElementById("qrBox").replaceChildren(img);
  img.src = qrSrc;
}

// ===== The flip-book =====
const bookEl = document.getElementById("book");
const pages = [...document.querySelectorAll("#book .page")];
const RATIO = 419 / 297; // passport page proportions from the Canva design
const pageNo = document.getElementById("pageNo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
let flip = null;
let started = false;
let builtW = 0;

// Builds the book once the window has a real size (a tab opened in the background can start at 0×0).
function buildBook() {
  const availW = innerWidth - 24, availH = innerHeight - 88;
  if (availW < 200 || availH < 280) return false;
  let pageW = Math.min(480, availW, availH / RATIO);
  const spread = innerWidth >= 820 && availW >= pageW * 2 + 40; // desktop: open passport, two pages side by side
  if (spread) pageW = Math.min(480, availW / 2, availH / RATIO);
  pageW = Math.floor(pageW);
  const pageH = Math.floor(pageW * RATIO);
  bookEl.style.width = `${spread ? pageW * 2 : pageW}px`;
  bookEl.style.height = `${pageH}px`;

  flip = new St.PageFlip(bookEl, {
    width: pageW, height: pageH, size: "fixed",
    showCover: true, usePortrait: true, mobileScrollSupport: false,
    drawShadow: !lowEnd, maxShadowOpacity: 0.3, flippingTime: lowEnd ? 550 : 700,
  });
  flip.loadFromHTML(pages);
  flip.on("flip", (e) => showPage(e.data));
  builtW = innerWidth;
  showPage(0); // every link always opens on the front cover
  return true;
}

function showPage(i) {
  // run the animations on the page(s) now visible
  const visible = flip.getOrientation() === "landscape" && i > 0 ? [i, i + 1] : [i];
  // "in" = page was shown (one-time entrance animations); "on" = page is visible now (looping animations run only here)
  // (the flip library makes copies of pages while turning them, so clear "on" everywhere first)
  document.querySelectorAll("#book .page.on").forEach((p) => p.classList.remove("on"));
  visible.forEach((n) => pages[n]?.classList.add("on"));
  visible.forEach((n) => pages[n]?.classList.add("in"));
  if (mapSvg) { if (mapSvg.closest(".page").classList.contains("on") && !lowEnd) mapSvg.unpauseAnimations(); else mapSvg.pauseAnimations(); }
  pageNo.textContent = `${i + 1} / ${pages.length}`;
  prevBtn.disabled = i === 0;
  nextBtn.disabled = i >= pages.length - 1;
  if (i > 0 && !started) { started = true; startMusic(); }
}

prevBtn.addEventListener("click", () => flip?.flipPrev());
nextBtn.addEventListener("click", () => flip?.flipNext());
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") flip?.flipNext();
  if (e.key === "ArrowLeft") flip?.flipPrev();
});
addEventListener("resize", () => {
  if (!flip) buildBook(); // window just got its size
  else if (Math.abs(innerWidth - builtW) > 120) location.reload(); // rotated / resized a lot: rebuild at the new size
});

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

// Build the book last, after everything it may call (music, effects) is defined.
if (!buildBook()) requestAnimationFrame(() => { if (!flip) buildBook(); });

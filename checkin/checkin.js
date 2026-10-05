// K&A wedding check-in — runs on the iPad at the entrance.
// The guest list is imported from a file and, like all check-ins, stays in this browser only (nothing is uploaded).
const KEY = "ka26-checkin-v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// ---------- storage ----------
let db = { guests: [], checkins: {}, importedAt: null };
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) db = { ...db, ...JSON.parse(raw) }; } catch {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { alert("Could not save on this device — export the CSV now."); }
}
const guestById = (id) => db.guests.find((g) => g.id === id);

// ---------- import ----------
async function importFile(file, keepCheckins = true) {
  const msg = $("importMsg");
  try {
    const data = JSON.parse(await file.text());
    if (data.event !== "KA26" || !Array.isArray(data.guests)) throw new Error("This is not the K&A guest list file.");
    const walkins = db.guests.filter((g) => g.walkin);
    db.guests = [...data.guests.map((g) => ({ id: String(g.id).toUpperCase(), name: g.name, pax: Number(g.pax) || 1, group: g.group || "", note: g.note || "" })), ...walkins];
    if (!keepCheckins) db.checkins = {};
    db.importedAt = new Date().toISOString();
    save();
    render();
    msg && (msg.textContent = "");
  } catch (err) {
    if (msg) msg.textContent = `Import failed: ${err.message}`; else alert(`Import failed: ${err.message}`);
  }
}
$("importFile").addEventListener("change", (e) => e.target.files[0] && importFile(e.target.files[0]));
$("reimportFile").addEventListener("change", (e) => e.target.files[0] && importFile(e.target.files[0], true));

// ---------- check-in ----------
let last = null; // id shown in the result card
function checkIn(rawId, source) {
  const id = String(rawId).trim().toUpperCase();
  const g = guestById(id);
  if (!g) return showResult("bad", "Unknown code", id ? `No guest with ID ${id}` : "", null);
  const prev = db.checkins[id];
  if (prev) {
    beep(false);
    return showResult("warn", "Already checked in", `${g.name}`, id, `Arrived at ${timeOf(prev.at)} · ${prev.pax} people`);
  }
  db.checkins[id] = { at: new Date().toISOString(), pax: g.pax, by: source };
  save();
  beep(true);
  showResult("ok", "Welcome!", g.name, id, [g.group, g.note].filter(Boolean).join(" · "));
  render();
}

function showResult(kind, status, name, id, meta = "") {
  last = id;
  const box = $("result");
  box.className = `result ${kind}`;
  box.querySelector(".r-status").textContent = status;
  box.querySelector(".r-name").textContent = name || "—";
  box.querySelector(".r-meta").textContent = meta;
  const actions = box.querySelector(".r-actions");
  actions.hidden = !(id && db.checkins[id]);
  if (id && db.checkins[id]) $("rPax").textContent = db.checkins[id].pax;
}

document.querySelectorAll("[data-pax]").forEach((b) => b.addEventListener("click", () => {
  if (!last || !db.checkins[last]) return;
  db.checkins[last].pax = Math.max(0, db.checkins[last].pax + Number(b.dataset.pax));
  $("rPax").textContent = db.checkins[last].pax;
  save(); render();
}));
$("rUndo").addEventListener("click", () => {
  if (!last || !db.checkins[last]) return;
  delete db.checkins[last];
  save(); render();
  showResult("idle", "Undone", "Check-in removed", null);
});

$("manualForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("manualId").value.trim();
  if (v) checkIn(/^\d+$/.test(v) ? `G${v.padStart(2, "0")}` : v, "manual");
  $("manualId").value = "";
});

$("walkinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = db.guests.filter((g) => g.walkin).length + 1;
  const id = `W${String(n).padStart(2, "0")}`;
  db.guests.push({ id, name: $("walkinName").value.trim(), pax: Number($("walkinPax").value) || 1, group: "Walk-in", note: "", walkin: true });
  save();
  checkIn(id, "walk-in");
  $("walkinName").value = ""; $("walkinPax").value = 1;
});

// ---------- scanning (camera + jsQR) ----------
const video = $("video"), canvas = $("frame"), ctx = canvas.getContext("2d", { willReadFrequently: true });
let stream = null, facing = "environment", scanning = false, lastCode = "", lastCodeAt = 0, lastScanAt = 0;

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    scanning = true;
    $("camToggle").textContent = "Stop camera";
    $("camSwitch").hidden = false;
    $("camMsg").textContent = "Point the camera at the QR code";
    requestAnimationFrame(scanLoop);
  } catch (err) {
    $("camMsg").textContent = "Camera blocked — allow camera access in Safari settings, or use manual check-in.";
  }
}
function stopCamera() {
  scanning = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $("camToggle").textContent = "Start camera";
  $("camMsg").textContent = "Camera off";
}
$("camToggle").addEventListener("click", () => (scanning ? stopCamera() : startCamera()));
$("camSwitch").addEventListener("click", () => { facing = facing === "environment" ? "user" : "environment"; stopCamera(); startCamera(); });

function scanLoop(now) {
  if (!scanning) return;
  if (now - lastScanAt > 120 && video.readyState >= 2) { // ~8 scans per second is plenty
    lastScanAt = now;
    const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
    if (code?.data) handleCode(code.data);
  }
  requestAnimationFrame(scanLoop);
}

function handleCode(text) {
  const t = Date.now();
  if (text === lastCode && t - lastCodeAt < 4000) return; // same QR held in front of the camera
  lastCode = text; lastCodeAt = t;
  const m = /KA26:(G\d{2,3})/i.exec(text) || /[?&]id=(G\d{2,3})/i.exec(text);
  if (m) checkIn(m[1], "scan"); else showResult("bad", "Not a K&A pass", "This QR code is not a wedding pass", null);
}

// ---------- sound ----------
let audio;
function beep(good) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = good ? 880 : 330;
    g.gain.setValueAtTime(0.15, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (good ? 0.18 : 0.35));
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.4);
  } catch {}
}

// ---------- dashboard ----------
let filter = "all";
$("search").addEventListener("input", renderGuests);
document.querySelectorAll("#filters button").forEach((b) => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b));
  renderGuests();
}));

function render() {
  const hasList = db.guests.length > 0;
  $("setup").hidden = hasList;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("blocked", !hasList));
  const expected = db.guests.filter((g) => !g.walkin).reduce((s, g) => s + g.pax, 0);
  const arrived = Object.values(db.checkins).reduce((s, c) => s + c.pax, 0);
  $("statPeople").textContent = arrived;
  $("statPeopleTotal").textContent = expected;
  $("statInv").textContent = Object.keys(db.checkins).length;
  $("statInvTotal").textContent = db.guests.length;
  const recent = Object.entries(db.checkins).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 30);
  $("recent").innerHTML = recent.map(([id, c]) =>
    `<li><b>${esc(guestById(id)?.name || id)}</b><span>${c.pax} · ${timeOf(c.at)}</span></li>`).join("");
  $("dataInfo").textContent = hasList
    ? `${db.guests.length} invitations imported ${db.importedAt ? "on " + new Date(db.importedAt).toLocaleString() : ""} · ${Object.keys(db.checkins).length} checked in.`
    : "No guest list yet.";
  renderGuests();
}

function renderGuests() {
  const q = $("search").value.trim().toLowerCase();
  const rows = db.guests.filter((g) => {
    const arrived = !!db.checkins[g.id];
    if (filter === "arrived" && !arrived) return false;
    if (filter === "waiting" && arrived) return false;
    return !q || g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q);
  });
  $("guestRows").innerHTML = rows.map((g) => {
    const c = db.checkins[g.id];
    return `<tr class="${c ? "arrived" : ""}">
      <td>${esc(g.id)}</td><td><b>${esc(g.name)}</b>${g.note ? `<br><span class="muted small">${esc(g.note)}</span>` : ""}</td>
      <td>${esc(g.group)}</td><td>${c ? `${c.pax}/${g.pax}` : g.pax}</td>
      <td>${c ? `<span class="tag ok">Arrived ${timeOf(c.at)}</span>` : `<span class="tag wait">Not yet</span>`}</td>
      <td>${c ? `<button class="btn sm ghost" data-undo="${esc(g.id)}">Undo</button>` : `<button class="btn sm" data-in="${esc(g.id)}">Check in</button>`}</td>
    </tr>`;
  }).join("");
  const groups = {};
  for (const g of db.guests) {
    groups[g.group] ||= { exp: 0, got: 0 };
    if (!g.walkin) groups[g.group].exp += g.pax;
    groups[g.group].got += db.checkins[g.id]?.pax || 0;
  }
  $("groupStats").innerHTML = Object.entries(groups).map(([name, v]) =>
    `<div><span class="muted small">${esc(name)}</span><br><b>${v.got}</b> / ${v.exp}</div>`).join("");
}
$("guestRows").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.in) checkIn(b.dataset.in, "manual");
  if (b.dataset.undo && confirm("Remove this check-in?")) { delete db.checkins[b.dataset.undo]; save(); render(); }
});

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== `tab-${b.dataset.tab}`));
  if (b.dataset.tab !== "scan" && scanning) stopCamera();
}));

// ---------- export / reset ----------
$("exportCsv").addEventListener("click", () => {
  const lines = [["ID", "Name", "Group", "Invited", "Arrived", "Time", "Method"].join(",")];
  for (const g of db.guests) {
    const c = db.checkins[g.id];
    lines.push([g.id, g.name, g.group, g.walkin ? 0 : g.pax, c ? c.pax : 0, c ? new Date(c.at).toLocaleString() : "", c?.by || ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  a.download = `checkin-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
  a.click();
});
$("resetCheckins").addEventListener("click", () => {
  if (confirm("Clear ALL check-ins? This cannot be undone.")) { db.checkins = {}; save(); render(); showResult("idle", "Ready", "Scan a guest's QR code", null); }
});

// ---------- offline ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

load();
render();

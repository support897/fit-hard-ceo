/* Fit Hard — CEO dashboard (owner route).
   Pattern: Personal Brand CEO-DASHBOARD-PATTERN v2.
   Access rests ONLY on the server-side owner record at
   _owner/config; the Firestore rules deny every other
   identity on every document in the _owner space, so this
   page can ask, but only the owner's door ever opens.
   Numbers only: this page reads aggregates + feed rows
   from _owner/* and never touches users/* (NS-1, TW-4). */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, OAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const cfg = window.FitAccountsConfig || {};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let aggregates = {};
let feedRows = [];

function show(id) {
  ["doorBox", "deniedBox", "dashBox"].forEach(function (b) { const el = $(b); if (el) el.hidden = b !== id; });
}
function msg(t) { $("doorMsg").textContent = t || ""; }


/* FIT-L4-1 (Store Review, 16 Oct): the served page is
   DOOR ONLY, like the other CEO hosts. The dashboard
   shell below is a string in this script — it enters
   the DOM only after the owner gate passes (or as the
   plain denied box), and it leaves the DOM on sign
   out. Nothing about the business is ever baked into
   the static document. */
const SHELL = "  <!-- Not available -->\n  <section id=\"deniedBox\" class=\"card\" hidden>\n    <h2 style=\"margin-top:0\">Not available</h2>\n    <p class=\"hint\">This page is not available for this account.</p>\n    <p><button class=\"ghost\" id=\"deniedOut\">Sign out</button></p>\n  </section>\n\n  <!-- Dashboard -->\n  <section id=\"dashBox\" hidden>\n    <div class=\"layout\">\n      <nav class=\"side\" id=\"dashNav\">\n        <button data-sec=\"overview\" class=\"on\">Overview</button>\n        <button data-sec=\"people\">People</button>\n        <button data-sec=\"money\">Money</button>\n        <button data-sec=\"reviews\">Reviews</button>\n        <button data-sec=\"outreach\">Outreach</button>\n        <button data-sec=\"community\">Community</button>\n        <button data-sec=\"avatars\">Avatars</button>\n      </nav>\n      <div>\n        <div class=\"card\" data-panel=\"overview\">\n          <h2 style=\"margin-top:0\">This week, at a glance</h2>\n          <div class=\"grid\">\n            <div><div class=\"num\" id=\"ovJoined\">0</div><div class=\"lbl\">joined this week</div></div>\n            <div><div class=\"num\" id=\"ovMoney\">0</div><div class=\"lbl\">paying members</div></div>\n            <div><div class=\"num\" id=\"ovLeaving\">0</div><div class=\"lbl\">leaving (pending + ended)</div></div>\n          </div>\n          <h3>Weeks so far</h3>\n          <table id=\"ovWeeks\"><thead><tr><th>Week</th><th>Joined</th></tr></thead><tbody></tbody></table>\n          <p class=\"hint\" id=\"ovEmpty\">No weeks yet. The numbers read zero until real people arrive.</p>\n        </div>\n\n        <div class=\"card\" data-panel=\"people\" hidden>\n          <h2 style=\"margin-top:0\">People</h2>\n          <div class=\"grid\">\n            <div><div class=\"num\" id=\"pplTotal\">0</div><div class=\"lbl\">signups, all time</div></div>\n            <div><div class=\"num\" id=\"pplWeek\">0</div><div class=\"lbl\">new this week</div></div>\n            <div><div class=\"num\" id=\"pplAct\">0</div><div class=\"lbl\">checked in within 7 days of joining</div></div>\n            <div><div class=\"num\" id=\"pplBack\">0</div><div class=\"lbl\">came back in days 2 to 7</div></div>\n          </div>\n          <p class=\"hint\">Fit Hard's core action: a first morning check in saved. Activation counts signups who did it within 7 days.</p>\n        </div>\n\n        <div class=\"card\" data-panel=\"money\" hidden>\n          <h2 style=\"margin-top:0\">Money</h2>\n          <div class=\"grid\">\n            <div><div class=\"num\" id=\"monPaying\">0</div><div class=\"lbl\">paying members</div></div>\n            <div><div class=\"num\" id=\"monPending\">0</div><div class=\"lbl\">cancels pending (still in their paid time)</div></div>\n            <div><div class=\"num\" id=\"monEnded\">0</div><div class=\"lbl\">cancels ended</div></div>\n            <div><div class=\"num\" id=\"monFailed\">0</div><div class=\"lbl\">failed payments</div></div>\n          </div>\n          <h3>Monthly estimate</h3>\n          <p><span class=\"num\" id=\"monMrr\">0</span></p>\n          <p class=\"hint\" id=\"monMrrNote\">An estimate for steering only. The payment provider is the accounting truth.</p>\n          <h3>Why people left (one line each)</h3>\n          <table id=\"monReasons\"><thead><tr><th>Week</th><th>Reason</th></tr></thead><tbody></tbody></table>\n          <p class=\"hint\" id=\"monReasonsEmpty\">No cancels recorded yet.</p>\n        </div>\n\n        <div class=\"card\" data-panel=\"reviews\" hidden>\n          <h2 style=\"margin-top:0\">Reviews</h2>\n          <div class=\"grid\">\n            <div><div class=\"num\" id=\"revCount\">0</div><div class=\"lbl\">reviews, all stores</div></div>\n            <div><div class=\"num\" id=\"revStrangers\">0</div><div class=\"lbl\">notes from people you do not know</div></div>\n          </div>\n          <label>Reviews count (kept by hand until a store feed connects)<input id=\"revCountIn\" type=\"number\" min=\"0\" step=\"1\"></label>\n          <label>Stranger replies count<input id=\"revStrangersIn\" type=\"number\" min=\"0\" step=\"1\"></label>\n          <p><button class=\"act\" id=\"revSave\">Save</button> <span class=\"hint\" id=\"revSaved\"></span></p>\n        </div>\n\n        <div class=\"card\" data-panel=\"outreach\" hidden>\n          <h2 style=\"margin-top:0\">Cold email</h2>\n          <p id=\"outState\" class=\"hint\">Not running yet. This area opens when outreach starts.</p>\n          <div class=\"grid\" id=\"outGrid\" hidden>\n            <div><div class=\"num\" id=\"outCampaigns\">0</div><div class=\"lbl\">campaigns</div></div>\n            <div><div class=\"num\" id=\"outSent\">0</div><div class=\"lbl\">sent</div></div>\n            <div><div class=\"num\" id=\"outReplies\">0</div><div class=\"lbl\">replies</div></div>\n          </div>\n        </div>\n\n        <div class=\"card\" data-panel=\"community\" hidden>\n          <h2 style=\"margin-top:0\">Facebook groups</h2>\n          <table id=\"grpTable\"><thead><tr><th>Group</th><th>Members</th><th>Growth this week</th><th>Posts</th><th>Source</th></tr></thead><tbody></tbody></table>\n          <p class=\"hint\" id=\"grpEmpty\">No groups tracked yet.</p>\n          <h3>Add or update a group (kept by hand, labelled as such)</h3>\n          <label>Group name<input id=\"grpName\" type=\"text\"></label>\n          <label>Members<input id=\"grpMembers\" type=\"number\" min=\"0\" step=\"1\"></label>\n          <label>Growth this week<input id=\"grpGrowth\" type=\"number\" step=\"1\"></label>\n          <label>Posts this week<input id=\"grpPosts\" type=\"number\" min=\"0\" step=\"1\"></label>\n          <p><button class=\"act\" id=\"grpSave\">Save group</button> <span class=\"hint\" id=\"grpSaved\"></span></p>\n        </div>\n\n        <div class=\"card\" data-panel=\"avatars\" hidden>\n          <h2 style=\"margin-top:0\">Avatars</h2>\n          <p class=\"hint\">Fit Hard's own presenters only. Views and sales roll up from the per piece feed.</p>\n          <table id=\"avTable\"><thead><tr><th>Avatar</th><th>Views</th><th>Views this week</th><th>Sales</th><th>Sales amount</th></tr></thead><tbody></tbody></table>\n          <p class=\"hint\" id=\"avEmpty\">No avatars for Fit Hard yet.</p>\n        </div>\n      </div>\n    </div>\n    <p><button class=\"ghost\" id=\"dashOut\">Sign out</button></p>\n  </section>";
let shellMounted = false;
function mountShell() {
  if (shellMounted) return;
  shellMounted = true;
  $("ownerMount").innerHTML = SHELL;
  bindShell();
}
function unmountShell() {
  shellMounted = false;
  const m = $("ownerMount");
  if (m) m.innerHTML = "";
}
function bindShell() {
$("dashNav").addEventListener("click", function (e) {
  const b = e.target.closest("button[data-sec]"); if (!b) return;
  document.querySelectorAll("#dashNav button").forEach(function (x) { x.classList.toggle("on", x === b); });
  document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== b.getAttribute("data-sec"); });
});
$("revSave").addEventListener("click", async function () {
  aggregates.reviews = { count: Number($("revCountIn").value) || 0, strangerReplies: Number($("revStrangersIn").value) || 0 };
  try { await saveAggregates($("revSaved")); render(); } catch (e) { $("revSaved").textContent = "Could not save."; }
});
$("grpSave").addEventListener("click", async function () {
  const name = $("grpName").value.trim(); if (!name) return;
  const row = { name: name, members: Number($("grpMembers").value) || 0, growthWeek: Number($("grpGrowth").value) || 0, posts: Number($("grpPosts").value) || 0, source: "by hand" };
  const groups = Array.isArray(aggregates.groups) ? aggregates.groups.slice() : [];
  const i = groups.findIndex(function (g) { return g.name === name; });
  if (i === -1) groups.push(row); else groups[i] = row;
  aggregates.groups = groups;
  try { await saveAggregates($("grpSaved")); render(); } catch (e) { $("grpSaved").textContent = "Could not save."; }
});
}

async function loadDashboard(user) {
  /* The owner record is the door: the rules let only the
     owner read it, so a successful read that names this
     uid is the whole check. Anything else is a plain no. */
  let ownerUid = null;
  try {
    const snap = await getDoc(doc(db, "_owner", "config"));
    if (snap.exists()) ownerUid = snap.data().ownerUid || null;
  } catch (e) { ownerUid = null; }
  if (!ownerUid || ownerUid !== user.uid) { mountShell(); show("deniedBox"); return; }
  try {
    const agg = await getDoc(doc(db, "_owner", "aggregates"));
    aggregates = agg.exists() ? (agg.data() || {}) : {};
  } catch (e) { aggregates = {}; }
  feedRows = [];
  try {
    const feeds = await getDocs(collection(db, "_owner", "feeds"));
    feeds.forEach(function (d) { feedRows.push(d.data() || {}); });
  } catch (e) { feedRows = []; }
  mountShell();
  $("whoLine").textContent = user.email || "";
  render();
  show("dashBox");
}

function render() {
  const a = aggregates || {};
  const s = a.signups || {}, act = a.activation || {}, cx = a.cancels || {};
  const weeks = Array.isArray(s.weekly) ? s.weekly : [];
  $("ovJoined").textContent = num(s.thisWeek);
  $("ovMoney").textContent = num(a.paying);
  $("ovLeaving").textContent = num(cx.pending) + num(cx.ended);
  const tb = $("ovWeeks").querySelector("tbody");
  tb.innerHTML = weeks.map(function (w) {
    return "<tr><td>" + esc(w.week) + "</td><td>" + num(w.count) + "</td></tr>";
  }).join("");
  $("ovEmpty").hidden = weeks.length > 0;
  $("pplTotal").textContent = num(s.total);
  $("pplWeek").textContent = num(s.thisWeek);
  $("pplAct").textContent = num(act.within7d);
  $("pplBack").textContent = num(a.returning7d);
  $("monPaying").textContent = num(a.paying);
  $("monPending").textContent = num(cx.pending);
  $("monEnded").textContent = num(cx.ended);
  $("monFailed").textContent = num(a.failedPayments);
  const mrr = a.mrrEstimate || {};
  $("monMrr").textContent = num(mrr.amount);
  if (mrr.note) $("monMrrNote").textContent = String(mrr.note);
  const reasons = Array.isArray(cx.reasons) ? cx.reasons : [];
  $("monReasons").querySelector("tbody").innerHTML = reasons.map(function (r) {
    return "<tr><td>" + esc(r.week) + "</td><td>" + esc(r.text) + "</td></tr>";
  }).join("");
  $("monReasonsEmpty").hidden = reasons.length > 0;
  const rv = a.reviews || {};
  $("revCount").textContent = num(rv.count);
  $("revStrangers").textContent = num(rv.strangerReplies);
  if (document.activeElement !== $("revCountIn")) $("revCountIn").value = num(rv.count);
  if (document.activeElement !== $("revStrangersIn")) $("revStrangersIn").value = num(rv.strangerReplies);
  const ce = a.coldEmail || {};
  const running = !!ce.running;
  $("outState").hidden = running;
  $("outGrid").hidden = !running;
  if (running) {
    $("outCampaigns").textContent = num(ce.campaigns);
    $("outSent").textContent = num(ce.sent);
    $("outReplies").textContent = num(ce.replies);
  }
  const groups = Array.isArray(a.groups) ? a.groups : [];
  $("grpTable").querySelector("tbody").innerHTML = groups.map(function (g) {
    return "<tr><td>" + esc(g.name) + "</td><td>" + num(g.members) + "</td><td>" +
      num(g.growthWeek) + "</td><td>" + num(g.posts) + "</td><td>" + esc(g.source || "by hand") + "</td></tr>";
  }).join("");
  $("grpEmpty").hidden = groups.length > 0;
  /* Avatars: roll the per-piece feed up per avatar (v2 §3). */
  const byAvatar = {};
  feedRows.forEach(function (r) {
    if (!r.avatarId) return;
    const k = String(r.avatarId);
    const cur = byAvatar[k] || { name: r.avatarName || k, views: 0, viewsWeek: 0, sales: 0, amount: 0 };
    cur.views += num(r.views);
    cur.viewsWeek += num(r.viewsWeek);
    cur.sales += num(r.salesCount);
    cur.amount += num(r.salesAmount);
    byAvatar[k] = cur;
  });
  const avatars = Object.keys(byAvatar).map(function (k) { return byAvatar[k]; });
  $("avTable").querySelector("tbody").innerHTML = avatars.map(function (v) {
    return "<tr><td>" + esc(v.name) + "</td><td>" + v.views + "</td><td>" + v.viewsWeek +
      "</td><td>" + v.sales + "</td><td>" + v.amount + "</td></tr>";
  }).join("");
  $("avEmpty").hidden = avatars.length > 0;
}

async function saveAggregates(noteEl) {
  await setDoc(doc(db, "_owner", "aggregates"), aggregates);
  if (noteEl) { noteEl.textContent = "Saved."; setTimeout(function () { noteEl.textContent = ""; }, 2500); }
}

$("doorSignIn").addEventListener("click", async function () {
  const email = $("doorEmail").value.trim();
  const pw = $("doorPass").value;
  if (!email) { msg("Type your email first."); return; }
  if (!pw) { msg("Type your password too."); return; }
  try { await signInWithEmailAndPassword(auth, email, pw); }
  catch (e) { msg("That email and password do not match."); }
});
$("doorGoogle").addEventListener("click", async function () {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { msg("Google sign in did not finish."); }
});
$("doorApple").addEventListener("click", async function () {
  try { await signInWithPopup(auth, new OAuthProvider("apple.com")); } catch (e) { msg("Apple sign in did not finish."); }
});
$("deniedOut").addEventListener("click", function () { signOut(auth); });
$("dashOut").addEventListener("click", function () { signOut(auth); });

onAuthStateChanged(auth, function (user) {
  if (!user) { $("whoLine").textContent = ""; unmountShell(); show("doorBox"); return; }
  loadDashboard(user);
});

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
  ["doorBox", "deniedBox", "dashBox"].forEach(function (b) { $(b).hidden = b !== id; });
}
function msg(t) { $("doorMsg").textContent = t || ""; }

async function loadDashboard(user) {
  /* The owner record is the door: the rules let only the
     owner read it, so a successful read that names this
     uid is the whole check. Anything else is a plain no. */
  let ownerUid = null;
  try {
    const snap = await getDoc(doc(db, "_owner", "config"));
    if (snap.exists()) ownerUid = snap.data().ownerUid || null;
  } catch (e) { ownerUid = null; }
  if (!ownerUid || ownerUid !== user.uid) { show("deniedBox"); return; }
  try {
    const agg = await getDoc(doc(db, "_owner", "aggregates"));
    aggregates = agg.exists() ? (agg.data() || {}) : {};
  } catch (e) { aggregates = {}; }
  feedRows = [];
  try {
    const feeds = await getDocs(collection(db, "_owner", "feeds"));
    feeds.forEach(function (d) { feedRows.push(d.data() || {}); });
  } catch (e) { feedRows = []; }
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
  if (!user) { $("whoLine").textContent = ""; show("doorBox"); return; }
  loadDashboard(user);
});

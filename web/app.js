import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

const timeFmt = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("sv-SE", { month: "short", day: "numeric" });
const isoDay = (date) => date.toLocaleDateString("sv-SE");
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let chart;
let channel;

// ---------- Auth ----------

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const { error } = await supabase.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("password"),
  });
  $("login-error").hidden = !error;
  if (error) $("login-error").textContent = error.message;
});

$("sign-out").addEventListener("click", () => supabase.auth.signOut());

supabase.auth.onAuthStateChange((_event, session) => {
  const signedIn = Boolean(session);
  $("login").hidden = signedIn;
  $("app").hidden = !signedIn;
  $("sign-out").hidden = !signedIn;
  if (signedIn) start();
  else stop();
});

// ---------- Data ----------

async function loadKpis() {
  const today = isoDay(new Date());
  const monthAgo = isoDay(new Date(Date.now() - 30 * 86_400_000));

  const { data, error } = await supabase
    .from("daily_booking_stats")
    .select("*")
    .gte("day", monthAgo)
    .lte("day", today);
  if (error) return console.error(error);

  const sum = (key) => data.reduce((total, row) => total + row[key], 0);
  $("kpi-today").textContent = data.find((row) => row.day === today)?.booked ?? 0;
  $("kpi-late").textContent = sum("late_cancellations");
  $("kpi-noshow").textContent = sum("no_shows");
}

async function loadMissed() {
  const { data, error } = await supabase
    .from("missed_bookings")
    .select("booking_id, starts_at, booking_type_name, minutes_late, is_new_patient")
    .order("starts_at", { ascending: false });
  if (error) return console.error(error);

  $("kpi-missed").textContent = data.length;
  $("missed-empty").hidden = data.length > 0;
  $("missed-list").replaceChildren(...data.map(missedRow));
}

function missedRow(booking) {
  const li = document.createElement("li");
  li.innerHTML = `
    <span class="time">${timeFmt.format(new Date(booking.starts_at))}</span>
    <span>
      ${esc(booking.booking_type_name ?? "Booking")} ${booking.is_new_patient ? '<span class="tag">New patient</span>' : ""}
      <br><span class="late">${booking.minutes_late} min late</span>
    </span>
    <button class="small">Show contact</button>
    <span class="contact" hidden></span>`;

  const button = li.querySelector("button");
  const contact = li.querySelector(".contact");
  button.addEventListener("click", async () => {
    button.disabled = true;
    const { data, error } = await supabase.functions.invoke("patient-contact", {
      body: { booking_id: booking.booking_id },
    });
    contact.hidden = false;
    button.hidden = true;
    if (error) {
      contact.innerHTML = `<span class="warn">Could not load contact details.</span>`;
    } else if (data.protected_identity) {
      contact.innerHTML = `<span class="warn">Protected identity – look up in Muntra.</span>`;
    } else {
      contact.textContent = `${data.first_name ?? ""} ${data.last_name ?? ""} · ${data.phone_number_cell ?? "no mobile number"}`;
      if (data.do_not_contact) {
        contact.insertAdjacentHTML("beforeend", ` <span class="warn">· prefers not to be contacted</span>`);
      }
    }
  });
  return li;
}

async function loadEvents() {
  const { data, error } = await supabase
    .from("booking_events")
    .select("booking_id, trigger, status, starts_at, received_at")
    .order("received_at", { ascending: false })
    .limit(12);
  if (error) return console.error(error);

  $("event-empty").hidden = data.length > 0;
  $("event-list").replaceChildren(
    ...data.map((event) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="time">${timeFmt.format(new Date(event.received_at))}</span>
        <span>#${event.booking_id} · ${esc(event.status)} ${event.starts_at ? "· " + dayFmt.format(new Date(event.starts_at)) : ""}</span>
        <span class="tag ${esc(event.trigger)}">${esc(event.trigger)}</span>`;
      return li;
    }),
  );
}

async function loadChart() {
  const from = new Date(Date.now() - 30 * 86_400_000);
  const to = new Date(Date.now() + 14 * 86_400_000);

  const { data, error } = await supabase
    .from("daily_booking_stats")
    .select("*")
    .gte("day", isoDay(from))
    .lte("day", isoDay(to))
    .order("day");
  if (error) return console.error(error);

  const byDay = new Map(data.map((row) => [row.day, row]));
  const days = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) days.push(isoDay(d));

  const series = (key) => days.map((day) => byDay.get(day)?.[key] ?? 0);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue("--accent").trim();
  const alert = css.getPropertyValue("--alert").trim();
  const muted = css.getPropertyValue("--muted").trim();

  const config = {
    type: "bar",
    data: {
      labels: days.map((day) => dayFmt.format(new Date(day))),
      datasets: [
        { label: "Booked", data: series("booked"), backgroundColor: accent, borderRadius: 4, stack: "a" },
        { label: "Cancelled", data: series("cancelled"), backgroundColor: muted, borderRadius: 4, stack: "a" },
        { label: "No-shows", data: series("no_shows"), backgroundColor: alert, borderRadius: 4, stack: "b" },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: muted, boxWidth: 12 } } },
      scales: {
        x: { stacked: true, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { color: muted, precision: 0 } },
      },
    },
  };

  if (chart) {
    chart.data = config.data;
    chart.update();
  } else {
    chart = new Chart($("daily-chart"), config);
  }
}

async function refresh() {
  await Promise.all([loadKpis(), loadMissed(), loadEvents(), loadChart()]);
}

// ---------- Live updates ----------

let refreshTimer;

function start() {
  refresh();
  refreshTimer = setInterval(refresh, 60_000);
  channel = supabase
    .channel("bookings")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, refresh)
    .subscribe((status) => $("live-dot").classList.toggle("live", status === "SUBSCRIBED"));
}

function stop() {
  clearInterval(refreshTimer);
  if (channel) supabase.removeChannel(channel);
  channel = null;
  $("live-dot").classList.remove("live");
}

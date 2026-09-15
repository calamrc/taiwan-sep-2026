import {
  formatDistance,
  heroKicker,
  mapsUrl,
  pickTheme,
  listedStops,
  resolveGuide,
  screenStamp,
  shouldLeaveNow,
  statusLine,
} from "./logic.js";

const THEME_BG = {
  airport: "#07090c",
  hotel: "#0b0a08",
  temple: "#120806",
  night: "#0a0610",
  mountain: "#0a100c",
  zoo: "#0a1208",
  coast: "#071018",
  taichung: "#140c08",
  forest: "#07120c",
  city: "#0c0c0e",
};

const state = {
  trip: null,
  now: new Date(),
  position: null,
  peekedDayId: null,
  openId: null,
  geo: "asking",
};

let lastStamp = null;

function formatClock(hhmm) {
  if (!hhmm) return "";
  const [hour, minute] = hhmm.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function showHotel(trip, now) {
  return now.getTime() < new Date(trip.hotel.until).getTime();
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    root.dataset.theme = theme;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.remove("flash");
      void root.offsetWidth;
      root.classList.add("flash");
    }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_BG[theme] || THEME_BG.city;
}

function chips(stop, origin) {
  const bits = [];
  if (stop.maps !== false) {
    const href = mapsUrl(stop, origin);
    if (href) bits.push(`<a class="chip" href="${href}">Maps from here</a>`);
  }
  if (stop.price) bits.push(`<span class="chip ghost">${stop.price}</span>`);
  if (stop.booked) bits.push(`<span class="chip ghost">${stop.booked}</span>`);
  return bits.join("");
}

function bullets(items) {
  if (!items?.length) return "";
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function stopDetail(stop) {
  const how = stop.transit?.length
    ? `<div class="block"><div class="kicker">How to go</div>${bullets(stop.transit)}</div>`
    : "";
  const rain = stop.rainy
    ? `<div class="block rain"><div class="kicker">If rain</div>${stop.rainy}</div>`
    : "";
  const links = (stop.links || [])
    .map((href) => `<div class="block"><a href="${href}">Reservation / info</a></div>`)
    .join("");
  return `${how}${rain}${links}`;
}

function stopCard(stop, origin, open, past) {
  const place = [stop.place, stop.address].filter(Boolean)[0] || "";
  const cls = ["stop", open && "open", past && "past"].filter(Boolean).join(" ");
  return `<button class="${cls}" data-toggle="${stop.id}">
    <div class="stop-time">${formatClock(stop.time) || "—"}</div>
    <div>
      <div class="title">${stop.title}</div>
      <div class="meta">${place}</div>
      <div class="detail">
        <div class="chips">${chips(stop, origin)}</div>
        ${stopDetail(stop)}
      </div>
    </div>
  </button>`;
}

function heroCard(guide, origin, leaveNow) {
  const stop = guide.highlightStop;
  if (!stop) return `<div class="hero"><div class="title">That's the day</div></div>`;
  const showNextDist =
    guide.nextStop &&
    guide.highlightStop &&
    guide.highlightStop.id === guide.nextStop.id;
  const dist = showNextDist ? formatDistance(guide.nextDistanceM) : null;
  const placeBits = [stop.place, dist].filter(Boolean).join(" · ");
  const late = guide.behindMinutes > 0 ? " late" : "";
  const open = state.openId === stop.id ? " open" : "";
  return `<div class="hero${late}">
    <div class="kicker">${heroKicker(guide, leaveNow)}</div>
    <div class="time">${formatClock(stop.time)}</div>
    <div class="title">${stop.title}</div>
    <div class="meta">${placeBits}</div>
    <div class="chips">${chips(stop, origin)}</div>
    <button class="more${open}" data-toggle="${stop.id}">
      How to go <span class="caret">${open ? "▴" : "▾"}</span>
      <div class="detail">${stopDetail(stop)}</div>
    </button>
  </div>`;
}

function dayButtons(days, viewingId) {
  return days
    .map((day) => {
      const on = day.id === viewingId ? " on" : "";
      const num = day.label.replace(/Day\s+/i, "").padStart(2, "0");
      const wk = (day.weekday || "").slice(0, 3);
      return `<button class="day${on}" data-day="${day.id}"><b>${num}</b><span>${wk}</span></button>`;
    })
    .join("");
}

function extraBlock(day, origin) {
  const extras = (day.extras || [])
    .map((extra) => {
      const href = mapsUrl(extra, origin) || "#";
      return `<a class="extra" href="${href}">${extra.title}<span>${extra.place || extra.note || ""}</span></a>`;
    })
    .join("");
  if (!extras) return "";
  return `<div class="extras"><div class="kicker">If we have time nearby</div><div class="strip">${extras}</div></div>`;
}

function render() {
  const { trip, now, position, peekedDayId } = state;
  const guide = resolveGuide({ days: trip.days, now, position, peekedDayId });
  const origin = position;
  const leaveNow = shouldLeaveNow(guide, now);
  const stamp = screenStamp(guide, {
    openId: state.openId,
    geo: state.geo,
    hotel: showHotel(trip, now),
    leaveNow,
  });
  if (stamp === lastStamp) return;
  lastStamp = stamp;
  applyTheme(pickTheme(guide));
  const listed = listedStops(guide.viewingDay.stops || [], guide.highlightStop);
  const hotel = showHotel(trip, now)
    ? `<a class="hotel" href="${mapsUrl(trip.hotel, origin)}">Hotel</a>`
    : "";
  const highlightId = guide.highlightStop && guide.highlightStop.id;
  const rows = listed
    .map((item) =>
      item.stop.id === highlightId
        ? heroCard(guide, origin, leaveNow)
        : stopCard(item.stop, origin, state.openId === item.stop.id, item.past)
    )
    .join("");
  const done = highlightId ? "" : heroCard(guide, origin, leaveNow);

  document.getElementById("app").innerHTML = `
    <div class="lightbar"></div>
    <div class="top">
      <div>
        <div class="kicker">${trip.title} · ${guide.viewingDay.weekday} ${guide.viewingDay.date.slice(5).replace("-", "/")}</div>
        <h1>${guide.viewingDay.label} · ${guide.viewingDay.title}</h1>
      </div>
      ${hotel}
    </div>
    <div class="status">${statusLine(state.geo, guide.isPeeking)}</div>
    <div class="days">${dayButtons(trip.days, guide.viewingDay.id)}</div>
    ${rows}
    ${done}
    ${extraBlock(guide.viewingDay, origin)}
  `;
}

function onClick(event) {
  const dayBtn = event.target.closest("[data-day]");
  if (dayBtn) {
    const id = dayBtn.getAttribute("data-day");
    const today = resolveGuide({
      days: state.trip.days,
      now: state.now,
      position: state.position,
    }).calendarDay.id;
    state.peekedDayId = id === today ? null : id;
    render();
    return;
  }
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    const id = toggle.getAttribute("data-toggle");
    state.openId = state.openId === id ? null : id;
    render();
  }
}

async function boot() {
  state.trip = await (await fetch("./itinerary.json")).json();
  document.addEventListener("click", onClick);
  render();
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        state.position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.geo = "on";
        render();
      },
      () => {
        state.geo = "off";
        render();
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 }
    );
  } else {
    state.geo = "off";
  }
  setInterval(() => {
    state.now = new Date();
    render();
  }, 30000);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update());
  }
}

boot();

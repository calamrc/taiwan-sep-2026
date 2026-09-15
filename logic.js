export const VERSION = "8";
const ARRIVE_RADIUS_M = 150;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function statusLine(geo, isPeeking) {
  let loc = "Waiting for location";
  if (geo === "off") loc = "Location off — clock only";
  if (geo === "on") loc = "Clock + GPS";
  const peek = isPeeking ? " · peeking" : "";
  return `${loc}${peek} · v${VERSION}`;
}

export function distanceMeters(a, b) {
  const earthM = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthM * Math.asin(Math.sqrt(h));
}

export function isArrived(position, stop, radiusM = ARRIVE_RADIUS_M) {
  if (!position || stop.lat == null || stop.lng == null) return false;
  return distanceMeters(position, { lat: stop.lat, lng: stop.lng }) <= radiusM;
}

export function taipeiYmd(now) {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

export function pickCalendarDay(days, now) {
  const ymd = taipeiYmd(now);
  return days.find((day) => day.date === ymd) || days[0] || null;
}

function stopDateTime(day, stop) {
  if (!stop?.time) return null;
  return new Date(`${day.date}T${stop.time}:00+08:00`);
}

function latestArrivedIndex(stops, position, day, now) {
  let arrivedIdx = -1;
  if (!position) return arrivedIdx;
  for (let i = 0; i < stops.length; i += 1) {
    if (!isArrived(position, stops[i])) continue;
    const when = stopDateTime(day, stops[i]);
    if (when && when.getTime() - now.getTime() > 30 * 60 * 1000) continue;
    arrivedIdx = i;
  }
  return arrivedIdx;
}

function pickTimeNext(day, stops, now) {
  const upcoming = stops.find((stop) => {
    const when = stopDateTime(day, stop);
    return when && when.getTime() > now.getTime();
  });
  return upcoming || stops[stops.length - 1] || null;
}

function distanceTo(stop, position) {
  if (!stop || !position || stop.lat == null || stop.lng == null) return null;
  return distanceMeters(position, { lat: stop.lat, lng: stop.lng });
}

function minutesBehind(day, stop, now, position) {
  if (!stop) return 0;
  if (isArrived(position, stop)) return 0;
  const when = stopDateTime(day, stop);
  if (!when || now.getTime() <= when.getTime()) return 0;
  return Math.round((now.getTime() - when.getTime()) / 60000);
}

export function shouldLeaveNow(guide, now) {
  const stop = guide.nextStop;
  const when = stopDateTime(guide.viewingDay, stop);
  if (!when) return false;
  const until = Math.round((when.getTime() - now.getTime()) / 60000);
  return until <= 30 && until >= 0 && (guide.nextDistanceM || 0) > 150;
}

export function heroKicker(guide, leaveNow) {
  const base = guide.hereStop ? "You are here" : "Next up";
  if (guide.behindMinutes > 0) return `${base} · ${guide.behindMinutes} min behind`;
  if (leaveNow) return `${base} · leave now`;
  return base;
}

function viewingState(days, now, peekedDayId) {
  const calendarDay = pickCalendarDay(days, now);
  const peeked = peekedDayId && days.find((day) => day.id === peekedDayId);
  const viewingDay = peeked || calendarDay;
  const isPeeking = Boolean(peeked && peeked.id !== calendarDay.id);
  return { calendarDay, viewingDay, isPeeking, stops: viewingDay?.stops || [] };
}

export function resolveGuide({ days, now, position, peekedDayId }) {
  const { calendarDay, viewingDay, isPeeking, stops } = viewingState(
    days,
    now,
    peekedDayId
  );
  const arrivedIdx = isPeeking
    ? -1
    : latestArrivedIndex(stops, position, viewingDay, now);
  const hereStop = arrivedIdx >= 0 ? stops[arrivedIdx] : null;
  let nextStop = arrivedIdx >= 0 ? stops[arrivedIdx + 1] || null : null;
  if (!hereStop) {
    nextStop = isPeeking ? stops[0] || null : pickTimeNext(viewingDay, stops, now);
  }
  return {
    calendarDay,
    viewingDay,
    isPeeking,
    hereStop,
    nextStop,
    highlightStop: hereStop || nextStop,
    nextDistanceM: distanceTo(nextStop, position),
    behindMinutes: minutesBehind(viewingDay, nextStop, now, position),
  };
}

export function mapsUrl(stop, origin) {
  if (!stop) return null;
  const dest =
    stop.lat != null && stop.lng != null
      ? `${stop.lat},${stop.lng}`
      : stop.address || stop.place || stop.title;
  if (!dest) return null;
  const params = new URLSearchParams({ api: "1", destination: dest });
  if (origin && origin.lat != null) {
    params.set("origin", `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function nextStopIndex(stops, nextStop) {
  if (!nextStop) return -1;
  for (let index = 0; index < stops.length; index += 1) {
    if (stops[index].id === nextStop.id) return index;
  }
  return -1;
}

export function listedStops(stops, nextStop, hereStop) {
  const highlightIdx = nextStopIndex(stops, hereStop || nextStop);
  const listed = [];
  for (let index = 0; index < stops.length; index += 1) {
    const isPast = highlightIdx < 0 || index < highlightIdx;
    listed.push({ stop: stops[index], past: isPast });
  }
  return listed;
}

export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
}

export function pickFetchBody(fresh, cached) {
  return fresh || cached;
}

function stopId(stop) {
  return stop && stop.id ? stop.id : "";
}

function stampPart(value) {
  if (value == null || value === false) return "";
  if (value === true) return "1";
  return String(value);
}

export function screenStamp(guide, extra) {
  extra = extra || {};
  return [
    stopId(guide.viewingDay),
    stopId(guide.hereStop),
    stopId(guide.nextStop),
    stampPart(guide.isPeeking),
    stampPart(guide.behindMinutes),
    pickTheme(guide),
    stampPart(extra.openId),
    stampPart(extra.geo),
    stampPart(extra.hotel),
    stampPart(extra.leaveNow),
  ].join("|");
}

const THEME_RULES = [
  ["airport", /naia|taoyuan|flight|airport|\btpe\b|immigration|easycard/i],
  ["hotel", /mayer inn|check in|check out|\bhotel\b/i],
  ["temple", /lungshan|zhinan temple|\bcks\b|memorial hall|\btemple\b/i],
  ["zoo", /taipei zoo|\bzoo\b|capybara/i],
  ["mountain", /maokong|gondola|tea house|redwood/i],
  ["coast", /yehliu|shifen|jiufen|north coast|fun journey/i],
  ["taichung", /taichung|rainbow village|miyahara|zhongshe|painted animation|second market|chun shui|houli|xinwuri|\bwuri\b/i],
  ["forest", /wulai|waterfall|yun hsien|suspension bridge|scenic train|lansheng/i],
  ["night", /ximend|ningxia|raohe|night market|rainbow road|\bximen\b/i],
];

function matchTheme(hay) {
  if (!hay) return null;
  const hit = THEME_RULES.find(([, re]) => re.test(hay));
  return hit ? hit[0] : null;
}

function haystack(parts) {
  return parts.filter(Boolean).join(" ");
}

export function pickTheme(guide) {
  const stop = guide.hereStop || guide.nextStop;
  const fromTitle = matchTheme(stop?.title);
  if (fromTitle) return fromTitle;
  const fromPlace = matchTheme(haystack([stop?.place, stop?.address]));
  if (fromPlace) return fromPlace;
  if (stop?.place || stop?.address) return "city";
  const day = guide.viewingDay || {};
  return matchTheme(haystack([day.title, day.label])) || "city";
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { isArrived, heroKicker, listedStops, pickCalendarDay, pickFetchBody, pickTheme, resolveGuide, screenStamp, shouldLeaveNow, statusLine } from "./logic.js";

const day0 = {
  id: "day-0",
  date: "2026-09-15",
  label: "Day 0",
  title: "Fly out",
  stops: [
    { id: "airport", time: "19:00", title: "Travel to airport" },
    { id: "flight", time: "23:35", title: "Flight to Taiwan" },
  ],
};

const day1 = {
  id: "day-1",
  date: "2026-09-16",
  label: "Day 1",
  title: "Arrival",
  stops: [
    {
      id: "capy",
      time: "09:00",
      title: "Capybara Knight Cafe",
      place: "Tucheng",
      lat: 25.0,
      lng: 121.0,
    },
    {
      id: "lungshan",
      time: "11:00",
      title: "Lungshan Temple",
      place: "Wanhua",
      lat: 25.04,
      lng: 121.5,
    },
    {
      id: "ximen",
      time: "11:45",
      title: "Ximending",
      place: "Rainbow Road",
      lat: 25.042,
      lng: 121.508,
    },
  ],
};

const day4 = {
  id: "day-4",
  date: "2026-09-19",
  label: "Day 4",
  title: "Taichung",
  stops: [{ id: "hsr", time: "07:00", title: "Ride HSR to Taichung" }],
};

const days = [day0, day1, day4];
const capy = day1.stops[0];
const nearCapy = { lat: 25.00045, lng: 121.0 };
const farFromCapy = { lat: 25.0018, lng: 121.0 };
const hotel = { lat: 25.046, lng: 121.517 };

function at(iso) {
  return new Date(iso);
}

test("isArrived is true within 150 m of a stop", () => {
  assert.equal(isArrived(nearCapy, capy), true);
});

test("isArrived is false beyond 150 m", () => {
  assert.equal(isArrived(farFromCapy, capy), false);
});

test("isArrived is false when the stop has no coordinates", () => {
  assert.equal(isArrived(nearCapy, { title: "Wake up" }), false);
});

test("pickCalendarDay follows the phone date in UTC+8", () => {
  const day = pickCalendarDay(days, at("2026-09-16T08:50:00+08:00"));
  assert.equal(day.id, "day-1");
});

test("at the hotel before 9:00, next up is Capybara and here is empty", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T08:50:00+08:00"),
    position: hotel,
  });
  assert.equal(g.hereStop, null);
  assert.equal(g.nextStop.id, "capy");
  assert.equal(g.highlightStop.id, "capy");
  assert.equal(g.behindMinutes, 0);
  assert.ok(g.nextDistanceM > 1000);
});

test("within 150 m of Capybara, that stop becomes you-are-here and Lungshan is next", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T10:08:00+08:00"),
    position: nearCapy,
  });
  assert.equal(g.hereStop.id, "capy");
  assert.equal(g.nextStop.id, "lungshan");
  assert.equal(g.highlightStop.id, "capy");
});

test("still at Capybara after 11:00 does not skip ahead; Lungshan is behind", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T11:25:00+08:00"),
    position: nearCapy,
  });
  assert.equal(g.hereStop.id, "capy");
  assert.equal(g.nextStop.id, "lungshan");
  assert.equal(g.highlightStop.id, "capy");
  assert.equal(g.behindMinutes, 25);
});

test("at Lungshan after 11:00, location clears late for that stop", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T11:25:00+08:00"),
    position: { lat: 25.04, lng: 121.5 },
  });
  assert.equal(g.hereStop.id, "lungshan");
  assert.equal(g.highlightStop.id, "lungshan");
  assert.equal(g.nextStop.id, "ximen");
  assert.equal(g.behindMinutes, 0);
});

test("without GPS, 8:50 uses the clock and picks Capybara", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T08:50:00+08:00"),
    position: null,
  });
  assert.equal(g.hereStop, null);
  assert.equal(g.nextStop.id, "capy");
  assert.equal(g.highlightStop.id, "capy");
});

test("without GPS after 11:00, the clock stays on the started stop", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T11:25:00+08:00"),
    position: null,
  });
  assert.equal(g.highlightStop.id, "lungshan");
  assert.equal(g.nextStop.id, "ximen");
});

test("at 4:41 the hero is check-in rest, not breakfast at 8", () => {
  const day = {
    id: "day-1",
    date: "2026-09-16",
    stops: [
      { id: "checkin", time: "04:00", title: "Check in · rest" },
      { id: "breakfast", time: "08:00", title: "Breakfast" },
      { id: "capy", time: "09:00", title: "Capybara" },
    ],
  };
  const g = resolveGuide({
    days: [day],
    now: at("2026-09-16T04:41:00+08:00"),
    position: null,
  });
  assert.equal(g.highlightStop.id, "checkin");
  assert.equal(g.nextStop.id, "breakfast");
  assert.equal(g.behindMinutes, 0);
  assert.equal(heroKicker(g, false), "Now");
});

test("peeking another day does not apply GPS from today", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T10:08:00+08:00"),
    position: nearCapy,
    peekedDayId: "day-4",
  });
  assert.equal(g.isPeeking, true);
  assert.equal(g.viewingDay.id, "day-4");
  assert.equal(g.hereStop, null);
  assert.equal(g.nextStop.id, "hsr");
});

test("peeking a past day still opens on that day's first stop", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T10:08:00+08:00"),
    position: nearCapy,
    peekedDayId: "day-0",
  });
  assert.equal(g.isPeeking, true);
  assert.equal(g.nextStop.id, "airport");
});

test("the evening hotel pin does not steal Next up in the morning", () => {
  const pin = { lat: 25.046, lng: 121.517 };
  const day = {
    id: "day-x",
    date: "2026-09-16",
    stops: [
      { id: "checkin", time: "04:00", title: "Check in", ...pin },
      { id: "capy", time: "09:00", title: "Capybara", lat: 25.0, lng: 121.0 },
      { id: "home", time: "22:30", title: "Back to hotel", ...pin },
    ],
  };
  const g = resolveGuide({
    days: [day],
    now: at("2026-09-16T08:50:00+08:00"),
    position: pin,
  });
  assert.equal(g.nextStop.id, "capy");
  assert.notEqual(g.hereStop?.id, "home");
});

test("listedStops keeps earlier stops as past after the clock moves on", () => {
  const listed = listedStops(day1.stops, day1.stops[2]);
  assert.deepEqual(
    listed.map((item) => [item.stop.id, item.past]),
    [
      ["capy", true],
      ["lungshan", true],
      ["ximen", false],
    ]
  );
});

test("listedStops keeps itinerary order around the next stop", () => {
  const listed = listedStops(day1.stops, day1.stops[1]);
  assert.deepEqual(
    listed.map((item) => [item.stop.id, item.past]),
    [
      ["capy", true],
      ["lungshan", false],
      ["ximen", false],
    ]
  );
});

test("listedStops keeps you-are-here as the current highlight", () => {
  const listed = listedStops(day1.stops, day1.stops[0]);
  assert.deepEqual(
    listed.map((item) => [item.stop.id, item.past]),
    [
      ["capy", false],
      ["lungshan", false],
      ["ximen", false],
    ]
  );
});

test("listedStops marks earlier stops past when the last stop is current", () => {
  const listed = listedStops(day1.stops, day1.stops[2]);
  assert.deepEqual(
    listed.map((item) => [item.stop.id, item.past]),
    [
      ["capy", true],
      ["lungshan", true],
      ["ximen", false],
    ]
  );
});

test("pickTheme uses the here stop over next", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Check in · rest", place: "Mayer Inn" },
      nextStop: { title: "Lungshan Temple", place: "Wanhua" },
      viewingDay: { title: "Arrival" },
    }),
    "hotel"
  );
});

test("pickTheme uses next stop when not arrived", () => {
  assert.equal(
    pickTheme({
      hereStop: null,
      nextStop: { title: "Capybara Knight Cafe", place: "Tucheng" },
      viewingDay: { title: "Arrival" },
    }),
    "zoo"
  );
});

test("pickTheme classifies a temple stop", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Lungshan Temple", place: "Wanhua" },
      nextStop: null,
      viewingDay: { title: "Arrival" },
    }),
    "temple"
  );
});

test("pickTheme prefers the zoo stop over a Maokong day title", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Taipei Zoo", place: "Wenshan" },
      nextStop: { title: "Travel to Raohe Night Market" },
      viewingDay: { title: "Maokong & Zoo" },
    }),
    "zoo"
  );
});

test("pickTheme falls back to the viewing day when the stop has no place", () => {
  assert.equal(
    pickTheme({
      hereStop: null,
      nextStop: { title: "Wake up and prepare" },
      viewingDay: { title: "Taichung", label: "Day 4" },
    }),
    "taichung"
  );
});

test("pickTheme classifies the airport from next stop", () => {
  assert.equal(
    pickTheme({
      hereStop: null,
      nextStop: { title: "Arrive in Taiwan", place: "Taoyuan International Airport" },
      viewingDay: { title: "Arrival" },
    }),
    "airport"
  );
});

test("pickTheme classifies night markets and Ximen", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Ningxia Night Market", place: "Datong" },
      nextStop: null,
      viewingDay: { title: "Arrival" },
    }),
    "night"
  );
});

test("pickTheme classifies the north coast tour", () => {
  assert.equal(
    pickTheme({
      hereStop: null,
      nextStop: { title: "North Coast tour · Fun Journey", place: "Yehliu · Shifen · Jiufen" },
      viewingDay: { title: "North Coast" },
    }),
    "coast"
  );
});

test("pickTheme classifies Wulai as forest", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Wulai Waterfall", place: "TONYX cafe for the view" },
      nextStop: null,
      viewingDay: { title: "Wulai" },
    }),
    "forest"
  );
});

test("pickTheme classifies Maokong tea as mountain", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Tea houses around Maokong", place: "Maokong" },
      nextStop: null,
      viewingDay: { title: "Maokong & Zoo" },
    }),
    "mountain"
  );
});

test("pickTheme defaults to city", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Miss You Brunch & Cafe", place: "Zhongshan" },
      nextStop: null,
      viewingDay: { title: "City & homebound" },
    }),
    "city"
  );
});

test("pickTheme uses the stop title before the place", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Travel to Maokong Gondola", place: "Taipei Zoo" },
      nextStop: null,
      viewingDay: { title: "Maokong & Zoo" },
    }),
    "mountain"
  );
});

test("pickTheme does not treat snacks as a temple", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Snacks at Carrefour", place: "PROSPERiTY PLAZA Guilin" },
      nextStop: null,
      viewingDay: { title: "North Coast" },
    }),
    "city"
  );
});

test("status line shows the page version so a stale cache is obvious", () => {
  assert.equal(statusLine("on", false), "Clock + GPS · v9");
  assert.equal(statusLine("off", true), "Location off — clock only · peeking · v9");
});

test("a cached page does not beat a fresh network response", () => {
  assert.equal(pickFetchBody("fresh-css", "old-css"), "fresh-css");
});

test("offline still uses the cache when the network is empty", () => {
  assert.equal(pickFetchBody(null, "old-css"), "old-css");
});

test("GPS jitter at the same stop keeps the same screen stamp", () => {
  const now = at("2026-09-16T10:08:00+08:00");
  const here = resolveGuide({ days, now, position: nearCapy });
  const jitter = resolveGuide({
    days,
    now,
    position: { lat: nearCapy.lat + 0.0001, lng: nearCapy.lng },
  });
  assert.equal(here.hereStop.id, "capy");
  assert.equal(jitter.hereStop.id, "capy");
  assert.notEqual(here.nextDistanceM, jitter.nextDistanceM);
  assert.equal(screenStamp(here), screenStamp(jitter));
});

test("crossing the arrive radius changes the screen stamp", () => {
  const now = at("2026-09-16T10:08:00+08:00");
  const here = resolveGuide({ days, now, position: nearCapy });
  const away = resolveGuide({ days, now, position: farFromCapy });
  assert.equal(here.hereStop.id, "capy");
  assert.equal(away.hereStop, null);
  assert.notEqual(screenStamp(here), screenStamp(away));
});

test("open stop and geo status are part of the screen stamp", () => {
  const guide = resolveGuide({
    days,
    now: at("2026-09-16T10:08:00+08:00"),
    position: nearCapy,
  });
  assert.notEqual(
    screenStamp(guide, { openId: "capy", geo: "on" }),
    screenStamp(guide, { openId: null, geo: "on" })
  );
  assert.notEqual(
    screenStamp(guide, { openId: "capy", geo: "on" }),
    screenStamp(guide, { openId: "capy", geo: "off" })
  );
});

test("hero kicker names the current stop when arrived", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T10:08:00+08:00"),
    position: nearCapy,
  });
  assert.equal(heroKicker(g, false), "You are here");
});

test("hero kicker uses location and time for behind", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T11:25:00+08:00"),
    position: nearCapy,
  });
  assert.equal(heroKicker(g, false), "You are here · 25 min behind");
});

test("hero kicker stays Next up when not arrived", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T08:50:00+08:00"),
    position: hotel,
  });
  assert.equal(heroKicker(g, false), "Next up");
});

test("leave now is time within 30 min and location still away", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T08:50:00+08:00"),
    position: hotel,
  });
  assert.equal(shouldLeaveNow(g, at("2026-09-16T08:50:00+08:00")), true);
  assert.equal(heroKicker(g, true), "Next up · leave now");
});

test("leave now is false without GPS even if the clock is close", () => {
  const g = resolveGuide({
    days,
    now: at("2026-09-16T08:50:00+08:00"),
    position: null,
  });
  assert.equal(shouldLeaveNow(g, at("2026-09-16T08:50:00+08:00")), false);
});

test("pickTheme does not keep a city stop on a forest day", () => {
  assert.equal(
    pickTheme({
      hereStop: { title: "Syntrend", place: "Zhongzheng" },
      nextStop: null,
      viewingDay: { title: "Wulai" },
    }),
    "city"
  );
});

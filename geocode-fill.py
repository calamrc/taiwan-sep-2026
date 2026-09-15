#!/usr/bin/env python3
"""Retry misses using addresses, Taiwan bounds, and known pins."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

PATH = Path("itinerary.json")
CACHE = Path("geocode-cache.json")
UA = "TaiwanTripGuide/1.0 (personal trip field guide)"

OVERRIDES = {
    "Mayer Inn Taipei": (25.0478, 121.5170),
    "Mayer Inn Taipei Main Station": (25.0478, 121.5170),
    "Taoyuan International Airport Terminal 1": (25.0793, 121.2346),
    "Taoyuan International Airport 7-Eleven": (25.0793, 121.2346),
    "Taoyuan Airport Bus 1819 Taipei Main Station": (25.0770, 121.2320),
    "7-Eleven Taipei Main Station": (25.0478, 121.5170),
    "Capybara Knight Cafe Tucheng": (24.9739, 121.4423),
    "Ximending Rainbow Road": (25.0424, 121.5081),
    "Lao Shan Dong Homemade Noodles Ximending": (25.0426, 121.5069),
    "Taipei City Hall MRT Exit 2": (25.0413, 121.5657),
    "Hello Kitty 7-Eleven Hankou Street Taipei": (25.0456, 121.5103),
    "Open Chan Changsha Street Taipei": (25.0412, 121.5055),
    "Mofusand Kaifeng Street Taipei": (25.0462, 121.5124),
    "Peanuts Hankou Street Taipei": (25.0460, 121.5138),
    "L'Atelier Lotus Yongkang Street": (25.0331, 121.5294),
    "Bugcat Capoo 7-Eleven Keelung Road Taipei": (25.0408, 121.5650),
    "Elephant Mountain Trail Taipei": (25.0270, 121.5718),
    "Zhinan Temple Maokong": (24.9797, 121.5864),
    "Maokong teahouses": (24.9689, 121.5883),
    "Redwood Teahouse Maokong": (24.9695, 121.5932),
    "Maokong Gondola Taipei Zoo South Station": (24.9935, 121.5752),
    "大城早午餐 Guilin Road Taipei": (25.0354, 121.5058),
    "Carrefour Prosperity Plaza Guilin Taipei": (25.0352, 121.5055),
    "Ximen Night Market": (25.0422, 121.5068),
    "Taichung Second Market": (24.1412, 120.6796),
    "Miyahara Ice Cream Taichung": (24.1378, 120.6795),
    "Miyahara 2nd shop Zhongshan Taichung": (24.1374, 120.6810),
    "THSR Taichung Station": (24.1125, 120.6162),
    "Wulai Bus Terminal": (24.8635, 121.5515),
    "Wulai Suspension Bridge": (24.8652, 121.5512),
    "Lansheng Bridge Wulai": (24.8630, 121.5502),
    "Wulai Scenic Train": (24.8514, 121.5514),
    "Yun Hsien Resort cable car": (24.8478, 121.5530),
    "Yun Hsien Lake Wulai": (24.8485, 121.5545),
    "Syntrend Creative Park": (25.0453, 121.5316),
    "Mr Ho's Shop Ximending": (25.0423, 121.5080),
    "Taipei Main Station lockers": (25.0478, 121.5170),
    "Miss You Brunch Cafe Taipei": (25.0528, 121.5224),
    "Zhongshan Shopping District Taipei": (25.0526, 121.5204),
    "Fubon Art Museum Taipei": (25.0389, 121.5675),
    "Taoyuan Airport MRT Taipei Main": (25.0478, 121.5170),
    "Sumikko Gurashi Chang'an West Road Taipei": (25.0506, 121.5152),
    "Starbucks Reserve Dream Plaza Taipei": (25.0386, 121.5670),
    "Fu Hang Soy Milk": (25.0446, 121.5235),
}

data = json.loads(PATH.read_text())
cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}


def in_trip(q, loc):
    if loc is None:
        return False
    lat, lng = loc["lat"], loc["lng"]
    if "NAIA" in (q or "") or "Manila" in (q or ""):
        return 14.4 < lat < 14.7 and 120.9 < lng < 121.1
    return 21.5 < lat < 25.4 and 119.8 < lng < 122.1


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": "1"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        hits = json.loads(res.read().decode())
    time.sleep(1.1)
    if not hits:
        return None
    return {"lat": float(hits[0]["lat"]), "lng": float(hits[0]["lon"])}


def resolve(item):
    keys = [item.get("mapsQuery"), item.get("address"), item.get("place")]
    keys = [k for k in keys if k]
    for key in keys:
        if key in OVERRIDES:
            lat, lng = OVERRIDES[key]
            return {"lat": lat, "lng": lng}
    for key in keys:
        loc = cache.get(key)
        if in_trip(key, loc):
            return loc
    for key in keys:
        loc = nominatim(key)
        cache[key] = loc
        CACHE.write_text(json.dumps(cache, indent=2))
        if in_trip(key, loc):
            print("OK", key, loc)
            return loc
        print("BAD", key, loc)
    return None


def apply(item):
    if item.get("maps") is False:
        item.pop("lat", None)
        item.pop("lng", None)
        return
    loc = resolve(item)
    if loc:
        item["lat"] = loc["lat"]
        item["lng"] = loc["lng"]
        print("SET", item.get("title") or item.get("name") or item.get("mapsQuery"))
    else:
        print("STILL MISS", item.get("title") or item.get("mapsQuery"))


# force-fix known bad cache
cache["Fu Hang Soy Milk"] = {"lat": 25.0446, "lng": 121.5235}

apply(data["hotel"])
for day in data["days"]:
    for stop in day["stops"]:
        apply(stop)
    for extra in day.get("extras", []):
        apply(extra)

PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
CACHE.write_text(json.dumps(cache, indent=2))
print("done")

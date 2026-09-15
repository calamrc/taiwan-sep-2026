#!/usr/bin/env python3
"""Fill lat/lng on itinerary.json via Nominatim. 1 request/sec."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

PATH = Path(__file__).with_name("itinerary.json")
CACHE = Path(__file__).with_name("geocode-cache.json")
UA = "TaiwanTripGuide/1.0 (personal trip field guide)"

data = json.loads(PATH.read_text())
cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}


def query_for(item):
    return item.get("mapsQuery") or item.get("address") or item.get("place")


def geocode(q):
    if not q:
        return None
    if q in cache:
        return cache[q]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": "1"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        hits = json.loads(res.read().decode())
    time.sleep(1.1)
    if not hits:
        cache[q] = None
        CACHE.write_text(json.dumps(cache, indent=2))
        print("MISS", q)
        return None
    loc = {"lat": float(hits[0]["lat"]), "lng": float(hits[0]["lon"])}
    cache[q] = loc
    CACHE.write_text(json.dumps(cache, indent=2))
    print("OK", q, loc)
    return loc


def apply(item):
    if item.get("maps") is False:
        return
    loc = geocode(query_for(item))
    if loc:
        item["lat"] = loc["lat"]
        item["lng"] = loc["lng"]


apply(data["hotel"])
for day in data["days"]:
    for stop in day["stops"]:
        apply(stop)
    for extra in day.get("extras", []):
        apply(extra)

PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
misses = [k for k, v in cache.items() if v is None]
print("done misses", len(misses), misses)

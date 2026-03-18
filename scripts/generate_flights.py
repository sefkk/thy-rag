#!/usr/bin/env python3
"""19 Mart - 19 Nisan 2026: IST-ESB 160, ESB-IST 120, IST-AMS 160, AMS-IST 140, ESB-AMS 10, AMS-ESB 10. Toplam 600."""
import json
import random
from datetime import datetime, timedelta

ROUTES = [
    {"from": "IST", "fromCity": "İstanbul", "to": "ESB", "toCity": "Ankara"},
    {"from": "ESB", "fromCity": "Ankara", "to": "IST", "toCity": "İstanbul"},
    {"from": "IST", "fromCity": "İstanbul", "to": "AMS", "toCity": "Amsterdam"},
    {"from": "AMS", "fromCity": "Amsterdam", "to": "IST", "toCity": "İstanbul"},
    {"from": "ESB", "fromCity": "Ankara", "to": "AMS", "toCity": "Amsterdam"},
    {"from": "AMS", "fromCity": "Amsterdam", "to": "ESB", "toCity": "Ankara"},
]

# (count, duration, price_min, price_max, domestic)
SPECS = [
    (160, "1s 15d", 1199, 1899, True),   # 0 IST-ESB
    (120, "1s 10d", 1249, 1799, True),   # 1 ESB-IST
    (160, "3s 20d", 4899, 5999, False),  # 2 IST-AMS
    (140, "3s 20d", 4949, 5999, False),  # 3 AMS-IST
    (10, "3s 00d", 4399, 5499, False),   # 4 ESB-AMS
    (10, "3s 00d", 4499, 5699, False),  # 5 AMS-ESB
]

def main():
    start = datetime(2026, 3, 19)
    end = datetime(2026, 4, 19)
    all_dates = []
    d = start
    while d <= end:
        all_dates.append(d.strftime("%Y-%m-%d"))
        d += timedelta(days=1)
    # Her 2 günde bir: ESB-AMS / AMS-ESB
    even_dates = [all_dates[i] for i in range(0, len(all_dates), 2)]
    odd_dates = [all_dates[i] for i in range(1, len(all_dates), 2)]

    flight_id = 2000
    all_flights = []

    for route_index, (count, duration, price_lo, price_hi, is_domestic) in enumerate(SPECS):
        if route_index == 4:
            date_pool = even_dates
        elif route_index == 5:
            date_pool = odd_dates + [all_dates[-1]]  # 10 gün
        else:
            date_pool = all_dates
        for i in range(count):
            date = date_pool[i % len(date_pool)]
            h = random.randint(5, 20)
            m = random.choice([0, 15, 30, 45])
            dep = f"{h:02d}:{m:02d}"
            if is_domestic:
                ah, am = h + 1, m + (10 if route_index == 1 else 15)
            else:
                ah, am = h + 3, m + 20
            if am >= 60:
                am -= 60
                ah += 1
            arr = f"{ah:02d}:{am:02d}"
            price = round(random.randint(price_lo, price_hi) / 50) * 50 - 1 or price_lo  # 949, 999, ...
            price = max(price_lo, min(price_hi, price))
            max_pax = random.choice([1, 2])
            flight_id += 1
            all_flights.append({
                "id": f"TK{flight_id}",
                "routeIndex": route_index,
                "date": date,
                "depTime": dep,
                "arrTime": arr,
                "duration": duration,
                "price": price,
                "maxPassengers": max_pax,
            })

    total = len(all_flights)
    if total < 600:
        for _ in range(600 - total):
            flight_id += 1
            all_flights.append({
                "id": f"TK{flight_id}",
                "routeIndex": 3,
                "date": random.choice(all_dates),
                "depTime": f"{random.randint(6,21):02d}:{random.choice([0,30]):02d}",
                "arrTime": f"{random.randint(9,24)%24:02d}:{random.choice([20,50]):02d}",
                "duration": "3s 20d",
                "price": random.randint(4949, 5999),
                "maxPassengers": random.choice([1, 2]),
            })

    out = {"routes": ROUTES, "flights": all_flights}
    path = "frontend/data/flights.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    by_route = {}
    for f in out["flights"]:
        r = f["routeIndex"]
        by_route[r] = by_route.get(r, 0) + 1
    print(f"Wrote {path}: {len(out['flights'])} flights total")
    for r in range(6):
        print(f"  Route {r}: {by_route.get(r, 0)}")

if __name__ == "__main__":
    main()

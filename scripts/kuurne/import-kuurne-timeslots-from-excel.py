#!/usr/bin/env python3
"""One-off: build Kuurne season_data timeslots/vacations/unavailability from Excel calendar."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, time
from pathlib import Path

EXCEL_DEFAULT = Path("/Users/nikki/Desktop/Voorstel dagen kalender.xlsx")

DAY_MAP = {
    "Maandag": 1,
    "Dinsdag": 2,
    "Woensdag": 3,
    "Donderdag": 4,
    "Vrijdag": 5,
    "Zaterdag": 6,
    "Zondag": 0,
}

VENUE_ID = 1
VENUE_NAME = "Sportpark Kuurne"


def time_str(tm: object) -> str:
    if isinstance(tm, datetime):
        return tm.strftime("%H:%M")
    if isinstance(tm, time):
        return tm.strftime("%H:%M")
    return str(tm)[:5] if tm else ""


def add_hour(hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    return f"{(h + 1) % 24:02d}:{m:02d}"


def build_payload(excel_path: Path) -> dict:
    import openpyxl

    ws = openpyxl.load_workbook(excel_path, data_only=True)["Voorstel dagen kalender"]
    m_ranges: dict[tuple[int, str], list[str]] = defaultdict(list)
    g_rows: list[tuple[str, str, str, int]] = []
    x_rows: list[tuple[str, str, str, int]] = []

    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i < 8:
            continue
        code = row[0]
        if not code:
            continue
        code = str(code).strip().upper()
        dt, dayname, tm, note = row[2], row[3], row[4], row[5]
        if not isinstance(dt, datetime):
            continue
        d = dt.date().isoformat()
        start = time_str(tm)
        dow = DAY_MAP.get(str(dayname) if dayname else "")
        if code in ("M", "VR") and dow is not None and start:
            m_ranges[(dow, start)].append(d)
        elif code == "G" and start and dow is not None:
            g_rows.append((d, start, str(note) if note else "Gesloten", dow))
        elif code == "X" and start and dow is not None:
            x_rows.append((d, start, str(note) if note else "Vakantie", dow))

    slots = []
    key_to_id: dict[tuple[int, str], int] = {}
    for priority, (dow, start) in enumerate(sorted(m_ranges.keys()), 1):
        dates = sorted(m_ranges[(dow, start)])
        key_to_id[(dow, start)] = priority
        slots.append(
            {
                "timeslot_id": priority,
                "venue_id": VENUE_ID,
                "venue_name": VENUE_NAME,
                "day_of_week": dow,
                "start_time": start,
                "end_time": add_hour(start),
                "priority": priority,
                "valid_from": dates[0],
                "valid_until": dates[-1],
            }
        )

    vacations = [
        {
            "id": 1,
            "name": "Herfstvakantie",
            "start_date": "2026-11-02",
            "end_date": "2026-11-08",
            "is_active": True,
        },
        {
            "id": 2,
            "name": "Kerstvakantie",
            "start_date": "2026-12-21",
            "end_date": "2027-01-03",
            "is_active": True,
        },
        {
            "id": 3,
            "name": "Krokusvakantie",
            "start_date": "2027-02-08",
            "end_date": "2027-02-14",
            "is_active": True,
        },
        {
            "id": 4,
            "name": "Paasvakantie",
            "start_date": "2027-03-29",
            "end_date": "2027-04-11",
            "is_active": True,
        },
        {
            "id": 5,
            "name": "Verlengd weekend Hemelvaart",
            "start_date": "2027-05-06",
            "end_date": "2027-05-09",
            "is_active": True,
        },
    ]

    blocks = []
    bid = 1
    for d, start, name, dow in g_rows + x_rows:
        tid = key_to_id.get((dow, start))
        if tid is None:
            print(f"WARN: no timeslot for {d} {start} dow={dow} ({name})", file=sys.stderr)
            continue
        blocks.append(
            {
                "id": bid,
                "name": name,
                "date": d,
                "venue_id": VENUE_ID,
                "timeslot_id": tid,
                "is_active": True,
                "reason": name,
            }
        )
        bid += 1

    return {
        "venue_timeslots": slots,
        "vacation_periods": vacations,
        "slot_unavailability": blocks,
    }


def main() -> None:
    excel = Path(sys.argv[1]) if len(sys.argv) > 1 else EXCEL_DEFAULT
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("tmp-kuurne-timeslots-import.json")
    payload = build_payload(excel)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Wrote {out}: {len(payload['venue_timeslots'])} slots, "
        f"{len(payload['vacation_periods'])} vacations, "
        f"{len(payload['slot_unavailability'])} blocks"
    )


if __name__ == "__main__":
    main()

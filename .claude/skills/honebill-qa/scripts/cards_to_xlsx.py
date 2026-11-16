#!/usr/bin/env python3
"""Turn a HoneBill tester pack (markdown test cards) into a tracker spreadsheet.

Usage:
    python cards_to_xlsx.py tester-pack.md tester-tracker.xlsx [--testers "Ana,Ben,Cris"]

Cards are found by `### <ID> · <Title>` headings (separator: · - – — or :), and the bold labels described in
references/tester-writing-guide.md (**Area:**, **Priority:**, **People:**, **Time:**, **Costs:**, **Why:**,
**Before you start:**, **Steps:**, **You should see:**, **Report if:**).

Writes an .xlsx with a "Tests" sheet (one row per card, Result dropdown) and a "Summary" sheet. When --testers is
given, every card is repeated once per tester so each person fills in their own row. Installs openpyxl if missing;
if that fails, writes a .csv next to the requested path instead.
"""
from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
from pathlib import Path

HEADING = re.compile(r"^###\s+([A-Za-z]+-?\d+[A-Za-z]?)\s*[·\-–—:]\s*(.+?)\s*$")
INLINE_FIELDS = ["Area", "Priority", "People", "Time", "Costs"]
BLOCK_FIELDS = ["Why", "Before you start", "Steps", "You should see", "Report if"]
LABEL = re.compile(r"\*\*(" + "|".join(re.escape(f) for f in INLINE_FIELDS + BLOCK_FIELDS) + r"):\*\*")

COLUMNS = [
    ("ID", 10), ("Title", 38), ("Area", 12), ("Priority", 9), ("People", 20), ("Time", 9), ("Costs", 16),
    ("Before you start", 40), ("Steps", 60), ("You should see", 50), ("Report if", 40),
    ("Tester", 14), ("Phone / Android", 18), ("App version", 11), ("Network", 14),
    ("Result", 11), ("Time tested", 14), ("Reference code", 18), ("Notes / what happened", 50), ("Bug link", 20),
]
RESULTS = ["Pass", "Fail", "Blocked", "Not run"]


def parse_cards(text: str) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    body: list[str] = []

    def flush() -> None:
        if current is not None:
            current.update(parse_body("\n".join(body)))
            cards.append(current)

    for line in text.splitlines():
        m = HEADING.match(line)
        if m:
            flush()
            current, body = {"ID": m.group(1), "Title": m.group(2)}, []
        elif line.startswith("## ") or line.startswith("# "):
            flush()
            current, body = None, []
        elif current is not None:
            body.append(line)
    flush()
    return cards


def parse_body(body: str) -> dict[str, str]:
    out: dict[str, str] = {}
    parts = LABEL.split(body)
    # parts = [before, label1, content1, label2, content2, ...]
    for i in range(1, len(parts) - 1, 2):
        label, content = parts[i], parts[i + 1]
        if label in INLINE_FIELDS:
            # Inline fields share a line separated by " · "; keep only this field's text.
            content = re.split(r"\s+·\s+|\n", content.strip(), maxsplit=1)[0]
        out[label] = clean(content)
    return out


def clean(text: str) -> str:
    lines = [ln.rstrip() for ln in text.strip().splitlines()]
    lines = [re.sub(r"\*\*(.+?)\*\*", r"\1", ln) for ln in lines if ln.strip() and ln.strip() != "·"]
    return "\n".join(lines).strip().strip("·").strip()


def rows_for(cards: list[dict[str, str]], testers: list[str]) -> list[list[str]]:
    names = testers or [""]
    rows = []
    for card in cards:
        for tester in names:
            row = [card.get(name, "") for name, _ in COLUMNS]
            row[[c for c, _ in COLUMNS].index("Tester")] = tester
            row[[c for c, _ in COLUMNS].index("Result")] = "Not run"
            rows.append(row)
    return rows


def ensure_openpyxl():
    try:
        import openpyxl  # noqa: F401
        return True
    except ImportError:
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "openpyxl"], check=True)
            return True
        except Exception:
            return False


def write_xlsx(path: Path, rows: list[list[str]], cards: list[dict[str, str]]) -> None:
    from openpyxl import Workbook
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = Workbook()
    ws = wb.active
    ws.title = "Tests"
    ws.append([name for name, _ in COLUMNS])
    for row in rows:
        ws.append(row)

    header_fill = PatternFill("solid", fgColor="333333")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for idx, (_, width) in enumerate(COLUMNS, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    ws.freeze_panes = "C2"
    last = len(rows) + 1
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{last}"

    result_col = get_column_letter([c for c, _ in COLUMNS].index("Result") + 1)
    dv = DataValidation(type="list", formula1='"' + ",".join(RESULTS) + '"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"{result_col}2:{result_col}{max(last, 2)}")
    rng = f"{result_col}2:{result_col}{max(last, 2)}"
    for value, color in (("Pass", "C6EFCE"), ("Fail", "FFC7CE"), ("Blocked", "FFEB9C")):
        ws.conditional_formatting.add(
            rng, CellIsRule(operator="equal", formula=[f'"{value}"'], fill=PatternFill("solid", fgColor=color))
        )

    summary = wb.create_sheet("Summary")
    summary.append(["Result", "Count"])
    for value in RESULTS:
        summary.append([value, f'=COUNTIF(Tests!{result_col}:{result_col},"{value}")'])
    summary.append([])
    summary.append(["Cards", len(cards)])
    summary.append(["Rows", len(rows)])
    summary.append([])
    summary.append(["Priority", "Failed rows"])
    prio_col = get_column_letter([c for c, _ in COLUMNS].index("Priority") + 1)
    for p in ("P0", "P1", "P2"):
        summary.append([p, f'=COUNTIFS(Tests!{prio_col}:{prio_col},"{p}*",Tests!{result_col}:{result_col},"Fail")'])
    for cell in summary[1]:
        cell.font = Font(bold=True)
    summary.column_dimensions["A"].width = 14
    wb.save(path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pack", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--testers", default="", help="Comma-separated names; repeats each card per tester")
    args = ap.parse_args()

    cards = parse_cards(args.pack.read_text(encoding="utf-8"))
    if not cards:
        print("No cards found. Headings must look like: ### OFF-01 · Title", file=sys.stderr)
        return 1
    missing = [c["ID"] for c in cards if not c.get("Steps") or not c.get("You should see")]
    testers = [t.strip() for t in args.testers.split(",") if t.strip()]
    rows = rows_for(cards, testers)

    if ensure_openpyxl():
        out = args.out.with_suffix(".xlsx")
        write_xlsx(out, rows, cards)
    else:
        out = args.out.with_suffix(".csv")
        with out.open("w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.writer(fh)
            writer.writerow([name for name, _ in COLUMNS])
            writer.writerows(rows)
        print("openpyxl unavailable; wrote CSV instead.", file=sys.stderr)

    print(f"Wrote {out} with {len(cards)} cards ({len(rows)} rows).")
    if missing:
        print(f"Warning: cards missing Steps or 'You should see': {', '.join(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

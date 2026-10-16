"""Verify imported annual data against the preserved official NCHS workbook.

Uses only Python's standard library. No network, credentials, or inferred data.
"""

import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / "artifacts/research/nchs-us-life-table-2023-table1.xlsx"
data = json.loads((root / "src/model/us-life-table-2023.json").read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest() == data["sourceSha256"]
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
rows = []
with zipfile.ZipFile(source) as workbook:
    strings = [
        "".join(item.itertext())
        for item in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("s:si", ns)
    ]
    for row in ET.fromstring(workbook.read("xl/worksheets/sheet1.xml")).findall("s:sheetData/s:row", ns):
        cells = {}
        for cell in row.findall("s:c", ns):
            value_node = cell.find("s:v", ns)
            value = value_node.text if value_node is not None else ""
            if cell.get("t") == "s":
                value = strings[int(value)]
            cells[cell.get("r")[0]] = value
        interval = cells.get("A", "").replace("–", "-")
        if "-" in interval and interval.split("-")[0].isdigit():
            rows.append({
                "age": int(interval.split("-")[0]),
                "deathProbability": float(cells["B"]),
                "survivors": float(cells["C"]),
            })
assert rows == data["rows"], "Imported numbers differ from the official workbook"
assert [row["age"] for row in rows] == list(range(100))
max_difference = 0
for start_age in range(20, 91):
    survival = 1
    for age in range(start_age, 100):
        expected = rows[age]["survivors"] / rows[start_age]["survivors"]
        max_difference = max(max_difference, abs(survival - expected))
        survival *= 1 - rows[age]["deathProbability"]
assert max_difference < 0.000002
print(f"100 annual rows match official workbook; source hash matches; maximum survival/lx difference {max_difference:.9g}. No modification effects validated.")

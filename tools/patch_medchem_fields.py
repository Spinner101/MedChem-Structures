#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

REPO = Path("/Users/sidneybolden/Desktop/MedChem-Structures")
IDX = REPO / "medchem" / "index.html"
APP = REPO / "medchem" / "app.js"
DRUGS = REPO / "medchem" / "data" / "drugs.json"

FIELDS_HTML_BLOCK = """
<hr>

<p><b>PK / ADMET:</b> <span id="pk_admet"></span></p>
<p><b>ADMET Flags:</b> <span id="admet_flags"></span></p>

<p><b>Metabolism:</b> <span id="metabolism"></span></p>
<p><b>CYP Enzymes:</b> <span id="cyp_enzymes"></span></p>
<p><b>Transporters:</b> <span id="transporters"></span></p>

<p><b>Half-life:</b> <span id="half_life"></span></p>
<p><b>Bioavailability:</b> <span id="bioavailability"></span></p>
<p><b>BBB Penetration:</b> <span id="bbb"></span></p>
<p><b>Elimination:</b> <span id="elimination"></span></p>

<p><b>Drug–Drug Interactions (DDIs):</b> <span id="ddis"></span></p>

<p><b>Contraindications:</b> <span id="contraindications"></span></p>
<p><b>Boxed Warnings:</b> <span id="boxed_warnings"></span></p>

<p><b>PhysChem:</b> <span id="physchem"></span></p>
<p><b>Clinical Pearls:</b> <span id="clinical_pearls"></span></p>
""".strip("\n")

APP_JS_INSERT_BLOCK = """
  // ===== Expanded MedChem Fields =====
  const joinOrBlank = (val, sep = "; ") =>
    Array.isArray(val) ? val.join(sep) : (val || "");

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? "";
  };

  setText("pk_admet", currentDrug.pk_admet || "");
  setText("admet_flags", joinOrBlank(currentDrug.admet_flags));

  setText("metabolism", currentDrug.metabolism || "");
  setText("cyp_enzymes", joinOrBlank(currentDrug.cyp_enzymes));
  setText("transporters", joinOrBlank(currentDrug.transporters));

  setText("half_life", currentDrug.half_life || "");
  setText("bioavailability", currentDrug.bioavailability || "");
  setText("bbb", currentDrug.bbb || "");
  setText("elimination", currentDrug.elimination || "");

  // DDIs/Warnings (keeps your existing DDI rendering consistent)
  setText("ddis", joinOrBlank(currentDrug.ddis));
  setText("contraindications", joinOrBlank(currentDrug.contraindications));
  setText("boxed_warnings", joinOrBlank(currentDrug.boxed_warnings));

  // PhysChem formatting
  const p = currentDrug.physchem || {};
  const physchemLine = [
    p.mw ? `MW: ${p.mw}` : "",
    p.logp ? `logP: ${p.logp}` : "",
    p.tpsa ? `tPSA: ${p.tpsa}` : "",
    p.hbd ? `HBD: ${p.hbd}` : "",
    p.hba ? `HBA: ${p.hba}` : "",
    p.pka ? `pKa: ${p.pka}` : ""
  ].filter(Boolean).join(" | ");

  setText("physchem", physchemLine);
  setText("clinical_pearls", joinOrBlank(currentDrug.clinical_pearls, " • "));
  // ===== End Expanded MedChem Fields =====
""".strip("\n")

DEFAULT_FIELDS = {
  "pk_admet": "",
  "admet_flags": [],
  "cyp_enzymes": [],
  "transporters": [],
  "half_life": "",
  "bioavailability": "",
  "bbb": "",
  "elimination": "",
  "contraindications": [],
  "boxed_warnings": [],
  "physchem": {"mw":"","logp":"","tpsa":"","hbd":"","hba":"","pka":""},
  "clinical_pearls": []
}

def backup_file(path: Path) -> None:
  bdir = REPO / "_backups"
  bdir.mkdir(exist_ok=True)
  dst = bdir / f"{path.name}.bak"
  dst.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

def patch_index_html() -> None:
  html = IDX.read_text(encoding="utf-8")
  if 'id="pk_admet"' in html:
    return

  # Insert block after the Target line if present; else after Drug Card header
  target_line_pat = r'(<p>\s*<b>Target:.*?</p>)'
  m = re.search(target_line_pat, html, flags=re.IGNORECASE | re.DOTALL)
  if m:
    insert_at = m.end()
    html = html[:insert_at] + "\n\n" + FIELDS_HTML_BLOCK + html[insert_at:]
  else:
    header_pat = r'(<section[^>]*class="panel right"[^>]*>.*?<h2>.*?</h2>)'
    m2 = re.search(header_pat, html, flags=re.IGNORECASE | re.DOTALL)
    if not m2:
      raise RuntimeError("Could not find insertion point in medchem/index.html")
    insert_at = m2.end()
    html = html[:insert_at] + "\n\n" + FIELDS_HTML_BLOCK + html[insert_at:]

  IDX.write_text(html, encoding="utf-8")

def patch_app_js() -> None:
  js = APP.read_text(encoding="utf-8")
  if "Expanded MedChem Fields" in js:
    return

  # Find loadDrug function body
  m = re.search(r'function\s+loadDrug\s*\(\s*id\s*\)\s*\{', js)
  if not m:
    raise RuntimeError("Could not find function loadDrug(id) in medchem/app.js")

  # Insert near end of loadDrug, before attempts reset (preferred), otherwise before closing brace
  # Approach: locate the reset attempts line within loadDrug region.
  start = m.start()
  # crude block extraction: find next '}' at same nesting level by counting braces
  i = m.end()
  depth = 1
  while i < len(js) and depth > 0:
    if js[i] == "{":
      depth += 1
    elif js[i] == "}":
      depth -= 1
    i += 1
  load_block_end = i  # index after closing brace

  load_block = js[m.start():load_block_end]
  # Prefer insertion before attempts = 0 OR feedback reset within loadDrug
  reset_match = re.search(r'\n\s*attempts\s*=\s*0\s*;', load_block)
  if reset_match:
    ins = reset_match.start()
    patched_block = load_block[:ins] + "\n\n" + APP_JS_INSERT_BLOCK + "\n\n" + load_block[ins:]
  else:
    # insert before final }
    patched_block = load_block[:-1] + "\n\n" + APP_JS_INSERT_BLOCK + "\n" + "}"

  js = js[:m.start()] + patched_block + js[load_block_end:]
  APP.write_text(js, encoding="utf-8")

def patch_drugs_json() -> None:
  data = json.loads(DRUGS.read_text(encoding="utf-8"))
  changed = False
  for d in data.get("drugs", []):
    for k, v in DEFAULT_FIELDS.items():
      if k not in d:
        d[k] = v
        changed = True
  if changed:
    DRUGS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def validate_json() -> None:
  json.loads(DRUGS.read_text(encoding="utf-8"))

def main() -> None:
  for p in (IDX, APP, DRUGS):
    if not p.exists():
      raise SystemExit(f"Missing required file: {p}")
    backup_file(p)

  patch_index_html()
  patch_app_js()
  patch_drugs_json()
  validate_json()
  print("OK: Patched medchem/index.html, medchem/app.js, and medchem/data/drugs.json")

if __name__ == "__main__":
  main()

import json
from pathlib import Path
import re

import pubchempy as pcp

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "structures_smiles.json"

# Your drug list (names PubChem recognizes well)
COMPOUNDS = [
    # PD
    ("levodopa", "Levodopa", "PD", "L-Dopa"),
    ("dopamine", "Dopamine", "PD", "Dopamine"),
    ("carbidopa", "Carbidopa", "PD", "Carbidopa"),
    ("selegiline", "Selegiline", "PD", "Selegiline"),
    ("rasagiline", "Rasagiline", "PD", "Rasagiline"),
    ("safinamide", "Safinamide", "PD", "Safinamide"),
    ("tolcapone", "Tolcapone", "PD", "Tolcapone"),
    ("entacapone", "Entacapone", "PD", "Entacapone"),
    ("pramipexole", "Pramipexole", "PD", "Pramipexole"),
    ("ropinirole", "Ropinirole", "PD", "Ropinirole"),
    ("cabergoline", "Cabergoline", "PD", "Cabergoline"),
    ("bromocriptine", "Bromocriptine", "PD", "Bromocriptine"),
    ("rotigotine", "Rotigotine", "PD", "Rotigotine"),
    ("apomorphine", "Apomorphine", "PD", "Apomorphine"),
    ("amantadine", "Amantadine", "PD", "Amantadine"),

    # AED
    ("carbamazepine", "Carbamazepine", "AED", "Carbamazepine"),
    ("oxcarbazepine", "Oxcarbazepine", "AED", "Oxcarbazepine"),
    ("eslicarbazepine_acetate", "Eslicarbazepine acetate", "AED", "Eslicarbazepine Acetate"),
    ("phenytoin", "Phenytoin", "AED", "Phenytoin"),
    ("fosphenytoin", "Fosphenytoin", "AED", "Fosphenytoin"),
    ("lamotrigine", "Lamotrigine", "AED", "Lamotrigine"),
    ("lacosamide", "Lacosamide", "AED", "Lacosamide"),
    ("gabapentin", "Gabapentin", "AED", "Gabapentin"),
    ("pregabalin", "Pregabalin", "AED", "Pregabalin"),
    ("ethosuximide", "Ethosuximide", "AED", "Ethosuximide"),
]

def fetch_smiles(query: str) -> str | None:
    hits = pcp.get_compounds(query, "name")
    if not hits:
        return None
    # Prefer canonical_smiles (PubChem standard)
    return hits[0].canonical_smiles

def main():
    drugs = []
    missing = []

    for drug_id, name, module, query in COMPOUNDS:
        smiles = fetch_smiles(query)
        if not smiles:
            missing.append((drug_id, query))
            continue
        drugs.append({
            "id": drug_id,
            "name": name,
            "module": module,
            "smiles": smiles
        })

    payload = {
        "meta": {
            "schema": "structure_library_v1",
            "source": "PubChem (via pubchempy) — canonical_smiles",
            "count": len(drugs)
        },
        "drugs": drugs
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Wrote {len(drugs)} entries to {OUT}")
    if missing:
        print("\nMissing (no PubChem hits):")
        for drug_id, query in missing:
            print(f" - {drug_id}: {query}")
        raise SystemExit(1)

if __name__ == "__main__":
    main()

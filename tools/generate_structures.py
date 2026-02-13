import json
import os
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import Draw
from rdkit.Chem.Draw import rdMolDraw2D

ROOT = Path(__file__).resolve().parents[1]  # repo root
INPUT_JSON = ROOT / "data" / "structures_smiles.json"
OUT_SVG = ROOT / "assets" / "structures" / "svg"
OUT_PNG = ROOT / "assets" / "structures" / "png"

OUT_SVG.mkdir(parents=True, exist_ok=True)
OUT_PNG.mkdir(parents=True, exist_ok=True)

# Crisp, tablet-friendly sizes
PNG_SIZE = (900, 600)   # width, height
SVG_W, SVG_H = 900, 600

def clean_id(s: str) -> str:
  return s.strip().lower().replace(" ", "_").replace("-", "_")

def mol_from_smiles(smiles: str):
  mol = Chem.MolFromSmiles(smiles)
  if mol is None:
    return None
  # Add Hs for better depiction if desired; often not necessary:
  # mol = Chem.AddHs(mol)
  Chem.rdDepictor.Compute2DCoords(mol)
  return mol

def write_png(mol, outpath: Path):
  img = Draw.MolToImage(mol, size=PNG_SIZE, kekulize=True)
  img.save(str(outpath))

def write_svg(mol, outpath: Path):
  drawer = rdMolDraw2D.MolDraw2DSVG(SVG_W, SVG_H)
  drawer.drawOptions().addAtomIndices = False
  drawer.drawOptions().padding = 0.08
  rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
  drawer.FinishDrawing()
  svg = drawer.GetDrawingText()
  outpath.write_text(svg, encoding="utf-8")

def main():
  data = json.loads(INPUT_JSON.read_text(encoding="utf-8"))
  drugs = data.get("drugs", [])

  errors = []
  generated = 0

  for d in drugs:
    drug_id = clean_id(d.get("id", ""))
    name = d.get("name", drug_id)
    smiles = (d.get("smiles") or "").strip()

    if not drug_id:
      errors.append(f"Missing id for entry: {d}")
      continue
    if not smiles:
      errors.append(f"[{drug_id}] Missing SMILES (name={name})")
      continue

    mol = mol_from_smiles(smiles)
    if mol is None:
      errors.append(f"[{drug_id}] Invalid SMILES: {smiles}")
      continue

    write_png(mol, OUT_PNG / f"{drug_id}.png")
    write_svg(mol, OUT_SVG / f"{drug_id}.svg")
    generated += 1

  print(f"Generated: {generated} structures")
  if errors:
    print("\nErrors:")
    for e in errors:
      print(" -", e)
    raise SystemExit(1)

if __name__ == "__main__":
  main()

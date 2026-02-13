#!/usr/bin/env bash
set -euo pipefail

cd /Users/sidneybolden/Desktop/MedChem-Structures

# Run patcher
python3 tools/patch_medchem_fields.py

# Prevent committing macOS junk
if [ ! -f .gitignore ] || ! grep -q '^\.DS_Store$' .gitignore; then
  echo ".DS_Store" >> .gitignore
fi
rm -f .DS_Store medchem/.DS_Store || true

# Stage only what we intend
git add medchem/index.html medchem/app.js medchem/data/drugs.json .gitignore

# Commit if there are staged changes
if git diff --cached --quiet; then
  echo "No changes to commit (already applied)."
else
  git commit -m "Add full MedChem fields (PK/ADMET, metabolism, DDIs, physchem)"
fi

git push
echo "DONE. Test: https://spinner101.github.io/MedChem-Structures/medchem/"

// ==========================================
// MedChem Drug Card Trainer App (Clean V3)
// Tablet-first: iPad + Android Stylus Ready
// ==========================================

let drugs = [];
let modules = [];
let currentDrug = null;

let attempts = 0;

// ==========================================
// Load Drug + Module Data
// ==========================================
Promise.all([
  fetch("data/drugs.json").then(r => r.json()),
  fetch("data/modules.json").then(r => r.json())
])
  .then(([drugData, moduleData]) => {
    drugs = drugData.drugs;
    modules = moduleData.modules;
    populateModules();
  })
  .catch(err => {
    console.error("❌ Data loading error:", err);
  });

// ==========================================
// Populate Module Dropdown
// ==========================================
function populateModules() {
  const modSelect = document.getElementById("moduleSelect");
  modSelect.innerHTML = "";

  modules.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    modSelect.appendChild(opt);
  });

  modSelect.addEventListener("change", () => {
    populateDrugs(modSelect.value);
  });

  populateDrugs(modules[0].id);
}

// ==========================================
// Populate Drug Dropdown (Based on Module)
// ==========================================
function populateDrugs(moduleId) {
  const drugSelect = document.getElementById("drugSelect");
  drugSelect.innerHTML = "";

  const mod = modules.find(m => m.id === moduleId);

  if (!mod || mod.drugs.length === 0) {
    console.warn("⚠️ No drugs found in module:", moduleId);
    return;
  }

  mod.drugs.forEach(drugId => {
    const drug = drugs.find(d => d.id === drugId);
    if (!drug) return;

    const opt = document.createElement("option");
    opt.value = drug.id;
    opt.textContent = drug.name;
    drugSelect.appendChild(opt);
  });

  drugSelect.addEventListener("change", () => {
    loadDrug(drugSelect.value);
  });

  loadDrug(mod.drugs[0]);
}

// ==========================================
// Load Drug Card Fields
// ==========================================
function loadDrug(id) {
  currentDrug = drugs.find(d => d.id === id);
  if (!currentDrug) return;

  // Core Drug Info
  document.getElementById("drugName").textContent =
    currentDrug.name || "";

  document.getElementById("therapeutic").textContent =
    currentDrug.therapeutic_area || "";

  document.getElementById("mechanism").textContent =
    currentDrug.mechanism_of_action || "";

  document.getElementById("target").textContent =
    currentDrug.target || "";

  // SAR Points (array → readable bullets)
  document.getElementById("sar").textContent =
    Array.isArray(currentDrug.sar_key_points)
      ? currentDrug.sar_key_points.join(" • ")
      : "";

  // Metabolism
  document.getElementById("metabolism").textContent =
    currentDrug.metabolism || "";

  // PK / ADMET
  document.getElementById("pk").textContent =
    currentDrug.pk_admet || "";

  // DDIs (array)
  document.getElementById("ddis").textContent =
    Array.isArray(currentDrug.ddis)
      ? currentDrug.ddis.join("; ")
      : "";

  // Clinical Significance
  document.getElementById("clinical").textContent =
    currentDrug.clinical_significance || "";

  // Reset attempts + feedback

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


  attempts = 0;
  document.getElementById("feedbackMsg").textContent = "";
}

// ==========================================
// Drawing Canvas (Apple Pencil + Stylus)
// ==========================================
const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");

// Responsive Canvas Setup
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = 400 * dpr;

  canvas.style.height = "400px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

let drawing = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  drawing = true;
  const r = canvas.getBoundingClientRect();
  lastX = e.clientX - r.left;
  lastY = e.clientY - r.top;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointerup", (e) => {
  drawing = false;
  canvas.releasePointerCapture(e.pointerId);
  ctx.beginPath();
});

canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;

  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.stroke();

  lastX = x;
  lastY = y;
});

// ==========================================
// Clear Canvas Button
// ==========================================
document.getElementById("clearBtn").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// ==========================================
// Submit Attempt Button → Hint Unlock
// ==========================================
document.getElementById("submitBtn").addEventListener("click", () => {
  attempts++;

  if (attempts < 2) {
    document.getElementById("feedbackMsg").textContent =
      "⚠️ Not quite. Try again before hint unlock.";
  } else {
    document.getElementById("feedbackMsg").textContent =
      "💡 Hint unlocked: Compare key functional groups with the correct structure.";
  }
});

// ==========================================
// Correct Structure Popup Modal
// ==========================================
const modal = document.getElementById("structureModal");

document.getElementById("showStructureBtn").addEventListener("click", () => {
  if (!currentDrug) return;

  document.getElementById("modalDrugName").textContent =
    currentDrug.name;

  // IMPORTANT: medchem is a subfolder → go up one level
  document.getElementById("modalStructureImg").src =
    `../assets/structures/png/${currentDrug.id}.png`;

  modal.classList.remove("hidden");
});

document.getElementById("closeModal").addEventListener("click", () => {
  modal.classList.add("hidden");
});

// Tap outside modal closes it
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.classList.add("hidden");
  }
});

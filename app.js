// PD Structure Mastery (GitHub Pages PWA)
// Standard patterns only: pointer events drawing + deterministic gating + jsPDF export

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "pd_structure_mastery_state_v1";

// ---------- State ----------
let LIB = null;
let currentDrug = null;

// checkpoint state: cpId -> { attemptsLeft, passed, selected: Set<string>, showHint }
let cpState = {};

// mapping: labels required + placed markers
let requiredMapLabels = [];
let markers = []; // {label, x, y} in CSS px relative to stage
let mapMode = false;

// ---------- UI ----------
const drugSelect = $("drugSelect");
const drugInfo = $("drugInfo");
const checkpointList = $("checkpointList");
const feedbackBox = $("feedbackBox");
const exportPNG = $("exportPNG");
const exportPDF = $("exportPDF");
const gatePill = $("gatePill");
const statusPill = $("statusPill");

const mapPanel = $("mapPanel");
const mapReqText = $("mapReqText");
const mapLabelSelect = $("mapLabelSelect");
const mapModeToggle = $("mapMode");
const mapStatus = $("mapStatus");

// ---------- Load library ----------
async function loadLibrary() {
  const res = await fetch("./pd_structure_checkpoints.json", { cache: "no-store" });
  LIB = await res.json();
  const drugs = (LIB.drugs || []).slice().sort((a,b) => (a.order||999)-(b.order||999));

  drugSelect.innerHTML =
    `<option value="">Select a drug…</option>` +
    drugs.map(d => `<option value="${d.drug}">${titleCase(d.drug)}</option>`).join("");

  restoreState();
  if (loadSaved().meta?.drug) {
    drugSelect.value = loadSaved().meta.drug;
    onDrugChange();
  }
}

function getDrug(name) {
  return (LIB?.drugs || []).find(d => d.drug === name) || null;
}

function titleCase(s){
  return (s||"").split(" ").map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(" ");
}

// ---------- Drug change ----------
drugSelect.addEventListener("change", onDrugChange);

function onDrugChange() {
  const name = drugSelect.value;
  currentDrug = name ? getDrug(name) : null;

  if (!currentDrug) {
    drugInfo.textContent = "";
    checkpointList.innerHTML = "";
    cpState = {};
    hideMapping();
    lockExport("Export locked");
    writeFeedback([{level:"warn", msg:"Select a drug to begin."}]);
    saveState();
    return;
  }

  drugInfo.textContent = `${titleCase(currentDrug.drug)} — complete checkpoints and feature mapping to unlock export.`;

  initCheckpointState();
  renderCheckpoints();

  // mapping unlock depends on FG checkpoint pass (or whichever checkpoint has requires_tap_map)
  refreshMappingUnlock();

  updateGateAndFeedback();
  saveState();
}

// ---------- Checkpoint state ----------
function initCheckpointState() {
  // new drug: reset cpState
  cpState = {};
  for (const cp of currentDrug.checkpoints) {
    cpState[cp.id] = { attemptsLeft: cp.attempts, passed:false, selected:new Set(), showHint:false };
  }

  // If saved state matches same drug, hydrate it
  const saved = loadSaved();
  if (saved.meta?.drug === currentDrug.drug && saved.checkpoints) {
    for (const cp of currentDrug.checkpoints) {
      const s = saved.checkpoints[cp.id];
      if (!s) continue;
      cpState[cp.id] = {
        attemptsLeft: typeof s.attemptsLeft === "number" ? s.attemptsLeft : cp.attempts,
        passed: !!s.passed,
        selected: new Set(Array.isArray(s.selected) ? s.selected : []),
        showHint: !!s.showHint
      };
    }
    // restore mapping if saved
    requiredMapLabels = Array.isArray(saved.mapping?.required) ? saved.mapping.required : [];
    markers = Array.isArray(saved.mapping?.markers) ? saved.mapping.markers : [];
    if (requiredMapLabels.length) showMapping(requiredMapLabels);
    renderMarkers();
    updateMapStatus();
  } else {
    hideMapping();
  }
}

// ---------- Rendering checkpoints ----------
function renderCheckpoints() {
  checkpointList.innerHTML = "";

  for (const cp of currentDrug.checkpoints) {
    const st = cpState[cp.id];
    const statusClass = st.passed ? "ok" : (st.attemptsLeft <= 0 ? "bad" : "lock");
    const statusText = st.passed ? "Passed" : (st.attemptsLeft <= 0 ? "Hint available" : `Attempts: ${st.attemptsLeft}`);

    const wrap = document.createElement("div");
    wrap.className = "cp";

    wrap.innerHTML = `
      <div class="cpHead">
        <div>
          <div class="cpTitle">${cp.title}</div>
          <div class="cpMeta">${cp.type === "multi_select" ? "Multi-select (exact set required)" : "Single-select (exact choice required)"}</div>
        </div>
        <div class="cpStatus ${statusClass}">${statusText}</div>
      </div>

      <div class="chips" id="chips_${cp.id}"></div>

      <div class="cpActions">
        <button class="primary" id="check_${cp.id}">Check answer</button>
        <button class="subtle" id="reset_${cp.id}">Reset</button>
      </div>

      <div class="notice" id="notice_${cp.id}" style="display:none;"></div>
      <div class="hint" id="hint_${cp.id}" style="display:${st.showHint ? "block" : "none"};">
        <b>Hint:</b> ${cp.hint}
      </div>
    `;

    checkpointList.appendChild(wrap);

    // Build chips
    const chipsEl = $(`chips_${cp.id}`);
    for (const choice of cp.choices) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (st.selected.has(choice) ? " selected" : "");
      chip.textContent = choice.replaceAll("_"," ");

      chip.addEventListener("click", () => {
        if (st.passed) return;
        if (cp.type === "single_select") {
          st.selected.clear();
          st.selected.add(choice);
        } else {
          st.selected.has(choice) ? st.selected.delete(choice) : st.selected.add(choice);
        }
        saveState();
        renderCheckpoints();
      });

      chipsEl.appendChild(chip);
    }

    // Check handler
    $(`check_${cp.id}`).addEventListener("click", () => {
      if (st.passed) return;
      const ok = evaluateStrict(cp, st);

      const n = $(`notice_${cp.id}`);
      n.style.display = "block";

      if (ok) {
        n.className = "notice ok";
        n.textContent = "Correct — checkpoint passed.";
      } else {
        if (st.attemptsLeft <= 0) {
          n.className = "notice warn";
          n.textContent = "Not correct. Hint unlocked — review and try again.";
        } else {
          n.className = "notice bad";
          n.textContent = `Not correct. Try again. Attempts left: ${st.attemptsLeft}`;
        }
      }

      // If this checkpoint enables mapping and it just passed, unlock mapping
      if (ok && cp.requires_tap_map) {
        const labels = cp.tap_labels || cp.correct || [];
        showMapping(labels);
        // reset markers for new requirement
        markers = [];
        renderMarkers();
        updateMapStatus();
      }

      saveState();
      renderCheckpoints();
      refreshMappingUnlock();
      updateGateAndFeedback();
    });

    // Reset selection
    $(`reset_${cp.id}`).addEventListener("click", () => {
      if (st.passed) return;
      st.selected.clear();
      const n = $(`notice_${cp.id}`);
      n.style.display = "block";
      n.className = "notice warn";
      n.textContent = "Selection cleared.";
      saveState();
      renderCheckpoints();
    });
  }
}

// Strict exact-match evaluation
function evaluateStrict(cp, st) {
  const selected = Array.from(st.selected);
  const correct = cp.correct;

  if (selected.length === 0) {
    st.attemptsLeft = Math.max(0, st.attemptsLeft - 1);
    if (st.attemptsLeft === 0) st.showHint = true;
    return false;
  }

  const sel = new Set(selected);
  const cor = new Set(correct);

  let ok = sel.size === cor.size;
  if (ok) {
    for (const c of cor) if (!sel.has(c)) { ok = false; break; }
    for (const s of sel) if (!cor.has(s)) { ok = false; break; }
  }

  if (ok) {
    st.passed = true;
    return true;
  }

  st.attemptsLeft = Math.max(0, st.attemptsLeft - 1);
  if (st.attemptsLeft === 0) st.showHint = true;
  return false;
}

// ---------- Mapping (tap-to-map) ----------
mapModeToggle.addEventListener("change", (e) => {
  mapMode = e.target.checked;
  statusPill.textContent = mapMode ? "Map mode" : "Draw mode";
});

$("clearMarkers").addEventListener("click", () => {
  markers = [];
  renderMarkers();
  updateMapStatus();
  saveState();
  updateGateAndFeedback();
});

function showMapping(labels) {
  requiredMapLabels = Array.isArray(labels) ? labels.slice() : [];
  if (!requiredMapLabels.length) return hideMapping();

  mapPanel.style.display = "block";
  mapReqText.textContent = `Required: ${requiredMapLabels.join(", ").replaceAll("_"," ")}`;

  mapLabelSelect.innerHTML = requiredMapLabels
    .map(l => `<option value="${l}">${l.replaceAll("_"," ")}</option>`)
    .join("");

  mapModeToggle.checked = true;
  mapMode = true;
  statusPill.textContent = "Map mode";

  updateMapStatus();
}

function hideMapping() {
  requiredMapLabels = [];
  markers = [];
  mapPanel.style.display = "none";
  mapModeToggle.checked = false;
  mapMode = false;
  statusPill.textContent = "Ready";
}

function mappingComplete() {
  if (!requiredMapLabels.length) return true;
  const have = new Set(markers.map(m => m.label));
  return requiredMapLabels.every(l => have.has(l));
}

function updateMapStatus() {
  if (!requiredMapLabels.length) { mapStatus.textContent = ""; return; }
  const have = new Set(markers.map(m => m.label));
  const missing = requiredMapLabels.filter(l => !have.has(l));
  mapStatus.textContent = missing.length
    ? `Missing: ${missing.join(", ").replaceAll("_"," ")}`
    : "All required features mapped ✔";
}

// Unlock mapping if a requires_tap_map checkpoint is passed; otherwise hide it
function refreshMappingUnlock() {
  if (!currentDrug) return hideMapping();

  // Find first checkpoint that requires mapping AND is passed
  const mapCp = currentDrug.checkpoints.find(cp => cp.requires_tap_map && cpState[cp.id]?.passed);
  if (mapCp) {
    const labels = mapCp.tap_labels || mapCp.correct || [];
    if (!requiredMapLabels.length || labels.join("|") !== requiredMapLabels.join("|")) {
      showMapping(labels);
      // markers might be stale; keep them, but user can clear; we keep for convenience
      renderMarkers();
      updateMapStatus();
    }
  } else {
    hideMapping();
  }
}

// ---------- Gate ----------
function allCheckpointsPassed() {
  if (!currentDrug) return false;
  return currentDrug.checkpoints.every(cp => cpState[cp.id]?.passed);
}

function updateGateAndFeedback() {
  if (!currentDrug) {
    lockExport("Export locked");
    writeFeedback([{level:"warn", msg:"Select a drug to begin."}]);
    return;
  }

  const cpsOk = allCheckpointsPassed();
  const mapOk = mappingComplete();

  if (cpsOk && mapOk) {
    unlockExport("Export unlocked");
    writeFeedback([{level:"ok", msg:"All checkpoints passed and required features mapped. You can export."}]);
  } else {
    lockExport("Export locked");
    const msgs = [];
    if (!cpsOk) msgs.push({level:"bad", msg:"Complete all checkpoints (strict exact match)."});
    if (cpsOk && !mapOk) msgs.push({level:"bad", msg:"Now map all required features on the drawing (Map mode)."});
    msgs.push({level:"ok", msg:"After 2 incorrect attempts, a hint unlocks automatically."});
    writeFeedback(msgs);
  }
}

function unlockExport(text) {
  exportPNG.disabled = false;
  exportPDF.disabled = false;
  gatePill.textContent = text;
}
function lockExport(text) {
  exportPNG.disabled = true;
  exportPDF.disabled = true;
  gatePill.textContent = text;
}

// ---------- Feedback ----------
function writeFeedback(items) {
  feedbackBox.innerHTML = items.map(i => `<div class="fb ${i.level}">• ${i.msg}</div>`).join("");
}

// ---------- Drawing (standard pointer-events approach) ----------
const stage = $("stage");
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { alpha:true });

let tool = "pen";
let size = 4;
let drawing = false;
let last = null;
let penOnly = false;

let undoStack = [];
let redoStack = [];

$("toolPen").addEventListener("click", () => {
  tool = "pen";
  $("toolPen").classList.add("primary");
  $("toolEraser").classList.remove("primary");
});
$("toolEraser").addEventListener("click", () => {
  tool = "eraser";
  $("toolEraser").classList.add("primary");
  $("toolPen").classList.remove("primary");
});
$("penSize").addEventListener("input", (e) => size = parseInt(e.target.value,10));
$("penOnly").addEventListener("change", (e) => penOnly = e.target.checked);

$("undoBtn").addEventListener("click", async () => {
  if (!undoStack.length) return;
  redoStack.push(canvas.toDataURL("image/png"));
  await restoreInk(undoStack.pop());
  saveState();
});
$("redoBtn").addEventListener("click", async () => {
  if (!redoStack.length) return;
  undoStack.push(canvas.toDataURL("image/png"));
  await restoreInk(redoStack.pop());
  saveState();
});
$("clearCanvas").addEventListener("click", () => {
  if (!confirm("Clear drawing?")) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  undoStack = []; redoStack = [];
  markers = []; renderMarkers(); updateMapStatus();
  saveState();
  updateGateAndFeedback();
});

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = stage.clientWidth;
  const cssH = Math.round(cssW * 0.75);

  const snap = canvas.toDataURL("image/png");

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  if (snap && snap !== "data:,") restoreInk(snap);
  renderMarkers(); // markers are in CSS coords, so just redraw
}

window.addEventListener("resize", fitCanvas);

function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function pushUndo() {
  try{
    undoStack.push(canvas.toDataURL("image/png"));
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
  } catch {}
}

function restoreInk(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0);
      resolve();
    };
    img.src = dataUrl;
  });
}

stage.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  stage.setPointerCapture(e.pointerId);

  if (penOnly && e.pointerType !== "pen") return;

  // In map mode, a pointerdown places a marker instead of drawing
  if (mapMode && requiredMapLabels.length) {
    placeMarker(e.clientX, e.clientY);
    return;
  }

  drawing = true;
  last = pointerPos(e);
  pushUndo();
}, { passive:false });

stage.addEventListener("pointermove", (e) => {
  e.preventDefault();
  if (!drawing) return;

  const p = pointerPos(e);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = size * 2;
  } else {
    ctx.globalCompositeOperation = "source-over";
    const pressure = (typeof e.pressure === "number" && e.pressure > 0) ? e.pressure : 0.5;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = Math.max(1, size * (0.6 + pressure));
  }

  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
}, { passive:false });

stage.addEventListener("pointerup", (e) => {
  e.preventDefault();
  drawing = false;
  last = null;
  ctx.globalCompositeOperation = "source-over";
  saveState();
}, { passive:false });

stage.addEventListener("pointercancel", () => {
  drawing = false;
  last = null;
  ctx.globalCompositeOperation = "source-over";
  saveState();
});

// ---------- Markers (tap-to-map) ----------
function placeMarker(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  const label = mapLabelSelect.value;

  markers.push({ label, x, y });
  renderMarkers();
  updateMapStatus();
  saveState();
  updateGateAndFeedback();
}

function renderMarkers() {
  stage.querySelectorAll(".marker").forEach(m => m.remove());
  for (const mk of markers) {
    const el = document.createElement("div");
    el.className = "marker";
    el.style.left = `${mk.x}px`;
    el.style.top = `${mk.y}px`;
    el.title = mk.label.replaceAll("_"," ");
    el.textContent = (mk.label[0] || "?").toUpperCase();
    stage.appendChild(el);
  }
}

// ---------- Export (standard client-side PNG/PDF) ----------
exportPNG.addEventListener("click", async () => {
  const blob = await exportPNGBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(currentDrug?.drug || "pd")}_structure.png`;
  a.click();
  URL.revokeObjectURL(url);
});

exportPDF.addEventListener("click", async () => {
  const blob = await exportPNGBlob();
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const b64 = btoa(String.fromCharCode(...bytes));
  const imgData = `data:image/png;base64,${b64}`;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:"portrait", unit:"pt", format:"letter" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;

  const img = new Image();
  img.onload = () => {
    const scale = Math.min((pageW - margin*2) / img.width, (pageH - margin*2) / img.height);
    pdf.addImage(imgData, "PNG", margin, margin, img.width*scale, img.height*scale);
    pdf.save(`${(currentDrug?.drug || "pd")}_structure.pdf`);
  };
  img.src = imgData;
});

async function exportPNGBlob() {
  // Compose a simple sheet: header + structure canvas with markers
  const W = 1100;
  const margin = 24;
  const headerH = 180;
  const boxH = 720;
  const H = headerH + boxH + 30;

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const o = out.getContext("2d");

  o.fillStyle = "#fff";
  o.fillRect(0,0,W,H);

  // header
  o.fillStyle = "#111827";
  o.font = "20px system-ui";
  o.fillText("PD Structure Mastery", margin, 44);

  o.font = "14px system-ui";
  o.fillText(`Drug: ${titleCase(currentDrug?.drug || "")}`, margin, 80);
  o.fillText(`Student: ${$("studentName").value || ""}`, margin, 104);
  o.fillText(`Date: ${$("dateStr").value || ""}`, margin, 128);

  o.font = "12px system-ui";
  o.fillText(`Mapped features required: ${requiredMapLabels.join(", ").replaceAll("_"," ") || "none"}`, margin, 154);

  // draw canvas into box
  const img = await dataUrlToImage(canvas.toDataURL("image/png"));
  const boxX = margin;
  const boxY = headerH;
  const boxW = W - margin*2;

  o.strokeStyle = "rgba(17,24,39,.18)";
  o.strokeRect(boxX, boxY, boxW, boxH);

  const scale = Math.min(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = boxX + (boxW - dw)/2;
  const dy = boxY + (boxH - dh)/2;
  o.drawImage(img, dx, dy, dw, dh);

  // markers over image (map from CSS coords to image draw coords)
  const stageRect = stage.getBoundingClientRect();
  const sx = dw / stageRect.width;
  const sy = dh / stageRect.height;

  o.fillStyle = "#0f172a";
  o.strokeStyle = "#0f172a";
  o.font = "12px system-ui";

  for (const mk of markers) {
    const tx = dx + mk.x * sx;
    const ty = dy + mk.y * sy;
    o.beginPath();
    o.arc(tx, ty, 10, 0, Math.PI * 2);
    o.stroke();
    o.fillText((mk.label[0] || "?").toUpperCase(), tx - 4, ty + 4);
  }

  return new Promise((resolve) => out.toBlob(resolve, "image/png", 1.0));
}

function dataUrlToImage(dataUrl){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.src = dataUrl;
  });
}

// ---------- Reset ----------
$("resetAll").addEventListener("click", () => {
  if (!confirm("Reset everything on this device?")) return;
  localStorage.removeItem(STORAGE_KEY);

  $("studentName").value = "";
  $("dateStr").value = "";
  drugSelect.value = "";

  ctx.clearRect(0,0,canvas.width,canvas.height);
  undoStack = []; redoStack = [];

  currentDrug = null;
  cpState = {};
  hideMapping();
  checkpointList.innerHTML = "";

  lockExport("Export locked");
  writeFeedback([{level:"warn", msg:"Reset complete. Select a drug to begin."}]);
});

// ---------- Save/restore ----------
function loadSaved(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return {};
  try{ return JSON.parse(raw); } catch { return {}; }
}

function saveState(){
  statusPill.textContent = "Saved";
  const payload = {
    meta: {
      drug: drugSelect.value || "",
      student: $("studentName").value || "",
      date: $("dateStr").value || ""
    },
    checkpoints: serializeCpState(),
    mapping: {
      required: requiredMapLabels,
      markers: markers
    },
    ink: canvas.toDataURL("image/png")
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function serializeCpState(){
  const out = {};
  if(!currentDrug) return out;
  for (const cp of currentDrug.checkpoints) {
    const st = cpState[cp.id];
    out[cp.id] = {
      attemptsLeft: st.attemptsLeft,
      passed: st.passed,
      selected: Array.from(st.selected),
      showHint: st.showHint
    };
  }
  return out;
}

function restoreState(){
  const saved = loadSaved();
  if(saved.meta){
    $("studentName").value = saved.meta.student || "";
    $("dateStr").value = saved.meta.date || "";
  }
  if(saved.ink){
    restoreInk(saved.ink);
  }
}

// ---------- Boot ----------
(async function boot(){
  fitCanvas();
  lockExport("Export locked");
  writeFeedback([{level:"warn", msg:"Select a drug to begin."}]);
  await loadLibrary();
})();

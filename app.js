let drugs = [];
let currentDrug = null;
let attempts = 0;

// Load drug database
fetch("data/drugs.json")
  .then(res => res.json())
  .then(data => {
    drugs = data.drugs;
    populateDropdown();
  });

function populateDropdown() {
  const select = document.getElementById("drugSelect");

  drugs.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    select.appendChild(opt);
  });

  select.onchange = () => loadDrug(select.value);
  loadDrug(drugs[0].id);
}

function loadDrug(id) {
  currentDrug = drugs.find(d => d.id === id);

  document.getElementById("drugName").textContent = currentDrug.name;
  document.getElementById("therapeutic").textContent = currentDrug.therapeutic_area;
  document.getElementById("mechanism").textContent = currentDrug.mechanism;
  document.getElementById("target").textContent = currentDrug.target;
  document.getElementById("sar").textContent = currentDrug.sar;
  document.getElementById("metabolism").textContent = currentDrug.metabolism;
  document.getElementById("pk").textContent = currentDrug.pk;
  document.getElementById("ddis").textContent = currentDrug.ddis;
  document.getElementById("clinical").textContent = currentDrug.clinical;

  attempts = 0;
  document.getElementById("feedbackMsg").textContent = "";
}

// Drawing Canvas Setup
const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");

canvas.width = canvas.offsetWidth;
canvas.height = 400;

let drawing = false;

canvas.addEventListener("pointerdown", () => drawing = true);
canvas.addEventListener("pointerup", () => drawing = false);

canvas.addEventListener("pointermove", e => {
  if (!drawing) return;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";

  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
});

// Clear button
document.getElementById("clearBtn").onclick = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};

// Submit attempt logic
document.getElementById("submitBtn").onclick = () => {
  attempts++;
  if (attempts < 2) {
    document.getElementById("feedbackMsg").textContent =
      "⚠️ Not quite. Try again before hint unlock.";
  } else {
    document.getElementById("feedbackMsg").textContent =
      "💡 Hint: Compare key functional groups with the correct structure.";
  }
};

// Modal popup
const modal = document.getElementById("structureModal");

document.getElementById("showStructureBtn").onclick = () => {
  document.getElementById("modalDrugName").textContent = currentDrug.name;
  document.getElementById("modalStructureImg").src =
    `assets/structures/png/${currentDrug.id}.png`;

  modal.classList.remove("hidden");
};

document.getElementById("closeModal").onclick = () => {
  modal.classList.add("hidden");
};

// SAR checkpoint lock
document.getElementById("sarQuiz").onchange = (e) => {
  const result = document.getElementById("sarResult");

  if (e.target.value === "correct") {
    result.textContent = "✅ Correct — proceed!";
    result.style.color = "green";
  } else {
    result.textContent = "❌ Incorrect — try again.";
    result.style.color = "red";
  }
};

const STORAGE_KEY = "carta_keluarga_smartart_v1";

const DEFAULT_SMARTART_TEXT = `# Keluarga Ayah
  Ghafur
    Saleh
      Loman
        Abdullah + Maimun
          Sukeri
          Lutfi + Huda
            Rayyan
            Fayyadh
          Zaki + Kak Nor

# Keluarga Ibu
  Hamat + Zimah
    Maimun + Abdullah
      Sukeri
      Lutfi + Huda
        Rayyan
        Fayyadh
      Zaki + Kak Nor`;

let state = {
  isEditing: false,
  searchQuery: "",
  rawText: "",
  roots: []
};

function parseLineEntry(rawLine) {
  const leadingMatch = rawLine.match(/^(\s*)(.*)$/);
  const leadingSpaces = leadingMatch ? leadingMatch[1] : "";
  const content = leadingMatch ? leadingMatch[2].trim() : "";

  if (!content) return null;

  // Kira tahap kedalaman berdasarkan tab atau setiap 2 ruang kosong
  const normalizedIndent = leadingSpaces.replace(/\t/g, "  ");
  const depth = Math.floor(normalizedIndent.length / 2);

  const plusParts = content.split(/\s*\+\s*/);
  const name = (plusParts[0] || "").trim();
  const spouse = plusParts.length > 1 ? plusParts.slice(1).join(" + ").trim() : "";

  if (!name) return null;

  return {
    depth,
    name,
    spouse,
    children: []
  };
}

// Tukar teks berindentasi (gaya SmartArt) kepada struktur pokok hierarki
function parseSmartArtText(text) {
  const lines = (text || "").split(/\r?\n/);
  const roots = [];
  const stack = [];

  for (const line of lines) {
    const entry = parseLineEntry(line);
    if (!entry) continue;

    while (stack.length > 0 && stack[stack.length - 1].depth >= entry.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(entry);
    } else {
      stack[stack.length - 1].children.push(entry);
    }

    stack.push(entry);
  }

  return roots;
}

// Tukar semula struktur pokok kepada teks berindentasi supaya mudah disunting di panel edit
function treeToSmartArtText(nodes, depth = 0) {
  const indent = "  ".repeat(depth);
  const lines = [];

  for (const node of nodes || []) {
    const label = node.spouse ? `${node.name} + ${node.spouse}` : node.name;
    lines.push(`${indent}${label}`);
    if (node.children && node.children.length > 0) {
      lines.push(treeToSmartArtText(node.children, depth + 1));
    }
  }

  return lines.join("\n");
}

function saveLocal() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rawText: state.rawText,
        roots: state.roots
      })
    );
  } catch (e) {
    console.warn("Gagal simpan ke localStorage:", e);
  }
}

function loadLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      state.rawText = DEFAULT_SMARTART_TEXT;
      state.roots = parseSmartArtText(DEFAULT_SMARTART_TEXT);
      return;
    }
    const parsed = JSON.parse(saved);
    if (typeof parsed.rawText === "string") {
      state.rawText = parsed.rawText;
      state.roots = parseSmartArtText(parsed.rawText);
    } else if (Array.isArray(parsed.roots)) {
      state.roots = parsed.roots;
      state.rawText = treeToSmartArtText(parsed.roots);
    }
  } catch (e) {
    console.warn("Gagal baca data localStorage:", e);
    state.rawText = DEFAULT_SMARTART_TEXT;
    state.roots = parseSmartArtText(DEFAULT_SMARTART_TEXT);
  }
}

function isSearchMatch(nameText) {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q || !nameText) return false;
  return nameText.toLowerCase().includes(q);
}

function renderCard(personName, isSpouse = false) {
  const spouseClass = isSpouse ? " spouse-card" : "";
  const matchClass = isSearchMatch(personName) ? " search-match" : "";
  return `<div class="person-card${spouseClass}${matchClass}"><span class="person-name">${personName}</span></div>`;
}

function buildNodeHTML(node) {
  let coupleHTML = `<div class="couple">${renderCard(node.name, false)}`;
  if (node.spouse) {
    coupleHTML += `<div class="couple-link"></div>${renderCard(node.spouse, true)}`;
  }
  coupleHTML += `</div>`;

  let html = `<li>${coupleHTML}`;
  if (node.children && node.children.length > 0) {
    html += "<ul>";
    for (const child of node.children) {
      html += buildNodeHTML(child);
    }
    html += "</ul>";
  }
  html += "</li>";
  return html;
}

function scrollToFirstMatch() {
  if (!state.searchQuery.trim()) return;
  const first = document.querySelector(".person-card.search-match");
  if (first) {
    first.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
}

function renderTree() {
  const treeEl = document.getElementById("tree");
  if (!treeEl) return;

  if (!state.roots || state.roots.length === 0) {
    treeEl.innerHTML = `<p class="hint">Tiada data lagi. Tekan "Buka Panel Edit" untuk mula menaip senarai.</p>`;
    return;
  }

  const branchesHTML = state.roots.map((rootNode) => buildNodeHTML(rootNode)).join("");
  treeEl.innerHTML = `<ul>${branchesHTML}</ul>`;
  scrollToFirstMatch();
}

function setEditPanelOpen(open) {
  state.isEditing = open;
  const panel = document.getElementById("editPanel");
  const toggleBtn = document.getElementById("toggleEditBtn");
  const textarea = document.getElementById("smartArtInput");
  const statusEl = document.getElementById("statusMsg");

  if (panel) panel.classList.toggle("hidden", !open);
  if (toggleBtn) toggleBtn.textContent = open ? "Tutup Panel Edit" : "Buka Panel Edit";
  if (open && textarea) {
    textarea.value = state.rawText || "";
    textarea.focus();
  }
  if (statusEl) {
    statusEl.textContent = open
      ? 'Panel edit dibuka: susun nama/pasangan dan gunakan "Tab" untuk anak.'
      : "Panel edit ditutup.";
  }
}

document.getElementById("toggleEditBtn").addEventListener("click", () => {
  setEditPanelOpen(!state.isEditing);
});

document.getElementById("closeEditBtn").addEventListener("click", () => {
  setEditPanelOpen(false);
});

document.getElementById("applyTreeBtn").addEventListener("click", () => {
  const textarea = document.getElementById("smartArtInput");
  const statusEl = document.getElementById("statusMsg");
  const text = textarea ? textarea.value : "";

  state.rawText = text;
  state.roots = parseSmartArtText(text);
  saveLocal();
  renderTree();

  if (statusEl) {
    statusEl.textContent = "Carta berjaya dikemas kini dan disimpan.";
  }
});

// Benarkan kekunci Tab memasukkan 2 ruang kosong di dalam textarea gaya SmartArt
document.getElementById("smartArtInput").addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const el = e.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    el.value = `${value.substring(0, start)}  ${value.substring(end)}`;
    el.selectionStart = el.selectionEnd = start + 2;
  }
});

document.getElementById("printBtn").addEventListener("click", () => {
  window.print();
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderTree();
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
  state.searchQuery = "";
  const searchEl = document.getElementById("searchInput");
  if (searchEl) searchEl.value = "";
  renderTree();
});

loadLocal();
renderTree();

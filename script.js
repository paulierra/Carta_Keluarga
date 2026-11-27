const STORAGE_KEY = "carta_keluarga_data_v1";

let state = {
  activeTab: "father", // "father" atau "mother"
  isEditing: false,
  searchQuery: "",
  trees: {
    father: null,
    mother: null
  }
};

// Simpan ke localStorage + hook cloud (Firebase / Supabase)
async function persistData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trees));
  } catch (e) {
    console.warn("Gagal simpan ke localStorage:", e);
  }
  await saveToCloud(state.trees);
}

async function saveToCloud(treesData) {
  return Promise.resolve(treesData);
}

async function loadFromCloud() {
  return null;
}

function cloneNode(node) {
  if (!node) return null;
  return {
    name: node.name,
    relation: node.relation || "",
    father: node.father || "",
    spouse: node.spouse ? { ...node.spouse } : null,
    children: Array.isArray(node.children) ? node.children.map(cloneNode) : []
  };
}

// Cari nod pasangan/ibu dalam pokok ayah untuk disegerakkan ke tab Keluarga Ibu
function findMotherSeed(node, husbandName) {
  if (!node) return null;

  if (node.spouse && node.spouse.name) {
    if (!husbandName || node.name.toLowerCase() === husbandName.toLowerCase()) {
      return {
        name: node.spouse.name,
        relation: node.spouse.relation || "binti",
        father: node.spouse.father || "",
        spouse: {
          name: node.name,
          relation: node.relation || "bin",
          father: node.father || ""
        },
        children: Array.isArray(node.children) ? node.children.map(cloneNode) : []
      };
    }
  }

  for (let child of node.children || []) {
    const found = findMotherSeed(child, husbandName);
    if (found) return found;
  }
  return null;
}

// Pastikan tab Keluarga Ibu mempunyai rujukan pasangan/ibu & anak daripada tab Keluarga Ayah
function syncMotherTreeFromFather(preferredHusband = "") {
  if (!state.trees.father) return;

  const seed = findMotherSeed(state.trees.father, preferredHusband);
  if (!seed) return;

  if (!state.trees.mother) {
    state.trees.mother = seed;
    return;
  }

  // Jika tab Ibu sudah ada leluhur di atas, sambungkan cabang ibu & anak di bawahnya jika belum ada
  const existingMother = findNode(state.trees.mother, seed.name);
  if (existingMother) {
    if (!existingMother.spouse && seed.spouse) {
      existingMother.spouse = seed.spouse;
    }
    if (existingMother.children.length === 0 && seed.children.length > 0) {
      existingMother.children = seed.children;
    }
  }
}

async function initData() {
  const cloudData = await loadFromCloud();
  if (cloudData) {
    state.trees = cloudData;
    return;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.trees.father = parsed.father || null;
      state.trees.mother = parsed.mother || null;
    }
  } catch (e) {
    console.warn("Gagal baca data tersimpan:", e);
  }
}

function getCurrentTree() {
  return state.trees[state.activeTab];
}

function setCurrentTree(newTree) {
  state.trees[state.activeTab] = newTree;
}

function splitPersonAndFather(text) {
  const clean = text.trim();
  const match = clean.match(/^(.+?)\s+(bin|binti)\s+(.+)$/i);
  if (!match) {
    return { name: clean, relation: "", father: "" };
  }
  return {
    name: match[1].trim(),
    relation: match[2].toLowerCase(),
    father: match[3].trim()
  };
}

function formatParentLabel(person) {
  if (!person || !person.father) return "";
  const prefix = person.relation === "binti" ? "bt." : "b.";
  return `${prefix} ${person.father}`;
}

function parseChild(input) {
  const match = input.match(/^(.+?)\s+(bin|binti)\s+(.+)$/i);
  if (!match) return null;
  return {
    child: match[1].trim(),
    relation: match[2].toLowerCase(),
    father: match[3].trim()
  };
}

function parseSpouse(input) {
  const plusMatch = input.match(/^(.+?)\s*\+\s*(.+)$/);
  if (plusMatch) {
    return {
      first: splitPersonAndFather(plusMatch[1]),
      second: splitPersonAndFather(plusMatch[2])
    };
  }
  const wordMatch = input.match(/^(.+?)\s+pasangan\s+(.+)$/i);
  if (wordMatch) {
    return {
      first: splitPersonAndFather(wordMatch[2]),
      second: splitPersonAndFather(wordMatch[1])
    };
  }
  return null;
}

function findNode(node, targetName) {
  if (!node) return null;
  const target = targetName.toLowerCase();
  if (
    node.name.toLowerCase() === target ||
    (node.spouse && node.spouse.name.toLowerCase() === target)
  ) {
    return node;
  }
  for (let child of node.children) {
    const found = findNode(child, targetName);
    if (found) return found;
  }
  return null;
}

function deleteMember(node, targetName) {
  if (!node) return false;
  const target = targetName.toLowerCase();

  if (node.spouse && node.spouse.name.toLowerCase() === target) {
    node.spouse = null;
    return true;
  }

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.name.toLowerCase() === target) {
      node.children.splice(i, 1);
      return true;
    }
    if (deleteMember(child, targetName)) return true;
  }
  return false;
}

function collectNames(node, list = []) {
  if (!node) return list;
  list.push(node.name);
  if (node.spouse) list.push(node.spouse.name);
  for (let child of node.children) {
    collectNames(child, list);
  }
  return list;
}

function updateDeleteDropdown() {
  const selectEl = document.getElementById("deleteSelect");
  selectEl.innerHTML = `<option value="">-- Pilih nama untuk dipadam --</option>`;
  const allNames = collectNames(getCurrentTree());
  allNames.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
}

function isSearchMatch(person) {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q || !person) return false;
  return (
    (person.name && person.name.toLowerCase().includes(q)) ||
    (person.father && person.father.toLowerCase().includes(q))
  );
}

function renderPersonCard(person, isSpouse = false) {
  const parentText = formatParentLabel(person);
  const extraClass = isSpouse ? " spouse-card" : "";
  const matchClass = isSearchMatch(person) ? " search-match" : "";
  return `
    <div class="person-card${extraClass}${matchClass}">
      <span class="person-name">${person.name}</span>
      ${parentText ? `<span class="person-parent">${parentText}</span>` : ""}
    </div>
  `;
}

function buildHTML(node) {
  let boxHTML = `<div class="couple">${renderPersonCard(node, false)}`;
  if (node.spouse) {
    boxHTML += `<div class="couple-link"></div>${renderPersonCard(node.spouse, true)}`;
  }
  boxHTML += `</div>`;

  let html = `<li>${boxHTML}`;
  if (node.children.length > 0) {
    html += "<ul>";
    for (let child of node.children) {
      html += buildHTML(child);
    }
    html += "</ul>";
  }
  html += "</li>";
  return html;
}

function scrollToFirstMatch() {
  if (!state.searchQuery.trim()) return;
  const firstMatch = document.querySelector(".person-card.search-match");
  if (firstMatch) {
    firstMatch.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
}

function renderTree() {
  const treeContainer = document.getElementById("tree");
  const currentTree = getCurrentTree();
  if (!currentTree) {
    treeContainer.innerHTML = `<p class="hint">Tiada data lagi dalam bahagian ini.</p>`;
  } else {
    treeContainer.innerHTML = `<ul>${buildHTML(currentTree)}</ul>`;
  }
  updateDeleteDropdown();
  scrollToFirstMatch();
}

function syncUI() {
  const panel = document.getElementById("editPanel");
  const editBtn = document.getElementById("toggleEditBtn");
  const tabFather = document.getElementById("tabFather");
  const tabMother = document.getElementById("tabMother");

  panel.classList.toggle("hidden", !state.isEditing);
  editBtn.textContent = state.isEditing ? "Selesai Edit" : "Edit";

  tabFather.classList.toggle("active", state.activeTab === "father");
  tabMother.classList.toggle("active", state.activeTab === "mother");

  renderTree();
}

// Logik utama menambah nama (dipakai oleh butang Tambah & kekunci Enter)
async function handleAddMember() {
  if (!state.isEditing) return;

  const inputEl = document.getElementById("fullName");
  const statusEl = document.getElementById("statusMsg");
  const rawText = inputEl.value.trim();
  if (!rawText) return;

  let currentTree = getCurrentTree();
  const spouseData = parseSpouse(rawText);
  const childData = parseChild(rawText);
  let syncedHusband = "";

  if (spouseData) {
    const p1 = spouseData.first;
    const p2 = spouseData.second;

    if (!currentTree) {
      currentTree = {
        name: p1.name,
        relation: p1.relation,
        father: p1.father,
        spouse: { name: p2.name, relation: p2.relation, father: p2.father },
        children: []
      };
      syncedHusband = p1.name;
      statusEl.textContent = `Pasangan ${p1.name} & ${p2.name} ditambah!`;
    } else {
      const node1 = findNode(currentTree, p1.name);
      const node2 = findNode(currentTree, p2.name);

      if (node1) {
        if (p1.father) {
          node1.father = p1.father;
          node1.relation = p1.relation;
        }
        node1.spouse = { name: p2.name, relation: p2.relation, father: p2.father };
        syncedHusband = node1.name;
        statusEl.textContent = `${p2.name} ditetapkan sebagai pasangan ${node1.name}.`;
      } else if (node2) {
        if (p2.father) {
          node2.father = p2.father;
          node2.relation = p2.relation;
        }
        node2.spouse = { name: p1.name, relation: p1.relation, father: p1.father };
        syncedHusband = node2.name;
        statusEl.textContent = `${p1.name} ditetapkan sebagai pasangan ${node2.name}.`;
      } else {
        statusEl.textContent = `Tiada nama "${p1.name}" atau "${p2.name}" dalam tab ini.`;
        return;
      }
    }

    setCurrentTree(currentTree);
    if (state.activeTab === "father") {
      syncMotherTreeFromFather(syncedHusband);
    }
    await persistData();
    inputEl.value = "";
    renderTree();
    return;
  }

  if (!currentTree && childData) {
    currentTree = {
      name: childData.child,
      relation: childData.relation,
      father: childData.father,
      spouse: null,
      children: []
    };
    statusEl.textContent = `"${childData.child}" ditambah.`;
    setCurrentTree(currentTree);
    await persistData();
    inputEl.value = "";
    renderTree();
    return;
  }

  if (!currentTree && !childData) {
    currentTree = {
      name: rawText,
      relation: "",
      father: "",
      spouse: null,
      children: []
    };
    statusEl.textContent = `"${rawText}" ditambah sebagai titik mula.`;
    setCurrentTree(currentTree);
    await persistData();
    inputEl.value = "";
    renderTree();
    return;
  }

  if (childData) {
    const fatherNode = findNode(currentTree, childData.father);
    if (fatherNode) {
      fatherNode.children.push({
        name: childData.child,
        relation: childData.relation,
        father: childData.father,
        spouse: null,
        children: []
      });
      statusEl.textContent = `${childData.child} ditambah di bawah ${childData.father}.`;
    } else if (currentTree.name.toLowerCase() === childData.child.toLowerCase()) {
      currentTree.relation = childData.relation;
      currentTree.father = childData.father;
      currentTree = {
        name: childData.father,
        relation: "",
        father: "",
        spouse: null,
        children: [currentTree]
      };
      statusEl.textContent = `${childData.father} ditambah di atas ${childData.child}.`;
    } else {
      statusEl.textContent = `Nama ayah "${childData.father}" tiada dalam tab ini.`;
      return;
    }

    setCurrentTree(currentTree);
    if (state.activeTab === "father") {
      syncMotherTreeFromFather();
    }
    await persistData();
    inputEl.value = "";
    renderTree();
    return;
  }

  statusEl.textContent = "Gunakan format 'Nama bin/binti Ayah' atau 'Nama1 + Nama2'.";
}

// Butang Edit / Selesai Edit
document.getElementById("toggleEditBtn").addEventListener("click", () => {
  state.isEditing = !state.isEditing;
  document.getElementById("statusMsg").textContent = state.isEditing
    ? "Mod Edit aktif: anda boleh tambah atau padam ahli."
    : "Mod Lihat aktif.";
  syncUI();
});

// Butang Print / Save PDF
document.getElementById("printBtn").addEventListener("click", () => {
  window.print();
});

// Tab Keluarga Ayah & Keluarga Ibu
document.getElementById("tabFather").addEventListener("click", () => {
  state.activeTab = "father";
  document.getElementById("statusMsg").textContent = "Memaparkan Carta Keluarga Ayah.";
  syncUI();
});

document.getElementById("tabMother").addEventListener("click", () => {
  state.activeTab = "mother";
  syncMotherTreeFromFather();
  document.getElementById("statusMsg").textContent = "Memaparkan Carta Keluarga Ibu.";
  syncUI();
});

// Carian nama
document.getElementById("searchInput").addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  renderTree();
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
  state.searchQuery = "";
  document.getElementById("searchInput").value = "";
  document.getElementById("statusMsg").textContent = "Carian dikosongkan.";
  renderTree();
});

// Butang Tambah & kekunci Enter
document.getElementById("addBtn").addEventListener("click", handleAddMember);
document.getElementById("fullName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleAddMember();
  }
});

// Butang Padam
document.getElementById("deleteBtn").addEventListener("click", async () => {
  if (!state.isEditing) return;

  const selectEl = document.getElementById("deleteSelect");
  const statusEl = document.getElementById("statusMsg");
  const chosenName = selectEl.value;

  if (!chosenName) {
    statusEl.textContent = "Sila pilih nama daripada senarai dahulu.";
    return;
  }

  const ok = confirm(`Padam "${chosenName}" daripada carta?`);
  if (!ok) return;

  let currentTree = getCurrentTree();
  if (currentTree && currentTree.name.toLowerCase() === chosenName.toLowerCase()) {
    currentTree = null;
    statusEl.textContent = `"${chosenName}" dipadam.`;
  } else {
    deleteMember(currentTree, chosenName);
    statusEl.textContent = `"${chosenName}" dipadam.`;
  }

  setCurrentTree(currentTree);
  await persistData();
  renderTree();
});

// Mula aplikasi
(async () => {
  await initData();
  syncUI();
})();

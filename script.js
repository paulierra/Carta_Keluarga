const STORAGE_KEY = "carta_keluarga_data_v13";

let state = {
  activeTab: "father", // "father" atau "mother"
  isEditing: false,
  searchQuery: "",
  selectedEditTarget: "",
  roles: {
    fatherName: "",
    motherName: ""
  },
  trees: {
    father: null,
    mother: null
  }
};

function onEvent(id, eventName, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Elemen #${id} tidak ditemui dalam index.html`);
    return;
  }
  el.addEventListener(eventName, handler);
}

async function persistData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trees: state.trees,
        roles: state.roles
      })
    );
  } catch (e) {
    console.warn("Gagal simpan ke localStorage:", e);
  }
  await saveToCloud({
    trees: state.trees,
    roles: state.roles
  });
}

async function saveToCloud(payload) {
  return Promise.resolve(payload);
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
    mother: node.mother || "",
    spouse: node.spouse ? { ...node.spouse } : null,
    children: Array.isArray(node.children) ? node.children.map(cloneNode) : []
  };
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

function findPersonRef(node, targetName) {
  if (!node || !targetName) return null;
  const target = targetName.trim().toLowerCase();

  if (node.name && node.name.toLowerCase() === target) {
    return { person: node, parentNode: null, isSpouse: false };
  }
  if (node.spouse && node.spouse.name && node.spouse.name.toLowerCase() === target) {
    return { person: node.spouse, parentNode: node, isSpouse: true };
  }

  for (let child of node.children || []) {
    const found = findPersonRef(child, targetName);
    if (found) return found;
  }
  return null;
}

function findNodeByName(node, targetName) {
  if (!node || !targetName) return null;
  const target = targetName.trim().toLowerCase();
  if (
    (node.name && node.name.toLowerCase() === target) ||
    (node.spouse && node.spouse.name && node.spouse.name.toLowerCase() === target)
  ) {
    return node;
  }
  for (let child of node.children || []) {
    const found = findNodeByName(child, targetName);
    if (found) return found;
  }
  return null;
}

function detachNodeByName(current, targetName) {
  if (!current || !targetName) return { tree: current, detached: null };
  const target = targetName.trim().toLowerCase();

  if (current.name && current.name.toLowerCase() === target) {
    const detached = current;
    let replacement = null;
    if (detached.children && detached.children.length === 1) {
      replacement = detached.children[0];
    } else if (detached.children && detached.children.length > 1) {
      replacement = detached.children[0];
      replacement.children = [...(replacement.children || []), ...detached.children.slice(1)];
    }
    detached.children = detached.children || [];
    return { tree: replacement, detached };
  }

  let detachedFound = null;
  function walk(parent) {
    if (!parent || !Array.isArray(parent.children)) return;
    for (let i = 0; i < parent.children.length; i++) {
      const ch = parent.children[i];
      if (ch.name && ch.name.toLowerCase() === target) {
        detachedFound = parent.children.splice(i, 1)[0];
        return;
      }
      walk(ch);
      if (detachedFound) return;
    }
  }
  walk(current);
  return { tree: current, detached: detachedFound };
}

function autoDetectRolesIfEmpty(tree) {
  if (!tree) return;
  if (!state.roles.fatherName && tree.name) {
    state.roles.fatherName = tree.name;
  }
  if (!state.roles.motherName && tree.spouse && tree.spouse.name) {
    state.roles.motherName = tree.spouse.name;
  }
}

function extractSubtreeFromName(node, targetName) {
  if (!node || !targetName) return null;
  const target = targetName.trim().toLowerCase();

  if (node.name && node.name.toLowerCase() === target) {
    return cloneNode(node);
  }

  if (node.spouse && node.spouse.name && node.spouse.name.toLowerCase() === target) {
    return {
      name: node.spouse.name,
      relation: node.spouse.relation || "",
      father: node.spouse.father || "",
      mother: node.spouse.mother || "",
      spouse: {
        name: node.name,
        relation: node.relation || "",
        father: node.father || "",
        mother: node.mother || ""
      },
      children: Array.isArray(node.children) ? node.children.map(cloneNode) : []
    };
  }

  for (let child of node.children || []) {
    const found = extractSubtreeFromName(child, targetName);
    if (found) return found;
  }
  return null;
}

function syncTabsRespectingRoles() {
  const activeTree = state.trees[state.activeTab];
  if (!activeTree) return;
  autoDetectRolesIfEmpty(activeTree);

  const otherTab = state.activeTab === "father" ? "mother" : "father";
  const targetAnchorName =
    otherTab === "mother" ? state.roles.motherName : state.roles.fatherName;

  if (!state.trees[otherTab]) {
    state.trees[otherTab] =
      (targetAnchorName && extractSubtreeFromName(activeTree, targetAnchorName)) ||
      cloneNode(activeTree);
    return;
  }

  function mirrorChildrenAndSpouse(srcNode) {
    if (!srcNode) return;
    const dstNode = findNodeByName(state.trees[otherTab], srcNode.name);
    if (dstNode) {
      if (srcNode.spouse && srcNode.spouse.name && !dstNode.spouse) {
        dstNode.spouse = { ...srcNode.spouse };
      }
      if (Array.isArray(srcNode.children)) {
        srcNode.children.forEach((sc) => {
          const existsChild = (dstNode.children || []).some(
            (dc) => dc.name.toLowerCase() === sc.name.toLowerCase()
          );
          const existsAnywhere = findNodeByName(state.trees[otherTab], sc.name);
          if (!existsChild && !existsAnywhere) {
            dstNode.children = dstNode.children || [];
            dstNode.children.push(cloneNode(sc));
          }
        });
      }
    }
    (srcNode.children || []).forEach(mirrorChildrenAndSpouse);
  }

  mirrorChildrenAndSpouse(activeTree);
}

async function initData() {
  const cloudData = await loadFromCloud();
  if (cloudData && cloudData.trees) {
    state.trees.father = cloudData.trees.father || null;
    state.trees.mother = cloudData.trees.mother || null;
    if (cloudData.roles) {
      state.roles.fatherName = cloudData.roles.fatherName || "";
      state.roles.motherName = cloudData.roles.motherName || "";
    }
    autoDetectRolesIfEmpty(state.trees.father || state.trees.mother);
    return;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.trees) {
        state.trees.father = parsed.trees.father || null;
        state.trees.mother = parsed.trees.mother || null;
        state.roles.fatherName = (parsed.roles && parsed.roles.fatherName) || "";
        state.roles.motherName = (parsed.roles && parsed.roles.motherName) || "";
      } else {
        state.trees.father = parsed.father || null;
        state.trees.mother = parsed.mother || null;
      }
      autoDetectRolesIfEmpty(state.trees.father || state.trees.mother);
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

function deleteMemberFromSingleTree(treeRoot, targetName) {
  if (!treeRoot || !targetName) return null;
  const target = targetName.trim().toLowerCase();

  if (treeRoot.spouse && treeRoot.spouse.name && treeRoot.spouse.name.toLowerCase() === target) {
    treeRoot.spouse = null;
    return treeRoot;
  }

  if (treeRoot.name && treeRoot.name.toLowerCase() === target) {
    if (treeRoot.spouse) {
      return {
        name: treeRoot.spouse.name,
        relation: treeRoot.spouse.relation || "",
        father: treeRoot.spouse.father || "",
        mother: treeRoot.spouse.mother || "",
        spouse: null,
        children: treeRoot.children || []
      };
    }
    if (treeRoot.children && treeRoot.children.length === 1) {
      return treeRoot.children[0];
    }
    if (treeRoot.children && treeRoot.children.length > 1) {
      const firstChild = treeRoot.children[0];
      const restChildren = treeRoot.children.slice(1);
      firstChild.children = [...(firstChild.children || []), ...restChildren];
      return firstChild;
    }
    return null;
  }

  function removeInChildren(parentNode) {
    if (!parentNode || !Array.isArray(parentNode.children)) return false;

    if (parentNode.spouse && parentNode.spouse.name && parentNode.spouse.name.toLowerCase() === target) {
      parentNode.spouse = null;
      return true;
    }

    for (let i = 0; i < parentNode.children.length; i++) {
      const ch = parentNode.children[i];
      if (ch.name && ch.name.toLowerCase() === target) {
        const promotedChildren = ch.children || [];
        parentNode.children.splice(i, 1, ...promotedChildren);
        return true;
      }
      if (removeInChildren(ch)) return true;
    }
    return false;
  }

  removeInChildren(treeRoot);
  return treeRoot;
}

function updateNameInSingleTree(treeRoot, oldName, newName) {
  if (!treeRoot || !oldName || !newName) return false;
  const ref = findPersonRef(treeRoot, oldName);
  if (!ref) return false;

  const prevName = ref.person.name;
  ref.person.name = newName;

  if (!ref.isSpouse && Array.isArray(ref.person.children)) {
    ref.person.children.forEach((ch) => {
      if (ch.father && ch.father.toLowerCase() === prevName.toLowerCase()) {
        ch.father = newName;
      }
    });
  }
  return true;
}

function collectNames(node, list = []) {
  if (!node) return list;
  if (node.name) list.push(node.name);
  if (node.spouse && node.spouse.name) list.push(node.spouse.name);
  for (let child of node.children || []) {
    collectNames(child, list);
  }
  return list;
}

function populateEditForm(name) {
  const nameInput = document.getElementById("editNameInput");
  state.selectedEditTarget = name || "";
  if (!nameInput) return;
  if (!name) {
    nameInput.value = "";
    return;
  }
  const ref = findPersonRef(getCurrentTree(), name);
  nameInput.value = ref ? ref.person.name : "";
}

function updateDropdowns() {
  const deleteSelect = document.getElementById("deleteSelect");
  const editSelect = document.getElementById("editSelect");
  const fatherRoleSelect = document.getElementById("fatherRoleSelect");
  const motherRoleSelect = document.getElementById("motherRoleSelect");
  const allNames = collectNames(getCurrentTree());

  if (deleteSelect) {
    deleteSelect.innerHTML = `<option value="">-- Pilih nama untuk dipadam --</option>`;
  }
  if (editSelect) {
    editSelect.innerHTML = `<option value="">-- Ahli untuk diedit --</option>`;
  }
  if (fatherRoleSelect) {
    fatherRoleSelect.innerHTML = `<option value="">-- Pilih Ayah --</option>`;
  }
  if (motherRoleSelect) {
    motherRoleSelect.innerHTML = `<option value="">-- Pilih Ibu --</option>`;
  }

  allNames.forEach((name) => {
    if (deleteSelect) {
      const dOpt = document.createElement("option");
      dOpt.value = name;
      dOpt.textContent = name;
      deleteSelect.appendChild(dOpt);
    }

    if (editSelect) {
      const eOpt = document.createElement("option");
      eOpt.value = name;
      eOpt.textContent = name;
      if (state.selectedEditTarget && state.selectedEditTarget.toLowerCase() === name.toLowerCase()) {
        eOpt.selected = true;
      }
      editSelect.appendChild(eOpt);
    }

    if (fatherRoleSelect) {
      const fOpt = document.createElement("option");
      fOpt.value = name;
      fOpt.textContent = name;
      if (state.roles.fatherName && state.roles.fatherName.toLowerCase() === name.toLowerCase()) {
        fOpt.selected = true;
      }
      fatherRoleSelect.appendChild(fOpt);
    }

    if (motherRoleSelect) {
      const mOpt = document.createElement("option");
      mOpt.value = name;
      mOpt.textContent = name;
      if (state.roles.motherName && state.roles.motherName.toLowerCase() === name.toLowerCase()) {
        mOpt.selected = true;
      }
      motherRoleSelect.appendChild(mOpt);
    }
  });
}

function isSearchMatch(person) {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q || !person) return false;
  return person.name && person.name.toLowerCase().includes(q);
}

function getCoupleCardColors(hasSpouse, isMainCouple) {
  if (!hasSpouse) {
    return { mainRed: false, spouseRed: false };
  }
  if (isMainCouple && state.activeTab === "mother") {
    return { mainRed: true, spouseRed: false };
  }
  return { mainRed: false, spouseRed: true };
}

function renderPersonCard(person, isRed = false) {
  const extraClass = isRed ? " spouse-card" : "";
  const matchClass = isSearchMatch(person) ? " search-match" : "";
  const editClass = state.isEditing ? " editable-card" : "";
  const safeName = (person.name || "").replace(/"/g, "&quot;");

  return `
    <div class="person-card${extraClass}${matchClass}${editClass}" data-person-name="${safeName}">
      <span class="person-name">${person.name}</span>
    </div>
  `;
}

function buildHTML(node, isMainCouple = true) {
  const hasSpouse = Boolean(node.spouse && node.spouse.name);
  const { mainRed, spouseRed } = getCoupleCardColors(hasSpouse, isMainCouple);

  let boxHTML = `<div class="couple">${renderPersonCard(node, mainRed)}`;
  if (hasSpouse) {
    boxHTML += `<div class="couple-link"></div>${renderPersonCard(node.spouse, spouseRed)}`;
  }
  boxHTML += `</div>`;

  let html = `<li>${boxHTML}`;
  if (node.children && node.children.length > 0) {
    html += "<ul>";
    for (let child of node.children) {
      html += buildHTML(child, false);
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

function attachCardClickEvents() {
  if (!state.isEditing) return;
  document.querySelectorAll(".person-card.editable-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const personName = card.getAttribute("data-person-name");
      const editSel = document.getElementById("editSelect");
      if (editSel) editSel.value = personName;
      populateEditForm(personName);
      const statusEl = document.getElementById("statusMsg");
      if (statusEl) statusEl.textContent = `Memilih "${personName}" untuk ditukar nama.`;
    });
  });
}

function renderTree() {
  const treeContainer = document.getElementById("tree");
  if (!treeContainer) return;
  const currentTree = getCurrentTree();
  if (!currentTree) {
    treeContainer.innerHTML = `<p class="hint">Tiada data lagi dalam bahagian ini.</p>`;
  } else {
    treeContainer.innerHTML = `<ul>${buildHTML(currentTree, true)}</ul>`;
  }
  updateDropdowns();
  attachCardClickEvents();
  scrollToFirstMatch();
}

function syncUI() {
  const panel = document.getElementById("editPanel");
  const editBtn = document.getElementById("toggleEditBtn");
  const tabFather = document.getElementById("tabFather");
  const tabMother = document.getElementById("tabMother");

  if (panel) panel.classList.toggle("hidden", !state.isEditing);
  if (editBtn) editBtn.textContent = state.isEditing ? "Selesai Edit" : "Edit";
  if (tabFather) tabFather.classList.toggle("active", state.activeTab === "father");
  if (tabMother) tabMother.classList.toggle("active", state.activeTab === "mother");

  renderTree();
}

async function handleAddMember() {
  if (!state.isEditing) return;

  const inputEl = document.getElementById("fullName");
  const statusEl = document.getElementById("statusMsg");
  if (!inputEl) return;

  const rawText = inputEl.value.trim();
  if (!rawText) return;

  let currentTree = getCurrentTree();
  const spouseData = parseSpouse(rawText);
  const childData = parseChild(rawText);

  if (spouseData) {
    const p1 = spouseData.first;
    const p2 = spouseData.second;

    if (!currentTree) {
      currentTree = {
        name: p1.name,
        relation: p1.relation,
        father: p1.father,
        mother: "",
        spouse: { name: p2.name, relation: p2.relation, father: p2.father, mother: "" },
        children: []
      };
      if (!state.roles.fatherName) state.roles.fatherName = p1.name;
      if (!state.roles.motherName) state.roles.motherName = p2.name;
      if (statusEl) statusEl.textContent = `Pasangan ${p1.name} & ${p2.name} ditambah!`;
    } else {
      const node1 = findNodeByName(currentTree, p1.name);
      const node2 = findNodeByName(currentTree, p2.name);

      if (node1) {
        if (p1.father) {
          node1.father = p1.father;
          node1.relation = p1.relation;
        }
        node1.spouse = { name: p2.name, relation: p2.relation, father: p2.father, mother: "" };
        if (!state.roles.motherName && state.activeTab === "father") {
          state.roles.motherName = p2.name;
        }
        if (statusEl) statusEl.textContent = `${p2.name} ditetapkan sebagai pasangan ${node1.name}.`;
      } else if (node2) {
        if (p2.father) {
          node2.father = p2.father;
          node2.relation = p2.relation;
        }
        node2.spouse = { name: p1.name, relation: p1.relation, father: p1.father, mother: "" };
        if (statusEl) statusEl.textContent = `${p1.name} ditetapkan sebagai pasangan ${node2.name}.`;
      } else {
        if (statusEl) statusEl.textContent = `Tiada nama "${p1.name}" atau "${p2.name}" dalam tab ini.`;
        return;
      }
    }

    setCurrentTree(currentTree);
    syncTabsRespectingRoles();
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
      mother: "",
      spouse: null,
      children: []
    };
    if (statusEl) statusEl.textContent = `"${childData.child}" ditambah.`;
    setCurrentTree(currentTree);
    syncTabsRespectingRoles();
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
      mother: "",
      spouse: null,
      children: []
    };
    if (state.activeTab === "father" && !state.roles.fatherName) {
      state.roles.fatherName = rawText;
    } else if (state.activeTab === "mother" && !state.roles.motherName) {
      state.roles.motherName = rawText;
    }
    if (statusEl) statusEl.textContent = `"${rawText}" ditambah sebagai titik mula.`;
    setCurrentTree(currentTree);
    syncTabsRespectingRoles();
    await persistData();
    inputEl.value = "";
    renderTree();
    return;
  }

  if (childData) {
    const existingChildNode = findNodeByName(currentTree, childData.child);

    if (existingChildNode) {
      existingChildNode.relation = childData.relation;
      existingChildNode.father = childData.father;

      let fatherNode = findNodeByName(currentTree, childData.father);
      if (!fatherNode) {
        fatherNode = {
          name: childData.father,
          relation: "",
          father: "",
          mother: "",
          spouse: null,
          children: []
        };
      }

      const detachedResult = detachNodeByName(currentTree, existingChildNode.name);
      currentTree = detachedResult.tree;
      const nodeToAttach = detachedResult.detached || existingChildNode;

      if (!fatherNode.children.some((c) => c.name.toLowerCase() === nodeToAttach.name.toLowerCase())) {
        fatherNode.children.push(nodeToAttach);
      }

      if (!currentTree || currentTree.name.toLowerCase() === fatherNode.name.toLowerCase()) {
        currentTree = fatherNode;
      } else {
        const parentOfFather = findNodeByName(currentTree, fatherNode.name);
        if (!parentOfFather) {
          currentTree = fatherNode;
        }
      }

      if (statusEl) statusEl.textContent = `${childData.father} ditambah di atas ${childData.child}.`;
    } else {
      const parentTarget = findNodeByName(currentTree, childData.father);
      if (parentTarget) {
        parentTarget.children.push({
          name: childData.child,
          relation: childData.relation,
          father: childData.father,
          mother: "",
          spouse: null,
          children: []
        });
        if (statusEl) statusEl.textContent = `${childData.child} ditambah di bawah ${childData.father}.`;
      } else {
        currentTree.children.push({
          name: childData.child,
          relation: childData.relation,
          father: childData.father,
          mother: "",
          spouse: null,
          children: []
        });
        if (statusEl) statusEl.textContent = `${childData.child} ditambah ke dalam carta.`;
      }
    }

    setCurrentTree(currentTree);
    syncTabsRespectingRoles();
    await persistData();
    inputEl.value = "";
    renderTree();
    return;
  }

  if (statusEl) {
    statusEl.textContent = "Gunakan format 'Nama bin/binti Ayah' atau 'Nama1 + Nama2'.";
  }
}

onEvent("toggleEditBtn", "click", () => {
  state.isEditing = !state.isEditing;
  if (!state.isEditing) {
    populateEditForm("");
    const editSel = document.getElementById("editSelect");
    if (editSel) editSel.value = "";
  }
  const statusEl = document.getElementById("statusMsg");
  if (statusEl) {
    statusEl.textContent = state.isEditing
      ? "Mod Edit aktif: klik kad atau pilih nama untuk tukar nama."
      : "Mod Lihat aktif.";
  }
  syncUI();
});

onEvent("printBtn", "click", () => {
  window.print();
});

onEvent("saveRolesBtn", "click", async () => {
  const fSel = document.getElementById("fatherRoleSelect");
  const mSel = document.getElementById("motherRoleSelect");
  const statusEl = document.getElementById("statusMsg");

  const chosenFather = fSel ? fSel.value : "";
  const chosenMother = mSel ? mSel.value : "";

  state.roles.fatherName = chosenFather;
  state.roles.motherName = chosenMother;

  if (state.activeTab === "mother" && chosenMother && state.trees.father) {
    const motherBranch = extractSubtreeFromName(state.trees.father, chosenMother);
    if (motherBranch && !state.trees.mother) {
      state.trees.mother = motherBranch;
    }
  } else if (state.activeTab === "father" && chosenFather && state.trees.mother) {
    const fatherBranch = extractSubtreeFromName(state.trees.mother, chosenFather);
    if (fatherBranch && !state.trees.father) {
      state.trees.father = fatherBranch;
    }
  }

  await persistData();
  if (statusEl) {
    statusEl.textContent = `Ditetapkan — Ayah: ${chosenFather || "-"}, Ibu: ${chosenMother || "-"}.`;
  }
  renderTree();
});

onEvent("tabFather", "click", () => {
  state.activeTab = "father";
  populateEditForm("");
  const statusEl = document.getElementById("statusMsg");
  if (statusEl) statusEl.textContent = "Memaparkan Carta Keluarga Ayah.";
  syncUI();
});

onEvent("tabMother", "click", () => {
  state.activeTab = "mother";
  if (!state.trees.mother && state.roles.motherName && state.trees.father) {
    state.trees.mother = extractSubtreeFromName(state.trees.father, state.roles.motherName);
  }
  populateEditForm("");
  const statusEl = document.getElementById("statusMsg");
  if (statusEl) statusEl.textContent = "Memaparkan Carta Keluarga Ibu.";
  syncUI();
});

onEvent("searchInput", "input", (e) => {
  state.searchQuery = e.target.value;
  renderTree();
});

onEvent("clearSearchBtn", "click", () => {
  state.searchQuery = "";
  const searchEl = document.getElementById("searchInput");
  if (searchEl) searchEl.value = "";
  const statusEl = document.getElementById("statusMsg");
  if (statusEl) statusEl.textContent = "Carian dikosongkan.";
  renderTree();
});

onEvent("editSelect", "change", (e) => {
  populateEditForm(e.target.value);
});

onEvent("saveEditBtn", "click", async () => {
  const statusEl = document.getElementById("statusMsg");
  if (!state.isEditing) {
    if (statusEl) statusEl.textContent = 'Tekan butang "Edit" dahulu sebelum mengedit nama.';
    return;
  }

  const editSelectEl = document.getElementById("editSelect");
  const editNameInput = document.getElementById("editNameInput");
  const targetName = ((editSelectEl && editSelectEl.value) || state.selectedEditTarget || "").trim();
  const newName = editNameInput ? editNameInput.value.trim() : "";

  if (!targetName) {
    if (statusEl) statusEl.textContent = "Pilih ahli daripada senarai atau klik kad dahulu.";
    return;
  }
  if (!newName) {
    if (statusEl) statusEl.textContent = "Nama baharu tidak boleh kosong.";
    return;
  }

  const updatedCurrent = updateNameInSingleTree(getCurrentTree(), targetName, newName);
  const otherTab = state.activeTab === "father" ? "mother" : "father";
  if (state.trees[otherTab]) {
    updateNameInSingleTree(state.trees[otherTab], targetName, newName);
  }

  if (state.roles.fatherName && state.roles.fatherName.toLowerCase() === targetName.toLowerCase()) {
    state.roles.fatherName = newName;
  }
  if (state.roles.motherName && state.roles.motherName.toLowerCase() === targetName.toLowerCase()) {
    state.roles.motherName = newName;
  }

  if (!updatedCurrent) {
    if (statusEl) statusEl.textContent = `Ahli "${targetName}" tidak ditemui.`;
    return;
  }

  state.selectedEditTarget = newName;
  await persistData();
  if (statusEl) statusEl.textContent = `Nama "${targetName}" dikemas kini kepada "${newName}".`;
  renderTree();
});

onEvent("addBtn", "click", () => {
  const statusEl = document.getElementById("statusMsg");
  if (!state.isEditing) {
    if (statusEl) statusEl.textContent = 'Tekan butang "Edit" dahulu sebelum menambah nama.';
    return;
  }
  handleAddMember();
});

onEvent("fullName", "keydown", (e) => {
  if (e.key === "Enter" || e.keyCode === 13) {
    e.preventDefault();
    const statusEl = document.getElementById("statusMsg");
    if (!state.isEditing) {
      if (statusEl) statusEl.textContent = 'Tekan butang "Edit" dahulu sebelum menambah nama.';
      return;
    }
    handleAddMember();
  }
});

onEvent("deleteBtn", "click", async () => {
  const statusEl = document.getElementById("statusMsg");
  if (!state.isEditing) {
    if (statusEl) statusEl.textContent = 'Tekan butang "Edit" dahulu sebelum memadam nama.';
    return;
  }

  const selectEl = document.getElementById("deleteSelect");
  const chosenName = selectEl ? selectEl.value : "";

  if (!chosenName) {
    if (statusEl) statusEl.textContent = "Sila pilih nama daripada senarai dahulu.";
    return;
  }

  const ok = confirm(`Padam "${chosenName}"? (Keturunan di bawahnya akan dikekalkan)`);
  if (!ok) return;

  const updatedCurrent = deleteMemberFromSingleTree(getCurrentTree(), chosenName);
  setCurrentTree(updatedCurrent);

  const otherTab = state.activeTab === "father" ? "mother" : "father";
  if (state.trees[otherTab]) {
    state.trees[otherTab] = deleteMemberFromSingleTree(state.trees[otherTab], chosenName);
  }

  if (state.roles.fatherName && state.roles.fatherName.toLowerCase() === chosenName.toLowerCase()) {
    state.roles.fatherName = "";
  }
  if (state.roles.motherName && state.roles.motherName.toLowerCase() === chosenName.toLowerCase()) {
    state.roles.motherName = "";
  }

  if (state.selectedEditTarget && state.selectedEditTarget.toLowerCase() === chosenName.toLowerCase()) {
    populateEditForm("");
  }

  await persistData();
  if (statusEl) statusEl.textContent = `"${chosenName}" dipadam; keturunan di bawahnya dikekalkan.`;
  renderTree();
});

(async () => {
  await initData();
  syncUI();
})();

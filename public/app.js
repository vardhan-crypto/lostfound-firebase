/* ============================================================
   DIGITAL LOST & FOUND PLATFORM — FIREBASE FRONTEND LOGIC
   ============================================================ */

let currentFilter = "all";
let currentRole = null;
let currentUserId = null;
let currentUsername = null;
let allItemsCache = [];

// ─────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  applyStoredTheme();
  setupThemeToggle();
  setupItemForm();
  setupModalListeners();

  // Firebase Auth state listener — replaces manual JWT checking
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUserId = user.uid;
      // Fetch role from Firestore users collection
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        currentRole = userDoc.data().role || "user";
        currentUsername = userDoc.data().displayName || user.email;
      } else {
        currentRole = "user";
        currentUsername = user.email;
      }
      showApp();
      loadItems();
    } else {
      currentUserId = null;
      currentRole = null;
      currentUsername = null;
      showAuth();
    }
  });
});

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────

function applyStoredTheme() {
  const stored = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", stored);
  updateThemeIcon(stored);
}

function setupThemeToggle() {
  document.getElementById("themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggle");
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
  btn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

// ─────────────────────────────────────────────
// AUTH UI HELPERS
// ─────────────────────────────────────────────

function showAuth() {
  document.getElementById("authSection").style.display = "flex";
  document.getElementById("appSection").style.display = "none";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("userBadge").style.display = "none";
}

function showApp() {
  document.getElementById("authSection").style.display = "none";
  document.getElementById("appSection").style.display = "block";
  document.getElementById("logoutBtn").style.display = "inline-flex";
  const badge = document.getElementById("userBadge");
  badge.style.display = "inline-flex";
  badge.textContent = (currentRole === "admin" ? "👑 " : "👤 ") + currentUsername;
}

// ─────────────────────────────────────────────
// AUTH TABS
// ─────────────────────────────────────────────

function switchAuthTab(tab) {
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  if (tab === "login") {
    loginTab.classList.add("active"); registerTab.classList.remove("active");
    loginForm.style.display = "flex"; registerForm.style.display = "none";
  } else {
    registerTab.classList.add("active"); loginTab.classList.remove("active");
    registerForm.style.display = "flex"; loginForm.style.display = "none";
  }
}

// ─────────────────────────────────────────────
// REGISTER (Firebase Auth + Firestore user doc)
// ─────────────────────────────────────────────

async function registerUser(e) {
  e.preventDefault();
  const displayName = document.getElementById("regDisplayName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  if (!displayName || !email || !password) {
    showToast("Please fill in all fields", "error"); return;
  }

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);

    // Create user profile in Firestore
    await db.collection("users").doc(userCred.user.uid).set({
      uid: userCred.user.uid,
      email: email,
      displayName: displayName,
      role: "user",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    showToast("Account created successfully!", "success");
    document.getElementById("registerForm").reset();
    // onAuthStateChanged will auto-detect login
  } catch (err) {
    showToast(err.message || "Registration failed", "error");
  }
}

// ─────────────────────────────────────────────
// LOGIN (Firebase Auth)
// ─────────────────────────────────────────────

async function loginUser(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showToast("Please fill in all fields", "error"); return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast(`Welcome back!`, "success");
    document.getElementById("loginForm").reset();
    // onAuthStateChanged handles the rest
  } catch (err) {
    showToast(err.message || "Login failed", "error");
  }
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

async function logoutUser() {
  await auth.signOut();
  showToast("Logged out successfully", "info");
}

// ─────────────────────────────────────────────
// ADD ITEM (Firestore + Firebase Storage)
// ─────────────────────────────────────────────

function setupItemForm() {
  document.getElementById("itemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!auth.currentUser) { showToast("Please login first", "error"); return; }

    const title = document.getElementById("itemTitle").value.trim();
    const description = document.getElementById("itemDescription").value.trim();
    const category = document.getElementById("itemCategory").value.trim();
    const location = document.getElementById("itemLocation").value.trim();
    const status = document.getElementById("itemStatus").value;
    const email = document.getElementById("itemEmail").value.trim();
    const mobileNumber = document.getElementById("itemMobile").value.trim();
    const imageFile = document.getElementById("itemImage").files[0];

    if (!title || !status) { showToast("Title and status are required", "error"); return; }
    if (!email || !mobileNumber) { showToast("Email and mobile are required", "error"); return; }

    try {
      let imageURL = null;

      // Upload image to imgBB (free hosting) if provided
      if (imageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        await new Promise((resolve) => (reader.onload = resolve));
        const base64Image = reader.result.split(",")[1]; // Remove the data:image/...;base64, prefix

        const formData = new FormData();
        formData.append("key", IMGBB_API_KEY);
        formData.append("image", base64Image);

        const imgRes = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: formData,
        });
        const imgData = await imgRes.json();

        if (imgData.success) {
          imageURL = imgData.data.url;
        } else {
          showToast("Image upload failed", "error");
          return;
        }
      }

      // Save to Firestore
      await db.collection("items").add({
        title,
        description,
        category,
        location,
        status,
        email,
        mobileNumber,
        imageURL,
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        userName: currentUsername,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      showToast("Item reported successfully!", "success");
      e.target.reset();
      loadItems();
    } catch (err) {
      showToast(err.message || "Failed to add item", "error");
    }
  });
}

// ─────────────────────────────────────────────
// LOAD / SEARCH ITEMS (Firestore)
// ─────────────────────────────────────────────

async function loadItems() {
  try {
    const snapshot = await db.collection("items").orderBy("createdAt", "desc").get();
    let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    allItemsCache = items;

    // Client-side search filter
    const query = document.getElementById("search").value.trim().toLowerCase();
    if (query) {
      items = items.filter(item =>
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        (item.location && item.location.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (currentFilter !== "all") {
      items = items.filter(i => i.status === currentFilter);
    }

    displayItems(items);
  } catch (err) {
    showToast("Failed to load items", "error");
  }
}

// ─────────────────────────────────────────────
// FILTER
// ─────────────────────────────────────────────

function setFilter(status) {
  currentFilter = status;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  const btnId = status === "all" ? "filterAll" : "filter" + status.charAt(0).toUpperCase() + status.slice(1);
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add("active");
  loadItems();
}

// ─────────────────────────────────────────────
// DISPLAY ITEMS
// ─────────────────────────────────────────────

function displayItems(items) {
  const container = document.getElementById("items");
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-card";

    const isOwner = currentUserId && item.userId === currentUserId;
    const ownerName = item.userName || item.userEmail || null;

    let html = "";

    // Image
    if (item.imageURL) {
      html += `<img class="item-card-image item-card-clickable" src="${escapeHtml(item.imageURL)}" alt="${escapeHtml(item.title)}" loading="lazy" onclick="openDetailModal('${item.id}')" />`;
    }

    html += `<div class="item-card-body">`;

    // Header
    html += `<div class="item-card-header item-card-clickable" onclick="openDetailModal('${item.id}')">
      <span class="item-card-title">${escapeHtml(item.title)}</span>
      <span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
    </div>`;

    // Description
    if (item.description) {
      const truncated = item.description.length > 100 ? item.description.substring(0, 100) + "…" : item.description;
      html += `<p class="item-card-desc item-card-clickable" onclick="openDetailModal('${item.id}')">${escapeHtml(truncated)}</p>`;
    }

    // Meta
    html += `<div class="item-card-meta">`;
    if (item.location) html += `<span>📍 ${escapeHtml(item.location)}</span>`;
    if (item.category) html += `<span>🏷️ ${escapeHtml(item.category)}</span>`;
    if (item.createdAt) html += `<span>📅 ${item.createdAt.toDate ? item.createdAt.toDate().toLocaleDateString() : new Date(item.createdAt).toLocaleDateString()}</span>`;
    if (ownerName && item.userId) {
      html += `<span class="user-id-link" onclick="event.stopPropagation(); openUserModal('${item.userId}')">👤 ${escapeHtml(ownerName)}</span>`;
    }
    html += `</div>`;

    // Actions
    html += `<div class="item-card-actions">`;
    html += `<button class="btn btn-outline btn-sm" onclick="openDetailModal('${item.id}')">👁️ View</button>`;
    if (isOwner) html += `<button class="btn btn-info btn-sm" onclick="editItem('${item.id}')">✏️ Edit</button>`;
    if (isOwner && item.status === "lost") html += `<button class="btn btn-success btn-sm" onclick="markReturned('${item.id}')">✅ Returned</button>`;
    else if (isOwner && item.status === "found") html += `<button class="btn btn-success btn-sm" onclick="markReturned('${item.id}')">✅ Claimed</button>`;
    if (currentRole === "admin") html += `<button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')">🗑️ Delete</button>`;
    html += `</div></div>`;

    card.innerHTML = html;
    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// ITEM DETAIL POPUP
// ─────────────────────────────────────────────

function openDetailModal(id) {
  const item = allItemsCache.find(i => i.id === id);
  if (!item) return;
  const body = document.getElementById("detailModalBody");
  const ownerName = item.userName || item.userEmail || null;

  let html = "";
  if (item.imageURL) html += `<img class="modal-image" src="${escapeHtml(item.imageURL)}" alt="${escapeHtml(item.title)}" />`;

  html += `<div class="item-card-header">
    <span class="modal-title">${escapeHtml(item.title)}</span>
    <span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
  </div>`;

  if (item.description) html += `<p class="modal-desc">${escapeHtml(item.description)}</p>`;

  html += `<div class="modal-detail-grid">
    <div class="modal-detail-item"><span class="modal-detail-label">Category</span><span class="modal-detail-value">${escapeHtml(item.category || "—")}</span></div>
    <div class="modal-detail-item"><span class="modal-detail-label">Location</span><span class="modal-detail-value">${escapeHtml(item.location || "—")}</span></div>
    <div class="modal-detail-item"><span class="modal-detail-label">Status</span><span class="modal-detail-value">${escapeHtml(item.status)}</span></div>
    <div class="modal-detail-item"><span class="modal-detail-label">Date</span><span class="modal-detail-value">${item.createdAt && item.createdAt.toDate ? item.createdAt.toDate().toLocaleString() : "—"}</span></div>
  </div>`;

  // Reporter link
  if (ownerName && item.userId) {
    html += `<div class="modal-detail-item"><span class="modal-detail-label">Reported By</span>
      <span class="user-id-link" onclick="closeDetailModal(); openUserModal('${item.userId}')">👤 ${escapeHtml(ownerName)}</span>
    </div>`;
  }

  // Contact info
  html += `<div class="modal-contact">
    <span class="modal-contact-title">Contact Information</span>
    <div class="modal-contact-row"><span class="contact-icon">📧</span><span>${escapeHtml(item.email || "Not provided")}</span></div>
    <div class="modal-contact-row"><span class="contact-icon">📱</span><span>${escapeHtml(item.mobileNumber || "Not provided")}</span></div>
  </div>`;

  body.innerHTML = html;
  document.getElementById("detailModal").classList.add("active");
}

function closeDetailModal() {
  document.getElementById("detailModal").classList.remove("active");
}

// ─────────────────────────────────────────────
// USER PROFILE POPUP
// ─────────────────────────────────────────────

async function openUserModal(userId) {
  const body = document.getElementById("userModalBody");
  body.innerHTML = `<div class="modal-loading"><div class="spinner"></div></div>`;
  document.getElementById("userModal").classList.add("active");

  try {
    // Fetch user info from Firestore
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) { showToast("User not found", "error"); closeUserModal(); return; }
    const user = userDoc.data();

    // Fetch user's items
    const itemsSnap = await db.collection("items").where("userId", "==", userId).orderBy("createdAt", "desc").get();
    const items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    renderUserModal({ user, items, totalItems: items.length });
  } catch (err) {
    showToast("Failed to load user data", "error");
    closeUserModal();
  }
}

function renderUserModal(data) {
  const { user, items, totalItems } = data;
  const body = document.getElementById("userModalBody");

  const lostCount = items.filter(i => i.status === "lost").length;
  const foundCount = items.filter(i => i.status === "found").length;
  const resolvedCount = items.filter(i => i.status === "returned" || i.status === "claimed").length;

  let html = "";

  // Profile header
  html += `<div class="user-profile-header">
    <div class="user-avatar">${user.role === "admin" ? "👑" : "👤"}</div>
    <div class="user-profile-info">
      <div>
        <span class="user-profile-name">${escapeHtml(user.displayName || user.email)}</span>
        <span class="user-profile-role role-${user.role}">${escapeHtml(user.role)}</span>
      </div>
      <div class="user-profile-meta">
        <span>📅 Joined ${user.createdAt && user.createdAt.toDate ? user.createdAt.toDate().toLocaleDateString() : "—"}</span>
        <span>📦 ${totalItems} item${totalItems !== 1 ? "s" : ""} reported</span>
      </div>
    </div>
  </div>`;

  // Stats
  html += `<div class="user-stats">
    <div class="user-stat-card"><div class="user-stat-value">${totalItems}</div><div class="user-stat-label">Total</div></div>
    <div class="user-stat-card"><div class="user-stat-value">${lostCount}</div><div class="user-stat-label">Lost</div></div>
    <div class="user-stat-card"><div class="user-stat-value">${foundCount}</div><div class="user-stat-label">Found</div></div>
    <div class="user-stat-card"><div class="user-stat-value">${resolvedCount}</div><div class="user-stat-label">Resolved</div></div>
  </div>`;

  // Items list
  html += `<div class="user-items-title">All Reported Items</div>`;
  if (items.length === 0) {
    html += `<p style="color:var(--text-muted);font-size:0.9rem;">No items reported yet.</p>`;
  } else {
    html += `<div class="user-items-list">`;
    items.forEach(item => {
      const thumb = item.imageURL
        ? `<img class="user-item-thumb" src="${escapeHtml(item.imageURL)}" alt="" />`
        : `<div class="user-item-thumb-placeholder">📦</div>`;

      html += `<div class="user-item-row">
        ${thumb}
        <div class="user-item-info">
          <div class="user-item-title">${escapeHtml(item.title)}</div>
          <div class="user-item-meta">
            <span class="status-badge status-${escapeHtml(item.status)}" style="font-size:0.65rem;padding:2px 8px;">${escapeHtml(item.status)}</span>
            ${item.category ? `<span>🏷️ ${escapeHtml(item.category)}</span>` : ""}
            ${item.location ? `<span>📍 ${escapeHtml(item.location)}</span>` : ""}
            <span>📅 ${item.createdAt && item.createdAt.toDate ? item.createdAt.toDate().toLocaleDateString() : "—"}</span>
          </div>
        </div>
        <div class="user-item-actions">
          <button class="btn btn-outline btn-sm" onclick="closeUserModal(); openDetailModal('${item.id}')" title="View details">👁️</button>`;

      // Mark returned — owner only
      const isOwner = currentUserId && item.userId === currentUserId;
      if (isOwner && (item.status === "lost" || item.status === "found")) {
        html += `<button class="btn btn-success btn-sm" onclick="markReturnedFromUserModal('${item.id}')" title="Mark returned/claimed">✅</button>`;
      }
      // Delete — admin only
      if (currentRole === "admin") {
        html += `<button class="btn btn-danger btn-sm" onclick="deleteItemFromUserModal('${item.id}')" title="Delete item">🗑️</button>`;
      }

      html += `</div></div>`;
    });
    html += `</div>`;
  }

  body.innerHTML = html;
}

function closeUserModal() {
  document.getElementById("userModal").classList.remove("active");
}

async function markReturnedFromUserModal(id) {
  await markReturned(id);
  closeUserModal();
}

async function deleteItemFromUserModal(id) {
  await deleteItem(id);
  closeUserModal();
}

// ─────────────────────────────────────────────
// EDIT ITEM (Firestore — owner only)
// ─────────────────────────────────────────────

function editItem(id) {
  const item = allItemsCache.find(i => i.id === id);
  if (!item) { showToast("Item not found", "error"); return; }
  if (item.userId !== currentUserId) { showToast("You can only edit your own items", "error"); return; }

  document.getElementById("editItemId").value = item.id;
  document.getElementById("editTitle").value = item.title || "";
  document.getElementById("editDescription").value = item.description || "";
  document.getElementById("editCategory").value = item.category || "";
  document.getElementById("editLocation").value = item.location || "";
  document.getElementById("editEmail").value = item.email || "";
  document.getElementById("editMobile").value = item.mobileNumber || "";
  document.getElementById("editModal").classList.add("active");
}

async function submitEdit(e) {
  e.preventDefault();
  const id = document.getElementById("editItemId").value;
  const payload = {
    title: document.getElementById("editTitle").value.trim(),
    description: document.getElementById("editDescription").value.trim(),
    category: document.getElementById("editCategory").value.trim(),
    location: document.getElementById("editLocation").value.trim(),
    email: document.getElementById("editEmail").value.trim(),
    mobileNumber: document.getElementById("editMobile").value.trim(),
  };

  if (!payload.title) { showToast("Title is required", "error"); return; }
  if (!payload.email || !payload.mobileNumber) { showToast("Email and mobile number are required", "error"); return; }

  try {
    await db.collection("items").doc(id).update(payload);
    showToast("Item updated successfully!", "success");
    closeEditModal();
    loadItems();
  } catch (err) {
    showToast(err.message || "Failed to update", "error");
  }
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("active");
}

// ─────────────────────────────────────────────
// MODAL LISTENERS (ESC + outside click)
// ─────────────────────────────────────────────

function setupModalListeners() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDetailModal(); closeEditModal(); closeUserModal(); }
  });
  document.getElementById("detailModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
  });
  document.getElementById("editModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });
  document.getElementById("userModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeUserModal();
  });
}

// ─────────────────────────────────────────────
// DELETE ITEM (Firestore — admin only)
// ─────────────────────────────────────────────

async function deleteItem(id) {
  if (!confirm("Are you sure you want to delete this item?")) return;
  if (currentRole !== "admin") { showToast("Only admins can delete items", "error"); return; }
  try {
    await db.collection("items").doc(id).delete();
    showToast("Item deleted", "success");
    loadItems();
  } catch (err) {
    showToast(err.message || "Failed to delete", "error");
  }
}

// ─────────────────────────────────────────────
// MARK RETURNED / CLAIMED (Firestore — owner only)
// ─────────────────────────────────────────────

async function markReturned(id) {
  const item = allItemsCache.find(i => i.id === id);
  if (!item) return;
  if (item.userId !== currentUserId) { showToast("Only the owner can update status", "error"); return; }

  let newStatus;
  if (item.status === "lost") newStatus = "returned";
  else if (item.status === "found") newStatus = "claimed";
  else { showToast(`Item is already ${item.status}`, "error"); return; }

  try {
    await db.collection("items").doc(id).update({ status: newStatus });
    showToast("Status updated!", "success");
    loadItems();
  } catch (err) {
    showToast(err.message || "Failed to update status", "error");
  }
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add("hide"); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─────────────────────────────────────────────
// XSS PROTECTION
// ─────────────────────────────────────────────

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
// Initialize Lucide Icons
lucide.createIcons();

// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyCsWsFFR3al6wtHN8hHaWhd4Bg_czERhWw",
  authDomain: "leaderboard-a2fab.firebaseapp.com",
  databaseURL:
    "https://leaderboard-a2fab-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "leaderboard-a2fab",
  storageBucket: "leaderboard-a2fab.firebasestorage.app",
  messagingSenderId: "97427058083",
  appId: "1:97427058083:web:148b95cf8d766e2013be16",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// --- 2. TAB LOGIC ---
function switchTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  document.getElementById("tab-" + tabId).classList.add("active");

  if (tabId === "map-editor") {
    initAdminMap();
    setTimeout(() => adminMap.invalidateSize(), 100);
  }
}

// --- 3. ACCOUNT GENERATOR LOGIC ---
const qrCodeDisplay = new QRCode(document.getElementById("qrcode"), {
  width: 180,
  height: 180,
  colorDark: "#212529",
  colorLight: "#ffffff",
});

function generateAccount() {
  const name = document.getElementById("playerName").value;
  if (!name) return alert("Enter a Node Identifier (Player Name)!");

  // Push new player to Firebase (Using Data and Packets instead of Coins/Tank)
  const newPlayerRef = db.ref("players").push();
  const playerId = newPlayerRef.key;

  newPlayerRef.set({
    name: name,
    data: 0,
    packets: 0,
  });

  // Generate Auto-Login URL
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";

  const loginUrl = `${window.location.origin + (isLocalhost ? "" : "/TheQuest")}/index.html?player=${playerId}`;

  qrCodeDisplay.makeCode(loginUrl);
  document.getElementById("loginUrl").innerText = loginUrl;
  document.getElementById("qrResult").classList.add("active");
  document.getElementById("playerName").value = "";
}

// --- 4. MARKET LOGIC ---
db.ref("market/price").on("value", (snapshot) => {
  const price = snapshot.val() || 50;
  document.getElementById("current-price").innerText = price;
});

function forceCrash() {
  db.ref("market/price").set(Math.floor(Math.random() * 20) + 10);
}
function forceSpike() {
  db.ref("market/price").set(Math.floor(Math.random() * 50) + 100);
}

// --- 5. LEADERBOARD LOGIC ---
// Ordering by 'data' instead of 'coins'
db.ref("players")
  .orderByChild("data")
  .limitToLast(10)
  .on("value", (snapshot) => {
    const tbody = document.getElementById("leaderboard-body");
    tbody.innerHTML = "";

    let players = [];
    snapshot.forEach((child) => {
      players.push(child.val());
    });
    players.reverse();

    if (players.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align: center; color: var(--mantine-dimmed); padding: 30px;">No active nodes found.</td></tr>';
      return;
    }

    players.forEach((p, index) => {
      const row = `
          <tr>
            <td style="font-weight: 600; color: var(--mantine-text);">#${index + 1}</td>
            <td style="font-weight: 500;">${p.name}</td>
            <td class="data-text"><i data-lucide="database" size="14"></i> ${p.data || 0} MB</td>
            <td style="color: var(--mantine-dimmed);"><i data-lucide="box" size="14" style="display:inline; vertical-align:middle; margin-right:4px;"></i> ${p.packets || 0} / 50</td>
          </tr>
        `;
      tbody.innerHTML += row;
    });
    lucide.createIcons(); // Re-render icons in the new DOM elements
  });

// --- 6. ADMIN MAP EDITOR LOGIC ---
let adminMap, adminMarkerLayer, draftMarker;

function initAdminMap() {
  if (adminMap) return; // Prevent re-initializing

  // Centered around University of Jammu coordinates
  adminMap = L.map("admin-map-container").setView([32.7175, 74.8678], 18);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri",
      maxZoom: 20,
    },
  ).addTo(adminMap);

  adminMarkerLayer = L.layerGroup().addTo(adminMap);

  // Handle clicking on the map
  adminMap.on("click", function (e) {
    // Remove previous draft
    if (draftMarker) adminMap.removeLayer(draftMarker);

    // Place new draft marker
    draftMarker = L.marker(e.latlng).addTo(adminMap);

    // Auto-fill form
    document.getElementById("node-lat").value = e.latlng.lat.toFixed(6);
    document.getElementById("node-lng").value = e.latlng.lng.toFixed(6);

    // Auto-generate a sequential Node ID if empty
    if (!document.getElementById("node-id").value) {
      document.getElementById("node-id").value =
        "node_" + Math.floor(Math.random() * 1000);
    }
  });

  // Listen to Firebase and plot existing active/mega nodes
  db.ref("nodes").on("value", (snapshot) => {
    adminMarkerLayer.clearLayers();

    snapshot.forEach((child) => {
      const node = child.val();
      if (node.lat && node.lng) {
        const color = node.isMega ? "#f59f00" : "#228be6"; // Gold or Blue

        // Draw existing nodes as circles so they don't block the draft marker
        const circle = L.circleMarker([node.lat, node.lng], {
          color: "white",
          fillColor: color,
          fillOpacity: 1,
          radius: 8,
          weight: 2,
        }).bindPopup(`<b>${child.key}</b><br>Mega: ${node.isMega}`);

        adminMarkerLayer.addLayer(circle);
      }
    });
  });
}

// Function to push the new Node to Firebase
function saveNode() {
  const rawId = document.getElementById("node-id").value.trim();
  const lat = parseFloat(document.getElementById("node-lat").value);
  const lng = parseFloat(document.getElementById("node-lng").value);
  const isMega = document.getElementById("node-mega").checked;
  const capacity =
    parseInt(document.getElementById("node-capacity").value) || 50;

  if (!rawId || isNaN(lat) || isNaN(lng))
    return alert("Drop a pin on the map first!");

  // 🚨 FOOLPROOF FIX: Clean the ID and force the 'node_' prefix
  // Changes "Library Gate" into "node_library_gate" automatically
  let safeId = rawId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  if (!safeId.startsWith("node_")) {
    safeId = "node_" + safeId;
  }

  // Save to Firebase using the cleaned ID
  db.ref(`nodes/${safeId}`)
    .set({
      active: true,
      isMega: isMega,
      lat: lat,
      lng: lng,
      packetCount: capacity,
    })
    .then(() => {
      // Reset form
      document.getElementById("node-id").value = "";
      document.getElementById("node-lat").value = "";
      document.getElementById("node-lng").value = "";
      document.getElementById("node-capacity").value = "50";
      document.getElementById("node-mega").checked = false;
      if (draftMarker) adminMap.removeLayer(draftMarker);
    });
}
// Listen to Firebase and plot existing active/mega nodes
db.ref("nodes").on("value", (snapshot) => {
  // SAFETY FIX: Prevent crash if admin map isn't open yet
  if (!adminMarkerLayer) return;

  adminMarkerLayer.clearLayers();

  snapshot.forEach((child) => {
    const node = child.val();
    if (node.lat && node.lng) {
      const color = node.isMega ? "#f59f00" : "#228be6";

      const circle = L.circleMarker([node.lat, node.lng], {
        color: "white",
        fillColor: color,
        fillOpacity: 1,
        radius: 8,
        weight: 2,
      }).bindPopup(`<b>${child.key}</b><br>Mega: ${node.isMega}`);

      adminMarkerLayer.addLayer(circle);
    }
  });
});
// Listen to Firebase: Plot map nodes AND generate physical QR codes
db.ref("nodes").on("value", (snapshot) => {
  // 1. Update the Admin Map (if it's initialized)
  if (adminMarkerLayer) {
    adminMarkerLayer.clearLayers();
  }

  // 2. Prepare the QR Grid
  const qrGrid = document.getElementById("qr-grid");
  if (qrGrid) qrGrid.innerHTML = "";
  const editList = document.getElementById("node-edit-list");
  if (editList) editList.innerHTML = "";
  snapshot.forEach((child) => {
    const node = child.val();
    const nodeId = child.key;

    // --- MAP RENDER LOGIC ---
    if (adminMarkerLayer && node.lat && node.lng) {
      const color = node.isMega ? "#f59f00" : "#228be6";
      const displayCount = node.active ? node.packetCount || 0 : "DEAD";

      const circle = L.circleMarker([node.lat, node.lng], {
        color: "white",
        fillColor: node.active ? color : "#868e96",
        fillOpacity: node.active ? 1 : 0.5,
        radius: 8,
        weight: 2,
      }).bindPopup(`<b>${nodeId}</b><br>Packets: ${displayCount}`);

      adminMarkerLayer.addLayer(circle);
    }

    // --- QR GRID RENDER LOGIC ---
    if (qrGrid) {
      const card = document.createElement("div");
      card.className = "qr-card";

      // 1. Node ID (Header)
      const title = document.createElement("div");
      title.className = "qr-card-title";
      title.innerText = nodeId.toUpperCase();

      // 2. Instruction Text (New)
      const instruction = document.createElement("div");
      instruction.className = "qr-instruction";
      instruction.innerText = "SCAN TO COLLECT DATA";

      // 3. QR Code Container
      const qrDiv = document.createElement("div");
      qrDiv.id = `qr-${nodeId}`;
      qrDiv.style.display = "flex";
      qrDiv.style.justifyContent = "center";

      // 4. Branding (Footer)
      const dept = document.createElement("div");
      dept.className = "qr-dept";
      dept.innerText = "CSQUEST • CS/IT DEPT • JU";

      // Assemble
      card.appendChild(title);
      card.appendChild(instruction);
      card.appendChild(qrDiv);
      card.appendChild(dept);
      qrGrid.appendChild(card);

      new QRCode(qrDiv, {
        text: nodeId,
        width: 180,
        height: 180,
        colorDark: node.isMega ? "#d9480f" : "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    }
    if (editList) {
      const currentPackets = node.packetCount || 0;
      const listItem = document.createElement("div");

      // Style the row
      listItem.style.display = "flex";
      listItem.style.justifyContent = "space-between";
      listItem.style.alignItems = "center";
      listItem.style.padding = "12px 16px";
      listItem.style.background = "var(--mantine-bg)";
      listItem.style.borderRadius = "8px";
      listItem.style.border = "1px solid var(--mantine-border)";

      // Build the row content
      listItem.innerHTML = `
              <div style="font-weight: 600; color: var(--mantine-title); font-size: 14px;">
                ${nodeId.toUpperCase()} 
                ${node.isMega ? '<span style="color:var(--warning-color); font-size:12px; margin-left:8px;">(MEGA)</span>' : ""}
              </div>
              <div style="display: flex; align-items: center; gap: 16px;">
                <span style="font-size: 14px; font-weight: 700; color: var(--mantine-blue);">${currentPackets} Packets</span>
                <button onclick="window.editNodeCapacity('${nodeId}', ${currentPackets})" class="mantine-btn" style="padding: 6px 12px; font-size: 12px; width: auto;">
                  <i data-lucide="edit-3" size="14"></i> Edit
                </button>
              </div>
            `;
      editList.appendChild(listItem);
    }
  });
  // --- 8. LIVE NODE EDITOR (Global Scope Fix) ---
  window.editNodeCapacity = function (nodeId, currentCapacity) {
    console.log(`[Admin] Attempting to edit ${nodeId}...`); // Debugging log

    // Prompt the admin for a new value
    const newCapacity = prompt(
      `Update packet capacity for ${nodeId.toUpperCase()}:`,
      currentCapacity,
    );

    // If they click Cancel or leave it blank, do nothing
    if (newCapacity === null || newCapacity.trim() === "") return;

    // Convert to an integer and validate
    const parsedCapacity = parseInt(newCapacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity < 0) {
      alert("Action Aborted: Please enter a valid positive number.");
      return;
    }

    // Push the update to Firebase
    db.ref(`nodes/${nodeId}`)
      .update({
        packetCount: parsedCapacity,
        active: parsedCapacity > 0 ? true : false, // Auto-revive if they add packets to a dead node
      })
      .then(() => {
        console.log(
          `[Admin] Successfully updated ${nodeId} to ${parsedCapacity} packets.`,
        );
      })
      .catch((error) => {
        alert("Firebase Error: " + error.message);
      });
  };
  // --- MASTER BASE QR GENERATOR ---
  new QRCode(document.getElementById("master-qr-box"), {
    text: "base_master",
    width: 150,
    height: 150,
    colorDark: "#228be6", // Make the base QR Blue to stand out!
    colorLight: "#ffffff",
  });
  lucide.createIcons();
});

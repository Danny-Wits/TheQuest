lucide.createIcons();
// --- LEAFLET SATELLITE MAP SETUP ---
let map;
let markerLayer;
let activeFeedbackId = "scan-feedback";
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

// --- 2. AUTH & STATE ---
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get("player");

let playerData = { packets: 0, data: 0 };
let currentMarketRate = 0;
let html5QrcodeScannerScan = null;
let html5QrcodeScannerBase = null;
let activeView = "map";

if (playerId) {
  document.getElementById("auth-overlay").style.display = "none";
  initGame();
}

// --- NAVIGATION & SCANNER LIFECYCLE ---
async function switchView(viewName) {
  // 1. Update UI Tabs
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");

  const targetBtn = document.querySelector(
    `.nav-item[onclick="switchView('${viewName}')"]`,
  );
  if (targetBtn) targetBtn.classList.add("active");

  if (viewName === "map" && map !== null) {
    setTimeout(() => map.invalidateSize(), 100);
  }

  activeView = viewName;

  // 2. CRITICAL: Await the camera shutdown before switching
  await stopScanner();

  // 3. Start the correct camera
  if (viewName === "scan") {
    startScanner("scan");
  } else if (viewName === "base") {
    startScanner("base");
  }
}

async function startScanner(type) {
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  const feedbackId = type === "scan" ? "scan-feedback" : "base-scan-feedback";
  const feedback = document.getElementById(feedbackId);

  try {
    if (type === "scan") {
      if (!html5QrcodeScannerScan)
        html5QrcodeScannerScan = new Html5Qrcode("reader-scan");
      await html5QrcodeScannerScan.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
      );
    } else if (type === "base") {
      if (!html5QrcodeScannerBase)
        html5QrcodeScannerBase = new Html5Qrcode("reader-base");
      await html5QrcodeScannerBase.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
      );
    }

    feedback.innerText =
      type === "scan"
        ? "Camera active. Aim at a Node QR."
        : "Camera active. Aim at the Admin Stall QR.";
    feedback.style.color = "var(--mantine-dimmed)";
  } catch (err) {
    console.error("Camera Error:", err);
    feedback.innerText = "Camera access denied. Check browser permissions.";
    feedback.style.color = "var(--danger-color)";
  }
}

async function stopScanner() {
  // Use try/catch blocks so if one camera fails to stop, it doesn't break the whole app
  try {
    if (html5QrcodeScannerScan && html5QrcodeScannerScan.isScanning) {
      await html5QrcodeScannerScan.stop();
    }
  } catch (err) {
    console.error("Error stopping Scan camera:", err);
  }

  try {
    if (html5QrcodeScannerBase && html5QrcodeScannerBase.isScanning) {
      await html5QrcodeScannerBase.stop();
    }
  } catch (err) {
    console.error("Error stopping Base camera:", err);
  }
}
// --- 4. GAME LOGIC ---
let isProcessingScan = false;

async function onScanSuccess(decodedText) {
  if (isProcessingScan) return;
  isProcessingScan = true;

  const feedbackId =
    activeView === "scan" ? "scan-feedback" : "base-scan-feedback";
  const feedback = document.getElementById(feedbackId);

  await stopScanner();

  // --- 1. HANDLE MASTER BASE SCAN (SELLING PACKETS) ---
  if (decodedText === "base_master") {
    feedback.innerText = "Connecting to Mainframe...";
    feedback.style.color = "var(--mantine-blue)";

    const currentPackets = playerData.packets || 0;

    if (currentPackets <= 0) {
      feedback.innerText = "No packets in inventory to upload!";
      feedback.style.color = "var(--danger-color)";
      setTimeout(() => {
        isProcessingScan = false;
        startScanner();
      }, 2500);
      return;
    }

    const earnedData = currentPackets * currentMarketRate;
    const newDataTotal = (playerData.data || 0) + earnedData;

    // Push the sale to Firebase
    db.ref(`players/${playerId}`)
      .update({
        packets: 0,
        data: newDataTotal,
      })
      .then(() => {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        feedback.innerText = `Uplink Successful! Secured ${earnedData} Data.`;
        feedback.style.color = "var(--success-color)";
        setTimeout(() => {
          isProcessingScan = false;
          startScanner(activeView);
        }, 3000);
      });

    return; // Stop here, don't run the node extraction logic
  }

  // --- 2. HANDLE NODE EXTRACTION (COLLECTING PACKETS) ---
  feedback.innerText = "Connecting to Node...";
  feedback.style.color = "var(--mantine-blue)";

  const currentPackets = playerData.packets || 0;
  const spaceLeft = 100 - currentPackets;

  if (spaceLeft <= 0) {
    feedback.innerText = "Inventory Full! Return to Stall to Upload.";
    feedback.style.color = "var(--warning-color)";
    setTimeout(() => {
      isProcessingScan = false;
      startScanner();
    }, 2500);
    return;
  }

  if (decodedText.startsWith("node_")) {
    const nodeId = decodedText;

    if (playerData.scanned && playerData.scanned[nodeId]) {
      feedback.innerText = "Access Denied: Node already extracted by you.";
      feedback.style.color = "var(--warning-color)";
      setTimeout(() => {
        isProcessingScan = false;
        startScanner();
      }, 2500);
      return;
    }

    db.ref(`nodes/${nodeId}`)
      .once("value")
      .then((snapshot) => {
        const nodeData = snapshot.val();

        if (!nodeData || !nodeData.active || nodeData.packetCount <= 0) {
          feedback.innerText = "Node offline or depleted.";
          feedback.style.color = "var(--danger-color)";
          setTimeout(() => {
            isProcessingScan = false;
            startScanner();
          }, 2000);
          return;
        }

        const available = nodeData.packetCount;
        const extractionLimit = 25;
        const takeAmount = Math.min(spaceLeft, available, extractionLimit);

        db.ref(`nodes/${nodeId}`).transaction(
          (currentNode) => {
            if (currentNode && currentNode.packetCount >= takeAmount) {
              currentNode.packetCount -= takeAmount;
              if (currentNode.packetCount <= 0) {
                currentNode.active = false;
                currentNode.packetCount = 0;
              }
              return currentNode;
            }
            return;
          },
          (error, committed) => {
            if (committed) {
              const newTotal = currentPackets + takeAmount;
              db.ref(`players/${playerId}`).update({
                packets: newTotal,
                [`scanned/${nodeId}`]: true,
              });

              if (navigator.vibrate) navigator.vibrate(200);
              feedback.innerText = `Extracted +${takeAmount} Packets!`;
              feedback.style.color = "var(--success-color)";
            } else {
              feedback.innerText = "Network collision! Scan again.";
              feedback.style.color = "var(--warning-color)";
            }
            setTimeout(() => {
              isProcessingScan = false;
              feedback.innerText = "Camera active. Aim at a Node QR.";
              feedback.style.color = "var(--mantine-dimmed)";
              startScanner();
            }, 2500);
          },
        );
      });
  } else {
    feedback.innerText = "Invalid Network QR.";
    feedback.style.color = "var(--danger-color)";
    setTimeout(() => {
      isProcessingScan = false;
      startScanner();
    }, 2000);
  }
}

function initMap() {
  // Set default coordinates [Latitude, Longitude] and Zoom Level (18 is good for walking)
  map = L.map("map-container", { zoomControl: false }).setView(
    [32.7175, 74.8678],
    18,
  );

  // Free Esri Satellite Imagery
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
    },
  ).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

// --- FIREBASE SYNC UPDATED FOR GPS ---
function initGame() {
  // Initialize the map first
  initMap();

  // Listen to Player Stats
  db.ref(`players/${playerId}`).on("value", (snapshot) => {
    if (snapshot.exists()) {
      playerData = snapshot.val();
      document.getElementById("player-name").innerText =
        playerData.name || "Unknown Node";
      document.getElementById("ui-data").innerText = playerData.data || 0;
      document.getElementById("ui-packets").innerText = playerData.packets || 0;

      lucide.createIcons();
    }
  });

  // Listen to Market Rate
  db.ref("market/price").on("value", (snapshot) => {
    currentMarketRate = snapshot.val() || 50;
    document.getElementById("ui-market-rate").innerText = currentMarketRate;
  });
  // Listen to Nodes for the Map (Now using Lat/Lng)
  db.ref("nodes").on("value", (snapshot) => {
    if (!markerLayer) return;
    markerLayer.clearLayers();

    snapshot.forEach((child) => {
      const node = child.val();
      const nodeId = child.key;

      if (node.lat && node.lng) {
        const displayCount = node.active ? node.packetCount || 0 : "0";

        // Check if THIS specific player has already looted this node
        const hasScanned = playerData.scanned && playerData.scanned[nodeId];

        // Determine visual state
        let statusClass = "";
        if (!node.active || displayCount === 0 || displayCount === "0") {
          statusClass = "inactive"; // Dead for everyone
        } else if (hasScanned) {
          statusClass = "scanned"; // Alive, but dead for THIS player
        } else if (node.isMega) {
          statusClass = "mega"; // High value target
        }

        const customIcon = L.divIcon({
          className: "custom-div-icon",
          html: `<div class="map-node ${statusClass}">${displayCount}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        L.marker([node.lat, node.lng], { icon: customIcon }).addTo(markerLayer);
      }
    });
  });
}

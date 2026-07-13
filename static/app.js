let currentLat = 52.3702;
let currentLon = 4.8952;
let isOfflineMode = false;
let db = null;

// Standaard anker codes voor pre-fetching/sync
const ANCHOR_CODES = ["BU03630101", "BU03440401", "BU05990302", "BU02000101", "BU02850101"];

// --- 1. INDEXEDDB SETUP ---
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("WijkagentCacheDB", 1);

        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("neighborhoods")) {
                db.createObjectStore("neighborhoods", { keyPath: "buurtcode" });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            updateCacheCountDisplay();
            resolve(db);
        };

        request.onerror = function(event) {
            console.error("IndexedDB fout:", event.target.error);
            reject(event.target.error);
        };
    });
}

// Opslaan in cache
function cacheNeighborhood(data) {
    if (!db) return;
    const transaction = db.transaction(["neighborhoods"], "readwrite");
    const store = transaction.objectStore("neighborhoods");
    // Voeg een timestamp toe om de cache-leeftijd bij te houden
    data.cached_at = Date.now();
    store.put(data);
    
    transaction.oncomplete = function() {
        updateCacheCountDisplay();
    };
}

// Alle gecachte buurten ophalen
function getAllCachedNeighborhoods() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction(["neighborhoods"], "readonly");
        const store = transaction.objectStore("neighborhoods");
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result || []);
        };

        request.onerror = function() {
            reject(request.error);
        };
    });
}

// Tellen van gecachte records
function updateCacheCountDisplay() {
    if (!db) return;
    const transaction = db.transaction(["neighborhoods"], "readonly");
    const store = transaction.objectStore("neighborhoods");
    const countRequest = store.count();

    countRequest.onsuccess = function() {
        document.getElementById("cache-count").textContent = `${countRequest.result} buurten`;
    };
}

// --- 2. GPS GEOLOCATIE & AFSTANDSBEREKENING (HAVERSINE) ---

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Straal van de aarde in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Lokale lookup in de IndexedDB cache op basis van dichtstbijzijnde coördinaten
async function findClosestInCache(lat, lon) {
    const cached = await getAllCachedNeighborhoods();
    if (cached.length === 0) return null;

    let closest = null;
    let minDistance = Infinity;

    cached.forEach(neighborhood => {
        const dist = haversineDistance(lat, lon, neighborhood.lat, neighborhood.lon);
        if (dist < minDistance) {
            minDistance = dist;
            closest = JSON.parse(JSON.stringify(neighborhood)); // diepe kopie
        }
    });

    if (closest) {
        closest.distance_meters = Math.round(minDistance);
        closest.is_from_cache = true;
    }
    return closest;
}

// --- 3. DATA OPHALEN & VERWERKEN ---

async function fetchNeighborhoodData(lat, lon) {
    showLoader("Locatiedata ophalen...");
    
    // Altijd eerst kijken of we in offline modus zitten of dat het netwerk plat ligt
    if (isOfflineMode) {
        try {
            const cachedData = await findClosestInCache(lat, lon);
            if (cachedData) {
                renderDashboard(cachedData);
                hideLoader();
                return;
            } else {
                alert("Offline modus is actief, maar er zijn geen buurten gecached. Tik op 'Offline Modus' om online te gaan en data te synchroniseren.");
                hideLoader();
                return;
            }
        } catch (err) {
            console.error("Fout bij ophalen uit cache:", err);
        }
    }

    // Online proberen
    try {
        const response = await fetch(`/api/lookup?lat=${lat}&lon=${lon}`);
        if (!response.ok) throw new Error("Server response niet OK");
        
        const data = await response.json();
        
        // Opslaan in IndexedDB voor offline gebruik
        cacheNeighborhood(data);
        
        renderDashboard(data);
    } catch (error) {
        console.warn("Netwerkfout, terugvallen op lokale cache:", error);
        // Automatische fallback naar IndexedDB cache bij storing
        const cachedData = await findClosestInCache(lat, lon);
        if (cachedData) {
            renderDashboard(cachedData);
            document.getElementById("badge-network").textContent = "Cached";
            document.getElementById("badge-network").className = "badge badge-connection-offline";
        } else {
            alert("Kan geen verbinding maken met de server en er is geen lokale cache beschikbaar.");
        }
    } finally {
        hideLoader();
    }
}

// --- 4. RENDER METHODEN ---

function renderDashboard(data) {
    // 1. Locatiegegevens
    document.getElementById("neighborhood-name").textContent = `${data.buurtnaam}, ${data.gemeentenaam}`;
    document.getElementById("neighborhood-code").textContent = data.buurtcode;
    
    const distText = data.distance_meters > 0 ? `Afstand: ${data.distance_meters}m` : "Exacte GPS match";
    document.getElementById("neighborhood-distance").textContent = distText;

    // Netwerk status badge aanpassen
    const netBadge = document.getElementById("badge-network");
    if (isOfflineMode) {
        netBadge.textContent = "Offline";
        netBadge.className = "badge badge-connection-offline";
    } else if (data.is_from_cache) {
        netBadge.textContent = "Cached";
        netBadge.className = "badge badge-connection-offline";
    } else {
        netBadge.textContent = "Online";
        netBadge.className = "badge badge-connection-online";
    }

    // 2. Briefing & Alerts
    const briefingList = document.getElementById("briefing-list");
    briefingList.innerHTML = "";
    
    if (data.briefing_trends && data.briefing_trends.anomalies && data.briefing_trends.anomalies.length > 0) {
        data.briefing_trends.anomalies.forEach(anomaly => {
            const li = document.createElement("li");
            li.className = "briefing-alert-item";
            li.textContent = anomaly;
            briefingList.appendChild(li);
        });
        document.getElementById("card-briefing").style.display = "block";
    } else {
        document.getElementById("card-briefing").style.display = "none";
    }
    
    document.getElementById("briefing-comparison").textContent = 
        data.briefing_trends ? data.briefing_trends.regional_comparison : "";

    // 3. Leefbaarometer
    const lbClass = data.safety_livability.leefbaarometer_class;
    const lbScore = data.safety_livability.leefbaarometer_score;
    
    const lbClassEl = document.getElementById("lb-class");
    lbClassEl.textContent = lbClass;
    // Reset klassen en voeg specifieke kleur-klasse toe
    lbClassEl.className = "leefbaarheid-class " + "score-" + lbClass.replace(/\s+/g, '-');
    document.getElementById("lb-score").textContent = lbScore.toFixed(1);

    // 4. Incidenten
    const incidents = data.safety_livability.incidents_per_1000;
    
    // High Impact Crime styling & waarde
    const hicBadge = document.getElementById("val-hic");
    hicBadge.textContent = incidents.high_impact_crime.toFixed(1);
    setSafetyBadgeStyle(hicBadge, incidents.high_impact_crime, 5, 15);

    // Burglary styling & waarde
    const burgBadge = document.getElementById("val-burglary");
    burgBadge.textContent = incidents.burglary.toFixed(1);
    setSafetyBadgeStyle(burgBadge, incidents.burglary, 5, 10);

    // Youth Nuisance styling & waarde
    const youthBadge = document.getElementById("val-youth");
    youthBadge.textContent = incidents.youth_nuisance.toFixed(1);
    setSafetyBadgeStyle(youthBadge, incidents.youth_nuisance, 10, 20);

    // 5. Socio-Economisch
    const socio = data.socio_economics;
    document.getElementById("val-income").textContent = `€ ${Math.round(socio.avg_income_k * 1000).toLocaleString('nl-NL')},-`;
    document.getElementById("val-unemployment").textContent = `${socio.unemployment_pct.toFixed(1)}%`;
    document.getElementById("val-vulnerability").textContent = socio.vulnerability_score.toFixed(1);

    // 6. Demografie & Mobiliteit
    const demo = data.demographics;
    document.getElementById("val-single").textContent = `${demo.single_households_pct}%`;
    document.getElementById("val-mobility").textContent = demo.move_mobility_index;

    // Render age graph
    const ageGraph = document.getElementById("age-graph-container");
    ageGraph.innerHTML = "";
    
    const ageGroups = demo.age_groups;
    Object.keys(ageGroups).forEach(group => {
        const pct = ageGroups[group];
        
        const row = document.createElement("div");
        row.className = "age-row";
        
        row.innerHTML = `
            <div class="age-label">${group}</div>
            <div class="age-bar-wrapper">
                <div class="age-bar-fill" style="width: ${pct}%"></div>
            </div>
            <div class="age-pct">${pct}%</div>
        `;
        ageGraph.appendChild(row);
    });
}

function setSafetyBadgeStyle(badgeEl, value, lowThreshold, highThreshold) {
    badgeEl.className = "safety-value-badge";
    if (value >= highThreshold) {
        badgeEl.classList.add("safety-high");
    } else if (value >= lowThreshold) {
        badgeEl.classList.add("safety-medium");
    } else {
        badgeEl.classList.add("safety-low");
    }
}

// --- 5. INTERACTIE EN UTILITIES ---

function showLoader(text) {
    document.getElementById("loader-text").textContent = text;
    document.getElementById("loader").style.display = "flex";
}

function hideLoader() {
    document.getElementById("loader").style.display = "none";
}

// Locatie selecteren via simulator knoppen
function setSimulatedLocation(locCode, lat, lon, buttonEl) {
    // Update active class op knoppen
    document.querySelectorAll(".sim-btn").forEach(btn => btn.classList.remove("active"));
    buttonEl.classList.add("active");

    document.getElementById("badge-gps").textContent = "Simulatie (" + locCode + ")";
    document.getElementById("badge-gps").className = "badge badge-gps-simulated";

    currentLat = lat;
    currentLon = lon;
    fetchNeighborhoodData(lat, lon);
}

// Echte GPS opvragen van mobiele apparaat
function useDeviceGPS(buttonEl) {
    if (!navigator.geolocation) {
        alert("Geolocatie wordt niet ondersteund door deze browser.");
        return;
    }

    showLoader("GPS Signaal zoeken...");
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            // Update active class
            document.querySelectorAll(".sim-btn").forEach(btn => btn.classList.remove("active"));
            buttonEl.classList.add("active");

            document.getElementById("badge-gps").textContent = "Live GPS";
            document.getElementById("badge-gps").className = "badge badge-gps-active";

            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;

            fetchNeighborhoodData(currentLat, currentLon);
        },
        (error) => {
            hideLoader();
            console.error("GPS fout:", error);
            let msg = "GPS fout: ";
            if (error.code === error.PERMISSION_DENIED) msg += "Locatietoegang geweigerd door gebruiker.";
            else if (error.code === error.POSITION_UNAVAILABLE) msg += "Locatie niet beschikbaar.";
            else if (error.code === error.TIMEOUT) msg += "GPS timeout.";
            else msg += error.message;
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

// Toggle offline modus handmatig
function toggleOfflineMode() {
    isOfflineMode = !isOfflineMode;
    const btn = document.getElementById("btn-offline-toggle");
    
    if (isOfflineMode) {
        btn.textContent = "🔌 Online Gaan";
        btn.classList.add("active");
    } else {
        btn.textContent = "📶 Offline Modus";
        btn.classList.remove("active");
    }
    
    // Data opnieuw inladen om offline state toe te passen
    fetchNeighborhoodData(currentLat, currentLon);
}

// Pre-fetching: Synchroniseer alle ingebouwde testlocaties
async function syncAllAnchorNeighborhoods() {
    showLoader("Wijkpakket synchroniseren...");
    
    // We roepen de sync endpoint aan
    try {
        const response = await fetch("/api/sync-offline", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ buurtcodes: ANCHOR_CODES })
        });
        
        if (!response.ok) throw new Error("Sync serverfout");
        
        const data = await response.json();
        
        // Sla alle ontvangen buurten op in de cache
        data.neighborhoods.forEach(neighborhood => {
            cacheNeighborhood(neighborhood);
        });
        
        alert(`Synchronisatie voltooid! ${data.neighborhoods.length} buurten opgeslagen voor offline gebruik.`);
    } catch (error) {
        console.error("Sync fout:", error);
        alert("Kan geen verbinding maken met de server om te synchroniseren. Controleer uw verbinding.");
    } finally {
        hideLoader();
    }
}

// --- 6. INITIALISATIE ---
window.addEventListener("DOMContentLoaded", async () => {
    await initDB();
    // Start met Amsterdam Wallen als actieve simulatie bij opstarten
    fetchNeighborhoodData(currentLat, currentLon);
});

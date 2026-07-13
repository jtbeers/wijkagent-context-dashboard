let currentQuery = { lat: 52.3702, lon: 4.8952 };
let isOfflineMode = false;
let db = null;

const ANCHOR_CODES = ["BU03630101", "BU03440401", "BU05990302", "BU02000101", "BU02850101"];

const OFFLINE_PC_MAP = {
    "1011": "BU03630101",
    "1012": "BU03630101",
    "3561": "BU03440401",
    "3562": "BU03440401",
    "3563": "BU03440401",
    "3073": "BU05990302",
    "3074": "BU05990302",
    "7311": "BU02000101",
    "7312": "BU02000101",
    "8171": "BU02850101",
    "8172": "BU02850101"
};

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

function cacheNeighborhood(data) {
    if (!db) return;
    const transaction = db.transaction(["neighborhoods"], "readwrite");
    const store = transaction.objectStore("neighborhoods");
    data.cached_at = Date.now();
    store.put(data);
    transaction.oncomplete = function() {
        updateCacheCountDisplay();
    };
}

function getAllCachedNeighborhoods() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction(["neighborhoods"], "readonly");
        const store = transaction.objectStore("neighborhoods");
        const request = store.getAll();
        request.onsuccess = function() { resolve(request.result || []); };
        request.onerror = function() { reject(request.error); };
    });
}

function getCachedNeighborhoodByCode(buurtcode) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve(null);
        const transaction = db.transaction(["neighborhoods"], "readonly");
        const store = transaction.objectStore("neighborhoods");
        const request = store.get(buurtcode);
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function() { reject(request.error); };
    });
}

function updateCacheCountDisplay() {
    if (!db) return;
    const transaction = db.transaction(["neighborhoods"], "readonly");
    const store = transaction.objectStore("neighborhoods");
    const countRequest = store.count();
    countRequest.onsuccess = function() {
        document.getElementById("cache-count").textContent = `${countRequest.result} buurten`;
    };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function findClosestInCache(lat, lon) {
    const cached = await getAllCachedNeighborhoods();
    if (cached.length === 0) return null;
    let closest = null;
    let minDistance = Infinity;
    cached.forEach(neighborhood => {
        const dist = haversineDistance(lat, lon, neighborhood.lat, neighborhood.lon);
        if (dist < minDistance) {
            minDistance = dist;
            closest = JSON.parse(JSON.stringify(neighborhood));
        }
    });
    if (closest) {
        closest.distance_meters = Math.round(minDistance);
        closest.is_from_cache = true;
    }
    return closest;
}

async function findNeighborhoodInCacheByPostcode(postcode) {
    const cleanPc = postcode.replace(/\s+/g, "").toUpperCase();
    const pc4 = cleanPc.substring(0, 4);
    if (pc4 in OFFLINE_PC_MAP) {
        const code = OFFLINE_PC_MAP[pc4];
        const data = await getCachedNeighborhoodByCode(code);
        if (data) {
            data.is_from_cache = true;
            data.distance_meters = 0;
            return data;
        }
    }
    const cached = await getAllCachedNeighborhoods();
    if (cached.length > 0) {
        const data = JSON.parse(JSON.stringify(cached[0]));
        data.buurtnaam = `Wijk [Postcode ${cleanPc}] (Offline Fallback)`;
        data.is_from_cache = true;
        data.distance_meters = 0;
        return data;
    }
    return null;
}

async function fetchNeighborhoodData(query) {
    showLoader("Buurtgegevens ophalen...");
    hideSearchFeedback();
    currentQuery = query;

    if (isOfflineMode) {
        try {
            let cachedData = null;
            if (query.postcode) {
                cachedData = await findNeighborhoodInCacheByPostcode(query.postcode);
            } else if (query.lat && query.lon) {
                cachedData = await findClosestInCache(query.lat, query.lon);
            }
            if (cachedData) {
                renderDashboard(cachedData);
                showSearchFeedback("Data geladen uit lokale offline cache.", "success");
            } else {
                showSearchFeedback("Geen offline cache beschikbaar. Schakel offline modus uit.", "error");
            }
        } catch (err) {
            console.error("Fout bij offline laden:", err);
            showSearchFeedback("Fout bij laden uit cache.", "error");
        } finally {
            hideLoader();
        }
        return;
    }

    let url = "/api/lookup?";
    if (query.postcode) {
        url += `postcode=${encodeURIComponent(query.postcode)}`;
    } else if (query.lat && query.lon) {
        url += `lat=${query.lat}&lon=${query.lon}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errDetail = await response.json();
            throw new Error(errDetail.detail || "Serverfout.");
        }
        const data = await response.json();
        cacheNeighborhood(data);
        renderDashboard(data);
        showSearchFeedback(`Data opgehaald via: ${data.source}`, "success");
    } catch (error) {
        console.warn("Netwerkfout, fallback naar cache...", error);
        let cachedData = null;
        if (query.postcode) {
            cachedData = await findNeighborhoodInCacheByPostcode(query.postcode);
        } else if (query.lat && query.lon) {
            cachedData = await findClosestInCache(query.lat, query.lon);
        }
        if (cachedData) {
            renderDashboard(cachedData);
            document.getElementById("badge-network").textContent = "Cached";
            document.getElementById("badge-network").className = "badge badge-connection-offline";
            showSearchFeedback(`Netwerkfout. Teruggevallen op offline cache.`, "error");
        } else {
            showSearchFeedback(`Fout: ${error.message}`, "error");
            alert(`Fout bij laden: ${error.message}`);
        }
    } finally {
        hideLoader();
    }
}

function renderDashboard(data) {
    document.getElementById("neighborhood-name").textContent = `${data.buurtnaam}, ${data.gemeentenaam}`;
    document.getElementById("neighborhood-code").textContent = data.buurtcode || "BU-CODE GEEN";
    const distText = data.distance_meters > 0 ? `Afstand: ${data.distance_meters}m` : "Exacte match";
    document.getElementById("neighborhood-distance").textContent = distText;
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
    const lbClass = data.safety_livability.leefbaarometer_class;
    const lbScore = data.safety_livability.leefbaarometer_score;
    const lbClassEl = document.getElementById("lb-class");
    lbClassEl.textContent = lbClass;
    lbClassEl.className = "leefbaarheid-class " + "score-" + lbClass.replace(/\s+/g, '-');
    document.getElementById("lb-score").textContent = lbScore.toFixed(1);
    const incidents = data.safety_livability.incidents_per_1000;
    const hicBadge = document.getElementById("val-hic");
    hicBadge.textContent = incidents.high_impact_crime.toFixed(1);
    setSafetyBadgeStyle(hicBadge, incidents.high_impact_crime, 5, 15);
    const burgBadge = document.getElementById("val-burglary");
    burgBadge.textContent = incidents.burglary.toFixed(1);
    setSafetyBadgeStyle(burgBadge, incidents.burglary, 5, 10);
    const youthBadge = document.getElementById("val-youth");
    youthBadge.textContent = incidents.youth_nuisance.toFixed(1);
    setSafetyBadgeStyle(youthBadge, incidents.youth_nuisance, 10, 20);
    const socio = data.socio_economics;
    if (socio.avg_income_k) {
        document.getElementById("val-income").textContent = `€ ${Math.round(socio.avg_income_k * 1000).toLocaleString('nl-NL')},-`;
    } else {
        document.getElementById("val-income").textContent = "Onbekend";
    }
    document.getElementById("val-unemployment").textContent = `${socio.unemployment_pct.toFixed(1)}%`;
    document.getElementById("val-vulnerability").textContent = socio.vulnerability_score.toFixed(1);
    const demo = data.demographics;
    document.getElementById("val-single").textContent = `${demo.single_households_pct}%`;
    document.getElementById("val-mobility").textContent = demo.move_mobility_index;
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

function showSearchFeedback(text, type) {
    const feedbackEl = document.getElementById("search-feedback");
    feedbackEl.textContent = text;
    feedbackEl.className = `search-feedback ${type}`;
}

function hideSearchFeedback() {
    const feedbackEl = document.getElementById("search-feedback");
    feedbackEl.className = "search-feedback hidden";
}

function searchByPostcode() {
    const postcodeVal = document.getElementById("postcode-input").value.trim();
    if (!postcodeVal) {
        showSearchFeedback("Voer een postcode in.", "error");
        return;
    }
    const postcodeRegex = /^[1-9][0-9]{3}\s?[a-zA-Z]{2}$|^[1-9][0-9]{3}$/;
    if (!postcodeRegex.test(postcodeVal)) {
        showSearchFeedback("Ongeldige postcode (bijv. 1012JS of 1012).", "error");
        return;
    }
    document.querySelectorAll(".sim-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById("badge-gps").textContent = `PC: ${postcodeVal.toUpperCase()}`;
    document.getElementById("badge-gps").className = "badge badge-gps-simulated";
    fetchNeighborhoodData({ postcode: postcodeVal });
}

function useDeviceGPS(buttonEl) {
    if (!navigator.geolocation) {
        alert("Geolocatie wordt niet ondersteund door deze browser.");
        return;
    }
    document.getElementById("postcode-input").value = "";
    document.querySelectorAll(".sim-btn").forEach(btn => btn.classList.remove("active"));
    showLoader("GPS Signaal zoeken...");
    hideSearchFeedback();
    navigator.geolocation.getCurrentPosition(
        (position) => {
            document.getElementById("badge-gps").textContent = "Live GPS";
            document.getElementById("badge-gps").className = "badge badge-gps-active";
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            fetchNeighborhoodData({ lat: lat, lon: lon });
        },
        (error) => {
            hideLoader();
            console.error("GPS fout:", error);
            let msg = "GPS fout: ";
            if (error.code === error.PERMISSION_DENIED) msg += "Toegang geweigerd.";
            else if (error.code === error.POSITION_UNAVAILABLE) msg += "Locatie niet beschikbaar.";
            else if (error.code === error.TIMEOUT) msg += "GPS timeout.";
            else msg += error.message;
            showSearchFeedback(msg, "error");
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

function setSimulatedLocation(locCode, lat, lon, buttonEl) {
    document.getElementById("postcode-input").value = "";
    document.querySelectorAll(".sim-btn").forEach(btn => btn.classList.remove("active"));
    buttonEl.classList.add("active");
    document.getElementById("badge-gps").textContent = "Simulatie (" + locCode + ")";
    document.getElementById("badge-gps").className = "badge badge-gps-simulated";
    fetchNeighborhoodData({ lat: lat, lon: lon });
}

function toggleOfflineMode() {
    isOfflineMode = !isOfflineMode;
    const btn = document.getElementById("btn-offline-toggle");
    if (isOfflineMode) {
        btn.textContent = "🔌 Online Gaan";
        btn.classList.add("active");
        showSearchFeedback("Offline modus geactiveerd.", "success");
    } else {
        btn.textContent = "📶 Offline Modus";
        btn.classList.remove("active");
        showSearchFeedback("Online modus geactiveerd.", "success");
    }
    fetchNeighborhoodData(currentQuery);
}

async function syncAllAnchorNeighborhoods() {
    showLoader("Wijkpakket synchroniseren...");
    hideSearchFeedback();
    try {
        const response = await fetch("/api/sync-offline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ buurtcodes: ANCHOR_CODES })
        });
        if (!response.ok) throw new Error("Sync serverfout");
        const data = await response.json();
        data.neighborhoods.forEach(neighborhood => {
            cacheNeighborhood(neighborhood);
        });
        showSearchFeedback(`Synchronisatie voltooid. ${data.neighborhoods.length} buurten lokaal opgeslagen.`, "success");
        alert(`Synchronisatie voltooid! ${data.neighborhoods.length} buurten opgeslagen voor offline gebruik.`);
    } catch (error) {
        console.error("Sync fout:", error);
        showSearchFeedback("Sync mislukt. Geen netwerkverbinding.", "error");
        alert("Kan geen verbinding maken met de server om te synchroniseren. Controleer uw verbinding.");
    } finally {
        hideLoader();
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    await initDB();
    document.getElementById("postcode-input").addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            searchByPostcode();
        }
    });
    const startBtn = document.getElementById("btn-preset-ams");
    setSimulatedLocation('AMS', 52.3702, 4.8952, startBtn);
});

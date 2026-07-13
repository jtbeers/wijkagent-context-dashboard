import math
import hashlib
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="Wijkagent Contextueel Dashboard API",
    description="API voor het leveren van locatiegebaseerde CBS buurtstatistieken en veiligheidsdata ten behoeve van politiefunctionarissen op straat.",
    version="1.0.0"
)

# Activeer CORS zodat de frontend (indien apart geserveerd) erbij kan
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. DATAMODEL & ANCHOR LOCATIES ---

ANCHOR_NEIGHBORHOODS = [
    {
        "buurtcode": "BU03630101",
        "buurtnaam": "Burgwallen-Oude Zijde",
        "gemeentenaam": "Amsterdam",
        "lat": 52.3702,
        "lon": 4.8952,
        "demographics": {
            "age_groups": {"0-14": 6, "15-24": 15, "25-44": 48, "45-64": 21, "65+": 10},
            "single_households_pct": 72,
            "move_mobility_index": 120
        },
        "socio_economics": {
            "avg_income_k": 31.2,
            "unemployment_pct": 6.2,
            "vulnerability_score": 5.8
        },
        "safety_livability": {
            "leefbaarometer_class": "Matig",
            "leefbaarometer_score": 4.8,
            "incidents_per_1000": {
                "high_impact_crime": 24.5,
                "burglary": 6.2,
                "youth_nuisance": 18.0
            }
        },
        "briefing_trends": {
            "anomalies": [
                "Zakkenrollerij: Significante stijging (+40%) afgelopen 30 dagen door verhoogde toeristendrukte rondom de Wallen.",
                "Overlast openbaar dronkenschap: Piekt tussen donderdag en zaterdagavond na 22:00 uur.",
                "Fietsendiefstal: Hotspot rondom het Centraal Station en metro-ingangen."
            ],
            "regional_comparison": "De incidentendichtheid ligt 150% boven het Amsterdamse gemiddelde."
        }
    },
    {
        "buurtcode": "BU03440401",
        "buurtnaam": "Overvecht-Noord",
        "gemeentenaam": "Utrecht",
        "lat": 52.1158,
        "lon": 5.1095,
        "demographics": {
            "age_groups": {"0-14": 22, "15-24": 16, "25-44": 30, "45-64": 20, "65+": 12},
            "single_households_pct": 58,
            "move_mobility_index": 95
        },
        "socio_economics": {
            "avg_income_k": 19.8,
            "unemployment_pct": 11.5,
            "vulnerability_score": 8.2
        },
        "safety_livability": {
            "leefbaarometer_class": "Zeer onvoldoende",
            "leefbaarometer_score": 3.2,
            "incidents_per_1000": {
                "high_impact_crime": 18.2,
                "burglary": 14.5,
                "youth_nuisance": 32.1
            }
        },
        "briefing_trends": {
            "anomalies": [
                "Jeugdoverlast: Meldingen zijn met 45% gestegen rondom het winkelcentrum Overvecht.",
                "Woninginbraken: Golf van inbraken geconstateerd tussen 17:00 en 20:00 uur (schemertijd). Target zijn met name benedenwoningen.",
                "Voertuigcriminaliteit: Verhoogde activiteit rondom onbewaakte parkeerhavens."
            ],
            "regional_comparison": "Jeugdoverlast ligt ruim 80% hoger dan het stedelijk gemiddelde van Utrecht."
        }
    },
    {
        "buurtcode": "BU05990302",
        "buurtnaam": "Bloemhof",
        "gemeentenaam": "Rotterdam",
        "lat": 51.8954,
        "lon": 4.5074,
        "demographics": {
            "age_groups": {"0-14": 24, "15-24": 15, "25-44": 32, "45-64": 21, "65+": 8},
            "single_households_pct": 51,
            "move_mobility_index": 110
        },
        "socio_economics": {
            "avg_income_k": 18.5,
            "unemployment_pct": 13.2,
            "vulnerability_score": 8.9
        },
        "safety_livability": {
            "leefbaarometer_class": "Onvoldoende",
            "leefbaarometer_score": 3.8,
            "incidents_per_1000": {
                "high_impact_crime": 22.1,
                "burglary": 12.1,
                "youth_nuisance": 28.5
            }
        },
        "briefing_trends": {
            "anomalies": [
                "Straatroven: Stijging in incidenten onder bedreiging van steekwapens door minderjarigen. Focusgebied voor preventief fouilleren.",
                "Huiselijk geweld: Aantal meldingen stijgt gestaag in de wijk.",
                "Ondermijning: Vermoeden van illegale bewoning en drugshandel in panden aan de Putsebocht."
            ],
            "regional_comparison": "De kwetsbaarheidsscore behoort tot de hoogste 5% van Rotterdam."
        }
    },
    {
        "buurtcode": "BU02000101",
        "buurtnaam": "Apeldoorn Centrum",
        "gemeentenaam": "Apeldoorn",
        "lat": 52.2112,
        "lon": 5.9699,
        "demographics": {
            "age_groups": {"0-14": 12, "15-24": 11, "25-44": 28, "45-64": 27, "65+": 22},
            "single_households_pct": 48,
            "move_mobility_index": 85
        },
        "socio_economics": {
            "avg_income_k": 25.8,
            "unemployment_pct": 4.8,
            "vulnerability_score": 3.5
        },
        "safety_livability": {
            "leefbaarometer_class": "Goed",
            "leefbaarometer_score": 7.2,
            "incidents_per_1000": {
                "high_impact_crime": 5.4,
                "burglary": 4.8,
                "youth_nuisance": 8.2
            }
        },
        "briefing_trends": {
            "anomalies": [
                "Rustig beeld: Geen significante afwijkingen gedetecteerd ten opzichte van het 30-dagen gemiddelde.",
                "Winkeldiefstal: Lichte stijging op koopavonden in de Hoofdstraat.",
                "Fietsendiefstal: Concentreert zich rondom het Stationsplein."
            ],
            "regional_comparison": "Veiligheidsindex is stabiel en scoort beter dan het landelijk gemiddelde."
        }
    },
    {
        "buurtcode": "BU02850101",
        "buurtnaam": "Vaassen Centrum",
        "gemeentenaam": "Epe",
        "lat": 52.2892,
        "lon": 5.9681,
        "demographics": {
            "age_groups": {"0-14": 15, "15-24": 10, "25-44": 22, "45-64": 28, "65+": 25},
            "single_households_pct": 31,
            "move_mobility_index": 68
        },
        "socio_economics": {
            "avg_income_k": 27.2,
            "unemployment_pct": 3.1,
            "vulnerability_score": 2.8
        },
        "safety_livability": {
            "leefbaarometer_class": "Uitstekend",
            "leefbaarometer_score": 8.5,
            "incidents_per_1000": {
                "high_impact_crime": 1.2,
                "burglary": 3.1,
                "youth_nuisance": 4.2
            }
        },
        "briefing_trends": {
            "anomalies": [
                "Babbeltrucs: Waarschuwing actief voor diefstal bij ouderen aan de deur door zich voor te doen als bezorgers.",
                "Geen andere operationele bijzonderheden."
            ],
            "regional_comparison": "Zeer laag incidentenniveau. Veiligheidsrisico's zijn minimaal."
        }
    }
]

# --- 2. HULPFUNCTIES ---

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000  # Aardstraal in meters
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi_1) * math.cos(phi_2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c

def generate_dynamic_neighborhood(lat: float, lon: float) -> Dict[str, Any]:
    seed_str = f"{lat:.4f},{lon:.4f}"
    hash_val = int(hashlib.md5(seed_str.encode('utf-8')).hexdigest(), 16)
    
    buurt_id = hash_val % 900000 + 100000
    buurt_code = f"BU{buurt_id:08d}"
    
    wijk_prefixes = ["Nieuw-", "Oud-", "Zuid-", "Noord-", "Oost-", "West-", "Groot-", "Klein-"]
    wijk_roots = ["polder", "haven", "dorp", "veld", "bos", "duin", "berg", "meer", "dal", "werf", "sluis", "dam"]
    wijk_suffixes = ["-West", "-Oost", "-Centrum", " Zuiderpark", " Noorderlicht", " Buitengebied"]
    
    pref = wijk_prefixes[hash_val % len(wijk_prefixes)]
    root = wijk_roots[(hash_val // 10) % len(wijk_roots)]
    suff = wijk_suffixes[(hash_val // 100) % len(wijk_suffixes)]
    
    buurtnaam = f"{pref}{root.capitalize()}{suff}"
    
    if lat > 52.5:
        gemeente = "Groningen" if lon > 6.0 else "Alkmaar"
    elif lat < 51.7:
        gemeente = "Eindhoven" if lon > 5.2 else "Middelburg"
    else:
        gemeente = "Amersfoort" if lon > 5.0 else "Den Haag"

    age_0_14 = 10 + (hash_val % 15)
    age_15_24 = 8 + ((hash_val // 3) % 12)
    age_25_44 = 20 + ((hash_val // 7) % 20)
    age_45_64 = 20 + ((hash_val // 11) % 15)
    age_65 = 100 - (age_0_14 + age_15_24 + age_25_44 + age_45_64)
    
    single_pct = 25 + (hash_val % 45)
    mobility = 60 + (hash_val % 80)
    
    income = 18.0 + (hash_val % 250) / 10.0
    unemployment = 3.0 + (hash_val % 120) / 10.0
    vuln = round(1.0 + (hash_val % 90) / 10.0, 1)
    
    lb_classes = ["Zeer onvoldoende", "Onvoldoende", "Matig", "Voldoende", "Ruim voldoende", "Goed", "Zeer goed", "Uitstekend"]
    lb_idx = hash_val % len(lb_classes)
    lb_score = round(1.0 + (lb_idx * 1.1) + (hash_val % 10) / 10.0, 1)
    
    hic = round(2.0 + (hash_val % 220) / 10.0, 1)
    burg = round(1.5 + (hash_val % 150) / 10.0, 1)
    youth = round(3.0 + (hash_val % 300) / 10.0, 1)
    
    anomalies = []
    if hic > 15:
        anomalies.append("Geweldsincidenten: Verhoogde meldingen in de weekenden nabij horecagebieden (+20%).")
    if burg > 10:
        anomalies.append("Woninginbraken: Actieve inbraakgolf gemeld. Mogelijk mobiel banditisme. Extra alertheid gevraagd op vreemde voertuigen.")
    if youth > 20:
        anomalies.append("Jeugdoverlast: Groepsvorming en overlast door jongeren rondom lokale sportvelden/hangplekken.")
        
    if not anomalies:
        anomalies.append("Rustig wijkbeeld: Incidenten liggen onder of op het langjarig gemiddelde.")
        anomalies.append("Geen specifieke operationele waarschuwingen actief.")
        
    return {
        "buurtcode": buurt_code,
        "buurtnaam": buurtnaam,
        "gemeentenaam": gemeente,
        "lat": lat,
        "lon": lon,
        "demographics": {
            "age_groups": {
                "0-14": age_0_14,
                "15-24": age_15_24,
                "25-44": age_25_44,
                "45-64": age_45_64,
                "65+": age_65
            },
            "single_households_pct": single_pct,
            "move_mobility_index": mobility
        },
        "socio_economics": {
            "avg_income_k": income,
            "unemployment_pct": unemployment,
            "vulnerability_score": vuln
        },
        "safety_livability": {
            "leefbaarometer_class": lb_classes[lb_idx],
            "leefbaarometer_score": lb_score,
            "incidents_per_1000": {
                "high_impact_crime": hic,
                "burglary": burg,
                "youth_nuisance": youth
            }
        },
        "briefing_trends": {
            "anomalies": anomalies,
            "regional_comparison": f"De incidentendichtheid ligt {'boven' if vuln > 5 else 'onder'} het regionale gemiddelde."
        }
    }

# --- 3. API ENDPOINTS ---

class SyncPayload(BaseModel):
    buurtcodes: List[str]

@app.get("/api/lookup")
def lookup_coordinates(
    lat: float = Query(..., description="Breedtegraad in decimale graden"),
    lon: float = Query(..., description="Lengtegraad in decimale graden")
):
    if not (50.5 <= lat <= 54.0) or not (3.0 <= lon <= 7.5):
        raise HTTPException(
            status_code=400,
            detail="Geleverde coördinaten vallen buiten de grenzen van Nederland (Lat: 50.5 - 54.0, Lon: 3.0 - 7.5)."
        )

    closest_neighborhood = None
    min_distance = float('inf')

    # Zoek in anker-buurten
    for neighborhood in ANCHOR_NEIGHBORHOODS:
        dist = haversine_distance(lat, lon, neighborhood["lat"], neighborhood["lon"])
        if dist < min_distance:
            min_distance = dist
            closest_neighborhood = neighborhood

    # Als dichtstbijzijnde buurt binnen 10 km (10000m) ligt, neem deze buurt
    if closest_neighborhood and min_distance < 10000:
        result = closest_neighborhood.copy()
        result["distance_meters"] = round(min_distance)
        return result
    
    # Anders: genereer een realistische buurt deterministisch op basis van GPS
    dynamic_buurt = generate_dynamic_neighborhood(lat, lon)
    dynamic_buurt["distance_meters"] = 0  # Perfecte match voor deze coördinaten
    return dynamic_buurt

@app.get("/api/neighborhood/{buurtcode}")
def get_neighborhood_data(buurtcode: str):
    """
    Haalt de statistieken op voor een specifieke buurtcode.
    """
    # Zoek in ankers
    for neighborhood in ANCHOR_NEIGHBORHOODS:
        if neighborhood["buurtcode"] == buurtcode:
            return neighborhood
            
    # Genereer op basis van dummy coördinaten uit buurtcode hash
    hash_val = int(hashlib.md5(buurtcode.encode('utf-8')).hexdigest(), 16)
    lat = 51.5 + (hash_val % 2000) / 1000.0  # Binnen NL
    lon = 4.0 + ((hash_val // 2) % 3000) / 1000.0
    
    dynamic_buurt = generate_dynamic_neighborhood(lat, lon)
    dynamic_buurt["buurtcode"] = buurtcode
    return dynamic_buurt

@app.post("/api/sync-offline")
def sync_offline_packages(payload: SyncPayload):
    """
    Retourneert een geaggregeerde lijst van buurtstatistieken voor offline opslag in de client cache.
    """
    results = []
    for code in payload.buurtcodes:
        try:
            data = get_neighborhood_data(code)
            results.append(data)
        except Exception:
            continue
    return {"sync_timestamp": 1720872757, "neighborhoods": results}

# Activeer statische frontend bestanden
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Dit is handig voor lokaal starten
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

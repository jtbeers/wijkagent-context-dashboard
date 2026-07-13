# Prototype: Wijkagent Contextueel Dashboard

Dit prototype is ontworpen om Nederlandse wijkagenten en surveillancediensten direct op straat te voorzien van relevante buurtstatistieken, demografische kenmerken en operationele briefings op basis van hun actuele GPS-locatie.

Het systeem haalt openbare data op (zoals CBS StatLine en Leefbaarometer) en aggregeert deze met veiligheidsstatistieken en waarschuwingen (zoals High Impact Crime trends en lokale overlast).

---

## Projectstructuur

Het prototype bestaat uit de volgende onderdelen:

*   `main.py`: De FastAPI-backend die de geolocatie-lookup (coördinaten naar CBS-buurtcode) en data-aggregatie simuleert.
*   `requirements.txt`: Python dependencies (`fastapi`, `uvicorn`, `pydantic`).
*   `static/`: Map met de mobiel-responsieve frontend.
    *   `index.html`: De HTML5-structuur voor het dashboard.
    *   `style.css`: Hoge contrast CSS-styling geoptimaliseerd voor outdoor gebruik.
    *   `app.js`: JavaScript controller die GPS-locaties ophaalt, de API aanroept en de offline cache beheert via IndexedDB.

---

## Architectuur & Privacy (AVG)

Om te voldoen aan de wetgeving (AVG) en richtlijnen voor de Basisregistratie Personen (BRP) en politiesystemen, hanteert dit ontwerp de volgende principes:

1.  **Strict Ontkoppelde Architectuur:** De applicatie communiceert uitsluitend met openbare API's (PDOK/CBS) via een backend-proxy (FastAPI).
2.  **Geen Operationele Gegevenskoppeling:** Er worden geen persoonlijke gegevens of operationele politiesystemen (zoals BVH) direct blootgesteld aan de openbare internet-omgeving.
3.  **Privacy-by-Design:** Verzoeken vanuit het mobiele apparaat bevatten alleen GPS-coördinaten. Er worden geen gebruikersidentificaties, politienummers of operationele case-ID's verstuurd naar openbare API's om profilering te voorkomen.

---

## Offline & Caching Strategie

Politiemensen werken vaak in omgevingen met slecht bereik (kelders, parkeergarages, buitengebieden). Daarom is dit prototype uitgerust met een geavanceerde caching-strategie:

*   **IndexedDB Cache:** Ieder succesvol API-verzoek slaat de buurtgegevens lokaal op de telefoon op.
*   **Offline Locatie-Lookup:** Wanneer de verbinding wegvalt (of de 'Offline Modus' handmatig wordt ingeschakeld), gebruikt de Javascript-controller de HTML5 GPS-coördinaten en berekent via de **Haversine formule** lokaal in de browser welke van de gecachte buurten het dichtstbij is.
*   **Wijkpakket Sync (Pre-fetching):** Agenten kunnen voorafgaand aan hun dienst met één druk op de knop ("Sync Wijkpakket") alle buurtgegevens van hun basisteam synchroniseren en opslaan in de IndexedDB database, zodat ze gegarandeerd offline kunnen werken.

---

## Hoe start u de applicatie?

### 1. Benodigdheden
*   Python 3.8 of hoger geïnstalleerd.

### 2. Setup en Starten
Voer de volgende commando's uit in de terminal:

```bash
# Ga naar de projectmap
cd wijkagent-dashboard

# Maak een virtuele Python omgeving aan
python3 -m venv venv

# Activeer de virtuele omgeving
source venv/bin/activate

# Installeer de benodigde packages
pip install -r requirements.txt

# Start de FastAPI backend
python3 main.py
```

### 3. Openen in Browser
Open uw browser en navigeer naar:
`http://localhost:8000`

---

## Testen van de functionaliteiten

1.  **Locatie Simulatie:** Bovenin het scherm bevinden zich knoppen om direct te wisselen tussen 5 Nederlandse testlocaties (Amsterdam Wallen, Utrecht Overvecht, Rotterdam Bloemhof, Apeldoorn Centrum en Vaassen).
2.  **Live GPS:** Klik op `Real GPS` om de werkelijke locatie van uw apparaat op te vragen en te bekijken welke buurtstatistieken de backend genereert voor die coördinaten.
3.  **Offline Testen:**
    *   Klik eerst op **Sync Wijkpakket** om alle testlocaties lokaal op te slaan.
    *   Klik vervolgens op **Offline Modus** (de verbinding badge verandert naar "Offline").
    *   Klik nu op de verschillende locatietoetsen. U zult zien dat de data onmiddellijk wisselt en geladen wordt uit de lokale IndexedDB database, zonder dat er een netwerkverzoek naar de FastAPI backend wordt gestuurd.

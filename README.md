# BZ-Buddy 🩸

Ein **Blutzucker-Werte-Tracker** (BZ-Werte) für den **Rabbit r1** – gedacht für
die Pflege: Bewohner:innen anlegen und gemessene Blutzuckerwerte samt der
verabreichten Insulin-Einheiten (**i.E.**) dokumentieren.

Die App ist eine eigenständige Web-Anwendung (HTML/CSS/JS, **kein Build-Schritt**)
und läuft komplett **offline** im Webview des r1. Alle Daten werden lokal auf dem
Gerät gespeichert (`localStorage`).

## Funktionen

- **Bewohner:innen verwalten** – anlegen, bearbeiten, löschen (Name, Zimmer, Notiz)
- **BZ-Werte dokumentieren** – Blutzucker, Insulin (i.E.), Messkontext, Zeitpunkt und Notiz
- **Messkontext** als Schnellauswahl (Nüchtern / Vor dem Essen / Nach dem Essen / Vor dem Schlafen)
- **Farbcodierung** der Werte (Hypo / Normal / Hoch / Sehr hoch) – mit zusätzlichem Symbol
- **Verlaufsgrafik** (Sparkline) der letzten Messungen inkl. markiertem Zielbereich
- **Statistik** je Bewohner:in: letzter Wert, Ø der letzten 7 Tage, Anzahl Messungen
- **Tagesgruppierung** der Einträge (Heute, Gestern, …)
- **Schnellauswahl** für Insulin-Einheiten (Chips)
- **Einheit umschaltbar**: mg/dL ↔ mmol/L (intern wird immer in mg/dL gespeichert)
- **Export** der Daten als JSON
- **r1-Hardware**: Scrollrad scrollt die Liste, Seitentaste = Zurück

## Design — „Papier"

Die Oberfläche folgt dem **r1 Creations Design System** (im Geist von Dieter Rams /
BRAUN), Variante **Papier**: warmes Papiergrau statt Schwarz, ehrliche Tinte,
**eine** Akzentfarbe (BRAUN-Orange `#D75A1E`) ausschließlich für das jeweils
aktive Element. Werte erscheinen in **IBM Plex Mono** (tabellarische Ziffern),
Sprache in **Helvetica**. Scharfe Geometrie (Radius 2 px), 4-px-Raster, 16-px-Rand.

| Rolle    | Farbe      |
|----------|------------|
| Papier   | `#E7E4DE`  |
| Fläche   | `#F0EEE9`  |
| Tinte    | `#1B1A17`  |
| Grau     | `#8A867E`  |
| Hairline | `#C7C3BA`  |
| Akzent   | `#D75A1E`  |

## Farbskala (mg/dL)

| Bereich      | Bedeutung   | Farbe        | Symbol |
|--------------|-------------|--------------|--------|
| `< 70`       | Hypo        | Rot `#C0392B`| ▼      |
| `70 – 180`   | Normal      | Grün `#5F7D3B`| ●     |
| `181 – 250`  | Hoch        | Ocker `#C8862E`| ▲    |
| `> 250`      | Sehr hoch   | Oxblut `#9E2B25`| ▲▲  |

Normal-Werte bleiben bewusst **ruhig** – nur abweichende Werte treten farblich
hervor. Das **Symbol** ergänzt die Farbe, damit die Kategorie auch bei
Rot-Grün-Sehschwäche eindeutig bleibt. Die Markenfarbe (Akzent-Orange) ist von
den Wert-Kategorien getrennt und markiert nur Interaktion.

> Hinweis: Die Grenzwerte sind allgemeine Orientierungswerte und ersetzen keine
> ärztliche Vorgabe. Individuelle Zielbereiche bitte gemäß Pflege-/Arztanweisung beachten.

## Nutzung / Test

Einfach im Browser öffnen:

```bash
# im Projektordner
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Im Browser simulieren: `Esc` = Zurück.

## Auf den Rabbit r1 bringen

Die Dateien (`index.html`, `styles.css`, `app.js`) bilden eine in sich
geschlossene Creation/Web-App. Über das r1-Creations-/rabbithole-Tooling als
Web-Creation laden – es ist kein Server und keine Netzwerkverbindung nötig, da
die Daten lokal gehalten werden.

## Dateien

```
index.html   – Grundgerüst & Container
styles.css   – Design (Rabbit-Orange, optimiert für 240×282 px)
app.js       – gesamte Logik & Datenhaltung (localStorage)
```

## Datenschutz

Es werden **keine** Daten an einen Server gesendet. Alles bleibt auf dem Gerät.
Für die Übergabe/Sicherung gibt es einen JSON-Export in den Einstellungen.

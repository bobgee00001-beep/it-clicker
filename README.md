# DevOps Clicker

Ein IT-Themen Idle Clicker Game — inspiriert von Cookie Clicker, aber mit Servern, Tickets und Engineering-Humor.

## Spielziel

Sammle **CPU Cycles** 💻 indem du auf den Server-Button klickst. Kaufe Upgrades für passive Einnahmen, löse Tickets für Bonus-Cycles, und erreiche die **IPO** (Prestige) ab 1 Million Cycles.

## Features

- **Clicker-Mechanik**: Klicke auf "BOOT SERVER" für Cycles
- **Upgrade-Shop**: 5 Kategorien (Hardware, Cloud, AI/Quantum, Click-Boosts, ITSM)
- **Ticket-System**: P3/P2/P1 Tickets spawnen automatisch — löse sie vor Ablauf der SLA!
- **SLA-Strafe**: Abgelaufene Tickets = -20% CPS für 30 Sekunden
- **SEV1 Incident**: Bei >10 offenen Tickets = 10 Sekunden Totalausfall
- **Prestige-System**: IPO ab 1M Cycles → Reset mit permanentem Multiplier
- **Achievements**: 10 Erfolge zu freischalten
- **Save/Load**: LocalStorage-Backup

## Schnellstart

```bash
open index.html
```

Oder mit einem lokalen Server:
```bash
python3 -m http.server 8080
# Dann http://localhost:8080 öffnen
```

## Tech Stack

- Vanilla HTML5 / CSS3 / JavaScript (ES2022)
- Keine externen Abhängigkeiten außer Google Font (JetBrains Mono)
- Dark Terminal Theme mit Matrix-Grün Akzenten

## Spielanleitung

1. **Klicken** für Cycles
2. **Upgrades** kaufen (Rechtes Panel) — passives Einkommen
3. **Tickets** lösen (Linkes Panel) — bevor SLA abläuft!
4. **IPO** starten wenn 1M erreicht — Multiplier steigt
5. **Speichern** regelmäßig mit 💾 Button

## Ticket-Typen

| Typ | Farbe | Reward | SLA | Beispiele |
|-----|-------|--------|-----|-----------|
| P3 Routine | 🟢 | +50 | 45s | Printer Offline, Passwort reset |
| P2 Bug | 🟡 | +150 | 30s | Database Slow, API Timeout |
| P1 Incident | 🔴 | +500 | 15s | Full Disk, Service Down |

## Upgrades

Siehe In-Game Shop für alle 17 Upgrades mit Preisen und Effekten.

---
*DevOps Clicker v1.0 — Built with ☕ and 💚*

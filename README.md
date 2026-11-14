# Core Viewer

Viewer full-screen, config-driven, care afișează secțiuni independente (fiecare într-un `iframe`) într-un scroller cu **scroll-snap** — vertical sau orizontal. Fără framework-uri, fără build tools: HTML/CSS/JS vanilla.

## Structura proiectului (Demo cu 2 sectiuni)

```
core_viewer_test/
├── index.html              # Shell-ul principal (scroller + core_viewer.js)
├── pages.json              # Config: direcția scrollerului + lista de secțiuni
├── core_viewer.js          # Încarcă pages.json și generează iframes
├── core_viewer.css         # Stiluri scroller (scroll-snap, scrollbar ascuns)
├── global.css              # Reset global + standarde comune (importat de toate secțiunile)
├── wheel_event_forward.js  # Snippet JS pentru forward de wheel events către scroller
├── Section1/               # Secțiune: "Blue Square"
│   ├── index.html
│   ├── index.css
│   └── index.js
└── Section2/               # Secțiune: "Red Circle"
    ├── index.html
    ├── index.css
    └── index.js
```

---

## Cum funcționează

1. `index.html` conține un container `#scroller` gol și încarcă `core_viewer.js`.
2. `core_viewer.js` face `fetch("pages.json")` și, pentru fiecare secțiune din `sections`, creează un `<iframe class="section-frame">` cu `src` din `path`.
3. Flag-ul `horizontal` din `pages.json` comută scrollerul între mod vertical (implicit) și orizontal; în mod orizontal, mișcarea verticală a mouse-wheel-ului e convertită în scroll orizontal.
4. Fiecare secțiune e o pagină HTML completă, izolată în iframe, care:
   - importă `../global.css` pentru standardele comune,
   - ocupă 100% din viewport-ul iframe-ului (`100dvh` / `100dvw`),
   - **forward-uze evenimentele de wheel către scroller-ul părinte** (`window.parent.document.getElementById("scroller")`), ca scroll-ul să treacă de la o secțiune la alta.

## Config (`pages.json`)

```json
{
  "horizontal": false,
  "sections": [
    { "id": "sec-1", "title": "Blue Square", "path": "Section1/index.html" },
    { "id": "sec-2", "title": "Red Circle", "path": "Section2/index.html" }
  ]
}
```

- `horizontal` — `false` = scroll vertical (default), `true` = scroll orizontal.
- `sections` — ordinea din listă = ordinea de afișare. `id` e identificator unic, `title` devine `title`-ul iframe-ului, `path` e calea către pagina secțiunii.

## **Adăugarea unei secțiuni noi:** creezi un folder nou (ex. `Section3/`) cu cele 3 fișiere din template și adaugi o intrare în `pages.json`.

## Standarde și convenții

### Standarde globale (`global.css`)

- Reset: `* { margin: 0; padding: 0; box-sizing: border-box; }`
- Aici se definesc standardele comune: culori, fonturi, mărimi etc. (acum doar reset-ul).
- Fiecare secțiune îl importă cu `@import url("../global.css");` ca primă linie din CSS-ul propriu.

### Convenții

- Fiecare secțiune are exact 3 fișiere: `index.html`, `index.css`, `index.js` (optional un json pentru configurație locală).
- Elementul principal dintr-o secțiune e un `<div class="container">` (100% viewport, `overflow: hidden`).
- Elementele vizuale au id-uri descriptive (`#square`, `#circle`).

### JS

- Vanilla JS, fără module ES — scripturi simple încărcate cu `<script src>`.
- `async/await` pentru fetch-ul config-ului.

### Generale

- Fără build tools, fără framework-uri.
- Fără dependințe externe (npm, cdn etc.).
- Dacă folosim librarii externe, le includem local (ex. `jquery.min.js` în folderul sectiunii)
- Codăm cât mai modular și encapsulat posibil

---

# Template pentru o secțiune nouă

**TEMPLATE `SectionN/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Titlu secțiune</title>
    <link rel="stylesheet" href="index.css" />
  </head>
  <body>
    <div class="container">
      <!-- conținutul secțiunii -->
    </div>
    <script src="index.js"></script>
    <script src="../wheel_event_forward.js"></script>
  </body>
</html>
```

**TEMPLATE `SectionN/index.css`**

```css
@import url("../global.css");

.container {
  height: 100dvh;
  width: 100dvw;
  overflow: hidden;
}
```

**TEMPLATE `SectionN/index.js`**

```js
//nothing necessary
```

---

## Rulare

Fără build — se deschide direct `index.html` în browser, sau cu un server local (recomandat, ca să nu dea probleme `fetch`-ul de `pages.json` pe `file://`):
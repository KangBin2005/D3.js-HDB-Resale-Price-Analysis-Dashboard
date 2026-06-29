# 🏠 D3.js HDB Resale Price Analysis Dashboard

## 📖 About This Project

This project was developed for the **IT3382 - Advanced Data Visualisation** assignment, focusing on building an interactive data visualization dashboard using D3.js, HTML, CSS, and JavaScript.

The repository demonstrates how **dynamic and interactive visualisations** can transform complex HDB resale datasets into actionable business insights for property agents to help customers identify suitable HDB resale locations in Singapore.

---

## 🎯 Key Project Tasks Completed

- **Data Engineering:** Curated and cleaned 6 datasets from data.gov.sg, including HDB resale prices, MRT stations, schools, supermarkets, eateries, and tertiary institutions, enriched with geographical coordinates.
- **Interactive Visualisation Engine:** Built 5 core D3.js visualisations (geospatial map, bar chart, scatter plots, donut chart) with dynamic filtering capabilities.
- **Dashboard Architecture:** Designed a full-stack dashboard with a sticky filter sidebar, 4 KPI cards, and a responsive card-based layout for optimal user experience.
- **Cross-Filtering Integration:** Implemented linked views where actions in one chart (brush selection, click, hover) update all other visualisations in real-time.
- **Advanced D3 Features:** Engineered interactive zoom/pan on the Singapore map, proximity radius rings, amenity layer toggles, and sortable bar charts.
- **Business Insights Delivery:** Created a tool to support property agents in client consultations by providing insights on pricing trends, amenity proximity, and flat type distribution.

---

## 📊 Datasets Used

| # | Dataset | Description |
|---|---------|-------------|
| 1 | `hdb_with_coords_recent.csv` | Recent HDB resale prices (Jan 2025 - Mar 2026) with coordinates |
| 2 | `mrt_lrt_stations_2025-01-14.csv` | MRT and LRT Stations in Singapore |
| 3 | `supermarkets_clean.csv` | Supermarkets and Locations in Singapore |
| 4 | `schools_with_coords_fixed.csv` | Primary, Secondary schools and Junior Colleges |
| 5 | `healthier_eateries_clean.csv` | Healthier Eateries dataset |
| 6 | `tertiary_institutions.csv` | ITE, Polytechnics, and Universities |
| 7 | `sg.json` | Singapore GeoJSON for map boundaries |

*All datasets sourced from data.gov.sg and enriched as necessary*

---

## 🎮 Interactive Features

| Feature | Description |
|---------|-------------|
| **Multi-Select Dropdowns** | Filter by town, flat model, and flat type with Ctrl+Click support |
| **Price Range Slider** | Dynamic price filtering with real-time value display |
| **Map Zoom & Pan** | Scroll to zoom, drag to pan on geospatial map |
| **Amenity Toggles** | Show/hide MRT, schools, supermarkets, eateries, and tertiary institutions |
| **Tooltips** | Hover for detailed information on all charts |
| **Brush Selection** | Click and drag on price-area scatter plot to filter all other charts |
| **Linked Views** | Cross-filtering across all visualisations |
| **Click to Filter** | Click on bar chart or donut chart segments to filter by category |
| **Sort Controls** | Sort bar chart by lowest or highest price |
| **Reset Workspace** | Reset all filters with a single button |
| **Proximity Rings** | Show 1km radius on map when hovering HDB blocks |

---

## 📈 Dashboard Visualisations

| # | Visualisation | Purpose |
|---|---------------|---------|
| 1 | **Geospatial Map** | HDB block locations with proximity rings and amenity overlays |
| 2 | **Bar Chart** | Average price distribution by town (sortable ascending/descending) |
| 3 | **Scatter Plot** | Resale price vs floor area with interactive brush |
| 4 | **Donut Chart** | Flat mix distribution with click-to-filter functionality |
| 5 | **Scatter Plot** | Price vs remaining lease |

### KPI Dashboard

| KPI | Description |
|-----|-------------|
| **Avg Transacted Price** | Mean resale price of filtered data |
| **Unit Value / SQM** | Average price per square metre |
| **Total Matched Records** | Count of transactions matching current filters |
| **Mean Remaining Lease** | Average remaining lease years |

---

## 💻 Tech Stack

- **Core Languages:** HTML5, CSS3, JavaScript
- **Visualisation Library:** D3.js v7
- **UI Framework:** Bootstrap 3.3.7
- **Custom Styling:** Plus Jakarta Sans, CSS custom properties
- **Data Format:** CSV, GeoJSON

---

## 🔑 Key D3 Features Implemented

| Feature | Description |
|---------|-------------|
| **d3.csv / d3.json** | Data loading and parsing |
| **d3.scaleOrdinal** | Categorical color mapping for flat types |
| **d3.geoMercator** | Projection for Singapore map |
| **d3.zoom** | Interactive zoom and pan on map |
| **d3.brush** | Interactive brush selection on scatter plot |
| **d3.pie / d3.arc** | Donut chart generation |
| **d3.transition** | Smooth animations on updates |
| **d3.scaleLinear / d3.scaleBand** | Axis scales for bar and scatter charts |
| **d3.geoDistance** | Haversine formula for 1km proximity calculations |
| **d3.rollup** | Data aggregation for flat type distribution |

---

## 📁 Repository Structure
```text
│
├── index.html
│ └── Main dashboard HTML file with embedded layout structure
│
├── css/
│ ├── style.css
│ │ └── Custom dashboard styling with CSS variables
│ └── bootstrap.min.css
│ └── Bootstrap 3.3.7 framework
│
├── js/
│ └── main.js
│ └── All D3 visualisation logic, data loading, and interactivity
│
├── data/
│ ├── hdb_with_coords_recent.csv
│ ├── mrt_lrt_stations_2025-01-14.csv
│ ├── supermarkets_clean.csv
│ ├── schools_with_coords_fixed.csv
│ ├── healthier_eateries_clean.csv
│ ├── tertiary_institutions.csv
│ └── sg.json
│ └── Singapore GeoJSON for map boundaries
│
├── img/
│ └── hdb_logo.jpg
│ └── HDB Logo for navbar branding
│
└── README.md
└── This file
```
---

## 🚀 How to Run the Dashboard

1. **Install Visual Studio Code** from https://code.visualstudio.com/ if not already installed.

2. **Install the Live Server Extension:**
   - Open VS Code
   - Click on the Extensions icon in the left sidebar (or press `Ctrl+Shift+X`)
   - Search for "Live Server"
   - Click "Install" on the extension by Ritwick Dey

3. **Open the Project Folder:**
   - In VS Code, click `File` > `Open Folder`
   - Navigate to and select the `D3-HDB-Resale-Dashboard` folder
   - Click "Select Folder"

4. **Launch the Dashboard:**
   - In the Explorer panel (left sidebar), locate `index.html`
   - **Right-click** on `index.html`
   - Select **"Open with Live Server"** from the context menu
   - A new browser tab will automatically open with the dashboard running

> **Note:** Live Server is required for full functionality. Opening the file directly in a browser may cause CORS restrictions when loading local CSV data files.




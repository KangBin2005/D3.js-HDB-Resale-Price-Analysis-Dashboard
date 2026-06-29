// ============================================================
// HDB RESALE & AMENITY 360° ANALYTICS DASHBOARD
// ============================================================

// ============================================================
// 1. CONFIGURATION & CONSTANTS
// ============================================================

/**
 * CONFIG - Central configuration object for the entire dashboard
 * Contains color scales, display labels, file paths, and chart dimensions
 */
const CONFIG = {
    colors: {
        // D3 ordinal color scale for flat types with consistent color mapping
        flatTypes: d3.scaleOrdinal()
            .domain(["1-ROOM", "2-ROOM", "3-ROOM", "4-ROOM", "5-ROOM", "EXECUTIVE", "MULTI-GENERATION"])
            .range(["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#AF52DE", "#FF2D55"]),
        // Color mapping for different amenity types on the map
        amenities: {
            mrt: "#3268a8",
            schools: "#438c5a",
            supermarkets: "#c77b24",
            eateries: "#bb4a4a",
            tertiary: "#7a5aa6"
        }
    },
    // Human-readable labels for amenity types
    labels: {
        mrt: "MRT & LRT Stations",
        schools: "Schools",
        tertiary: "Tertiary",
        supermarkets: "Supermarkets",
        eateries: "Eateries"
    },
    // Paths to all data files used in the dashboard
    files: {
        hdb: "data/hdb_with_coords_recent.csv",
        mrt: "data/mrt_lrt_stations_2025-01-14.csv",
        supermarkets: "data/supermarkets_clean.csv",
        schools: "data/schools_with_coords_fixed.csv",
        eateries: "data/healthier_eateries_clean.csv",
        tertiary: "data/tertiary_institutions.csv",
        singaporeGeo: "data/sg.json"
    },
    // Fixed heights for various chart types to maintain consistency
    chartHeight: { priceArea: 400, priceBar: 350, leaseScatter: 350 },
    // Performance limits - sample data to avoid browser lag with large datasets
    mapSampleLimit: 1500,
    brushLimit: 800
};

/**
 * STATE - Manages the application's interactive state
 * Tracks active amenities, brushed data selection, and filter selections
 */
const state = {
    activeAmenities: ["mrt"],  // Currently visible amenity layers on map
    brushedData: [],           // Data points selected via brush on price-area chart
    selectedFlatType: "ALL",   // Currently filtered flat type
    selectedTown: "ALL"        // Currently filtered town
};

// Global variables accessible across all functions
let fullData = [], filteredData = [], amenities = [];
let townSelect, modelSelect, typeSelect, budgetSpan;
let mapZoom = null, mapSvgSelection = null;
let minBudget = 300000, maxBudget = 1500000;

// ============================================================
// 2. UTILITY FUNCTIONS
// ============================================================

/**
 * getMargins - Returns consistent margin configuration for charts
 * param {string} chartType - 'bar' for bar charts, defaults to scatter
 * returns {Object} Margin object with top, right, bottom, left values
 */
const getMargins = (chartType) => ({
    top: 20, right: 20, bottom: chartType === 'bar' ? 85 : 55, left: 75
});

/**
 * parseLease - Extracts total years from lease string (e.g., "99 years 6 months")
 * param {string} str - Lease string from HDB data
 * returns {number} Total years as decimal (e.g., 99.5)
 */
const parseLease = (str) => {
    if (!str) return 0;
    const years = str.match(/(\d+) years/)?.[1] || 0;
    const months = str.match(/(\d+) months/)?.[1] || 0;
    return +years + (+months / 12);
};

/**
 * getActiveData - Returns current dataset considering brush selection
 * If brush is active, returns brushed data; otherwise returns all filtered data
 * returns {Array} Active data points for chart rendering
 */
const getActiveData = () => state.brushedData.length ? state.brushedData : filteredData;

/**
 * isWithin1Km - Checks if an amenity is within 1km of an HDB block
 * Uses Haversine formula via d3.geoDistance
 * param {number} hdbLat - HDB block latitude
 * param {number} hdbLon - HDB block longitude
 * param {number} aLat - Amenity latitude
 * param {number} aLon - Amenity longitude
 * returns {boolean} True if within 1km radius
 */
const isWithin1Km = (hdbLat, hdbLon, aLat, aLon) =>
    d3.geoDistance([hdbLon, hdbLat], [aLon, aLat]) <= 1 / 6371;

/**
 * cleanAmenity - Creates standardized amenity object from CSV row
 * param {Object} d - CSV row data
 * param {string} type - Amenity type (mrt, schools, etc.)
 * param {string} name - Amenity name field
 * param {string} lat - Latitude field name
 * param {string} lon - Longitude field name
 * returns {Object} Standardized amenity object
 */
const cleanAmenity = (d, type, name, lat, lon) => ({ type, name, lat: +lat, lon: +lon });

// ============================================================
// 3. DATA LOADING
// ============================================================

/**
 * Promise.all - Loads all data files concurrently
 * Processes HDB data with parsed numerical values
 * Filters out records with invalid coordinates or prices
 * Initializes dashboard after all data is loaded
 */
Promise.all([
    d3.csv(CONFIG.files.hdb),
    d3.csv(CONFIG.files.mrt, d => cleanAmenity(d, "mrt", d.station_name, d.latitude, d.longitude)),
    d3.csv(CONFIG.files.schools, d => cleanAmenity(d, "schools", d.school_name, d.lat, d.lon)),
    d3.csv(CONFIG.files.supermarkets, d => cleanAmenity(d, "supermarkets", d.LIC_NAME, d.lat, d.lon)),
    d3.csv(CONFIG.files.eateries, d => cleanAmenity(d, "eateries", d.eatery_name, d.lat, d.lon)),
    d3.csv(CONFIG.files.tertiary, d => cleanAmenity(d, "tertiary", d.name, d.lat, d.lon)),
    d3.json(CONFIG.files.singaporeGeo)
]).then(([hdbRaw, mrt, schools, supermarkets, eateries, tertiary, geojson]) => {

    // Process HDB data: convert strings to numbers and parse lease
    hdbRaw.forEach(d => {
        d.floor_area_sqm = Number(d.floor_area_sqm);
        d.resale_price = Number(d.resale_price);
        d.lat = Number(d.lat || d.latitude);
        d.lon = Number(d.lon || d.longitude);
        d.lease_years = parseLease(d.remaining_lease);
    });

    // Filter out records with invalid price or coordinates
    fullData = hdbRaw.filter(d => Number.isFinite(d.resale_price) && Number.isFinite(d.lat) && Number.isFinite(d.lon));
    filteredData = fullData.slice();

    // Combine all amenities and filter invalid entries
    amenities = [...mrt, ...schools, ...supermarkets, ...eateries, ...tertiary]
        .filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lon));

    // Store geojson globally for map rendering
    window.singaporeGeoMapData = geojson;

    // Initialize dashboard after data loads
    initDashboard();
}).catch(err => console.error("INITIALIZATION ERROR:", err));

// ============================================================
// 4. DASHBOARD INITIALIZATION
// ============================================================

/**
 * initDashboard - Main initialization function
 * Sets up DOM references, dropdowns, amenity toggles, event listeners
 * Initializes price slider with min/max from data
 * Sets up reset button and map zoom controls
 */
function initDashboard() {
    // DOM references
    townSelect = document.getElementById('town-select');
    modelSelect = document.getElementById('model-select');
    typeSelect = document.getElementById('type-select');
    budgetSpan = document.getElementById('budget-value');

    initFilterDropdowns();
    initAmenityToggles();

    // Event listeners for filter changes
    townSelect.addEventListener('change', () => { state.selectedTown = townSelect.value; applyFilters(); });
    modelSelect.addEventListener('change', applyFilters);
    typeSelect.addEventListener('change', applyFilters);
    document.querySelectorAll('input[name="sortOrder"]').forEach(r => r.addEventListener('change', drawPriceBarChart));

    // Price slider setup with data-driven min/max
    const maxP = d3.max(fullData, d => d.resale_price) || 1500000;
    const minP = d3.min(fullData, d => d.resale_price) || 300000;
    minBudget = Math.floor(minP / 50000) * 50000;
    maxBudget = Math.ceil(maxP / 50000) * 50000;

    // jQuery UI price range slider
    $("#price-range-slider").slider({
        range: true,
        min: minBudget,
        max: maxBudget,
        step: 50000,
        values: [minBudget, maxBudget],
        slide: function (e, ui) {
            minBudget = ui.values[0];
            maxBudget = ui.values[1];
            if (budgetSpan) budgetSpan.innerText = '$' + minBudget.toLocaleString() + ' - $' + maxBudget.toLocaleString();
            applyFilters();
        }
    });
    if (budgetSpan) budgetSpan.innerText = '$' + minBudget.toLocaleString() + ' - $' + maxBudget.toLocaleString();

    // Reset workspace button - restores all filters to default state
    d3.select("#reset-filters-btn").on("click", () => {
        // Reset ALL multi-select dropdowns to "ALL" only
        const resetSelect = (select) => {
            if (!select) return;
            // Deselect all options first
            Array.from(select.options).forEach(opt => opt.selected = false);
            // Select only the "ALL" option
            const allOption = Array.from(select.options).find(opt => opt.value === "ALL");
            if (allOption) allOption.selected = true;
            // Trigger change event
            select.dispatchEvent(new Event('change'));
        };

        resetSelect(townSelect);
        resetSelect(modelSelect);
        resetSelect(typeSelect);

        state.selectedFlatType = "ALL";
        state.selectedTown = "ALL";

        // Reset price slider
        const maxP = d3.max(fullData, d => d.resale_price) || 1500000;
        const minP = d3.min(fullData, d => d.resale_price) || 300000;
        minBudget = Math.floor(minP / 50000) * 50000;
        maxBudget = Math.ceil(maxP / 50000) * 50000;
        $("#price-range-slider").slider("values", [minBudget, maxBudget]);
        if (budgetSpan) budgetSpan.innerText = '$' + minBudget.toLocaleString() + ' - $' + maxBudget.toLocaleString();

        // Reset amenities to only MRT
        state.activeAmenities = ["mrt"];
        state.brushedData = [];
        d3.select("#amenityToggles").selectAll("input").property("checked", function () { return this.value === "mrt"; });

        applyFilters();
        if (mapSvgSelection && mapZoom) mapSvgSelection.transition().duration(400).call(mapZoom.transform, d3.zoomIdentity);
    });

    // Map zoom control buttons
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        if (mapSvgSelection && mapZoom) mapSvgSelection.transition().duration(250).call(mapZoom.scaleBy, 1.4);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        if (mapSvgSelection && mapZoom) mapSvgSelection.transition().duration(250).call(mapZoom.scaleBy, 0.7);
    });
    document.getElementById('btn-center').addEventListener('click', () => {
        if (mapSvgSelection && mapZoom) mapSvgSelection.transition().duration(400).call(mapZoom.transform, d3.zoomIdentity);
    });

    updateAllCharts();
}

// ============================================================
// 5. KPI UPDATER
// ============================================================

/**
 * updateKPIs - Updates the four KPI boxes with current data
 * Computes mean price, price per sqm, total records, and mean lease
 * Displays default values when no data is available
 */
function updateKPIs() {
    const data = getActiveData();
    const ids = ['kpi-avg-price', 'kpi-avg-psm', 'kpi-total-blocks', 'kpi-avg-lease'];
    const defaults = ['$0', '$0', '0', '0 Yrs'];

    if (!data.length) {
        ids.forEach((id, i) => document.getElementById(id).innerText = defaults[i]);
        return;
    }

    const avgPrice = d3.mean(data, d => d.resale_price);
    const avgPsm = d3.mean(data, d => d.resale_price / d.floor_area_sqm);
    const avgLease = d3.mean(data, d => d.lease_years);

    document.getElementById('kpi-avg-price').innerText = '$' + Math.round(avgPrice).toLocaleString();
    document.getElementById('kpi-avg-psm').innerText = '$' + Math.round(avgPsm).toLocaleString();
    document.getElementById('kpi-total-blocks').innerText = data.length.toLocaleString();
    document.getElementById('kpi-avg-lease').innerText = Math.round(avgLease) + ' Yrs';
}

// ============================================================
// 6. FILTER DROPDOWNS (MULTI-SELECT FOR ALL THREE)
// ============================================================

/**
 * initFilterDropdowns - Creates and populates multi-select dropdowns
 * Each dropdown has an "ALL" option plus individual values from data
 * Styled with proper height and scroll for multi-selection
 * Supports Ctrl+Click for multi-select (browser native)
 */
function initFilterDropdowns() {
    if (!townSelect) return;

    const populateMultiSelect = (select, data, allLabel) => {
        // Clear existing options
        select.innerHTML = '';

        // Add "ALL" option
        const allOption = new Option(allLabel, "ALL");
        allOption.selected = true;
        select.appendChild(allOption);

        // Add individual options
        [...new Set(data)].sort().forEach(v => {
            const option = new Option(v, v);
            select.appendChild(option);
        });

        // Enable multi-select with proper styling
        select.multiple = true;
        select.size = Math.min(8, [...new Set(data)].length + 1);
        select.style.height = 'auto';
        select.style.minHeight = '120px';
        select.style.width = '100%';
        select.style.padding = '4px';
        select.style.border = '1px solid #e2e8f0';
        select.style.borderRadius = '6px';
        select.style.backgroundColor = 'white';

        // Style options
        select.querySelectorAll('option').forEach(opt => {
            opt.style.padding = '6px 8px';
            opt.style.margin = '2px 0';
            opt.style.borderRadius = '4px';
            opt.style.cursor = 'pointer';
        });
    };

    populateMultiSelect(townSelect, fullData.map(d => d.town), 'ALL TOWNS');
    populateMultiSelect(modelSelect, fullData.map(d => d.flat_model), 'All Models');
    populateMultiSelect(typeSelect, fullData.map(d => d.flat_type), 'All Types');

    // Add event listeners for multi-select changes
    townSelect.addEventListener('change', applyFilters);
    modelSelect.addEventListener('change', applyFilters);
    typeSelect.addEventListener('change', applyFilters);
}

// ============================================================
// 7. AMENITY TOGGLES
// ============================================================

/**
 * initAmenityToggles - Creates checkbox toggles for map layers
 * Each amenity type gets a toggle with color indicator
 * Toggling updates state.activeAmenities and redraws map
 */
function initAmenityToggles() {
    const container = d3.select("#amenityToggles");
    if (container.empty()) return;
    container.selectAll("*").remove();

    Object.entries(CONFIG.labels).forEach(([key, label]) => {
        const wrapper = container.append("label").attr("class", "amenity-toggle-label");
        wrapper.append("input")
            .attr("type", "checkbox").attr("value", key)
            .property("checked", state.activeAmenities.includes(key))
            .on("change", function () {
                this.checked ? state.activeAmenities.push(key) : state.activeAmenities = state.activeAmenities.filter(v => v !== key);
                drawMap();
            });
        wrapper.append("span")
            .style("display", "inline-block").style("width", "10px").style("height", "10px")
            .style("border-radius", "50%").style("background", CONFIG.colors.amenities[key])
            .style("margin-right", "6px");
        wrapper.append("span").text(label);
    });
}

// ============================================================
// 8. FILTER APPLICATION (UPDATED WITH PROPER MULTI-SELECT)
// ============================================================

/**
 * applyFilters - Applies all active filters to the dataset
 * Supports multi-select for town, model, and flat type
 * Updates filteredData based on: town, model, type, price range
 * Updates chart subtitles with filter badges showing current selections
 * Resets brush selection and refreshes all charts
 */
function applyFilters() {
    // Get selected values from multi-select dropdowns
    const selectedTowns = townSelect ? Array.from(townSelect.selectedOptions).map(o => o.value) : ["ALL"];
    const selectedModels = modelSelect ? Array.from(modelSelect.selectedOptions).map(o => o.value) : ["ALL"];
    const selectedTypes = typeSelect ? Array.from(typeSelect.selectedOptions).map(o => o.value) : ["ALL"];

    // Update state for backward compatibility
    state.selectedTown = selectedTowns.includes("ALL") ? "ALL" : selectedTowns[0] || "ALL";
    state.selectedFlatType = selectedTypes.includes("ALL") ? "ALL" : selectedTypes[0] || "ALL";

    filteredData = fullData.filter(d => {
        // Town filter: include if "ALL" is selected OR town is in selected towns
        const townMatch = selectedTowns.includes("ALL") || selectedTowns.includes(d.town);

        // Model filter: include if "ALL" is selected OR model is in selected models
        const modelMatch = selectedModels.includes("ALL") || selectedModels.includes(d.flat_model);

        // Type filter: include if "ALL" is selected OR type is in selected types
        const typeMatch = selectedTypes.includes("ALL") || selectedTypes.includes(d.flat_type);

        return townMatch &&
            modelMatch &&
            typeMatch &&
            d.resale_price >= minBudget &&
            d.resale_price <= maxBudget;
    });

    state.brushedData = [];

    // Build filter labels with multi-select info for display
    const townLabel = selectedTowns.includes("ALL") ? "All Towns" :
        (selectedTowns.length === 1 ? `Town: ${selectedTowns[0]}` : `${selectedTowns.length} Towns Selected`);
    const modelLabel = selectedModels.includes("ALL") ? "All Models" :
        (selectedModels.length === 1 ? `Model: ${selectedModels[0]}` : `${selectedModels.length} Models Selected`);
    const typeLabel = selectedTypes.includes("ALL") ? "All Flat Types" :
        (selectedTypes.length === 1 ? `Type: ${selectedTypes[0]}` : `${selectedTypes.length} Types Selected`);

    // Update all chart subtitles with filter information
    updateChartSubtitle('bar-chart-title', `Filters: ${townLabel} • ${modelLabel} • ${typeLabel}`);
    updateChartSubtitle('area-chart-title', `Filters: ${townLabel} • ${modelLabel} • ${typeLabel}`);
    updateChartSubtitle('donut-chart-title', `Filters: ${townLabel} • ${modelLabel}`);
    updateChartSubtitle('lease-scatter-title', `Filters: ${townLabel} • ${modelLabel} • ${typeLabel}`);

    updateAllCharts();
}

// ============================================================
// 9. CHART UPDATER (ADDED FILTER BADGES)
// ============================================================

/**
 * updateChartSubtitle - Creates filter badge display under chart titles
 * Parses filter text and generates styled badges showing active filters
 * param {string} parentId - ID of the parent element containing the chart title
 * param {string} text - Filter text to display as badges
 */
function updateChartSubtitle(parentId, text) {
    const title = document.getElementById(parentId);
    if (!title) return;

    let sub = title.parentNode.querySelector('.title-filter-subtitle');
    if (!sub) {
        sub = document.createElement('div');
        sub.className = 'title-filter-subtitle d-flex flex-wrap align-items-center mt-1';
        title.parentNode.appendChild(sub);
    }

    sub.innerHTML = '';

    // Parse the filter text and create badges
    const filterText = text.replace(/Filters:\s*|Filtering on:\s*/i, '');
    const parts = filterText.split('•').map(s => s.trim());

    parts.forEach(s => {
        if (!s) return;
        const badge = document.createElement('span');
        badge.className = 'filter-badge-status';

        // Apply different styling based on filter type
        if (s.toLowerCase().includes('all') || s.includes('Selected')) {
            if (s.includes('Selected')) {
                badge.className += ' active'; // Multiple items selected
                badge.style.backgroundColor = '#147c7f';
                badge.style.color = 'white';
            } else {
                badge.className += ' default';
                badge.style.backgroundColor = '#f1f5f9';
                badge.style.color = '#64748b';
            }
        } else {
            badge.className += ' active';
            badge.style.backgroundColor = '#147c7f';
            badge.style.color = 'white';
        }

        badge.innerText = s;
        sub.appendChild(badge);
    });
}

/**
 * updateAllCharts - Convenience function to refresh all visualizations
 * Called after any data change (filters, brush, etc.)
 */
function updateAllCharts() {
    updateKPIs();
    drawMap();
    drawPriceAreaChart();
    drawPriceBarChart();
    drawLeaseScatter();
    drawDonutChart();
}

// ============================================================
// 10. DRAW MAP 
// ============================================================

/**
 * drawMap - Renders the interactive Singapore map with HDB points and amenities
 * Features:
 * - Zoom and pan with D3 zoom behavior
 * - HDB dots colored by flat type
 * - Amenity toggles for different layers
 * - Hover tooltips showing property details
 * - Proximity ring showing 1km radius on hover
 * - Legend showing flat type colors
 */
function drawMap() {
    const container = d3.select("#map-canvas");
    if (container.empty()) return;

    container.selectAll("*").remove();
    const bounds = container.node().getBoundingClientRect();
    const w = Math.max(200, bounds.width);
    const h = Math.max(280, bounds.height || 320);

    if (!window.singaporeGeoMapData) {
        container.append('div').style('padding', '60px 10px').style('text-align', 'center')
            .style('color', '#94a3b8').text('Map geography data unavailable');
        return;
    }

    container.style("position", "relative");

    const svgEl = container.append("svg").attr("width", w).attr("height", h);
    mapSvgSelection = svgEl;

    // Get current filter state for display
    const selectedTowns = townSelect ? Array.from(townSelect.selectedOptions).map(o => o.value) : ["ALL"];
    const selectedModels = modelSelect ? Array.from(modelSelect.selectedOptions).map(o => o.value) : ["ALL"];
    const selectedTypes = typeSelect ? Array.from(typeSelect.selectedOptions).map(o => o.value) : ["ALL"];
    
    const filterInfo = [];
    if (!selectedTowns.includes("ALL")) filterInfo.push(`${selectedTowns.length} Towns`);
    if (!selectedModels.includes("ALL")) filterInfo.push(`${selectedModels.length} Models`);
    if (!selectedTypes.includes("ALL")) filterInfo.push(`${selectedTypes.length} Types`);
    
    const filterText = filterInfo.length ? `Filtered: ${filterInfo.join(' • ')}` : 'Showing: All Data';

    // Instruction text
    svgEl.append("text").attr("class", "chart-instruction-cue").attr("x", 15).attr("y", 25)
        .style("font-size", "11px").style("fill", "#475569").style("font-weight", "500")
        .text(`Scroll to Zoom • Drag to Pan • Hover for details • ${filterText}`);

    const svg = svgEl.append("g").attr("class", "map-zoom-container");

    // D3 Zoom behavior with scale extent
    const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", e => {
        svg.attr("transform", e.transform);
        // Scale dot sizes inversely to zoom level for consistent appearance
        const k = Math.sqrt(e.transform.k);
        svg.selectAll(".hdb-dot").attr("r", 2.5 / k).attr("stroke-width", 0.5 / k);
        svg.selectAll(".amenity-dot").attr("r", 6 / k).attr("stroke-width", 1.5 / k);
    });
    mapZoom = zoom;
    svgEl.call(zoom).call(zoom.transform, d3.zoomIdentity);

    // Map control buttons at bottom
    const strip = container.append("div").attr("class", "map-action-strip d-flex justify-content-center align-items-center")
        .style("position", "absolute").style("bottom", "12px").style("left", "0")
        .style("width", "100%").style("gap", "6px").style("z-index", "10");

    const createBtn = (label, fn) => strip.append("button").text(label)
        .style("padding", "4px 10px").style("background", "#fff").style("border", "1px solid #cbd5e1")
        .style("border-radius", "4px").style("color", "#475569").style("font-size", "12px")
        .style("font-weight", "500").style("cursor", "pointer").style("box-shadow", "0 1px 2px rgba(0,0,0,0.05)")
        .style("transition", "background 0.15s ease")
        .on("mouseover", function () { d3.select(this).style("background", "#f1f5f9"); })
        .on("mouseout", function () { d3.select(this).style("background", "#fff"); })
        .on("click", fn);

    createBtn("Zoom in", () => mapSvgSelection?.transition().duration(250).call(mapZoom.scaleBy, 1.4));
    createBtn("Zoom out", () => mapSvgSelection?.transition().duration(250).call(mapZoom.scaleBy, 0.7));
    createBtn("Pan left", () => mapSvgSelection?.transition().duration(200).call(mapZoom.translateBy, 60, 0));
    createBtn("Pan right", () => mapSvgSelection?.transition().duration(200).call(mapZoom.translateBy, -60, 0));
    createBtn("Center", () => mapSvgSelection?.transition().duration(400).call(mapZoom.transform, d3.zoomIdentity));

    // Mercator projection fitted to Singapore
    const projection = d3.geoMercator().fitExtent([[40, 50], [w - 40, h - 45]], window.singaporeGeoMapData);
    const pathGen = d3.geoPath().projection(projection);

    // Draw Singapore base map polygons
    svg.append("g").selectAll("path").data(window.singaporeGeoMapData.features).join("path")
        .attr("d", pathGen).attr("fill", "#f8fafc").attr("stroke", "#e2e8f0").attr("stroke-width", 1.2);

    // Proximity ring (shown on hover)
    const ring = svg.append("circle")
        .attr("fill", "rgba(15, 98, 100, 0.05)").attr("stroke", "#0f6264")
        .attr("stroke-width", 1.5).attr("stroke-dasharray", "4,4")
        .style("opacity", 0).style("pointer-events", "none");

    // Region labels
    svg.append("g").attr("class", "region-labels-layer").style("pointer-events", "none")
        .selectAll("text").data(window.singaporeGeoMapData.features).join("text")
        .attr("transform", d => {
            let c = pathGen.centroid(d);
            if (!c || isNaN(c[0])) {
                const b = d3.geoBounds(d);
                c = projection([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
            }
            return `translate(${c[0]}, ${c[1]})`;
        })
        .attr("text-anchor", "middle").attr("dy", ".35em")
        .style("font-size", "11px").style("font-weight", "600").style("fill", "#64748b")
        .style("text-shadow", "1px 1px 0px #fff, -1px -1px 0px #fff, 1px -1px 0px #fff, -1px 1px 0px #fff")
        .text(d => d.properties.name || "");

    // HDB dots - sample for performance
    const step = Math.ceil(filteredData.length / CONFIG.mapSampleLimit);
    const sample = filteredData.filter((_, i) => i % step === 0).slice(0, CONFIG.mapSampleLimit);

    svg.append("g").selectAll("circle").data(sample).join("circle")
        .attr("class", "hdb-dot")
        .attr("cx", d => { const p = projection([d.lon, d.lat]); return p ? p[0] : 0; })
        .attr("cy", d => { const p = projection([d.lon, d.lat]); return p ? p[1] : 0; })
        .attr("r", 3).attr("fill", d => CONFIG.colors.flatTypes(d.flat_type))
        .attr("stroke", "#fff").attr("stroke-width", 0.5).attr("opacity", 0.9)
        .style("cursor", "pointer")
        .on("mousemove", function (e, d) {
            // Show proximity ring
            const c = projection([d.lon, d.lat]);
            const px = Math.abs(projection([d.lon + 0.009, d.lat])[0] - c[0]);
            ring.attr("cx", c[0]).attr("cy", c[1]).attr("r", px).style("opacity", 1);
            // Dim amenities outside 1km radius
            svg.selectAll(".amenity-dot").style("transition", "opacity 0.1s ease")
                .style("opacity", a => isWithin1Km(d.lat, d.lon, a.lat, a.lon) ? 1 : 0.12);
            // Show tooltip with property details
            d3.select('#global-tooltip').style('opacity', 0.95)
                .html(`<strong>${d.block || ""} ${d.street_name || d.street || "Address"}</strong><br>
                    <span style="color:${CONFIG.colors.flatTypes(d.flat_type)}; font-weight:700;">${d.flat_type}</span> • ${d.flat_model}<br>
                    Price: $${Math.round(d.resale_price).toLocaleString()}<br>
                    Floor Area: ${d.floor_area_sqm} sqm<br>
                    Lease Remaining: ${d.lease_years.toFixed(1)} yrs`)
                .style('left', (e.pageX + 14) + 'px').style('top', (e.pageY + 14) + 'px');
        })
        .on("mouseleave", () => {
            ring.style("opacity", 0);
            svg.selectAll(".amenity-dot").style("opacity", 1);
            d3.select('#global-tooltip').style('opacity', 0);
        });

    // Map legend for flat types
    const types = [...new Set(sample.map(d => d.flat_type))].slice(0, 6);
    const legend = svg.append("g").attr("class", "map-legend").attr("transform", `translate(${w - 155}, 45)`).style("pointer-events", "none");
    legend.append("rect").attr("width", 145).attr("height", Math.min(types.length * 24 + 16, 180))
        .attr("fill", "rgba(255,255,255,0.92)").attr("rx", 6).style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.06))");
    legend.append("text").attr("x", 10).attr("y", 16).style("font-size", "9px").style("font-weight", "700")
        .style("fill", "#475569").style("letter-spacing", "0.5px").style("text-transform", "uppercase").text("Flat Types");
    types.forEach((type, i) => {
        const y = 34 + i * 20;
        legend.append("circle").attr("cx", 14).attr("cy", y - 2).attr("r", 4.5).attr("fill", CONFIG.colors.flatTypes(type));
        legend.append("text").attr("x", 24).attr("y", y + 1).style("font-size", "9px").style("font-weight", "500")
            .style("fill", "#475569").text(type);
    });

    // Draw amenity points with toggles
    const activeAmenities = amenities.filter(d => state.activeAmenities.includes(d.type));
    svg.append("g").selectAll(".amenity-dot").data(activeAmenities).join("circle")
        .attr("class", "amenity-dot")
        .attr("cx", d => { const p = projection([d.lon, d.lat]); return p ? p[0] : 0; })
        .attr("cy", d => { const p = projection([d.lon, d.lat]); return p ? p[1] : 0; })
        .attr("r", 6).attr("fill", d => CONFIG.colors.amenities[d.type] || "#e67e22")
        .attr("stroke", "#fff").attr("stroke-width", 1.5)
        .style("pointer-events", "auto")
        .on("mousemove", function (e, d) {
            d3.select('#global-tooltip').style('opacity', 0.95)
                .html(`<strong>${d.name}</strong><br><span style="text-transform:capitalize;font-weight:700;color:${CONFIG.colors.amenities[d.type]}">${d.type}</span>`)
                .style('left', (e.pageX + 14) + 'px').style('top', (e.pageY + 14) + 'px');
        })
        .on("mouseleave", () => d3.select('#global-tooltip').style('opacity', 0));

    if (state.brushedData.length) updateMapHighlights();
}

// ============================================================
// 11. PRICE AREA CHART (with Brush)
// ============================================================

/**
 * drawPriceAreaChart - Creates scatter plot of Price vs Floor Area
 * Features:
 * - Interactive brush selection for filtering other charts
 * - Color coding by flat type
 * - Hover tooltips with property details
 * - Legend showing flat type colors
 */
function drawPriceAreaChart() {
    const container = document.getElementById('price-area-chart');
    if (!container) return;
    const w = container.clientWidth;
    const h = CONFIG.chartHeight.priceArea;
    const margin = getMargins('scatter');
    const innerW = Math.max(200, w - margin.left - margin.right);
    const innerH = Math.max(150, h - margin.top - margin.bottom);

    d3.select('#price-area-chart').selectAll('*').remove();
    const svg = d3.select('#price-area-chart').append('svg').attr('width', w).attr('height', h)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    if (!filteredData.length) {
        svg.append('text').attr('x', innerW / 2).attr('y', innerH / 2).attr('text-anchor', 'middle')
            .style('fill', '#64748b').text('No data available');
        return;
    }

    // Scales
    const x = d3.scaleLinear().domain([0, d3.max(filteredData, d => d.floor_area_sqm) * 1.05]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, d3.max(filteredData, d => d.resale_price) * 1.05]).range([innerH, 0]);

    // Axes
    svg.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6));
    svg.append('g').call(d3.axisLeft(y).ticks(10).tickFormat(d => d === 0 ? "$0" : "$" + d3.format(".2s")(d)));

    // Axis labels
    svg.append("text").attr("text-anchor", "middle").attr("x", innerW / 2).attr("y", innerH + margin.bottom - 10)
        .style("font-size", "12px").text("Floor Area (sqm)");
    svg.append("text").attr("text-anchor", "middle").attr("transform", "rotate(-90)")
        .attr("x", -innerH / 2).attr("y", -margin.left + 20).style("font-size", "12px").text("Resale Price (SGD)");
    svg.append("text").attr("class", "chart-instruction-cue").attr("x", 0).attr("y", -margin.top - 10)
        .attr("text-anchor", "start").text("Click & Drag to brush select a region");

    // Legend
    const types = [...new Set(filteredData.map(d => d.flat_type))].sort();
    const lg = svg.append('g').attr('class', 'chart-legend').attr('transform', `translate(${innerW - 10}, -5)`);
    let lx = 0;
    [...types].reverse().forEach(t => {
        const item = lg.append('g');
        item.append('circle').attr('cx', lx - 12).attr('cy', 0).attr('r', 5).attr('fill', CONFIG.colors.flatTypes(t));
        const txt = item.append('text').attr('x', lx - 22).attr('y', 4).attr('text-anchor', 'end')
            .style('font-size', '11px').style('font-weight', '600').style('fill', '#475569').text(t);
        lx -= (txt.node().getComputedTextLength() + 35);
    });

    // Data points (sampled for performance)
    const step = Math.ceil(filteredData.length / CONFIG.brushLimit);
    const sample = filteredData.filter((_, i) => i % step === 0).slice(0, CONFIG.brushLimit);
    const dots = svg.selectAll('circle').data(sample).enter().append('circle')
        .attr('class', 'data-dot').attr('cx', d => x(d.floor_area_sqm)).attr('cy', d => y(d.resale_price))
        .attr('r', 3.5).attr('fill', d => CONFIG.colors.flatTypes(d.flat_type)).attr('opacity', 0.6)
        .on('mouseover', function (e, d) {
            d3.select('#global-tooltip').style('opacity', 1)
                .html(`<strong>${d.town} (${d.flat_type})</strong><br/>Price: $${Math.round(d.resale_price).toLocaleString()}<br/>Area: ${d.floor_area_sqm} sqm`)
                .style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 20) + 'px');
        })
        .on('mouseout', () => d3.select('#global-tooltip').style('opacity', 0));

    // Brush selection
    const brush = d3.brush().extent([[0, 0], [innerW, innerH]]).on("start brush end", function (e) {
        const sel = e.selection;
        if (!sel) { dots.style("opacity", 0.6); state.brushedData = []; }
        else {
            const [[x0, y0], [x1, y1]] = sel;
            state.brushedData = sample.filter(d => {
                const cx = x(d.floor_area_sqm), cy = y(d.resale_price);
                return x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
            });
        }
        updateMapHighlights();
        drawPriceBarChart();
        drawLeaseScatter();
        drawDonutChart();
        updateKPIs();
    });
    svg.append("g").attr("class", "brush").call(brush);
}

// ============================================================
// 12. PRICE BAR CHART
// ============================================================

/**
 * drawPriceBarChart - Displays average price by town as bar chart
 * Features:
 * - Sorting by highest or lowest price (toggled via sidebar)
 * - Click on bar to filter by that town
 * - Hover highlights matching map points
 * - Shows top 8 towns only for clarity
 */
function drawPriceBarChart() {
    const container = document.getElementById('price-bar-chart');
    if (!container) return;
    const w = container.clientWidth, h = CONFIG.chartHeight.priceBar;
    const margin = getMargins('bar');
    const innerW = Math.max(200, w - margin.left - margin.right);
    const innerH = Math.max(100, h - margin.top - margin.bottom);

    const sortOrder = document.querySelector('input[name="sortOrder"]:checked').value;
    d3.select('#price-bar-chart').selectAll('*').remove();
    const svg = d3.select('#price-bar-chart').append('svg').attr('width', w).attr('height', h)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const data = getActiveData();
    if (!data.length) return;

    // Aggregate average price by town, sort, and take top 8
    const avgPrices = Array.from(d3.rollup(data, v => d3.mean(v, d => d.resale_price), d => d.town),
        ([town, price]) => ({ town, price }))
        .sort((a, b) => sortOrder === 'asc' ? a.price - b.price : b.price - a.price)
        .slice(0, 8);

    // Scales
    const x = d3.scaleBand().domain(avgPrices.map(d => d.town)).range([0, innerW]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(avgPrices, d => d.price) * 1.05]).range([innerH, 0]);

    // Axes
    svg.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x))
        .selectAll('text').attr('transform', 'rotate(-30)').attr('text-anchor', 'end').style('font-size', '9px');
    svg.append('g').call(d3.axisLeft(y).ticks(10).tickFormat(d => d === 0 ? "$0" : "$" + d3.format(".2s")(d)));

    // Labels
    svg.append("text").attr("text-anchor", "middle").attr("x", innerW / 2).attr("y", innerH + margin.bottom - 10)
        .style("font-size", "12px").style("font-weight", "600").text("Town");
    svg.append("text").attr("text-anchor", "middle").attr("transform", "rotate(-90)")
        .attr("x", -innerH / 2).attr("y", -margin.left + 20).style("font-size", "12px").style("font-weight", "600")
        .text("Average Resale Price (SGD)");
    svg.append("text").attr("class", "chart-instruction-cue").attr("x", innerW).attr("y", -6)
        .attr("text-anchor", "end").text("Click bar to filter town | Hover to trace location");

    // Bars with interaction
    svg.selectAll('rect').data(avgPrices).enter().append('rect')
        .attr('x', d => x(d.town)).attr('y', d => y(d.price))
        .attr('width', x.bandwidth()).attr('height', d => innerH - y(d.price))
        .style('cursor', 'pointer').style('transition', 'opacity 0.15s ease').attr('fill', '#147c7f')
        .on('mouseover', function (e, d) {
            d3.select('#global-tooltip').style('opacity', 1)
                .html(`<strong>${d.town}</strong><br/>Avg: $${Math.round(d.price).toLocaleString()}<br/><small style="color:#67e8f9;">Click to toggle filter</small>`)
                .style('left', (e.pageX + 10) + 'px').style('top', (e.pageY - 20) + 'px');
            // Highlight matching HDB dots on map
            d3.selectAll(".hdb-dot").style("opacity", dot => dot.town === d.town ? 0.95 : 0.05)
                .attr("r", dot => dot.town === d.town ? 3.5 : 1.5);
        })
        .on('mouseout', () => {
            d3.select('#global-tooltip').style('opacity', 0);
            state.brushedData.length ? updateMapHighlights() :
                d3.selectAll(".hdb-dot").style("opacity", 0.45).attr("r", 2.2);
        })
        .on('click', function (e, d) {
            // Toggle town filter
            state.selectedTown = state.selectedTown === d.town ? "ALL" : d.town;
            if (townSelect) townSelect.value = state.selectedTown;
            applyFilters();
        });
}

// ============================================================
// 13. LEASE SCATTER PLOT
// ============================================================

/**
 * drawLeaseScatter - Scatter plot of Price vs Remaining Lease
 * Features:
 * - Color coding by flat type
 * - Legend showing flat types
 * - Hover tooltips with property details
 * - Highlights brushed points from area chart
 */
function drawLeaseScatter() {
    const container = document.getElementById('lease-scatter-plot');
    if (!container) return;
    const w = container.clientWidth, h = CONFIG.chartHeight.priceArea;
    const margin = { top: 55, right: 25, bottom: 45, left: 65 };
    const innerW = Math.max(200, w - margin.left - margin.right);
    const innerH = Math.max(150, h - margin.top - margin.bottom);

    d3.select('#lease-scatter-plot').selectAll('*').remove();
    const svg = d3.select('#lease-scatter-plot').append('svg').attr('width', w).attr('height', h)
        .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const data = getActiveData();
    if (!data.length) {
        svg.append('text').attr('x', innerW / 2).attr('y', innerH / 2).attr('text-anchor', 'middle').text('No data');
        return;
    }

    // Scales
    const x = d3.scaleLinear().domain([Math.max(0, d3.min(data, d => d.lease_years) * 0.95), d3.max(data, d => d.lease_years) * 1.05]).range([0, innerW]);
    const y = d3.scaleLinear().domain([d3.min(data, d => d.resale_price) * 0.95, d3.max(data, d => d.resale_price) * 1.05]).range([innerH, 0]);

    // Axes with grid lines
    svg.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6).tickFormat(d => d + " yrs"))
        .style("color", "#64748b").selectAll("text").style("font-size", "11px");
    svg.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(d => d === 0 ? "$0" : "$" + d3.format(".2s")(d)))
        .style("color", "#64748b").selectAll("text").style("font-size", "11px");

    // Grid lines (subtle)
    svg.append("g").attr("opacity", 0.04).attr("transform", `translate(0, ${innerH})`)
        .call(d3.axisBottom(x).ticks(6).tickSize(-innerH).tickFormat(""));
    svg.append("g").attr("opacity", 0.04).call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(""));

    // Axis labels
    svg.append("text").attr("text-anchor", "middle").attr("x", innerW / 2).attr("y", innerH + margin.bottom - 10)
        .style("font-size", "11px").style("fill", "#64748b").style("font-weight", "500").text("Remaining Lease (Years)");
    svg.append("text").attr("text-anchor", "middle").attr("transform", "rotate(-90)")
        .attr("x", -innerH / 2).attr("y", -margin.left + 22).style("font-size", "11px").style("fill", "#64748b")
        .style("font-weight", "500").text("Resale Price (SGD)");

    // Legend
    const lg = svg.append("g").attr("class", "scatter-legend").attr("transform", `translate(0, ${-margin.top + 22})`);
    let lx = 0;
    CONFIG.colors.flatTypes.domain().forEach(type => {
        if (!data.some(d => d.flat_type === type)) return;
        const item = lg.append("g").attr("transform", `translate(${lx}, 0)`);
        item.append("circle").attr("r", 4.5).attr("fill", CONFIG.colors.flatTypes(type)).attr("stroke", "#fff").attr("stroke-width", 0.5);
        const txt = item.append("text").attr("x", 8).attr("y", 4).style("font-size", "10px").style("fill", "#475569")
            .style("font-weight", "600").text(type);
        lx += (txt.node().getComputedTextLength() || 60) + 22;
    });

    // Data points - highlight brushed points from area chart
    const step = Math.ceil(data.length / CONFIG.brushLimit);
    const sample = data.filter((_, i) => i % step === 0).slice(0, CONFIG.brushLimit);
    const keys = state.brushedData.length ? new Set(state.brushedData.map(d => `${d.block || ''}-${d.street_name || d.street || ''}`)) : null;

    svg.selectAll('.lease-dot').data(sample).enter().append('circle')
        .attr('class', 'lease-dot')
        .attr('cx', d => x(d.lease_years)).attr('cy', d => y(d.resale_price))
        .attr('fill', d => CONFIG.colors.flatTypes(d.flat_type)).attr('stroke', '#fff').attr('stroke-width', 0.4)
        .attr('r', d => keys ? (keys.has(`${d.block || ''}-${d.street_name || d.street || ''}`) ? 5.5 : 3) : 3.5)
        .attr('opacity', d => keys ? (keys.has(`${d.block || ''}-${d.street_name || d.street || ''}`) ? 1 : 0.4) : 0.9)
        .style('cursor', 'pointer')
        .on('mousemove', function (e, d) {
            d3.select('#global-tooltip').style('opacity', 1)
                .style('background', '#1e293b').style('border', '2px solid #ffffff').style('padding', '10px 14px')
                .style('border-radius', '6px').style('box-shadow', '0 4px 12px rgba(0,0,0,0.25)')
                .html(`<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;text-transform:uppercase;">${d.block || ""} ${d.street_name || d.town}</div>
                    <div style="font-size:12px;color:#cbd5e1;margin-bottom:2px;">Type: <span style="color:${CONFIG.colors.flatTypes(d.flat_type)};font-weight:700;">${d.flat_type}</span></div>
                    <div style="font-size:12px;color:#cbd5e1;">Lease Left: <strong style="color:#fff;">${d.lease_years.toFixed(1)} years</strong></div>
                    <div style="font-size:12px;color:#cbd5e1;margin-top:1px;">Price: <strong style="color:#67e8f9;">$${Math.round(d.resale_price).toLocaleString()}</strong></div>`)
                .style('left', (e.pageX + 14) + 'px').style('top', (e.pageY - 12) + 'px');
        })
        .on('mouseout', () => d3.select('#global-tooltip').style('opacity', 0));
}

// ============================================================
// 14. DONUT CHART
// ============================================================

/**
 * drawDonutChart - Donut chart showing flat type distribution
 * Features:
 * - Interactive segments that filter by flat type when clicked
 * - Center shows total count or selected type count
 * - Legend with click-to-filter functionality
 * - Hover tooltips with percentage and count
 * - Filter badge showing current selections
 */
function drawDonutChart() {
    const container = d3.select("#donutChart");
    if (container.empty()) return;

    const w = container.node().clientWidth, h = 280;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerW = w - margin.left - margin.right, innerH = h - margin.top - margin.bottom;
    const radius = Math.min(innerW, innerH) / 2;
    const color = CONFIG.colors.flatTypes;
    const pie = d3.pie().value(d => d.count).sort(null);
    const arc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 0.9);

    const data = getActiveData();
    const stats = d3.rollups(data, v => v.length, d => d.flat_type)
        .map(([type, count]) => ({ flatType: type, count }));
    const total = d3.sum(stats, d => d.count);
    const pieData = pie(stats);

    // Get current filter selections for badge display
    const getSelected = (select) => {
        if (!select) return ["ALL"];
        return Array.from(select.selectedOptions).map(o => o.value);
    };
    
    const selectedTowns = getSelected(townSelect);
    const selectedModels = getSelected(modelSelect);
    const selectedTypes = getSelected(typeSelect);

    // Build filter badge text
    const filterParts = [];
    if (!selectedTowns.includes("ALL") && selectedTowns.length > 0) {
        filterParts.push(selectedTowns.length === 1 ? selectedTowns[0] : `${selectedTowns.length} Towns`);
    }
    if (!selectedModels.includes("ALL") && selectedModels.length > 0) {
        filterParts.push(selectedModels.length === 1 ? selectedModels[0] : `${selectedModels.length} Models`);
    }
    if (!selectedTypes.includes("ALL") && selectedTypes.length > 0) {
        filterParts.push(selectedTypes.length === 1 ? selectedTypes[0] : `${selectedTypes.length} Types`);
    }
    const filterBadge = filterParts.length > 0 ? filterParts.join(' • ') : 'All Data';

    // Setup SVG
    let svg = container.select("svg");
    if (svg.empty()) {
        svg = container.append("svg").attr("width", w).attr("height", h);
        svg.append("g").attr("class", "paths-group").attr("transform", `translate(${margin.left + innerW / 2}, ${margin.top + innerH / 2})`);
        svg.append("g").attr("class", "labels-group").attr("transform", `translate(${margin.left + innerW / 2}, ${margin.top + innerH / 2})`);
        svg.append("g").attr("class", "legend-group").attr("transform", `translate(${margin.left + innerW / 2 + radius + 30}, ${margin.top + innerH / 2 - radius * 0.6})`);
    }

    // Update instruction text with filter badge
    let instructionText = svg.select(".chart-instruction-cue");
    if (instructionText.empty()) {
        instructionText = svg.append("text").attr("class", "chart-instruction-cue")
            .attr("x", margin.left).attr("y", 16)
            .attr("text-anchor", "start")
            .style("font-size", "12px")
            .style("fill", "#475569")
            .style("font-weight", "500")
            .style("opacity", 0.8)
            .style("font-style", "italic");
    }
    instructionText.text(`Click a segment to filter | Hover for details • ${filterBadge}`);

    // Draw pie segments with animation
    const pathGroup = svg.select(".paths-group");
    let paths = pathGroup.selectAll("path").data(pieData, d => d.data.flatType);
    const oldData = paths.data();

    const arcTween = (d) => {
        const i = d3.interpolate(this._current, d);
        this._current = i(1);
        return t => arc(i(t));
    };

    // Exit animation
    paths.exit().transition().duration(750).attrTween("d", function (d, i) {
        const n = oldData[i] || { startAngle: 0, endAngle: 0 };
        const tween = d3.interpolate(this._current, { startAngle: n.startAngle, endAngle: n.startAngle });
        return t => arc(tween(t));
    }).remove();

    // Enter + update
    paths.enter().append("path").each(function (d) { this._current = { startAngle: 0, endAngle: 0 }; })
        .on("click", function (e, d) {
            // Toggle flat type filter
            state.selectedFlatType = state.selectedFlatType === d.data.flatType ? "ALL" : d.data.flatType;
            if (typeSelect) typeSelect.value = state.selectedFlatType;
            applyFilters();
        })
        .on("mouseover", function (e, d) {
            const pct = ((d.data.count / total) * 100).toFixed(1);
            d3.select("#global-tooltip").style("opacity", 1).style("background", "#1e293b")
                .style("border", "2px solid #ffffff").style("padding", "10px 14px")
                .style("border-radius", "6px").style("box-shadow", "0 4px 12px rgba(0,0,0,0.25)")
                .html(`<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;text-transform:uppercase;">${d.data.flatType}</div>
                    <div style="font-size:12px;color:#cbd5e1;font-weight:500;">Vol: <strong style="color:#fff;">${d.data.count.toLocaleString()}</strong> transactions</div>
                    <div style="font-size:12px;color:#cbd5e1;font-weight:500;margin-top:1px;">Percentage: <strong style="color:#67e8f9;">${pct}%</strong> of total</div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:3px;">${filterBadge}</div>`);
        })
        .on("mousemove", function (e) {
            d3.select("#global-tooltip").style("left", (e.pageX + 14) + "px").style("top", (e.pageY - 12) + "px");
        })
        .on("mouseout", () => d3.select("#global-tooltip").style("opacity", 0))
        .merge(paths).transition().duration(750).attrTween("d", arcTween)
        .attr("fill", d => color(d.data.flatType)).style("stroke", "#fff").style("stroke-width", "2px")
        .style("cursor", "pointer").style("fill-opacity", d => {
            // Dim non-selected types when a filter is active
            const selectedTypes = typeSelect ? Array.from(typeSelect.selectedOptions).map(o => o.value) : ["ALL"];
            if (selectedTypes.includes("ALL")) return 1;
            return selectedTypes.includes(d.data.flatType) ? 1 : 0.2;
        });

    // Center text - dynamically shows total based on ALL filters
    const labelsGroup = svg.select(".labels-group");
    labelsGroup.selectAll("*").remove();
    
    const selectedFlatTypes = typeSelect ? Array.from(typeSelect.selectedOptions).map(o => o.value) : ["ALL"];
    let centerLabel, centerValue;
    
    if (selectedFlatTypes.includes("ALL")) {
        // Show total of all types (filtered by towns and models)
        centerLabel = "TOTAL";
        centerValue = total.toLocaleString();
    } else if (selectedFlatTypes.length === 1) {
        // Show count for the single selected type
        const type = selectedFlatTypes[0];
        const typeData = stats.find(d => d.flatType === type);
        centerLabel = type;
        centerValue = typeData ? typeData.count.toLocaleString() : "0";
    } else {
        // Multiple types selected - show sum
        const selectedCount = stats
            .filter(d => selectedFlatTypes.includes(d.flatType))
            .reduce((sum, d) => sum + d.count, 0);
        centerLabel = `${selectedFlatTypes.length} Types`;
        centerValue = selectedCount.toLocaleString();
    }
    
    labelsGroup.append("text")
        .attr("dy", "-.3em")
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "#64748b")
        .style("font-weight", "600")
        .style("text-transform", "uppercase")
        .style("letter-spacing", "0.5px")
        .text(centerLabel);
    
    labelsGroup.append("text")
        .attr("dy", "1em")
        .attr("text-anchor", "middle")
        .style("font-size", "20px")
        .style("font-weight", "800")
        .style("fill", "#0f172a")
        .text(centerValue);

    // Legend with click-to-filter
    const legendGroup = svg.select(".legend-group");
    legendGroup.selectAll("*").remove();
    
    const selectedFlatTypesSet = new Set(selectedFlatTypes);
    const isAllSelected = selectedFlatTypes.includes("ALL");
    
    [...stats].sort((a, b) => b.count - a.count).forEach((d, i) => {
        const isActive = isAllSelected || selectedFlatTypesSet.has(d.flatType);
        const opacity = isActive ? 1 : 0.25;
        const pct = ((d.count / total) * 100).toFixed(1);
        
        const item = legendGroup.append("g")
            .attr("transform", `translate(0, ${i * 22})`)
            .style("cursor", "pointer")
            .style("opacity", opacity)
            .on("click", () => {
                // Toggle this type in multi-select
                const currentSelected = typeSelect ? Array.from(typeSelect.selectedOptions).map(o => o.value) : ["ALL"];
                let newSelected;
                
                if (currentSelected.includes("ALL")) {
                    newSelected = [d.flatType];
                } else if (currentSelected.includes(d.flatType) && currentSelected.length === 1) {
                    newSelected = ["ALL"];
                } else if (currentSelected.includes(d.flatType)) {
                    newSelected = currentSelected.filter(v => v !== d.flatType);
                    if (newSelected.length === 0) newSelected = ["ALL"];
                } else {
                    newSelected = [...currentSelected, d.flatType];
                }
                
                // Update the select
                Array.from(typeSelect.options).forEach(opt => {
                    opt.selected = newSelected.includes(opt.value);
                });
                typeSelect.dispatchEvent(new Event('change'));
            });
        
        item.append("circle")
            .attr("r", 5)
            .attr("fill", color(d.flatType))
            .attr("stroke", isActive && !isAllSelected ? "#147c7f" : "#fff")
            .attr("stroke-width", isActive && !isAllSelected ? 2 : 0.5);
        
        const text = item.append("text")
            .attr("x", 14)
            .attr("y", 4)
            .style("font-size", "10.5px")
            .style("font-family", "inherit")
            .style("fill", isActive && !isAllSelected ? "#0f172a" : "#475569")
            .style("font-weight", isActive && !isAllSelected ? "700" : "500")
            .text(`${d.flatType} (${pct}%)`);
        
     
    });
}

// ============================================================
// 15. MAP HIGHLIGHTS (Brush/Selection)
// ============================================================

/**
 * updateMapHighlights - Updates map dots to reflect brush selection
 * Brushed points become large white dots with colored borders
 * Non-brushed points become very small and dim
 * Creates a clear visual distinction for selected data
 */
function updateMapHighlights() {
    const mapSvg = d3.select("#map-canvas svg");
    if (mapSvg.empty()) return;
    const dots = mapSvg.selectAll(".hdb-dot");

    if (!state.brushedData.length) {
        // No brush - reset all dots to normal
        dots.transition()
            .duration(300)
            .attr("r", 3)
            .attr("fill", d => CONFIG.colors.flatTypes(d.flat_type))
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.9);
        return;
    }

    // Create Set of brushed data keys for fast lookup
    const keys = new Set(state.brushedData.map(d => `${d.block || ''}-${d.street_name || d.street || ''}`));

    dots.each(function (d) {
        const dot = d3.select(this);
        const isSelected = keys.has(`${d.block || ''}-${d.street_name || d.street || ''}`);

        if (isSelected) {
            // BRUSHED POINTS: Bigger, brighter, high contrast
            dot.interrupt()
                .transition()
                .duration(400)
                .ease(d3.easeBackOut)
                .attr("r", 12)  // Much bigger
                .attr("fill", "#ffffff")  // White for maximum contrast
                .attr("stroke", CONFIG.colors.flatTypes(d.flat_type))  // Colored border
                .attr("stroke-width", 4)  // Thicker border
                .attr("opacity", 1);  // Full opacity
        } else {
            // UNBRUSHED POINTS: Dimmed and smaller
            dot.interrupt()
                .transition()
                .duration(300)
                .ease(d3.easeCubicOut)
                .attr("r", 1.5)  // Very small
                .attr("fill", CONFIG.colors.flatTypes(d.flat_type))
                .attr("stroke", "#e2e8f0")  // Light gray stroke
                .attr("stroke-width", 0.3)
                .attr("opacity", 0.08);  // Very dim
        }
    });
}
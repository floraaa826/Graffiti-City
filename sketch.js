let graffitiData, manhattanBorder;
let scale = 5;
let cols, rows;
let w = 800;
let h = 800;
let terrain = [];
let startColor, endColor;
let terrainModel;
let saveBtn;

function preload() {
  // Your graffiti JSON should already be {lat,lon} per entry or converted before use
  graffitiData = loadJSON("Manhattan_Graffiti_Simplified.json");
  // NYC Open Data WKT multipolygon source (Manhattan)
  manhattanBorder = loadJSON(
    "https://data.cityofnewyork.us/api/views/gthc-hcne/rows.json?accessType=DOWNLOAD"
  );
  
}

function setup() {
  // --- parse & clean the WKT multipolygon into [{lat,lon}, ...] ring ---
  // This dataset stores WKT in data[4][12] as of now
  const cleanBorderData = cleaningCoordinates(manhattanBorder.data[4][12]);

  createCanvas(800, 600, WEBGL);
  noStroke();

  graffitiData = Object.values(graffitiData);

  cols = floor(w / scale);
  rows = floor(h / scale);
  startColor = color("#383430");
  endColor = color("#77706a");

  // --- compute bounds from the border itself so mapping stays consistent ---
  const lonMin = Math.min(...cleanBorderData.map((p) => p.lon));
  const lonMax = Math.max(...cleanBorderData.map((p) => p.lon));
  const latMin = Math.min(...cleanBorderData.map((p) => p.lat));
  const latMax = Math.max(...cleanBorderData.map((p) => p.lat));

  // --- initialize terrain grid ---
  terrain = Array.from({ length: cols }, () =>
    Array.from({ length: rows }, () => [{ h: 0 }])
  );

  // --- fill interior of Manhattan polygon with base tiles ---
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const center = gridIndexToLonLat(
        x,
        y,
        lonMin,
        lonMax,
        latMin,
        latMax,
        cols,
        rows
      );
      if (pointInPolygon(center, cleanBorderData)) {
        // base fill tile per cell
        terrain[x][y].push({
          h: 8,
          w: 8,
          d: 8,
          offsetX: 0,
          offsetY: 0,
          color: "#4D4844",
        });
      }
    }
  }

  let whoIsTheFirst = [];
  let whoIsTheLast = [];

  // --- fill first and last --- //
  for (let x = 0; x < cols; x++) {
    let isFirstFound = false;
    let lastIndex;

    for (let y = 0; y < rows; y++) {
      if (terrain[x][y][1] && !isFirstFound) {
        isFirstFound = true;
        terrain[x][y][1].first = true;
        lastIndex = y;

        whoIsTheFirst[x] = y;
      }

      if (terrain[x][y][1]) {
        lastIndex = y;
      }
    }

    if (terrain[x][lastIndex]) {
      terrain[x][lastIndex][1].last = true;
      whoIsTheLast[x] = lastIndex;
    }
  }

  // --- fill in the gap --- //
  for (let x = 0; x < cols; x++) {
    for (let y = whoIsTheFirst[x]; y < whoIsTheLast[x]; y++) {
      if (terrain[x][y].length === 1) {
        console.log("fill in gap!");
        terrain[x][y].push({
          h: 8,
          w: 8,
          d: 8,
          offsetX: 0,
          offsetY: 0,
          color: "#4D4844",
        });
      }
    }
  }

  // --- add graffiti stacks (randomized small boxes) ---
  noiseDetail(4, 0.5);
 for (let p of graffitiData) {
  const xi = floor(map(p.lon, lonMin, lonMax, 0, cols - 1));
  const yi = floor(map(p.lat, latMin, latMax, 0, rows - 1));
  if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
    let layers = floor(random(1, 5)); // 每格堆 1~4 层
    for (let i = 0; i < layers; i++) {
      terrain[xi][yi].push({
        h: random(5, 25),                  // 高度随机
        w: random(scale*0.5, scale*1.4),   // 宽随机
        d: random(scale*0.5, scale*1.4),   // 深随机
      });
    }
  }
   
}

  // --- buildGeometry wraps your draw commands into a single model (for STL) ---
  terrainModel = buildGeometry(() => {
    // optional plane underlay if desired
    // push();
    // fill("#77706a");
    // translate(w / 2, h / 2, -5);
    // box(w, h, 10);
    // pop();

    // draw stacked boxes per cell
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        push();
        translate(x * scale, y * scale, 0);
        let cumH = 0;
        for (let l of terrain[x][y]) {
          const t = y / (rows - 1);
          const grayCol = lerpColor(startColor, endColor, t);
          fill(grayCol);
          if (l.h !== 0) {
            push();
            translate(l.offsetX || 0, l.offsetY || 0, cumH + l.h / 2);

            if (l.first) {
              fill("#4D4844");
            }
            if (l.last) {
              fill("#4D4844");
            }

            if (l.color === "#4D4844") {
              fill("#4D4844");
            }

            box(l.w || scale, l.d || scale, l.h);
            pop();
          }
          cumH += l.h;
        }
        pop();
      }
    }
  });

  // --- save STL button (requires your STL/buildGeometry helper lib) ---
  saveBtn = createButton("💾 Save .stl");
  saveBtn.position(10, 10);
  saveBtn.mousePressed(() => {
    terrainModel.saveStl("manhattan_graffiti_ascii.stl");
  });
}

function draw() {
  background(240);
  ambientLight(180);
  directionalLight(255, 255, 255, 0.3, 0.5, -1);
  orbitControl();
  rotateX(PI / 3);
  translate(-w / 2, -h / 2, 0);
  model(terrainModel);
}

// --------- helpers ---------

// Convert WKT MULTIPOLYGON to a single ring array [{lat,lon}, ...]
// Assumes you want the outer ring; if multiple rings exist, this flattens the first one.
function cleaningCoordinates(wkt) {
  // Strip label and parentheses, split to lon lat pairs
  const pairs = wkt
    .replace("MULTIPOLYGON", "")
    .replace(/\(|\)/g, "")
    .trim()
    .split(",")
    .map((pair) => pair.trim());

  // Map to objects
  const coords = pairs.map((pair) => {
    const [lon, lat] = pair.split(/\s+/).map(Number);
    return { lat, lon };
  });

  // Optional: ensure ring closes (not strictly required for PIP)
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first.lon !== last.lon || first.lat !== last.lat) {
    coords.push({ ...first });
  }
  return coords;
}

// Ray casting PIP in lon/lat space.
// polygon: array of {lon,lat} (closed or open ring)
function pointInPolygon(point, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lon,
      yi = polygon[i].lat;
    const xj = polygon[j].lon,
      yj = polygon[j].lat;

    // Test edge (xi,yi)-(xj,yj) against a horizontal ray to the right of (point.lon, point.lat)
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

// Center lon/lat of a grid cell (xi, yi)
function gridIndexToLonLat(xi, yi, lonMin, lonMax, latMin, latMax, cols, rows) {
  const lon = map(xi + 0.5, 0, cols, lonMin, lonMax);
  const lat = map(yi + 0.5, 0, rows, latMin, latMax);
  return { lon, lat };
}

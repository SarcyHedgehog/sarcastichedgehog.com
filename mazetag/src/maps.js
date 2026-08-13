const MANIFEST_URL = "maps/manifest.json";
const FALLBACK_MAP = Object.freeze({ id: "map1", title: "Classic Maze", file: "map1.js" });

let manifest = null;

export async function loadMapManifest() {
  if (manifest) return manifest;
  const response = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the maze manifest.");
  const data = await response.json();
  const maps = Array.isArray(data.maps) ? data.maps.map(normaliseEntry).filter(Boolean) : [];
  manifest = maps.length ? maps : [FALLBACK_MAP];
  return manifest;
}

export async function loadMaze(mapId = "map1") {
  const maps = await loadMapManifest();
  const selected = maps.find(map => map.id === mapId) || maps[0] || FALLBACK_MAP;
  const response = await fetch(`maps/${selected.file}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${selected.title}.`);
  const source = await response.text();
  const match = source.match(/\[([\s\S]*?)\]/);
  if (!match) throw new Error(`Map ${selected.id} contains no maze array.`);
  // Filter text before Number(): Number("") is zero, so a trailing comma
  // would otherwise create a convincing but entirely imaginary extra cell.
  const maze = match[1].split(",").map(value => value.trim()).filter(Boolean).map(Number);
  if (maze.length !== 256 || maze.some(value => !Number.isFinite(value))) throw new Error(`Map ${selected.id} has ${maze.length} cells; expected 256.`);
  return { maze, map: selected };
}

function normaliseEntry(value) {
  const id = String(value?.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const file = String(value?.file || `${id}.js`).replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!id || !file.endsWith(".js")) return null;
  return Object.freeze({ id, file, title: String(value?.title || humanise(id)).slice(0, 40) });
}
function humanise(id) { return id.replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase()); }

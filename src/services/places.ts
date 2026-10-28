export type Place = { id: string; name: string; lat: number; lon: number; kind: string; address: string };
export type Coordinates = { lat: number; lon: number; label: string };

const GEOCODE_CACHE_TTL = 5 * 60 * 1000;
const FACILITY_CACHE_TTL = 3 * 60 * 1000;
const geocodeCache = new Map<string, { value: Coordinates; savedAt: number }>();
const facilityCache = new Map<string, { value: Place[]; savedAt: number }>();
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;

const timeoutFetch = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`The public map service returned ${response.status}. Please try again shortly.`);
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("The search took too long. Check your connection and try again.");
    throw error;
  } finally { window.clearTimeout(timer); }
};

export async function geocodePlace(query: string): Promise<Coordinates> {
  const key = query.trim().toLocaleLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.savedAt < GEOCODE_CACHE_TTL) return cached.value;

  const request = geocodeQueue.then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
    lastGeocodeAt = Date.now();
    const response = await timeoutFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query.trim())}`);
    const rows = await response.json();
    if (!rows.length) throw new Error("We couldn't find that place. Try a city, postcode, or landmark.");
    const value = { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: String(rows[0].display_name).split(",").slice(0, 3).join(",") };
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lon)) throw new Error("The location service returned an invalid result. Try another place.");
    geocodeCache.set(key, { value, savedAt: Date.now() });
    return value;
  });
  geocodeQueue = request.then(() => undefined, () => undefined);
  return request;
}

export async function searchFacilities(lat: number, lon: number, radius = 12000): Promise<Place[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error("The location coordinates are invalid. Search for another place.");
  }
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`;
  const cached = facilityCache.get(key);
  if (cached && Date.now() - cached.savedAt < FACILITY_CACHE_TTL) return cached.value;
  const query = `[out:json][timeout:12];(node["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});way["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});relation["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon}););out center tags;`;
  const response = await timeoutFetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: `data=${encodeURIComponent(query)}` });
  const data = await response.json();
  const places = (data.elements || []).map((item: any) => {
    const tags = item.tags || {};
    const pLat = item.lat ?? item.center?.lat, pLon = item.lon ?? item.center?.lon;
    if (typeof pLat !== "number" || typeof pLon !== "number") return null;
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"] || tags["addr:town"], tags["addr:postcode"]].filter(Boolean).join(" ");
    const kind = tags.amenity === "hospital" ? "Hospital" : tags.amenity === "clinic" ? "Clinic" : "Medical practice";
    return { id: `${item.type}-${item.id}`, name: tags.name || `${kind} (name not listed)`, lat: pLat, lon: pLon, kind, address: address || tags["addr:full"] || "Address not listed in OpenStreetMap" };
  }).filter(Boolean).sort((a: Place, b: Place) => distanceKm(lat, lon, a.lat, a.lon) - distanceKm(lat, lon, b.lat, b.lon));
  facilityCache.set(key, { value: places, savedAt: Date.now() });
  return places;
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLon = (bLon - aLon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { db } from "../db/db";
import { sql } from "drizzle-orm";
import * as turf from "@turf/turf";

import { SupplierApidataTable } from "../db/schema/SupplierSchema";
import { SupplierCarDetailsTable } from "../db/schema/SupplierSchema";
import { CreateTransferCar } from "../db/schema/SupplierSchema";
import { zones, transfers_Vehicle } from "../db/schema/SupplierSchema";
import { Create_Vehicles } from "../db/schema/SupplierSchema";

// Use env var for API key
const GOOGLE_MAPS_API_KEY = "AIzaSyAjXkEFU-hA_DSnHYaEjU3_fceVwQra0LI";

// currency cache
const currencyCache: Record<string, Record<string, number>> = {};

// -------------------- Enhanced Coordinate Validation --------------------
function isValidCoordinate(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
}

function parseCoordinate(coordString: string): { lat: number; lng: number } | null {
  try {
    console.log(`[Coordinate] Parsing: "${coordString}"`);
    
    // Clean the string - remove extra spaces, brackets, etc.
    const cleanString = coordString.replace(/[\[\]\(\)]/g, '').trim();
    const parts = cleanString.split(/[,;\s]+/).map(part => {
      const cleaned = part.trim();
      return cleaned ? parseFloat(cleaned) : NaN;
    }).filter(part => !isNaN(part));
    
    if (parts.length !== 2) {
      console.error(`[Coordinate] Invalid coordinate format: ${coordString} -> ${parts.length} valid parts`);
      return null;
    }
    
    const [first, second] = parts;
    
    // Determine coordinate order based on typical ranges
    let lat, lng;
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
      // Standard format: lat,lng
      lat = first;
      lng = second;
      console.log(`[Coordinate] Standard format: lat=${lat}, lng=${lng}`);
    } else if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
      // Swapped: lng,lat
      lat = second;
      lng = first;
      console.log(`[Coordinate] Swapped coordinates detected: ${coordString} -> (${lat}, ${lng})`);
    } else {
      console.error(`[Coordinate] Invalid coordinate values: ${coordString}`);
      return null;
    }
    
    if (!isValidCoordinate(lat, lng)) {
      console.error(`[Coordinate] Invalid coordinate range: (${lat}, ${lng}) from ${coordString}`);
      return null;
    }
    
    console.log(`[Coordinate] Successfully parsed: ${coordString} -> (${lat}, ${lng})`);
    return { lat, lng };
  } catch (error) {
    console.error(`[Coordinate] Error parsing coordinate: ${coordString}`, error);
    return null;
  }
}

// -------------------- Enhanced Road Distance Helper --------------------
export async function getRoadDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  console.log(`[Distance] Getting ROAD distance from (${fromLat}, ${fromLng}) to (${toLat}, ${toLng})`);
  
  // Validate coordinates
  if (!isValidCoordinate(fromLat, fromLng) || !isValidCoordinate(toLat, toLng)) {
    console.error(`[Distance] Invalid coordinates: From(${fromLat}, ${fromLng}) To(${toLat}, ${toLng})`);
    return { distance: null, duration: null, error: "Invalid coordinates" };
  }

  // Check for same coordinates
  if (fromLat === toLat && fromLng === toLng) {
    console.log(`[Distance] Same coordinates, distance is 0`);
    return { 
      distance: 0, 
      duration: "0 mins", 
      distanceMeters: 0
    };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    console.log(`[Distance] API URL: ${url.replace(GOOGLE_MAPS_API_KEY, 'HIDDEN')}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    
    // Debug API status
    console.log(`[Distance] API Status: ${response.data.status}`);
    
    // Handle API errors
    if (response.data.status === "OVER_QUERY_LIMIT") {
      console.error("[Distance] Google Maps API quota exceeded");
      return { distance: null, duration: null, error: "API quota exceeded" };
    }
    
    if (response.data.status === "REQUEST_DENIED") {
      console.error("[Distance] Google Maps API request denied:", response.data.error_message);
      return { distance: null, duration: null, error: "API request denied" };
    }
    
    const element = response.data.rows[0]?.elements[0];
    
    if (!element) {
      console.error("[Distance] No route elements found in response");
      return { distance: null, duration: null, error: "No route elements" };
    }

    console.log(`[Distance] Element Status: ${element.status}`);
    
    if (element.status !== "OK") {
      console.error(`[Distance] Route error: ${element.status}`, element);
      return { distance: null, duration: null, error: `Route error: ${element.status}` };
    }

    const distanceText = element.distance?.text;
    const durationText = element.duration?.text;
    const distanceMeters = element.distance?.value; // Distance in meters
    
    if (!distanceText || !durationText) {
      console.error("[Distance] Distance or duration not found in response");
      return { distance: null, duration: null, error: "Missing distance/duration" };
    }
    
    // Parse distance - handle different formats
    let distance: number;
    if (distanceText.includes('mi')) {
      distance = parseFloat(distanceText.replace(" mi", "").replace(",", ""));
    } else if (distanceText.includes('km')) {
      const km = parseFloat(distanceText.replace(" km", "").replace(",", ""));
      distance = km * 0.621371; // Convert km to miles
    } else {
      console.error(`[Distance] Unknown distance unit: ${distanceText}`);
      return { distance: null, duration: null, error: "Unknown distance unit" };
    }
    
    console.log(`[Distance] Road distance: ${distance} miles (${distanceMeters} meters), Duration: ${durationText}`);
    
    return {
      distance,
      duration: durationText,
      distanceMeters,
      success: true
    };
  } catch (error: any) {
    console.error("[Distance] Error fetching road distance:", error?.response?.data || error?.message || error);
    
    if (error.code === 'ECONNABORTED') {
      console.error("[Distance] Request timeout");
      return { distance: null, duration: null, error: "Request timeout" };
    }
    
    return { distance: null, duration: null, error: error?.message || "Unknown error" };
  }
}

// -------------------- Enhanced Directions API (Primary Method) --------------------
async function getDistanceUsingDirections(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    console.log(`[Directions] API URL: ${url.replace(GOOGLE_MAPS_API_KEY, 'HIDDEN')}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data.status !== "OK") {
      console.error(`[Directions] API Error: ${response.data.status}`, response.data.error_message);
      return null;
    }
    
    const route = response.data.routes[0];
    
    if (!route) {
      console.error("[Directions] No route found");
      return null;
    }

    const leg = route.legs[0];
    const distanceMeters = leg.distance.value;
    const distance = distanceMeters / 1609.34; // meters to miles
    const duration = leg.duration.text;
    
    console.log(`[Directions] Distance: ${distance.toFixed(2)} miles (${distanceMeters} meters), Duration: ${duration}`);
    console.log(`[Directions] Route summary: ${route.summary}`);
    
    return { 
      distance, 
      duration,
      distanceMeters,
      summary: route.summary,
      steps: leg.steps.length,
      success: true
    };
  } catch (error) {
    console.error("[Directions] Error:", error?.response?.data || error);
    return null;
  }
}

// -------------------- Robust Distance Calculator --------------------
async function calculateRobustDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  console.log(`[Robust Distance] Calculating distance between (${fromLat}, ${fromLng}) and (${toLat}, ${toLng})`);
  
  // Try Directions API first (more accurate)
  console.log(`[Robust Distance] Trying Directions API...`);
  const directionsResult = await getDistanceUsingDirections(fromLat, fromLng, toLat, toLng);
  
  if (directionsResult && directionsResult.success) {
    console.log(`[Robust Distance] Using Directions API result: ${directionsResult.distance} miles`);
    return directionsResult;
  }
  
  // Fallback to Distance Matrix API
  console.log(`[Robust Distance] Directions API failed, trying Distance Matrix...`);
  const distanceMatrixResult = await getRoadDistance(fromLat, fromLng, toLat, toLng);
  
  if (distanceMatrixResult.distance !== null) {
    console.log(`[Robust Distance] Using Distance Matrix result: ${distanceMatrixResult.distance} miles`);
    return distanceMatrixResult;
  }
  
  // Final fallback: straight-line distance with realistic multiplier
  console.log(`[Robust Distance] All APIs failed, using straight-line distance with multiplier`);
  const straightLineDistance = turf.distance(
    turf.point([fromLng, fromLat]),
    turf.point([toLng, toLat]),
    { units: 'miles' }
  );
  
  // Apply realistic road distance multiplier (1.3x for urban, 1.1x for highway)
  const estimatedRoadDistance = straightLineDistance * 1.3;
  console.log(`[Robust Distance] Straight-line: ${straightLineDistance.toFixed(2)} miles -> Estimated road: ${estimatedRoadDistance.toFixed(2)} miles`);
  
  return {
    distance: estimatedRoadDistance,
    duration: `${Math.round(estimatedRoadDistance * 2)} mins`, // Rough estimate: 2 mins per mile
    straightLineDistance,
    estimated: true
  };
}

// -------------------- Currency helpers --------------------
export const getExchangeRate = async (from: string, to: string): Promise<number> => {
  console.log(`[Currency] Getting exchange rate from ${from} to ${to}`);
  
  const key = `${from}_${to}`;

  if (currencyCache[from]?.[to]) {
    console.log(`[Currency] Using cached rate: ${currencyCache[from][to]}`);
    return currencyCache[from][to];
  }

  try {
    console.log(`[Currency] Fetching live exchange rate from API`);
    const res = await axios.get(`https://api.exchangerate.host/latest?base=${from}&symbols=${to}`, { timeout: 5000 });
    const rate = res.data?.rates?.[to];
    
    if (!rate) {
      console.error(`[Currency] No rate found for ${to} in response`);
      return 1;
    }
    
    if (!currencyCache[from]) currencyCache[from] = {};
    currencyCache[from][to] = rate;
    
    console.log(`[Currency] Exchange rate set: 1 ${from} = ${rate} ${to}`);
    return rate;
  } catch (error) {
    console.error(`[Currency] Error fetching exchange rate from ${from} to ${to}`, error);
    return 1;
  }
};

export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  console.log(`[Currency] Converting ${amount} ${from} to ${to}`);
  
  if (!from || !to || from === to) {
    console.log(`[Currency] No conversion needed, returning original amount: ${amount}`);
    return amount;
  }
  
  // Validate amount
  if (isNaN(amount) || amount < 0) {
    console.warn(`[Currency] Invalid amount: ${amount}, returning 0`);
    return 0;
  }
  
  try {
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/9effc838a4da8122bac8b714/latest/${from}`, {
      timeout: 5000
    });
    
    if (res.data?.result === 'error') {
      console.error(`[Currency] API error: ${res.data['error-type']}`);
      return amount; // Fallback to original amount
    }
    
    const rate = res.data?.conversion_rates?.[to];
    
    if (!rate || isNaN(rate)) {
      console.error(`[Currency] Invalid rate for ${to}: ${rate}`);
      return amount; // Fallback to original amount
    }
    
    const convertedAmount = amount * rate;
    
    // Sanity check
    if (convertedAmount <= 0 || isNaN(convertedAmount)) {
      console.warn(`[Currency] Invalid conversion result: ${convertedAmount}, using original amount`);
      return amount;
    }
    
    console.log(`[Currency] Conversion result: ${amount} ${from} = ${convertedAmount} ${to} (rate: ${rate})`);
    return convertedAmount;
  } catch (err: any) {
    console.error(`[Currency] Error converting from ${from} to ${to}:`, err.message);
    
    // Fallback strategies
    if (currencyCache[from]?.[to]) {
      console.log(`[Currency] Using cached rate as fallback: ${currencyCache[from][to]}`);
      return amount * currencyCache[from][to];
    }
    
    console.log(`[Currency] Returning original amount as fallback`);
    return amount;
  }
}

// -------------------- Geometry helpers for Isochrone --------------------
function getPolygonFromIsochrone(geojson: any) {
  console.log(`[Geometry] Creating polygon from isochrone GeoJSON`);
  
  if (!geojson) {
    console.error("[Geometry] Invalid isochrone geojson: null or undefined");
    throw new Error("Invalid isochrone geojson: null or undefined");
  }
  
  try {
    // Parse if string, otherwise use directly
    const geojsonData = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
    
    console.log(`[Geometry] Raw GeoJSON type: ${geojsonData.type}`);
    
    if (!geojsonData.type) {
      throw new Error("Missing GeoJSON type");
    }
    
    let geometry;
    if (geojsonData.type === "Feature") {
      geometry = geojsonData.geometry;
      if (!geometry) {
        throw new Error("Feature has no geometry");
      }
      console.log(`[Geometry] Extracted geometry from Feature: ${geometry.type}`);
    } else if (geojsonData.type === "Polygon") {
      geometry = geojsonData;
    } else if (geojsonData.type === "FeatureCollection") {
      // Handle FeatureCollection by taking first feature
      const firstFeature = geojsonData.features?.[0];
      if (!firstFeature) {
        throw new Error("FeatureCollection has no features");
      }
      geometry = firstFeature.geometry;
      console.log(`[Geometry] Using first feature from FeatureCollection: ${geometry.type}`);
    } else {
      throw new Error(`Unsupported GeoJSON type: ${geojsonData.type}`);
    }
    
    if (!geometry || geometry.type !== "Polygon") {
      throw new Error(`Invalid or non-Polygon geometry in isochrone: ${geometry?.type}`);
    }
    
    const coordinates = geometry.coordinates;
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      throw new Error("Invalid polygon coordinates");
    }
    
    console.log(`[Geometry] Polygon has ${coordinates.length} ring(s), outer ring has ${coordinates[0]?.length || 0} coordinates`);
    
    // Validate coordinate structure
    if (!coordinates[0] || coordinates[0].length < 4) {
      throw new Error("Polygon ring has insufficient coordinates (minimum 4 required)");
    }
    
    const polygon = turf.polygon(coordinates);
    return polygon;
  } catch (error: any) {
    console.error("[Geometry] Error parsing GeoJSON:", error);
    throw new Error(`Failed to parse zone GeoJSON: ${error.message}`);
  }
}

function getZonesContainingPoint(lng: number, lat: number, allZones: any[]) {
  console.log(`[Geometry] Finding isochrone zones containing point (${lng}, ${lat})`);
  
  const point = turf.point([lng, lat]);
  const matches: any[] = [];
  
  for (const zone of allZones) {
    try {
      const poly = getPolygonFromIsochrone(zone.geojson);
      const isInside = turf.booleanPointInPolygon(point, poly);
      
      if (isInside) {
        console.log(`[Geometry] ✓ Point found in isochrone zone: ${zone.name} (${zone.id})`);
        matches.push(zone);
      }
    } catch (err: any) {
      console.warn(`[Geometry] Skipping isochrone zone due to error: ${zone?.id}`, err?.message || err);
    }
  }
  
  console.log(`[Geometry] Found ${matches.length} isochrone zones containing the point`);
  return matches;
}

// -------------------- Dynamic Zone Center Calculation --------------------
function getZoneLogicalCenter(zone: any): [number, number] {
  console.log(`[Zone Center] Calculating logical center for: ${zone.name}`);
  
  try {
    // Always use the centroid from the zone's GeoJSON polygon
    const poly = getPolygonFromIsochrone(zone.geojson);
    const center = turf.centroid(poly);
    const [centerLng, centerLat] = center.geometry.coordinates;
    
    console.log(`[Zone Center] ${zone.name}: centroid at (${centerLat.toFixed(6)}, ${centerLng.toFixed(6)})`);
    
    return [centerLng, centerLat];
  } catch (error: any) {
    console.error(`[Zone Center] Error calculating center for ${zone.name}:`, error.message);
    
    // Fallback: try to extract coordinates from the GeoJSON directly
    try {
      const geojsonData = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;
      let coordinates;
      
      if (geojsonData.type === "Feature") {
        coordinates = geojsonData.geometry?.coordinates;
      } else if (geojsonData.type === "Polygon") {
        coordinates = geojsonData.coordinates;
      }
      
      if (coordinates && coordinates[0] && coordinates[0].length > 0) {
        // Use the first coordinate as fallback
        const [lng, lat] = coordinates[0][0];
        console.log(`[Zone Center] Fallback: using first coordinate (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
        return [lng, lat];
      }
    } catch (fallbackError) {
      console.error(`[Zone Center] Fallback also failed for ${zone.name}`);
    }
    
    // Ultimate fallback: return a default coordinate (should rarely happen)
    console.warn(`[Zone Center] Using default fallback coordinate for ${zone.name}`);
    return [0, 0]; // This will be caught by distance validation
  }
}

// -------------------- Enhanced Effective Distance Calculation USING ROAD DISTANCE --------------------
async function calculateEffectiveDistance(
  pickupLng: number, 
  pickupLat: number, 
  zone: any
): Promise<{ distance: number; isRoadDistance: boolean; fallbackReason?: string }> {
  console.log(`\n[Effective Distance] Calculating ROAD distance to logical center of: ${zone.name}`);
  
  const [zoneLng, zoneLat] = getZoneLogicalCenter(zone);
  
  // Validate zone coordinates
  if (!isValidCoordinate(zoneLat, zoneLng)) {
    console.error(`[Effective Distance] Invalid zone coordinates for ${zone.name}: (${zoneLat}, ${zoneLng})`);
    // Fallback to straight-line distance from pickup to zone polygon centroid
    const poly = getPolygonFromIsochrone(zone.geojson);
    const centroid = turf.centroid(poly);
    const [validLng, validLat] = centroid.geometry.coordinates;
    
    const straightLineDistance = turf.distance(
      turf.point([pickupLng, pickupLat]),
      turf.point([validLng, validLat]),
      { units: 'miles' }
    );
    
    console.log(`[Effective Distance] Using straight-line fallback due to invalid zone coordinates: ${straightLineDistance.toFixed(2)} miles`);
    return { 
      distance: straightLineDistance, 
      isRoadDistance: false, 
      fallbackReason: 'Invalid zone coordinates' 
    };
  }
  
  console.log(`[Coordinates] Pickup: (${pickupLat.toFixed(6)}, ${pickupLng.toFixed(6)})`);
  console.log(`[Coordinates] Zone ${zone.name}: (${zoneLat.toFixed(6)}, ${zoneLng.toFixed(6)})`);
  
  // Calculate straight-line distance first (for reference only)
  const straightLineDistance = turf.distance(
    turf.point([pickupLng, pickupLat]),
    turf.point([zoneLng, zoneLat]),
    { units: 'miles' }
  );
  
  console.log(`[Effective Distance] Straight-line reference: ${straightLineDistance.toFixed(2)} miles`);
  
  // Use robust distance calculator that prefers road distance
  const distanceResult = await calculateRobustDistance(pickupLat, pickupLng, zoneLat, zoneLng);
  
  if (distanceResult.distance !== null && distanceResult.distance !== undefined) {
    console.log(`[Effective Distance] ✅ Using ROAD distance: ${distanceResult.distance} miles`);
    
    return { 
      distance: distanceResult.distance, 
      isRoadDistance: !distanceResult.estimated 
    };
  }
  
  // Fallback to straight-line distance with realistic multiplier
  console.log(`[Effective Distance] ❌ Road distance failed, using straight-line with multiplier`);
  const estimatedRoadDistance = straightLineDistance * 1.3;
  console.log(`[Effective Distance] Straight-line: ${straightLineDistance.toFixed(2)} miles -> Estimated road: ${estimatedRoadDistance.toFixed(2)} miles`);
  
  return { 
    distance: estimatedRoadDistance, 
    isRoadDistance: false, 
    fallbackReason: 'Road API failed' 
  };
}

// -------------------- Zone Priority Logic (Generic) --------------------
function calculateZonePriority(zone: any, effectiveDistance: number, totalTripDistance: number): number {
  // Higher priority = better
  let priority = 0;
  
  // 1. Distance-based priority - closer zones get higher priority
  const distancePriority = Math.max(0, 1 - (effectiveDistance / 50)); // Normalize to 0-1 (50 mile max)
  
  // 2. Zone type priority based on name patterns (optional, can be removed if not needed)
  const zoneName = zone.name.toLowerCase();
  let typePriority = 1;
  
  // Generic type detection (can be customized or removed)
  if (zoneName.includes('airport') && effectiveDistance < 5) {
    typePriority = 2; // Airport zones preferred for nearby airport pickups
  } else if ((zoneName.includes('city') || zoneName.includes('central') || zoneName.includes('downtown')) && effectiveDistance < 3) {
    typePriority = 1.5; // City centers preferred for city pickups
  } else if (effectiveDistance < 2) {
    typePriority = 1.2; // Any very close zone gets slight boost
  }
  
  priority = distancePriority * typePriority;
  
  console.log(`[Zone Priority] ${zone.name}: distance=${effectiveDistance.toFixed(2)}mi, typePriority=${typePriority}, finalPriority=${priority.toFixed(2)}`);
  
  return priority;
}

// -------------------- Coordinate Debugging --------------------
async function debugCoordinateIssues(
  pickupLocation: string, 
  dropoffLocation: string,
  fromCoords: { lat: number; lng: number } | null,
  toCoords: { lat: number; lng: number } | null
) {
  console.log(`\n[COORDINATE DEBUG]`);
  console.log(`[COORDINATE DEBUG] Raw pickup: "${pickupLocation}"`);
  console.log(`[COORDINATE DEBUG] Raw dropoff: "${dropoffLocation}"`);
  console.log(`[COORDINATE DEBUG] Parsed pickup:`, fromCoords);
  console.log(`[COORDINATE DEBUG] Parsed dropoff:`, toCoords);
  
  if (!fromCoords || !toCoords) {
    console.error(`[COORDINATE DEBUG] ❌ Coordinate parsing failed`);
    return;
  }
}

// -------------------- Distance Debugging --------------------
async function debugDistanceComparison(
  pickupLat: number, 
  pickupLng: number, 
  dropoffLat: number, 
  dropoffLng: number, 
  zone: any
) {
  console.log(`\n[DEBUG DISTANCE COMPARISON] for ${zone.name}`);
  
  // Test 1: Pickup to Dropoff
  const toDropoff = await calculateRobustDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
  console.log(`📍 Pickup to Dropoff: ${toDropoff.distance} miles`);
  
  // Test 2: Pickup to Zone Center
  const [zoneLng, zoneLat] = getZoneLogicalCenter(zone);
  const toZoneCenter = await calculateRobustDistance(pickupLat, pickupLng, zoneLat, zoneLng);
  console.log(`📍 Pickup to Zone Center: ${toZoneCenter.distance} miles`);
  
  // Test 3: Straight-line distances for comparison
  const straightLineToZone = turf.distance(
    turf.point([pickupLng, pickupLat]),
    turf.point([zoneLng, zoneLat]),
    { units: 'miles' }
  );
  console.log(`📐 Straight-line to Zone Center: ${straightLineToZone.toFixed(2)} miles`);
  
  // Analysis
  console.log(`\n[ANALYSIS]`);
  console.log(`  Pickup→Dropoff: ${toDropoff.distance} miles`);
  console.log(`  Pickup→Zone: ${toZoneCenter.distance} miles`);
  if (straightLineToZone > 0) {
    console.log(`  Road/Straight-line ratio: ${(toZoneCenter.distance / straightLineToZone).toFixed(2)}x`);
  }
}

// -------------------- Token / third-party API fetch --------------------
export const getBearerToken = async (url: string, userId: string, password: string): Promise<string> => {
  console.log(`[Auth] Getting bearer token for URL: ${url}, User: ${userId}`);
  
  try {
    const response = await axios.post('https://sandbox.iway.io/transnextgen/v3/auth/login', {
      user_id: userId,
      password,
    });
    const token = response.data?.result?.token;
    
    if (!token) {
      console.error("[Auth] Invalid token response while fetching bearer token");
      throw new Error("Token not found in the response.");
    }
    
    console.log(`[Auth] Successfully obtained bearer token`);
    return token;
  } catch (error: any) {
    console.error("[Auth] Error in getBearerToken:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw new Error("Failed to retrieve Bearer token.");
  }
};

export const fetchFromThirdPartyApis = async (
  validApiDetails: { url: string; username: string; password: string; supplier_id: string }[],
  dropoffLocation: string,
  pickupLocation: string,
  targetCurrency: string
): Promise<any[]> => {
  console.log(`[Third Party API] Fetching from ${validApiDetails.length} third-party APIs`);
  console.log(`[Third Party API] Pickup: ${pickupLocation}, Dropoff: ${dropoffLocation}, Currency: ${targetCurrency}`);

  const results = await Promise.all(
    validApiDetails.map(async ({ url, username, password, supplier_id }) => {
      console.log(`[Third Party API] Processing API: ${url}, Supplier: ${supplier_id}`);
      
      try {
        const token = await getBearerToken(url, username, password);
        const apiUrl = `${url}?user_id=${username}&lang=en&currency=${targetCurrency}&start_place_point=${pickupLocation}&finish_place_point=${dropoffLocation}`;
        
        console.log(`[Third Party API] Making request to: ${apiUrl}`);
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const vehicles = (response.data?.result || []).map((item: any) => ({
          vehicalType: item.car_class?.title || "Unknown",
          brand: item.car_class?.models?.[0] || "Unknown",
          price: item.price || 0,
          currency: item.currency || "USD",
          passengers: item.car_class?.capacity || 0,
          mediumBag: item.car_class?.luggage_capacity || 0,
          source: "api",
          SmallBag: 0,
          supplierId: supplier_id,
        }));

        console.log(`[Third Party API] Successfully fetched ${vehicles.length} vehicles from ${url}`);
        return vehicles;
      } catch (error: any) {
        console.error(`[Third Party API] Error fetching data from ${url}:`, error?.message || error);
        return [{ source: url, error: error?.message || "unknown" }];
      }
    })
  );

  const allVehicles = results.flat();
  console.log(`[Third Party API] Total vehicles from all third-party APIs: ${allVehicles.length}`);
  return allVehicles;
};

// -------------------- Vehicle comparison helpers --------------------
function areVehiclesSimilar(vehicle1: any, vehicle2: any): boolean {
  const isSimilar = (
    vehicle1.vehicalType === vehicle2.vehicalType &&
    vehicle1.brand === vehicle2.brand &&
    vehicle1.passengers === vehicle2.passengers &&
    vehicle1.mediumBag === vehicle2.mediumBag &&
    vehicle1.SmallBag === vehicle2.SmallBag &&
    vehicle1.supplierId === vehicle2.supplierId
  );
  
  console.log(`[Vehicle Comparison] Vehicles similar: ${isSimilar}`, {
    vehicle1: `${vehicle1.vehicalType} - ${vehicle1.brand} - ${vehicle1.passengers}p - ${vehicle1.supplierId}`,
    vehicle2: `${vehicle2.vehicalType} - ${vehicle2.brand} - ${vehicle2.passengers}p - ${vehicle2.supplierId}`
  });
  
  return isSimilar;
}

function optimizeSupplierVehicles(vehicles: any[]): any[] {
  console.log(`[Optimization] Optimizing ${vehicles.length} vehicles for same supplier`);
  
  const vehicleGroups = new Map();
  
  // Group vehicles by supplier and characteristics
  vehicles.forEach(vehicle => {
    const key = `${vehicle.supplierId}_${vehicle.vehicalType}_${vehicle.brand}_${vehicle.passengers}_${vehicle.mediumBag}_${vehicle.SmallBag}`;
    
    if (!vehicleGroups.has(key)) {
      vehicleGroups.set(key, []);
    }
    vehicleGroups.get(key).push(vehicle);
  });
  
  const optimizedVehicles: any[] = [];
  
  // For each group, keep the one with lowest price
  vehicleGroups.forEach((groupVehicles, key) => {
    if (groupVehicles.length === 1) {
      // Unique vehicle, always keep it
      console.log(`[Optimization] Keeping unique vehicle: ${groupVehicles[0].vehicalType} from supplier ${groupVehicles[0].supplierId}`);
      optimizedVehicles.push(groupVehicles[0]);
    } else {
      // Multiple similar vehicles from same supplier, keep the cheapest one
      const cheapestVehicle = groupVehicles.reduce((cheapest, current) => 
        current.price < cheapest.price ? current : cheapest
      );
      
      console.log(`[Optimization] Found ${groupVehicles.length} similar vehicles from supplier ${cheapestVehicle.supplierId}`);
      console.log(`[Optimization] Keeping cheapest: ${cheapestVehicle.vehicalType} at price ${cheapestVehicle.price} (had ${groupVehicles.length} options)`);
      
      // Log all prices for transparency
      groupVehicles.forEach((v: any, i: number) => {
        console.log(`[Optimization] Option ${i + 1}: ${v.price} ${v.currency} from zone ${v.zoneName}`);
      });
      
      optimizedVehicles.push(cheapestVehicle);
    }
  });
  
  console.log(`[Optimization] Reduced from ${vehicles.length} to ${optimizedVehicles.length} vehicles for supplier`);
  return optimizedVehicles;
}

// -------------------- Price Formatting --------------------
function formatPrice(price: number): number {
    return Math.round(price * 100) / 100;
}

// -------------------- Main fetchFromDatabase with ROAD DISTANCE --------------------
export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string }> => {
  console.log(`[Database] Starting database fetch with ROAD DISTANCE calculation`);
  console.log(`[Database] Pickup: "${pickupLocation}", Dropoff: "${dropoffLocation}"`);

  // Parse coordinates with enhanced validation
  console.log(`[Database] Parsing coordinates...`);
  const fromCoords = parseCoordinate(pickupLocation);
  const toCoords = parseCoordinate(dropoffLocation);
  
  // Debug coordinate parsing
  await debugCoordinateIssues(pickupLocation, dropoffLocation, fromCoords, toCoords);
  
  if (!fromCoords || !toCoords) {
    console.error("[Database] Invalid coordinates provided");
    throw new Error("Invalid pickup or dropoff coordinates");
  }

  const { lat: fromLat, lng: fromLng } = fromCoords;
  const { lat: toLat, lng: toLng } = toCoords;

  console.log(`[Database] Final coordinates - From: (${fromLat}, ${fromLng}) To: (${toLat}, ${toLng})`);

  try {
    // 1) Load all isochrone zones
    console.log(`[Database] Loading all isochrone zones from database`);
    const zonesResult = await db.execute(sql`SELECT id, name, radius_km, geojson FROM zones`);
    const allZones = zonesResult.rows as any[];
    console.log(`[Database] Loaded ${allZones.length} isochrone zones from database`);

    // 2) Find ALL isochrone zones containing pickup location (OVERLAPPING ZONES)
    const overlappingZones = getZonesContainingPoint(fromLng, fromLat, allZones);
    console.log(`[Database] Pickup location is inside ${overlappingZones.length} overlapping zones:`, overlappingZones.map(z => z.name));

    if (overlappingZones.length === 0) {
      console.error("[Database] No overlapping zones found for the pickup location");
      throw new Error("No zones found for the selected pickup location.");
    }

    // 3) Calculate ROAD distance from pickup to dropoff
    console.log(`[Database] Calculating ROAD distance from pickup to dropoff`);
    const distanceResult = await calculateRobustDistance(fromLat, fromLng, toLat, toLng);
    
    if (distanceResult.distance === null) {
      console.error("[Database] All distance methods failed");
      throw new Error("Could not calculate road distance");
    }

    const totalTripDistance = distanceResult.distance;
    const duration = distanceResult.duration;
    
    console.log(`[Database] Total trip ROAD distance: ${totalTripDistance} miles, Duration: ${duration}`);

    // 4) Debug distance comparison for zones
    for (const zone of overlappingZones.slice(0, 3)) { // Limit to first 3 zones to avoid too many API calls
      await debugDistanceComparison(fromLat, fromLng, toLat, toLng, zone);
    }

    // 5) Fetch ALL vehicles from ALL overlapping zones
    let allTransfers: any[] = [];
    
    // Query each overlapping zone separately
    for (const zone of overlappingZones) {
      console.log(`[Database] Fetching vehicles from overlapping zone: ${zone.name} (${zone.id})`);
      
      const transfersResult = await db.execute(sql`
        SELECT 
          t.*, 
          v.*, 
          t.extra_price_per_mile, 
          z.name as zone_name, 
          z.radius_km as zone_radius,
          z.id as zone_id
        FROM "Vehicle_transfers" t
        JOIN "all_Vehicles" v ON t.vehicle_id = v.id
        JOIN zones z ON t.zone_id = z.id
        WHERE t.zone_id = ${zone.id}::uuid
      `);
      
      const zoneTransfers = transfersResult.rows as any[];
      console.log(`[Database] Found ${zoneTransfers.length} vehicles in overlapping zone ${zone.name}`);
      
      // Add zone information to each vehicle
      const vehiclesWithZoneInfo = zoneTransfers.map(vehicle => ({
        ...vehicle,
        zone_data: zone // Attach full zone data
      }));
      
      allTransfers = allTransfers.concat(vehiclesWithZoneInfo);
    }

    console.log(`[Database] Total vehicles across all overlapping zones: ${allTransfers.length}`);

    // 6) Supporting static data
    console.log(`[Database] Loading supporting data (vehicle types, margins, surge charges)`);
    const [vehicleTypesResult, marginsResult, surgeChargesResult] = await Promise.all([
      db.execute(sql`SELECT id, "VehicleType", "vehicleImage" FROM "VehicleType"`),
      db.execute(sql`SELECT * FROM "Margin"`),
      db.execute(sql`SELECT * FROM "SurgeCharge" WHERE "From" <= ${date}::date AND "To" >= ${date}::date`)
    ]);

    const vehicleTypes = vehicleTypesResult.rows as any[];
    const margins = marginsResult.rows as any[];
    const supplierMargins = new Map<string, number>();
    
    for (const margin of margins) {
      if (margin.supplier_id && margin.MarginPrice) {
        supplierMargins.set(margin.supplier_id, Number(margin.MarginPrice));
        console.log(`[Database] Set margin for supplier ${margin.supplier_id}: ${margin.MarginPrice}%`);
      }
    }
    
    const surgeCharges = surgeChargesResult.rows as any[];
    console.log(`[Database] Loaded ${vehicleTypes.length} vehicle types, ${margins.length} margins, ${surgeCharges.length} surge charges`);

    // 7) Calculate optimal pricing for each vehicle across overlapping zones USING ROAD DISTANCE
    console.log(`[Zone Optimization] Calculating optimal pricing across ${overlappingZones.length} overlapping zones USING ROAD DISTANCE`);
    
    const vehicleGroups = new Map();
    
    // Group vehicles by type and supplier
    allTransfers.forEach(vehicle => {
      const key = `${vehicle.VehicleType}_${vehicle.VehicleBrand}_${vehicle.Passengers}_${vehicle.SupplierId}`;
      if (!vehicleGroups.has(key)) {
        vehicleGroups.set(key, []);
      }
      vehicleGroups.get(key).push(vehicle);
    });

    console.log(`[Zone Optimization] Found ${vehicleGroups.size} unique vehicle types to optimize`);

    const optimizedVehicles: any[] = [];
    
    // For each vehicle type, find the best zone with lowest price
    for (const [vehicleKey, vehicles] of vehicleGroups.entries()) {
      const [vehicleType, brand, passengers, supplierId] = vehicleKey.split('_');
      
      console.log(`\n[Zone Optimization] Processing vehicle type: ${vehicleType} - ${brand} - ${passengers}p - Supplier: ${supplierId}`);
      
      let bestVehicle: any = null;
      let bestScore = -Infinity;
      
      // Calculate price for this vehicle type in each overlapping zone
      for (const vehicle of vehicles) {
        const zone = vehicle.zone_data;
        
        console.log(`[Zone Optimization] Calculating price for zone: ${zone.name}`);
        
        // Calculate ROAD distance from pickup location to zone center
        const effectiveDistanceResult = await calculateEffectiveDistance(fromLng, fromLat, zone);
        const effectiveDistance = effectiveDistanceResult.distance;
        
        console.log(`[Zone Optimization] ${effectiveDistanceResult.isRoadDistance ? 'ROAD' : 'ESTIMATED'} distance from pickup to zone center: ${effectiveDistance.toFixed(2)} miles`);
        if (effectiveDistanceResult.fallbackReason) {
          console.log(`[Zone Optimization] Fallback reason: ${effectiveDistanceResult.fallbackReason}`);
        }
        
        // Get zone radius (convert km to miles)
        const zoneRadiusMiles = Math.max(1, (Number(zone.radius_km) || 10));
        console.log(`[Zone Optimization] Zone radius: ${zoneRadiusMiles.toFixed(2)} miles`);
        
        // Calculate available coverage within zone
        const availableMilesInZone = Math.max(0, zoneRadiusMiles - effectiveDistance);
        console.log(`[Zone Optimization] Available miles within zone: ${zoneRadiusMiles.toFixed(2)} - ${effectiveDistance.toFixed(2)} = ${availableMilesInZone.toFixed(2)} miles`);
        
        // Calculate extra miles beyond zone coverage
        const extraMiles = Math.max(0, totalTripDistance - availableMilesInZone);
        console.log(`[Zone Optimization] Extra miles beyond zone: ${totalTripDistance} - ${availableMilesInZone.toFixed(2)} = ${extraMiles.toFixed(2)} miles`);
        
        // Calculate total price
        const basePrice = Number(vehicle.price) || 0;
        const extraPricePerMile = Number(vehicle.extra_price_per_mile) || 0;
        const extraCost = extraMiles * extraPricePerMile;
        const totalPrice = formatPrice(Math.max(basePrice, basePrice + extraCost)); // At least base price
        
        // Calculate zone priority
        const zonePriority = calculateZonePriority(zone, effectiveDistance, totalTripDistance);
        
        // Combined score: lower price + higher priority
        const priceScore = 1000 / (totalPrice + 1); // Inverse of price (higher is better)
        const combinedScore = priceScore * zonePriority;
        
        console.log(`[Zone Optimization] ${zone.name}:`);
        console.log(`  Price: $${totalPrice.toFixed(2)} (base: $${basePrice}, extra: $${extraCost.toFixed(2)})`);
        console.log(`  Zone Priority: ${zonePriority.toFixed(2)}`);
        console.log(`  Combined Score: ${combinedScore.toFixed(2)}`);
        
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestVehicle = {
            ...vehicle,
            optimizedPrice: totalPrice,
            selected_zone: zone,
            zonePriority: zonePriority,
            priceDetails: {
              basePrice,
              extraMiles,
              extraCost,
              availableMilesInZone,
              effectiveDistance,
              zoneRadiusMiles,
              totalTripDistance,
              isRoadDistance: effectiveDistanceResult.isRoadDistance,
              fallbackReason: effectiveDistanceResult.fallbackReason
            }
          };
          console.log(`  ✅ NEW BEST: score ${combinedScore.toFixed(2)}`);
        }
      }
      
      if (bestVehicle) {
        console.log(`[Zone Optimization] 🏆 Selected: ${bestVehicle.selected_zone.name} with score ${bestScore.toFixed(2)}`);
        optimizedVehicles.push(bestVehicle);
      } else {
        console.log(`[Zone Optimization] ❌ No optimal vehicle found for ${vehicleKey}`);
        // Fallback: use first available vehicle
        if (vehicles.length > 0) {
          console.log(`[Zone Optimization] Using fallback: first available vehicle`);
          optimizedVehicles.push({
            ...vehicles[0],
            selected_zone: vehicles[0].zone_data,
            optimizedPrice: Number(vehicles[0].price) || 0
          });
        }
      }
    }

    console.log(`[Zone Optimization] Final optimized vehicles: ${optimizedVehicles.length}`);

    // 8) Apply final pricing with fees, margins, etc. to optimized vehicles
    console.log(`[Database] Applying final pricing to ${optimizedVehicles.length} optimized vehicles`);
    const allVehiclesWithPricing = await Promise.all(
      optimizedVehicles.map(async (vehicle, index) => {
        console.log(`[Pricing] Processing optimized vehicle ${index + 1}: ${vehicle.VehicleType} from zone ${vehicle.selected_zone.name}`);
        
        // Start with the optimized base price
        let totalPrice = vehicle.optimizedPrice || Number(vehicle.price) || 0;
        console.log(`[Pricing] Starting with optimized price: ${totalPrice.toFixed(2)}`);

        // Add fixed fees
        const fees = {
          vehicleTax: Number(vehicle.vehicleTax) || 0,
          parking: Number(vehicle.parking) || 0,
          tollTax: Number(vehicle.tollTax) || 0,
          driverCharge: Number(vehicle.driverCharge) || 0,
          driverTips: Number(vehicle.driverTips) || 0,
        };

        Object.entries(fees).forEach(([feeName, feeAmount]) => {
          if (feeAmount > 0) {
            totalPrice += feeAmount;
            console.log(`[Pricing] Added ${feeName}: ${feeAmount}, New total: ${totalPrice.toFixed(2)}`);
          }
        });

        // Night time
        const [hour] = time.split(":").map(Number);
        const isNightTime = (hour >= 22 || hour < 6);
        if (isNightTime && vehicle.NightTime_Price) {
          totalPrice += Number(vehicle.NightTime_Price);
          console.log(`[Pricing] Added night time charge: ${vehicle.NightTime_Price}, New total: ${totalPrice.toFixed(2)}`);
        }

        // Surge
        const vehicleSurge = surgeCharges.find((s: any) => s.vehicle_id === vehicle.vehicle_id && s.supplier_id === vehicle.SupplierId);
        if (vehicleSurge && vehicleSurge.SurgeChargePrice) {
          totalPrice += Number(vehicleSurge.SurgeChargePrice);
          console.log(`[Pricing] Added surge charge: ${vehicleSurge.SurgeChargePrice}, New total: ${totalPrice.toFixed(2)}`);
        }

        // Apply supplier margin
        const margin = supplierMargins.get(vehicle.SupplierId) || 0;
        if (margin > 0) {
          const marginAmount = totalPrice * (Number(margin) / 100);
          totalPrice += marginAmount;
          console.log(`[Pricing] Added supplier margin (${margin}%): ${marginAmount.toFixed(2)}, New total: ${totalPrice.toFixed(2)}`);
        }

        // Return trip price (if any)
        let returnPrice = 0;
        const isReturnTrip = !!returnDate && !!returnTime;
        
        if (isReturnTrip) {
          console.log(`[Pricing] Calculating return trip pricing`);
          
          // For return trip, use the same optimization logic
          const effectiveDistance = vehicle.priceDetails.effectiveDistance;
          const basePrice = Number(vehicle.price) || 0;
          const extraPricePerMile = Number(vehicle.extra_price_per_mile) || 0;
          const zoneRadiusMiles = vehicle.priceDetails.zoneRadiusMiles;
          
          const availableMilesInZone = Math.max(0, zoneRadiusMiles - effectiveDistance);
          const extraMiles = Math.max(0, totalTripDistance - availableMilesInZone);
          returnPrice = basePrice + (extraMiles * extraPricePerMile);
          
          console.log(`[Pricing] Return trip base calculation: ${basePrice} + (${extraMiles} × ${extraPricePerMile}) = ${returnPrice}`);

          const returnFees = {
            vehicleTax: Number(vehicle.vehicleTax) || 0,
            parking: Number(vehicle.parking) || 0,
            tollTax: Number(vehicle.tollTax) || 0,
            driverCharge: Number(vehicle.driverCharge) || 0,
            driverTips: Number(vehicle.driverTips) || 0,
          };

          Object.entries(returnFees).forEach(([feeName, feeAmount]) => {
            if (feeAmount > 0) {
              returnPrice += feeAmount;
              console.log(`[Pricing] Added return ${feeName}: ${feeAmount}, Return total: ${returnPrice.toFixed(2)}`);
            }
          });

          const [returnHour] = returnTime.split(":").map(Number);
          const isReturnNightTime = (returnHour >= 22 || returnHour < 6);
          if (isReturnNightTime && vehicle.NightTime_Price) {
            returnPrice += Number(vehicle.NightTime_Price);
            console.log(`[Pricing] Added return night time charge: ${vehicle.NightTime_Price}, Return total: ${returnPrice.toFixed(2)}`);
          }

          const returnSurge = surgeCharges.find((s: any) =>
            s.vehicle_id === vehicle.vehicle_id &&
            s.supplier_id === vehicle.SupplierId &&
            s.From <= returnDate &&
            s.To >= returnDate
          );
          if (returnSurge && returnSurge.SurgeChargePrice) {
            returnPrice += Number(returnSurge.SurgeChargePrice);
            console.log(`[Pricing] Added return surge charge: ${returnSurge.SurgeChargePrice}, Return total: ${returnPrice.toFixed(2)}`);
          }

          // Apply margin on return price
          if (margin > 0) {
            const returnMarginAmount = returnPrice * (Number(margin) / 100);
            returnPrice += returnMarginAmount;
            console.log(`[Pricing] Added return supplier margin (${margin}%): ${returnMarginAmount.toFixed(2)}, Return total: ${returnPrice.toFixed(2)}`);
          }
        }

        totalPrice += returnPrice;
        totalPrice = formatPrice(totalPrice);
        console.log(`[Pricing] Final price before currency conversion: ${totalPrice} ${vehicle.Currency || "USD"}`);

        // Currency convert
        const convertedPrice = await convertCurrency(totalPrice, vehicle.Currency || "USD", targetCurrency);
        const finalPrice = formatPrice(convertedPrice);
        console.log(`[Pricing] Final converted price: ${finalPrice} ${targetCurrency}`);

        // Vehicle image lookup
        const image = vehicleTypes.find((type: any) =>
          String(type.VehicleType || "").toLowerCase().trim() === String(vehicle.VehicleType || "").toLowerCase().trim()
        ) || { vehicleImage: "default-image-url-or-path" };

        console.log(`[Pricing] Completed pricing for optimized vehicle ${index + 1} from zone ${vehicle.selected_zone.name}`);
        
        return {
          vehicleId: vehicle.vehicle_id,
          vehicleImage: image.vehicleImage,
          vehicalType: vehicle.VehicleType,
          brand: vehicle.VehicleBrand,
          vehicleName: vehicle.name,
          parking: vehicle.parking,
          vehicleTax: vehicle.vehicleTax,
          tollTax: vehicle.tollTax,
          driverTips: vehicle.driverTips,
          driverCharge: vehicle.driverCharge,
          extraPricePerKm: vehicle.extra_price_per_mile,
          price: finalPrice,
          nightTime: vehicle.NightTime,
          passengers: vehicle.Passengers,
          currency: targetCurrency,
          mediumBag: vehicle.MediumBag,
          SmallBag: vehicle.SmallBag,
          nightTimePrice: vehicle.NightTime_Price,
          transferInfo: vehicle.Transfer_info,
          supplierId: vehicle.SupplierId,
          zoneId: vehicle.selected_zone.id,
          zoneName: vehicle.selected_zone.name,
          originalPrice: Number(vehicle.price) || 0,
          optimizedPrice: vehicle.optimizedPrice,
          isFromOverlappingZone: overlappingZones.length > 1,
          optimizationDetails: vehicle.priceDetails,
          // Additional fields from your vehicle schema
          serviceType: vehicle.ServiceType,
          vehicleModel: vehicle.VehicleModel,
          doors: vehicle.Doors,
          seats: vehicle.Seats,
          cargo: vehicle.Cargo,
          extraSpace: vehicle.ExtraSpace
        };
      })
    );

    // 9) Remove duplicate vehicles (same type from same supplier)
    console.log(`[Database] Removing duplicate vehicles from same supplier`);
    const uniqueVehiclesMap = new Map();
    
    allVehiclesWithPricing.forEach(vehicle => {
      const key = `${vehicle.vehicalType}_${vehicle.brand}_${vehicle.passengers}_${vehicle.supplierId}`;
      
      if (!uniqueVehiclesMap.has(key) || vehicle.price < uniqueVehiclesMap.get(key).price) {
        uniqueVehiclesMap.set(key, vehicle);
      }
    });
    
    const finalVehicles = Array.from(uniqueVehiclesMap.values());
    console.log(`[Database] Final unique vehicles: ${finalVehicles.length}`);

    // Log optimization summary
    const zonesUsed = new Set(finalVehicles.map(v => v.zoneName));
    const roadDistanceCount = finalVehicles.filter(v => v.optimizationDetails?.isRoadDistance).length;
    
    console.log(`[Zone Optimization] Summary:`);
    console.log(`  Using ${zonesUsed.size} optimal zones:`, Array.from(zonesUsed));
    console.log(`  Road distance used for ${roadDistanceCount}/${finalVehicles.length} vehicles`);
    
    // Log pricing comparison
    finalVehicles.forEach(vehicle => {
      const distanceType = vehicle.optimizationDetails?.isRoadDistance ? 'ROAD' : 'ESTIMATED';
      console.log(`[Final] ${vehicle.vehicalType} - ${vehicle.brand}: ${vehicle.price} ${targetCurrency} (Zone: ${vehicle.zoneName}, ${distanceType})`);
    });

    return { 
      vehicles: finalVehicles, 
      distance: totalTripDistance, 
      estimatedTime: duration
    };
  } catch (error: any) {
    console.error("[Database] Error in zone optimization:", error?.message || error);
    throw new Error("Failed to optimize zones and vehicle pricing.");
  }
};

// -------------------- Test Endpoint for Coordinate Validation --------------------
export const TestCoordinates = async (req: Request, res: Response) => {
  const { coordinates } = req.body;
  
  console.log(`[Test] Testing coordinate parsing: "${coordinates}"`);
  
  const parsed = parseCoordinate(coordinates);
  
  if (!parsed) {
    return res.status(400).json({ 
      success: false, 
      error: "Failed to parse coordinates",
      input: coordinates 
    });
  }
  
  res.json({
    success: true,
    input: coordinates,
    parsed: parsed
  });
};

// -------------------- Debug Endpoint for Distance Testing --------------------
export const DebugDistance = async (req: Request, res: Response) => {
  const { pickup, dropoff } = req.body;
  
  console.log(`[Debug] Testing distance calculation`);
  console.log(`[Debug] Pickup: ${pickup}, Dropoff: ${dropoff}`);
  
  const fromCoords = parseCoordinate(pickup);
  const toCoords = parseCoordinate(dropoff);
  
  if (!fromCoords || !toCoords) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  const { lat: fromLat, lng: fromLng } = fromCoords;
  const { lat: toLat, lng: toLng } = toCoords;

  // Test both APIs
  const distanceMatrixResult = await getRoadDistance(fromLat, fromLng, toLat, toLng);
  const directionsResult = await getDistanceUsingDirections(fromLat, fromLng, toLat, toLng);
  const robustResult = await calculateRobustDistance(fromLat, fromLng, toLat, toLng);

  res.json({
    coordinates: { 
      from: { lat: fromLat, lng: fromLng }, 
      to: { lat: toLat, lng: toLng } 
    },
    distanceMatrix: distanceMatrixResult,
    directions: directionsResult,
    robust: robustResult
  });
};

// -------------------- Search controller --------------------
export const Search = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`[Search] Starting search request`);
  console.log(`[Search] Request body:`, JSON.stringify(req.body, null, 2));

  const { date, dropoff, dropoffLocation, pax, pickup, pickupLocation, targetCurrency, time, returnDate, returnTime } = req.body;

  try {
    // Fetch API details from the database
    console.log(`[Search] Fetching API details from database`);
    const apiDetails = await db
      .select({
        url: SupplierApidataTable.Api,
        username: SupplierApidataTable.Api_User,
        password: SupplierApidataTable.Api_Password,
        supplier_id: SupplierApidataTable.Api_Id_Foreign,
      })
      .from(SupplierApidataTable);

    const validApiDetails = apiDetails.filter((detail) => detail.url !== null) as { url: string; username: string; password: string, supplier_id: string }[];
    console.log(`[Search] Found ${validApiDetails.length} valid API configurations`);

    // Fetch data from third-party APIs
    const apiData = await fetchFromThirdPartyApis(validApiDetails, dropoffLocation, pickupLocation, targetCurrency);

    // Database data
    const DatabaseData = await fetchFromDatabase(pickupLocation, dropoffLocation, targetCurrency, time, date, returnDate, returnTime);
    
    // Merge data
    const mergedData = [ ...apiData.flat(), ...DatabaseData.vehicles];
    console.log(`[Search] Data merge complete - API: ${apiData.length}, Database: ${DatabaseData.vehicles.length}, Total: ${mergedData.length}`);

    console.log(`[Search] Search request completed successfully`);
    res.json({ 
      success: true, 
      data: mergedData, 
      distance: DatabaseData.distance, 
      estimatedTime: DatabaseData.estimatedTime
    });
  } catch (error: any) {
    console.error("[Search] Error fetching and merging data:", error?.message || error);
    res.status(500).json({ 
      success: false, 
      message: "Error processing request", 
      error: error?.message || error 
    });
  }
};

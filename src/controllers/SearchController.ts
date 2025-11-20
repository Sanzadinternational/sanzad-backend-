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

// -------------------- Coordinate Validation --------------------
function isValidCoordinate(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
}

function parseCoordinate(coordString: string): { lat: number; lng: number } | null {
  try {
    const parts = coordString.split(",").map(part => parseFloat(part.trim()));
    if (parts.length !== 2) {
      console.error(`[Coordinate] Invalid coordinate format: ${coordString}`);
      return null;
    }
    
    const [first, second] = parts;
    
    // Determine which is lat and which is lng
    let lat, lng;
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
      // Standard format: lat,lng
      lat = first;
      lng = second;
    } else if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
      // Possibly swapped: lng,lat
      lat = second;
      lng = first;
      console.warn(`[Coordinate] Coordinates might be swapped, correcting: ${coordString} -> (${lat}, ${lng})`);
    } else {
      console.error(`[Coordinate] Invalid coordinate values: ${coordString}`);
      return null;
    }
    
    if (!isValidCoordinate(lat, lng)) {
      console.error(`[Coordinate] Invalid coordinate range: (${lat}, ${lng})`);
      return null;
    }
    
    return { lat, lng };
  } catch (error) {
    console.error(`[Coordinate] Error parsing coordinate: ${coordString}`, error);
    return null;
  }
}

// -------------------- Enhanced Distance Helper with Debugging --------------------
export async function getRoadDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  console.log(`[Distance] Getting road distance from (${fromLat}, ${fromLng}) to (${toLat}, ${toLng})`);
  
  // Validate coordinates
  if (!isValidCoordinate(fromLat, fromLng) || !isValidCoordinate(toLat, toLng)) {
    console.error(`[Distance] Invalid coordinates: From(${fromLat}, ${fromLng}) To(${toLat}, ${toLng})`);
    return { distance: null, duration: null, straightLineDistance: null };
  }

  // Check for same coordinates
  if (fromLat === toLat && fromLng === toLng) {
    console.log(`[Distance] Same coordinates, distance is 0`);
    return { 
      distance: 0, 
      duration: "0 mins", 
      straightLineDistance: 0,
      distanceMeters: 0,
      straightLineMeters: 0
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
      return { distance: null, duration: null, straightLineDistance: null, error: "API quota exceeded" };
    }
    
    if (response.data.status === "REQUEST_DENIED") {
      console.error("[Distance] Google Maps API request denied:", response.data.error_message);
      return { distance: null, duration: null, straightLineDistance: null, error: "API request denied" };
    }
    
    const element = response.data.rows[0]?.elements[0];
    
    if (!element) {
      console.error("[Distance] No route elements found in response");
      return { distance: null, duration: null, straightLineDistance: null };
    }

    console.log(`[Distance] Element Status: ${element.status}`);
    
    if (element.status !== "OK") {
      console.error(`[Distance] Route error: ${element.status}`, element);
      return { distance: null, duration: null, straightLineDistance: null };
    }

    const distanceText = element.distance?.text;
    const durationText = element.duration?.text;
    const distanceMeters = element.distance?.value; // Distance in meters
    
    if (!distanceText || !durationText) {
      console.error("[Distance] Distance or duration not found in response");
      return { distance: null, duration: null, straightLineDistance: null };
    }
    
    const distance = parseFloat(distanceText.replace(" mi", "").replace(",", ""));
    console.log(`[Distance] Road distance: ${distance} miles (${distanceMeters} meters), Duration: ${durationText}`);
    
    // Calculate straight-line distance for comparison
    const straightLineDistance = turf.distance(
      turf.point([fromLng, fromLat]),
      turf.point([toLng, toLat]),
      { units: 'miles' }
    );
    
    console.log(`[Distance] Straight-line distance: ${straightLineDistance.toFixed(2)} miles`);
    console.log(`[Distance] Road vs Straight-line ratio: ${(distance / straightLineDistance).toFixed(2)}x`);
    
    // Warn if ratio is too high (possible issue)
    const ratio = distance / straightLineDistance;
    if (ratio > 2) {
      console.warn(`[Distance] ⚠️ High distance ratio: ${ratio.toFixed(2)}x - Road distance much longer than straight-line`);
    }
    
    return {
      distance,
      duration: durationText,
      straightLineDistance: straightLineDistance,
      distanceMeters,
    };
  } catch (error: any) {
    console.error("[Distance] Error fetching road distance:", error?.response?.data || error?.message || error);
    
    if (error.code === 'ECONNABORTED') {
      console.error("[Distance] Request timeout");
      return { distance: null, duration: null, straightLineDistance: null, error: "Request timeout" };
    }
    
    return { distance: null, duration: null, straightLineDistance: null };
  }
}

// -------------------- Alternative Directions API (More Accurate) --------------------
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
    const distance = leg.distance.value / 1609.34; // meters to miles
    const duration = leg.duration.text;
    
    console.log(`[Directions] Distance: ${distance.toFixed(2)} miles, Duration: ${duration}`);
    console.log(`[Directions] Route summary: ${route.summary}`);
    
    return { 
      distance, 
      duration,
      summary: route.summary,
      steps: leg.steps.length
    };
  } catch (error) {
    console.error("[Directions] Error:", error?.response?.data || error);
    return null;
  }
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

// -------------------- Zone Logical Centers --------------------
function getZoneLogicalCenter(zone: any): [number, number] {
  const zoneName = zone.name.toLowerCase();
  
  // Use actual known coordinates for major landmarks
  if (zoneName.includes('fco') || zoneName.includes('airport') || zoneName.includes('leonardo')) {
    console.log(`[Zone Center] Using actual FCO airport coordinates`);
    return [12.2500, 41.8000]; // Actual FCO Airport coordinates [lng, lat]
  }
  
  if (zoneName.includes('termini') || zoneName.includes('station')) {
    console.log(`[Zone Center] Using actual Termini station coordinates`);
    return [12.5020, 41.9006]; // Actual Termini Station coordinates [lng, lat]
  }
  
  // For other zones, use the centroid from GeoJSON
  console.log(`[Zone Center] Using centroid for ${zone.name}`);
  const poly = getPolygonFromIsochrone(zone.geojson);
  const center = turf.centroid(poly);
  return center.geometry.coordinates;
}

// -------------------- Enhanced Effective Distance Calculation --------------------
async function calculateEffectiveDistance(
    pickupLng: number, 
    pickupLat: number, 
    zone: any
): Promise<number> {
    console.log(`[Effective Distance] Calculating ROAD distance to logical center of: ${zone.name}`);
    
    const [zoneLng, zoneLat] = getZoneLogicalCenter(zone);
    
    console.log(`[Coordinates] Pickup: (${pickupLat}, ${pickupLng})`);
    console.log(`[Coordinates] Zone Center: (${zoneLat}, ${zoneLng})`);
    
    const distanceResult = await getRoadDistance(pickupLat, pickupLng, zoneLat, zoneLng);
    
    if (distanceResult.distance === null) {
        // Fallback to straight-line
        const straightLineDistance = turf.distance(
            turf.point([pickupLng, pickupLat]),
            turf.point([zoneLng, zoneLat]),
            { units: 'miles' }
        );
        console.log(`[Effective Distance] Using straight-line fallback: ${straightLineDistance.toFixed(2)} miles`);
        return straightLineDistance;
    }
    
    console.log(`[Effective Distance] Road distance: ${distanceResult.distance} miles`);
    
    // Validate the distance makes sense for known zones
    if (zone.name.includes('FCO') && distanceResult.distance < 18) {
        console.warn(`[Distance Validation] ⚠️ FCO distance seems too low: ${distanceResult.distance} miles (expected ~18-20 miles)`);
        
        // Use known distance estimation as fallback
        const knownDistance = estimateKnownDistance(pickupLng, pickupLat, zone);
        console.log(`[Distance Validation] Using known distance estimation: ${knownDistance} miles`);
        return knownDistance;
    }
    
    return distanceResult.distance;
}

// -------------------- Known Distance Estimation --------------------
function estimateKnownDistance(pickupLng: number, pickupLat: number, zone: any): number {
    const zoneName = zone.name.toLowerCase();
    
    if (zoneName.includes('fco') || zoneName.includes('airport')) {
        // Use known FCO coordinates
        const fcoCoords = { lat: 41.8000, lng: 12.2500 };
        const knownDistance = turf.distance(
            turf.point([pickupLng, pickupLat]),
            turf.point([fcoCoords.lng, fcoCoords.lat]),
            { units: 'miles' }
        );
        
        console.log(`[Known Distance] Pickup to FCO (straight-line): ${knownDistance.toFixed(2)} miles`);
        
        // Apply a reasonable road distance multiplier (typically 1.2-1.4x for city-to-airport)
        const roadDistance = knownDistance * 1.3;
        console.log(`[Known Distance] Estimated road distance: ${roadDistance.toFixed(2)} miles`);
        
        return roadDistance;
    }
    
    // For other zones, return the straight-line distance
    const [zoneLng, zoneLat] = getZoneLogicalCenter(zone);
    const straightLineDistance = turf.distance(
        turf.point([pickupLng, pickupLat]),
        turf.point([zoneLng, zoneLat]),
        { units: 'miles' }
    );
    
    return straightLineDistance * 1.2; // Default multiplier
}

// -------------------- Zone Priority Logic --------------------
function calculateZonePriority(zone: any, effectiveDistance: number, totalTripDistance: number): number {
    // Higher priority = better
    let priority = 0;
    
    // 1. Primary factor: Zone should logically serve the pickup location
    const isAirportZone = zone.name.toLowerCase().includes('airport') || zone.name.toLowerCase().includes('fco');
    const isStationZone = zone.name.toLowerCase().includes('station') || zone.name.toLowerCase().includes('termini');
    const isCityZone = !isAirportZone && !isStationZone;
    
    // 2. Distance-based priority - closer zones get higher priority
    const distancePriority = Math.max(0, 1 - (effectiveDistance / 30)); // Normalize to 0-1 (30 mile max)
    
    // 3. Zone type priority - city/station zones preferred for city pickups
    let typePriority = 1;
    if (isStationZone && effectiveDistance < 1) typePriority = 3; // Station zones for nearby pickups
    else if (isCityZone && effectiveDistance < 2) typePriority = 2; // City zones for city pickups
    else if (isAirportZone && effectiveDistance > 10) typePriority = 0.3; // Airport zones heavily penalized for distant pickups
    else if (isAirportZone && effectiveDistance > 5) typePriority = 0.5; // Airport zones penalized for distant pickups
    
    priority = distancePriority * typePriority;
    
    console.log(`[Zone Priority] ${zone.name}: distance=${effectiveDistance.toFixed(2)}mi, typePriority=${typePriority}, finalPriority=${priority.toFixed(2)}`);
    
    return priority;
}

// -------------------- Distance Debugging --------------------
async function debugDistanceComparison(
    pickupLat: number, 
    pickupLng: number, 
    dropoffLat: number, 
    dropoffLng: number, 
    zone: any
) {
    console.log(`\n[DEBUG DISTANCE COMPARISON]`);
    
    // Test 1: Pickup to Dropoff
    const toDropoff = await getRoadDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    console.log(`📍 Pickup to Dropoff: ${toDropoff.distance} miles`);
    
    // Test 2: Pickup to Zone Center
    const [zoneLng, zoneLat] = getZoneLogicalCenter(zone);
    const toZoneCenter = await getRoadDistance(pickupLat, pickupLng, zoneLat, zoneLng);
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
    
    if (zone.name.includes('FCO') && toZoneCenter.distance < 18) {
        console.warn(`🚨 SUSPICIOUS: Pickup to FCO zone distance seems too low! Expected ~18-20 miles`);
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
  // Compare key characteristics to determine if vehicles are essentially the same
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

// -------------------- Main fetchFromDatabase with Enhanced Zone Optimization --------------------
export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string; straightLineDistance?: number }> => {
  console.log(`[Database] Starting database fetch with ENHANCED zone optimization`);
  console.log(`[Database] Pickup: ${pickupLocation}, Dropoff: ${dropoffLocation}, Currency: ${targetCurrency}`);

  // Parse coordinates with validation
  console.log(`[Database] Parsing coordinates...`);
  const fromCoords = parseCoordinate(pickupLocation);
  const toCoords = parseCoordinate(dropoffLocation);
  
  if (!fromCoords || !toCoords) {
    console.error("[Database] Invalid coordinates provided");
    throw new Error("Invalid pickup or dropoff coordinates");
  }

  const { lat: fromLat, lng: fromLng } = fromCoords;
  const { lat: toLat, lng: toLng } = toCoords;

  console.log(`[Database] Parsed coordinates - From: (${fromLat}, ${fromLng}) To: (${toLat}, ${toLng})`);

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

    // 3) Calculate distance from pickup to dropoff
    console.log(`[Database] Calculating road distance from pickup to dropoff`);
    let distanceResult = await getRoadDistance(fromLat, fromLng, toLat, toLng);
    
    if (distanceResult.distance === null) {
      console.warn(`[Database] Primary distance method failed, trying Directions API...`);
      const directionsResult = await getDistanceUsingDirections(fromLat, fromLng, toLat, toLng);
      if (directionsResult) {
        distanceResult.distance = directionsResult.distance;
        distanceResult.duration = directionsResult.duration;
        console.log(`[Database] Using Directions API result: ${directionsResult.distance} miles`);
      }
    }
    
    if (distanceResult.distance === null) {
      console.error("[Database] All distance methods failed");
      throw new Error("Could not calculate road distance");
    }

    const { distance: totalTripDistance, duration, straightLineDistance } = distanceResult;
    console.log(`[Database] Total trip distance: ${totalTripDistance} miles`);

    // 4) Debug distance comparison for FCO zone
    const fcoZone = overlappingZones.find(z => z.name.includes('FCO'));
    if (fcoZone) {
      await debugDistanceComparison(fromLat, fromLng, toLat, toLng, fcoZone);
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

    // 7) Calculate optimal pricing for each vehicle across overlapping zones
    console.log(`[Zone Optimization] Calculating optimal pricing across ${overlappingZones.length} overlapping zones`);
    
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
        
        // Calculate distance from pickup location to zone center USING ROAD DISTANCE
        const effectiveDistance = await calculateEffectiveDistance(fromLng, fromLat, zone);
        console.log(`[Zone Optimization] ROAD distance from pickup to zone center: ${effectiveDistance.toFixed(2)} miles`);
        
        // Get zone radius (assuming it's in miles despite the column name)
        const zoneRadiusMiles = Math.max(1, Number(zone.radius_km) || 10);
        console.log(`[Zone Optimization] Zone radius: ${zoneRadiusMiles} miles`);
        
        // Calculate available coverage within zone
        const availableMilesInZone = Math.max(0, zoneRadiusMiles - effectiveDistance);
        console.log(`[Zone Optimization] Available miles within zone: ${zoneRadiusMiles} - ${effectiveDistance.toFixed(2)} = ${availableMilesInZone.toFixed(2)} miles`);
        
        // Calculate extra miles beyond zone coverage
        const extraMiles = Math.max(0, totalTripDistance - availableMilesInZone);
        console.log(`[Zone Optimization] Extra miles beyond zone: ${totalTripDistance} - ${availableMilesInZone.toFixed(2)} = ${extraMiles.toFixed(2)} miles`);
        
        // Calculate total price
        const basePrice = Number(vehicle.price) || 0;
        const extraPricePerMile = Number(vehicle.extra_price_per_mile) || 0;
        const extraCost = extraMiles * extraPricePerMile;
        const totalPrice = formatPrice(Math.max(basePrice, basePrice + extraCost)); // At least base price
        
        // Calculate zone priority to avoid illogical zone assignments
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
              totalTripDistance
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
          optimizedVehicles.push(vehicles[0]);
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
    console.log(`[Zone Optimization] Summary: Using ${zonesUsed.size} optimal zones:`, Array.from(zonesUsed));
    
    // Log pricing comparison
    finalVehicles.forEach(vehicle => {
      console.log(`[Final] ${vehicle.vehicalType} - ${vehicle.brand}: ${vehicle.price} ${targetCurrency} (Zone: ${vehicle.zoneName})`);
    });

    return { 
      vehicles: finalVehicles, 
      distance: totalTripDistance, 
      estimatedTime: duration,
      straightLineDistance: straightLineDistance
    };
  } catch (error: any) {
    console.error("[Database] Error in zone optimization:", error?.message || error);
    throw new Error("Failed to optimize zones and vehicle pricing.");
  }
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

  res.json({
    coordinates: { 
      from: { lat: fromLat, lng: fromLng }, 
      to: { lat: toLat, lng: toLng } 
    },
    distanceMatrix: distanceMatrixResult,
    directions: directionsResult,
    comparison: {
      difference: directionsResult ? Math.abs(distanceMatrixResult.distance - directionsResult.distance) : null,
      differencePercentage: directionsResult ? (Math.abs(distanceMatrixResult.distance - directionsResult.distance) / distanceMatrixResult.distance * 100) : null
    }
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
      estimatedTime: DatabaseData.estimatedTime,
      straightLineDistance: DatabaseData.straightLineDistance
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

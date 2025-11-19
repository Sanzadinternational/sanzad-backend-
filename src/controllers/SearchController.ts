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

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    console.log(`[Distance] API URL: ${url.replace(GOOGLE_MAPS_API_KEY, 'HIDDEN')}`);
    
    const response = await axios.get(url);
    
    // Debug API status
    console.log(`[Distance] API Status: ${response.data.status}`);
    
    const element = response.data.rows[0]?.elements[0];
    
    if (!element) {
      console.error("[Distance] No route elements found in response");
      console.log(`[Distance] Full response:`, JSON.stringify(response.data, null, 2));
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
    
    const straightLineMeters = straightLineDistance * 1609.34;
    
    console.log(`[Distance] Straight-line distance: ${straightLineDistance.toFixed(2)} miles (${straightLineMeters.toFixed(0)} meters)`);
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
      straightLineMeters
    };
  } catch (error) {
    console.error("[Distance] Error fetching road distance:", error?.response?.data || error?.message || error);
    return { distance: null, duration: null, straightLineDistance: null };
  }
}

// -------------------- Alternative Directions API (More Accurate) --------------------
async function getDistanceUsingDirections(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
    console.log(`[Directions] API URL: ${url.replace(GOOGLE_MAPS_API_KEY, 'HIDDEN')}`);
    
    const response = await axios.get(url);
    
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
    console.log(`[Directions] Number of steps: ${leg.steps.length}`);
    
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
    const res = await axios.get(`https://api.exchangerate.host/latest?base=${from}&symbols=${to}`);
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
  
  try {
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/9effc838a4da8122bac8b714/latest/${from}`);
    const rate = res.data?.conversion_rates?.[to];
    
    if (!rate) {
      console.error(`[Currency] Missing rate for ${to}`);
      return amount;
    }
    
    const convertedAmount = amount * rate;
    console.log(`[Currency] Conversion result: ${amount} ${from} = ${convertedAmount} ${to} (rate: ${rate})`);
    return convertedAmount;
  } catch (err) {
    console.error(`[Currency] Error converting from ${from} to ${to}`, err);
    return amount;
  }
}

// -------------------- Geometry helpers for Isochrone --------------------
function getPolygonFromIsochrone(geojson: any) {
  console.log(`[Geometry] Creating polygon from isochrone GeoJSON`);
  
  if (!geojson) {
    console.error("[Geometry] Invalid isochrone geojson: null or undefined");
    throw new Error("Invalid isochrone geojson");
  }
  
  // Parse if string, otherwise use directly
  const geojsonData = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
  
  console.log(`[Geometry] Raw GeoJSON type: ${geojsonData.type}`);
  
  // Your GeoJSON is a Feature with Polygon geometry
  let geometry;
  if (geojsonData.type === "Feature") {
    geometry = geojsonData.geometry;
    console.log(`[Geometry] Extracted geometry from Feature: ${geometry.type}`);
  } else if (geojsonData.type === "Polygon") {
    geometry = geojsonData;
  } else {
    console.error(`[Geometry] Unsupported GeoJSON type: ${geojsonData.type}`);
    throw new Error(`Unsupported GeoJSON type: ${geojsonData.type}`);
  }
  
  if (!geometry || geometry.type !== "Polygon") {
    console.error("[Geometry] Invalid or non-Polygon geometry in isochrone");
    throw new Error("Invalid or non-Polygon geometry in isochrone");
  }
  
  const coordinates = geometry.coordinates;
  console.log(`[Geometry] Polygon has ${coordinates.length} ring(s), outer ring has ${coordinates[0]?.length || 0} coordinates`);
  
  const polygon = turf.polygon(coordinates);
  return polygon;
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
    } catch (err) {
      console.warn(`[Geometry] Skipping isochrone zone due to error: ${zone?.id}`, err?.message || err);
    }
  }
  
  console.log(`[Geometry] Found ${matches.length} isochrone zones containing the point`);
  return matches;
}

// -------------------- Zone Optimization Helpers --------------------
function calculateEffectiveDistance(pickupLng: number, pickupLat: number, zone: any): number {
  try {
    const poly = getPolygonFromIsochrone(zone.geojson);
    const center = turf.centroid(poly);
    const centerCoords = center.geometry.coordinates; // [lng, lat]
    
    const distanceToCenter = turf.distance(
      turf.point([pickupLng, pickupLat]),
      turf.point(centerCoords),
      { units: 'miles' }
    );
    
    console.log(`[Zone Optimization] Distance from pickup to ${zone.name} center: ${distanceToCenter.toFixed(2)} miles`);
    return distanceToCenter;
  } catch (error) {
    console.error(`[Zone Optimization] Error calculating effective distance for zone ${zone.name}:`, error);
    return 0;
  }
}

function calculateOptimizedZonePrice({
  roadDistanceMiles,
  basePrice,
  extraPricePerMile,
  zoneRadiusMiles,
  effectiveDistance, // Distance from pickup to zone center
}: {
  roadDistanceMiles: number;
  basePrice: number;
  extraPricePerMile: number;
  zoneRadiusMiles: number;
  effectiveDistance: number;
}) {
  console.log(`[Zone Optimization] Calculating OPTIMIZED zone price`);
  console.log(`[Zone Optimization] Base price: ${basePrice}, Road distance: ${roadDistanceMiles} miles`);
  console.log(`[Zone Optimization] Zone radius: ${zoneRadiusMiles} miles, Effective distance: ${effectiveDistance.toFixed(2)} miles`);
  
  // Available miles within zone: Zone radius - Distance from center
  const availableMilesInZone = Math.max(0, zoneRadiusMiles - effectiveDistance);
  console.log(`[Zone Optimization] Available miles within zone: ${zoneRadiusMiles} - ${effectiveDistance.toFixed(2)} = ${availableMilesInZone.toFixed(2)} miles`);
  
  // Extra miles beyond available zone coverage
  const extraMiles = Math.max(0, roadDistanceMiles - availableMilesInZone);
  const extraCost = extraMiles * extraPricePerMile;
  const totalPrice = basePrice + extraCost;
  
  console.log(`[Zone Optimization] Extra miles calculation: ${roadDistanceMiles} - ${availableMilesInZone.toFixed(2)} = ${extraMiles.toFixed(2)} miles`);
  console.log(`[Zone Optimization] Extra cost: ${extraMiles.toFixed(2)} miles * ${extraPricePerMile}/mile = ${extraCost.toFixed(2)}`);
  console.log(`[Zone Optimization] Total price: ${basePrice} (base) + ${extraCost.toFixed(2)} (extra) = ${totalPrice.toFixed(2)}`);
  
  return {
    totalPrice,
    extraMiles,
    extraCost,
    availableMilesInZone,
    effectiveDistance
  };
}

function findOptimalZoneForVehicleType(
  vehicleType: string,
  brand: string,
  passengers: number,
  supplierId: string,
  pickupLng: number,
  pickupLat: number,
  roadDistanceMiles: number,
  overlappingZones: any[],
  allTransfers: any[]
) {
  console.log(`[Zone Optimization] Finding optimal zone for: ${vehicleType} - ${brand} - ${passengers}p - Supplier ${supplierId}`);
  
  const similarVehicles = allTransfers.filter(transfer =>
    transfer.VehicleType === vehicleType &&
    transfer.VehicleBrand === brand &&
    transfer.Passengers === passengers &&
    transfer.SupplierId === supplierId
  );
  
  if (similarVehicles.length === 0) {
    console.log(`[Zone Optimization] No similar vehicles found`);
    return null;
  }
  
  let optimalVehicle = null;
  let lowestPrice = Infinity;
  
  for (const vehicle of similarVehicles) {
    const vehicleZone = overlappingZones.find(zone => zone.id === vehicle.zone_id);
    if (!vehicleZone) continue;
    
    // Calculate effective distance for this zone
    const effectiveDistance = calculateEffectiveDistance(pickupLng, pickupLat, vehicleZone);
    
    // Calculate optimized price
    const basePrice = Number(vehicle.price) || 0;
    const extraPricePerMile = Number(vehicle.extra_price_per_mile) || 0;
    const zoneRadiusMiles = Number(vehicleZone.radius_km) || 0; // Actually miles
    
    const priceResult = calculateOptimizedZonePrice({
      roadDistanceMiles,
      basePrice,
      extraPricePerMile,
      zoneRadiusMiles,
      effectiveDistance,
    });
    
    console.log(`[Zone Optimization] Zone ${vehicleZone.name}: ${priceResult.totalPrice.toFixed(2)} (Base: ${basePrice})`);
    
    if (priceResult.totalPrice < lowestPrice) {
      lowestPrice = priceResult.totalPrice;
      optimalVehicle = {
        ...vehicle,
        optimizedPrice: priceResult.totalPrice,
        zone: vehicleZone,
        priceDetails: priceResult
      };
    }
  }
  
  if (optimalVehicle) {
    console.log(`[Zone Optimization] ✅ Selected zone ${optimalVehicle.zone.name} with price: ${optimalVehicle.optimizedPrice.toFixed(2)}`);
  } else {
    console.log(`[Zone Optimization] ❌ No optimal zone found`);
  }
  
  return optimalVehicle;
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

// -------------------- Main fetchFromDatabase with Zone Optimization --------------------
export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string; straightLineDistance?: number }> => {
  console.log(`[Database] Starting database fetch with ZONE OPTIMIZATION pricing`);
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

    // 3) Fetch vehicles from ALL overlapping zones
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
      allTransfers = allTransfers.concat(zoneTransfers);
    }

    console.log(`[Database] Total vehicles across all overlapping zones: ${allTransfers.length}`);

    // 4) Supporting static data
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

    // 5) Compute road distance (miles)
    console.log(`[Database] Calculating road distance`);
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

    const { distance, duration, straightLineDistance } = distanceResult;

    // 6) GROUP vehicles by type and find OPTIMAL ZONE for each vehicle type
    console.log(`[Zone Optimization] Starting zone optimization for ${allTransfers.length} vehicles across ${overlappingZones.length} zones`);
    
    const vehicleGroups = new Map();
    allTransfers.forEach(vehicle => {
      const key = `${vehicle.VehicleType}_${vehicle.VehicleBrand}_${vehicle.Passengers}_${vehicle.SupplierId}`;
      if (!vehicleGroups.has(key)) {
        vehicleGroups.set(key, []);
      }
      vehicleGroups.get(key).push(vehicle);
    });

    console.log(`[Zone Optimization] Found ${vehicleGroups.size} unique vehicle types to optimize`);

    const optimizedVehicles: any[] = [];
    
    // Find optimal zone for each vehicle type
    for (const [vehicleKey, vehicles] of vehicleGroups.entries()) {
      const [vehicleType, brand, passengers, supplierId] = vehicleKey.split('_');
      
      console.log(`\n[Zone Optimization] Processing vehicle type: ${vehicleType} - ${brand} - ${passengers}p`);
      
      const optimalVehicle = findOptimalZoneForVehicleType(
        vehicleType,
        brand,
        parseInt(passengers),
        supplierId,
        fromLng,
        fromLat,
        distance,
        overlappingZones,
        allTransfers
      );
      
      if (optimalVehicle) {
        optimizedVehicles.push(optimalVehicle);
      } else {
        // If no optimal found, use the first available vehicle (fallback)
        console.log(`[Zone Optimization] Using fallback - first available vehicle`);
        optimizedVehicles.push(vehicles[0]);
      }
    }

    console.log(`[Zone Optimization] Final optimized vehicles: ${optimizedVehicles.length}`);

    // 7) Apply final pricing with fees, margins, etc. to optimized vehicles
    console.log(`[Database] Applying final pricing to ${optimizedVehicles.length} optimized vehicles`);
    const allVehiclesWithPricing = await Promise.all(
      optimizedVehicles.map(async (vehicle, index) => {
        console.log(`[Pricing] Processing optimized vehicle ${index + 1}: ${vehicle.VehicleType} from zone ${vehicle.zone_name}`);
        
        // Start with the optimized base price
        let totalPrice = vehicle.optimizedPrice || Number(vehicle.price) || 0;
        console.log(`[Pricing] Starting with optimized price: ${totalPrice}`);

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
            console.log(`[Pricing] Added ${feeName}: ${feeAmount}, New total: ${totalPrice}`);
          }
        });

        // Night time
        const [hour] = time.split(":").map(Number);
        const isNightTime = (hour >= 22 || hour < 6);
        if (isNightTime && vehicle.NightTime_Price) {
          totalPrice += Number(vehicle.NightTime_Price);
          console.log(`[Pricing] Added night time charge: ${vehicle.NightTime_Price}, New total: ${totalPrice}`);
        }

        // Surge
        const vehicleSurge = surgeCharges.find((s: any) => s.vehicle_id === vehicle.vehicle_id && s.supplier_id === vehicle.SupplierId);
        if (vehicleSurge && vehicleSurge.SurgeChargePrice) {
          totalPrice += Number(vehicleSurge.SurgeChargePrice);
          console.log(`[Pricing] Added surge charge: ${vehicleSurge.SurgeChargePrice}, New total: ${totalPrice}`);
        }

        // Apply supplier margin
        const margin = supplierMargins.get(vehicle.SupplierId) || 0;
        if (margin > 0) {
          const marginAmount = totalPrice * (Number(margin) / 100);
          totalPrice += marginAmount;
          console.log(`[Pricing] Added supplier margin (${margin}%): ${marginAmount}, New total: ${totalPrice}`);
        }

        // Return trip price (if any)
        let returnPrice = 0;
        const isReturnTrip = !!returnDate && !!returnTime;
        
        if (isReturnTrip) {
          console.log(`[Pricing] Calculating return trip pricing`);
          // For return trip, use the same optimization logic
          const effectiveDistance = vehicle.priceDetails?.effectiveDistance || calculateEffectiveDistance(fromLng, fromLat, vehicle.zone);
          const basePrice = Number(vehicle.price) || 0;
          const extraPricePerMile = Number(vehicle.extra_price_per_mile) || 0;
          const zoneRadiusMiles = Number(vehicle.zone.radius_km) || 0;
          
          const returnPriceResult = calculateOptimizedZonePrice({
            roadDistanceMiles: distance,
            basePrice,
            extraPricePerMile,
            zoneRadiusMiles,
            effectiveDistance,
          });
          
          returnPrice = returnPriceResult.totalPrice;
          
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
              console.log(`[Pricing] Added return ${feeName}: ${feeAmount}, Return total: ${returnPrice}`);
            }
          });

          const [returnHour] = returnTime.split(":").map(Number);
          const isReturnNightTime = (returnHour >= 22 || returnHour < 6);
          if (isReturnNightTime && vehicle.NightTime_Price) {
            returnPrice += Number(vehicle.NightTime_Price);
            console.log(`[Pricing] Added return night time charge: ${vehicle.NightTime_Price}, Return total: ${returnPrice}`);
          }

          const returnSurge = surgeCharges.find((s: any) =>
            s.vehicle_id === vehicle.vehicle_id &&
            s.supplier_id === vehicle.SupplierId &&
            s.From <= returnDate &&
            s.To >= returnDate
          );
          if (returnSurge && returnSurge.SurgeChargePrice) {
            returnPrice += Number(returnSurge.SurgeChargePrice);
            console.log(`[Pricing] Added return surge charge: ${returnSurge.SurgeChargePrice}, Return total: ${returnPrice}`);
          }

          // Apply margin on return price
          if (margin > 0) {
            const returnMarginAmount = returnPrice * (Number(margin) / 100);
            returnPrice += returnMarginAmount;
            console.log(`[Pricing] Added return supplier margin (${margin}%): ${returnMarginAmount}, Return total: ${returnPrice}`);
          }
        }

        totalPrice += returnPrice;
        console.log(`[Pricing] Final price before currency conversion: ${totalPrice} ${vehicle.Currency || "USD"}`);

        // Currency convert
        const convertedPrice = await convertCurrency(totalPrice, vehicle.Currency || "USD", targetCurrency);
        console.log(`[Pricing] Final converted price: ${convertedPrice} ${targetCurrency}`);

        // Vehicle image lookup
        const image = vehicleTypes.find((type: any) =>
          String(type.VehicleType || "").toLowerCase().trim() === String(vehicle.VehicleType || "").toLowerCase().trim()
        ) || { vehicleImage: "default-image-url-or-path" };

        console.log(`[Pricing] Completed pricing for optimized vehicle ${index + 1} from zone ${vehicle.zone_name}`);
        
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
          price: Number(convertedPrice),
          nightTime: vehicle.NightTime,
          passengers: vehicle.Passengers,
          currency: targetCurrency,
          mediumBag: vehicle.MediumBag,
          SmallBag: vehicle.SmallBag,
          nightTimePrice: vehicle.NightTime_Price,
          transferInfo: vehicle.Transfer_info,
          supplierId: vehicle.SupplierId,
          zoneId: vehicle.zone_id,
          zoneName: vehicle.zone_name,
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

    console.log(`[Database] Final optimized vehicles with pricing: ${allVehiclesWithPricing.length}`);
    
    // Log optimization summary
    const zonesUsed = new Set(allVehiclesWithPricing.map(v => v.zoneName));
    console.log(`[Zone Optimization] Summary: Using ${zonesUsed.size} optimal zones:`, Array.from(zonesUsed));

    return { 
      vehicles: allVehiclesWithPricing, 
      distance: distance, 
      estimatedTime: duration,
      straightLineDistance: straightLineDistance
    };
  } catch (error) {
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

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

// -------------------- ROAD DISTANCE-BASED Pricing Helper --------------------
function calculatePriceBasedOnRoadDistance({
  roadDistanceMiles,
  basePrice,
  extraPricePerMile,
  zoneRadiusMiles,
}: {
  roadDistanceMiles: number;
  basePrice: number;
  extraPricePerMile: number;
  zoneRadiusMiles: number;
}) {
  console.log(`[Pricing] ROAD DISTANCE-BASED pricing`);
  console.log(`[Pricing] Base price: ${basePrice}, Road distance: ${roadDistanceMiles} miles, Zone radius: ${zoneRadiusMiles} miles`);
  
  // Always calculate extra miles based on road distance vs zone radius
  const extraMiles = Math.max(0, roadDistanceMiles - zoneRadiusMiles);
  const extraCost = extraMiles * extraPricePerMile;
  const totalPrice = basePrice + extraCost;
  
  console.log(`[Pricing] Extra miles calculation: ${roadDistanceMiles} - ${zoneRadiusMiles} = ${extraMiles} miles`);
  console.log(`[Pricing] Extra cost: ${extraMiles} miles * ${extraPricePerMile}/mile = ${extraCost}`);
  console.log(`[Pricing] Total price: ${basePrice} (base) + ${extraCost} (extra) = ${totalPrice}`);
  
  return totalPrice;
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

// -------------------- Main fetchFromDatabase with Enhanced Distance Handling --------------------
export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string; straightLineDistance?: number }> => {
  console.log(`[Database] Starting database fetch with ROAD DISTANCE-BASED pricing`);
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

    // 2) Find ALL isochrone zones containing pickup location
    const pickupZones = getZonesContainingPoint(fromLng, fromLat, allZones);
    console.log(`[Database] Pickup location is inside ${pickupZones.length} isochrone zones:`, pickupZones.map(z => z.name));

    if (pickupZones.length === 0) {
      console.error("[Database] No isochrone zones found for the pickup location");
      throw new Error("No isochrone zones found for the selected pickup location.");
    }

    // 3) Fetch vehicles from ALL pickup isochrone zones
    let allTransfers: any[] = [];
    
    // Query each isochrone zone separately to avoid SQL parameter issues
    for (const zone of pickupZones) {
      console.log(`[Database] Fetching vehicles from isochrone zone: ${zone.name} (${zone.id})`);
      
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
      console.log(`[Database] Found ${zoneTransfers.length} vehicles in isochrone zone ${zone.name}`);
      allTransfers = allTransfers.concat(zoneTransfers);
    }

    console.log(`[Database] Total vehicles across all isochrone zones: ${allTransfers.length}`);

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

    // 5) Compute road distance (miles) with enhanced debugging
    console.log(`[Database] Calculating road distance`);
    let distanceResult = await getRoadDistance(fromLat, fromLng, toLat, toLng);
    
    // If distance is null, try alternative method
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

    // 6) Price each transfer with ROAD DISTANCE-BASED pricing
    console.log(`[Database] Calculating pricing for ${allTransfers.length} vehicles using ROAD DISTANCE-BASED pricing`);
    const allVehiclesWithPricing = await Promise.all(
      allTransfers.map(async (transfer, index) => {
        console.log(`[Pricing] Processing vehicle ${index + 1}: ${transfer.VehicleType} from zone ${transfer.zone_name}`);
        
        const basePrice = Number(transfer.price) || 0;
        console.log(`[Pricing] Base transfer price: ${basePrice} ${transfer.Currency || "USD"}`);

        // ROAD DISTANCE-BASED PRICING: Ignore isochrone boundaries, use only road distance vs zone radius
        const zoneRadiusMiles = Number(transfer.zone_radius) || 0; // This is actually MILES
        const extraPricePerMile = Number(transfer.extra_price_per_mile) || 0;

        let totalPrice = calculatePriceBasedOnRoadDistance({
          roadDistanceMiles: distance ?? 0,
          basePrice,
          extraPricePerMile,
          zoneRadiusMiles,
        });

        console.log(`[Pricing] After ROAD DISTANCE-BASED pricing: ${totalPrice}`);

        // Add fixed fees
        const fees = {
          vehicleTax: Number(transfer.vehicleTax) || 0,
          parking: Number(transfer.parking) || 0,
          tollTax: Number(transfer.tollTax) || 0,
          driverCharge: Number(transfer.driverCharge) || 0,
          driverTips: Number(transfer.driverTips) || 0,
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
        if (isNightTime && transfer.NightTime_Price) {
          totalPrice += Number(transfer.NightTime_Price);
          console.log(`[Pricing] Added night time charge: ${transfer.NightTime_Price}, New total: ${totalPrice}`);
        }

        // Surge
        const vehicleSurge = surgeCharges.find((s: any) => s.vehicle_id === transfer.vehicle_id && s.supplier_id === transfer.SupplierId);
        if (vehicleSurge && vehicleSurge.SurgeChargePrice) {
          totalPrice += Number(vehicleSurge.SurgeChargePrice);
          console.log(`[Pricing] Added surge charge: ${vehicleSurge.SurgeChargePrice}, New total: ${totalPrice}`);
        }

        // Apply supplier margin
        const margin = supplierMargins.get(transfer.SupplierId) || 0;
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
          returnPrice = calculatePriceBasedOnRoadDistance({
            roadDistanceMiles: distance ?? 0,
            basePrice,
            extraPricePerMile,
            zoneRadiusMiles,
          });

          const returnFees = {
            vehicleTax: Number(transfer.vehicleTax) || 0,
            parking: Number(transfer.parking) || 0,
            tollTax: Number(transfer.tollTax) || 0,
            driverCharge: Number(transfer.driverCharge) || 0,
            driverTips: Number(transfer.driverTips) || 0,
          };

          Object.entries(returnFees).forEach(([feeName, feeAmount]) => {
            if (feeAmount > 0) {
              returnPrice += feeAmount;
              console.log(`[Pricing] Added return ${feeName}: ${feeAmount}, Return total: ${returnPrice}`);
            }
          });

          const [returnHour] = returnTime.split(":").map(Number);
          const isReturnNightTime = (returnHour >= 22 || returnHour < 6);
          if (isReturnNightTime && transfer.NightTime_Price) {
            returnPrice += Number(transfer.NightTime_Price);
            console.log(`[Pricing] Added return night time charge: ${transfer.NightTime_Price}, Return total: ${returnPrice}`);
          }

          const returnSurge = surgeCharges.find((s: any) =>
            s.vehicle_id === transfer.vehicle_id &&
            s.supplier_id === transfer.SupplierId &&
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
        console.log(`[Pricing] Final price before currency conversion: ${totalPrice} ${transfer.Currency || "USD"}`);

        // Currency convert
        const convertedPrice = await convertCurrency(totalPrice, transfer.Currency || "USD", targetCurrency);
        console.log(`[Pricing] Final converted price: ${convertedPrice} ${targetCurrency}`);

        // Vehicle image lookup
        const image = vehicleTypes.find((type: any) =>
          String(type.VehicleType || "").toLowerCase().trim() === String(transfer.VehicleType || "").toLowerCase().trim()
        ) || { vehicleImage: "default-image-url-or-path" };

        console.log(`[Pricing] Completed pricing for vehicle ${index + 1} from zone ${transfer.zone_name}`);
        
        return {
          vehicleId: transfer.vehicle_id,
          vehicleImage: image.vehicleImage,
          vehicalType: transfer.VehicleType,
          brand: transfer.VehicleBrand,
          vehicleName: transfer.name,
          parking: transfer.parking,
          vehicleTax: transfer.vehicleTax,
          tollTax: transfer.tollTax,
          driverTips: transfer.driverTips,
          driverCharge: transfer.driverCharge,
          extraPricePerKm: transfer.extra_price_per_mile,
          price: Number(convertedPrice),
          nightTime: transfer.NightTime,
          passengers: transfer.Passengers,
          currency: targetCurrency,
          mediumBag: transfer.MediumBag,
          SmallBag: transfer.SmallBag,
          nightTimePrice: transfer.NightTime_Price,
          transferInfo: transfer.Transfer_info,
          supplierId: transfer.SupplierId,
          zoneId: transfer.zone_id,
          zoneName: transfer.zone_name,
          originalPrice: basePrice,
          isFromOverlappingZone: pickupZones.length > 1,
          // Additional fields from your vehicle schema
          serviceType: transfer.ServiceType,
          vehicleModel: transfer.VehicleModel,
          doors: transfer.Doors,
          seats: transfer.Seats,
          cargo: transfer.Cargo,
          extraSpace: transfer.ExtraSpace
        };
      })
    );

    // 7) Optimize vehicles: For same supplier, keep cheapest of identical vehicles
    console.log(`[Optimization] Starting vehicle optimization across ${allVehiclesWithPricing.length} vehicles`);
    
    // Group by supplier first
    const vehiclesBySupplier = new Map<string, any[]>();
    allVehiclesWithPricing.forEach(vehicle => {
      if (!vehiclesBySupplier.has(vehicle.supplierId)) {
        vehiclesBySupplier.set(vehicle.supplierId, []);
      }
      vehiclesBySupplier.get(vehicle.supplierId)!.push(vehicle);
    });

    const optimizedVehicles: any[] = [];
    
    vehiclesBySupplier.forEach((supplierVehicles, supplierId) => {
      console.log(`[Optimization] Processing ${supplierVehicles.length} vehicles from supplier ${supplierId}`);
      
      if (supplierVehicles.length === 1) {
        // Single vehicle from this supplier, always keep it
        optimizedVehicles.push(supplierVehicles[0]);
      } else {
        // Multiple vehicles from same supplier, optimize
        const optimizedSupplierVehicles = optimizeSupplierVehicles(supplierVehicles);
        optimizedVehicles.push(...optimizedSupplierVehicles);
      }
    });

    console.log(`[Optimization] Final result: ${optimizedVehicles.length} vehicles after optimization (was ${allVehiclesWithPricing.length})`);
    
    // Log optimization summary
    const supplierCount = new Set(optimizedVehicles.map(v => v.supplierId)).size;
    const zoneCount = new Set(optimizedVehicles.map(v => v.zoneId)).size;
    console.log(`[Optimization] Summary: ${optimizedVehicles.length} vehicles from ${supplierCount} suppliers across ${zoneCount} isochrone zones`);

    return { 
      vehicles: optimizedVehicles, 
      distance: distance, 
      estimatedTime: duration,
      straightLineDistance: straightLineDistance
    };
  } catch (error) {
    console.error("[Database] Error fetching isochrone zones and vehicles:", error?.message || error);
    throw new Error("Failed to fetch isochrone zones and vehicle pricing.");
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

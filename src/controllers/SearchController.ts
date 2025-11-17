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
  
  // Isochrone data can have different structures
  let geometry;
  if (geojsonData.type === "FeatureCollection") {
    // Take the first feature from feature collection
    if (!geojsonData.features || geojsonData.features.length === 0) {
      throw new Error("No features in isochrone FeatureCollection");
    }
    geometry = geojsonData.features[0].geometry;
  } else if (geojsonData.type === "Feature") {
    geometry = geojsonData.geometry;
  } else {
    geometry = geojsonData;
  }
  
  if (!geometry) {
    console.error("[Geometry] Invalid isochrone geometry");
    throw new Error("Invalid isochrone geometry");
  }
  
  console.log(`[Geometry] Isochrone geometry type: ${geometry.type}`);
  
  // Handle different isochrone geometry types
  let coordinates;
  if (geometry.type === "Polygon") {
    coordinates = geometry.coordinates;
  } else if (geometry.type === "MultiPolygon") {
    // Use the first polygon from multipolygon
    coordinates = geometry.coordinates[0];
  } else if (geometry.type === "LineString") {
    // Convert linestring to polygon by closing the ring
    coordinates = [geometry.coordinates.concat([geometry.coordinates[0]])];
  } else {
    throw new Error(`Unsupported isochrone geometry type: ${geometry.type}`);
  }
  
  const polygon = turf.polygon(coordinates);
  console.log(`[Geometry] Isochrone polygon created with ${coordinates[0].length} coordinates`);
  return polygon;
}

function getZonesContainingPoint(lng: number, lat: number, allZones: any[]) {
  console.log(`[Geometry] Finding isochrone zones containing point (${lng}, ${lat})`);
  
  const point = turf.point([lng, lat]);
  const matches: any[] = [];
  
  for (const zone of allZones) {
    try {
      const poly = getPolygonFromIsochrone(zone.geojson);
      if (turf.booleanPointInPolygon(point, poly)) {
        console.log(`[Geometry] Point found in isochrone zone: ${zone.name} (${zone.id})`);
        matches.push(zone);
      }
    } catch (err) {
      console.warn(`[Geometry] Skipping isochrone zone due to malformed geojson: ${zone?.id}`, err?.message || err);
    }
  }
  
  console.log(`[Geometry] Found ${matches.length} isochrone zones containing the point`);
  return matches;
}

function getClosestZoneToPoint(lng: number, lat: number, zones: any[]) {
  console.log(`[Geometry] Finding closest isochrone zone to point (${lng}, ${lat}) from ${zones.length} zones`);
  
  if (!zones || zones.length === 0) {
    console.log("[Geometry] No isochrone zones provided, returning null");
    return null;
  }
  
  const point = turf.point([lng, lat]);
  let best: any = null;
  let bestDist = Infinity;
  
  for (const zone of zones) {
    try {
      const poly = getPolygonFromIsochrone(zone.geojson);
      const center = turf.centroid(poly).geometry.coordinates;
      const dist = turf.distance(point, turf.point(center), { units: "miles" });
      
      console.log(`[Geometry] Isochrone zone ${zone.name} center distance: ${dist.toFixed(2)} miles`);
      
      if (dist < bestDist) {
        bestDist = dist;
        best = zone;
        console.log(`[Geometry] New closest isochrone zone: ${zone.name} (${dist.toFixed(2)} miles)`);
      }
    } catch (err) {
      console.warn(`[Geometry] Error computing centroid/distance for isochrone zone ${zone?.id}`, err?.message || err);
    }
  }
  
  console.log(`[Geometry] Selected closest isochrone zone: ${best?.name} (distance: ${bestDist.toFixed(2)} miles)`);
  return best;
}

function pickFinalZone(fromLng: number, fromLat: number, toLng: number, toLat: number, allZones: any[]) {
  console.log(`[Zone Selection] Starting isochrone zone selection process`);
  console.log(`[Zone Selection] Pickup: (${fromLng}, ${fromLat}), Dropoff: (${toLng}, ${toLat})`);
  
  const pickupZones = getZonesContainingPoint(fromLng, fromLat, allZones);
  const dropoffZones = getZonesContainingPoint(toLng, toLat, allZones);
  
  console.log(`[Zone Selection] Pickup isochrone zones: ${pickupZones.length}, Dropoff isochrone zones: ${dropoffZones.length}`);

  // common zones
  const common = pickupZones.filter(p => dropoffZones.some(d => d.id === p.id));
  console.log(`[Zone Selection] Common isochrone zones: ${common.length}`);
  
  if (common.length > 0) {
    // if multiple common zones, choose one closest to dropoff
    if (common.length === 1) {
      console.log(`[Zone Selection] Single common isochrone zone selected: ${common[0].name}`);
      return common[0];
    }
    const closestCommon = getClosestZoneToPoint(toLng, toLat, common);
    console.log(`[Zone Selection] Multiple common isochrone zones, selected closest to dropoff: ${closestCommon.name}`);
    return closestCommon;
  }

  // pickup multiple
  if (pickupZones.length > 1) {
    const closestPickup = getClosestZoneToPoint(fromLng, fromLat, pickupZones);
    console.log(`[Zone Selection] Multiple pickup isochrone zones, selected closest to pickup: ${closestPickup.name}`);
    return closestPickup;
  }

  // dropoff multiple
  if (dropoffZones.length > 1) {
    const closestDropoff = getClosestZoneToPoint(toLng, toLat, dropoffZones);
    console.log(`[Zone Selection] Multiple dropoff isochrone zones, selected closest to dropoff: ${closestDropoff.name}`);
    return closestDropoff;
  }

  // single pickup zone
  if (pickupZones.length === 1) {
    console.log(`[Zone Selection] Single pickup isochrone zone selected: ${pickupZones[0].name}`);
    return pickupZones[0];
  }

  // single dropoff zone (pickup none)
  if (dropoffZones.length === 1) {
    console.log(`[Zone Selection] Single dropoff isochrone zone selected: ${dropoffZones[0].name}`);
    return dropoffZones[0];
  }

  console.log("[Zone Selection] No isochrone zones found for the locations");
  return null;
}

// -------------------- Distance helpers --------------------
export async function getRoadDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  console.log(`[Distance] Getting road distance from (${fromLat}, ${fromLng}) to (${toLat}, ${toLng})`);
  
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`
    );
    const distanceText = response.data.rows[0]?.elements[0]?.distance?.text;
    const durationText = response.data.rows[0]?.elements[0]?.duration?.text;
    
    if (!distanceText || !durationText) {
      console.error("[Distance] Distance or duration not found in response");
      throw new Error("Distance or duration not found");
    }
    
    const distance = parseFloat(distanceText.replace(" mi", ""));
    console.log(`[Distance] Road distance: ${distance} miles, Duration: ${durationText}`);
    
    return {
      distance,
      duration: durationText
    };
  } catch (error) {
    console.error("[Distance] Error fetching road distance:", error?.response?.data || error?.message || error);
    return { distance: null, duration: null };
  }
}

// -------------------- Zone boundary helpers for Isochrone --------------------
export async function getDistanceFromZoneBoundary(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
  fromZone: any
) {
  console.log(`[Zone Boundary] Calculating distance from isochrone zone boundary`);
  
  try {
    if (!fromZone || !fromZone.geojson) {
      console.warn("[Zone Boundary] No valid 'From' isochrone zone found.");
      return 0;
    }
    
    const poly = getPolygonFromIsochrone(fromZone.geojson);
    const toPoint = turf.point([toLng, toLat]);
    
    // For isochrone zones, we need to find the nearest point on the polygon boundary
    const nearestPoint = turf.nearestPointOnLine(turf.polygonToLineString(poly), toPoint);
    const extraDistance = turf.distance(toPoint, nearestPoint, { units: "miles" });
    
    console.log(`[Zone Boundary] Extra distance from isochrone zone boundary: ${extraDistance.toFixed(2)} miles`);
    return extraDistance;
  } catch (error) {
    console.error("[Zone Boundary] Error computing distance from isochrone zone boundary:", error);
    return 0;
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

// -------------------- Pricing helper --------------------
function calculateZonePrice({
  distanceMiles,
  pickupInsideSelectedZone,
  dropoffInsideSelectedZone,
  zoneRadiusMiles,
  basePrice,
  extraPricePerMile,
}: {
  distanceMiles: number;
  pickupInsideSelectedZone: boolean;
  dropoffInsideSelectedZone: boolean;
  zoneRadiusMiles: number;
  basePrice: number;
  extraPricePerMile: number;
}) {
  console.log(`[Pricing] Calculating zone price`);
  console.log(`[Pricing] Base price: ${basePrice}, Distance: ${distanceMiles} miles, Zone radius: ${zoneRadiusMiles} miles`);
  console.log(`[Pricing] Pickup inside isochrone zone: ${pickupInsideSelectedZone}, Dropoff inside isochrone zone: ${dropoffInsideSelectedZone}`);

  // If pickup is not inside the selected isochrone zone, do not charge extra miles
  if (!pickupInsideSelectedZone) {
    console.log(`[Pricing] Pickup not in selected isochrone zone, returning base price: ${basePrice}`);
    return basePrice;
  }

  // If both inside same isochrone zone -> base price
  if (dropoffInsideSelectedZone) {
    console.log(`[Pricing] Both pickup and dropoff in same isochrone zone, returning base price: ${basePrice}`);
    return basePrice;
  }

  // Leaving the isochrone zone -> charge extra miles beyond radius
  const extraMiles = (distanceMiles ?? 0) - (zoneRadiusMiles ?? 0);
  console.log(`[Pricing] Extra miles calculation: ${distanceMiles} - ${zoneRadiusMiles} = ${extraMiles} miles`);

  if (extraMiles > 0) {
    const extraCost = extraMiles * (extraPricePerMile ?? 0);
    const totalPrice = basePrice + extraCost;
    console.log(`[Pricing] Adding extra cost: ${extraMiles} miles * ${extraPricePerMile}/mile = ${extraCost}`);
    console.log(`[Pricing] Total price with extra: ${totalPrice}`);
    return totalPrice;
  }
  
  console.log(`[Pricing] No extra miles charged, returning base price: ${basePrice}`);
  return basePrice;
}

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

// -------------------- Main fetchFromDatabase with isochrone support --------------------
export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string }> => {
  console.log(`[Database] Starting database fetch with isochrone zone logic`);
  console.log(`[Database] Pickup: ${pickupLocation}, Dropoff: ${dropoffLocation}, Currency: ${targetCurrency}`);

  const [fromLat, fromLng] = pickupLocation.split(",").map(Number);
  const [toLat, toLng] = dropoffLocation.split(",").map(Number);

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

    // 5) Compute road distance (miles)
    console.log(`[Database] Calculating road distance`);
    let { distance, duration } = await getRoadDistance(fromLat, fromLng, toLat, toLng);

    // 6) Price each transfer with isochrone-zone-specific calculations
    console.log(`[Database] Calculating pricing for ${allTransfers.length} vehicles across ${pickupZones.length} isochrone zones`);
    const allVehiclesWithPricing = await Promise.all(
      allTransfers.map(async (transfer, index) => {
        console.log(`[Pricing] Processing vehicle ${index + 1}: ${transfer.VehicleType} from isochrone zone ${transfer.zone_name}`);
        
        const basePrice = Number(transfer.price) || 0;
        console.log(`[Pricing] Base transfer price: ${basePrice} ${transfer.Currency || "USD"}`);

        // For each vehicle, determine if pickup/dropoff are inside its specific isochrone zone
        const vehicleZone = pickupZones.find(z => z.id === transfer.zone_id);
        const pickupInsideThisZone = vehicleZone ? getZonesContainingPoint(fromLng, fromLat, [vehicleZone]).length > 0 : false;
        const dropoffInsideThisZone = vehicleZone ? getZonesContainingPoint(toLng, toLat, [vehicleZone]).length > 0 : false;

        console.log(`[Pricing] Vehicle isochrone zone: ${transfer.zone_name}, Pickup in zone: ${pickupInsideThisZone}, Dropoff in zone: ${dropoffInsideThisZone}`);

        // Use calculateZonePrice rule with this specific isochrone zone
        const zoneRadiusMiles = Number(transfer.zone_radius) || 0;
        const extraPricePerMile = Number(transfer.extra_price_per_mile) || 0;

        let totalPrice = calculateZonePrice({
          distanceMiles: distance ?? 0,
          pickupInsideSelectedZone: pickupInsideThisZone,
          dropoffInsideSelectedZone: dropoffInsideThisZone,
          zoneRadiusMiles,
          basePrice,
          extraPricePerMile,
        });

        console.log(`[Pricing] After isochrone zone pricing: ${totalPrice}`);

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
          returnPrice = calculateZonePrice({
            distanceMiles: distance ?? 0,
            pickupInsideSelectedZone: pickupInsideThisZone,
            dropoffInsideSelectedZone: dropoffInsideThisZone,
            zoneRadiusMiles,
            basePrice,
            extraPricePerMile,
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

        console.log(`[Pricing] Completed pricing for vehicle ${index + 1} from isochrone zone ${transfer.zone_name}`);
        
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
      estimatedTime: duration
    };
  } catch (error) {
    console.error("[Database] Error fetching isochrone zones and vehicles:", error?.message || error);
    throw new Error("Failed to fetch isochrone zones and vehicle pricing.");
  }
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

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
  const key = `${from}_${to}`;

  if (currencyCache[from]?.[to]) return currencyCache[from][to];

  try {
    const res = await axios.get(`https://api.exchangerate.host/latest?base=${from}&symbols=${to}`);
    const rate = res.data?.rates?.[to];
    if (!currencyCache[from]) currencyCache[from] = {};
    currencyCache[from][to] = rate;
    return rate;
  } catch (error) {
    console.error(`Error fetching exchange rate from ${from} to ${to}`, error);
    return 1;
  }
};

export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return amount;
  try {
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/9effc838a4da8122bac8b714/latest/${from}`);
    const rate = res.data?.conversion_rates?.[to];
    if (!rate) throw new Error(`Missing rate for ${to}`);
    return amount * rate;
  } catch (err) {
    console.error(`Error converting from ${from} to ${to}`, err);
    return amount;
  }
}

// -------------------- Geometry helpers --------------------
function getPolygon(geojson: any) {
  if (!geojson) throw new Error("Invalid geojson");
  const geometry = typeof geojson === "string" ? JSON.parse(geojson).geometry : geojson.geometry;
  if (!geometry) throw new Error("Invalid geojson geometry");
  const coords = geometry.type === "MultiPolygon" ? geometry.coordinates[0] : geometry.coordinates;
  return turf.polygon(coords);
}

function getZonesContainingPoint(lng: number, lat: number, allZones: any[]) {
  const point = turf.point([lng, lat]);
  const matches: any[] = [];
  for (const zone of allZones) {
    try {
      const poly = getPolygon(zone.geojson);
      if (turf.booleanPointInPolygon(point, poly)) matches.push(zone);
    } catch (err) {
      console.warn("Skipping zone due to malformed geojson:", zone?.id, err?.message || err);
    }
  }
  return matches;
}

function getClosestZoneToPoint(lng: number, lat: number, zones: any[]) {
  if (!zones || zones.length === 0) return null;
  const point = turf.point([lng, lat]);
  let best: any = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    try {
      const poly = getPolygon(zone.geojson);
      const center = turf.centroid(poly).geometry.coordinates; // [lng, lat]
      const dist = turf.distance(point, turf.point(center), { units: "miles" });
      if (dist < bestDist) {
        bestDist = dist;
        best = zone;
      }
    } catch (err) {
      console.warn("Error computing centroid/distance for zone", zone?.id, err?.message || err);
    }
  }
  return best;
}

/**
 * pickFinalZone rules (Option A behavior):
 * 1. If there is any common zone containing both pickup & dropoff -> choose the common zone.
 *    If multiple common zones -> choose the one closest to dropoff center.
 * 2. Else if pickup is in multiple zones -> choose closest to pickup center.
 * 3. Else if dropoff is in multiple zones -> choose closest to dropoff center.
 * 4. Else if exactly one pickup zone -> use it.
 * 5. Else -> return null (no zone applies).
 */
function pickFinalZone(fromLng: number, fromLat: number, toLng: number, toLat: number, allZones: any[]) {
  const pickupZones = getZonesContainingPoint(fromLng, fromLat, allZones);
  const dropoffZones = getZonesContainingPoint(toLng, toLat, allZones);

  // common zones
  const common = pickupZones.filter(p => dropoffZones.some(d => d.id === p.id));
  if (common.length > 0) {
    // if multiple common zones, choose one closest to dropoff
    if (common.length === 1) return common[0];
    return getClosestZoneToPoint(toLng, toLat, common);
  }

  // pickup multiple
  if (pickupZones.length > 1) {
    return getClosestZoneToPoint(fromLng, fromLat, pickupZones);
  }

  // dropoff multiple
  if (dropoffZones.length > 1) {
    return getClosestZoneToPoint(toLng, toLat, dropoffZones);
  }

  // single pickup zone
  if (pickupZones.length === 1) return pickupZones[0];

  // single dropoff zone (pickup none)
  if (dropoffZones.length === 1) return dropoffZones[0];

  // none
  return null;
}

// -------------------- Distance helpers --------------------
export async function getRoadDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`
    );
    const distanceText = response.data.rows[0]?.elements[0]?.distance?.text;
    const durationText = response.data.rows[0]?.elements[0]?.duration?.text;
    if (!distanceText || !durationText) throw new Error("Distance or duration not found");
    return {
      distance: parseFloat(distanceText.replace(" mi", "")),
      duration: durationText
    };
  } catch (error) {
    console.error("Error fetching road distance:", error?.response?.data || error?.message || error);
    return { distance: null, duration: null };
  }
}

// -------------------- Zone boundary helpers (optional) --------------------
export async function getDistanceFromZoneBoundary(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
  fromZone: any
) {
  try {
    if (!fromZone || !fromZone.geojson) {
      console.warn("No valid 'From' zone found.");
      return 0;
    }
    const geometry = typeof fromZone.geojson === "string" ? JSON.parse(fromZone.geojson).geometry : fromZone.geojson.geometry;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
      console.warn("Invalid zone geometry type. Expected Polygon or MultiPolygon.");
      return 0;
    }
    const polygonCoordinates = geometry.type === "MultiPolygon" ? geometry.coordinates[0] : geometry.coordinates;
    const lineString = turf.lineString(polygonCoordinates[0] ? polygonCoordinates[0] : polygonCoordinates);
    const toPoint = turf.point([toLng, toLat]);
    const nearestPoint = turf.nearestPointOnLine(lineString, toPoint);
    const extraDistance = turf.distance(toPoint, nearestPoint, { units: "miles" });
    return extraDistance;
  } catch (error) {
    console.error("Error computing distance from zone boundary:", error);
    return 0;
  }
}

// -------------------- Token / third-party API fetch --------------------
export const getBearerToken = async (url: string, userId: string, password: string): Promise<string> => {
  try {
    const response = await axios.post('https://sandbox.iway.io/transnextgen/v3/auth/login', {
      user_id: userId,
      password,
    });
    const token = response.data?.result?.token;
    if (!token) {
      console.error("Invalid token response while fetching bearer token");
      throw new Error("Token not found in the response.");
    }
    return token;
  } catch (error: any) {
    console.error("Error in getBearerToken:", {
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
  const results = await Promise.all(
    validApiDetails.map(async ({ url, username, password, supplier_id }) => {
      try {
        const token = await getBearerToken(url, username, password);
        const response = await axios.get(
          `${url}?user_id=${username}&lang=en&currency=${targetCurrency}&start_place_point=${pickupLocation}&finish_place_point=${dropoffLocation}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        return (response.data?.result || []).map((item: any) => ({
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
      } catch (error: any) {
        console.error(`Error fetching data from ${url}:`, error?.message || error);
        return [{ source: url, error: error?.message || "unknown" }];
      }
    })
  );

  return results.flat();
};

// -------------------- Pricing helper --------------------
/**
 * Pricing rule used:
 * - If pickup is inside the selected zone AND dropoff is outside selected zone:
 *     charge basePrice + extra_price_per_mile * extraMiles
 * - Otherwise basePrice applies (no extra miles charged).
 *
 * Note: radius_km column is treated as miles (per your DB).
 */
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
  // If pickup is not inside the selected zone, do not charge extra miles (per agreed rule)
  if (!pickupInsideSelectedZone) return basePrice;

  // If both inside same zone -> base price
  if (dropoffInsideSelectedZone) return basePrice;

  // Leaving the zone -> charge extra miles beyond radius
  const extraMiles = (distanceMiles ?? 0) - (zoneRadiusMiles ?? 0);
  if (extraMiles > 0) {
    return basePrice + extraMiles * (extraPricePerMile ?? 0);
  }
  return basePrice;
}

// -------------------- Main fetchFromDatabase (updated) --------------------
export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string }> => {
  const [fromLat, fromLng] = pickupLocation.split(",").map(Number);
  const [toLat, toLng] = dropoffLocation.split(",").map(Number);

  try {
    // 1) Load all zones
    const zonesResult = await db.execute(sql`SELECT id, name, radius_km, geojson FROM zones`);
    const allZones = zonesResult.rows as any[];

    // 2) Determine selected zone using the new selection logic (Option A)
    const selectedZone = pickFinalZone(fromLng, fromLat, toLng, toLat, allZones);

    if (!selectedZone) {
      // No zone found — decide behavior:
      // Currently throwing error (same as your previous code). You can change this to fetch fallback vehicles.
      throw new Error("No zones found for the selected locations.");
    }

    console.log(`Selected zone: ${selectedZone.name} (${selectedZone.id})`);

    // 3) Fetch vehicles only for the selected zone (Option A)
    const transfersResult = await db.execute(sql`
      SELECT t.*, v.*, t.extra_price_per_mile
      FROM "Vehicle_transfers" t
      JOIN "all_Vehicles" v ON t.vehicle_id = v.id
      WHERE t.zone_id = ${selectedZone.id}::uuid
    `);
    const transfers = transfersResult.rows as any[];

    // 4) Supporting static data
    const [vehicleTypesResult, marginsResult, surgeChargesResult] = await Promise.all([
      db.execute(sql`SELECT id, "VehicleType", "vehicleImage" FROM "VehicleType"`),
      db.execute(sql`SELECT * FROM "Margin"`),
      db.execute(sql`SELECT * FROM "SurgeCharge" WHERE "From" <= ${date}::date AND "To" >= ${date}::date`)
    ]);

    const vehicleTypes = vehicleTypesResult.rows as any[];
    const margins = marginsResult.rows as any[];
    const supplierMargins = new Map<string, number>();
    for (const margin of margins) {
      if (margin.supplier_id && margin.MarginPrice) supplierMargins.set(margin.supplier_id, Number(margin.MarginPrice));
    }
    const surgeCharges = surgeChargesResult.rows as any[];

    // 5) Compute road distance (miles)
    let { distance, duration } = await getRoadDistance(fromLat, fromLng, toLat, toLng);

    // 6) Determine whether pickup/dropoff are inside selectedZone
    const pickupInsideSelected = getZonesContainingPoint(fromLng, fromLat, [selectedZone]).length > 0;
    const dropoffInsideSelected = getZonesContainingPoint(toLng, toLat, [selectedZone]).length > 0;

    // 7) Price each transfer
    const vehiclesWithPricing = await Promise.all(
      transfers.map(async (transfer) => {
        const basePrice = Number(transfer.price) || 0;

        // Use calculateZonePrice rule
        const zoneRadiusMiles = Number(selectedZone.radius_km) || 0; // treated as miles
        const extraPricePerMile = Number(transfer.extra_price_per_mile) || 0;

        let totalPrice = calculateZonePrice({
          distanceMiles: distance ?? 0,
          pickupInsideSelectedZone: pickupInsideSelected,
          dropoffInsideSelectedZone: dropoffInsideSelected,
          zoneRadiusMiles,
          basePrice,
          extraPricePerMile,
        });

        // Add fixed fees
        totalPrice += Number(transfer.vehicleTax) || 0;
        totalPrice += Number(transfer.parking) || 0;
        totalPrice += Number(transfer.tollTax) || 0;
        totalPrice += Number(transfer.driverCharge) || 0;
        totalPrice += Number(transfer.driverTips) || 0;

        // Night time
        const [hour] = time.split(":").map(Number);
        const isNightTime = (hour >= 22 || hour < 6);
        if (isNightTime && transfer.NightTime_Price) totalPrice += Number(transfer.NightTime_Price);

        // Surge
        const vehicleSurge = surgeCharges.find((s: any) => s.vehicle_id === transfer.vehicle_id && s.supplier_id === transfer.SupplierId);
        if (vehicleSurge && vehicleSurge.SurgeChargePrice) totalPrice += Number(vehicleSurge.SurgeChargePrice);

        // Apply supplier margin
        const margin = supplierMargins.get(transfer.SupplierId) || 0;
        totalPrice += totalPrice * (Number(margin) / 100 || 0);

        // Return trip price (if any)
        let returnPrice = 0;
        const isReturnTrip = !!returnDate && !!returnTime;
        if (isReturnTrip) {
          // Use same logic for return; you can refine this later
          returnPrice = calculateZonePrice({
            distanceMiles: distance ?? 0,
            pickupInsideSelectedZone: pickupInsideSelected,
            dropoffInsideSelectedZone: dropoffInsideSelected,
            zoneRadiusMiles,
            basePrice,
            extraPricePerMile,
          });

          returnPrice += Number(transfer.vehicleTax) || 0;
          returnPrice += Number(transfer.parking) || 0;
          returnPrice += Number(transfer.tollTax) || 0;
          returnPrice += Number(transfer.driverCharge) || 0;
          returnPrice += Number(transfer.driverTips) || 0;

          const [returnHour] = returnTime.split(":").map(Number);
          const isReturnNightTime = (returnHour >= 22 || returnHour < 6);
          if (isReturnNightTime && transfer.NightTime_Price) returnPrice += Number(transfer.NightTime_Price);

          const returnSurge = surgeCharges.find((s: any) =>
            s.vehicle_id === transfer.vehicle_id &&
            s.supplier_id === transfer.SupplierId &&
            s.From <= returnDate &&
            s.To >= returnDate
          );
          if (returnSurge && returnSurge.SurgeChargePrice) returnPrice += Number(returnSurge.SurgeChargePrice);

          // Apply margin on return price
          returnPrice += returnPrice * (Number(margin) / 100 || 0);
        }

        totalPrice += returnPrice;

        // Currency convert
        const convertedPrice = await convertCurrency(totalPrice, transfer.Currency || "USD", targetCurrency);

        // Vehicle image lookup
        const image = vehicleTypes.find((type: any) =>
          String(type.VehicleType || "").toLowerCase().trim() === String(transfer.VehicleType || "").toLowerCase().trim()
        ) || { vehicleImage: "default-image-url-or-path" };

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
          supplierId: transfer.SupplierId
        };
      })
    );

    return { vehicles: vehiclesWithPricing, distance: distance, estimatedTime: duration };
  } catch (error) {
    console.error("Error fetching zones and vehicles:", error?.message || error);
    throw new Error("Failed to fetch zones and vehicle pricing.");
  }
};

// -------------------- Search controller (unchanged except using fetchFromDatabase) --------------------
export const Search = async (req: Request, res: Response, next: NextFunction) => {
  const { date, dropoff, dropoffLocation, pax, pickup, pickupLocation, targetCurrency, time, returnDate, returnTime } = req.body;

  try {
    // Fetch API details from the database
    const apiDetails = await db
      .select({
        url: SupplierApidataTable.Api,
        username: SupplierApidataTable.Api_User,
        password: SupplierApidataTable.Api_Password,
       supplier_id: SupplierApidataTable.Api_Id_Foreign,
      })
      .from(SupplierApidataTable);

    const validApiDetails = apiDetails.filter((detail) => detail.url !== null) as { url: string; username: string; password: string, supplier_id: string }[];

    // Fetch data from third-party APIs
    const apiData = await fetchFromThirdPartyApis(validApiDetails, dropoffLocation, pickupLocation, targetCurrency);

    // Database data
    const DatabaseData = await fetchFromDatabase(pickupLocation, dropoffLocation, targetCurrency, time, date, returnDate, returnTime);
    const mergedData = [ ...apiData.flat(), ...DatabaseData.vehicles];

    res.json({ success: true, data: mergedData, distance: DatabaseData.distance, estimatedTime: DatabaseData.estimatedTime });
  } catch (error: any) {
    console.error("Error fetching and merging data:", error?.message || error);
    res.status(500).json({ success: false, message: "Error processing request", error: error?.message || error });
  }
};

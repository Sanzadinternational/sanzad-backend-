import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { db } from "../db/db";
import { eq } from "drizzle-orm";
import { like } from "drizzle-orm";
import { SupplierApidataTable } from "../db/schema/SupplierSchema";
import { SupplierCarDetailsTable } from "../db/schema/SupplierSchema";
import { CreateTransferCar } from "../db/schema/SupplierSchema";
import { sql, inArray } from "drizzle-orm";
import { zones, transfers_Vehicle } from "../db/schema/SupplierSchema";
import { Create_Vehicles } from "../db/schema/SupplierSchema";

const GOOGLE_MAPS_API_KEY = "AIzaSyAjXkEFU-hA_DSnHYaEjU3_fceVwQra0LI";
import * as turf from '@turf/turf';

const currencyCache: Record<string, Record<string, number>> = {};

export const getExchangeRate = async (from: string, to: string): Promise<number> => {
  const key = `${from}_${to}`;

  if (currencyCache[from]?.[to]) {
    return currencyCache[from][to];
  }

  try {
    const res = await axios.get(`https://api.exchangerate.host/latest?base=${from}&symbols=${to}`);
    const rate = res.data.rates[to];

    if (!currencyCache[from]) currencyCache[from] = {};
    currencyCache[from][to] = rate;

    return rate;
  } catch (error) {
    console.error(`Error fetching exchange rate from ${from} to ${to}`, error);
    return 1;
  }
};

export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  try {
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/5792347d5ad3d4f4281902b1/latest/${from}`);
    let rate = res.data?.conversion_rates?.[to];
    if (!rate) throw new Error(`Missing rate for ${to}`);

    return amount;
  } catch (err) {
    console.error(`Error converting from ${from} to ${to}`, err);
    return amount;
  }
}

// Improved circular zone detection function
function isPointInsideCircularZone(lng: number, lat: number, zoneGeoJson: any, zoneRadiusMiles: number): boolean {
  try {
    const center = getZoneCentroid(zoneGeoJson);
    
    // Validate coordinates
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      console.error(`Invalid coordinates: [${lng}, ${lat}]`);
      return false;
    }
    
    const point = turf.point([lng, lat]);
    const centerPoint = turf.point(center);
    const distanceToCenter = turf.distance(point, centerPoint, { units: 'miles' });
    
    // Add small tolerance for floating point precision
    const tolerance = 0.01;
    const isInside = distanceToCenter <= (zoneRadiusMiles + tolerance);
    
    console.log(`Circle Check - Point: [${lng}, ${lat}] | Center: [${center[0].toFixed(6)}, ${center[1].toFixed(6)}] | Distance: ${distanceToCenter.toFixed(3)}mi | Radius: ${zoneRadiusMiles}mi | Inside: ${isInside}`);
    return isInside;
  } catch (error) {
    console.error("Error in circular zone check:", error);
    
    // Fallback to polygon method
    return isPointInsideZone(lng, lat, zoneGeoJson);
  }
}

// Debug function for boundary cases
function debugZoneBoundary(lng: number, lat: number, zone: any, tripDistance?: number): boolean {
  const center = getZoneCentroid(zone.geojson);
  const point = turf.point([lng, lat]);
  const centerPoint = turf.point(center);
  const distanceToCenter = turf.distance(point, centerPoint, { units: 'miles' });
  
  // Test both methods
  const circleMethod = distanceToCenter <= zone.radius_km; // radius_km is actually in miles
  
  // Polygon method
  let polygonMethod = false;
  try {
    const polygon = turf.polygon(zone.geojson.geometry.coordinates);
    polygonMethod = turf.booleanPointInPolygon(point, polygon);
  } catch (e) {
    console.error("Polygon method failed:", e);
  }
  
  console.log('=== ZONE BOUNDARY DEBUG ===');
  console.log(`Point: [${lng}, ${lat}]`);
  console.log(`Zone: ${zone.name}`);
  console.log(`Zone Center: [${center[0].toFixed(6)}, ${center[1].toFixed(6)}]`);
  console.log(`Distance to center: ${distanceToCenter.toFixed(6)} miles`);
  console.log(`Zone radius: ${zone.radius_km} miles`);
  console.log(`Circle method result: ${circleMethod}`);
  console.log(`Polygon method result: ${polygonMethod}`);
  console.log(`Methods agree: ${circleMethod === polygonMethod}`);
  console.log(`Difference from boundary: ${(distanceToCenter - zone.radius_km).toFixed(6)} miles`);
  if (tripDistance) console.log(`Trip distance: ${tripDistance} miles`);
  console.log('===========================');
  
  return circleMethod;
}

// Debug function to check all zones
async function debugAllZones(lng: number, lat: number, allZones: any[]) {
  console.log('=== DEBUGGING ALL ZONES ===');
  console.log(`Checking point: [${lng}, ${lat}]`);
  
  for (const zone of allZones) {
    try {
      const geojson = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;
      
      if (!geojson?.geometry?.coordinates) {
        console.log(`Zone ${zone.name}: Invalid GeoJSON`);
        continue;
      }
      
      const center = getZoneCentroid(geojson);
      const point = turf.point([lng, lat]);
      const centerPoint = turf.point(center);
      const distance = turf.distance(point, centerPoint, { units: 'miles' });
      
      console.log(`Zone: ${zone.name} | Radius: ${zone.radius_km}mi | Distance: ${distance.toFixed(3)}mi | Inside: ${distance <= zone.radius_km}`);
      console.log(`  Center: [${center[0].toFixed(6)}, ${center[1].toFixed(6)}]`);
      
    } catch (error) {
      console.log(`Zone ${zone.name}: Error - ${error.message}`);
    }
  }
  console.log('==========================');
}

export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  targetCurrency: string,
  time: string,
  date: string,
  returnDate?: string,
  returnTime?: string
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string}> => {
  // Parse coordinates correctly - ensure proper order
  const [fromLat, fromLng] = pickupLocation.split(",").map(coord => parseFloat(coord.trim()));
  const [toLat, toLng] = dropoffLocation.split(",").map(coord => parseFloat(coord.trim()));
  
  console.log(`Parsed coordinates - From: [${fromLat}, ${fromLng}], To: [${toLat}, ${toLng}]`);
  
  try {
    // Step 1: Fetch all zones
    const zonesResult = await db.execute(
      sql`SELECT id, name, radius_km, geojson FROM zones`
    );

    const allZones = zonesResult.rows as any[];
    console.log(`Total zones found: ${allZones.length}`);

    // Step 2: Filter zones where 'From' location is inside
    const matchedZones: any[] = [];

    for (const zone of allZones) {
      try {
        const geojson = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;

        if (!geojson?.geometry?.coordinates) {
          console.warn("Invalid geojson data for zone:", zone.id);
          continue;
        }

        // Use improved zone detection with coordinate validation
        const inside = isPointInsideCircularZone(fromLng, fromLat, geojson, zone.radius_km);
        
        if (inside) {
          console.log(`✅ Zone matched: ${zone.name} (Radius: ${zone.radius_km}mi)`);
          matchedZones.push(zone);
        } else {
          console.log(`❌ Zone not matched: ${zone.name} (Radius: ${zone.radius_km}mi)`);
        }
      } catch (error) {
        console.error("Error processing zone:", zone.id, error);
      }
    }

    console.log(`Total matched zones: ${matchedZones.length}`);
    
    if (matchedZones.length === 0) {
      // Debug why no zones are matching
      await debugAllZones(fromLng, fromLat, allZones);
      throw new Error("No zones found for the selected locations.");
    }

    // Extract zone IDs
    const zoneIds = matchedZones.map(zone => zone.id);

    // Step 3: Fetch all vehicles for the found zones
    const transfersResult = await db.execute(
      sql`SELECT t.*, v.*, t.extra_price_per_mile
          FROM "Vehicle_transfers" t
          JOIN "all_Vehicles" v ON t.vehicle_id = v.id
          WHERE t.zone_id = ANY(ARRAY[${sql.join(zoneIds.map(id => sql`${id}::uuid`), sql`, `)}])`
    );

    const transfers = transfersResult.rows as any[];
    
    // Fetch all vehicle types once before mapping
    const vehicleTypesResult = await db.execute(
      sql`SELECT id, "VehicleType", "vehicleImage" FROM "VehicleType"`
    );
    const vehicleTypes = vehicleTypesResult.rows as any[];

    // Step 4: Calculate Distance
    let { distance, duration } = await getRoadDistance(fromLat, fromLng, toLat, toLng);

    // Step 5: Determine if extra pricing applies - UPDATED with improved detection
    const fromZone = matchedZones.find(zone => {
      // Debug small distance cases specifically
      if (distance && distance < zone.radius_km + 2) {
        return debugZoneBoundary(fromLng, fromLat, zone, distance);
      }
      return isPointInsideCircularZone(fromLng, fromLat, zone.geojson, zone.radius_km);
    });

    const toZone = matchedZones.find(zone => {
      return isPointInsideCircularZone(toLng, toLat, zone.geojson, zone.radius_km);
    });

    console.log("Final Zone Detection - From Zone:", fromZone ? fromZone.name : "Outside");
    console.log("Final Zone Detection - To Zone:", toZone ? toZone.name : "Outside");

    const marginsResult = await db.execute(
      sql`SELECT * FROM "Margin"`
    );
    const margins = marginsResult.rows as any[];
    const supplierMargins = new Map<string, number>();
    for (const margin of margins) {
      if (margin.supplier_id && margin.MarginPrice) {
        supplierMargins.set(margin.supplier_id, Number(margin.MarginPrice));
      }
    }

    const surgeChargesResult = await db.execute(
      sql`SELECT * FROM "SurgeCharge" WHERE "From" <= ${date}::date AND "To" >= ${date}::date`
    );
    const surgeCharges = surgeChargesResult.rows as any[];

    // Step 6: Calculate Pricing for Each Vehicle - UPDATED with better boundary calculation
    const vehiclesWithPricing = await Promise.all(transfers.map(async (transfer) => {
      let totalPrice = Number(transfer.price);

      // UPDATED: Improved price calculation with better boundary handling
      async function calculateTotalPrice() {
        let totalPrice = Number(transfer.price);
        
        if (fromZone && !toZone) {
          console.log(`'From' location is inside '${fromZone.name}', but 'To' location is outside any zone.`);
          if (distance == null) distance = 0;
          
          // More accurate boundary calculation using exact distance from center
          const center = getZoneCentroid(fromZone.geojson);
          const fromPoint = turf.point([fromLng, fromLat]);
          const centerPoint = turf.point(center);
          const exactDistanceToCenter = turf.distance(fromPoint, centerPoint, { units: 'miles' });
          
          const zoneRadiusMiles = fromZone.radius_km; // using as miles
          
          // Calculate how far beyond the zone boundary we're going
          const boundaryDistance = Math.max(0, distance - zoneRadiusMiles);
          
          // Only charge if significantly outside the zone
          const minExtraDistance = 0.1; // Only charge for at least 0.1 extra miles
          if (boundaryDistance >= minExtraDistance) {
            const extraCharge = boundaryDistance * (Number(transfer.extra_price_per_mile) || 0);
            totalPrice += extraCharge;
            console.log(`Exact boundary distance: ${boundaryDistance.toFixed(3)} miles | Extra Charge: ${extraCharge}`);
          } else {
            console.log(`Within boundary tolerance (${boundaryDistance.toFixed(3)} miles) - no extra charge`);
          }
        }
        
        return totalPrice;
      }

      const isReturnTrip = !!returnDate && !!returnTime;

      // UPDATED: Return price calculation with improved boundary logic
      async function calculateReturnPrice() {
        if (!isReturnTrip) return 0;

        let returnPrice = Number(transfer.price);
        
        if (fromZone && !toZone) {
          if (distance == null) distance = 0;
          
          // Use the same improved boundary calculation for return trip
          const center = getZoneCentroid(fromZone.geojson);
          const fromPoint = turf.point([fromLng, fromLat]);
          const centerPoint = turf.point(center);
          const exactDistanceToCenter = turf.distance(fromPoint, centerPoint, { units: 'miles' });
          
          const zoneRadiusMiles = fromZone.radius_km;
          const boundaryDistance = Math.max(0, distance - zoneRadiusMiles);
          
          const minExtraDistance = 0.1;
          if (boundaryDistance >= minExtraDistance) {
            const extraCharge = boundaryDistance * (Number(transfer.extra_price_per_mile) || 0);
            returnPrice += extraCharge;
            console.log(`Return extra distance: ${boundaryDistance.toFixed(3)} miles | Extra Charge: ${extraCharge}`);
          }
        }

        // Check if return time is night time
        const [returnHour, returnMinute] = returnTime.split(":").map(Number);
        const isReturnNightTime = (returnHour >= 22 || returnHour < 6);

        if (isReturnNightTime && transfer.NightTime_Price) {
          returnPrice += Number(transfer.NightTime_Price);
          console.log(`Return night time pricing applied: ${transfer.NightTime_Price}`);
        }

        // Check if surge charge applies for return date
        const returnSurge = surgeCharges.find(surge =>
          surge.vehicle_id === transfer.vehicle_id &&
          surge.supplier_id === transfer.SupplierId &&
          surge.From <= returnDate &&
          surge.To >= returnDate
        );

        if (returnSurge && returnSurge.SurgeChargePrice) {
          returnPrice += Number(returnSurge.SurgeChargePrice);
          console.log(`Return surge pricing applied: ${returnSurge.SurgeChargePrice}`);
        }

        // Add fixed charges again for the return trip
        returnPrice += Number(transfer.vehicleTax) || 0;
        returnPrice += Number(transfer.parking) || 0;
        returnPrice += Number(transfer.tollTax) || 0;
        returnPrice += Number(transfer.driverCharge) || 0;
        returnPrice += Number(transfer.driverTips) || 0;

        // Apply margin again if needed
        const margin = supplierMargins.get(transfer.SupplierId) || 0;
        returnPrice += returnPrice * (Number(margin) / 100 || 0);

        return returnPrice;
      }

      totalPrice = await calculateTotalPrice();
      const returnPrice = await calculateReturnPrice();
      const margin = supplierMargins.get(transfer.SupplierId) || 0;
      
      // Add fixed charges
      totalPrice += Number(transfer.vehicleTax) || 0;
      totalPrice += Number(transfer.parking) || 0;
      totalPrice += Number(transfer.tollTax) || 0;
      totalPrice += Number(transfer.driverCharge) || 0;
      totalPrice += Number(transfer.driverTips) || 0;
      
      // Night time pricing logic
      const currentTime = time;
      const [hour, minute] = currentTime.split(":").map(Number);
      const isNightTime = (hour >= 22 || hour < 6);

      if (isNightTime && transfer.NightTime_Price) {
        totalPrice += Number(transfer.NightTime_Price);
        console.log(`Night time detected (${currentTime}) → Adding nightTimePrice: ${transfer.NightTime_Price}`);
      }
      
      // Check if surge charge applies
      const vehicleSurge = surgeCharges.find(surge =>
        surge.vehicle_id === transfer.vehicle_id &&
        surge.supplier_id === transfer.SupplierId
      );
      
      const image = vehicleTypes.find(type =>
        type.VehicleType.toLowerCase().trim() === transfer.VehicleType.toLowerCase().trim()
      ) || { vehicleImage: 'default-image-url-or-path' };

      if (vehicleSurge && vehicleSurge.SurgeChargePrice) {
        const surgeAmount = Number(vehicleSurge.SurgeChargePrice);
        totalPrice += surgeAmount;
        console.log(`Surge pricing applied → Vehicle ID: ${transfer.vehicle_id} | Surge: ${surgeAmount}`);
      }
      
      totalPrice += totalPrice * (Number(margin) / 100 || 0);
      totalPrice += returnPrice;
      console.log(`Return price for vehicle ${transfer.vehicle_id}: ${returnPrice}`);

      const convertedPrice = await convertCurrency(totalPrice, transfer.Currency, targetCurrency);

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
    }));

    return { vehicles: vehiclesWithPricing, distance: distance, estimatedTime: duration };
  } catch (error) {
    console.error("Error fetching zones and vehicles:", error);
    throw new Error("Failed to fetch zones and vehicle pricing.");
  }
};

// Improved point in zone function with better error handling
function isPointInsideZone(lng: number, lat: number, geojson: any): boolean {
  try {
    if (!geojson?.geometry?.coordinates) {
      console.warn("Invalid geojson format detected!", geojson);
      return false;
    }

    let coords = geojson.geometry.coordinates;

    // Handle MultiPolygon: Use the first polygon
    if (geojson.geometry.type === "MultiPolygon") {
      coords = coords[0];
    }

    const polygon = turf.polygon(coords);
    const point = turf.point([lng, lat]);

    // Use strict boundary checking (no ignoreBoundary)
    const inside = turf.booleanPointInPolygon(point, polygon);
    
    console.log(`Point [${lng}, ${lat}] inside zone (strict check): ${inside}`);

    return inside;
  } catch (error) {
    console.error("Error checking point inside zone:", error);
    return false;
  }
}

// Enhanced getZoneCentroid with validation
function getZoneCentroid(zoneGeoJson: any): number[] {
  try {
    const centroid = turf.centroid(zoneGeoJson).geometry.coordinates;
    
    // Validate centroid coordinates
    if (centroid[0] === 0 && centroid[1] === 0) {
      console.warn("Centroid calculation may have failed - returning first coordinate");
      // Return the first coordinate of the polygon as fallback
      const coords = zoneGeoJson.geometry.coordinates[0][0];
      return [coords[0], coords[1]];
    }
    
    return centroid;
  } catch (error) {
    console.error("Error computing zone centroid, using fallback:", error);
    
    // Fallback: use the first coordinate of the polygon
    try {
      const coords = zoneGeoJson.geometry.coordinates[0][0];
      return [coords[0], coords[1]];
    } catch (e) {
      console.error("Complete centroid failure:", e);
      return [0, 0];
    }
  }
}

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
    console.error("Error fetching road distance:", error);
    return { distance: null, duration: null };
  }
}

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

    if (!fromZone.geojson.geometry || fromZone.geojson.geometry.type !== "Polygon") {
      console.warn("Invalid zone geometry type. Expected Polygon.");
      return 0;
    }

    const polygonCoordinates = fromZone.geojson.geometry.coordinates[0];
    const lineString = turf.lineString(polygonCoordinates);
    const toPoint = turf.point([toLng, toLat]);
    const nearestPoint = turf.nearestPointOnLine(lineString, toPoint);
    const extraDistance = turf.distance(toPoint, nearestPoint, { units: "miles" });

    console.log("Boundary distance:", extraDistance);
    return extraDistance;
    
  } catch (error) {
    console.error("Error calculating boundary distance:", error);
    return 0;
  }
}

export const getBearerToken = async (
  url: string,
  userId: string,
  password: string
): Promise<string> => {
  try {
    console.log("Sending authentication request:", { user_id: userId, password });

    const response = await axios.post('https://sandbox.iway.io/transnextgen/v3/auth/login', {
      user_id: userId,
      password,
    });

    if (!response.data.result.token) {
      console.error("Invalid token response:", response.data.result.token);
      throw new Error("Token not found in the response.");
    }

    return response.data.result.token;
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

        return response.data.result.map((item: any) => ({
          vehicalType: item.car_class?.title || "Unknown",
          brand: item.car_class?.models[0] || "Unknown",
          price: item.price || 0,
          currency: item.currency || "USD",
          passengers: item.car_class?.capacity || 0,
          mediumBag: item.car_class?.luggage_capacity || 0,
          source: "api",
          SmallBag: 0,
          supplierId: supplier_id,
        }));

      } catch (error: any) {
        console.error(`Error fetching data from ${url}: ${error.message}`);
        return [{ source: url, error: error.message }];
      }
    })
  );

  return results.flat();
};

// Test function to verify zone detection
export const testZoneDetection = async (req: Request, res: Response) => {
  const { lng, lat } = req.body;
  
  try {
    const zonesResult = await db.execute(
      sql`SELECT id, name, radius_km, geojson FROM zones`
    );

    const allZones = zonesResult.rows as any[];
    const results = [];

    for (const zone of allZones) {
      const geojson = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;
      const center = getZoneCentroid(geojson);
      const distance = turf.distance(turf.point([lng, lat]), turf.point(center), { units: 'miles' });
      
      results.push({
        zone: zone.name,
        radius: zone.radius_km,
        distance: distance.toFixed(3),
        inside: distance <= zone.radius_km,
        center: center
      });
    }

    res.json({ success: true, point: [lng, lat], results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const Search = async (req: Request, res: Response, next: NextFunction) => {
  const { date, dropoff, dropoffLocation, pax, pickup, pickupLocation, targetCurrency, time, returnDate, returnTime } = req.body;

  // Validate input coordinates
  console.log('=== INPUT VALIDATION ===');
  console.log('Pickup Location:', pickupLocation);
  console.log('Dropoff Location:', dropoffLocation);
  
  try {
    const [pickupLat, pickupLng] = pickupLocation.split(",").map(coord => parseFloat(coord.trim()));
    const [dropoffLat, dropoffLng] = dropoffLocation.split(",").map(coord => parseFloat(coord.trim()));
    
    console.log('Parsed Pickup:', { lat: pickupLat, lng: pickupLng });
    console.log('Parsed Dropoff:', { lat: dropoffLat, lng: dropoffLng });
    
    // Validate coordinate ranges
    if (Math.abs(pickupLng) > 180 || Math.abs(pickupLat) > 90 || 
        Math.abs(dropoffLng) > 180 || Math.abs(dropoffLat) > 90) {
      console.error('Invalid coordinate ranges detected');
      return res.status(400).json({ 
        success: false, 
        message: "Invalid coordinates provided" 
      });
    }

    // Fetch API details from the database
    const apiDetails = await db
      .select({
        url: SupplierApidataTable.Api,
        username: SupplierApidataTable.Api_User,
        password: SupplierApidataTable.Api_Password,
        supplier_id: SupplierApidataTable.Api_Id_Foreign,
      })
      .from(SupplierApidataTable);

    const validApiDetails = apiDetails.filter(
      (detail) => detail.url !== null
    ) as { url: string; username: string; password: string, supplier_id: string }[];

    // Fetch data from third-party APIs
    const apiData = await fetchFromThirdPartyApis(
      validApiDetails,
      dropoffLocation,
      pickupLocation,
      targetCurrency
    );

    const DatabaseData = await fetchFromDatabase(pickupLocation, dropoffLocation, targetCurrency, time, date, returnDate, returnTime);
    
    const mergedData = [ ...apiData.flat(), ...DatabaseData.vehicles];

    res.json({ 
      success: true, 
      data: mergedData, 
      distance: DatabaseData.distance, 
      estimatedTime: DatabaseData.estimatedTime 
    });
  } catch (error: any) {
    console.error("Error fetching and merging data:", error.message);
    res.status(500).json({ success: false, message: "Error processing request", error });
  }
};

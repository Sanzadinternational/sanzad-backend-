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

// Interface for enhanced zone data
interface ZoneWithRoadData {
  id: string;
  name: string;
  radius_km: number;
  geojson: any;
  roadRadiusMiles: number;
  roadDistanceToDropoff: number;
  fromInside: boolean;
  dropoffInsideByRoad: boolean;
  priority: number;
  equivalentRoadRadius: number;
}

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
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/9effc838a4da8122bac8b714/latest/${from}`);
    let rate = res.data?.conversion_rates?.[to];
    if (!rate) throw new Error(`Missing rate for ${to}`);

    return amount * rate;
  } catch (err) {
    console.error(`Error converting from ${from} to ${to}`, err);
    return amount;
  }
}

// Function to calculate urban density factor for road distance conversion
async function calculateUrbanDensityFactor(lat: number, lng: number): Promise<number> {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    const address = response.data.results[0]?.formatted_address || '';
    const isDenseUrban = address.includes('NY') || 
                        address.includes('New York') || 
                        address.includes('Manhattan') ||
                        address.includes('Brooklyn') ||
                        address.includes('Queens') ||
                        address.includes('Paris') ||
                        address.includes('London') ||
                        address.includes('Tokyo');
    
    return isDenseUrban ? 1.4 : 1.2;
  } catch (error) {
    return 1.3;
  }
}

// Function to get road distance equivalent of straight-line radius
async function getRoadDistanceEquivalent(straightLineMiles: number, location: { lat: number, lng: number }): Promise<number> {
  try {
    // Create a point 1 mile north to measure road distance vs straight-line
    const testPointLat = location.lat + (1 / 69);
    const testPointLng = location.lng;
    
    const roadDistance = await getRoadDistance(
      location.lat, location.lng,
      testPointLat, testPointLng
    );
    
    if (roadDistance.distance && roadDistance.distance > 0) {
      const roadToStraightRatio = roadDistance.distance / 1;
      return straightLineMiles * roadToStraightRatio;
    }
  } catch (error) {
    console.error("Error calculating road distance equivalent:", error);
  }
  
  // Fallback with urban density factor
  const urbanDensityFactor = await calculateUrbanDensityFactor(location.lat, location.lng);
  return straightLineMiles * urbanDensityFactor;
}

// Enhanced zone validation with road distance
async function validateZoneWithRoadDistance(
  zone: any, 
  fromLat: number, 
  fromLng: number, 
  toLat: number, 
  toLng: number
): Promise<ZoneWithRoadData | null> {
  try {
    const geojson = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;
    
    if (!geojson?.geometry?.coordinates) {
      return null;
    }

    const polygon = turf.polygon(
      geojson.geometry.type === "MultiPolygon"
        ? geojson.geometry.coordinates[0]
        : geojson.geometry.coordinates
    );

    const fromPoint = turf.point([fromLng, fromLat]);
    const fromInside = turf.booleanPointInPolygon(fromPoint, polygon);

    if (!fromInside) {
      return null;
    }

    // Get zone center
    const zoneCenter = getZoneCentroid(geojson);
    
    // Calculate road distance from zone center to dropoff
    const roadDistanceToDropoff = await getRoadDistance(
      zoneCenter[1], zoneCenter[0], toLat, toLng
    );

    if (!roadDistanceToDropoff.distance) {
      return null;
    }

    // Convert straight-line radius to equivalent road distance
    const equivalentRoadRadius = await getRoadDistanceEquivalent(
      zone.radius_km * 0.621371, // Convert km to miles
      { lat: zoneCenter[1], lng: zoneCenter[0] }
    );

    const dropoffInsideByRoad = roadDistanceToDropoff.distance <= equivalentRoadRadius;

    // Calculate priority score
    let priority = 0;
    if (dropoffInsideByRoad) priority += 100;
    priority += Math.max(0, 50 - (roadDistanceToDropoff.distance * 2));
    priority += Math.max(0, 30 - (zone.radius_km / 10));

    return {
      ...zone,
      roadRadiusMiles: equivalentRoadRadius,
      roadDistanceToDropoff: roadDistanceToDropoff.distance,
      fromInside,
      dropoffInsideByRoad,
      priority,
      equivalentRoadRadius
    };

  } catch (error) {
    console.error(`Error validating zone ${zone.id} with road distance:`, error);
    return null;
  }
}

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
    // Step 1: Fetch all zones
    const zonesResult = await db.execute(
      sql`SELECT id, name, radius_km, geojson FROM zones`
    );

    const allZones = zonesResult.rows as any[];

    // Step 2: Enhanced zone selection with road distance validation
    const zoneValidationPromises = allZones.map(zone => 
      validateZoneWithRoadDistance(zone, fromLat, fromLng, toLat, toLng)
    );

    const validatedZones = (await Promise.all(zoneValidationPromises))
      .filter((zone): zone is ZoneWithRoadData => zone !== null)
      .sort((a, b) => b.priority - a.priority);

    const zones = validatedZones.length > 0 ? [validatedZones[0]] : [];

    if (zones.length === 0) {
      throw new Error("No zones found for the selected locations.");
    }

    const selectedZone = zones[0];
    console.log(`Selected zone: ${selectedZone.name} | Road radius: ${selectedZone.equivalentRoadRadius.toFixed(2)} miles | Dropoff inside: ${selectedZone.dropoffInsideByRoad}`);

    // Step 3: Fetch vehicles for the selected zone
    const transfersResult = await db.execute(
      sql`SELECT t.*, v.*, t.extra_price_per_mile
          FROM "Vehicle_transfers" t
          JOIN "all_Vehicles" v ON t.vehicle_id = v.id
          WHERE t.zone_id = ${selectedZone.id}::uuid`
    );

    const transfers = transfersResult.rows as any[];

    // Fetch vehicle types
    const vehicleTypesResult = await db.execute(
      sql`SELECT id, "VehicleType", "vehicleImage" FROM "VehicleType"`
    );
    const vehicleTypes = vehicleTypesResult.rows as any[];

    // Step 4: Calculate actual road distance
    let { distance, duration } = await getRoadDistance(fromLat, fromLng, toLat, toLng);

    // Step 5: Get margins and surge charges
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

    // Step 6: Calculate pricing with road distance considerations
    const vehiclesWithPricing = await Promise.all(transfers.map(async (transfer) => {
      let totalPrice = Number(transfer.price);

      // Function to calculate total price based on road distance
      async function calculateTotalPrice() {
        let totalPrice = Number(transfer.price);
        
        // Use road distance for extra charge calculation
        if (selectedZone && (distance > selectedZone.equivalentRoadRadius)) {
          console.log(`Trip exceeds zone road radius. Distance: ${distance} miles, Zone radius: ${selectedZone.equivalentRoadRadius.toFixed(2)} miles`);
          
          const boundaryDistance = distance - selectedZone.equivalentRoadRadius;
          const extraCharge = Number(boundaryDistance) * (Number(transfer.extra_price_per_mile) || 0);
          totalPrice += extraCharge;

          console.log(`Extra Road Distance: ${boundaryDistance.toFixed(2)} miles | Extra Charge: ${extraCharge}`);
        }

        return totalPrice;
      }

      const isReturnTrip = !!returnDate && !!returnTime;

      // Function to calculate return trip pricing
      async function calculateReturnPrice() {
        if (!isReturnTrip) {
          return 0;
        }

        let returnPrice = Number(transfer.price);
        
        // Apply same road distance logic for return trip
        if (selectedZone && (distance > selectedZone.equivalentRoadRadius)) {
          const boundaryDistance = distance - selectedZone.equivalentRoadRadius;
          const extraCharge = Number(boundaryDistance) * (Number(transfer.extra_price_per_mile) || 0);
          returnPrice += extraCharge;
          console.log(`Return extra road distance: ${boundaryDistance.toFixed(2)} miles | Extra Charge: ${extraCharge}`);
        }

        // Night time pricing for return
        const [returnHour, returnMinute] = returnTime.split(":").map(Number);
        const isReturnNightTime = (returnHour >= 22 || returnHour < 6);

        if (isReturnNightTime && transfer.NightTime_Price) {
          returnPrice += Number(transfer.NightTime_Price);
          console.log(`Return night time pricing applied: ${transfer.NightTime_Price}`);
        }

        // Surge charge for return date
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

        // Add fixed charges for return trip
        returnPrice += Number(transfer.vehicleTax) || 0;
        returnPrice += Number(transfer.parking) || 0;
        returnPrice += Number(transfer.tollTax) || 0;
        returnPrice += Number(transfer.driverCharge) || 0;
        returnPrice += Number(transfer.driverTips) || 0;

        // Apply margin
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

      // Night time pricing
      const [hour, minute] = time.split(":").map(Number);
      const isNightTime = (hour >= 22 || hour < 6);

      if (isNightTime && transfer.NightTime_Price) {
        totalPrice += Number(transfer.NightTime_Price);
        console.log(`Night time detected (${time}) → Adding nightTimePrice: ${transfer.NightTime_Price}`);
      }

      // Surge charges
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

      // Apply margin
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
        supplierId: transfer.SupplierId,
        zoneName: selectedZone.name,
        roadDistance: distance,
        zoneRoadRadius: selectedZone.equivalentRoadRadius
      };
    }));

    return { vehicles: vehiclesWithPricing, distance: distance, estimatedTime: duration };
  } catch (error) {
    console.error("Error fetching zones and vehicles:", error);
    throw new Error("Failed to fetch zones and vehicle pricing.");
  }
};

// Function to check if a point is inside a polygon
function isPointInsideZone(lng, lat, geojson) {
  try {
    if (!geojson?.geometry?.coordinates) {
      console.warn("Invalid geojson format detected!", geojson);
      return false;
    }

    let coords = geojson.geometry.coordinates;

    if (geojson.geometry.type === "MultiPolygon") {
      coords = coords[0];
    }

    const polygon = turf.polygon(coords);
    const point = turf.point([lng, lat]);

    const inside = turf.booleanPointInPolygon(point, polygon);
    console.log(`Point [${lng}, ${lat}] inside zone: ${inside}`);

    return inside;
  } catch (error) {
    console.error("Error checking point inside zone:", error);
    return false;
  }
}

// Function to get road distance using Google Maps
export async function getRoadDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`
    );

    const distanceText = response.data.rows[0]?.elements[0]?.distance?.text;
    const durationText = response.data.rows[0]?.elements[0]?.duration?.text;

    if (!distanceText || !durationText) {
      console.error("Distance or duration not found in response:", response.data);
      throw new Error("Distance or duration not found");
    }

    return {
      distance: parseFloat(distanceText.replace(" mi", "")),
      duration: durationText
    };
  } catch (error) {
    console.error("Error fetching road distance:", error);
    return { distance: null, duration: null };
  }
}

// Function to calculate distance from zone boundary (updated for road distance)
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

    // Use road distance instead of straight-line calculation
    const roadDistance = await getRoadDistance(fromLat, fromLng, toLat, toLng);
    
    if (!roadDistance.distance) {
      return 0;
    }

    // Calculate extra distance beyond zone's road radius
    const extraDistance = Math.max(0, roadDistance.distance - fromZone.equivalentRoadRadius);
    
    console.log(`Road distance: ${roadDistance.distance} miles, Zone road radius: ${fromZone.equivalentRoadRadius.toFixed(2)} miles, Extra distance: ${extraDistance.toFixed(2)} miles`);
    
    return extraDistance;
  } catch (error) {
    console.error("Error calculating distance from zone boundary:", error);
    return 0;
  }
}

// Function to calculate the centroid of a zone polygon
function getZoneCentroid(zoneGeoJson: any) {
  try {
    return turf.centroid(zoneGeoJson).geometry.coordinates;
  } catch (error) {
    console.error("Error computing zone centroid:", error);
    return [0, 0];
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

// Main search function
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

    // Filter out entries with null URL
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

    // Fetch data from database with enhanced road distance logic
    const DatabaseData = await fetchFromDatabase(
      pickupLocation, 
      dropoffLocation,
      targetCurrency,
      time, 
      date,
      returnDate, 
      returnTime 
    );

    // Merge database and API data
    const mergedData = [...apiData.flat(), ...DatabaseData.vehicles];

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

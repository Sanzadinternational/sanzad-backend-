import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { db } from "../db/db";
import { sql } from "drizzle-orm";
import { SupplierApidataTable } from "../db/schema/SupplierSchema";
import * as turf from '@turf/turf';

const GOOGLE_MAPS_API_KEY = "AIzaSyAjXkEFU-hA_DSnHYaEjU3_fceVwQra0LI";

// Interface for zone data
interface ZoneWithRoadData {
  id: string;
  name: string;
  radius_km: number;
  geojson: any;
  straightLineRadiusMiles: number;
  roadDistanceToDropoff: number;
  fromInside: boolean;
  dropoffInsideByStraightLine: boolean;
  priority: number;
  zoneCenter: [number, number];
}

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
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/9effc838a4da8122bac8b714/latest/${from}`);
    let rate = res.data?.conversion_rates?.[to];
    if (!rate) throw new Error(`Missing rate for ${to}`);

    return amount * rate;
  } catch (err) {
    console.error(`Error converting from ${from} to ${to}`, err);
    return amount;
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

    // Step 2: Enhanced zone selection with hybrid approach
    const validatedZones = await validateZonesWithHybridApproach(
      allZones, 
      fromLat, 
      fromLng, 
      toLat, 
      toLng
    );

    const zones = validatedZones.length > 0 ? [validatedZones[0]] : [];

    if (zones.length === 0) {
      throw new Error("No zones found for the selected locations.");
    }

    const selectedZone = zones[0];
    console.log(`Selected zone: ${selectedZone.name} | Straight-line radius: ${selectedZone.straightLineRadiusMiles.toFixed(2)} miles`);

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

    // Step 4: Calculate actual road distance for the trip
    let { distance: roadDistance, duration } = await getRoadDistance(fromLat, fromLng, toLat, toLng);

    // Step 5: Calculate straight-line distance for zone radius comparison
    const straightLineDistance = turf.distance(
      turf.point([fromLng, fromLat]),
      turf.point([toLng, toLat]),
      { units: 'miles' }
    );

    console.log(`📍 ZONE: ${selectedZone.name}`);
    console.log(`📏 ZONE RADIUS: ${selectedZone.straightLineRadiusMiles.toFixed(2)} miles (straight-line)`);
    console.log(`🛣️  ROAD DISTANCE: ${roadDistance} miles`);
    console.log(`📐 STRAIGHT-LINE DISTANCE: ${straightLineDistance.toFixed(2)} miles`);

    // Step 6: Get margins and surge charges
    const marginsResult = await db.execute(sql`SELECT * FROM "Margin"`);
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

    // Step 7: Calculate pricing with NO BUFFER extra charge logic
    const vehiclesWithPricing = await Promise.all(transfers.map(async (transfer) => {
      let totalPrice = Number(transfer.price);

      // Function to calculate total price - NO BUFFER
      async function calculateTotalPrice() {
        let totalPrice = Number(transfer.price);
        
        // NO BUFFER - Use strict straight-line distance comparison
        console.log(`🔍 EXTRA CHARGE CHECK for ${transfer.VehicleType}:`);
        console.log(`   Straight-line distance: ${straightLineDistance.toFixed(2)} miles`);
        console.log(`   Zone radius: ${selectedZone.straightLineRadiusMiles.toFixed(2)} miles`);
        console.log(`   Road distance: ${roadDistance} miles`);

        if (selectedZone && (straightLineDistance > selectedZone.straightLineRadiusMiles)) {
          // Calculate how much we exceeded the zone in straight-line distance
          const exceededStraightLine = straightLineDistance - selectedZone.straightLineRadiusMiles;
          
          // Calculate the ratio of road distance to straight-line distance
          const distanceRatio = roadDistance / straightLineDistance;
          
          // Convert straight-line excess to equivalent road distance
          const extraRoadDistance = exceededStraightLine * distanceRatio;
          
          const extraCharge = extraRoadDistance * (Number(transfer.extra_price_per_mile) || 0);
          totalPrice += extraCharge;

          console.log(`🚨 EXTRA CHARGES APPLIED:`);
          console.log(`   Straight-line exceeded by: ${exceededStraightLine.toFixed(2)} miles`);
          console.log(`   Distance ratio (road/straight): ${distanceRatio.toFixed(2)}`);
          console.log(`   Extra road distance to charge: ${extraRoadDistance.toFixed(2)} miles`);
          console.log(`   Rate: $${transfer.extra_price_per_mile}/mile`);
          console.log(`   Extra Charge: $${extraCharge.toFixed(2)}`);
        } else {
          console.log(`✅ NO EXTRA CHARGES - Within zone radius`);
        }

        return totalPrice;
      }

      const isReturnTrip = !!returnDate && !!returnTime;

      // Function to calculate return trip pricing - NO BUFFER
      async function calculateReturnPrice() {
        if (!isReturnTrip) {
          return 0;
        }

        let returnPrice = Number(transfer.price);
        
        // Apply same NO BUFFER logic for return trip
        if (selectedZone && (straightLineDistance > selectedZone.straightLineRadiusMiles)) {
          const exceededStraightLine = straightLineDistance - selectedZone.straightLineRadiusMiles;
          const distanceRatio = roadDistance / straightLineDistance;
          const extraRoadDistance = exceededStraightLine * distanceRatio;
          const extraCharge = extraRoadDistance * (Number(transfer.extra_price_per_mile) || 0);
          returnPrice += extraCharge;
          console.log(`🔄 RETURN TRIP - Extra charge: $${extraCharge.toFixed(2)}`);
        }

        // Night time pricing for return
        const [returnHour, returnMinute] = returnTime.split(":").map(Number);
        const isReturnNightTime = (returnHour >= 22 || returnHour < 6);

        if (isReturnNightTime && transfer.NightTime_Price) {
          returnPrice += Number(transfer.NightTime_Price);
          console.log(`🌙 RETURN NIGHT TIME - Added: $${transfer.NightTime_Price}`);
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
          console.log(`📈 RETURN SURGE - Added: $${returnSurge.SurgeChargePrice}`);
        }

        // Add fixed charges for return trip
        returnPrice += Number(transfer.vehicleTax) || 0;
        returnPrice += Number(transfer.parking) || 0;
        returnPrice += Number(transfer.tollTax) || 0;
        returnPrice += Number(transfer.driverCharge) || 0;
        returnPrice += Number(transfer.driverTips) || 0;

        // Apply margin
        const margin = supplierMargins.get(transfer.SupplierId) || 0;
        if (margin > 0) {
          const marginAmount = returnPrice * (Number(margin) / 100);
          returnPrice += marginAmount;
          console.log(`💰 RETURN MARGIN ${margin}% - Added: $${marginAmount.toFixed(2)}`);
        }

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
      const [hour, minute] = time.split(":"").map(Number);
      const isNightTime = (hour >= 22 || hour < 6);

      if (isNightTime && transfer.NightTime_Price) {
        totalPrice += Number(transfer.NightTime_Price);
        console.log(`🌙 NIGHT TIME - Added: $${transfer.NightTime_Price}`);
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
        console.log(`📈 SURGE PRICING - Added: $${surgeAmount}`);
      }

      // Apply margin
      if (margin > 0) {
        const marginAmount = totalPrice * (Number(margin) / 100);
        totalPrice += marginAmount;
        console.log(`💰 MARGIN ${margin}% - Added: $${marginAmount.toFixed(2)}`);
      }

      // Add return price
      totalPrice += returnPrice;
      console.log(`🔄 RETURN PRICE - Added: $${returnPrice.toFixed(2)}`);

      console.log(`🎯 FINAL BASE PRICE before conversion: $${totalPrice.toFixed(2)} ${transfer.Currency}`);

      const convertedPrice = await convertCurrency(totalPrice, transfer.Currency, targetCurrency);

      console.log(`💱 CONVERTED PRICE: $${convertedPrice.toFixed(2)} ${targetCurrency}`);

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
        price: Number(convertedPrice.toFixed(2)),
        nightTime: transfer.NightTime,
        passengers: transfer.Passengers,
        currency: targetCurrency,
        mediumBag: transfer.MediumBag,
        SmallBag: transfer.SmallBag,
        nightTimePrice: transfer.NightTime_Price,
        transferInfo: transfer.Transfer_info,
        supplierId: transfer.SupplierId,
        zoneName: selectedZone.name,
        roadDistance: roadDistance,
        straightLineDistance: straightLineDistance,
        zoneRadius: selectedZone.straightLineRadiusMiles,
        extraChargesApplied: straightLineDistance > selectedZone.straightLineRadiusMiles,
        extraDistance: straightLineDistance > selectedZone.straightLineRadiusMiles 
          ? (straightLineDistance - selectedZone.straightLineRadiusMiles) * (roadDistance / straightLineDistance)
          : 0
      };
    }));

    return { 
      vehicles: vehiclesWithPricing, 
      distance: roadDistance, 
      estimatedTime: duration 
    };
  } catch (error) {
    console.error("Error fetching zones and vehicles:", error);
    throw new Error("Failed to fetch zones and vehicle pricing.");
  }
};

// Hybrid zone validation function
async function validateZonesWithHybridApproach(
  allZones: any[], 
  fromLat: number, 
  fromLng: number, 
  toLat: number, 
  toLng: number
): Promise<ZoneWithRoadData[]> {
  const validatedZones: ZoneWithRoadData[] = [];

  for (const zone of allZones) {
    try {
      const geojson = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;
      
      if (!geojson?.geometry?.coordinates) {
        continue;
      }

      const polygon = turf.polygon(
        geojson.geometry.type === "MultiPolygon"
          ? geojson.geometry.coordinates[0]
          : geojson.geometry.coordinates
      );

      const fromPoint = turf.point([fromLng, fromLat]);
      const toPoint = turf.point([toLng, toLat]);

      // Use straight-line check for zone membership (since GeoJSON is straight-line)
      const fromInside = turf.booleanPointInPolygon(fromPoint, polygon);
      const toInside = turf.booleanPointInPolygon(toPoint, polygon);

      if (!fromInside) {
        continue;
      }

      // Get zone center
      const zoneCenter = getZoneCentroid(geojson);
      
      // Calculate straight-line distances
      const straightLineRadiusMiles = zone.radius_km * 0.621371;
      
      // Calculate straight-line distance from zone center to dropoff
      const straightLineDistanceToDropoff = turf.distance(
        turf.point(zoneCenter),
        toPoint,
        { units: 'miles' }
      );

      // Calculate road distance from zone center to dropoff for prioritization
      const roadDistanceToDropoff = await getRoadDistance(
        zoneCenter[1], zoneCenter[0], toLat, toLng
      );

      // Calculate priority score
      let priority = 0;
      
      // Highest priority: both pickup and dropoff inside zone by straight-line
      if (fromInside && toInside) priority += 100;
      
      // High priority: dropoff inside straight-line radius
      if (straightLineDistanceToDropoff <= straightLineRadiusMiles) priority += 80;
      
      // Medium priority: closer road distance to dropoff
      priority += Math.max(0, 50 - (roadDistanceToDropoff.distance || straightLineDistanceToDropoff));
      
      // Lower priority: smaller zones first (more specific)
      priority += Math.max(0, 30 - (zone.radius_km / 10));

      validatedZones.push({
        ...zone,
        straightLineRadiusMiles,
        roadDistanceToDropoff: roadDistanceToDropoff.distance || straightLineDistanceToDropoff,
        fromInside,
        dropoffInsideByStraightLine: toInside,
        priority,
        zoneCenter
      });

      console.log(`Zone ${zone.name}: FromInside=${fromInside}, ToInside=${toInside}, Priority=${priority}`);

    } catch (error) {
      console.error(`Error validating zone ${zone.id}:`, error);
      continue;
    }
  }

  // Sort by priority (highest first)
  return validatedZones.sort((a, b) => b.priority - a.priority);
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
      console.error("Distance or duration not found in response");
      return { distance: null, duration: null };
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

// Function to calculate the centroid of a zone polygon
function getZoneCentroid(zoneGeoJson: any): [number, number] {
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

    // Fetch data from database with NO BUFFER approach
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

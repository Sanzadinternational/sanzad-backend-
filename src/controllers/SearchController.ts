import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { db } from "../db/db";
import { eq } from "drizzle-orm";
import { like } from "drizzle-orm";
import { SupplierApidataTable } from "../db/schema/SupplierSchema";
import { SupplierCarDetailsTable } from "../db/schema/SupplierSchema";
import { CreateTransferCar } from "../db/schema/SupplierSchema";
import { sql, inArray } from "drizzle-orm";
import { zones, transfers_Vehicle
, } from "../db/schema/SupplierSchema";
import { Create_Vehicles } from "../db/schema/SupplierSchema";

 const GOOGLE_MAPS_API_KEY = "AIzaSyAjXkEFU-hA_DSnHYaEjU3_fceVwQra0LI"; // Replace with actual API key
 import * as turf from '@turf/turf'; // Import turf.js for geospatial operations

 export const fetchFromDatabase = async (
  pickupLocation: string,
  dropoffLocation: string,
  providedDistance?: number
): Promise<{ vehicles: any[]; distance: any; estimatedTime: string}> => {
  // Parse pickup location coordinates
  const [fromLat, fromLng] = pickupLocation.split(",").map(Number);
  const [toLat, toLng] = dropoffLocation.split(",").map(Number);

  try {
    // Step 1: Fetch all zones
    const zonesResult = await db.execute(
      sql`SELECT id, name, radius_km, geojson FROM zones`
    );

    const allZones = zonesResult.rows as any[];

    // Step 2: Filter zones that contain 'From' or 'To' location
    const zones = allZones.filter(zone => {
      try {
        const geojson = typeof zone.geojson === "string" ? JSON.parse(zone.geojson) : zone.geojson;
    
        if (!geojson || !geojson.geometry || !Array.isArray(geojson.geometry.coordinates)) {
          console.warn("Invalid geojson data for zone:", zone.id);
          return false;
        }
    
        const coordinates = geojson.geometry.coordinates;
        const polygon = turf.polygon(coordinates);
        const fromPoint = turf.point([fromLng, fromLat]);
    
        return turf.booleanPointInPolygon(fromPoint, polygon); // Only check 'from' inside
      } catch (error) {
        console.error("Error processing zone:", zone.id, error);
        return false;
      }
    });

    if (!zones || zones.length === 0) {
      throw new Error("No zones found for the selected locations.");
    }

    // Extract zone IDs
    const zoneIds = zones.map(zone => zone.id);

    // Step 3: Fetch all vehicles for the found zones
    const transfersResult = await db.execute(
      sql`SELECT t.*, v.*, t.extra_price_per_mile
          FROM "Vehicle_transfers" t
          JOIN "all_Vehicles" v ON t.vehicle_id = v.id
          WHERE t.zone_id = ANY(ARRAY[${sql.join(zoneIds.map(id => sql`${id}::uuid`), sql`, `)}])`
    );

    const transfers = transfersResult.rows as any[];

    // Step 4: Calculate Distance
    let { distance, duration } = providedDistance 
  ? { distance: providedDistance, duration: "N/A" } 
  : await getRoadDistance(fromLat, fromLng, toLat, toLng);

    // Step 5: Determine if extra pricing applies
    const fromZone = zones.find(zone => {
      const inside = isPointInsideZone(fromLng, fromLat, zone.geojson);
      console.log(`Checking 'From' location against zone: ${zone.name} - Inside: ${inside}`);
      return inside;
    });

    const toZone = zones.find(zone => {
      const inside = isPointInsideZone(toLng, toLat, zone.geojson);
      console.log(`Checking 'To' location against zone: ${zone.name} - Inside: ${inside}`);
      return inside;
    });

    console.log("Final Zone Detection - From Zone:", fromZone ? fromZone.name : "Outside");
    console.log("Final Zone Detection - To Zone:", toZone ? toZone.name : "Outside");

    // Step 6: Calculate Pricing for Each Vehicle
    const vehiclesWithPricing = await Promise.all(transfers.map(async (transfer) => {
      let totalPrice = Number(transfer.price); // Base price

      // Function to calculate total price asynchronously
      async function calculateTotalPrice() {
          let totalPrice = Number(transfer.price); // Base price
          
          if (fromZone && !toZone) {
              console.log(`'From' location is inside '${fromZone.name}', but 'To' location is outside any zone.`);
              if (distance == null) {
                distance = 0;
              }
              // const boundaryDistance = await getDistanceFromZoneBoundary(fromLng, fromLat, toLng, toLat, fromZone);
           const boundaryDistance = distance - fromZone.radius_km;
              const extraCharge = Number(boundaryDistance) * (Number(transfer.extra_price_per_mile) || 0);
              totalPrice += extraCharge;
  
              console.log(`Extra Distance: ${boundaryDistance} miles | Extra Charge: ${extraCharge}`);
          }
  
          return totalPrice;
      }
  
      totalPrice = await calculateTotalPrice();

      return {
        vehicleId: transfer.vehicle_id,
        vehicalType: transfer.VehicleType,
        brand: transfer.VehicleBrand,
        vehicleName: transfer.name,
        extraPricePerKm: transfer.extra_price_per_mile,
        price: Number(totalPrice.toFixed(2)),
        nightTime: transfer.NightTime,
        passengers: transfer.Passengers,
        currency: transfer.Currency,
        mediumBag: transfer.MediumBag,
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

// Function to check if a point is inside a polygon (GeoJSON)
function isPointInsideZone(lng: number, lat: number, geojson: any) {
  try {
    if (
      !geojson ||
      !geojson.geometry ||
      !Array.isArray(geojson.geometry.coordinates)
    ) {
      console.warn("Invalid geojson format detected!", geojson);
      return false;
    }

    // Check if it's a MultiPolygon instead of a Polygon
    if (geojson.geometry.type === "MultiPolygon") {
      console.warn("MultiPolygon detected, using first polygon.");
      geojson.geometry.coordinates = geojson.geometry.coordinates[0]; // Take first polygon
    }

    const polygon = turf.polygon(geojson.geometry.coordinates);
    const point = turf.point([lng, lat]);

    const inside = turf.booleanPointInPolygon(point, polygon);
    console.log(`Point [${lng}, ${lat}] inside zone: ${inside}`);

    return inside;
  } catch (error) {
    console.error("Error checking point inside zone:", error);
    return false;
  }
}


// Function to get road distance using Google Maps Distance Matrix API
export async function getRoadDistance(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`
    );

    const distanceText = response.data.rows[0]?.elements[0]?.distance?.text;
    const durationText = response.data.rows[0]?.elements[0]?.duration?.text;

    if (!distanceText || !durationText) throw new Error("Distance or duration not found");

    return {
      distance: parseFloat(distanceText.replace(" mi", "")), // Convert "12.3 mi" to 12.3
      duration: durationText // Keep as string (e.g., "25 mins")
    };
  } catch (error) {
    console.error("Error fetching road distance:", error);
    return { distance: null, duration: null };
  }
}

// Function to calculate the extra distance from the 'to' location to the nearest zone boundary
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

    const polygonCoordinates = fromZone.geojson.geometry.coordinates[0]; // Outer boundary
    const lineString = turf.lineString(polygonCoordinates); // Convert Polygon boundary to LineString

    const toPoint = turf.point([toLng, toLat]);
    const nearestPoint = turf.nearestPointOnLine(lineString, toPoint); // Now it works!

    const extraDistance = turf.distance(toPoint, nearestPoint, { units: "miles" });

    console.log("Type of boundaryDistance:", typeof extraDistance);
    return extraDistance;
    
  } catch (error) {

    return 0;
  }
}


// Function to calculate the centroid of a zone polygon
function getZoneCentroid(zoneGeoJson: any) {
  try {
    return turf.centroid(zoneGeoJson).geometry.coordinates;
  } catch (error) {
    console.error("Error computing zone centroid:", error);
    return [0, 0]; // Default to avoid crashes
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
  
      // Ensure the token exists in the response
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
  
  
  // Function to fetch and normalize data from third-party APIs
  export const fetchFromThirdPartyApis = async (
    apiDetails: { url: string; username: string; password: string }[],
    dropoffLocation: string,
    pickupLocation: string
  ): Promise<any[]> => {
    const results = await Promise.all(
      apiDetails.map(async ({ url, username, password }) => {
        try {
          // Get the Bearer token
          const token = await getBearerToken(url, username, password);
          // Fetch data using the Bearer token
          const response = await axios.get(`
            ${url}?user_id=${username}&lang=en&currency=USD&start_place_point=${pickupLocation}&finish_place_point=${dropoffLocation}`,
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
          }));

        } catch (error: any) {
          console.error(`Error fetching data from ${url}:, error.message`);
          return { source: url, error: error.message};
        }
      })
    );
  
    return results;
  };

// Search function
export const Search = async (req: Request, res: Response, next: NextFunction) => {
  const { date, dropoff, dropoffLocation, pax, pickup, pickupLocation } = req.body;

  try {
    // Fetch data from the database
    // const databaseData = await fetchFromDatabase();

    // Fetch API details from the database
    const apiDetails = await db
      .select({
        url: SupplierApidataTable.Api,
        username: SupplierApidataTable.Api_User,
        password: SupplierApidataTable.Api_Password,
      })
      .from(SupplierApidataTable);

    // Filter out entries with null URL
    const validApiDetails = apiDetails.filter(
      (detail) => detail.url !== null
    ) as { url: string; username: string; password: string }[];

    // Fetch data from third-party APIs
    const apiData = await fetchFromThirdPartyApis(
      validApiDetails,
      dropoffLocation,
      pickupLocation
    );

    const DatabaseData = await fetchFromDatabase(pickupLocation, dropoffLocation);
    const [pickupLat, pickupLon] = pickupLocation.split(",").map(Number);
    const [dropLat, dropLon] = dropoffLocation.split(",").map(Number);
    // Merge database and API data
    const mergedData = [ ...apiData.flat(), ...DatabaseData.vehicles];

    res.json({ success: true, data: mergedData, distance: DatabaseData.distance, estimatedTime: DatabaseData.estimatedTime });
  } catch (error: any) {
    console.error("Error fetching and merging data:", error.message);
    res.status(500).json({ success: false, message: "Error processing request", error });
  }
};

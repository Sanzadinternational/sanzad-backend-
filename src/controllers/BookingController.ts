import { BookingTable } from './../db/schema/BookingSchema'; 
import { Request, Response, NextFunction } from "express"; 
import { db } from "../db/db"; 
import { and, desc, eq } from "drizzle-orm"; 
import { CreateBooking } from "../dto/Booking.dto";  

export const Booking = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{ 
          const {  
            booking_no, 
            pickup,
            dropoff,
            passenger,
            date,
            time,
            return_date,
            return_time,
            estimated_trip_time,
            distance,
            vehicle_name,
            passengers_no,
            medium_bags,
            passenger_name,
            passenger_email,
            passenger_contact_no,
            agentforeign
          } = <CreateBooking>req.body; 
          function getSixDigitRandom() {
            return Math.random().toString().substring(2, 8);
          }
          const booking_numbers = getSixDigitRandom();
          const result = await db.insert(BookingTable) 
          .values({
            booking_no:booking_numbers,
            pickup,
            dropoff,
            passenger,
            date,
            time,
            return_date,
            return_time,
            estimated_trip_time,
            distance,
            vehicle_name,
            passengers_no,
            medium_bags,
            passenger_name,
            passenger_email,
            passenger_contact_no,
            agentforeign
          })
          .returning();
          res.status(200).json(result); 
    }catch(error){
        next(error)
    }
}
import { Request, Response, NextFunction } from "express"; 
import { CreateSupplierInput,UpdateVehicleType,UpdateVehicleModel,UpdateServiceType,UpdateVehicleBrand,VehicleType,SurgeCharge,VehicleBrand,ServiceType,UpdateTransferCars,VehicleModel,CreateTransferCars,UpdateCreateCartDetails,
    CreateCartDetails,CreateSupplierDetailServicesInput,CreateExtraSpace,UpdateExtraSpace,CreateTransportNodesInput,SupplierPriceInput, CreateSupplierOneWayInput,CreateSupplierApidata,DriversModel } from "../dto";
import { and,desc, eq } from "drizzle-orm"; 
const { v4: uuidv4 } = require('uuid'); 
import { Create_Vehicles } from "../db/schema/SupplierSchema";
import { CreateVehicle } from "../dto";
import { AgentTable } from "../db/schema/AgentSchema";
import {AdminTable} from "../db/schema/adminSchema";
import { notifications } from "../db/schema/schema";
import { io } from "../..";
import { db } from "../db/db"; 
const { registerTable,SurgeChargeTable,DriversTable, One_WayTable,CreateExtraSpaces,VehicleTypeTable,VehicleBrandTable,ServiceTypeTable,VehicleModelTable,CreateTransferCar,
    supplier_otps,PriceTable,SupplierApidataTable,TransportNodes,SupplierCarDetailsTable} = require('../db/schema/SupplierSchema'); 
import { zones } from "../db/schema/SupplierSchema";
import { generateOTP, sendOTPEmail } from "../utils"; 
var randomstring = require("randomstring");
const { registerTable2 } = require('../db/schema/Supplier_details_of_ServicesSchema'); 
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken'); 
const nodemailer = require("nodemailer"); 
import * as turf from "@turf/turf";
import { transfers_Vehicle } from "../db/schema/SupplierSchema";
import { BookingTable,PaymentsTable } from "../db/schema/BookingSchema";

export const CreateSupplier = async (req: Request, res: Response, next: NextFunction) => { 
    try {   
        const { 
            Company_name, 
            Owner, 
            Address, 
            Country,  
            City,
            Zip_code,
            Office_number,
            Email,
            Contact_Person,
            State,
            Alternate_email,
            Alternate_phone,
            Legal_company,
            Mobile_number,
            Gst_Vat_Tax_number, 
            PAN_number, 
            Currency,
        
            Password,
            Role,
           IsApproved
        } = <CreateSupplierInput>req.body; 
        const Approval_status = {
            Pending: 0, // Default
            Approved: 1,
            Canceled: 2,
        };
        
        const existingSupplier = await db
        .select()
        .from(registerTable)
        .where(eq(registerTable.Email, Email))


        const existingAgent= await db.select().from(AgentTable).where(eq(AgentTable.Email, Email))
    
    if (existingSupplier.length > 0 || existingAgent.length>0) {
      
        return res.status(400).json({
            success: false,
            message: "We find out email id used one does not work again. So we used different email id and recd OTP. Reason can be displayed as this email id is already registered. Use new email id"
        });
    }
    
        const id = uuidv4(); 

        const Gst_Tax_Certificate = (req as any).file ? (req as any).file.filename : null;

        const hashedPassword = await bcrypt.hash(Password, 10); 
        const newSupplier = await db
            .insert(registerTable)
            .values({
                Company_name,
                Owner,
                Address,
                Country, 
                City,
                Zip_code,
                Office_number,
                Email,
                Contact_Person,
                State,
                Alternate_email,
                Alternate_phone,
                Legal_company,
                Mobile_number,
                Gst_Vat_Tax_number, 
                PAN_number, 
                Currency,
                Gst_Tax_Certificate,
                Password:hashedPassword,
                Role:Role || 'supplier',
                IsApproved: IsApproved || Approval_status.Pending
            })
            .returning(); 
            // res.status(201).json(newSupplier);
    const result = await db
           .select({
               Email: registerTable.Email,
               Password: registerTable.Password, // Assuming the password is encrypted
               // IV: AgentTable.IV, // IV used for encryption
           })
           .from(registerTable)
           .orderBy(desc(registerTable.id))
           .limit(1);
    const transporter = nodemailer.createTransport({
        service: 'Gmail', // Replace with your email service provider
        auth: {
               user: 'sanzadinternational5@gmail.com', // Email address from environment variable
               pass: 'betf euwp oliy tooq', // Email password from environment variable
        },
    });
  

const info = await transporter.sendMail({
    from: '"Sanzadinternational" <sanzadinternational5@gmail.com>', // Sender address
    to: `${result[0].Email}`, // Recipient address
    subject: "Your Account Has Been Created.", // Updated subject line
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #2c3e50;">Account Update from Sanzad International</h2>
            <p style="font-size: 16px; color: #555;">Dear User,</p>
            <ul style="font-size: 16px; color: #555; padding-left: 20px;">
                <li>This process will be completed in the next 2 hours.</li>
                <li>Thereafter, the website can be browsed from your end and we are happy to take your bookings.</li>
                <li>Happy Selling!</li>
            </ul>
            <p style="font-size: 16px; color: #555;">Best regards,</p>
            <p style="font-size: 16px; color: #555;"><strong>Sanzad International Team</strong></p>
        </div>
    `,
});
        
        const AdminMessage = await db.select({
            Email:AdminTable.Email
        })
        .from(AdminTable)
        .where(eq(AdminTable.Email, Email))

  const transporters = nodemailer.createTransport({
        service: 'Gmail', // Replace with your email service provider
        auth: {
               user: 'sanzadinternational5@gmail.com', // Email address from environment variable
               pass: 'betf euwp oliy tooq', // Email password from environment variable
        },
    });
  

const infos = await transporters.sendMail({
    from: '"Sanzadinternational" <sanzadinternational5@gmail.com>', // Sender address
    // to: `${AdminMessage[0].Email}`, // Recipient address
    to:`sanzadinternational5@gmail.com`,
    subject: "New Supplier Registration ", // Updated subject line
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <p style="font-size: 16px; color: #555;">Dear Admin,</p>
            <ul style="font-size: 16px; color: #555; padding-left: 20px;">
                <li>There is a new supplier registration in Sanzad International. </li>
                <li>Please check and approve of this supplier.</li>
            </ul>
            <p style="font-size: 16px; color: #555;">Best regards,</p>
            <p style="font-size: 16px; color: #555;"><strong>Sanzad International Team</strong></p>
        </div>
    `,
});

    
        const ApiNotification = await db
            .insert(notifications).values({
                role_id: 1,
                type: "New_supplier",
                role: "supplier",
                message: `${Company_name} Transfer is successfully registered`,
            });

            io.emit("new_supplier_registered", {
                message: `${Company_name} Transfer is successfully registered`,
              });
        
    console.log("Message sent: %s", info.messageId);

        return res.status(200).json({message:"Supplier Status is Created Successfully",result})
        // return res.status(201).json(newSupplier);

    } catch (error) {
      
        next(error);
    }
};

export const ForgetPasswords = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { Email } = req.body;
    
      // Validate email input
      if (!Email || typeof Email !== 'string') {
        return res.status(400).send({ success: false, message: "Valid email is required." });
      } 
                     
      // Check if the user exists based on the email
      const user = await db
        .select({ Email: registerTable.Email })
        .from(registerTable)
        .where(eq(registerTable.Email, Email));
  
      if (user.length > 0) {
       // Generate a reset token
       const Token = randomstring.generate();
       const resetTokenExpiry = new Date(Date.now() + 3600000); // Token expires in 1 hour
  
       // Save the reset token and expiry in the database
       const GenerateToken = await db
              .update(registerTable)  // Use the correct table reference
              .set({
                  Token,
                  resetTokenExpiry,
              })
              .where(eq(registerTable.Email, Email))  // Use the `id` to target the specific row
              .returning();  //
  
              const transporter = nodemailer.createTransport({
                  service: 'Gmail', // Replace with your email service provider
                  auth: {
                        user: 'sanzadinternational5@gmail.com', // Email address from environment variable
                        pass: 'betf euwp oliy tooq', // Email password from environment variable
                  },
              });
              const resetLink = `http://localhost:8000/api/V1/supplier/resetpassword?token=${Token}`;
              // Send an email with the retrieved data (decrypted password)
              const info = await transporter.sendMail({
                  from: '"Sanzadinternational" <sanzadinternational5@gmail.com>', // Sender address
                  to: `${user[0].Email}`,
                  subject: "Query from Sanzadinternational", // Subject line
                  text: `Details of New Agent Access:\nEmail: ${user[0].Email}`, // Plain text body
                  html: `Please click below link then reset your password<br>Link: <a href="${resetLink}">${resetLink}</a>`, // HTML body,
              });
      
              console.log("Message sent: %s", info.messageId);
       // Ideally, you'd send this token via email. For now, we return it in the response.
       res.status(200).send({
         success: true,
         message: "Password reset token generated successfully.",
         GenerateToken: GenerateToken, // In a production app, don't send the token in the response, use email
      
       });
  
      } else {
        // If the user does not exist
        res.status(404).send({
          success: false,
          message: "User not found with the provided email.",
        });
      }
  
    } catch (error) {
      console.error('Error in ForgetPassword API:', error);
      next(error); // Pass the error to the next middleware for handling
    }
  };
  
  export const resetPasswords = async (req: Request, res: Response, next: NextFunction) => {
    const { Token, Email, Password } = req.body; // Extract fields from the request body
  
    try {
      // Step 1: Hash the new password
      const hashedPassword = await bcrypt.hash(Password, 10);  
  
      // Step 2: Verify that the user with the given Token and Email exists
      const user = await db
        .select({ id: registerTable.id, Email: registerTable.Email }) // Select necessary fields
        .from(registerTable)
        .where(and(eq(registerTable.Token, Token), eq(registerTable.Email, Email)));
  
      if (user.length === 0) {
        return res.status(404).json({ error: "Invalid Token or Email" });
      }
  
      // Step 3: Update the user's password and reset the token
      const result = await db
        .update(registerTable)
        .set({
          Password: hashedPassword,
          Token: "", // Clear the token
        })
        .where(eq(registerTable.id, user[0].id)) // Use the unique `id` for the update
        .returning();
  
      // Step 4: Respond with success
      res.status(200).json({ message: "Password reset successful", result });
    } catch (error) {
      console.error("Error in resetPassword:", error);
      next(error); // Pass the error to the next middleware
    }
  };
  
export const GetSupplier = async (req: Request, res: Response, next: NextFunction) => {
    try {
       
        const result = await db 
            .select({
                id: registerTable.id,
                Company_name: registerTable.Company_name,
                Owner: registerTable.Owner,
                Address: registerTable.Address,
                Country: registerTable.Country,
                City: registerTable.City,
                Zip_code: registerTable.Zip_code,
                Office_number: registerTable.Office_number,
                Email: registerTable.Email,
                Contact_Person: registerTable.Contact_Person,
                Otp: registerTable.Otp,
                Mobile_number: registerTable.Mobile_number,
                Gst_Vat_Tax_number: registerTable.Gst_Vat_Tax_number,
                PAN_number: registerTable.PAN_number,
                Currency: registerTable.Currency,
                Gst_Tax_Certificate: registerTable.Gst_Tax_Certificate,
                Password: registerTable.Password
                // Api_key:registerTable.Api_key,
                // Is_up:registerTable.Is_up,
            })
            .from(registerTable);

        return res.status(200).json(result); 

    } catch (error) {
       
        next(error);
    }
};
//Transport
export const TransportNode = async(req:Request,res:Response,next:NextFunction)=>{ 
   try{
        const {
            formatted_address,
            location_lat,
            location_lon,
            description,
            place_id,
            country,
            airport_or_establishment,
        }= <CreateTransportNodesInput>req.body;

        const TransportNode = await db.insert(TransportNodes)
        .values({
            formatted_address,
            location_lat,
            location_lon,
            description,
            place_id,
            country,
            airport_or_establishment,
        })
        .returning();
        return res.status(200).json(TransportNode);
   }catch(error){
    next(error)
   }
}
export const Supplier_price = async (req:Request,res:Response,next:NextFunction)=>{
    try{
          const {
            country,
            city,
            location_from_airport,
            location_from_port_cruise,
            location_from_station,
            location_from_city_center, 
            location_to_airport,
            location_to_port_cruise,
            location_to_station,
            location_to_city_center,
            night_time_supplement,
            vice_versa,
            half_day_city_limit_4hrs,
            full_day_city_limit_8hrs,
            from_date, 
            to_date,   
            price, 
            new_location,
          }=<SupplierPriceInput>req.body;

          const Supplier_Price= await db.insert(PriceTable)
          .values({
            country,
            city,
            location_from_airport,
            location_from_port_cruise,
            location_from_station,
            location_from_city_center, 
            location_to_airport,
            location_to_port_cruise,
            location_to_station,
            location_to_city_center,
            night_time_supplement,
            vice_versa,
            half_day_city_limit_4hrs,
            full_day_city_limit_8hrs,
            from_date, 
            to_date,   
            price, 
            new_location,
          })
          .returning();

          return res.status(201).json(Supplier_Price);

    }catch(error){
        next(error);
    }
}

export const Supplier_details = async (req: Request, res: Response, next: NextFunction) => {   
    try {
        // Destructure the incoming request body 
        const {
            Vehicle_type,
            Vehicle_brand, 
            Type_service,
            Vehicle_model, 
            Doors,
            Seats,
            Category_space,
            Max_number_pax_accommodate,
            Luggage_information,
            Max_number_medium_suitcase,
            Max_number_carbin_bag, 
            Space_available_other_luggage, 
            Location_details,
            Transfer_information,
            Service_providing_location,  
            Airport,
            Port_cruise, 
            Station,
            City_center,
            Vehicle_for,
            Half_day_city_limit_4hrs, 
            Full_day_city_limit_8hrs,   
            Inclusions,
            Vehicle_rent,
            Fuel,
            Driver,
            Parking_fees,
            Toll_or_taxes, 
            Driver_tips,
            Other, 
        } = <CreateSupplierDetailServicesInput>req.body; // Directly take values from the request body 

        const id = uuidv4(); // Generate UUID for the new supplier

        // Insert the new supplier details into the database
        const newSupplier = await db
            .insert(registerTable2) // Assuming `registerTable2` is your Drizzle ORM table
            .values({

                Vehicle_type,
                Vehicle_brand, 
                Type_service,
                Vehicle_model, 
                Doors,
                Seats,
                Category_space,
                Max_number_pax_accommodate,
                Luggage_information,
                Max_number_medium_suitcase,
                Max_number_carbin_bag, 
                Space_available_other_luggage, 
                Location_details,
                Transfer_information,
                Service_providing_location,  
                Airport,
                Port_cruise, 
                Station,
                City_center,
                Vehicle_for,
                Half_day_city_limit_4hrs, 
                Full_day_city_limit_8hrs,   
                Inclusions,
                Vehicle_rent,
                Fuel,
                Driver,
                Parking_fees,
                Toll_or_taxes, 
                Driver_tips,
                Other, 
            })
            .returning(); // Return the newly inserted supplier details 

        // Respond with the newly created supplier
        return res.status(201).json(newSupplier);

    } catch (error) {
        // Pass any error to the error handler middleware
        next(error);
    }
};

export const deleteUserById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Assuming the ID to delete comes from the request (e.g., a URL parameter)
        const { id } = req.params;

        // Perform the deletion
        const deletedUserIds: { deletedId: number }[] = await db
            .delete(registerTable2)
            .where(eq(registerTable2.id, id)) // Dynamically use the provided ID
            .returning({ deletedId: registerTable2.id });

        // If no user was deleted, return a 404 response
        if (deletedUserIds.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Respond with the ID(s) of the deleted user(s)
        return res.status(200).json(deletedUserIds);

    } catch (error) {
        // Handle any errors that occur
        next(error);
    }
};


export const GetSupplier_details = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Fetch all suppliers from the database
        const result = await db 
            .select({
                id: registerTable2.id,
                vehicle_type:registerTable2.vehicle_type,
                vehicle_brand:registerTable2.vehicle_brand,
                type_service:registerTable2.type_service,
                vehicle_model:registerTable2.vehicle_model,
                doors:registerTable2.doors,
                seats:registerTable2.seats,
                category_space:registerTable2.category_space,
                max_number_pax_accommodate:registerTable2.max_number_pax_accommodate,
                luggage_information:registerTable2.luggage_information,
                max_number_medium_suitcase:registerTable2.max_number_medium_suitcase,
                max_number_carbin_bag:registerTable2.max_number_carbin_bag,
                space_available_other_luggage:registerTable2.space_available_other_luggage,
                location_details:registerTable2.location_details,
                transfer_information:registerTable2.transfer_information,
                service_providing_location:registerTable2.service_providing_location,
                airport:registerTable2.airport,
                port_cruise:registerTable2.port_cruise,
                station:registerTable2.station,
                city_center:registerTable2.city_center,
                vehicle_for:registerTable2.vehicle_for,
                half_day_city_limit_4hrs:registerTable2.half_day_city_limit_4hrs,
                full_day_city_limit_8hrs:registerTable2.full_day_city_limit_8hrs,
                inclusions:registerTable2.inclusions,
                vehicle_rent:registerTable2.vehicle_rent,
                fuel:registerTable2.fuel,
                driver:registerTable2.driver,
                parking_fees:registerTable2.parking_fees,
                toll_or_taxes:registerTable2.toll_or_taxes,
                driver_tips:registerTable2.driver_tips,
                other:registerTable2.other,
                // password:registerTable.password,
            })
            .from(registerTable2);

        return res.status(200).json(result); 

    } catch (error) {
        // Pass the error to the error handler middleware
        next(error);
    }
}; 

//comment

export const One_Way_Details = async (req: Request, res: Response, next: NextFunction) => {   
    try {
        // Destructure the incoming request body 
        const {
            country,
            city,
            location_from_airport,
            location_from_port_cruise,
            location_from_station,
            location_from_city_center,
            location_to_airport,
            location_to_port_cruise,
            location_to_station,
            location_to_city_center,
            night_time_supplement,
            vice_versa,
            half_day_city_limit_4hrs,
            full_day_city_limit_8hrs,
            from_date, 
            to_date,   
            price, 
            new_location,
        } = <CreateSupplierOneWayInput>req.body; 

        const id = uuidv4();
        const newSupplier = await db
            .insert(One_WayTable) // Assuming `registerTable2` is your Drizzle ORM table
            .values({
                id, // Include the generated UUID
               country,
            city,
            location_from_airport,
            location_from_port_cruise,
            location_from_station,
            location_from_city_center,
            location_to_airport,
            location_to_port_cruise,
            location_to_station,
            location_to_city_center,
            night_time_supplement,
            vice_versa,
            half_day_city_limit_4hrs,
            full_day_city_limit_8hrs,
            from_date, 
            to_date,   
            price, 
            new_location, 
            })
            .returning(); // Return the newly inserted supplier details 

        // Respond with the newly created supplier
        return res.status(201).json(newSupplier); 

    } catch (error) {
        // Pass any error to the error handler middleware
        next(error);
    }
}; 


export const suppliersendOtp= async(req:Request,res:Response,next:NextFunction)=>{
    const { email } = req.body; 
    const existingSupplier = await db
    .select()
    .from(registerTable)
    .where(eq(registerTable.Email, email))
    // .union(
    //     db.select().from(AgentTable).where(eq(AgentTable.Email, Email))
    // );

    const existingAgent= await db.select().from(AgentTable).where(eq(AgentTable.Email, email))

if (existingSupplier.length > 0 || existingAgent.length > 0) {
    // If email exists in either table, return a conflict response
    return res.status(406).json({
        success: false,
        message: "Email is already registered in the system." 
    });
}else{
    const otp = generateOTP();
    const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes
  
    // Save OTP and expiry time in the `otps` table
    await db.insert(supplier_otps).values({ email, otp, otpExpiry: expiryTime });
    await sendOTPEmail(email, otp);
  
    res.status(200).json({ message: 'OTP sent successfully' });
} 
}

export const supplierverifyOtp = async (req: Request, res: Response, next: NextFunction) => {
    const { email, otp } = req.body;

    try {
        // Retrieve the most recent OTP record for the provided email
        const otpRecord = await db
            .select()
            .from(supplier_otps)
            .where(eq(supplier_otps.email, email))
            .orderBy(desc(supplier_otps.otpExpiry))
            .limit(1);   // Get the latest OTP record directly
            const otpRecords = otpRecord[0];
        // Check if an OTP record exists and if it's valid
        if (!otpRecords || otpRecords.otp !== otp || new Date() > new Date(otpRecords.otpExpiry)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};


const JWT_SECRET = process.env.JWT_SECRET || 'Sanzad'; 
const JWT_REFRESH_SECRET = "abhi123";
export const CreateSupplierApi = async (req: Request, res: Response, next: NextFunction) => { 
    try {
        // Destructure request body 
        const { Api, Api_User, Api_Password, Api_Id_Foreign } = req.body; 

        // Validate input
        if (!Api || !Api_User || !Api_Password || !Api_Id_Foreign) {
            return res.status(400).json({ error: "All fields are required." });
        }

        // Insert new supplier record
        const newSupplier = await db
            .insert(SupplierApidataTable)
            .values({
                Api,
                Api_User,
                Api_Password,
                Api_Id_Foreign,
            })
            .returning();

            const ApiNotification = await db
            .insert(notifications).values({
                role_id: "1",
                type: "supplier_registered",
                role: "supplier",
                message: `New Api has registered.`,
            });

            io.emit("new_supplier_registered", {
                message: `new Api has registered.`,
              });

        // Return success response with new supplier details
        return res.status(200).json(newSupplier); 
    } catch (error) {
        // Handle any errors
        next(error);
    } 
}; 
export const GetSupplierApi = async(Req:Request,res:Response,next:NextFunction)=>{
    try{
         const getsupplierapidata = await db.select()
         .from(SupplierApidataTable)
         return res.status(200).json(getsupplierapidata);
    }catch(error){
        next(error)
    }
}
export const DeleteSupplierApi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const deletedSupplier = await db
      .delete(SupplierApidataTable)
      .where(eq(SupplierApidataTable.id, id))
      .returning();

    res.status(200).json({
      message: "Supplier deleted successfully",
      deletedSupplier,
    });
  } catch (error) {
    next(error);
  }
};
// Car Details
export const CreateTransferCarDetails = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Ensure req.body is an array
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ success: false, message: "Request body must be an array." });
      } 
       
      // Validate each item in the array (optional, depends on your validation setup)
      const transferCarDetails = req.body.map((item: CreateTransferCars) => ({
        uniqueId: item.uniqueId, 
        Transfer_from: item.Transfer_from, 
        Extra_Price:item.Extra_Price, 
        Distance: item.Distance,  
        Location: item.Location,
        Vice_versa: item.Vice_versa, 
        Price: item.Price,
        NightTime: item.NightTime,
        NightTime_Price: item.NightTime_Price,
        SupplierCarDetailsforeign: item.SupplierCarDetailsforeign,
      }));
       
      // Perform batch insert
      const TransferCars = await db.insert(CreateTransferCar).values(transferCarDetails).returning();
  
      // Send the inserted records as a response
      return res.status(200).json({ success: true, data: TransferCars });
    } catch (error) {
      console.error(error); // Log the error for debugging
      next(error); // Pass the error to error-handling middleware
    }
  };

export const CreateExtraSp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Ensure req.body is an array 
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ success: false, message: "Request body must be an array." });
      }
    
      // Validate each item in the array (optional, depends on your validation setup)
      const Extra_spaces = req.body.map((item: CreateExtraSpace) => ({
        uniqueId: item.uniqueId,
        Roof_Rack: item.Roof_Rack,
        Trailer_Hitch: item.Trailer_Hitch,
        Extended_Cargo_Space: item.Extended_Cargo_Space,
        SupplierCarDetailsforeign: item.SupplierCarDetailsforeign,
      }));
  
      // Perform batch insert
      const Extra = await db.insert(CreateExtraSpaces).values(Extra_spaces).returning();
  
      // Send the inserted records as a response
      return res.status(200).json({ success: true, data: Extra });
    } catch (error) {
      console.error(error); // Log the error for debugging
      next(error); // Pass the error to error-handling middleware
    }
  };
// Extra Space 
export const ExtraSpace = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{ 
          const result = await db.select({ 
            id:CreateExtraSpaces.id,
            Roof_Rack:CreateExtraSpaces.Roof_Rack,
            Trailer_Hitch:CreateExtraSpaces.Trailer_Hitch, 
            Extended_Cargo_Space:CreateExtraSpaces.Extended_Cargo_Space
          }) 
          .from(CreateExtraSpaces)
          res.status(200).json(result)
         
    }catch(error){ 
        res.status(404).json({message:"Data is not found"}) 
    }
} 
        
export const CreateCartDetail= async(req:Request,res:Response,next:NextFunction)=>{ 
    try{ 
         const {  
            uid,
            uniqueId,
            SupplierId,
            VehicleType, 
            VehicleBrand,
            ServiceType,
            VehicleModel,
            Doors,
            Seats, 
            Cargo,
            City,
            Country,
            Passengers,
            MediumBag,
            SmallBag, 
            TransferInfo, 

            HalfDayRide,
            FullDayRide,
            HalfFullNightTime,
            HalfFullNightTimePrice,
            VehicleRent,
            Fuel,
            Driver,
            ParkingFee,
            TollTax,
            TollFee,
            Parking,
            Currency,
            Tip,
            From,  
            To,  
            Others
        } =<CreateCartDetails>req.body; 
        const uniId = uuidv4(); 
            const CartDetails = await db.insert(SupplierCarDetailsTable)
            .values({
                uid:uniId,
                uniqueId,
                SupplierId,
            VehicleType,
            VehicleBrand,
            ServiceType,
            VehicleModel,
            Doors,
            Seats, 
            Cargo,
            City,
            Country,
            Passengers,
            MediumBag,
            SmallBag, 
            TransferInfo, 
        
            HalfDayRide:HalfDayRide || 'no',
            FullDayRide:FullDayRide || 'no',
            HalfFullNightTime:HalfFullNightTime || 'no',
            HalfFullNightTimePrice:HalfFullNightTimePrice || 'no',
            VehicleRent,
            Fuel, 
            Driver,
            ParkingFee:ParkingFee || 'no',
            TollTax:TollTax || 'no',
            TollFee,
            Parking,
            Currency,
            Tip:Tip || 'no',
            From,  
            To,  
            Others
            })
            .returning(); 
            return res.status(200).json(CartDetails);
    }catch(error){
        next(error)
    }
}


export const GetAllCarDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Fetch data by joining all relevant tables and explicitly selecting fields
      const result = await db.select()
        .from(SupplierCarDetailsTable)
        .fullJoin(
          CreateExtraSpaces,
          eq(CreateExtraSpaces.uniqueId, SupplierCarDetailsTable.uniqueId)
        )                    
        .fullJoin(           
          CreateTransferCar, 
          eq(CreateTransferCar.uniqueId, SupplierCarDetailsTable.uniqueId)
        ); 
    
      // Ensure the data structure includes TransferCar in the same result 
    //   const formattedResult = result.map((row) => {
    //     const combined = {
    //       uniqueId: row.supplier?.uniqueId || row.transferCar?.uniqueId, // Keep the common uniqueId
    //       ...row.supplier, // Include all supplier fields
    //       ...row.transferCar, // Overwrite or merge with transferCar fields
    //       extraSpaces: row.extraSpaces || null, // Add extraSpaces as nested object
    //     };
    //     return combined;
    //   });
  
  
      // Return the formatted response
      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error("Error fetching car details:", error);
      return res.status(404).json({ message: "Data not found" });
    }
  };
  
  
export const GetCarDetails = async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const CarDetailsId = req.params.id;
         //jl
         const result= await db.select()
         .from(SupplierCarDetailsTable) 
         .where(eq(SupplierCarDetailsTable.SupplierId, CarDetailsId))
         .fullJoin( 
            CreateExtraSpaces,
            eq(CreateExtraSpaces.uniqueId, SupplierCarDetailsTable.uniqueId)
          )
        //   .fullJoin( 
        //     CreateTransferCar,
        //     eq(CreateTransferCar.uniqueId, SupplierCarDetailsTable.uniqueId) 
        //   );
         res.status(200).json(result) 
    }catch(error){
        res.status(404).json({message:'Data is not found'})
    }
}
 
export const GetTransferCarDetails = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const CarDetailsId = req.params.id;
        const result= await db.select()
        .from(CreateTransferCar)
        .where(eq(CreateTransferCar.uniqueId,CarDetailsId))
        res.status(200).json({message:"Get all Transfer Car Data",result})

    }catch(error){
        next(error)
    }
}

export const GetVehicleCarDetails= async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const CarDetailsId = req.params.id;
         const result = await db.select()
         .from(SupplierCarDetailsTable) 
         .where(eq(SupplierCarDetailsTable.uniqueId, CarDetailsId))
         .fullJoin( 
            CreateExtraSpaces,
            eq(CreateExtraSpaces.uniqueId, SupplierCarDetailsTable.uniqueId)
          )
          res.status(200).json({message:"Get All data of Vechicle Car Details",result})
    }catch(error){
        next(error)
    }
}

export const DeleteSingleCarDetails = async(req:Request,res:Response,next:NextFunction)=>{
    try{
          const CarDetailsId = req.params.id;
          await db
          .delete(CreateExtraSpaces)
          .where(eq(CreateExtraSpaces.uniqueId, CarDetailsId));
    
        await db
          .delete(CreateTransferCar) 
          .where(eq(CreateTransferCar.uniqueId, CarDetailsId));

          const result = await db.delete(SupplierCarDetailsTable)
          .where(eq(SupplierCarDetailsTable.uniqueId, CarDetailsId))

          res.status(200).json({message:"Car Details data is deleted Successfully"})
    }catch(error){
        res.status(404).json({message:'Car Details data is not deleted'})
    } 
}   
    
export const UpdatedSignleCarDetails = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const id = req.params.id; // Unique identifier for the car
    
        // Destructure request body into respective interfaces
        const {
        
          SupplierId,
          VehicleType,
          VehicleBrand,
          ServiceType,
          VehicleModel,
          Doors,
          Seats,
          Cargo,
          City,
          Country,
          Passengers,
          MediumBag,
          SmallBag,
          TransferInfo,
          HalfDayRide,
          FullDayRide,
          HalfFullNightTime,
          HalfFullNightTimePrice,
          VehicleRent,
          Fuel,
          Driver,
          ParkingFee,
          TollTax,
          TollFee,
          Parking,
          Currency,
          Tip,
          From,
          To,
          Others,
        } = <UpdateCreateCartDetails>req.body;
        const newUid = uuidv4(); 
        const updatedSupplierCarDetails = await db
        .update(SupplierCarDetailsTable)
        .set({
          uid: newUid, // Ensure this overwriting is intended
       
          SupplierId,
          VehicleType,
          VehicleBrand,
          ServiceType,
          VehicleModel,
          Doors,
          Seats,
          Cargo,
          City,
          Country,
          Passengers,
          MediumBag,
          SmallBag,
          TransferInfo,
          HalfDayRide: HalfDayRide || "no",
          FullDayRide: FullDayRide || "no",
          HalfFullNightTime: HalfFullNightTime || "no",
          HalfFullNightTimePrice: HalfFullNightTimePrice || "no",
          VehicleRent,
          Fuel,
          Driver,
          ParkingFee: ParkingFee || "no",
          TollTax: TollTax || "no",
          TollFee,
          Parking,
          Currency,
          Tip: Tip || "no",
          From,
          To,
          Others,
        })
        .where(eq(SupplierCarDetailsTable.uniqueId, id))
        .returning();
        res.status(200).json({message:"Car Details Updated Successfully",updatedSupplierCarDetails})
    }catch(error){
        next(error)
    }
}   
    
export const UpdateExtra=async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const id =req.params.id; 
        const { Roof_Rack, Trailer_Hitch, Extended_Cargo_Space } = <UpdateExtraSpace>req.body;
        const updatedExtraSpaces = await db
                .update(CreateExtraSpaces)
                .set({
                  Roof_Rack: Roof_Rack || false,
                  Trailer_Hitch: Trailer_Hitch || false,
                  Extended_Cargo_Space: Extended_Cargo_Space || false,
                })
                .where(eq(CreateExtraSpaces.uniqueId, id))
                .returning();
                res.status(200).json({message:"Update Extra Space Successfully",updatedExtraSpaces})
    }catch(error){
        next(error)
    }
} 
    
export const UpdateTransferCar = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{ 
    const id = req.params.id; 
        
    const { Transfer_from, Distance,Extra_Price,Location, Vice_versa, NightTime, NightTime_Price, Price } =
      <UpdateTransferCars>req.body; 
        const updatedTransferCar = await db
        .update(CreateTransferCar)
        .set({
          Transfer_from,
          Distance,
          Location,
          Vice_versa,
          Extra_Price,
          NightTime,
          NightTime_Price,
          Price,
        })
        .where(eq(CreateTransferCar.uniqueId, id))
        .returning();
        res.status(200).json({message:"Car Transfer Details is updated Successfully",updatedTransferCar})
    }catch(error){ 
        next(error) 
    }
}
//

export const CreateVehicleType=async(req:Request,res:Response,next:NextFunction)=>{
   try{
        const {VehicleType}=<VehicleType>req.body; 
        const NewVehicleType = await db.insert(VehicleTypeTable) 
        .values({VehicleType}) 
        .returning();
        return res.status(200).json(NewVehicleType)
   }catch(error){
    next(error)
   }
}


export const UpdateVehicleTypes=async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const {id} = req.params;
         const {
            VehicleType
         }=<UpdateVehicleType>req.body;
         const UpdateVehicleType=await db.update(VehicleTypeTable)
         .set({
            VehicleType
         })
         .where(eq(VehicleTypeTable.id,id))
         .returning();
         res.status(200).json({message:"VehicleType is updated Successfully",UpdateVehicleType})
    }catch(error){
        next(error)
    }
}

export const GetVehicleType = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: VehicleTypeTable.id,
            VehicleType: VehicleTypeTable.VehicleType,
        }).from(VehicleTypeTable);

        // Standardized response
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Error fetching vehicle types:", error);
        next(error); // Pass the error to the centralized error handler
    }
};

export const DeleteVehicleType = async(req:Request,res:Response,next:NextFunction)=>{
    try{
          const {id}=req.params;
          const result = await db.delete(VehicleTypeTable)
          .where(eq(VehicleTypeTable.id,id))
          .returning(); 
          if (!result) {
            return res.status(404).json({ message: "Vehicle Type not found" });
        }

        res.status(200).json({ message: "Vehicle Type deleted successfully", deleted: result });
    }catch(error){
        console.log("Error fetching vehicle types",error);
        next(error)
    }
}

export const CreateVehicleBrand = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{
        const {VehicleBrand, ServiceType}=<VehicleBrand>req.body;

        const NewVehicleBrand = await db.insert(VehicleBrandTable) 
        .values({VehicleBrand: VehicleBrand, ServiceType: ServiceType})
        .returning()
        return res.status(200).json(NewVehicleBrand); 
    }catch(error){
        next(error)
    }
}

export const UpdateVehicleBrands=async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const {id} = req.params;
         const {
            VehicleBrand,
            ServiceType
         }=<UpdateVehicleBrand>req.body;
         const UpdateVehicleBrand=await db.update(VehicleBrandTable)
         .set({
             VehicleBrand,
             ServiceType
         })
         .where(eq(VehicleBrandTable.id,id))
         .returning();
         res.status(200).json({message:"VehicleBrand is updated Successfully",UpdateVehicleBrand})
    }catch(error){
        next(error)
    }
}

export const GetVehicleBrand = async (req: Request, res: Response, next: NextFunction) => {
    try { 
      const result = await db
        .select({
          id: VehicleBrandTable.id, 
          VehicleBrand: VehicleBrandTable.VehicleBrand,
          ServiceType:VehicleBrandTable.ServiceType,
        })
        .from(VehicleBrandTable);
  
      return res.status(200).json(result); // Send the fetched data as a JSON response
    } catch (error) {
      console.error("Error fetching vehicle brands:", error); // Better error logging
      next(error); // Pass the error to the error-handling middleware
    }
  };

  export const DeleteVehicleBrand = async(req:Request,res:Response,next:NextFunction)=>{
    try{
          const {id}=req.params;
          const result = await db.delete(VehicleBrandTable)
          .where(eq(VehicleBrandTable.id,id))
          .returning(); 
          if (!result) {
            return res.status(404).json({ message: "Vehicle Brand not found" });
        }

        res.status(200).json({ message: "Vehicle Brand deleted successfully", deleted: result });
    }catch(error){
        console.log("Error fetching vehicle brand",error);
        next(error)
    }
}

export const CreateServiceType = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const {ServiceType}=<ServiceType>req.body;
        const NewServiceType = await db.insert(ServiceTypeTable)
        .values({ServiceType}) 
        .returning() 
        return res.status(200).json(NewServiceType) 
    }catch(error){
        next(error) 
    }
}   

export const UpdateServiceTypes=async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const {id} = req.params;
         const {
            ServiceType
         }=<UpdateServiceType>req.body;
         const UpdateServiceType=await db.update(ServiceTypeTable)
         .set({
            ServiceType
         })
         .where(eq(ServiceTypeTable.id,id))
         .returning();
         res.status(200).json({message:"ServiceType is updated Successfully",UpdateServiceType})
    }catch(error){
        next(error)
    }
}

export const GetServiceType=async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const result = await db.select({
            id:ServiceTypeTable.id,
            ServiceType:ServiceTypeTable.ServiceType 
         }) 
         .from(ServiceTypeTable)
         return res.status(200).send({
            message:'Get all data',
            data:result
         })
    }catch(error){
    next(error)
    }
}

export const DeleteServiceType = async(req:Request,res:Response,next:NextFunction)=>{
    try{
          const {id}=req.params;
          const result = await db.delete(ServiceTypeTable)
          .where(eq(ServiceTypeTable.id,id))
          .returning(); 
          if (!result) {
            return res.status(404).json({ message: "Vehicle Service not found" });
        }

        res.status(200).json({ message: "Vehicle Service deleted successfully", deleted: result });
    }catch(error){
        console.log("Error fetching vehicle service",error);
        next(error)
    }
}

export const CreateVehicleModel = async(req:Request,res:Response,next:NextFunction)=>{
    try{
          const { VehicleModel }=<VehicleModel>req.body;
          const NewVehicleModel= await db.insert(VehicleModelTable) 
          .values({VehicleModel}) 
          .returning() 
          return res.status(200).json(NewVehicleModel) 
    }catch(error){
        next(error)
    }
}

export const UpdateVehicleModels=async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const {id} = req.params;
         const {
            VehicleModel
         }=<UpdateVehicleModel>req.body;
         const UpdateVehicleModels=await db.update(VehicleModelTable)
         .set({
            VehicleModel
         })
         .where(eq(VehicleModelTable.id,id))
         .returning();
         res.status(200).json({message:"Vehicle Model is updated Successfully",UpdateVehicleModels})
    }catch(error){
        next(error)
    }
}

export const GetVehicleModel = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const result = await db.select({
            id:VehicleModelTable.id,
            VehicleModel:VehicleModelTable.VehicleModel
        }) 
        .from(VehicleModelTable) 
        return res.status(200).send({
            message:'Get all data of vehicle model',
            data:result
        })
    }catch(error){
        next(error)
    }
}

export const DeleteVehicleModel = async(req:Request,res:Response,next:NextFunction)=>{
    try{
          const {id}=req.params;
          const result = await db.delete(VehicleModelTable)
          .where(eq(VehicleModelTable.id,id))
          .returning(); 
          if (!result) {
            return res.status(404).json({ message: "Vehicle Model not found" });
        }

        res.status(200).json({ message: "Vehicle Model deleted successfully", deleted: result });
    }catch(error){
        console.log("Error fetching vehicle model",error);
        next(error)
    }
}


export const SurgeCharges=async(req:Request,res:Response,next:NextFunction)=>{ 
    try{
         const{
            uniqueId,
              VehicleName,
            From,
            To,
            SurgeChargePrice,
            supplier_id
         }= req.body;
 
         const result = await db.insert(SurgeChargeTable) 
         .values({
            vehicle_id: uniqueId,
            VehicleName,
            From,
            To,
            SurgeChargePrice,
            supplier_id
         })
         .returning();
         res.status(200).json(result);
    }catch(error){
        next(error)
    }
}

export const GetSurgeCharges = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const {id}=req.params;
        const result = await db.select()
        .from(SurgeChargeTable)
        .where(eq(SurgeChargeTable.supplier_id,id))
        return res.status(200).json(result);
    }catch(error){
        next(error)
    }
}

export const UpdateSurgeCharges = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const {id}=req.params;
        const { uniqueId, VehicleName, From, To, SurgeChargePrice, supplier_id } = req.body;
        const result = await db.update(SurgeChargeTable) 
        .set({
            vehicle_id:uniqueId,
            VehicleName,
            From,
            To,
            SurgeChargePrice,
            supplier_id
        })
        .where(eq(SurgeChargeTable.id,id))
        .returning();
        return res.status(200).json(result);
    }catch(error){
        next(error)
    }
}

export const DeleteSurgeCharges = async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const {id} = req.params;
         const result=await db.delete(SurgeChargeTable)
         .where(eq(SurgeChargeTable.id,id));
         return res.status(200).json({message:"Surge Charge is Deleted Successfully"});
    }catch(error){
        next(error)
    }
}

export const CreateVehicles = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{ 
         const {  
            SupplierId,
            VehicleType, 
            VehicleBrand,
            ServiceType,
            VehicleModel,
            Doors,
            Seats, 
            Cargo,
            Passengers,
            MediumBag,
            SmallBag, 
            ExtraSpace
        } =<CreateVehicle>req.body;
            const New_Vehicle = await db.insert(Create_Vehicles)
            .values({
                SupplierId,
            VehicleType,
            VehicleBrand,
            ServiceType,
            VehicleModel,
            Doors,
            Seats, 
            Cargo,
            Passengers,
            MediumBag,
            SmallBag,
           ExtraSpace: JSON.stringify(ExtraSpace),

            })
            .returning(); 
            return res.status(200).json(New_Vehicle);
    }catch(error){
        next(error)
    }
}
// Update Vehicle
export const UpdateVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        const updatedVehicle = await db.update(Create_Vehicles)
            .set({ ...updateData, ExtraSpace: JSON.stringify(updateData.ExtraSpace) })
            .where(eq(Create_Vehicles.id, id))
            .returning();

        return res.status(200).json(updatedVehicle);
    } catch (error) {
        next(error);
    }
};

// Delete Vehicle
export const DeleteVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        
        await db.delete(Create_Vehicles)
            .where(eq(Create_Vehicles.id, id));

        return res.status(200).json({ message: "Vehicle deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const GetVehiclebyId = async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const VehicleId = req.params.id;
         const result= await db.select()
         .from(Create_Vehicles)
         .where(eq(Create_Vehicles.SupplierId, VehicleId));
         res.status(200).json(result) 
    }catch(error){
        res.status(404).json({message:'Data is not found'})
    }
};

export const GetVehicleBySupplierId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        
        // Fetch vehicles where supplier_id matches
        const GetVehicleSupplier = await db.select()
            .from(Create_Vehicles)
            .where(eq(Create_Vehicles.SupplierId, id))
        res.status(200).json(GetVehicleSupplier);
    } catch (error) {
        console.error("Error fetching vehicles by supplier ID:", error);
        next(error);
    }
};

export const GetZoneBySupplierId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        
        // Fetch vehicles where supplier_id matches
        const GetZoneSupplier = await db.select()
            .from(zones)
            .where(eq(zones.supplier_id, id))
        res.status(200).json(GetZoneSupplier);
    } catch (error) {
        console.error("Error fetching Zone by supplier ID:", error);
        next(error);
    }
};

export const CreateZone=async(req:Request,res:Response,next:NextFunction)=>{
    try {
        const { name,supplier_id,address, latitude, longitude, radius_miles } = req.body;
        const center = turf.point([longitude, latitude]);
        const circle = turf.circle(center, radius_miles, { steps: 64, units: "miles" });
    
        const newZone = await db.insert(zones).values({
            name,
            supplier_id,
          latitude,
          longitude,
          radius_miles,
          address,
          geojson: circle,
         })
         .returning();
    
        res.status(201).json({ message: "Zone created successfully", zone: newZone });
      } catch (error) {
        res.status(500).json({ message: "Error creating zone", error });
      }
}

// Get Zone by ID
export const getZoneById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const zone = await db.select().from(zones).where(eq(zones.id, id));
        
        if (!zone) {
            return res.status(404).json({ message: "Zone not found" });
        }
        res.json(zone);
    } catch (error) {
        res.status(500).json({ message: "Error fetching zone", error });
    }
};

// Update Zone
export const updateZone = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, supplier_id, latitude, longitude,address, radius_miles } = req.body;
        const center = turf.point([longitude, latitude]);
        const circle = turf.circle(center, radius_miles, { steps: 64, units: "miles" });
        
        const updatedZone = await db.update(zones).set({
            name,
            supplier_id,
            latitude,
            longitude,
            radius_miles,
            address,
            geojson: circle,
        }).where(eq(zones.id, id)).returning();
        
        if (!updatedZone) {
            return res.status(404).json({ message: "Zone not found" });
        }
        res.json({ message: "Zone updated successfully", zone: updatedZone });
    } catch (error) {
        res.status(500).json({ message: "Error updating zone", error });
    }
};

// Delete Zone
export const deleteZone = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        const deletedZone = await db.delete(zones).where(eq(zones.id, id)).returning();
        
        if (!deletedZone) {
            return res.status(404).json({ message: "Zone not found" });
        }
        res.json({ message: "Zone deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting zone", error });
    }
};

export const createTransfer = async (req: Request, res: Response) => {
    try {
        const { rows } = req.body;

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ message: "Invalid input: Expected an array of transfers under 'rows'" });
        }

        const newTransfers = await db.insert(transfers_Vehicle).values(
            rows.map(({ uniqueId,supplier_id, SelectZone, Price, Extra_Price, Currency, TransferInfo,  NightTime,
                NightTime_Price,
                vehicleTax,
                vehicleTaxType,
                tollTax,
                parking,
                driverTips,
                driverCharge }) => ({
                vehicle_id: uniqueId,
                zone_id: SelectZone,
                price: Price,
                extra_price_per_mile: Extra_Price,
                Currency,
                Transfer_info: TransferInfo,
                NightTime,
                NightTime_Price,
                supplier_id,
                vehicleTax, 
                vehicleTaxType, 
                tollTax,
                parking,
                driverTips, 
                driverCharge
            }))
        ).returning();

        res.status(201).json({ message: "Transfers created successfully", transfers: newTransfers });
    } catch (error) {
        res.status(500).json({ message: "Error creating transfers", error });
    }
};


// Get Transfer by ID
export const getTransferById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const transfer = await db.select().from(transfers_Vehicle).where(eq(transfers_Vehicle.id, id));
        
        if (!transfer) {
            return res.status(404).json({ message: "Transfer not found" });
        }
        res.json(transfer);
    } catch (error) {
        res.status(500).json({ message: "Error fetching transfer", error });
    }
};

// Get Transfer by Supplier ID
export const getTransferBySupplierId = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const transfer = await db.select({
            id:transfers_Vehicle.id,
            supplier_id:transfers_Vehicle.supplier_id,
            vehicle_id:transfers_Vehicle.vehicle_id,
            zone_id:transfers_Vehicle.zone_id,
            price:transfers_Vehicle.price,
            extra_price_per_mile:transfers_Vehicle.extra_price_per_mile,
            Currency: transfers_Vehicle.Currency,
            Transfer_info:transfers_Vehicle.Transfer_info,
            NightTime:transfers_Vehicle.NightTime,
            NightTime_Price:transfers_Vehicle.NightTime_Price,
            vehicleTax: transfers_Vehicle.vehicleTax,
            vehicleTaxType: transfers_Vehicle.vehicleTaxType,
            tollTax:transfers_Vehicle.tollTax,
            parking:transfers_Vehicle.parking,
            driverTips: transfers_Vehicle.driverTips,
            driverCharge:transfers_Vehicle.driverCharge,
            Zone_name:zones.name,
            latitude: zones.latitude,
            longitude: zones.longitude,
            radius_miles: zones.radius_miles,
            VehicleType:Create_Vehicles.VehicleType,
            VehicleBrand:Create_Vehicles.VehicleBrand,
            ServiceType: Create_Vehicles.ServiceType,
            VehicleModel: Create_Vehicles.VehicleModel
            }).from(transfers_Vehicle).where(eq(transfers_Vehicle.supplier_id, id))
        .innerJoin(zones, eq(transfers_Vehicle.zone_id, zones.id))
        .innerJoin(Create_Vehicles,eq(transfers_Vehicle.vehicle_id,Create_Vehicles.id));
        
        if (!transfer) {
            return res.status(404).json({ message: "Transfers not found" });
        }
        res.json(transfer);
    } catch (error) {
        res.status(500).json({ message: "Error fetching transfer", error });
    }
};

// Update Transfer
export const updateTransfer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // This is the DB primary key (UUID)
        const updateData = req.body;

        // Map frontend field names to DB column names
        const fieldMapping: Record<string, string> = {
            SelectZone: "zone_id",
            Price: "price",
            Extra_Price: "extra_price_per_mile",
            Currency: "Currency",
            TransferInfo: "Transfer_info",
            NightTime: "NightTime",
            NightTime_Price: "NightTime_Price",
            uniqueId: "vehicle_id", // optional, only if you want to allow this to be updated
            vehicleTax: "vehicleTax",
            vehicleTaxType: "vehicleTaxType",
            parking: "parking",
            tollTax: "tollTax",
            driverCharge: "driverCharge",
            driverTips: "driverTips",
            supplier_id: "supplier_id",
        };

        // Transform frontend data into DB format
        const transformedData: Record<string, any> = {};
        for (const key in updateData) {
            const dbField = fieldMapping[key];
            if (dbField) {
                transformedData[dbField] = updateData[key];
            }
        }

        const updatedTransfer = await db
            .update(transfers_Vehicle)
            .set(transformedData)
            .where(eq(transfers_Vehicle.id, id)) // ✅ using primary key `id`
            .returning();

        if (!updatedTransfer || updatedTransfer.length === 0) {
            return res.status(404).json({ message: "Transfer not found" });
        }

        res.json({ message: "Transfer updated successfully", transfer: updatedTransfer });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ message: "Error updating transfer", error });
    }
};


// Delete Transfer
export const deleteTransfer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        const deletedTransfer = await db.delete(transfers_Vehicle).where(eq(transfers_Vehicle.id, id)).returning();
        
        if (!deletedTransfer) {
            return res.status(404).json({ message: "Transfer not found" });
        }
        res.json({ message: "Transfer deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting transfer", error });
    }
};
export const GetBookingBySupplierId = async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const { id } = req.params;
         const result = await db.select()
         .from(BookingTable)
         .where(eq(BookingTable.suplier_id,Number(id)))
         .fullJoin( 
            PaymentsTable ,
            eq(PaymentsTable.booking_id, BookingTable.id)
          )
         return res.status(200).json({result,message:"Booking fetched Successfully"})
    }catch(error){
        next(error)
    }
}

export const ChangeBookingStatusByBookingId = async (req: Request, res: Response) => { 
    try { 
      const Id = req.params.id; 
      const status = req.body.status; 
                                            
      if (!['pending', 'approved', 'rejected', 'refunded'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      } 
      
      const result = await db.update(BookingTable) 
        .set({ status: status }) 
        .where(eq(BookingTable.id, Id)); 
      
        const results = await db.select({
        id: BookingTable.id,
        status: BookingTable.status,
        agent_id: BookingTable.agent_id,
        email: AgentTable.Email
    })
    .from(BookingTable)
    .innerJoin(AgentTable,eq(AgentTable.id, BookingTable.agent_id))

         
        const transporter = nodemailer.createTransport({ 
            service: 'Gmail', // Replace with your email service provider 
            auth: { 
                        user: 'sanzadinternational5@gmail.com', // Email address from environment variable 
                        pass: 'betf euwp oliy tooq', // Email password from environment variable 
            }, 
        }); 
        
        // Define the email options
        const mailOptions = {
            from: 'sanzadinternational5@gmail.com',
            to: results[0].email,
            subject: 'Your status by sanzadinternational',
            text: `Your query is <strong> ${results[0].status}</strong> by the Sanzadinternational.`,
            html: `Your query is <strong> ${results[0].status}</strong> by the Sanzadinternational.`,
        };

        // Send the email
        await transporter.sendMail(mailOptions);
      return res.status(200).json({ message: 'Booking status updated successfully' });
    } catch (error) {
      console.error('Error updating payment status:', error);
      return res.status(404).json({ message: 'Internal server error' });
    }  
  };

  export const CreateDriver = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const { DriverName, DriverContact, DriverCarInfo, SupplierId } = req.body as DriversModel; 

        const result = await db.insert(DriversTable).values({
            DriverName, DriverContact, DriverCarInfo, SupplierId     
        })
        return res.status(200).json({result,message:'Driver Created Successfully'})
    }catch(error) 
    { 
        next(error); 
    } 
  } 

  export const GetDriver = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      const result = await db
        .select()
        .from(DriversTable)
        .where(eq(DriversTable.SupplierId, id)); 
  
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  export const DeleteDriver = async(req:Request,res:Response,next:NextFunction)=>{
   try{
    const {id} = req.params;
    const result = await db.delete(DriversTable)
    .where(eq(DriversTable.id,id));
     return res.status(200).json({message:"Driver Details Deleted Successfully"})
   }catch(error)
  {
    next(error)
  }
  }

  export const UpdateDriver = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const {id} = req.params;
        const { DriverName, DriverContact, DriverCarInfo, SupplierId } = req.body as DriversModel; 
        const result = await db.update(DriversTable).set({
            DriverName, DriverContact, DriverCarInfo, SupplierId 
        })
        .where(eq(DriversTable.id,id)); 
        return res.status(200).json({message:"Driver Details Updated Successfully"});
    }catch(error){
        next(error)
    }
  }

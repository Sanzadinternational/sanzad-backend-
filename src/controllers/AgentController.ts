import { Request, Response, NextFunction } from "express";
import { CreateAgentInput, CreateOtpInput, CreateOneWayTripInput, CreateRoundTripInput, UpdateOneWayTripInput } from "../dto"; 
import crypto from "crypto";
import { db } from "../db/db";
import { generateOTP, sendOTPEmail } from "../utils";
const { AgentTable,OneWayTripTable,RoundTripTable } = require('../db/schema/AgentSchema'); 
const { otpss } = require('../db/schema/OtpSchema'); 
const {Emailotps} = require('./EmailotpsController'); 
const bcrypt = require('bcrypt'); 
import { and, desc, eq } from "drizzle-orm";
const nodemailer = require("nodemailer"); 
// import jwt from 'jsonwebtoken'; 
const Crypto = require("crypto");
const jwt = require('jsonwebtoken'); 
import { registerTable } from "../db/schema/SupplierSchema";
var Mailgen = require('mailgen'); 
var randomstring = require("randomstring");
var passwordHash = require('password-hash');

export const CreateAgent = async(req: Request, res: Response, next: NextFunction) => { 
    try {
        const {
            Company_name,
            Address,
            Country,
            City,
            Zip_code,
            IATA_Code,
            Gst_Vat_Tax_number, 
            Contact_Person,
            Email,
          
            Password,
            Office_number,
            Mobile_number,
            Currency,
            
            Role,
            IsApproved
        } = req.body as CreateAgentInput; 
        const existingAgent = await db
        .select()
        .from(AgentTable)
        .where(eq(AgentTable.Email, Email))
        // .union(
        //     db.select().from(AgentTable).where(eq(AgentTable.Email, Email))
        // );

        const existingSupplier= await db.select().from(registerTable).where(eq(registerTable.Email, Email))
    
    if (existingAgent.length > 0 || existingSupplier.length>0) {
        // If email exists in either table, return a conflict response
        return res.status(400).json({
            success: false,
            message: "Email is already registered in the system." 
        });
    }
        // const id = uuidv4();
        const Gst_Tax_Certificate = (req as any).file ? (req as any).file.filename : null;
        // Hash the password before storing 
        const hashedPassword = await bcrypt.hash(Password, 10);  
        const Approval_status = {
            Pending: 0, // Default
            Approved: 1,
            Canceled: 2,
        };
        const newAgent = await db
            .insert(AgentTable) 
            .values({
                Company_name,
                Address,
                Country,
                City,
                Zip_code,
                IATA_Code,
                Gst_Vat_Tax_number, 
                Contact_Person,
                Email,
            
                Password:hashedPassword, // Save hashed password
                Office_number,
                Mobile_number,
                Currency,
                Gst_Tax_Certificate,
                Role: Role || "agent",
                IsApproved: IsApproved || Approval_status.Pending
            })
            .returning(); // Return the newly inserted agent

        res.status(201).json(newAgent);
        const result = await db.select({
            Email:AgentTable.Email
    })
    .from(AgentTable)
    .orderBy(desc(AgentTable.id))
    .limit(1);
        const transporter = nodemailer.createTransport({
            service: 'Gmail', // Replace with your email service provider
            auth: {
                user: 'jugalkishor556455@gmail.com', // Email address from environment variable
                pass: 'vhar uhhv gjfy dpes', // Email password from environment variable
            },
        });
      
        // Send an email with the retrieved data (decrypted password)
        const info = await transporter.sendMail({
            from: '"Sanzadinternational" <jugalkishor556455@gmail.com>', // Sender address
            to: `${result[0].Email}`,
            subject: "Query from Sanzadinternational", // Subject line
            text: `Details of New Agent Access:\nEmail: ${result[0].Email}`, // Plain text body
            html: `<p>Details of New Agent Access:</p><ul><li>Email: ${result[0].Email}</li></ul>`, // HTML body
        });
            
        console.log("Message sent: %s", info.messageId);
    
            return res.status(200).json({message:"New Agent is Created Successfully",result})
       
    } catch (error) {
        next(error);
    }
}
//

export const ForgetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Email } = req.body;

    // Validate email input
    if (!Email || typeof Email !== 'string') {
      return res.status(400).send({ success: false, message: "Valid email is required." });
    }

    // Check if the user exists based on the email
    const user = await db
      .select({ Email: AgentTable.Email })
      .from(AgentTable)
      .where(eq(AgentTable.Email, Email));

    if (user.length > 0) {
     // Generate a reset token
     const Token = randomstring.generate();
     const resetTokenExpiry = new Date(Date.now() + 3600000); // Token expires in 1 hour

     // Save the reset token and expiry in the database
     const GenerateToken = await db
            .update(AgentTable)  // Use the correct table reference
            .set({
                Token,
                resetTokenExpiry,
            })
            .where(eq(AgentTable.Email, Email))  // Use the `id` to target the specific row
            .returning();  //

            const transporter = nodemailer.createTransport({
                service: 'Gmail', // Replace with your email service provider
                auth: {
                    user: 'jugalkishor556455@gmail.com', // Email address from environment variable
                    pass: 'vhar uhhv gjfy dpes', // Email password from environment variable
                },
            });
            const resetLink = `http://localhost:8000/api/V1/agent/ResetPassword?token=${Token}`;
            // Send an email with the retrieved data (decrypted password)
            const info = await transporter.sendMail({
                from: '"Sanzadinternational" <jugalkishor556455@gmail.com>', // Sender address
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

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  const { Token, Email, Password } = req.body; // Extract fields from the request body

  try {
    // Step 1: Hash the new password
    const hashedPassword = await bcrypt.hash(Password, 10);  

    // Step 2: Verify that the user with the given Token and Email exists
    const user = await db
      .select({ id: AgentTable.id, Email: AgentTable.Email }) // Select necessary fields
      .from(AgentTable)
      .where(and(eq(AgentTable.Token, Token), eq(AgentTable.Email, Email)));

    if (user.length === 0) {
      return res.status(404).json({ error: "Invalid Token or Email" });
    }

    // Step 3: Update the user's password and reset the token
    const result = await db
      .update(AgentTable)
      .set({
        Password: hashedPassword,
        Token: "", // Clear the token
      })
      .where(eq(AgentTable.id, user[0].id)) // Use the unique `id` for the update
      .returning();

    // Step 4: Respond with success
    res.status(200).json({ message: "Password reset successful", result });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    next(error); // Pass the error to the next middleware
  }
};
//
export const GetAgent= async(req:Request,res:Response,next:NextFunction)=>
{
    try{
    
    const result = await db 
    .select({
        id:AgentTable.id,
        Company_name:AgentTable.Company_name,
        Address:AgentTable.Address,
        Country:AgentTable.Country,
        City:AgentTable.City,
        Zip_code:AgentTable.Zip_code,
        IATA_Code:AgentTable.IATA_Code,
        Gst_Vat_Tax_number:AgentTable.Gst_Vat_Tax_number,
        Contact_Person:AgentTable.Contact_Person,
        Email:AgentTable.Email,
        Password:AgentTable.Password,
        Office_number:AgentTable.Office_number,
        Mobile_number:AgentTable.Mobile_number,
        Currency:AgentTable.Currency,
        Gst_Tax_Certificate:AgentTable.Gst_Tax_Certificate
    })
    .from(AgentTable);
    return res.status(200).json(result);
    }catch(error)
    {
        next(error);
    }
}

//
// export const dashboard = async (req: Request, res: Response, next: NextFunction) => {
//     const userID = req.body.id;
//     const [user] = await db
//             .select({
//                 id:AgentTable.id,
//                 Company_name:AgentTable.Company_name,
//                 Address:AgentTable.Address,
//                 Country:AgentTable.Country,
//                 City:AgentTable.City,
//                 Zip_code:AgentTable.Zip_code,
//                 IATA_Code:AgentTable.IATA_Code,
//                 Gst_Vat_Tax_number:AgentTable.Gst_Vat_Tax_number,
//                 Contact_Person:AgentTable.Contact_Person,
//                 Email:AgentTable.Email,
//                 Password:AgentTable.Password,
//                 Office_number:AgentTable.Office_number,
//                 Mobile_number:AgentTable.Mobile_number,
//                 Currency:AgentTable.Currency,
//                 Gst_Tax_Certificate:AgentTable.Gst_Tax_Certificate
//             })
//             .from(AgentTable)
//             .where(eq(AgentTable.id, userID)); 
//             res.status(200).send({
//                 success: true,
//                 message: "Access granted to protected resource",
        
//                 userId: userID,
//                 user_information: {
//                     companyName: user.Company_name,
//                 },
//                 role: "agent",
//       });
// };

const JWT_SECRET = process.env.JWT_SECRET || 'Sanzad'; 

export const loginAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { Email, Password } = req.body; 

        // Fetch the agent by email
        const [user] = await db
            .select({
                Id:AgentTable.id, 
                Email: AgentTable.Email, 
                Password: AgentTable.Password ,
                Company_name:AgentTable.Company_name,
                Address:AgentTable.Address,
                Country:AgentTable.Country,
                City:AgentTable.City,
                Zip_code:AgentTable.Zip_code,
                IATA_Code:AgentTable.IATA_Code,
                Gst_Vat_Tax_number:AgentTable.Gst_Vat_Tax_number,
                Contact_Person:AgentTable.Contact_Person,
                Otp:AgentTable.Otp,
                Office_number:AgentTable.Office_number,
                Mobile_number:AgentTable.Mobile_number,
                Currency:AgentTable.Currency,
                Gst_Tax_Certificate:AgentTable.Gst_Tax_Certificate
            })
            .from(AgentTable)
            .where(eq(AgentTable.Email, Email)); 

        // Check if the agent was found
        if (!user) {
            return res.status(404).json({ message: "Agent not found" });
        }

        // Compare the provided password with the hashed password in the database
        const isPasswordValid = await bcrypt.compare(Password, user.Password); // 'password' (lowercase)

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate a JWT token
        const accessToken = jwt.sign(
            {  email: user.Email }, // Use 'agent.email' (lowercase)
            JWT_SECRET,
            { expiresIn: '1h' }  // Token valid for 1 hour
        );

        // Return a successful response with the token
        return res.status(200).json({
            message: 'Login Successfully',
            accessToken,
            user, 
        });

    } catch (error) {
        next(error); // Pass error to global error handler
    }
};
//

export const GetBill=async(req:Request,res:Response,next:NextFunction)=>{

    const {userEmail}=req.body;
    let config = {
        service:'gmail',
        auth:{
            user:'jugalkishor556455@gmail.com',
            pass:'vhar uhhv gjfy dpes'
        }
    }
    
    let transporter = nodemailer.createTransport(config);

    let MailGenerator = new Mailgen({
        theme:"default",
        product:{
            name:"Mailgen",
            link:"https://mailgen.js/"
        }
    })

    let response = {
        body:{
            name:"Daily Tution",
            intro:"Your bill has arrived",
            table:{
                data:[
                    {
                    item:"Nodemailer Stack Book", 
                    description:"A Backend Application", 
                    price:"$10.99", 
                    email:Emailotps.email,
                    verificationCode:Emailotps.verificationCode,
                    }
                ]
            },
            outro:"Looking forward to do more business"
        }
    }

    let mail = MailGenerator.generate(response)

    let message={
        from:"jugalkishor556455@gmail.com",
        to:userEmail,
        subject:"Place order",
        html:mail
    }

    transporter.sendMail(message).then(()=>{
        return res.status(201).json({
            msg:"you should receive an email"
        })
    })
    res.status(201).json("getBill Successfully"); 
};

export const OneWayTrip= async(req:Request,res:Response,next:NextFunction)=>{
    try {
        const {
            pick_up_location,
            drop_off_location,
            date,
            passengers, 
        } = req.body as CreateOneWayTripInput;

        const newAgent = await db
            .insert(OneWayTripTable)
            .values({
                pick_up_location,
                drop_off_location, 
                date,
                passengers,
            })
            .returning(); // Return the newly inserted agent

        return res.status(201).json(newAgent); 
    } catch (error) {
        next(error);
    }
} 

//
export const UpdateOneWayTrip = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params; 
        const {
              // Assuming the `id` of the trip is passed to identify which record to update
            pick_up_location,
            drop_off_location, 
            date,
            passengers,
        } = req.body as UpdateOneWayTripInput;

        const updatedTrip = await db
            .update(OneWayTripTable)  // Use the correct table reference
            .set({
                pick_up_location,
                drop_off_location,
                date,
                passengers,
            })
            .where(eq(OneWayTripTable.id, id))  // Use the `id` to target the specific row
            .returning();  // Return the updated row

        // if (updatedTrip.length === 0) {
        //     return res.status(404).json({ message: "Trip not found" });
        // }

        return res.status(200).json(updatedTrip);  // Return the updated trip details
    } catch (error) {
        next(error);  // Pass errors to error-handling middleware
    }
};

export const GetOneWayTrip = async(req:Request,res:Response,next:NextFunction)=>{
    try{
           const result = await db.select({
                id:OneWayTripTable.id,
                pick_up_location:OneWayTripTable.pick_up_location,
                drop_off_location:OneWayTripTable.drop_off_location,
                date:OneWayTripTable.date,
                passengers:OneWayTripTable.passengers,
           }).from(OneWayTripTable);
           return res.status(201).json(result);
    }catch(error){
        return res.status(404).json("error")
    }
}

export const RoundTrip = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{
        const {
            pick_up_location, 
            drop_off_location,
            date,
            return_date,
            passengers,
        } = req.body as CreateRoundTripInput;
        const newAgent = await db
        .insert(RoundTripTable)
        .values({
            pick_up_location,
            drop_off_location,
            date,
            return_date, 
            passengers,
        })
        .returning();
        return res.status(201).json(newAgent);
    }catch(error){
        next(error);
    } 
}

export const GetRoundTrip= async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const result = await db.select({
            pick_up_location:RoundTripTable.pick_up_location, 
            drop_off_location:RoundTripTable.drop_off_location,
            date:RoundTripTable.date,
            return_date:RoundTripTable.return_date,
            passengers:RoundTripTable.passengers,
        }).from(RoundTripTable);
        return res.status(201).json(result)
    }catch(error)
    {
        return res.status(404).json(error)
    };
}

export const sendOtp= async(req:Request,res:Response,next:NextFunction)=>{
    const { email } = req.body;
    const existingAgent = await db
    .select()
    .from(AgentTable)
    .where(eq(AgentTable.Email, email))
    // .union(
    //     db.select().from(AgentTable).where(eq(AgentTable.Email, Email))
    // );

    const existingSupplier= await db.select().from(registerTable).where(eq(registerTable.Email, email))

if (existingAgent.length > 0 || existingSupplier.length>0) {
    // If email exists in either table, return a conflict response
    return res.status(406).json({
        success: false,
        message: "Email is already registered in the system." 
    });
}else{
    const otp = generateOTP();
    const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes
  
    // Save OTP and expiry time in the `otps` table
    await db.insert(otpss).values({ email, otp, otpExpiry: expiryTime });
    await sendOTPEmail(email, otp);
  
    res.status(200).json({ message: 'OTP sent successfully' });
}
}
//
export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
    const { email, otp } = req.body;

    try {
        // Retrieve the most recent OTP record for the provided email
        const otpRecord = await db
            .select()
            .from(otpss)
            .where(eq(otpss.email, email))
            .orderBy(desc(otpss.otpExpiry))
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

function equals(Email: any): any {
    throw new Error("Function not implemented.");
}
export const QuickEmail = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const {subject, message, recipient}= req.body;
          const results = await db.select({
            Email:AgentTable.Email
          })
          .from(AgentTable) 
          .orderBy(desc(AgentTable.id)) // Order by ID in descending order 
          .limit(1); // Get only the last inserted record
          const transporter = nodemailer.createTransport({
            service: 'Gmail', // Replace with your email service provider
            auth: {
                user: 'jugalkishor556455@gmail.com', // Email address from environment variable
                pass: 'vhar uhhv gjfy dpes', // Email password from environment variable
            },
        });
      
        // Send an email with the retrieved data (decrypted password)
        const info = await transporter.sendMail({
            from: '"Sanzadinternational" <jugalkishor556455@gmail.com>', // Sender address
            to: recipient,
            subject: "Query from Sanzadinternational", // Subject line
            text: `${subject}`, // Plain text body
            html: `${message}`, // HTML body
        });
            
        console.log("Message sent: %s", info.messageId);
          return res.status(200).json(results); 
    }catch(error){
      next(error)
    }
}

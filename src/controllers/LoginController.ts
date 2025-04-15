import { Request, Response, NextFunction } from "express"; 
import { and,desc, eq } from "drizzle-orm"; 
import { registerTable } from '../db/schema/SupplierSchema'; 
const bcrypt = require('bcrypt'); 
import jwt from 'jsonwebtoken'; 
import { AgentTable } from "../db/schema/AgentSchema"; 
import { db } from "../db/db"; 
const crypto = require('crypto');
import { AdminTable } from "../db/schema/adminSchema"; 
const nodemailer = require('nodemailer');
var randomstring = require("randomstring");
const JWT_SECRET = process.env.JWT_SECRET || 'Sanzad'; 

// Function to handle authentication for both suppliers and agents
const authenticateUser = async (email: string, password: string, userTable: any) => {
  const [user] = await db
    .select({
      Id: userTable.id, 
      Email: userTable.Email, 
      Password: userTable.Password, 
      role: userTable.Role,
      IsApproved: userTable.IsApproved,

    }) 
    .from(userTable) 
    .where(eq(userTable.Email, email)); 

  if (!user) return null;

  if (user.IsApproved === 0) {
    return { error: 'Account is not activated' };
  }
  // Password validation
  const isPasswordValid = await bcrypt.compare(password, user.Password);
  if (!isPasswordValid) return null;

  const accessToken = jwt.sign({ id: user.Id, email: user.Email, role: user.role }, JWT_SECRET, { expiresIn: '30m' });
  return { accessToken, user };
};

export const FindUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Email, Password } = req.body;

    // First try for supplier
    let result = await authenticateUser(Email, Password, registerTable);
    if (result) {
      if (result.error) {
        return res.status(403).json({ message: result.error });
      }
      return res.status(200).json({
        message: 'Login Successfully',
        accessToken: result.accessToken,
        role: 'supplier', 
      }); 
    } 
          
    // Then try for agent if supplier didn't match 
    result = await authenticateUser(Email, Password, AgentTable); 
    if (result) { 
      if (result.error) {
        return res.status(403).json({ message: result.error });
      }
      return res.status(200).json({ 
        message: 'Login Successfully', 
        accessToken: result.accessToken, 
        role: 'agent', 
      }); 
    } 


    let AdminResult = await authenticateUser(Email,Password,AdminTable ); 
    if(AdminResult){ 
      if (AdminResult.error) {
        return res.status(403).json({ message: AdminResult.error });
      }
      return res.status(200).json({ 
        message:'Login Successfully', 
        accessToken: AdminResult.accessToken, 
        role:'admin', 
    }) 
  } 

    return res.status(401).json({ message: 'Invalid credentials' }); 
  }

  catch (error) { 
    next(error); // Pass error to global error handler 
  }
};

export const dashboard = async (req: Request, res: Response, next: NextFunction) => { 
  const userID = req.body.id;
  const userRole = req.body.role;
  
  if(userRole == 'supplier'){
  const [user] = await db
          .select({
              id:registerTable.id,
              Company_name:registerTable.Company_name,
              Owner:registerTable.Owner,
              Address:registerTable.Address,
              Country:registerTable.Country, 
              City:registerTable.City,
              Zip_code:registerTable.Zip_code,
              Office_number:registerTable.Office_number,
              Email:registerTable.Email,
              Contact_Person:registerTable.Contact_Person,
              Mobile_number:registerTable.Mobile_number,
              Gst_Vat_Tax_number:registerTable.Gst_Vat_Tax_number, 
              PAN_number:registerTable.PAN_number, 
              Currency:registerTable.Currency,
              Gst_Tax_Certificate:registerTable.Gst_Tax_Certificate,
              Role:registerTable.Role,
              profileImage: registerTable.profileImage,
              // Api_key:registerTable.Api_key,
              // Is_up:registerTable.Is_up
          })
          .from(registerTable)
          .where(eq(registerTable.id, userID)); 
  res.status(200).send({
      success: true,
      message: "Access granted to protected resource",

      // userId: userID,
      // user_information: {
      //     companyName: user.Company_name,
      // },
      // role: "supplier",

      userId: req.body.id,
      Company_name: user.Company_name,
      Owner: user.Owner,
      profileImage: user.profileImage,
      Address:user.Address,
      Country:user.Country,
      City:user.City,
      Zip_code:user.Zip_code,
      Office_number:user.Office_number,
      Email:user.Email,
      Contact_Person:user.Contact_Person,
      Mobile_number:user.Mobile_number,
      Gst_Vat_Tax_number:user.Gst_Vat_Tax_number,
      PAN_number:user.PAN_number,
      Currency:user.Currency,
      Gst_Tax_Certificate:user.Gst_Tax_Certificate,
      role: user.Role,
    });
  }
  else if(userRole == 'agent'){
    const [user] = await db
            .select({
                Id:AgentTable.id, 
                Email: AgentTable.Email, 
                Company_name:AgentTable.Company_name,
                Address:AgentTable.Address,
                Country:AgentTable.Country,
                City:AgentTable.City,
                Zip_code:AgentTable.Zip_code,
                IATA_Code:AgentTable.IATA_Code,
                Gst_Vat_Tax_number:AgentTable.Gst_Vat_Tax_number,
                Contact_Person:AgentTable.Contact_Person,
                Office_number:AgentTable.Office_number,
                Mobile_number:AgentTable.Mobile_number,
                Currency:AgentTable.Currency,
                Role: AgentTable.Role,
                profile: AgentTable.profileImage,
                Gst_Tax_Certificate:AgentTable.Gst_Tax_Certificate
            })
            .from(AgentTable)
            .where(eq(AgentTable.id, userID)); 
  
            res.status(200).send({
              success: true,
              message: "Access granted to protected resource",
              userId: req.body.id,
              Email:user.Email,
              Address:user.Address,
              Country:user.Country,
              City:user.City,
              Zip_code:user.Zip_code,
              IATA_Code:user.IATA_Code,
              Company_name:user.Company_name,
              Gst_Vat_Tax_number:user.Gst_Vat_Tax_number,
              Office_number:user.Office_number,
              Mobile_number:user.Mobile_number,
              Currency:user.Currency,
              Contact_Person:user.Contact_Person,
              role: user.Role, 
              profileImage:user.profile,
              Gst_Tax_Certificate:user.Gst_Tax_Certificate
            }); 
  }
  else if(userRole == 'admin' || userRole == 'superadmin'){
    const [user] = await db.select({ 
      Id:AdminTable.id, 
      Email:AdminTable.Email, 
      Company_name:AdminTable.Company_name,
      Role:AdminTable.Role,
      AgentAcount: AdminTable.Agent_account,
      AgentOpration: AdminTable.Agent_operation,
      SupplierAccount: AdminTable.Supplier_account,
      SupplierOPration: AdminTable.Supplier_operation,
      profile:AdminTable.profileImage,
    })
    .from(AdminTable)
    .where(eq(AdminTable.id,userID)) 
   
   res.status(200).send({ 
    success: true, 
    message: "Access granted to protected resource", 
    userId: req.body.id, 
    Email: user.Email, 
    Company_name:user.Company_name,
    role: user.Role,
    AgentAccount: user.AgentAcount,
    AgentOperation: user.AgentOpration,
    SupplierAccount: user.SupplierAccount,
    SupplierOpration: user.SupplierOPration,
    profileImage:user.profile
  }); 
     
  } 
}; 
export const ForgetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Email } = req.body;

    // Validate email input
    if (!Email || typeof Email !== 'string') {
      return res.status(400).send({ success: false, message: "Valid email is required." });
    }

    // Check if the user exists based on the email 
    const suppliers = await db.select()
    .from(registerTable)
    .where(and(eq(registerTable.Email,Email),eq(registerTable.Role,'supplier')));

    const user = await db
      .select()
      .from(AgentTable)
      .where(and(eq(AgentTable.Email, Email),eq(AgentTable.Role,'agent')));

    const admin = await db.select()
        .from(AdminTable)
        .where(and(eq(AdminTable.Email,Email),eq(AdminTable.Role,'admin')))

    const superadmin = await db.select()
        .from(AdminTable)
        .where(and(eq(AdminTable.Email,Email),eq(AdminTable.Role,'superadmin')))
    
    if (user.length > 0 || suppliers.length > 0 || admin.length > 0 || superadmin.length > 0) {
     // Generate a reset token
    
     const Token = randomstring.generate();
     const ResetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // Token expires in 1 hour as a string

     // Save the reset token and expiry in the database
     const GenerateSupplierToken = await db
     .update(registerTable)  // Use the correct table reference
     .set({
         Token,
         ResetTokenExpiry,
     })
     .where(and(eq(registerTable.Email, Email),eq(registerTable.Role,'supplier')))  // Use the `id` to target the specific row
     .returning();  //
    
     const GenerateToken = await db
            .update(AgentTable)  // Use the correct table reference
            .set({
                Token,
                ResetTokenExpiry,
            })
            .where(and(eq(AgentTable.Email, Email),eq(AgentTable.Role,"agent")))  // Use the `id` to target the specific row
            .returning();  //

     const GenerateAdminToken = await db
            .update(AdminTable)  // Use the correct table reference
            .set({
                Token,
                ResetTokenExpiry,
            })
            .where(and(eq(AdminTable.Email, Email),eq(AdminTable.Role,'admin')))  // Use the `id` to target the specific row
            .returning();  //

            const GenerateSuperAdminToken = await db
            .update(AdminTable)  // Use the correct table reference
            .set({
                Token,
                ResetTokenExpiry,
            })
            .where(and(eq(AdminTable.Email, Email),eq(AdminTable.Role,'superadmin')))  // Use the `id` to target the specific row
            .returning();  //
       

            // Check which table contains a valid email and assign it to recipientEmail
         
            const transporter = nodemailer.createTransport({
                service: 'Gmail', // Replace with your email service provider
                auth: {
                    user: 'jugalkishor556455@gmail.com', // Email address from environment variable
                    pass: 'vhar uhhv gjfy dpes', // Email password from environment variable
                },
            });
            const resetLink = `http://localhost:3000/forgot-password?token=${Token}&Email=${Email}`;
            // Send an email with the retrieved data (decrypted password)
            const info = await transporter.sendMail({
                from: '"Sanzadinternational" <jugalkishor556455@gmail.com>', // Sender address
                to: `${suppliers[0]?.Email} || ${user[0]?.Email} || ${admin[0]?.Email} || ${superadmin[0]?.Email}`,
                subject: "Query from Sanzadinternational", // Subject line
                text: `Details of New Agent Access:\nEmail: ${suppliers[0]?.Email}`, // Plain text body
                html: `Please click below link then reset your password
                <br>Link: <a href="${resetLink}">${resetLink}</a>`, // HTML body,
            });
    
            console.log("Message sent: %s", info.messageId);
     // Ideally, you'd send this token via email. For now, we return it in the response.
     res.status(200).send({
       success: true,
       message: "Password reset token generated successfully.",
       GenerateToken: GenerateToken, // In a production app, don't send the token in the response, use email
       GenerateSupplierToken:GenerateSupplierToken,
       GenerateAdminToken:GenerateAdminToken,
       GenerateSuperAdminToken:GenerateSuperAdminToken
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

export const ResetPassword = async (req: Request, res: Response, next: NextFunction) => {
  const { Token, Email, Password } = req.body; // Extract fields from the request body

  try {
    // Step 1: Hash the new password
    if(!Token){
//
      res.status(404).json({message:"Token is not found"})
    }else{
const hashedPassword = await bcrypt.hash(Password, 10);  

    // Step 2: Verify that the user with the given Token and Email exists
    const user = await db
      .select({ id: AgentTable.id, Email: AgentTable.Email,Token:AgentTable.Token }) // Select necessary fields
      .from(AgentTable)
      .where(and(eq(AgentTable.Token, Token), eq(AgentTable.Email, Email),eq(AgentTable.Role,'agent')));

    const suppliers = await db
      .select({ id: registerTable.id, Email: registerTable.Email, Token:registerTable.Token }) // Select necessary fields
      .from(registerTable)
      .where(and(eq(registerTable.Token, Token), eq(registerTable.Email, Email),eq(registerTable.Role,'supplier')));

    const admin = await db
      .select({ id: AdminTable.id, Email: AdminTable.Email, Token:AdminTable.Token }) // Select necessary fields
      .from(AdminTable)
      .where(and(eq(AdminTable.Token, Token), eq(AdminTable.Email, Email),eq(AdminTable.Role,'admin')));

    const superadmin = await db
      .select({ id: AdminTable.id, Email: AdminTable.Email,Token:AdminTable.Token }) // Select necessary fields
      .from(AdminTable)
      .where(and(eq(AdminTable.Token, Token), eq(AdminTable.Email, Email),eq(AdminTable.Role,'superadmin')));

      if (!suppliers || !user || !admin || !superadmin) {
        return res.status(400).json({ message: "Suppliers or user is missing" });
      }
//
    // Step 3: Update the user's password and reset the token
    const result = await db
      .update(AgentTable)
      .set({
        Password: hashedPassword,
        Token: "", // Clear the token
        ResetTokenExpiry:""
      })
      .where(and(eq(AgentTable.Token,Token),eq(AgentTable.Email,Email),eq(AgentTable.Role,'agent'))) // Use the unique `id` for the update
      .returning();

      const supplierresult = await db
      .update(registerTable)
      .set({
        Password: hashedPassword,
        Token: "", // Clear the token
        ResetTokenExpiry:""
      })

      .where(and(eq(registerTable.Token,Token),eq(registerTable.Email,Email),eq(registerTable.Role,'supplier'))) // Use the unique `id` for the update
      .returning();
      const adminresult = await db
      .update(AdminTable)
      .set({
        Password: hashedPassword,
        Token: "", // Clear the token
        ResetTokenExpiry:""
      })
      .where(and(eq(AdminTable.Token,Token),eq(AdminTable.Email,Email),eq(AdminTable.Role,'admin'))) // Use the unique `id` for the update
      .returning();
      const superadminresult = await db
      .update(AdminTable)
      .set({
        Password: hashedPassword,
        Token: "", // Clear the token
        ResetTokenExpiry:""
      })
      .where(and(eq(AdminTable.Token,Token),eq(AdminTable.Email,Email),eq(AdminTable.Role,'superadmin'))) // Use the unique `id` for the update
      .returning();

      res.status(200).json({ message: "Password reset successfully",result,supplierresult,adminresult,superadminresult });
    }
   
    //
 } catch (error) {
    console.error("Error in resetPassword:", error);
    next(error); // Pass the error to the next middleware
  }
};

export const Verify_token = async(req:Request,res:Response,next:NextFunction)=>{
  try{
       const {Token,Email}=req.body;
       if(!Token || !Email){
        res.status(404).json({message:"Token is not verify"})
       }else{
     
        const agent=await db.select({Token:AgentTable.Token,Email:AgentTable.Email})
       .from(AgentTable)
       .where(and(eq(AgentTable.Token,Token),eq(AgentTable.Email,Email)))

       const supplier=await db.select({Token:registerTable.Token,Email:registerTable.Email})
       .from(registerTable)
       .where(and(eq(registerTable.Token,Token),eq(registerTable.Email,Email)))

       const admin=await db.select({Token:AdminTable.Token,Email:AdminTable.Email})
       .from(AdminTable)
       .where(and(eq(AdminTable.Token,Token),eq(AdminTable.Email,Email)))

       const superadmin=await db.select({Token:AdminTable.Token,Email:AdminTable.Email})
       .from(AdminTable)
       .where(and(eq(AdminTable.Token,Token),eq(AdminTable.Email,Email)))

       res.status(200).json({message:"Token is verify",agent,supplier,admin,superadmin})
       }
  }catch(error){
    next(error)
  }
}

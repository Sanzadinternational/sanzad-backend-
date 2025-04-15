import { Request, Response, NextFunction } from "express";
import { CreateAdmin,CreateMargin } from "../dto/Admin.dto";
import { AdminTable,MarginTable } from "../db/schema/adminSchema";
import { db } from "../db/db";
import { and,desc, eq } from "drizzle-orm";
const { AgentTable,OneWayTripTable,RoundTripTable } = require('../db/schema/AgentSchema'); 
import { registerTable } from "../db/schema/SupplierSchema";
const bcrypt = require('bcrypt'); 
var randomstring = require("randomstring");
import nodemailer from "nodemailer";
import { Site_url } from "../config";


export const CreateAdmins = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { Email, Password,Agent_product,Supplier_product,Company_name,IsApproved, Agent_account,Agent_operation, Supplier_operation, Supplier_account } =<CreateAdmin>req.body;

        // Input validation
        if (!Email || !Password) {
            return res.status(400).json({ message: "Email and Password are required." });
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(Password, 10); 
        const Approval_status = {
            Pending: 0, // Default
            Approved: 1,
            Canceled: 2,
        };
        // Insert the new admin record 
        const result = await db
            .insert(AdminTable)
            .values({ 
                Email,
                Company_name,
                Password:hashedPassword,
                Agent_account:Agent_account ||false,
                Agent_operation:Agent_operation || false,
                Supplier_account:Supplier_account || false,
                Supplier_operation:Supplier_operation || false,
                Role:'admin',
                Agent_product:Agent_product || false,
                Supplier_product:Supplier_product || false,
           
                IsApproved:  IsApproved || Approval_status.Approved
            }) 
            .returning();

        res.status(200).json(result)

        const results = await db
           .select({
               Email: AdminTable.Email,
               Password: AdminTable.Password, // Assuming the password is encrypted
               // IV: AgentTable.IV, // IV used for encryption
           })
           .from(AdminTable)
           .orderBy(desc(AdminTable.id))
           .limit(1);
    // const transporter = nodemailer.createTransport({
    //     service: 'Gmail', // Replace with your email service provider
    //     auth: {
    //         user: 'jugalkishor556455@gmail.com', // Email address from environment variable
    //         pass: 'vhar uhhv gjfy dpes', // Email password from environment variable
    //     },
    // });
  
    // Send an email with the retrieved data (decrypted password)
//     const info = await transporter.sendMail({
//         from: '"Sanzadinternational" <jugalkishor556455@gmail.com>', // Sender address
//         to: `${results[0].Email}`,
//         subject: "Query from Sanzadinternational", // Subject line
//         text: `Details of New Admin Access:\nEmail: ${results[0].Email}`, // Plain text body
//         html: `<p>Details of New Admin Access:</p><ul><li>Email: ${results[0].Email}</li></ul>`, // HTML body
//     });
        
  

        return res.status(200).json({message:"New Admin is Created Successfully",results})
    } catch (error) {
      
        next(error); // Pass other errors to the error handler
    }
};

export const ForgetAdminPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { Email, Role } = req.body;
  
      // Validate email input
      if (!Email || typeof Email !== "string") {
        return res
          .status(400)
          .send({ success: false, message: "Valid email is required." });
      }
  
      // Check if the user exists based on the email and role
      const user = await db
        .select({ Email: AdminTable.Email })
        .from(AdminTable)
        .where(eq(AdminTable.Email, Email));
  
      if (user.length > 0) {
        // Generate a reset token
        const Token = randomstring.generate();
        const ResetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // Token expires in 1 hour as a string

  
        // Save the reset token and expiry in the database
        const updatedUser = await db
          .update(AdminTable) // Use the correct table reference
          .set({
            Token,
            ResetTokenExpiry,
            Role:'admin',
          })
          .where(and(eq(AdminTable.Email, Email), eq(AdminTable.Role, "admin")))
          .returning(); // Explicitly specify fields to return
  
        // Send email with the reset link
        const transporter = nodemailer.createTransport({
          service: "Gmail", // Replace with your email service provider
          auth: {
            user: "jugalkishor556455@gmail.com", // Email address
            pass: "vhar uhhv gjfy dpes", // Email password
          },
        });
        const resetLink = `http://localhost:8000/api/V1/admin/ResetAdminPassword?token=${Token}`;
        const info = await transporter.sendMail({
          from: '"Sanzadinternational" <jugalkishor556455@gmail.com>', // Sender address
          to: `${user[0].Email}`,
          subject: "Password Reset Request", // Subject line
          html: `Please click the link below to reset your password:<br><a href="${resetLink}">${resetLink}</a>`, // HTML body
        });
  
        console.log("Message sent: %s", info.messageId);
  
        // Send a success response
        return res.status(200).send({
          success: true,
          message: "Password reset token generated successfully.",
          updatedUser, // Do not include sensitive data in production
        });
      } else {
        // If the user does not exist
        return res.status(404).send({
          success: false,
          message: "User not found with the provided email.",
        });
      }
    } catch (error) {
      console.error("Error in ForgetAdminPassword API:", error);
      next(error); // Pass the error to the next middleware for handling
    }
  };
  
  
  export const ResetAdminPassword = async (req: Request, res: Response, next: NextFunction) => {
    const { Token, Email, Password } = req.body; // Extract fields from the request body
  
    try {
      // Step 1: Hash the new password
      const hashedPassword = await bcrypt.hash(Password, 10);  
  
      // Step 2: Verify that the user with the given Token and Email exists
      const user = await db
        .select({ id: AdminTable.id, Email: AdminTable.Email }) // Select necessary fields
        .from(AdminTable)
        .where(and(eq(AdminTable.Token, Token), eq(AdminTable.Email, Email)));
  
      if (user.length === 0) {
        return res.status(404).json({ error: "Invalid Token or Email" });
      }
  
      // Step 3: Update the user's password and reset the token
      const result = await db
        .update(AdminTable)
        .set({
          Password: hashedPassword,
          Token: "", // Clear the token
          ResetTokenExpiry:""
        })
        .where(eq(AdminTable.id, user[0].id)) // Use the unique `id` for the update
        .returning();
  
      // Step 4: Respond with success
      res.status(200).json({ message: "Password reset successful", result });
    } catch (error) {
      console.error("Error in resetPassword:", error);
      next(error); // Pass the error to the next middleware
    }
  };

export const AllAdminRecords = async (req: Request, res: Response, next: NextFunction) => { 
    try {
        const role = "admin"; // Hardcoded role value 
        const result = await db
            .select({
            id:AdminTable.id,
            Email:AdminTable.Email,
            Role:AdminTable.Role,
            Company_name:AdminTable.Company_name,
            Agent_account:AdminTable.Agent_account,
            Agent_operation:AdminTable.Agent_operation,
            Supplier_account:AdminTable.Supplier_account,
            Supplier_operation:AdminTable.Supplier_operation, 
            Agent_product:AdminTable.Agent_product, 
            Supplier_product:AdminTable.Supplier_product 
            })
            .from(AdminTable)
            .where(eq(AdminTable.Role, role)); // Assuming `AdminTable.role` is the correct column for roles 
        res.status(200).json(result);
    } catch (error) {
        next(error);
    } 
};

export const DestroyAdmin = async(req:Request,res:Response,next:NextFunction)=>{ 
    try{ 
        const {id}=req.params;
        const result = await db.delete(AdminTable) 
        .where(eq(AdminTable.Email,id))
        .returning()
        res.status(200).json({message:"Admin Deleted Successfully",result})
    }catch(error){ 
        next(error) 
    }
}

export const AllAgentRecords = async(req:Request,res:Response,next:NextFunction)=>{
    try{
         const result = await db.select({
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
          Office_number:AgentTable.Office_number,
          Mobile_number:AgentTable.Mobile_number,
          Currency:AgentTable.Currency,
          Gst_Tax_Certificate:AgentTable.Gst_Tax_Certificate,
          IsApproved:AgentTable.IsApproved
         })
         .from(AgentTable)
         return res.status(200).json(result)
    }catch(error){
        next(error)
    }
}

export const AgentSingleView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // Extract email from route parameters

    if (!id) {
      return res.status(400).json({ message: "Id parameter is required" });
    }

    const result = await db.select()
      .from(AgentTable)
      .where(eq(AgentTable.Email, id)); // Ensure AgentTable.Email exists

    if (result.length === 0) {
      return res.status(404).json({ message: "Agent not found" });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const SupplierSingleView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // Extract email from route parameters
  
    if (!id) {
      return res.status(400).json({ message: "Id parameter is required" });
    }
  
    const result = await db.select()
      .from(registerTable)
      .where(eq(registerTable.Email, id)); // Ensure AgentTable.Email exists

    if (result.length === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const ChangeAgentApprovalStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {id}= req.params; 
        const { isApproved } = req.body;

        // Update the IsApproved status
        const results = await db
            .update(AgentTable)
            .set({ IsApproved: isApproved })
            .where(eq(AgentTable.Email, id));

        if (results.rowCount === 0) {
            return res.status(404).json({ 
                error: 'Agent not found or no changes were made.' 
            });
        }
// Fetch the last inserted record
const result = await db
.select({
    Email: AgentTable.Email,
    Password: AgentTable.Password,
    CompanyName: AgentTable.Company_name, // Assuming the password is encrypted
    // IV: AgentTable.IV, // IV used for encryption
})
.from(AgentTable)
.orderBy(desc(AgentTable.id))
.limit(1);

if (result.length === 0) {
return res.status(404).json({ message: 'No records found' });
}

const transporter = nodemailer.createTransport({
service: 'Gmail', // Replace with your email service provider
auth: {
    user: 'jugalkishor556455@gmail.com', // Email address from environment variable
    pass: 'vhar uhhv gjfy dpes', // Email password from environment variable
},
});

const info = await transporter.sendMail({
  from: '"Sanzad International" <jugalkishor556455@gmail.com>', // Sender address
  to: `${result[0].Email}`, // Recipient email
  subject: "🎉 Congratulations! Your Account is Now Active", // Subject line
  html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
      <h2 style="color: #007bff;">Welcome to Sanzad International!</h2>
      <p>Dear <strong>${result[0].CompanyName}</strong>,</p>
      <p>We are excited to inform you that your account has been successfully activated. You can now log in and start using our services.</p>
      
      <p>To log in, click the button below:</p>
      <p style="text-align: center;">
        <a href="http://localhost:3000/login" style="background: #007bff; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
          Login Now
        </a>
      </p>

      <p>If you have any questions, feel free to contact our support team.</p>
      <p>Best regards,</p>
      <p><strong>Sanzad International Team</strong></p>
    </div>
  `,
});



console.log("Message sent: %s", info.messageId);

        return res.status(200).json({ 
            message: 'Agent approval status updated successfully.',
            result,
            results 
        });
    } catch (error) {
        console.error('Error updating agent approval status:', error);
        next(error); // Pass error to global error handler
    }
};



export const AllGetSuppliers = async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const result = await db.select({
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
           IsApproved:registerTable.IsApproved
        })
        .from(registerTable) 
        return res.status(200).json(result)
    }catch(error){
        next(error)
    }
}

export const ChangeSupplierApprovalStatus = async(req:Request,res:Response,next:NextFunction)=>{
    try{ 
        const {id}=req.params;
        const {IsApproved}=req.body;
        const results = await db.update(registerTable)
        .set({ IsApproved: IsApproved })
        .where(eq(registerTable.Email,id));
        const result = await db
        .select({
            Email: registerTable.Email,
            Password: registerTable.Password,
            CompanyName: registerTable.Company_name // Assuming the password is encrypted
            // IV: AgentTable.IV, // IV used for encryption
        })
        .from(registerTable)
        .orderBy(desc(registerTable.id))
        .limit(1);

    if (result.length === 0) {
        return res.status(404).json({ message: 'No records found' });
    }

    const transporter = nodemailer.createTransport({
        service: 'Gmail', // Replace with your email service provider
        auth: {
            user: 'jugalkishor556455@gmail.com', // Email address from environment variable
            pass: 'vhar uhhv gjfy dpes', 
            // Email password from environment variable
        },
    });
  
    const info = await transporter.sendMail({
      from: '"Sanzad International" <jugalkishor556455@gmail.com>', // Sender address
      to: `${result[0].Email}`, // Recipient email
      subject: "🎉 Congratulations! Your Account is Now Active", // Subject line
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
          <h2 style="color: #007bff;">Welcome to Sanzad International!</h2>
          <p>Dear <strong>${result[0].CompanyName}</strong>,</p>
          <p>We are excited to inform you that your account has been successfully activated. You can now log in and start using our services.</p>
          
          <p>To log in, click the button below:</p>
          <p style="text-align: center;">
            <a href="http://localhost:3000/login" style="background: #007bff; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
              Login Now
            </a>
          </p>
    
          <p>If you have any questions, feel free to contact our support team.</p>
          <p>Best regards,</p>
          <p><strong>Sanzad International Team</strong></p>
        </div>
      `,
    });

    console.log("Message sent: %s", info.messageId);

        res.status(200).json({message:"Supplier Status is updated Successfully",result,results})
    }catch(error){
        next(error)
    }
}

export const CreateMargindata = async (req: Request, res: Response, next: NextFunction) => { 
  try {
    const {
      Company_name,
      Currency,
      MarginPrice,
      supplier_id,
      Supplierregisterforeign
    } = req.body as CreateMargin;

    const result = await db.insert(MarginTable).values({
      Company_name,
      Currency,
      MarginPrice,
      supplier_id,
      Supplierregisterforeign
    });

    res.status(201).json({
      message: "Margin data created successfully",
      data: result
    });

  } catch (error) {
    next(error);
  }
};

export const GetMarginData = async(req:Request,res:Response,next:NextFunction)=>{
try{
  const data = await db.select()
  .from(MarginTable)
  return res.status(200).json({
    message: "Margin data fetched successfully",
      data: data
  })
}catch(error){
  next(error)
}
}

export const UpdateMarginData = async(req:Request,res:Response,next:NextFunction)=>{
  try{
    const { id } = req.params;
       const {
        Company_name,
        Currency,
        MarginPrice,
        supplier_id,
        Supplierregisterforeign
       }=<CreateMargin>req.body;

       const result = await db.update(MarginTable)
       .set({
        Company_name,
        Currency,
        MarginPrice,
        supplier_id,
        Supplierregisterforeign
       })
       .where(eq(MarginTable.id,Number(id)))
       .returning();
       return res.status(200).json({
        message:"Margin Data Updated Successfully",
        data:result
       })
  }catch(error){
    next(error)
  }
}
    
export const DeleteMarginData = async(req:Request,res:Response,next:NextFunction)=>{
  try{
       const {id}=req.params;
       const result = await db.delete(MarginTable)
       .where(eq(MarginTable.id,Number(id)))
       return res.status(200).json({
        message:"Margin Data Deleted Successfully",
        data:result
       })
  }catch(error){
    next(error)
  }
}
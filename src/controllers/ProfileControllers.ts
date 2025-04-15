import { Request, Response, NextFunction } from "express"; 
import { db } from "../db/db"; 
import { AgentTable } from "../db/schema/AgentSchema";
import { registerTable } from "../db/schema/SupplierSchema";
import { AdminTable } from "../db/schema/adminSchema"; 
import { AgentInput, SupplierInput, AdminInput } from "../dto/Profile.dto"; 
import { eq } from "drizzle-orm"; 

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => { 
    try { 
        const id = Number(req.params.id); // Convert ID to number 

        if (isNaN(id)) { 
            return res.status(400).json({ message: "Valid ID is required for updating profile" }); 
        } 
    
        let { role } = req.body; 
        if (!role) { 
            return res.status(400).json({ message: "Role is required" }); 
        } 

        role = role.toLowerCase(); // Normalize Role input 
        let updateResult; 
        if (role === "agent") {  
           
            const agentData = req.body as AgentInput; 
            updateResult = await db
                .update(AgentTable)
                .set({
                    Company_name: agentData.Company_name, 
                    Address: agentData.Address,
                    Country: agentData.Country,
                    City: agentData.City,
                    Zip_code: agentData.Zip_code,
                    IATA_Code: agentData.IATA_Code,
                    Gst_Vat_Tax_number: agentData.Gst_Vat_Tax_number, 
                    Contact_Person: agentData.Contact_Person,
                    Email: agentData.Email,
                    Office_number: agentData.Office_number,
                    Mobile_number: agentData.Mobile_number,
                    Currency: agentData.Currency,
                    Gst_Tax_Certificate: agentData.Gst_Tax_Certificate, 
                    Role:agentData.Role,
                    profileImage: agentData.profileImage
                })
                .where(eq(AgentTable.id, id))
                .returning(); 
              
        } 
        
        else if (role === "supplier") {
            const supplierData = req.body as SupplierInput;
            updateResult = await db
                .update(registerTable)
                .set({
                    Company_name: supplierData.Company_name, 
                    Owner: supplierData.Owner, 
                    Address: supplierData.Address, 
                    Country: supplierData.Country, 
                    City: supplierData.City,
                    Zip_code: supplierData.Zip_code,
                    Office_number: supplierData.Office_number,
                    Contact_Person: supplierData.Contact_Person,
                    Mobile_number: supplierData.Mobile_number,
                    Gst_Vat_Tax_number: supplierData.Gst_Vat_Tax_number, 
                    PAN_number: supplierData.PAN_number, 
                    Currency: supplierData.Currency,
                    Gst_Tax_Certificate: supplierData.Gst_Tax_Certificate,
                    profileImage:supplierData.profileImage
                })
                .where(eq(registerTable.id, id))
                .returning();
        } 
        
        else if (role === "admin") {
            const AdminData = req.body as AdminInput;
            updateResult = await db
                .update(AdminTable)
                .set({
                    Agent_account: AdminData.Agent_account, 
                    Agent_operation: AdminData.Agent_operation, 
                    Supplier_account: AdminData.Supplier_account, 
                    Supplier_operation: AdminData.Supplier_operation, 
                    Company_name: AdminData.Company_name,
                    profileImage:AdminData.profileImage
                })
                .where(eq(AdminTable.id, id))
                .returning();
        } 
        
        else {
            return res.status(400).json({ message: "Invalid Role provided" });
        }

        if (!updateResult || updateResult.length === 0) {
            return res.status(404).json({ message: "Profile not found or no changes made" });
        }

        res.status(200).json({ 
            message: "Profile updated successfully", 
            updateResult
        });

    } catch (error) {
        console.error("Error updating profile:", error);
        next(error);
    } 
}; 
   
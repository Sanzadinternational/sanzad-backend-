import express, {Request, Response, NextFunction, Router} from 'express'; 
import {AllGetSuppliers,UpdateMarginData,GetMarginData,DeleteMarginData,CreateMargindata,AllAgentRecords,SupplierSingleView,ResetAdminPassword,AgentSingleView,DestroyAdmin,ForgetAdminPassword,ChangeSupplierApprovalStatus,ChangeAgentApprovalStatus, AllAdminRecords,CreateAdmins } from "../controllers/AdminController";
import { AgentMail } from "../controllers/EmailotpsController"; 
import {SupplierMail} from "../controllers/EmailotpsController";
const router = express.Router(); 

router.post('/create',CreateAdmins); 
router.post('/ResetAdminPassword',ResetAdminPassword);
router.post('/ForgetAdminPassword',ForgetAdminPassword);
router.get('/AllAgentRecords',AllAgentRecords);
router.get('/AgentSingleView/:id',AgentSingleView);
router.get('/AllGetSuppliers',AllGetSuppliers); 
router.get('/AllAdminRecords',AllAdminRecords);
router.delete('/DestroyAdmin/:id',DestroyAdmin); 
router.put('/ChangeAgentApprovalStatus/:id',ChangeAgentApprovalStatus); 
router.put('/ChangeSupplierApprovalStatus/:id',ChangeSupplierApprovalStatus);
router.post('/ApprovedAgentMail',AgentMail); 
router.post('/ApprovedSupplierMail',SupplierMail);
router.get('/SupplierSingleView/:id',SupplierSingleView);
router.post('/CreateMargindata',CreateMargindata);
router.get('/GetMarginData',GetMarginData);
router.put('/UpdateMarginData/:id',UpdateMarginData);
router.delete('/DeleteMarginData/:id',DeleteMarginData);
export {router as AdminRoute };  


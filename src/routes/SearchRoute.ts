import { Supplier_price, TransportNode } from '../controllers/SupplierController';
import authMiddleware from '../middlewares/authMiddleware';
import express, {Request, Response, NextFunction, Router} from 'express'; 
import {  Search } from '../controllers/SearchController'; 

const router = express.Router(); 

// CreateSearchCar 
router.post('/search',Search); 
export {router as SearchRouter}; 

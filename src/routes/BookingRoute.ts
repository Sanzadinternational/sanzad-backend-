import express, {Request, Response, NextFunction, Router} from 'express';  
const { Booking } = require("../controllers/BookingController"); 
import authMiddleware from '../middlewares/authMiddleware'; 
const router = express.Router(); 
 
router.post('/Create', Booking); 

export {router as BookingRoute}; 


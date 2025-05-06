import express, {Request, Response, NextFunction, Router} from 'express'; 
import { PaymentIniciate, PaymentWithReferenceNo,ChangePaymentStatusByBookingId } from '../controllers/PaymentController';
import { PaymentStatusUpdate } from '../controllers/PaymentController';
const router = express.Router(); 

router.post('/payment-iniciate', PaymentIniciate); 
router.post('/payment-status-update', PaymentStatusUpdate);
router.post('/referencePayment', PaymentWithReferenceNo);
router.put('/ChangePaymentStatusByBookingId/:id', ChangePaymentStatusByBookingId);

export {router as PaymentRoute}; 

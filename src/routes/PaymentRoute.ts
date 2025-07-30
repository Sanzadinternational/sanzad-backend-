import express, {Request, Response, NextFunction, Router} from 'express'; 
import { PaymentInitiate, PaymentWithReferenceNo,ChangePaymentStatusByBookingId, downloadInvoice } from '../controllers/PaymentController';
import { PaymentStatusUpdate } from '../controllers/PaymentController';
const router = express.Router(); 

router.post('/payment-iniciate', PaymentInitiate); 
router.post('/payment-status-update', PaymentStatusUpdate);
router.post('/referencePayment', PaymentWithReferenceNo);
router.put('/ChangePaymentStatusByBookingId/:id', ChangePaymentStatusByBookingId);
router.get('/invoices/:id/download', downloadInvoice);
router.get('/Voucher/:id/download', downloadVoucher);
export {router as PaymentRoute}; 

import { Request, Response, NextFunction } from "express";
import { encrypt, decrypt } from "../utils/ccavenueUtils";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/db";// Ensure your Drizzle DB config is imported
import { PaymentsTable, BookingTable
 } from "../db/schema/BookingSchema";

export const PaymentIniciate = async (req: Request, res: Response, next: NextFunction) => {
  try {
  const { agent_id, vehicle_id, suplier_id, pickup_location, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_miles, price } = req.body;

        const merchantId = process.env.CCAVENUE_MERCHANT_ID!;
        const accessCode = process.env.CCAVENUE_ACCESS_CODE!;
        const workingKey = process.env.CCAVENUE_WORKING_KEY!;
        const redirectUrl = "https://sanzad.vercel.app/api/V1/payment/payment-status-update";
        const cancelUrl = "https://sanzad.vercel.app/cancle";
        const customerEmail = "abhinavgu34@gmail.com";
        const customerPhone = "8433169822";

            // Step 1: Save booking in `booking` table
    const [booking] = await db
    .insert(BookingTable)
    .values({
      agent_id: agent_id,
      vehicle_id: vehicle_id,
      suplier_id: suplier_id,
      pickup_location: pickup_location,
      drop_location: drop_location,
      pickup_lat: pickup_lat,
      pickup_lng: pickup_lng,
      drop_lat: drop_lat,
      drop_lng: drop_lng,
      distance_miles: distance_miles,
      price,
      status: 'pending',
    })
    .returning({ id: BookingTable.id });

  const bookingId = booking.id;

  // Step 2: Generate Order ID for CCAvenue
  const orderId = `BOOK${bookingId}${Date.now()}`;

        // Payment data
        const data = `merchant_id=${merchantId}&order_id=${orderId}&currency=INR&amount=${price}&redirect_url=${redirectUrl}&cancel_url=${cancelUrl}&billing_email=${customerEmail}&billing_tel=${customerPhone}&merchant_param1=${bookingId}`;

        const encryptedData = encrypt(data, workingKey);
  
        res.json({
          url: 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction',
          access_code: accessCode,
          encRequest: encryptedData
        });
      }
      catch (error) {
        console.error('Payment initiation failed:', error);
        res.status(500).json({ error: 'Failed to initiate payment' });
      }
};

export const PaymentStatusUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Payment Status Update');
    const encResp = req.body.encResp;
    console.log(encResp);
    const workingKey = process.env.CCAVENUE_WORKING_KEY!;
    
    const decryptedResponse = decrypt(encResp, workingKey);
    const responseData = new URLSearchParams(decryptedResponse);
    console.log(responseData);
    
    const orderId = responseData.get('order_id'); 
    const status = responseData.get('order_status'); // 'Success' | 'Failure' | 'Aborted'
    const amount = responseData.get('amount');
    const transactionId = responseData.get('tracking_id'); // Unique Transaction ID
    const paymentMode = responseData.get('payment_mode'); // Example: 'Net Banking', 'Credit Card'

    // Extract Booking ID from `merchant_param1`
    const bookingId = responseData.get('merchant_param1');
    if (!bookingId) {
      return res.status(400).json({ error: 'Invalid booking reference' });
    }

    let paymentStatus: 'successful' | 'failed' = 'failed';
    let bookingStatus: 'confirmed' | 'cancelled' = 'cancelled';

    if (status === 'Success') {
      paymentStatus = 'successful';
      bookingStatus = 'confirmed';
    }

    // Step 3: Save payment details in `payments` table
    await db.insert(PaymentsTable).values({
      booking_id: bookingId,
      payment_method: 'CCavenue',
      payment_status: paymentStatus,
      transaction_id: transactionId ? transactionId : null, // CCAvenue Transaction ID
      reference_number: null, // Not needed for CCAvenue
      amount: (parseFloat(amount || "0")).toFixed(2),
    });

    // // Step 4: Update booking status based on payment outcome
    // await db.update(BookingTable)
    //   .set({ status: bookingStatus })
    //   .where(sql`${BookingTable.id} = ${bookingId}`);

    return res.redirect(
      `${process.env.FRONTEND_URL}/payment-${paymentStatus}?orderId=${orderId}&transactionId=${transactionId}&amount=${amount}&paymentMode=${paymentMode}`
    );
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
  };

  
  export const PaymentWithReferenceNo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        agent_id,
        vehicle_id,
        suplier_id,
        pickup_location,
        drop_location,
        pickup_lat,
        pickup_lng,
        drop_lat,
        drop_lng,
        distance_miles,
        price,
        reference_number
      } = req.body;
  
      if (!agent_id || !vehicle_id || !suplier_id || !pickup_location || !drop_location || !price || !reference_number) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
  
      // Insert booking and get the generated ID
      const [booking] = await db.insert(BookingTable).values({
        agent_id,
        vehicle_id,
        suplier_id,
        pickup_location,
        drop_location,
        pickup_lat,
        pickup_lng,
        drop_lat,
        drop_lng,
        distance_miles,
        price,
        status: 'pending',
      }).returning({ id: BookingTable.id });
  
      if (!booking) {
        return res.status(500).json({ error: 'Failed to create booking' });
      }
  
      const bookingId = String(booking.id);
      const orderId = `BOOK${bookingId}${Date.now()}`;
  
      // Insert payment details
      await db.insert(PaymentsTable).values({
        booking_id: bookingId,
        payment_method: 'Reference',
        payment_status: 'pending',
        transaction_id: null, // CCAvenue Transaction ID
        reference_number: reference_number, // Not needed for CCAvenue
        amount: (parseFloat(price || "0")).toFixed(2),
      });
  
      return res.status(201).json({
        message: 'Payment info saved successfully',
        booking_id: bookingId,
        orderId: orderId
      });
  
    } catch (error) {
      console.error('Payment failed:', error);
      next(error);
    }
  };
  

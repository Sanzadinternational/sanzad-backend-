import { Request, Response, NextFunction } from "express";
import { encrypt, decrypt } from "../utils/ccavenueUtils";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { and,desc, eq } from "drizzle-orm";
import { db } from "../db/db";// Ensure your Drizzle DB config is imported
import { PaymentsTable, BookingTable
 } from "../db/schema/BookingSchema";
import { notifications } from "../db/schema/schema";
import { io } from "../..";
import { AgentTable } from "../db/schema/AgentSchema";
const nodemailer = require("nodemailer"); 
import PDFDocument from 'pdfkit';

export const PaymentIniciate = async (req: Request, res: Response, next: NextFunction) => {
  try {
  const { agent_id, vehicle_id, suplier_id, pickup_location, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_miles, price, passenger_email, passenger_name, passenger_phone, currency } = req.body;

        // const merchantId = process.env.CCAVENUE_MERCHANT_ID!;
        // const accessCode = process.env.CCAVENUE_ACCESS_CODE!;
        // const workingKey = process.env.CCAVENUE_WORKING_KEY!;
    const merchantId = 	'4188798';
        const accessCode = 'AVOA68MD68CH89AOHC';
        const workingKey = '0CF068BF3116484E4A4ABEE416E0D777';
        const redirectUrl = "https://sanzadinternational.in/payment-response-handler";
        const cancelUrl = "https://sanzadinternational.in/payment-failed";
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
     customer_name: passenger_name,
     customer_email: passenger_email,
     customer_mobile: passenger_phone,
     currency,
      status: 'pending',
    })
    .returning({ id: BookingTable.id });

  const bookingId = booking.id;

  // Step 2: Generate Order ID for CCAvenue
const orderId = `BOOK-${bookingId.slice(0, 8)}-${Date.now().toString().slice(-4)}`;


        // Payment data
        const data = `language=EN&billing_email=${passenger_email}&currency=INR&order_id=${orderId}&merchant_id=${merchantId}&amount=${price}&redirect_url=${redirectUrl}&cancel_url=${cancelUrl}&billing_tel=${passenger_phone}&merchant_param1=${bookingId}`;
   console.log('Raw Payment Data:', data);

        const encryptedData = encrypt(data, workingKey);
  
        res.json({
          url: 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction',
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
   console.log(req.body.encResp); // Check if encResp exists

   if (!encResp) {
  // return res.status(400).json({ error: 'Missing encrypted response (encResp)' });
    console.log('Missing encrypted response (encResp)');
}
    console.log(encResp);
    const workingKey = '0CF068BF3116484E4A4ABEE416E0D777';
    
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

  return res.status(200).json({
  redirectUrl: `${process.env.FRONTEND_URL}/payment-${paymentStatus}?orderId=${orderId}&transactionId=${transactionId}&amount=${amount}&paymentMode=${paymentMode}`
});
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
        reference_number,
       passenger_email, 
       passenger_name, 
       passenger_phone, 
       currency
      } = req.body;
  
      if (!agent_id || !vehicle_id || !suplier_id || !pickup_location || !drop_location || !price || !reference_number) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const customerEmail = "abhinavgu34@gmail.com";
        const customerPhone = "8433169822";
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
        customer_name: passenger_name,
     customer_email: passenger_email,
     customer_mobile: passenger_phone,
     currency,
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

     const ApiNotification = await db
            .insert(notifications).values({
                role_id: agent_id,
                type: "New_order",
                role: "Agent",
                message: `New Order`,
            });

            io.emit("Order", {
                message: `New Order`,
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
 export const ChangePaymentStatusByBookingId = async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const payment_status = req.body.payment_status; 
  
      if (!['pending', 'completed', 'failed', 'refunded'].includes(payment_status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      
      const result = await db.update(PaymentsTable) 
        .set({ payment_status: payment_status }) 
        .where(eq(PaymentsTable.booking_id, bookingId)); 
  const results = await db.select({ 
              id: PaymentsTable.id, 
              payment_status: PaymentsTable.payment_status, 
              agent_id: BookingTable.agent_id, 
              booking_id:PaymentsTable.booking_id, 
              email: AgentTable.Email 
          })
          .from(PaymentsTable)
          .innerJoin(BookingTable,eq(BookingTable.id, PaymentsTable.booking_id))
          .innerJoin(AgentTable,eq(AgentTable.id,BookingTable.agent_id)); 
      
               
              const transporter = nodemailer.createTransport({ 
                  service: 'Gmail', // Replace with your email service provider 
                  auth: { 
                              user: 'sanzadinternational5@gmail.com', // Email address from environment variable 
                              pass: 'betf euwp oliy tooq', // Email password from environment variable 
                  }, 
              }); 
              
              // Define the email options
              const mailOptions = {
                  from: 'sanzadinternational5@gmail.com',
                  to: results[0].email,
                  subject: 'Your status by sanzadinternational',
                  text: `Your query is <strong> ${results[0].payment_status}</strong> by the Sanzadinternational.`,
                  html: `Your query is <strong> ${results[0].payment_status}</strong> by the Sanzadinternational.`,
              };
      
              // Send the email
              await transporter.sendMail(mailOptions);

     
      return res.status(200).json({ message: 'Payment status updated successfully' });
    } catch (error) {
      console.error('Error updating payment status:', error);
      return res.status(404).json({ message: 'Internal server error' });
    }
  };

export const downloadInvoice = async (req: Request, res: Response) => {
  try {
    const bookingId = req.params.id;
    const [booking] = await db
      .select()
      .from(BookingTable)
      .where(eq(BookingTable.id, bookingId))
      .limit(1);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${booking.id}.pdf`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('error', (err) => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to generate invoice' });
      } else {
        res.end();
      }
    });

    doc.pipe(res);

    // === HEADER ===
    doc.rect(0, 0, doc.page.width, 60).fill('#004aad');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text('sanzadinternational.in', 50, 20);

    doc.moveDown(3);
    doc.fillColor('#004aad').fontSize(16).text('PROFORMA INVOICE', {
      align: 'center',
      underline: true,
    });

    // === FROM & TO SECTION ===
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fillColor('black').fontSize(10).text('From:');
    doc.font('Helvetica').fontSize(10).text(
      `office No: 5, 1st Floor, H-53, Sector 63 Rd, A Block, Sector 65, Noida, Uttar Pradesh 201301`,
      { lineGap: 2 }
    );

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text('To:');
    doc.font('Helvetica').fontSize(10).text('Sanzad International LLC');

    // === INVOICE INFO ===
    doc.moveDown(1);
    const createdAt = booking.created_at ? new Date(booking.created_at) : null;
    const formattedDate = createdAt && !isNaN(createdAt.getTime())
      ? createdAt.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : 'N/A';

    doc.font('Helvetica-Bold').text(`Invoice #: ${booking.id}`);
    doc.font('Helvetica-Bold').text(`Date: ${formattedDate}`);

    // === SERVICE DETAILS ===
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#004aad').text('Service Details');
    doc.moveDown(0.5);
    doc.font('Helvetica').fillColor('black').fontSize(10);
    doc.text(`Service ID: ${booking.id}`);
    doc.text(`From: ${booking.pickup_location}`);
    doc.text(`To: ${booking.drop_location}`);
    doc.text(`Date & Time: ${formattedDate} ${booking.time || ''}`);
    doc.text(`Provider: Nouni family`);

    // === TOTAL ===
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('black')
      .text(`Total Paid: €${booking.price}`, { align: 'right' });

    // === FOOTER ===
    doc.moveDown(2);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('gray')
      .text('Thank you for your business!', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Unexpected error during invoice download:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate invoice' });
    }
  }
};

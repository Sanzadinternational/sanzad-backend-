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
import { registerTable } from "../db/schema/SupplierSchema";
const nodemailer = require("nodemailer"); 
import PDFDocument from 'pdfkit';

export const PaymentInitiate = async (req: Request, res: Response, next: NextFunction) => {
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
      passenger_email,
      passenger_name,
      passenger_phone,
      currency,
     pickupDetails,
       dropoffDetails,
    } = req.body;

    const key = 'FYWyBY';
    const salt = 'QlrgPqGiOlYGXn7eQ0eIx2VpyEJBjfL1';
    const payuUrl = 'https://secure.payu.in/_payment';
    const surl = `https://api.sanzadinternational.in/api/V1/payment//payment-status-update`;
    const furl = `https://api.sanzadinternational.in/api/V1/payment//payment-status-update`;

   let pickupTypeFields: Record<string, any> = {};
    if (pickupDetails?.pickupType === "airport") {
      pickupTypeFields = {
        planeArrivingFrom: pickupDetails.planeArrivingFrom,
        airlineName: pickupDetails.airlineName,
        flightNumber: pickupDetails.flightNumber,
      };
    } else if (pickupDetails?.pickupType === "cruise") {
      pickupTypeFields = {
        cruiseShipName: pickupDetails.cruiseShipName,
      };
    } else if (pickupDetails?.pickupType === "station") {
      pickupTypeFields = {
        trainArrivingFrom: pickupDetails.trainArrivingFrom,
        trainName: pickupDetails.trainName,
        trainOperator: pickupDetails.trainOperator,
      };
    } else if (pickupDetails?.pickupType === "others") {
      pickupTypeFields = {
        hotelName: pickupDetails.hotelName,
      };
    }

   const agent = await db
  .select({
    name: AgentTable.name,
    email: AgentTable.email
  })
  .from(AgentTable)
  .where(eq(AgentTable.id, agent_id))
  .then(rows => rows[0]);

const supplier = await db
  .select({
    name: registerTable.name,
    email: registerTable.email
  })
  .from(registerTable)
  .where(eq(registerTable.id, suplier_id))
  .then(rows => rows[0]);

if (!agent || !supplier) {
  return res.status(400).json({ error: "Invalid agent or supplier ID" });
}

    const [booking] = await db
      .insert(BookingTable)
      .values({
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
        ...pickupTypeFields,
        ...dropoffDetails,
        status: "pending"
      })
      .returning({ id: BookingTable.id });

    const bookingId = booking.id;
    const txnid = `BOOK-${bookingId.slice(0, 8)}-${Date.now().toString().slice(-4)}`;
    const productinfo = "RideBooking";

  const amount = Number(price).toFixed(2); // Ensure consistent formatting

// CORRECTED HASH CALCULATION
    const hashFields = [
      key,
      txnid,
      amount,
      productinfo,
      passenger_name,  // firstname
      agent.email, // email
      bookingId,       // udf1
      agent.name,      // udf2
      agent.email,     // udf3
      supplier.name,   // udf4
      supplier.email,  // udf5
      '',              // udf6
      '',              // udf7
      '',              // udf8
      '',              // udf9
      '',              // udf10
      salt
    ];

    const hashString = hashFields.join('|');
   console.log(hashString);
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    const payuParams = {
      key,
      txnid,
      amount,
      productinfo,
      firstname: passenger_name,
      email: passenger_email,
      phone: passenger_phone,
      surl,
      furl,
      hash,
      service_provider: "payu_paisa",
      udf1: bookingId,
      udf2: agent.name,      // udf2
      udf3: agent.email,     // udf3
      udf4: supplier.name,   // udf4
      udf5: supplier.email, // Must match udf1 in hash calculation
    };

    return res.json({
      paymentUrl: payuUrl,
      formData: payuParams
    });
  } catch (error) {
    console.error("Payment initiation error:", error);
    return res.status(500).json({ error: "Failed to initiate payment" });
  }
};

export const PaymentStatusUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      status,
      txnid,
      amount,
      email,
      firstname,
      productinfo,
      mihpayid,
      mode,
      hash,
      udf1,
     udf2,
     udf3,
     udf4,
     udf5
    } = req.body;

    const key = 'FYWyBY';
    const salt = 'QlrgPqGiOlYGXn7eQ0eIx2VpyEJBjfL1';

    const hashString = [
  salt,
  status,
  '', '', '', '', '',
     udf5,
     udf4,
     udf3,
     udf2,// udf10 to udf2
  udf1,
  email,
  firstname,
  productinfo,
  amount,
  txnid,
  key
].join('|');
    const expectedHash = crypto.createHash("sha512").update(hashString).digest("hex");

    if (expectedHash !== hash) {
      console.warn("Invalid PayU hash");
      return res.status(400).json({ error: "Invalid hash" });
    }

    const paymentStatus = status.toLowerCase() === "success" ? "successful" : "failed";
    const bookingStatus = paymentStatus === "successful" ? "confirmed" : "cancelled";

    await db.insert(PaymentsTable).values({
      booking_id: udf1,
      payment_method: "PayU",
      payment_status: paymentStatus,
      transaction_id: mihpayid,
      reference_number: txnid,
      amount: parseFloat(amount).toFixed(2)
    });

    // Redirect user from server or pass redirect URL
    return res.redirect(`${process.env.FRONTEND_URL}/payment-${paymentStatus}?orderId=${txnid}&transactionId=${mihpayid}&amount=${amount}&paymentMode=${mode}`);
  } catch (error) {
    console.error("PayU callback failed:", error);
    return res.status(500).json({ error: "Payment processing failed" });
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
       currency,
pickupDetails,
       dropoffDetails,
      } = req.body;
  
      if (!agent_id || !vehicle_id || !suplier_id || !pickup_location || !drop_location || !price || !reference_number) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

     let pickupTypeFields: Record<string, any> = {};
    if (pickupDetails?.pickupType === "airport") {
      pickupTypeFields = {
        planeArrivingFrom: pickupDetails.planeArrivingFrom,
        airlineName: pickupDetails.airlineName,
        flightNumber: pickupDetails.flightNumber,
      };
    } else if (pickupDetails?.pickupType === "cruise") {
      pickupTypeFields = {
        cruiseShipName: pickupDetails.cruiseShipName,
      };
    } else if (pickupDetails?.pickupType === "station") {
      pickupTypeFields = {
        trainArrivingFrom: pickupDetails.trainArrivingFrom,
        trainName: pickupDetails.trainName,
        trainOperator: pickupDetails.trainOperator,
      };
    } else if (pickupDetails?.pickupType === "others") {
      pickupTypeFields = {
        hotelName: pickupDetails.hotelName,
      };
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
        ...pickupTypeFields,
       ...dropoffDetails,
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

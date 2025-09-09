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
import fs from 'fs';
import path from 'path';

export const PaymentInitiate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      agent_id,
      suplier_id,
      pickup_location,
      drop_location,
      pickup_lat,
      pickup_lng,
      drop_lat,
      drop_lng,
      distance_miles,
      price,
      passenger,
     pickupTime,
     tripType,
     returnDate,
     returnTime,
     pickupDate,
      passenger_email,
      passenger_name,
      passenger_phone,
      currency,
     pickupDetails,
       dropoffDetails,
       gstNumber,
       gstRequired,
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
    } else if (pickupDetails?.pickupType === "hotel") {
      pickupTypeFields = {
        hotelName: pickupDetails.hotelName,
      };
    }
   else if (pickupDetails?.pickupType === "others") { 
      pickupTypeFields = {
        venueAddress: pickupDetails.venueAddress,
      };
    }

const [agent] = await db
  .select({ name: AgentTable.Company_name, email: AgentTable.Email })
  .from(AgentTable)
  .where(eq(AgentTable.id, agent_id));

const [supplier] = await db
  .select({ name: registerTable.Company_name, email: registerTable.Email })
  .from(registerTable)
  .where(eq(registerTable.id, suplier_id));

if (!agent || !supplier) {
  return res.status(400).json({ error: "Invalid agent or supplier ID" });
}
   function generateTxnId() {
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase(); // 8 chars
  const timePart = Date.now().toString().slice(-4);
  return `SIT-${randomPart}-${timePart}`;
}

const txnid = generateTxnId();

    const [booking] = await db
      .insert(BookingTable)
      .values({
        agent_id,
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
       passengers: passenger,
  booking_date: pickupDate ? new Date(pickupDate) : null,
return_time: returnTime || null,
return_date: returnDate ? new Date(returnDate) : null,
       booking_unique_id: txnid,
       booking_time: pickupTime,
       pickup_type: pickupDetails.pickupType,
        currency,
        ...pickupTypeFields,
        ...dropoffDetails,
        gstNumber,
        gstRequired,
        status: "pending"
      })
      .returning({ id: BookingTable.id });

    const bookingId = booking.id;
    const productinfo = "RideBooking";

  const amount = Number(price).toFixed(2); // Ensure consistent formatting

// CORRECTED HASH CALCULATION
    const hashFields = [
      key,
      txnid,
      amount,
      productinfo,
      agent.name,  // firstname
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
      firstname: agent.name,
      email: agent.email,
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

     if (paymentStatus === 'successful') {
      const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'sanzadinternational5@gmail.com',
          pass: 'betf euwp oliy tooq', // Use environment variables in production
        },
      });

      await transporter.sendMail({
        from: '"Sanzadinternational" <sanzadinternational5@gmail.com>',
        to: udf3, // Email address from udf3
        subject: "Payment Successful",
        text: `Dear ${udf2},\n\nYour payment has been successful.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
  <h2 style="color: #2c3e50; text-align: center;">🎉 Payment Successful</h2>
  <p style="font-size: 16px; color: #333;">Dear ${udf2},</p>
  <p style="font-size: 16px; color: #333;">
    We are pleased to inform you that your payment has been successfully received. Thank you for choosing <strong>Sanzad International</strong>.
  </p>

  <div style="margin: 20px 0; padding: 15px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 5px rgba(0,0,0,0.05);">
    <h3 style="color: #2c3e50;">🧾 Payment Summary</h3>
    <ul style="list-style: none; padding: 0; font-size: 15px;">
      <li><strong>Transaction ID:</strong> ${mihpayid}</li>
      <li><strong>Order ID:</strong> ${txnid}</li>
      <li><strong>Amount:</strong> ₹${amount}</li>
      <li><strong>Payment Mode:</strong> ${mode}</li>
    </ul>
  </div>

  <p style="font-size: 16px; color: #333;">If you have any questions or need support, feel free to contact our team.</p>

  <p style="font-size: 16px; color: #333;">Best regards,<br/><strong>Sanzad International Team</strong></p>

  <div style="margin-top: 30px; text-align: center; font-size: 13px; color: #888;">
    <p>This is an automated message. Please do not reply.</p>
  </div>
</div>`
      });

      await transporter.sendMail({
        from: '"Sanzadinternational" <sanzadinternational5@gmail.com>',
        to: udf5, // Email address from udf3
        subject: "New Booking",
        text: `New Booking`,
        html: `
         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #dcdcdc; border-radius: 10px; background-color: #f9f9f9;">
  <h2 style="color: #2c3e50; text-align: center;">🛒 New Order Received</h2>

  <p style="font-size: 16px; color: #333;">Hello ${udf4},</p>

  <p style="font-size: 16px; color: #333;">
    A new Booking has been placed through the Sanzad International platform. Below are the order details:
  </p>

  <div style="margin: 20px 0; padding: 15px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 5px rgba(0,0,0,0.05);">
    <h3 style="color: #2c3e50;">📦 Order Information</h3>
    <ul style="list-style: none; padding: 0; font-size: 15px; color: #555;">
      <li><strong>Customer Name:</strong> ${udf2}</li>
      <li><strong>Email:</strong> ${udf3}</li>
      <li><strong>Order ID:</strong> ${txnid}</li>
      <li><strong>Transaction ID:</strong> ${mihpayid}</li>
      <li><strong>Product/Service:</strong> ${productinfo}</li>
      <li><strong>Amount:</strong> ₹${amount}</li>
      <li><strong>Payment Mode:</strong> ${mode}</li>
      <li><strong>Payment Status:</strong> ${status}</li>
    </ul>
  </div>

  <p style="font-size: 16px; color: #333;">Please review and process the order accordingly.</p>

  <p style="font-size: 16px; color: #333;">Regards,<br/><strong>Sanzad Booking System</strong></p>

  <div style="margin-top: 30px; text-align: center; font-size: 13px; color: #999;">
    <p>This is an automated internal notification. No action is required from the recipient.</p>
  </div>
</div>
`
      });
      await transporter.sendMail({
        from: '"Sanzadinternational" <sanzadinternational5@gmail.com>',
        to: 'sanzadinternational5@gmail.com', // Email address from udf3
        subject: "New Booking",
        text: `New Booking`,
        html: `
         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #dcdcdc; border-radius: 10px; background-color: #f9f9f9;">
  <h2 style="color: #2c3e50; text-align: center;">🛒 New Order Received</h2>

  <p style="font-size: 16px; color: #333;">Hello Admin,</p>

  <p style="font-size: 16px; color: #333;">
    A new Booking has been placed through the Sanzad International platform. Below are the order details:
  </p>

  <div style="margin: 20px 0; padding: 15px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 5px rgba(0,0,0,0.05);">
    <h3 style="color: #2c3e50;">📦 Order Information</h3>
    <ul style="list-style: none; padding: 0; font-size: 15px; color: #555;">
      <li><strong>Customer Name:</strong> ${udf2}</li>
      <li><strong>Email:</strong> ${udf3}</li>
      <li><strong>Order ID:</strong> ${txnid}</li>
      <li><strong>Transaction ID:</strong> ${mihpayid}</li>
      <li><strong>Product/Service:</strong> ${productinfo}</li>
      <li><strong>Amount:</strong> ₹${amount}</li>
      <li><strong>Payment Mode:</strong> ${mode}</li>
      <li><strong>Payment Status:</strong> ${status}</li>
    </ul>
  </div>

  <p style="font-size: 16px; color: #333;">Please review and process the order accordingly.</p>

  <p style="font-size: 16px; color: #333;">Regards,<br/><strong>Sanzad Booking System</strong></p>

  <div style="margin-top: 30px; text-align: center; font-size: 13px; color: #999;">
    <p>This is an automated internal notification. No action is required from the recipient.</p>
  </div>
</div>
`
      });
    }else{
      const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'sanzadinternational5@gmail.com',
          pass: 'betf euwp oliy tooq', // Use environment variables in production
        },
      });

      await transporter.sendMail({
        from: '"Sanzadinternational" <sanzadinternational5@gmail.com>',
        to: udf3, // Email address from udf3
        subject: "Payment Failed",
        text: `Dear ${udf2},\n\nYour payment has been Failed.`,
        html: `
         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f5c6cb; border-radius: 10px; background-color: #fff3f3;">
  <h2 style="color: #c0392b; text-align: center;">❗ Payment Failed</h2>

  <p style="font-size: 16px; color: #333;">Dear ${udf2},</p>

  <p style="font-size: 16px; color: #333;">
    Unfortunately, your payment attempt was <strong>unsuccessful</strong>. This may have occurred due to network issues, incorrect card details, or insufficient funds.
  </p>

  <div style="margin: 20px 0; padding: 15px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 5px rgba(0,0,0,0.05);">
    <h3 style="color: #c0392b;">🔁 Payment Attempt Details</h3>
    <ul style="list-style: none; padding: 0; font-size: 15px;">
      <li><strong>Transaction ID:</strong> ${mihpayid}</li>
      <li><strong>Order ID:</strong> ${txnid}</li>
      <li><strong>Amount:</strong> ₹${amount}</li>
      <li><strong>Payment Mode:</strong> ${mode}</li>
    </ul>
  </div>

  <p style="font-size: 16px; color: #333;">You can try again using the payment link or contact our support if the issue persists.</p>

  <p style="font-size: 16px; color: #333;">Best regards,<br/><strong>Sanzad International Team</strong></p>

  <div style="margin-top: 30px; text-align: center; font-size: 13px; color: #999;">
    <p>This is an automated message. Please do not reply.</p>
  </div>
</div>
`
      });
     }

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
        suplier_id,
        pickup_location,
        drop_location,
        pickup_lat,
        pickup_lng,
        drop_lat,
        drop_lng,
        distance_miles,
        passenger,
        pickupTime,
     tripType,
     returnDate,
     returnTime,
     pickupDate,
        price,
        reference_number,
       passenger_email, 
       passenger_name, 
       passenger_phone, 
       currency,
pickupDetails,
       dropoffDetails,
      gstNumber,
    gstRequired,
      } = req.body;
  
      if (!agent_id || !suplier_id || !pickup_location || !drop_location || !price || !reference_number) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

        function generateTxnId() {
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase(); // 8 chars
  const timePart = Date.now().toString().slice(-4);
  return `BOOK-${randomPart}-${timePart}`;
}

const txnid = generateTxnId();

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
    } else if (pickupDetails?.pickupType === "hotel") {
      pickupTypeFields = {
        hotelName: pickupDetails.hotelName,
      };
    } else if (pickupDetails?.pickupType === "others") { 
      pickupTypeFields = {
        venueAddress: pickupDetails.venueAddress,
      };
    }

      const customerEmail = "abhinavgu34@gmail.com";
        const customerPhone = "8433169822";
      // Insert booking and get the generated ID
      const [booking] = await db.insert(BookingTable).values({
        agent_id,
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
              passengers: passenger,
   booking_date: pickupDate ? new Date(pickupDate) : null,
return_time: returnTime || null,
return_date: returnDate ? new Date(returnDate) : null,
       booking_unique_id: txnid,
        booking_time: pickupTime,
       pickup_type: pickupDetails.pickupType,
     currency,
        ...pickupTypeFields,
       ...dropoffDetails,
    gstNumber,
    gstRequired,
        status: 'pending',
      }).returning({ id: BookingTable.id });
  
      if (!booking) {
        return res.status(500).json({ error: 'Failed to create booking' });
      }
  
      const bookingId = String(booking.id);
  
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
        orderId: txnid
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

// export const downloadInvoice = async (req: Request, res: Response) => {
//   try {
//     const bookingId = parseInt(req.params.id);
//     const [booking] = await db
//       .select()
//       .from(BookingTable)
//       .where(eq(BookingTable.id, bookingId))
//       .limit(1);

//     if (!booking) {
//       return res.status(404).json({ message: 'Booking not found' });
//     }

//    const doc = new PDFDocument({ margin: 50 });
//    res.setHeader('Content-Type', 'application/pdf');
//    res.setHeader('Content-Disposition', `inline; filename=invoice_${booking.id}.pdf`);
//   doc.pipe(res);

// //   //   // === Optional Logo ===
//    const logoPath = path.join(__dirname, 'logo.png');
//    if (fs.existsSync(logoPath)) {
//     doc.image(logoPath, 50, 45, { width: 100 });
//     doc.moveDown(1.5);
//   }

// //   //   // === Header ===
//    doc
//     .fontSize(20)
//    .fillColor('#004aad')
//     .text('PROFORMA INVOICE', { align: 'center' })
//     .moveDown(0.5);

//    const createdAt = booking.created_at ? new Date(booking.created_at) : null;
//    const formattedDate = createdAt && !isNaN(createdAt.getTime())
//      ? createdAt.toLocaleDateString('en-GB', {
//         day: '2-digit',
//        month: 'short',
//        year: 'numeric',
//       })
//      : 'N/A';

//    doc
//      .fontSize(12)
//      .fillColor('#666')
//      .text(`Invoice #: ${booking.id}`)
//     .text(`Date: ${formattedDate}`)
//      .moveDown(0.5);

//   drawLine(doc);

// //   //   // === Customer Info ===
//   sectionHeader(doc, 'Customer Info');
//   doc
//     .fontSize(11)
//     .fillColor('#000')
//      .text(`Name: ${booking.passenger_name || 'N/A'}`)
//      .text(`Mobile Number: ${booking.mobile_number || 'N/A'}`)
//      .text(`Email: ${booking.email || 'N/A'}`)
//      .moveDown();

// //   //   // === Service Details ===
//    sectionHeader(doc, 'Service Details');
//    doc
//     .text(`Service ID: ${booking.id}`)
//     .text(`From: ${booking.pickup_location || 'N/A'}`)
//     .text(`To: ${booking.drop_location || 'N/A'}`)
//     .text(`Date & Time: ${formattedDate} ${booking.time || ''}`)
//    .text(`Vehicle Type: ${booking.vehicle_type || 'Minivan or Similar'}`)
//     .text(`Passengers: ${booking.passengers || 'N/A'}`)
//     .text(`Luggage: ${booking.luggage || 'N/A'}`)
//     .moveDown();

// //   //   // === Price Breakdown ===
//   sectionHeader(doc, 'Payment Details');
//    doc
//      .text(`Payment Status: Paid in Full`)
//     .text(`Total Price: €${booking.price}`, { align: 'right' })
//      .moveDown();

// //   //   // === Footer Note ===
//    doc
//     .fontSize(12)
//     .fillColor('#000')
//     .text('*** Thank you for choosing Sanzad International! ***', { align: 'center' })
//     .moveDown();

//    drawLine(doc);

// //   //   // === Footer ===
//    doc
//      .fontSize(10)
//      .fillColor('#666')
//      .text('FF-4 1st Floor, H-53, Sector-63, Noida, Gautam Buddha Nagar, UP, 201301', {
//        align: 'center'
//     })
//     .text('24X7 Customer Support: +91 7880331786', { align: 'center' });

//    doc.end();
//  } 
//    catch (error) {
//    console.error('Error generating invoice:', error);
//  if (!res.headersSent) {
//  res.status(500).json({ message: 'Failed to generate invoice' });
//    }
//  }
//  };

export const downloadInvoice = async (req: Request, res: Response) => {
  const bookingId = req.params.id;
  if (!bookingId) {
    return res.status(400).json({ message: 'Missing booking ID' });
  }

  try {
    const booking = await fetchInvoiceData(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    generateInvoicePDF(res, booking);
  } catch (error) {
    handleError(error, res);
  }
};

type InvoiceBookingData = {
  bookingId: string;
  bookedAt: Date;
  bookingDate: string;
  bookingTime: string;
  returnDate: string;
  returnTime: string;
  passengers: number;
  customerName: string;
  customerNumber: string;
  pickupLocation: string;
  dropLocation: string;
  paymentAmount: number;
  paymentStatus: string;
  currency: string;
};

const fetchInvoiceData = async (bookingId: string): Promise<InvoiceBookingData | null> => {
  const [booking] = await db
    .select({
      bookingId: BookingTable.booking_unique_id,
      bookedAt: BookingTable.booked_at,
      bookingDate: BookingTable.booking_date,
      bookingTime: BookingTable.booking_time,
      returnDate: BookingTable.return_date,
      returnTime: BookingTable.return_time,
      passengers: BookingTable.passengers,
      customerName: BookingTable.customer_name,
      customerNumber: BookingTable.customer_mobile,
      pickupLocation: BookingTable.pickup_location,
      dropLocation: BookingTable.drop_location,
      paymentAmount: PaymentsTable.amount,
      paymentStatus: PaymentsTable.payment_status,
      currency: BookingTable.currency,
    })
    .from(BookingTable)
    .innerJoin(PaymentsTable, eq(PaymentsTable.booking_id, BookingTable.id))
    .where(eq(BookingTable.id, bookingId))
    .limit(1);

  return booking || null;
};

const generateInvoicePDF = (res: Response, booking: InvoiceBookingData) => {
  const doc = new PDFDocument({ margin: 50 });
  const safeFilename = `invoice_${String(booking.bookingId).replace(/[^a-z0-9]/gi, '_')}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  doc.pipe(res);

  addLogo(doc);
  addInvoiceHeader(doc, booking);
  drawLine(doc);

  addBillTo(doc, booking);
  drawLine(doc);

  addServiceDetailsTable(doc, booking);
  drawLine(doc);

  addPaymentSummary(doc, booking);
  drawLine(doc);

  addFooter(doc);

  doc.end();
};

const addInvoiceHeader = (doc: PDFDocument, booking: InvoiceBookingData) => {
  const issueDate = booking.bookedAt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  doc.font('Helvetica-Bold').fontSize(16).text('PROFORMA INVOICE', { align: 'center', underline: true });
  doc.moveDown(0.5);

  const y = doc.y;
  doc.fontSize(10);
  doc.text(`Invoice #: ${booking.bookingId}`, 50, y, { width: 250 });
  doc.text(`Invoice Date: ${issueDate}`, 300, y, { width: 250, align: 'right' });
  doc.moveDown(1);
};

const addBillTo = (doc: PDFDocument, booking: InvoiceBookingData) => {
  sectionHeader(doc, 'Bill To:');
  labelValueRow(doc, 'Name', booking.customerName);
  labelValueRow(doc, 'Mobile', booking.customerNumber);
};

const addServiceDetailsTable = (doc: PDFDocument, booking: InvoiceBookingData) => {
  sectionHeader(doc, 'Service Details:');

  const tableTop = doc.y;
  const padding = 5;
  const colWidths = [130, 130, 130, 130];
  const colX = [50, 180, 310, 440];
  const headerHeight = 20;
  const rowHeight = 40;

  const drawCell = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).stroke();

  const headers = ["Pickup Location", "Drop Location", "Booking Date/Time", "Return Date/Time"];
  doc.fontSize(10).font('Helvetica-Bold');
  headers.forEach((header, i) => {
    doc.text(header, colX[i] + padding, tableTop + 5, { width: colWidths[i] - padding * 2 });
    drawCell(colX[i], tableTop, colWidths[i], headerHeight);
  });

  const rowY = tableTop + headerHeight;
  doc.font('Helvetica').fontSize(9);
  doc.text(booking.pickupLocation, colX[0] + padding, rowY + 5, { width: colWidths[0] - padding * 2 });
  doc.text(booking.dropLocation, colX[1] + padding, rowY + 5, { width: colWidths[1] - padding * 2 });
  doc.text(`${booking.bookingDate} ${booking.bookingTime || ''}`, colX[2] + padding, rowY + 5, { width: colWidths[2] - padding * 2 });
  doc.text(`${booking.returnDate || 'N/A'} ${booking.returnTime || ''}`, colX[3] + padding, rowY + 5, { width: colWidths[3] - padding * 2 });

  for (let i = 0; i < colX.length; i++) drawCell(colX[i], rowY, colWidths[i], rowHeight);

  doc.y = rowY + rowHeight + 15;
};

const addPaymentSummary = (doc: PDFDocument, booking: InvoiceBookingData) => {
  sectionHeader(doc, 'Payment Summary:');
  labelValueRow(doc, 'Payment Status', booking.paymentStatus);
  labelValueRow(doc, 'Amount Paid', `${booking.currency} ${booking.paymentAmount}`);
};


type VoucherBookingData = {
  bookingId: string;
  bookedAt: Date;
  bookingDate: string;
  bookingTime: string;
  returnDate: string;
  returnTime: string;
  passengers: number;
  customerName: string;
  customerNumber: string;
  pickupLocation: string;
  dropLocation: string;
  paymentAmount: number;
  paymentStatus: string;
 Currency: string;
};

export const downloadVoucher = async (req: Request, res: Response) => {
  const bookingId = req.params.id;
  if (!bookingId) {
    return res.status(400).json({ message: 'Missing booking ID' });
  }

  try {
    const booking = await fetchBookingData(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    generatePDF(res, booking);
  } catch (error) {
    handleError(error, res);
  }
};

const fetchBookingData = async (bookingId: string): Promise<VoucherBookingData | null> => {
  const [booking] = await db
    .select({
      bookingId: BookingTable.booking_unique_id,
      bookedAt: BookingTable.booked_at,
      bookingDate: BookingTable.booking_date,
      bookingTime: BookingTable.booking_time,
      returnDate: BookingTable.return_date,
      returnTime: BookingTable.return_time,
      passengers: BookingTable.passengers,
      customerName: BookingTable.customer_name,
      customerNumber: BookingTable.customer_mobile,
      pickupLocation: BookingTable.pickup_location,
      dropLocation: BookingTable.drop_location,
      paymentAmount: PaymentsTable.amount,
      paymentStatus: PaymentsTable.payment_status,
     Currency:BookingTable.currency,
    })
    .from(BookingTable)
    .innerJoin(PaymentsTable, eq(PaymentsTable.booking_id, BookingTable.id))
    .where(eq(BookingTable.id, bookingId))
    .limit(1);

  return booking || null;
};

const generatePDF = (res: Response, booking: VoucherBookingData) => {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="voucher_${booking.bookingId}.pdf"`);
  doc.pipe(res);

  addLogo(doc);
  addDocumentHeader(doc, booking);
  drawLine(doc);

  addPassengerDetails(doc, booking);
  drawLine(doc);

  addItinerary(doc, booking);
  drawLine(doc);

  addBookingDetails(doc, booking);
  drawLine(doc);

  addMeetingPoint(doc);
  drawLine(doc);

  addSupportInfo(doc);
  drawLine(doc);

  addTermsAndConditions(doc);
  drawLine(doc);

  addFooter(doc);

  doc.end();
};

const addLogo = (doc: PDFDocument) => {
  const logoPath = path.join(__dirname, 'logo.png');
  if (fs.existsSync(logoPath)) {
    const logoWidth = 80;   // smaller width
    const logoHeight = 80;  // smaller height
    const pageWidth = doc.page.width;

    // center the logo at the top
    const xCenter = (pageWidth - logoWidth) / 2;
    const topMargin = 40;

    doc.image(logoPath, xCenter, topMargin, { width: logoWidth, height: logoHeight });

    // move cursor below the logo
    doc.y = topMargin + logoHeight + 20;
  }
};


const addDocumentHeader = (doc: PDFDocument, booking: VoucherBookingData) => {
  const issueDate = booking.bookedAt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const startY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Transfer ID: ${booking.bookingId}`, 50, startY, { width: 250, align: 'left' });
  doc.text(`Issue Date: ${issueDate}`, 300, startY, { width: 250, align: 'right' });

  doc.moveDown(1);
  doc.fontSize(14)
   .font('Helvetica-Bold')
   .text(
     `Transfer ${booking.bookingDate} ${booking.bookingTime} Hrs`,
     50, // X position (left margin)
     doc.y, // Current Y position
     { width: 510, align: 'center' } // Full page width, center align
   );
  doc.moveDown(0.5);
};

const addPassengerDetails = (doc: PDFDocument, booking: VoucherBookingData) => {
  sectionHeader(doc, 'Passenger Details:');
  labelValueRow(doc, 'Name', booking.customerName);
  labelValueRow(doc, 'Mobile Number', booking.customerNumber);
  doc.moveDown(0.5);
};

const addItinerary = (doc: PDFDocument, booking: VoucherBookingData) => {
  sectionHeader(doc, 'Transfers Itinerary:');

  const tableTop = doc.y;
  const padding = 5;

  // Adjusted widths for better fit within margins (total ~510)
  const colWidths = [80, 80, 170, 180];
  const colX = [50, 130, 210, 380];
  const headerHeight = 20;
  const rowHeight = 40;

  const drawCellBorder = (x: number, y: number, w: number, h: number) => {
    doc.rect(x, y, w, h).stroke();
  };

  // Header row
  doc.fontSize(10).font('Helvetica-Bold');
  ["Date", "Pick-Up Time", "Pick-Up Location", "Drop-off Location"].forEach((header, i) => {
    doc.text(header, colX[i] + padding, tableTop + 5, {
      width: colWidths[i] - padding * 2
    });
    drawCellBorder(colX[i], tableTop, colWidths[i], headerHeight);
  });

  // Data row
  const rowY = tableTop + headerHeight;
  doc.font('Helvetica').fontSize(10);
  doc.text(booking.bookingDate, colX[0] + padding, rowY + 5, {
    width: colWidths[0] - padding * 2
  });
  doc.text(`${booking.bookingTime} Hrs`, colX[1] + padding, rowY + 5, {
    width: colWidths[1] - padding * 2
  });
  doc.text(booking.pickupLocation, colX[2] + padding, rowY + 5, {
    width: colWidths[2] - padding * 2
  });
  doc.text(booking.dropLocation, colX[3] + padding, rowY + 5, {
    width: colWidths[3] - padding * 2
  });

  for (let i = 0; i < colX.length; i++) {
    drawCellBorder(colX[i], rowY, colWidths[i], rowHeight);
  }

  // Move y after table
  doc.y = rowY + rowHeight + 15;
};


const addBookingDetails = (doc: PDFDocument, booking: VoucherBookingData) => {
  sectionHeader(doc, 'Booking Details:');
  labelValueRow(doc, 'No. of Passengers', booking.passengers.toString());
  labelValueRow(doc, 'Vehicle Type', 'Minivan Or Similar');
  labelValueRow(doc, 'Remark', 'Waiting 15 minutes');
  labelValueRow(doc, 'Payment', booking.paymentStatus === 'Paid' ? 'Paid in Full' : booking.paymentStatus);
  labelValueRow(doc, 'Amount Paid', `${booking.Currency}\u00A0${booking.paymentAmount}`);
  doc.moveDown(0.5);
};

const addMeetingPoint = (doc: PDFDocument) => {
  sectionHeader(doc, 'Meeting Point:');
  doc.fontSize(10).text(
    'The driver will meet you at the main entrance of the building or wait in the designated parking area, depending on local access and parking regulations. Please be ready at the scheduled time to ensure a smooth transfer.',
    { align: 'left' }
  );
  doc.moveDown(0.5);
};

const addSupportInfo = (doc: PDFDocument) => {
  sectionHeader(doc, '24X7 Customer Support: +91 7880331786');
  doc.fontSize(10).text(
    'If you are unable to reach your driver directly, please do not leave your pick-up location without first contacting our customer support team at +91 7880331786. We are available 24/7 to assist you.',
    { align: 'left' }
  );
  doc.moveDown(0.5);
};

const addTermsAndConditions = (doc: PDFDocument) => {
  sectionHeader(doc, 'IMPORTANT INFORMATION\nTransfer Service Terms and Conditions');
  doc.fontSize(9).list([
    'Airport Pick-Up Waiting Time: 45 min complimentary wait from landing time',
    'Other Pick-Up Locations: 15 min free wait time',
    'Delays at Immigration or Baggage Claim: Call emergency number for extension (subject to availability & charges)',
    'Point-to-Point Transfers: Driver cannot wait beyond allocated time',
    'Changes to Booking Details: Request at least 72 hours in advance',
    'Exceeding Free Waiting Time: May result in additional fees or cancellation',
    'Service Provider Disclaimer: Agency not responsible for delays from third-party suppliers or client actions',
    'Availability of Contact Number: Must be active at pickup time',
    'Amendments & Cancellations: Contact support',
    'Last-Minute Changes (Within 72 Hours): Call support directly',
    'Terms of Service: Subject to general terms & local provider terms',
    'Smoking Policy: Strictly prohibited in vehicles',
    'Missed Connections Due to Client Delay: Company not liable'
  ]);
  doc.moveDown(0.5);
};

const addFooter = (doc: PDFDocument) => {
  doc.moveDown(1);
  doc.fontSize(12).fillColor('#000').text('*** Thank you! Have a wonderful trip! ***', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(9).fillColor('#666')
    .text('Corporate Office: Suite No. 4, H-143, Sector-63, Noida, Gautam Buddha Nagar, UP, 201301', { align: 'center' })
    .text('24X7 Customer Support: +91 7880331786', { align: 'center' });
};

const sectionHeader = (doc: PDFDocument, title: string) => {
  if (doc.y < 50) doc.addPage(); // Avoid header too close to page top
  doc.moveDown(0.8);
  doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(title, 50, doc.y);
  doc.font('Helvetica').fillColor('#000');
  doc.moveDown(0.3);
};

const labelValueRow = (doc: PDFDocument, label: string, value: string) => {
  const y = doc.y;
  doc.fontSize(10).font('Helvetica-Bold').text(`${label}:`, 50, y, { width: 100, align: 'left' });
  doc.font('Helvetica').text(value, 150, y, { width: 400, align: 'left' });
  doc.moveDown(0.3);
};

const drawLine = (doc: PDFDocument) => {
  const y = doc.y;
  doc.moveTo(50, y).lineTo(560, y).stroke();
  doc.moveDown(0.5);
};

const handleError = (error: unknown, res: Response) => {
  console.error('Voucher generation error:', error);
  if (!res.headersSent) {
    res.status(500).json({
      message: 'Failed to generate voucher',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

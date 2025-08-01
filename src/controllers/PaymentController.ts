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
        price,
        reference_number,
       passenger_email, 
       passenger_name, 
       passenger_phone, 
       currency,
pickupDetails,
       dropoffDetails,
      } = req.body;
  
      if (!agent_id || !suplier_id || !pickup_location || !drop_location || !price || !reference_number) {
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
export const downloadVoucher = async (req: Request, res: Response) => {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="voucher.pdf"');
  doc.pipe(res);

  // Optional Logo (add logo.png in the root or modify path)
  const logoPath = path.join(__dirname, 'logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 45, { width: 100 });
    doc.moveDown(1.5);
  }

  // Header
  doc
    .fontSize(20)
    .fillColor('#333')
    .text('Transfer Voucher', { align: 'center' })
    .moveDown(0.5);

  doc
    .fontSize(12)
    .fillColor('#666')
    .text('Transfer ID: SI0001')
    .text('Issue Date: 01-July-2025')
    .moveDown(0.5);

  drawLine(doc);

  // Transfer Info
  doc
    .fillColor('#000')
    .fontSize(12)
    .text('Transfer: August 01, 2024 - 16:45 Hrs')
    .moveDown(1);

  // Passenger Section
  sectionHeader(doc, 'Passenger Details');
  doc
    .text('Name: Mrs. FARZANA PERVEZ PATEL')
    .text('Mobile Number: +91 9820407529')
    .moveDown();

  // Itinerary Section
  sectionHeader(doc, 'Transfer Itinerary');
  doc
    .text('Date: 01-Aug-2025')
    .text('Pick-Up Time: 16:45 Hrs')
    .text('Pick-Up Location: Paris Charles de Gaulle Airport\n95700 Roissy-en-France, France')
    .text('Drop-off Location: Novotel Paris Centre Tour Eiffel\n61 Quai de Grenelle, 75015 Paris, France')
    .moveDown();

  // Booking Details
  sectionHeader(doc, 'Booking Details');
  doc
    .text('No. of Passengers: 04')
    .text('No. of Luggages: 04')
    .text('Vehicle Type: Minivan Or Similar')
    .text('Remark: Waiting 15 minutes')
    .text('Payment: Paid in Full')
    .moveDown();

  // Meeting Point
  sectionHeader(doc, 'Meeting Point');
  doc
    .text('The driver will meet you at the main entrance or designated parking area, depending on local access and parking rules.')
    .text('Please be ready at the scheduled time to ensure a smooth transfer.')
    .moveDown();

  // Support
  sectionHeader(doc, '24x7 Customer Support');
  doc
    .text('Phone: +91 7880331786')
    .text('If you are unable to reach your driver, do not leave your location without first contacting support.')
    .moveDown();

  // Terms & Conditions
  sectionHeader(doc, 'Important Information');
  doc.fontSize(10).list([
    'Airport Pick-Up: 45 min complimentary wait from landing time.',
    'Non-Airport Pick-Up: 15 min free wait time.',
    'Delays: Call emergency number to request extension (subject to availability).',
    'Driver may leave if waiting time exceeded due to tight schedules.',
    'Booking changes must be requested at least 72 hours in advance.',
    'Exceeding waiting time may result in additional fees or cancellation.',
    'We are not liable for third-party supplier service issues.',
    'Mobile phone must be active and reachable at pickup time.',
    'Delays at customs or baggage? Contact emergency number immediately.',
    'Cancellations/Amendments must be made via email or phone.',
    'Last-minute changes (<72 hrs) must be called in directly.',
    'Smoking is strictly prohibited in all vehicles.',
    'We are not liable if you miss connections due to personal delays.'
  ]);
  doc.moveDown();

  // Closing Message
  doc
    .fontSize(12)
    .fillColor('#000')
    .text('*** Thank you! Have a wonderful trip! ***', { align: 'center' })
    .moveDown(1);

  drawLine(doc);

  // Footer
  doc
    .fontSize(10)
    .fillColor('#666')
    .text('FF-4 1st Floor, H-53, Sector-63, Noida, Gautam Buddha Nagar, UP, 201301', {
      align: 'center'
    })
    .text('24X7 Customer Support: +91 7880331786', { align: 'center' });

  doc.end();
};

// Section Header Helper
function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc
    .moveDown(0.5)
    .fontSize(13)
    .fillColor('#007ACC')
    .text(title, { underline: true })
    .fillColor('#000')
    .fontSize(11);
}

// Divider Line Helper
function drawLine(doc: PDFKit.PDFDocument) {
  doc
    .strokeColor('#CCCCCC')
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke()
    .moveDown();
}

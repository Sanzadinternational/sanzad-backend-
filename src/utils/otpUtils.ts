// // otpUtils.ts
// import nodemailer from 'nodemailer';

// // Function to generate OTP
// export function generateOTP(length: number = 6): string {
//   return Math.floor(100000 + Math.random() * 900000).toString().slice(0, length);
// }

// // Function to send email with OTP
// export async function sendOTPEmail(recipientEmail: string, otp: string): Promise<void> {
//   const transporter = nodemailer.createTransport({
//     service: 'Gmail', // Or your preferred email service
//     auth: {
//       user: 'jugalkishor556455@gmail.com',
//       pass: 'vhar uhhv gjfy dpes',
//     },
//   });

//   const mailOptions = {
//     from: 'jugalkishor556455@gmail.com',
//     to: recipientEmail,
//     subject: 'Your OTP for Registration',
//     text: `Your OTP is: ${otp}`,
//   };

//   await transporter.sendMail(mailOptions);
// }

import nodemailer from 'nodemailer';

// Function to generate OTP
export function generateOTP(length: number = 6): string {
  return Math.floor(100000 + Math.random() * 900000).toString().slice(0, length);
}

// Function to send email with OTP
export async function sendOTPEmail(recipientEmail: string, otp: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: 'Gmail', // Or your preferred email service
    auth: {
      user: 'jugalkishor556455@gmail.com',
      pass: 'vhar uhhv gjfy dpes',
    },
  });

  const mailOptions = {
    from: 'jugalkishor556455@gmail.com',
    to: recipientEmail,
    subject: 'Your OTP for Registration',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="text-align: center; color: #4CAF50;">Welcome to Sanzad International</h2>
        <p>Hello,</p>
        <p>Thank you for registering with us! Please use the following OTP to complete your registration:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; font-size: 24px; color: #4CAF50; padding: 10px 20px; border: 1px solid #4CAF50; border-radius: 8px;">
            ${otp}
          </span>
        </div>
        <p>This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
        <p>If you did not request this OTP, please ignore this email.</p>
        <p>Best regards,</p>
        <p><strong>Sanzad International</strong></p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}
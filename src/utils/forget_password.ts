import crypto from 'crypto';

export default function generateResetToken() {
  return crypto.randomBytes(32).toString('hex'); // Generate a secure token
}

import crypto from 'crypto';

const encrypt = (plainText: string, workingKey: string): string => {
  const key = crypto.createHash('md5').update(workingKey).digest(); // 16-byte key for AES-128
  const iv = Buffer.alloc(16, 0); // 16-byte IV (all zeros)
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decrypt = (encryptedText: string, workingKey: string): string => {
  const key = crypto.createHash('md5').update(workingKey).digest(); // 16-byte key
  const iv = Buffer.alloc(16, 0); // 16-byte IV (all zeros)
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

export { encrypt, decrypt };

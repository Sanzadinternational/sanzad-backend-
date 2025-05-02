import crypto from 'crypto';

const encrypt = (plainText: string, workingKey: string): string => {
  const key = crypto.createHash('md5').update(workingKey).digest(); // 16 bytes
  const iv = Buffer.alloc(16, 0); // 16 zero bytes
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
};

const decrypt = (encryptedText: string, workingKey: string): string => {
  const key = crypto.createHash('md5').update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

export { encrypt, decrypt };

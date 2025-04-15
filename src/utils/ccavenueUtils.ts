import crypto from 'crypto';

const encrypt = (plainText: string, workingKey: string): string => {
  const key = crypto.createHash('md5').update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.concat([key, key.slice(0, 16)]), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decrypt = (encryptedText: string, workingKey: string): string => {
  const key = crypto.createHash('md5').update(workingKey).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.concat([key, key.slice(0, 16)]), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

export { encrypt, decrypt };

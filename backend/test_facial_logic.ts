import { encrypt, decrypt } from './src/shared/utils/encryption';

// Mock a 128-dimensional descriptor
const originalDescriptor = Array.from({ length: 128 }, () => Math.random());

// Register simulation
const descriptorBuffer = Buffer.from(
  new Float32Array(originalDescriptor).buffer
);
const { encrypted, iv, authTag } = encrypt(descriptorBuffer);

const encHex = encrypted.toString('hex');
const ivHex = iv.toString('hex');
const authTagHex = authTag.toString('hex');

// Recognize simulation
const decrypted = decrypt(
  Buffer.from(encHex, 'hex'),
  Buffer.from(ivHex, 'hex'),
  Buffer.from(authTagHex, 'hex')
);

const arrayBuffer = decrypted.buffer.slice(
  decrypted.byteOffset,
  decrypted.byteOffset + decrypted.byteLength
);
const storedDescriptor = new Float32Array(arrayBuffer);

// Compare
let matchCount = 0;
for (let i = 0; i < 128; i++) {
  if (Math.abs(originalDescriptor[i] - storedDescriptor[i]) < 1e-6) {
    matchCount++;
  }
}

console.log(`Original length: ${originalDescriptor.length}`);
console.log(`Decrypted Float32Array length: ${storedDescriptor.length}`);
console.log(`Matched elements: ${matchCount} / 128`);
if (matchCount === 128) {
  console.log("SUCCESS: Encryption/Decryption and Float32Array alignment works perfectly!");
} else {
  console.log("FAILURE: Mismatch in decrypted floats!");
}

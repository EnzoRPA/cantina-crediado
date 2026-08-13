import { encrypt, decrypt } from '../backend/src/shared/utils/encryption';

function testConversion() {
  const original = Array.from({ length: 128 }, () => Math.random());
  
  // 1. Convert to Buffer (as done in register)
  const descriptorBuffer = Buffer.from(
    new Float32Array(original).buffer
  );
  
  // 2. Encrypt & Decrypt
  const { encrypted, iv, authTag } = encrypt(descriptorBuffer);
  const decrypted = decrypt(encrypted, iv, authTag);
  
  // 3. Convert back to Float32Array (as done in recognize)
  const arrayBuffer = decrypted.buffer.slice(
    decrypted.byteOffset,
    decrypted.byteOffset + decrypted.byteLength
  );
  const storedDescriptor = new Float32Array(arrayBuffer);
  
  // 4. Compare values
  let diffCount = 0;
  for (let i = 0; i < 128; i++) {
    const diff = Math.abs(original[i] - storedDescriptor[i]);
    if (diff > 0.0001) {
      console.error(`Mismatch at index ${i}: original=${original[i]}, stored=${storedDescriptor[i]}`);
      diffCount++;
    }
  }
  
  if (diffCount === 0) {
    console.log("SUCCESS: Float32Array <-> Buffer conversion works perfectly and is lossless!");
  } else {
    console.error(`FAILURE: Found ${diffCount} mismatches in conversion!`);
  }
}

testConversion();

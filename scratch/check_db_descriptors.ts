import { db } from '../backend/src/shared/database/knex';
import { decrypt } from '../backend/src/shared/utils/encryption';

async function checkDbDescriptors() {
  try {
    const records = await db('facial_descriptors as fd')
      .join('students as s', 'fd.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .select('fd.*', 'u.name');

    console.log(`Found ${records.length} biometric records in database:\n`);

    for (const r of records) {
      console.log(`Student: ${r.name} (ID: ${r.student_id})`);
      console.log(`Consent given by: ${r.consent_given_by}, at: ${r.consent_given_at}`);
      try {
        const decrypted = decrypt(
          Buffer.from(r.descriptor_encrypted, 'hex'),
          Buffer.from(r.iv, 'hex'),
          Buffer.from(r.auth_tag, 'hex')
        );

        console.log(`  Decryption: SUCCESS, decrypted size = ${decrypted.length} bytes`);

        const arrayBuffer = decrypted.buffer.slice(
          decrypted.byteOffset,
          decrypted.byteOffset + decrypted.byteLength
        );
        const storedDescriptor = new Float32Array(arrayBuffer);
        
        console.log(`  Descriptor values count: ${storedDescriptor.length}`);
        
        // Check for NaN or infinity values
        let nanCount = 0;
        let nullCount = 0;
        for (let i = 0; i < storedDescriptor.length; i++) {
          if (isNaN(storedDescriptor[i])) nanCount++;
          if (storedDescriptor[i] === 0) nullCount++;
        }
        
        console.log(`  NaN elements: ${nanCount}`);
        console.log(`  Zero elements: ${nullCount}`);
        console.log(`  First 5 values:`, Array.from(storedDescriptor.slice(0, 5)));

      } catch (err: any) {
        console.error(`  Decryption: FAILED! Error: ${err.message}`);
      }
      console.log('--------------------------------------------------');
    }
  } catch (err: any) {
    console.error("Error reading database:", err.message);
  } finally {
    await db.destroy();
  }
}

checkDbDescriptors();

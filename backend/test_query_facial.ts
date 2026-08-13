import { db } from './src/shared/database/knex';

async function checkFacialDescriptors() {
  try {
    const descriptors = await db('facial_descriptors');
    console.log(`Total facial descriptors stored: ${descriptors.length}`);
    for (const d of descriptors) {
      console.log(`ID: ${d.id}, Student ID: ${d.student_id}, iv: ${d.iv ? 'present' : 'missing'}, auth_tag: ${d.auth_tag ? 'present' : 'missing'}, Encrypted Len: ${d.descriptor_encrypted?.length || 0}`);
    }
  } catch (err: any) {
    console.error("Error querying facial_descriptors:", err.message);
  } finally {
    await db.destroy();
  }
}

checkFacialDescriptors();

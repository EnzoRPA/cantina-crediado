import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: 'postgresql://neondb_owner:npg_ExBOajTnw2L8@ep-silent-cloud-awemy22w-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

async function main() {
  try {
    console.log('Connecting to Neon database...');
    await db.raw('SELECT 1');
    console.log('✅ Connected to Neon database successfully!');

    // 1. Get counts
    const schoolsCount = await db('schools').count('* as count').first();
    const usersCount = await db('users').count('* as count').first();
    const studentsCount = await db('students').count('* as count').first();
    const descriptorsCount = await db('facial_descriptors').count('* as count').first();

    console.log('\n--- DATABASE STATS ---');
    console.log('Schools:', schoolsCount?.count);
    console.log('Users:', usersCount?.count);
    console.log('Students:', studentsCount?.count);
    console.log('Facial Descriptors:', descriptorsCount?.count);

    // 2. Print students and active descriptors details
    console.log('\n--- DETAILED REGISTERED FACIAL DESCRIPTORS ---');
    const descriptors = await db('facial_descriptors as fd')
      .join('students as s', 'fd.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .select('fd.id', 's.id as student_id', 'u.name', 's.enrollment_number', 's.school_id', 'fd.created_at');
    
    console.log(JSON.stringify(descriptors, null, 2));

    // 3. Print schools list
    console.log('\n--- SCHOOLS ---');
    const schools = await db('schools').select('id', 'name');
    console.log(JSON.stringify(schools, null, 2));

  } catch (err: any) {
    console.error('❌ Error executing script:', err.message, err.stack);
  } finally {
    await db.destroy();
  }
}

main();

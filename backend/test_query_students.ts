import { db } from './src/shared/database/knex';

async function checkStudents() {
  try {
    const students = await db('students as s')
      .join('users as u', 's.user_id', 'u.id')
      .select('s.id', 'u.name', 's.school_id', 's.is_active', 's.enrollment_number');
    
    console.log(`Total students in DB: ${students.length}`);
    for (const s of students) {
      const hasFacial = await db('facial_descriptors').where({ student_id: s.id }).first();
      console.log(`Student: ${s.name}, ID: ${s.id}, School ID: ${s.school_id}, Is Active: ${s.is_active} (${typeof s.is_active}), Enrollment: ${s.enrollment_number}, Has Facial: ${hasFacial ? 'YES' : 'NO'}`);
    }

    const schools = await db('schools');
    console.log("\nSchools in DB:");
    for (const sc of schools) {
      console.log(`School: ${sc.name}, ID: ${sc.id}`);
    }

    const users = await db('users');
    console.log("\nUsers (for school_id check):");
    for (const usr of users) {
      console.log(`User: ${usr.name}, Role: ${usr.role}, School ID: ${usr.school_id}`);
    }

  } catch (err: any) {
    console.error("Error querying students/schools:", err.message);
  } finally {
    await db.destroy();
  }
}

checkStudents();

import { db } from './src/shared/database/knex';
import { facialService } from './src/modules/facial/facial.service';

async function testFacialE2E() {
  try {
    // 1. Get an active student
    const student = await db('students').where({ is_active: true }).first();
    if (!student) {
      console.log("No active student found in database to run E2E test!");
      return;
    }
    console.log(`Testing with student: ID=${student.id}, SchoolID=${student.school_id}`);

    // 2. Generate a random 128-dimensional descriptor
    const originalDescriptor = Array.from({ length: 128 }, () => Math.random());

    // 3. Register the descriptor
    console.log("Registering descriptor...");
    const regResult = await facialService.register(student.school_id, {
      studentId: student.id,
      descriptor: originalDescriptor,
    });
    console.log("Registration result:", regResult);

    // 4. Run recognition using the exact same descriptor
    console.log("Running recognition...");
    const recogResult = await facialService.recognize(student.school_id, {
      descriptor: originalDescriptor,
      threshold: 0.70,
      maxResults: 1
    });

    console.log("Recognition result matches:", recogResult.matches);
    if (recogResult.matches.length > 0 && recogResult.matches[0].studentId === student.id) {
      console.log("SUCCESS: Backend E2E recognition logic works perfectly! Distance was:", recogResult.matches[0].distance);
    } else {
      console.log("FAILURE: Descriptor not recognized or mismatched!");
    }

  } catch (err: any) {
    console.error("E2E Test failed with error:", err.message, err.stack);
  } finally {
    await db.destroy();
  }
}

testFacialE2E();

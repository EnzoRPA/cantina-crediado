import { db } from '../backend/src/shared/database/knex';
import { PosService } from '../backend/src/modules/pos/pos.service';

async function testManual() {
  try {
    const posService = new PosService();
    const student = await db('students').first();
    console.log('Testing manual credit launch for student:', student.id);

    const result = await posService.createManualOnCreditDebt(
      student.school_id,
      'b0000000-0000-0000-0000-000000000001',
      {
        studentId: student.id,
        amount: 10,
        description: 'Teste Lançamento Manual'
      }
    );

    console.log('✅ Success! Result:', result);
  } catch (err) {
    console.error('❌ Error in createManualOnCreditDebt:', err);
  } finally {
    await db.destroy();
  }
}

testManual();

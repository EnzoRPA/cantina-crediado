import { db } from './src/shared/database/knex';
import { paymentsService } from './src/modules/payments/payments.service';

async function testInfinitePayWebhook() {
  try {
    console.log("Starting InfinitePay webhook mock test...");
    
    // Find a student first
    const student = await db('students').first();
    if (!student) {
      console.log("No student found!");
      return;
    }
    
    const txId = crypto.randomUUID();
    await db('transactions').insert({
      id: txId,
      school_id: student.school_id,
      student_id: student.id,
      total_amount: 10.00,
      final_amount: 10.00,
      status: 'pending',
      notes: 'Pix Fiado',
    });
    
    await db('transaction_payments').insert({
      id: crypto.randomUUID(),
      transaction_id: txId,
      payment_method: 'pix',
      amount: 10.00,
      status: 'pending',
    });
    
    console.log(`Testing with newly created transaction: ID=${txId}`);
    
    // Call the webhook handler directly
    await paymentsService.handleInfinitePayWebhook({
      order_nsu: txId,
      status: 'approved',
      transaction_nsu: 'inf-test-nsu-12345',
      slug: 'inf-test-slug-abc',
      capture_method: 'pix'
    });
    
    // Check if status changed
    const updatedTx = await db('transactions').where({ id: txId }).first();
    const updatedPayment = await db('transaction_payments').where({ transaction_id: txId }).first();
    
    console.log(`Updated transaction status: ${updatedTx.status} (Expected: completed)`);
    console.log(`Updated payment status: ${updatedPayment.status} (Expected: approved)`);
    console.log(`Updated payment external_id: ${updatedPayment.external_id} (Expected: inf-test-nsu-12345)`);
    
    if (updatedTx.status === 'completed' && updatedPayment.status === 'approved') {
      console.log("\n✅ SUCCESS: Webhook processing completed successfully!");
    } else {
      console.error("\n❌ FAILURE: Webhook did not update statuses correctly");
    }
    
    // Cleanup test data
    await db('transaction_payments').where({ transaction_id: txId }).del();
    await db('transactions').where({ id: txId }).del();
    console.log("Cleanup finished.");
    
  } catch (err: any) {
    console.error("Test error:", err);
  } finally {
    await db.destroy();
  }
}

testInfinitePayWebhook();

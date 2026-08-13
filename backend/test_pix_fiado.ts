import { db } from './src/shared/database/knex';
import { posService } from './src/modules/pos/pos.service';
import { paymentsService } from './src/modules/payments/payments.service';

async function testPixFiado() {
  try {
    console.log("Starting Pix Fiado E2E test...");
    
    // 1. Get an active student and ensure they have guardian details
    let student = await db('students').where({ is_active: true }).first();
    if (!student) {
      console.log("No student found!");
      return;
    }
    
    // Temporarily update student's guardian info for test validation
    await db('students')
      .where({ id: student.id })
      .update({
        guardian_name: 'POLLYANNA AVELINO VERZARO',
        guardian_phone: '11999999999',
      });
      
    student = await db('students').where({ id: student.id }).first();
    console.log(`Testing with student: Name=${student.guardian_name}, Phone=${student.guardian_phone}`);

    // Get an active product
    const product = await db('products').where({ is_active: true }).where('current_stock', '>', 1).first();
    if (!product) {
      console.log("No active product found!");
      return;
    }

    // Get an open cash register
    let register = await db('cash_registers').where({ status: 'open' }).first();
    if (!register) {
      // Open one for operator
      const user = await db('users').where({ role: 'admin' }).first();
      if (!user) {
        console.log("No admin user found!");
        return;
      }
      console.log("Opening a cash register...");
      register = await posService.openCashRegister(student.school_id, user.id, {
        openingBalance: 100,
        terminalName: 'Test-Terminal',
      });
    }

    // 2. Create the Pix Fiado transaction
    console.log("Creating transaction under 'Pix Fiado'...");
    const tx = await posService.createTransaction(student.school_id, register.operator_id, {
      studentId: student.id,
      identificationMethod: 'manual',
      items: [{
        productId: product.id,
        quantity: 1,
      }],
      payments: [{
        paymentMethod: 'pix',
        amount: Number(product.sale_price),
      }],
      notes: 'Pix Fiado',
      discountAmount: 0,
      isOffline: false,
    });

    console.log("Created Transaction Details:");
    console.log(`- ID: ${tx.id}`);
    console.log(`- Status: ${tx.status} (Expected: pending)`);
    console.log(`- Notes: ${tx.notes}`);
    console.log(`- Guardian Name: ${tx.guardian_name}`);
    console.log(`- Guardian Phone: ${tx.guardian_phone}`);

    if (tx.status !== 'pending') {
      throw new Error(`Invalid transaction initial status: ${tx.status}, expected pending`);
    }
    if (tx.guardian_name !== 'POLLYANNA AVELINO VERZARO' || tx.guardian_phone !== '11999999999') {
      throw new Error("Guardian details were not returned in getTransactionDetails");
    }

    // 3. Generate the static Pix code
    console.log("\nGenerating Pix QR code...");
    const pix = await paymentsService.createPix(student.school_id, {
      transactionId: tx.id,
      amount: Number(product.sale_price),
    });

    console.log("Generated Pix Details:");
    console.log(`- QR Code: ${pix.qr_code.slice(0, 60)}...`);
    console.log(`- Has Base64 QR Image: ${!!pix.qr_code_base64}`);
    console.log(`- Status: ${pix.status}`);

    if (!pix.qr_code.startsWith('000201')) {
      throw new Error(`Pix code does not match EMV standard: ${pix.qr_code}`);
    }
    if (!pix.qr_code.includes('00447591347')) {
      throw new Error("Pix code does not contain the key 00447591347");
    }

    // 4. Manually approve payment
    console.log("\nApproving payment manually...");
    await paymentsService.approvePaymentManually(student.school_id, tx.id);

    // Verify transaction is now completed
    const updatedTx = await posService.getTransaction(student.school_id, tx.id);
    console.log(`- Updated Transaction Status: ${updatedTx.status} (Expected: completed)`);
    console.log(`- Updated Payment Status: ${updatedTx.payments[0].status} (Expected: approved)`);

    if (updatedTx.status !== 'completed') {
      throw new Error(`Transaction status is not completed: ${updatedTx.status}`);
    }
    if (updatedTx.payments[0].status !== 'approved') {
      throw new Error(`Payment status is not approved: ${updatedTx.payments[0].status}`);
    }

    console.log("\n✅ SUCCESS: Pix Fiado flow works perfectly from end to end!");

  } catch (err: any) {
    console.error("❌ E2E test failed with error:", err.message, err.stack);
  } finally {
    await db.destroy();
  }
}

testPixFiado();

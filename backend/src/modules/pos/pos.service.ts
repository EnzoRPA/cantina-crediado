import { v4 as uuidv4 } from 'uuid';
import { db } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import type { PaginatedResult } from '../../shared/types';
import type {
  OpenCashRegisterInput,
  CloseCashRegisterInput,
  CashRegisterMovementInput,
  CreateTransactionInput,
  CancelTransactionInput,
  ListTransactionsQuery,
} from './pos.schema';

export class PosService {
  // ==============================
  //   Cash Register Operations
  // ==============================

  /**
   * Open a cash register for the operator.
   */
  async openCashRegister(
    schoolId: string,
    operatorId: string,
    input: OpenCashRegisterInput
  ): Promise<Record<string, any>> {
    // Check if operator already has an open register
    const existing = await db('cash_registers')
      .where({ school_id: schoolId, operator_id: operatorId, status: 'open' })
      .first();

    if (existing) {
      throw Errors.conflict('Já existe um caixa aberto para este operador');
    }

    const [register] = await db('cash_registers')
      .insert({
        school_id: schoolId,
        operator_id: operatorId,
        terminal_name: input.terminalName || `Terminal-${Date.now()}`,
        opening_balance: input.openingBalance,
        status: 'open',
      })
      .returning('*');

    logger.info({ registerId: register.id, operatorId }, 'Cash register opened');
    return register;
  }

  /**
   * Close the operator's current cash register or a specific open register.
   */
  async closeCashRegister(
    schoolId: string,
    operatorId: string,
    input: CloseCashRegisterInput & { registerId?: string; operatorId?: string }
  ): Promise<Record<string, any>> {
    let register;

    if (input.registerId) {
      register = await db('cash_registers')
        .where({ id: input.registerId, school_id: schoolId, status: 'open' })
        .first();
    } else if (input.operatorId) {
      register = await db('cash_registers')
        .where({ school_id: schoolId, operator_id: input.operatorId, status: 'open' })
        .first();
    } else {
      register = await db('cash_registers')
        .where({ school_id: schoolId, operator_id: operatorId, status: 'open' })
        .first();

      if (!register) {
        register = await db('cash_registers')
          .where({ school_id: schoolId, status: 'open' })
          .orderBy('opened_at', 'desc')
          .first();
      }
    }

    if (!register) {
      throw Errors.notFound('Nenhum caixa aberto encontrado para fechamento');
    }

    // Calculate closing balance
    const movements = await db('cash_register_movements')
      .where({ cash_register_id: register.id })
      .select('type', 'amount', 'payment_method');

    let closingBalance = Number(register.opening_balance);

    for (const mov of movements) {
      const amount = Number(mov.amount);
      if (mov.type === 'sale' || mov.type === 'suprimento') {
        // Only cash sales count toward physical balance
        if (mov.type === 'sale' && mov.payment_method !== 'cash') continue;
        closingBalance += amount;
      } else if (mov.type === 'refund' || mov.type === 'sangria') {
        closingBalance -= amount;
      }
    }

    const [closed] = await db('cash_registers')
      .where({ id: register.id })
      .update({
        status: 'closed',
        closing_balance: closingBalance,
        closed_at: new Date(),
        notes: input.notes || null,
      })
      .returning('*');

    logger.info({ registerId: register.id, closingBalance }, 'Cash register closed');
    return closed;
  }

  /**
   * Get the operator's current open cash register or active open register.
   */
  async getCurrentRegister(schoolId: string, operatorId: string): Promise<Record<string, any>> {
    let register = await db('cash_registers as cr')
      .leftJoin('users as u', 'cr.operator_id', 'u.id')
      .where({ 'cr.school_id': schoolId, 'cr.operator_id': operatorId, 'cr.status': 'open' })
      .select('cr.*', 'u.name as operator_name', 'u.email as operator_email')
      .first();

    if (!register) {
      register = await db('cash_registers as cr')
        .leftJoin('users as u', 'cr.operator_id', 'u.id')
        .where({ 'cr.school_id': schoolId, 'cr.status': 'open' })
        .select('cr.*', 'u.name as operator_name', 'u.email as operator_email')
        .orderBy('cr.opened_at', 'desc')
        .first();
    }

    if (!register) {
      throw Errors.notFound('Nenhum caixa aberto encontrado');
    }

    // Get movement summary
    const summary = await db('cash_register_movements')
      .where({ cash_register_id: register.id })
      .select('type')
      .sum('amount as total')
      .count('* as count')
      .groupBy('type');

    return { ...register, summary };
  }

  /**
   * Add a sangria or suprimento to the cash register.
   */
  async addCashRegisterMovement(
    schoolId: string,
    operatorId: string,
    input: CashRegisterMovementInput
  ): Promise<Record<string, any>> {
    const register = await db('cash_registers')
      .where({ school_id: schoolId, operator_id: operatorId, status: 'open' })
      .first();

    if (!register) {
      throw Errors.notFound('Caixa aberto');
    }

    const [movement] = await db('cash_register_movements')
      .insert({
        cash_register_id: register.id,
        type: input.type,
        amount: input.amount,
        payment_method: 'cash',
        description: input.description,
      })
      .returning('*');

    logger.info({ registerId: register.id, type: input.type, amount: input.amount }, 'Cash register movement');
    return movement;
  }

  // ==============================
  //   Transaction Operations
  // ==============================

  /**
   * Create a sale transaction.
   * This is the core POS operation — atomic transaction with:
   * - Product price snapshot + stock decrement
   * - Multiple payment methods
   * - Daily limits check
   * - Student balance deduction (if school_balance)
   */
  async createTransaction(
    schoolId: string,
    operatorId: string,
    input: CreateTransactionInput
  ): Promise<Record<string, any>> {
    return db.transaction(async (trx) => {
      // 1. Verify open cash register
      const register = await trx('cash_registers')
        .where({ school_id: schoolId, operator_id: operatorId, status: 'open' })
        .first();

      if (!register) {
        throw Errors.badRequest('Nenhum caixa aberto. Abra o caixa antes de registrar vendas.');
      }

      // 2. Check for duplicate offline transaction
      if (input.offlineId) {
        const existing = await trx('transactions')
          .where({ offline_id: input.offlineId })
          .first();
        if (existing) {
          // Idempotent: return the existing transaction
          return this.getTransactionDetails(trx, existing.id);
        }
      }

      // 3. Resolve products and calculate totals
      const hasOnCredit = input.payments.some(p => p.paymentMethod === 'on_credit');
      if (hasOnCredit && !input.studentId) {
        throw Errors.badRequest('Vendas a prazo exigem a identificação do aluno');
      }

      let totalAmount = 0;
      const resolvedItems: any[] = [];

      for (const item of input.items) {
        if (item.productId.startsWith('custom') || item.productId === 'custom') {
          const unitPrice = Number(item.unitPrice || 0);
          if (unitPrice <= 0) {
            throw Errors.badRequest('Valor avulso deve ser maior que zero');
          }
          const itemTotal = unitPrice * item.quantity;
          totalAmount += itemTotal;
          resolvedItems.push({
            product_id: null,
            product_name: item.name || 'Valor Avulso',
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: itemTotal,
          });
          continue;
        }

        const product = await trx('products')
          .where({ id: item.productId, school_id: schoolId })
          .forUpdate()
          .first();

        if (!product) {
          throw Errors.notFound(`Produto ${item.productId}`);
        }

        if (!product.is_active) {
          throw Errors.badRequest(`Produto "${product.name}" está inativo`);
        }

        // Check stock
        if (product.control_stock && product.current_stock < item.quantity) {
          throw Errors.badRequest(
            `Estoque insuficiente para "${product.name}". Disponível: ${product.current_stock} ${product.unit}`
          );
        }

        // Compute effective price (check promotion)
        let unitPrice = Number(product.sale_price);
        if (
          product.is_promotional &&
          product.promotional_price &&
          product.promotion_start &&
          product.promotion_end
        ) {
          const now = new Date();
          if (now >= new Date(product.promotion_start) && now <= new Date(product.promotion_end)) {
            unitPrice = Number(product.promotional_price);
          }
        }

        const itemTotal = unitPrice * item.quantity;
        totalAmount += itemTotal;

        resolvedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: itemTotal,
        });

        // Decrement stock (only if control_stock is enabled)
        if (product.control_stock) {
          await trx('products')
            .where({ id: product.id })
            .update({
              current_stock: product.current_stock - item.quantity,
              updated_at: new Date(),
            });

          // Record stock movement
          await trx('stock_movements').insert({
            product_id: product.id,
            school_id: schoolId,
            type: 'out',
            quantity: item.quantity,
            reason: 'Venda PDV',
            created_by: operatorId,
          });
        }
      }

      // 4. Apply discount
      const discountAmount = input.discountAmount || 0;
      const finalAmount = totalAmount - discountAmount;

      if (finalAmount < 0) {
        throw Errors.badRequest('Desconto não pode exceder o valor total');
      }

      // 5. Validate payments sum
      const paymentsSum = input.payments.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(paymentsSum - finalAmount) > 0.01) {
        throw Errors.badRequest(
          `Soma dos pagamentos (R$ ${paymentsSum.toFixed(2)}) difere do total (R$ ${finalAmount.toFixed(2)})`
        );
      }

      // 6. Check daily limits if student is identified
      if (input.studentId) {
        const limits = await trx('daily_limits')
          .where({ student_id: input.studentId })
          .first();

        if (limits) {
          if (limits.is_purchase_blocked) {
            throw Errors.badRequest('Compras bloqueadas pelo responsável');
          }

          // Time window check
          if (limits.allowed_start_time && limits.allowed_end_time) {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            if (currentTime < limits.allowed_start_time || currentTime > limits.allowed_end_time) {
              throw Errors.badRequest(
                `Compras permitidas somente entre ${limits.allowed_start_time} e ${limits.allowed_end_time}`
              );
            }
          }

          // Daily amount check
          if (limits.max_daily_amount) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todaySpent = await trx('transactions')
              .where({ student_id: input.studentId, school_id: schoolId, status: 'completed' })
              .where('created_at', '>=', today)
              .sum('final_amount as total')
              .first();

            const spentSoFar = Number(todaySpent?.total || 0);
            if (spentSoFar + finalAmount > Number(limits.max_daily_amount)) {
              const remaining = Number(limits.max_daily_amount) - spentSoFar;
              throw Errors.badRequest(
                `Limite diário excedido. Restante: R$ ${Math.max(0, remaining).toFixed(2)}`
              );
            }
          }

          // Blocked product check
          if (limits.blocked_product_ids?.length > 0) {
            const blocked = resolvedItems.filter(
              (item) => limits.blocked_product_ids.includes(item.product_id)
            );
            if (blocked.length > 0) {
              throw Errors.badRequest(
                `Produto(s) bloqueado(s): ${blocked.map((b: any) => b.product_name).join(', ')}`
              );
            }
          }
        }
      }

      // Determine initial transaction status
      const isPixFiado = input.notes === 'Pix Fiado' && input.payments.some(p => p.paymentMethod === 'pix');
      const initialStatus = isPixFiado ? 'pending' : 'completed';

      // 7. Create transaction record
      const transactionId = uuidv4();
      const [transaction] = await trx('transactions')
        .insert({
          id: transactionId,
          school_id: schoolId,
          student_id: input.studentId || null,
          cash_register_id: register.id,
          operator_id: operatorId,
          total_amount: totalAmount,
          discount_amount: discountAmount,
          final_amount: finalAmount,
          status: initialStatus,
          identification_method: input.identificationMethod || null,
          is_offline: input.isOffline,
          offline_id: input.offlineId || null,
          sync_status: input.isOffline ? 'synced' : 'synced',
          notes: input.notes || null,
        })
        .returning('*');

      // 8. Insert transaction items
      for (const item of resolvedItems) {
        await trx('transaction_items').insert({
          id: uuidv4(),
          transaction_id: transactionId,
          ...item,
        });
      }

      // 9. Insert transaction payments + handle school_balance
      for (const payment of input.payments) {
        await trx('transaction_payments').insert({
          id: uuidv4(),
          transaction_id: transactionId,
          payment_method: payment.paymentMethod,
          amount: payment.amount,
          status: (payment.paymentMethod === 'pix' || payment.paymentMethod === 'on_credit') ? 'pending' : 'approved',
        });

        // Deduct from student balance if school_balance
        if (payment.paymentMethod === 'school_balance' && input.studentId) {
          const student = await trx('students')
            .where({ id: input.studentId })
            .forUpdate()
            .first();

          if (!student || Number(student.balance) < payment.amount) {
            throw Errors.badRequest(
              `Saldo insuficiente. Saldo atual: R$ ${Number(student?.balance || 0).toFixed(2)}`
            );
          }

          await trx('students')
            .where({ id: input.studentId })
            .update({
              balance: Number(student.balance) - payment.amount,
              updated_at: new Date(),
            });
        }

        // Automatic rule: If on_credit payment method, ensure student's billing_type is set to 'crediario'
        if (payment.paymentMethod === 'on_credit' && input.studentId) {
          await trx('students')
            .where({ id: input.studentId, school_id: schoolId })
            .update({ billing_type: 'crediario' });
        }

        // Record cash register movement
        await trx('cash_register_movements').insert({
          id: uuidv4(),
          cash_register_id: register.id,
          type: 'sale',
          amount: payment.amount,
          payment_method: payment.paymentMethod,
          description: `Venda #${transactionId.slice(0, 8)}`,
        });
      }

      logger.info(
        {
          transactionId,
          items: resolvedItems.length,
          finalAmount,
          operatorId,
          studentId: input.studentId,
        },
        'Transaction created'
      );

      return this.getTransactionDetails(trx, transactionId);
    });
  }

  /**
   * Get full transaction details with items and payments.
   */
  private async getTransactionDetails(trxOrDb: any, transactionId: string): Promise<Record<string, any>> {
    const transaction = await trxOrDb('transactions as t')
      .leftJoin('users as op', 't.operator_id', 'op.id')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as su', 's.user_id', 'su.id')
      .where('t.id', transactionId)
      .select(
        't.*',
        'op.name as operator_name',
        'su.name as student_name',
        's.enrollment_number',
        's.guardian_name',
        's.guardian_phone'
      )
      .first();

    if (!transaction) throw Errors.notFound('Transação');

    const items = await trxOrDb('transaction_items')
      .where({ transaction_id: transactionId });

    const payments = await trxOrDb('transaction_payments')
      .where({ transaction_id: transactionId });

    return { ...transaction, items, payments };
  }

  /**
   * Cancel a transaction and restore stock + balance.
   */
  async cancelTransaction(
    schoolId: string,
    transactionId: string,
    input: CancelTransactionInput,
    operatorId: string
  ): Promise<Record<string, any>> {
    return db.transaction(async (trx) => {
      const transaction = await trx('transactions')
        .where({ id: transactionId, school_id: schoolId })
        .forUpdate()
        .first();

      if (!transaction) throw Errors.notFound('Transação');

      if (transaction.status !== 'completed' && transaction.status !== 'pending') {
        throw Errors.badRequest(`Não é possível cancelar transação com status "${transaction.status}"`);
      }

      // Restore stock (only if control_stock is enabled)
      const items = await trx('transaction_items')
        .where({ transaction_id: transactionId });

      for (const item of items) {
        const product = await trx('products')
          .where({ id: item.product_id })
          .first();

        if (product && product.control_stock) {
          await trx('products')
            .where({ id: item.product_id })
            .increment('current_stock', item.quantity);

          await trx('stock_movements').insert({
            product_id: item.product_id,
            school_id: schoolId,
            type: 'in',
            quantity: item.quantity,
            reason: `Cancelamento venda #${transactionId.slice(0, 8)}`,
            reference_id: transactionId,
            created_by: operatorId,
          });
        }
      }

      // Restore student balance if school_balance was used
      if (transaction.student_id) {
        const balancePayments = await trx('transaction_payments')
          .where({ transaction_id: transactionId, payment_method: 'school_balance' });

        for (const payment of balancePayments) {
          await trx('students')
            .where({ id: transaction.student_id })
            .increment('balance', Number(payment.amount));
        }
      }

      // Record refund in cash register
      const register = await trx('cash_registers')
        .where({ id: transaction.cash_register_id })
        .first();

      if (register && register.status === 'open') {
        await trx('cash_register_movements').insert({
          cash_register_id: register.id,
          type: 'refund',
          amount: transaction.final_amount,
          description: `Cancelamento #${transactionId.slice(0, 8)}: ${input.reason}`,
        });
      }

      // Update transaction payments status
      await trx('transaction_payments')
        .where({ transaction_id: transactionId })
        .update({ status: 'failed' });

      // Update transaction status
      const [cancelled] = await trx('transactions')
        .where({ id: transactionId })
        .update({
          status: 'cancelled',
          notes: `${transaction.notes ? transaction.notes + ' | ' : ''}CANCELADO: ${input.reason}`,
          updated_at: new Date(),
        })
        .returning('*');

      logger.info({ transactionId, reason: input.reason, operatorId }, 'Transaction cancelled');

      return this.getTransactionDetails(trx, cancelled.id);
    });
  }

  /**
   * List transactions with pagination and filters.
   */
  async listTransactions(
    schoolId: string,
    query: ListTransactionsQuery
  ): Promise<PaginatedResult<any>> {
    const { page, limit, status, startDate, endDate, studentId } = query;
    const offset = (page - 1) * limit;

    let baseQuery = db('transactions as t')
      .leftJoin('users as op', 't.operator_id', 'op.id')
      .leftJoin('students as s', 't.student_id', 's.id')
      .leftJoin('users as su', 's.user_id', 'su.id')
      .where('t.school_id', schoolId);

    if (status) baseQuery = baseQuery.where('t.status', status);
    if (startDate) baseQuery = baseQuery.where('t.created_at', '>=', startDate);
    if (endDate) baseQuery = baseQuery.where('t.created_at', '<=', endDate);
    if (studentId) baseQuery = baseQuery.where('t.student_id', studentId);

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const data = await baseQuery
      .select(
        't.id', 't.total_amount', 't.discount_amount', 't.final_amount',
        't.status', 't.identification_method', 't.is_offline',
        't.created_at', 't.notes', 'op.name as operator_name',
        'su.name as student_name', 's.enrollment_number'
      )
      .orderBy('t.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    // Calculate global summary across all pages matching the filters
    let summaryQuery = db('transactions as t')
      .where('t.school_id', schoolId);

    if (startDate) summaryQuery = summaryQuery.where('t.created_at', '>=', startDate);
    if (endDate) summaryQuery = summaryQuery.where('t.created_at', '<=', endDate);
    if (studentId) summaryQuery = summaryQuery.where('t.student_id', studentId);

    const summaryRows = await summaryQuery
      .select('t.status', 't.identification_method', 't.notes', 't.final_amount');

    let pendingTotal = 0;
    let completedSalesTotal = 0;
    let rechargeTotal = 0;

    for (const r of summaryRows) {
      const amt = Number(r.final_amount || 0);
      if (r.status === 'pending') {
        pendingTotal += amt;
      } else if (r.status === 'completed') {
        const isRecharge = r.notes === 'Recarga Online PIX' ||
          r.identification_method === 'balance_adjustment' ||
          (r.identification_method === 'manual' && (r.notes?.toLowerCase().includes('ajuste') || r.notes?.toLowerCase().includes('saldo')));
        if (isRecharge) {
          rechargeTotal += amt;
        } else {
          completedSalesTotal += amt;
        }
      }
    }

    return {
      data,
      summary: {
        pendingTotal,
        completedSalesTotal,
        rechargeTotal,
        totalCount: total,
      },
      pagination: {
        page, limit, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get a single transaction with full details.
   */
  async getTransaction(schoolId: string, transactionId: string): Promise<Record<string, any>> {
    const transaction = await db('transactions')
      .where({ id: transactionId, school_id: schoolId })
      .first();

    if (!transaction) throw Errors.notFound('Transação');

    return this.getTransactionDetails(db, transactionId);
  }

  /**
   * Batch sync offline transactions.
   */
  async batchSync(
    schoolId: string,
    operatorId: string,
    transactions: CreateTransactionInput[]
  ): Promise<{ synced: number; conflicts: string[] }> {
    let synced = 0;
    const conflicts: string[] = [];

    for (const txInput of transactions) {
      try {
        await this.createTransaction(schoolId, operatorId, {
          ...txInput,
          isOffline: true,
        });
        synced++;
      } catch (error: any) {
        const offlineId = txInput.offlineId || 'unknown';
        logger.warn({ offlineId, error: error.message }, 'Batch sync conflict');
        conflicts.push(`${offlineId}: ${error.message}`);
      }
    }

    logger.info({ synced, conflicts: conflicts.length }, 'Batch sync completed');

    return { synced, conflicts };
  }

  /**
   * Get shift report for the current or a specific cash register.
   */
  async getShiftReport(schoolId: string, operatorId: string): Promise<Record<string, any>> {
    const register = await db('cash_registers')
      .where({ school_id: schoolId, operator_id: operatorId, status: 'open' })
      .first();

    if (!register) throw Errors.notFound('Caixa aberto');

    // Transaction summary
    const transactions = await db('transactions')
      .where({ cash_register_id: register.id })
      .select('status')
      .sum('final_amount as total')
      .count('* as count')
      .groupBy('status');

    // Payment method breakdown
    const paymentBreakdown = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .where({ 't.cash_register_id': register.id, 't.status': 'completed' })
      .select('tp.payment_method')
      .sum('tp.amount as total')
      .count('* as count')
      .groupBy('tp.payment_method');

    // Cash movements (sangria/suprimento)
    const cashMovements = await db('cash_register_movements')
      .where({ cash_register_id: register.id })
      .whereIn('type', ['sangria', 'suprimento'])
      .select('type')
      .sum('amount as total')
      .count('* as count')
      .groupBy('type');

    // Top products
    const topProducts = await db('transaction_items as ti')
      .join('transactions as t', 'ti.transaction_id', 't.id')
      .where({ 't.cash_register_id': register.id, 't.status': 'completed' })
      .select('ti.product_name')
      .sum('ti.quantity as total_quantity')
      .sum('ti.total_price as total_revenue')
      .groupBy('ti.product_name')
      .orderBy('total_quantity', 'desc')
      .limit(10);

    return {
      register,
      transactions,
      paymentBreakdown,
      cashMovements,
      topProducts,
    };
  }

  async listOnCreditDebts(schoolId: string) {
    // 1. Fetch pending on_credit debts per student
    const pendingDebts = await db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .join('students as s', 't.student_id', 's.id')
      .join('users as u', 's.user_id', 'u.id')
      .where({
        't.school_id': schoolId,
        'tp.payment_method': 'on_credit',
        'tp.status': 'pending'
      })
      .select(
        's.id as student_id',
        'u.name as student_name',
        's.grade',
        's.class_group',
        's.enrollment_number',
        's.balance',
        's.billing_type',
        's.guardian_name',
        's.guardian_phone',
        's.type'
      )
      .sum('tp.amount as total_debt')
      .max('t.created_at as last_purchase_at')
      .max('tp.amount as last_purchase_amount')
      .groupBy('s.id', 'u.name', 's.grade', 's.class_group', 's.enrollment_number', 's.balance', 's.billing_type', 's.guardian_name', 's.guardian_phone', 's.type')
      .orderBy('student_name', 'asc');

    // 2. Fetch ALL other active students registered in the school (so every student appears in search)
    const pendingStudentIds = pendingDebts.map(d => d.student_id);

    const creditOrPastStudents = await db('students as s')
      .join('users as u', 's.user_id', 'u.id')
      .where('s.school_id', schoolId)
      .where('s.is_active', true)
      .whereNotIn('s.id', pendingStudentIds.length > 0 ? pendingStudentIds : ['00000000-0000-0000-0000-000000000000'])
      .select(
        's.id as student_id',
        'u.name as student_name',
        's.grade',
        's.class_group',
        's.enrollment_number',
        's.balance',
        's.billing_type',
        's.guardian_name',
        's.guardian_phone',
        's.type'
      )
      .orderBy('u.name', 'asc');

    // 3. Fetch last on_credit transaction for students without pending debt
    const lastTxByStudent: Record<string, { last_purchase_at: string; last_purchase_amount: number }> = {};
    if (creditOrPastStudents.length > 0) {
      const creditStudentIds = creditOrPastStudents.map((s: any) => s.student_id);
      const lastTxRows = await db('transaction_payments as tp')
        .join('transactions as t', 'tp.transaction_id', 't.id')
        .whereIn('t.student_id', creditStudentIds)
        .where('tp.payment_method', 'on_credit')
        .select(
          't.student_id',
        )
        .max('t.created_at as last_purchase_at')
        .max('tp.amount as last_purchase_amount')
        .groupBy('t.student_id');
      for (const row of lastTxRows) {
        lastTxByStudent[row.student_id] = {
          last_purchase_at: row.last_purchase_at || '',
          last_purchase_amount: Number(row.last_purchase_amount || 0),
        };
      }
    }

    const mappedPending = pendingDebts.map(d => ({
      student_id: d.student_id,
      student_name: d.student_name,
      grade: d.grade || '',
      class_group: d.class_group || '',
      enrollment_number: d.enrollment_number || '',
      guardian_name: d.guardian_name || '',
      guardian_phone: d.guardian_phone || '',
      type: d.type || 'student',
      total_debt: Number(d.total_debt || 0),
      balance: Number(d.balance || 0),
      billing_type: d.billing_type === 'pix_direto' ? 'pix_direto' : (d.billing_type || 'crediario'),
      last_purchase_at: d.last_purchase_at || '',
      last_purchase_amount: Number(d.last_purchase_amount || 0),
    }));

    const mappedCredit = creditOrPastStudents.map((s: any) => {
      const lastTx = lastTxByStudent[s.student_id];
      return {
        student_id: s.student_id,
        student_name: s.student_name,
        grade: s.grade || '',
        class_group: s.class_group || '',
        enrollment_number: s.enrollment_number || '',
        guardian_name: s.guardian_name || '',
        guardian_phone: s.guardian_phone || '',
        type: s.type || 'student',
        total_debt: 0,
        balance: Number(s.balance || 0),
        billing_type: s.billing_type === 'crediario' ? 'crediario' : 'pix_direto',
        last_purchase_at: lastTx?.last_purchase_at || '',
        last_purchase_amount: lastTx?.last_purchase_amount || 0,
      };
    });

    const mappedDebts = [...mappedPending, ...mappedCredit].sort((a, b) => a.student_name.localeCompare(b.student_name));

    const todayStr = new Date().toISOString().split('T')[0];

    const [totalSoldRes, totalReceivedRes, todaySalesRes] = await Promise.all([
      db('transaction_payments as tp')
        .join('transactions as t', 'tp.transaction_id', 't.id')
        .where({ 't.school_id': schoolId, 'tp.payment_method': 'on_credit' })
        .sum('tp.amount as total')
        .first(),
      db('transactions as t')
        .where({ 't.school_id': schoolId, 't.status': 'completed' })
        .whereRaw("t.notes ILIKE 'Recebimento de Pagamento%'")
        .sum('t.final_amount as total')
        .first(),
      db('transaction_payments as tp')
        .join('transactions as t', 'tp.transaction_id', 't.id')
        .where({ 't.school_id': schoolId, 'tp.payment_method': 'on_credit' })
        .whereRaw("DATE(t.created_at) = ?", [todayStr])
        .sum('tp.amount as total')
        .first(),
    ]);

    const totalPending = mappedPending.reduce((sum, d) => sum + d.total_debt, 0);

    return {
      debts: mappedDebts,
      totals: {
        total_sold: Number(totalSoldRes?.total || 0),
        total_received: Number(totalReceivedRes?.total || 0),
        total_pending: totalPending,
        today_sales: Number(todaySalesRes?.total || 0),
      }
    };
  }

  async getStudentOnCreditDetails(schoolId: string, studentId: string) {
    // Scope student lookup to the school to avoid cross-school data leakage
    const studentRec = await db('students')
      .where(function() {
        this.where('id', studentId)
          .orWhere('user_id', studentId)
          .orWhere('enrollment_number', studentId);
      })
      .where('school_id', schoolId)
      .first();

    const idsToMatch = new Set<string>();
    idsToMatch.add(studentId);
    if (studentRec) {
      if (studentRec.id) idsToMatch.add(studentRec.id);
      if (studentRec.user_id) idsToMatch.add(studentRec.user_id);
    }

    const idsArray = Array.from(idsToMatch);

    logger.info({ schoolId, studentId, idsArray, foundStudent: !!studentRec }, '[getStudentOnCreditDetails] resolving IDs');

    const transactions = await db('transactions as t')
      .leftJoin('users as op', 'op.id', 't.operator_id')
      .where('t.school_id', schoolId)
      .whereIn('t.student_id', idsArray)
      .select(
        't.id',
        't.created_at',
        't.final_amount',
        't.status as tx_status',
        't.notes',
        'op.name as operator_name'
      )
      .orderBy('t.created_at', 'desc');

    logger.info({ txCount: transactions.length, idsArray }, '[getStudentOnCreditDetails] transactions found');

    const txIds = transactions.map(t => t.id);

    const [allPayments, allItems] = await Promise.all([
      txIds.length > 0
        ? db('transaction_payments')
            .whereIn('transaction_id', txIds)
            .select('transaction_id', 'payment_method', 'amount', 'status')
        : Promise.resolve([]),
      txIds.length > 0
        ? db('transaction_items')
            .whereIn('transaction_id', txIds)
            .select('transaction_id', 'product_name', 'quantity', 'unit_price', 'total_price')
        : Promise.resolve([]),
    ]);

    const paymentsByTxMap = new Map<string, any[]>();
    for (const p of allPayments) {
      if (!paymentsByTxMap.has(p.transaction_id)) paymentsByTxMap.set(p.transaction_id, []);
      paymentsByTxMap.get(p.transaction_id)!.push(p);
    }

    const itemsByTxMap = new Map<string, any[]>();
    for (const item of allItems) {
      if (!itemsByTxMap.has(item.transaction_id)) itemsByTxMap.set(item.transaction_id, []);
      itemsByTxMap.get(item.transaction_id)!.push(item);
    }

    const result = [];

    for (const tx of transactions) {
      const payments = paymentsByTxMap.get(tx.id) || [];
      const items = itemsByTxMap.get(tx.id) || [];

      const mainPayment = payments[0] || {};
      const onCreditPayment = payments.find(p => p.payment_method === 'on_credit');
      const isApproved = onCreditPayment ? onCreditPayment.status === 'approved' : payments.some(p => p.status === 'approved');
      const pMethod = onCreditPayment?.payment_method || mainPayment.payment_method || 'on_credit';

      // A transaction is a Payment / Receipt ($ Recebi) IF AND ONLY IF:
      // - Its notes or items explicitly start with "Recebimento", "Recarga", or "Abatimento"
      const isPaymentReceipt = Boolean(
        (tx.notes && /^Recebimento|^Recarga|^Abatimento/i.test(tx.notes.trim())) ||
        items.some(i => i.product_name && /^Recebimento|^Recarga|^Abatimento/i.test(i.product_name.trim()))
      );

      // For pending debts, use the exact current pending amount from onCreditPayment row
      const currentAmount = (onCreditPayment && onCreditPayment.status === 'pending')
        ? Number(onCreditPayment.amount)
        : Number(tx.final_amount || mainPayment.amount || 0);

      result.push({
        id: tx.id,
        created_at: tx.created_at,
        amount: currentAmount,
        original_amount: Number(tx.final_amount || 0),
        payment_status: isApproved ? 'approved' : 'pending',
        payment_method: pMethod,
        is_payment: isPaymentReceipt,
        type: isPaymentReceipt ? 'payment' : 'sale',
        notes: tx.notes,
        operator_name: tx.operator_name || 'Sistema',
        items: items.length > 0 ? items.map(i => ({
          product_name: i.product_name,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          total_price: Number(i.total_price)
        })) : [{
          product_name: tx.notes || 'Consumo do Aluno',
          quantity: 1,
          unit_price: Number(tx.final_amount || 0),
          total_price: Number(tx.final_amount || 0)
        }],
      });
    }

    // Use guardian_name/phone stored directly on students table
    // (guardians table only has id, user_id, cpf - name/phone are on the student record)
    const guardianRow = await db('students as s')
      .whereIn('s.id', idsArray.filter(id => {
        // only match actual UUIDs (student.id), not user_id values
        return studentRec ? id === studentRec.id : true;
      }))
      .select('s.guardian_name', 's.guardian_phone')
      .first();

    return {
      transactions: result,
      guardian: {
        guardian_name: guardianRow?.guardian_name || null,
        guardian_phone: guardianRow?.guardian_phone || null,
      }
    };
  }

  async getRecentConsumers(schoolId: string, startDate?: string, endDate?: string) {
    let startStr = startDate;
    let endStr = endDate || startDate;

    if (!startStr) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startStr = yesterday.toISOString().split('T')[0];
      endStr = startStr;
    }

    const startDateTime = `${startStr} 00:00:00`;
    const endDateTime = `${endStr} 23:59:59`;

    const consumers = await db('transactions as t')
      .join('students as s', 's.id', 't.student_id')
      .join('users as u', 'u.id', 's.user_id')
      .where('t.school_id', schoolId)
      .whereNotNull('t.student_id')
      .whereBetween('t.created_at', [startDateTime, endDateTime])
      .select(
        's.id as student_id',
        'u.name as student_name',
        's.grade',
        's.class_group',
        's.enrollment_number'
      )
      .sum('t.final_amount as yesterday_amount')
      .groupBy('s.id', 'u.name', 's.grade', 's.class_group', 's.enrollment_number')
      .orderBy('student_name', 'asc');

    return consumers.map(c => ({
      student_id: c.student_id,
      student_name: c.student_name,
      grade: c.grade,
      class_group: c.class_group,
      enrollment_number: c.enrollment_number,
      yesterday_amount: Number(c.yesterday_amount || 0)
    }));
  }

  async createBatchManualOnCredit(
    schoolId: string,
    operatorId: string,
    input: { date?: string; description?: string; items: Array<{ studentId: string; amount: number }> }
  ) {
    return db.transaction(async (trx) => {
      const txCreatedAt = input.date ? new Date(input.date + 'T12:00:00') : new Date();
      const description = input.description?.trim() || 'Consumo do Aluno';
      
      const studentIds = input.items.map(i => i.studentId);
      const students = await trx('students as s')
        .join('users as u', 's.user_id', 'u.id')
        .whereIn('s.id', studentIds)
        .where('s.school_id', schoolId)
        .select('s.id', 'u.name');

      const studentMap = new Map<string, string>();
      for (const s of students) {
        studentMap.set(s.id, s.name);
      }

      const txInserts: any[] = [];
      const paymentInserts: any[] = [];
      const itemInserts: any[] = [];
      let count = 0;

      for (const item of input.items) {
        if (!studentMap.has(item.studentId)) continue;

        const txId = uuidv4();
        const paymentId = uuidv4();
        const itemId = uuidv4();

        txInserts.push({
          id: txId,
          school_id: schoolId,
          operator_id: operatorId,
          student_id: item.studentId,
          total_amount: item.amount,
          discount_amount: 0,
          final_amount: item.amount,
          status: 'completed',
          notes: description,
          created_at: txCreatedAt,
          updated_at: txCreatedAt,
        });

        paymentInserts.push({
          id: paymentId,
          transaction_id: txId,
          payment_method: 'on_credit',
          amount: item.amount,
          status: 'pending',
          created_at: txCreatedAt,
        });

        itemInserts.push({
          id: itemId,
          transaction_id: txId,
          product_id: null,
          product_name: description,
          quantity: 1,
          unit_price: item.amount,
          total_price: item.amount,
          created_at: txCreatedAt,
        });

        count++;
      }

      if (txInserts.length > 0) {
        await trx('transactions').insert(txInserts);
        await trx('transaction_payments').insert(paymentInserts);
        await trx('transaction_items').insert(itemInserts);

        // Automatic rule: ensure all students in the batch are marked as crediario
        await trx('students')
          .whereIn('id', studentIds)
          .where('school_id', schoolId)
          .update({ billing_type: 'crediario' });
      }

      logger.info({ count, schoolId, operatorId }, 'Batch manual on-credit created');

      return { success: true, count };
    });
  }


  async settleStudentDebt(
    schoolId: string,
    studentId: string,
    paymentMethod: string,
    operatorId: string,
    partialAmount?: number,
    date?: string
  ) {
    return db.transaction(async (trx) => {
      // 1. Resolve all possible IDs for this student (id, user_id, enrollment_number)
      //    so we find debts regardless of which ID was used when the sale was made
      const studentRec = await trx('students')
        .where(function() {
          this.where('id', studentId)
            .orWhere('user_id', studentId)
            .orWhere('enrollment_number', studentId);
        })
        .where('school_id', schoolId)
        .first();

      const idsToMatch = new Set<string>();
      idsToMatch.add(studentId);
      if (studentRec) {
        if (studentRec.id) idsToMatch.add(studentRec.id);
        if (studentRec.user_id) idsToMatch.add(studentRec.user_id);
      }
      const idsArray = Array.from(idsToMatch);

      // 2. Fetch ALL pending on_credit payments for this student (any matching ID)
      const pendingPayments = await trx('transaction_payments as tp')
        .join('transactions as t', 'tp.transaction_id', 't.id')
        .where('t.school_id', schoolId)
        .whereIn('t.student_id', idsArray)
        .where({
          'tp.payment_method': 'on_credit',
          'tp.status': 'pending'
        })
        .select('tp.id', 'tp.amount', 't.id as transaction_id', 't.created_at')
        .orderBy('t.created_at', 'asc');

      const totalDebt = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const actualPaidAmount = (partialAmount && Number(partialAmount) > 0)
        ? Number(partialAmount)
        : totalDebt;

      if (actualPaidAmount <= 0) {
        throw Errors.badRequest('Informe um valor de recebimento válido maior que zero.');
      }

      // Fix: new Date("YYYY-MM-DD") = UTC midnight = dia anterior em UTC-3 (Brasil)
      // Solução: adicionar T12:00:00 para garantir meio-dia, sem risco de virar dia anterior
      const txCreatedAt = date
        ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date)
        : new Date();
      const methodLabel = paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'cash' ? 'Dinheiro' : 'Cartão';

      // 2. ALWAYS create an approved Payment Receipt transaction so it appears in Histórico under Pagamento (+)
      const receiptTxId = uuidv4();
      const receiptPaymentId = uuidv4();
      const receiptItemId = uuidv4();

      await trx('transactions').insert({
        id: receiptTxId,
        school_id: schoolId,
        operator_id: operatorId,
        student_id: studentId,
        total_amount: actualPaidAmount,
        discount_amount: 0,
        final_amount: actualPaidAmount,
        status: 'completed',
        notes: `Recebimento de Pagamento (${methodLabel})`,
        created_at: txCreatedAt,
        updated_at: txCreatedAt,
      });

      await trx('transaction_payments').insert({
        id: receiptPaymentId,
        transaction_id: receiptTxId,
        payment_method: paymentMethod,
        amount: actualPaidAmount,
        status: 'approved',
        created_at: txCreatedAt,
      });

      await trx('transaction_items').insert({
        id: receiptItemId,
        transaction_id: receiptTxId,
        product_id: null,
        product_name: `Recebimento / Abatimento (${methodLabel})`,
        quantity: 1,
        unit_price: actualPaidAmount,
        total_price: actualPaidAmount,
        created_at: txCreatedAt,
      });

      // 3. Abate pending debts starting from oldest
      let amountRemaining = actualPaidAmount;
      for (const p of pendingPayments) {
        if (amountRemaining <= 0) break;
        const pAmount = Number(p.amount);

        if (amountRemaining >= pAmount) {
          // Fully satisfy this debt payment (keep payment_method as on_credit so it remains a sale/fiado)
          await trx('transaction_payments')
            .where({ id: p.id })
            .update({
              status: 'approved',
            });

          const tx = await trx('transactions').where({ id: p.transaction_id }).first();
          const newNotes = tx?.notes ? `${tx.notes} | Pago via ${methodLabel}` : `Pago via ${methodLabel}`;

          await trx('transactions')
            .where({ id: p.transaction_id })
            .update({
              status: 'completed',
              notes: newNotes,
              updated_at: new Date()
            });

          amountRemaining -= pAmount;
        } else {
          // Partially abate this debt payment
          const newOnCreditAmount = pAmount - amountRemaining;
          await trx('transaction_payments')
            .where({ id: p.id })
            .update({
              amount: newOnCreditAmount
            });

          amountRemaining = 0;
        }
      }

      // 4. Overpayment / Surplus credit: if money remains after abating all debts, add as positive student balance!
      let creditAdded = 0;
      if (amountRemaining > 0) {
        creditAdded = amountRemaining;
        const realStudentId = studentRec?.id || studentId;
        await trx('students')
          .where({ id: realStudentId })
          .increment('balance', creditAdded);
      }

      // 5. Record cash register movement if a register is open
      const register = await trx('cash_registers')
        .where({ school_id: schoolId, operator_id: operatorId, status: 'open' })
        .first();

      if (register) {
        await trx('cash_register_movements').insert({
          cash_register_id: register.id,
          type: 'suprimento',
          amount: actualPaidAmount,
          description: `Recebimento Débito A Prazo/Adiantamento (${methodLabel})`,
        });
      }

      const remainingDebt = Math.max(0, totalDebt - actualPaidAmount);

      logger.info({ studentId, actualPaidAmount, creditAdded, remainingDebt, paymentMethod, operatorId }, 'On credit debt settled/abated successfully');

      return { success: true, totalSettled: actualPaidAmount, creditAdded, remainingDebt };
    });
  }

  async resetTestSales(schoolId: string, preserveStudentNames: string[] = ['Anna Julia', 'Alanna Xavier']) {
    return db.transaction(async (trx) => {
      // 1. Find student IDs to preserve by name
      let preserveStudentIds: string[] = [];
      if (preserveStudentNames.length > 0) {
        const studentsToPreserve = await trx('students')
          .where('school_id', schoolId)
          .where(function() {
            for (const name of preserveStudentNames) {
              this.orWhereRaw('LOWER(name) LIKE ?', [`%${name.toLowerCase()}%`]);
            }
          })
          .select('id');
        preserveStudentIds = studentsToPreserve.map(s => s.id);
      }

      // 2. Find transaction IDs to preserve
      let preserveTxIds: string[] = [];
      if (preserveStudentIds.length > 0) {
        const txsToPreserve = await trx('transactions')
          .where('school_id', schoolId)
          .whereIn('student_id', preserveStudentIds)
          .select('id');
        preserveTxIds = txsToPreserve.map(t => t.id);
      }

      // 3. Find all transactions for this school
      const allSchoolTxs = await trx('transactions')
        .where('school_id', schoolId)
        .select('id');
      const allSchoolTxIds = allSchoolTxs.map(t => t.id);

      // Determine transaction IDs to delete
      const txIdsToDelete = preserveTxIds.length > 0
        ? allSchoolTxIds.filter(id => !preserveTxIds.includes(id))
        : allSchoolTxIds;

      if (txIdsToDelete.length > 0) {
        // Delete payments, items, and transactions for non-preserved
        await trx('transaction_payments').whereIn('transaction_id', txIdsToDelete).delete();
        await trx('transaction_items').whereIn('transaction_id', txIdsToDelete).delete();
        await trx('transactions').whereIn('id', txIdsToDelete).delete();
      }

      // 4. Delete cash register movements and cash registers
      const registers = await trx('cash_registers')
        .where('school_id', schoolId)
        .select('id');
      const registerIds = registers.map(r => r.id);

      if (registerIds.length > 0) {
        await trx('cash_register_movements').whereIn('cash_register_id', registerIds).delete();
        await trx('cash_registers').whereIn('id', registerIds).delete();
      }

      // 5. Reset balances for non-preserved students
      const allStudents = await trx('students')
        .where('school_id', schoolId)
        .select('id');
      const allStudentIds = allStudents.map(s => s.id);
      const studentIdsToReset = preserveStudentIds.length > 0
        ? allStudentIds.filter(id => !preserveStudentIds.includes(id))
        : allStudentIds;

      if (studentIdsToReset.length > 0) {
        try {
          await trx('student_balance_transactions').whereIn('student_id', studentIdsToReset).delete();
        } catch (err) {
          // Table may not exist in all environments
        }
        await trx('students').whereIn('id', studentIdsToReset).update({ balance: 0 });
      }

      logger.info({ schoolId, preserveStudentIds, deletedTxs: txIdsToDelete.length }, 'Test sales reset successfully');

      return { message: 'Todas as vendas de teste foram apagadas com sucesso, mantendo as recargas reais das alunas Anna Julia Moura Abreu e Alanna Xavier Brandão.' };
    });
  }

  /**
   * Create a manual on-credit debt (fiado) for a student or employee.
   * Does NOT affect physical cash in the cash register.
   */
  async createManualOnCreditDebt(
    schoolId: string,
    operatorId: string,
    input: { studentId: string; amount: number; date?: string; description?: string }
  ) {
    return db.transaction(async (trx) => {
      // 1. Verify student exists
      const student = await trx('students as s')
        .join('users as u', 's.user_id', 'u.id')
        .where({ 's.id': input.studentId, 's.school_id': schoolId })
        .select('s.id', 'u.name')
        .first();

      if (!student) {
        throw Errors.notFound('Cliente (Aluno ou Funcionário)');
      }

      const txCreatedAt = input.date ? new Date(input.date) : new Date();
      const txId = uuidv4();
      const paymentId = uuidv4();
      const itemId = uuidv4();
      const description = input.description?.trim() || 'Consumo do Aluno';

      // 2. Create transaction record
      await trx('transactions').insert({
        id: txId,
        school_id: schoolId,
        operator_id: operatorId,
        student_id: student.id,
        total_amount: input.amount,
        discount_amount: 0,
        final_amount: input.amount,
        status: 'completed',
        notes: description,
        created_at: txCreatedAt,
        updated_at: txCreatedAt,
      });

      // 3. Create transaction_payments record for on_credit
      await trx('transaction_payments').insert({
        id: paymentId,
        transaction_id: txId,
        payment_method: 'on_credit',
        amount: input.amount,
        status: 'pending',
        created_at: txCreatedAt,
      });

      // 4. Create transaction_items record
      await trx('transaction_items').insert({
        id: itemId,
        transaction_id: txId,
        product_id: null,
        product_name: description,
        quantity: 1,
        unit_price: input.amount,
        total_price: input.amount,
        created_at: txCreatedAt,
      });

      // Automatic rule: ensure student's billing_type is set to 'crediario'
      await trx('students')
        .where({ id: student.id, school_id: schoolId })
        .update({ billing_type: 'crediario' });

      logger.info({ studentId: student.id, amount: input.amount, description }, 'Manual on-credit debt created');

      return {
        id: txId,
        studentId: student.id,
        studentName: student.name,
        amount: input.amount,
        createdAt: txCreatedAt,
      };
    });
  }

  /**
   * Update ANY transaction (amount, date, description). Works for both Vendi and Recebi!
   */
  async updateOnCreditTransaction(
    schoolId: string,
    transactionId: string,
    input: { amount?: number; date?: string; description?: string }
  ) {
    return db.transaction(async (trx) => {
      const tx = await trx('transactions')
        .where({
          id: transactionId,
          school_id: schoolId,
        })
        .first();

      if (!tx) {
        throw Errors.notFound('Lançamento não encontrado');
      }

      const updateTxData: any = { updated_at: new Date() };
      if (input.date) {
        updateTxData.created_at = new Date(input.date);
      }
      if (input.amount !== undefined) {
        updateTxData.total_amount = input.amount;
        updateTxData.final_amount = input.amount;
      }
      if (input.description !== undefined) {
        updateTxData.notes = input.description.trim();
      }

      await trx('transactions').where({ id: transactionId }).update(updateTxData);

      if (input.amount !== undefined || input.date) {
        const updatePaymentData: any = {};
        if (input.amount !== undefined) updatePaymentData.amount = input.amount;
        if (input.date) updatePaymentData.created_at = new Date(input.date);
        await trx('transaction_payments').where({ transaction_id: transactionId }).update(updatePaymentData);
      }

      const updateItemData: any = {};
      if (input.description !== undefined) updateItemData.product_name = input.description.trim();
      if (input.amount !== undefined) {
        updateItemData.unit_price = input.amount;
        updateItemData.total_price = input.amount;
      }
      if (input.date) updateItemData.created_at = new Date(input.date);

      if (Object.keys(updateItemData).length > 0) {
        await trx('transaction_items').where({ transaction_id: transactionId }).update(updateItemData);
      }

      logger.info({ transactionId, schoolId, input }, 'Transaction updated successfully');

      return { success: true, transactionId };
    });
  }

  /**
   * Delete / Cancel ANY transaction (both Vendi and Recebi).
   */
  async deleteOnCreditTransaction(schoolId: string, transactionId: string) {
    return db.transaction(async (trx) => {
      const tx = await trx('transactions')
        .where({
          id: transactionId,
          school_id: schoolId,
        })
        .first();

      if (!tx) {
        throw Errors.notFound('Lançamento não encontrado');
      }

      await trx('transaction_payments').where({ transaction_id: transactionId }).delete();
      await trx('transaction_items').where({ transaction_id: transactionId }).delete();
      await trx('transactions').where({ id: transactionId }).delete();

      logger.info({ transactionId, schoolId }, 'Transaction deleted successfully');

      return { success: true, transactionId };
    });
  }
}

export const posService = new PosService();

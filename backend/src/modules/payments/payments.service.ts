import { db } from '../../shared/database/knex';
import { Errors } from '../../shared/middlewares/error-handler';
import { logger } from '../../shared/utils/logger';
import { config } from '../../config';
import QRCode from 'qrcode';
import crypto from 'crypto';

function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    crc ^= (code << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function generateStaticPix(key: string, amount: number, merchantName: string, merchantCity: string, txid: string = '***'): string {
  const f = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  
  const gui = f('00', 'br.gov.bcb.pix');
  const pixKey = f('01', key);
  const merchantAccountInfo = f('26', gui + pixKey);
  
  let payload = '000201' + merchantAccountInfo;
  payload += '52040000'; // Category Code
  payload += '5303986';  // Currency Code (BRL)
  
  if (amount > 0) {
    payload += f('54', amount.toFixed(2));
  }
  
  payload += '5802BR'; // Country Code
  payload += f('59', merchantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 25)); // Merchant Name
  payload += f('60', merchantCity.toUpperCase().slice(0, 15)); // Merchant City
  
  const additionalData = f('05', txid);
  payload += f('62', additionalData);
  
  payload += '6304'; // CRC16 indicator
  
  const crc = calculateCRC16(payload);
  return payload + crc;
}
import type { PaginatedResult } from '../../shared/types';
import type {
  CreatePixInput,
  CreateCardPaymentInput,
  RechargeInput,
  PaymentHistoryQuery,
} from './payments.schema';

/**
 * Mercado Pago integration service.
 * Uses the REST API directly for maximum control.
 * In production, use the official SDK: `mercadopago`.
 */
export class PaymentsService {
  private baseUrl = 'https://api.mercadopago.com';

  private get headers() {
    return {
      Authorization: `Bearer ${config.mercadoPago.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a PIX QR code payment.
   */
  async createPix(schoolId: string, input: CreatePixInput): Promise<Record<string, any>> {
    // Verify transaction exists
    const transaction = await db('transactions')
      .where({ id: input.transactionId, school_id: schoolId })
      .first();

    if (!transaction) throw Errors.notFound('Transação');

    // Check if it is a "Pix Fiado" transaction
    if (transaction.notes === 'Pix Fiado') {
      const infinitePayHandle = config.infinitePay.handle;
      const hasInfinitePay = infinitePayHandle && 
        infinitePayHandle !== 'your-infinitepay-tag-handle' && 
        infinitePayHandle !== 'placeholder' && 
        infinitePayHandle.trim() !== '';

      if (hasInfinitePay) {
        try {
          logger.info({ transactionId: input.transactionId, handle: infinitePayHandle }, 'Generating InfinitePay payment link for Pix Fiado');
          
          // Query linked guardian if exists to retrieve email
          const linkedGuardian = await db('student_guardians as sg')
            .join('guardians as g', 'sg.guardian_id', 'g.id')
            .join('users as u', 'g.user_id', 'u.id')
            .where('sg.student_id', transaction.student_id)
            .select('u.email', 'u.name', 'u.phone')
            .first();

          const customerName = linkedGuardian?.name || transaction.guardian_name || '';
          const customerEmail = linkedGuardian?.email || '';
          const rawPhone = linkedGuardian?.phone || transaction.guardian_phone || '';

          const digits = rawPhone.replace(/\D/g, '');
          const formattedPhone = digits.length > 0 
            ? (digits.startsWith('55') ? `+${digits}` : `+55${digits}`) 
            : undefined;

          const hasCustomerInfo = customerName && customerName.trim() !== '';
          const customerObj = hasCustomerInfo ? {
            name: customerName,
            email: customerEmail || undefined,
            phone_number: formattedPhone || undefined
          } : undefined;

          const amountInCents = Math.round(Number(input.amount) * 100);
          const response = await fetch(config.infinitePay.workerUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              handle: infinitePayHandle,
              order_nsu: transaction.id,
              webhook_url: config.infinitePay.n8nWebhookUrl || `${config.apiUrl}/api/payments/webhook/infinitepay`,
              customer: customerObj,
              items: [
                {
                  quantity: 1,
                  price: amountInCents,
                  description: `Cantina - Pix a Distancia ${transaction.id.slice(0, 8)}`,
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`InfinitePay API returned error: ${errorText}`);
          }

          const data = await response.json() as any;
          
          // Generate QR code for the InfinitePay checkout link itself
          let qrCodeBase64 = '';
          try {
            qrCodeBase64 = await QRCode.toDataURL(data.url);
          } catch (err) {
            logger.warn({ err }, 'Failed to generate base64 QR code for InfinitePay link');
          }

          const infiniteData = {
            id: data.id,
            qr_code: '', // no static Pix Copy and Paste code since it's a web link
            qr_code_base64: qrCodeBase64,
            ticket_url: data.url,
            amount: input.amount,
            status: 'pending',
          };

          // Update payment record
          await db('transaction_payments')
            .where({ transaction_id: input.transactionId, payment_method: 'pix' })
            .update({
              external_id: infiniteData.id,
              metadata: JSON.stringify(infiniteData),
            });

          logger.info({ transactionId: input.transactionId, linkId: data.id }, 'InfinitePay payment link created successfully');
          return infiniteData;
        } catch (error: any) {
          logger.error({ error: error.message }, 'Failed to call InfinitePay API, falling back to static Pix');
        }
      }

      // Fallback: static Pix
      const pixKey = '00447591347';
      const beneficiary = 'POLLYANNA AVELINO VERZARO';
      const city = 'IMPERATRIZ';
      const qrCode = generateStaticPix(pixKey, Number(input.amount), beneficiary, city);
      let qrCodeBase64 = '';
      try {
        qrCodeBase64 = await QRCode.toDataURL(qrCode);
      } catch (err) {
        logger.warn({ err }, 'Failed to generate base64 QR code for static Pix');
      }

      const staticData = {
        id: `static-pix-${transaction.id}`,
        qr_code: qrCode,
        qr_code_base64: qrCodeBase64,
        ticket_url: '',
        amount: input.amount,
        status: 'pending',
      };

      // Update payment record
      await db('transaction_payments')
        .where({ transaction_id: input.transactionId, payment_method: 'pix' })
        .update({
          external_id: staticData.id,
          metadata: JSON.stringify(staticData),
        });

      logger.info({ transactionId: input.transactionId }, 'Static PIX created for Pix Fiado (Fallback)');
      return staticData;
    }

    // Normal Pix: generate static Pix with Banco Inter CNPJ key
    const pixKey = '52803416000141';
    const beneficiary = 'POLLYANNA AVELINO VERZARO';
    const city = 'IMPERATRIZ';
    const qrCode = generateStaticPix(pixKey, Number(input.amount), beneficiary, city);
    let qrCodeBase64 = '';
    try {
      qrCodeBase64 = await QRCode.toDataURL(qrCode);
    } catch (err) {
      logger.warn({ err }, 'Failed to generate base64 QR code for static Pix (Normal)');
    }

    const staticData = {
      id: `static-pix-${transaction.id}`,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: '',
      amount: input.amount,
      status: 'pending',
    };

    // Update payment record
    await db('transaction_payments')
      .where({ transaction_id: input.transactionId, payment_method: 'pix' })
      .update({
        external_id: staticData.id,
        metadata: JSON.stringify(staticData),
      });

    logger.info({ transactionId: input.transactionId }, 'Static PIX (Banco Inter CNPJ) created for normal Pix');
    return staticData;
  }

  /**
   * Create a card payment (checkout transparente).
   */
  async createCardPayment(schoolId: string, input: CreateCardPaymentInput): Promise<Record<string, any>> {
    const transaction = await db('transactions')
      .where({ id: input.transactionId, school_id: schoolId })
      .first();

    if (!transaction) throw Errors.notFound('Transação');

    if (config.env === 'development' || !config.mercadoPago.accessToken) {
      const mockData = {
        id: `mock-card-${Date.now()}`,
        status: 'approved',
        amount: input.amount,
      };

      await db('transaction_payments')
        .where({ transaction_id: input.transactionId })
        .whereIn('payment_method', ['debit_card', 'credit_card'])
        .update({
          external_id: mockData.id,
          status: 'approved',
          metadata: JSON.stringify(mockData),
        });

      logger.info({ transactionId: input.transactionId }, 'Mock card payment (dev mode)');
      return mockData;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          transaction_amount: input.amount,
          token: input.token,
          installments: input.installments,
          payment_method_id: 'visa', // auto-detected by MP
          payer: { email: input.payerEmail },
        }),
      });

      const data = await response.json() as any;

      await db('transaction_payments')
        .where({ transaction_id: input.transactionId })
        .whereIn('payment_method', ['debit_card', 'credit_card'])
        .update({
          external_id: String(data.id),
          status: data.status === 'approved' ? 'approved' : 'pending',
          metadata: JSON.stringify(data),
        });

      logger.info({ transactionId: input.transactionId, mpId: data.id, status: data.status }, 'Card payment');
      return data;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Card payment failed');
      throw Errors.internal('Falha ao processar pagamento com cartão');
    }
  }

  /**
   * Handle Mercado Pago webhook notifications.
   */
  async handleWebhook(data: any): Promise<void> {
    if (data.action !== 'payment.updated' && data.action !== 'payment.created') {
      logger.debug({ action: data.action }, 'Webhook action ignored');
      return;
    }

    const paymentId = data.data?.id;
    if (!paymentId) return;

    // Find the transaction payment
    const payment = await db('transaction_payments')
      .where({ external_id: String(paymentId) })
      .first();

    if (!payment) {
      logger.warn({ paymentId }, 'Webhook: payment not found locally');
      return;
    }

    // Fetch status from MP (or mock in dev)
    let mpStatus = 'approved';
    if (config.env !== 'development' && config.mercadoPago.accessToken) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
          headers: this.headers,
        });
        const mpData = await response.json() as any;
        mpStatus = mpData.status;
      } catch {
        logger.error({ paymentId }, 'Failed to fetch MP payment status');
        return;
      }
    }

    // Map MP status to our status
    const statusMap: Record<string, string> = {
      approved: 'approved',
      pending: 'pending',
      in_process: 'pending',
      rejected: 'failed',
      refunded: 'refunded',
      cancelled: 'failed',
    };

    const newStatus = statusMap[mpStatus] || 'pending';

    // Prevent duplicate processing
    if (payment.status === 'approved') return;

    await db('transaction_payments')
      .where({ id: payment.id })
      .update({ status: newStatus });

    // If payment was approved
    if (newStatus === 'approved') {
      const transaction = await db('transactions')
        .where({ id: payment.transaction_id })
        .first();

      if (!transaction) return;

      // Handle Online Recharge
      if (transaction.notes === 'Recarga Online PIX' && transaction.status === 'pending') {
        const mpMeta = typeof payment.metadata === 'string'
          ? JSON.parse(payment.metadata || '{}')
          : (payment.metadata || {});

        await db.transaction(async (trx) => {
          const splits = mpMeta?.splits;
          if (Array.isArray(splits) && splits.length > 0) {
            for (const split of splits) {
              await trx('students')
                .where({ id: split.studentId })
                .increment('balance', split.amount);
            }
          } else {
            // Increment student balance
            await trx('students')
              .where({ id: transaction.student_id })
              .increment('balance', payment.amount);
          }

          // Mark transaction as completed
          await trx('transactions')
            .where({ id: transaction.id })
            .update({ status: 'completed', updated_at: new Date() });
        });
        logger.info({ transactionId: transaction.id, amount: payment.amount }, 'Online recharge credited via webhook');
      } 
      // Handle normal POS sale PIX
      else if (payment.payment_method === 'pix') {
        const allPayments = await db('transaction_payments')
          .where({ transaction_id: payment.transaction_id });

        const allApproved = allPayments.every(
          (p: any) => p.id === payment.id ? true : p.status === 'approved'
        );

        if (allApproved) {
          await db('transactions')
            .where({ id: payment.transaction_id })
            .update({ status: 'completed', updated_at: new Date() });
        }
      }
    }

    logger.info({ paymentId, status: newStatus }, 'Webhook processed');
  }

  /**
   * Handle InfinitePay webhook notifications.
   */
  async handleInfinitePayWebhook(data: any): Promise<void> {
    logger.info({ data }, 'Received InfinitePay webhook notification');

    const orderNsu = data.order_nsu;
    const transactionNsu = data.transaction_nsu;
    const slug = data.invoice_slug || data.slug;
    const paidAmount = data.paid_amount;
    const receiptUrl = data.receipt_url;

    if (!orderNsu) {
      logger.warn('InfinitePay webhook: Missing order_nsu');
      return;
    }

    // Find the payment associated with the transaction ID (which was sent as order_nsu)
    const payment = await db('transaction_payments')
      .where({ transaction_id: orderNsu })
      .first();

    if (!payment) {
      logger.warn({ orderNsu }, 'InfinitePay webhook: Payment not found locally');
      return;
    }

    // InfinitePay only sends webhooks for successful payments,
    // so receiving the webhook means the payment was approved.
    const newStatus = (paidAmount && paidAmount > 0) ? 'approved' : 'approved';

    // Prevent duplicate processing
    if (payment.status === 'approved') {
      logger.info({ orderNsu }, 'InfinitePay webhook: Payment is already approved');
      return;
    }

    // Update payment record status
    const existingMetadata = typeof payment.metadata === 'string'
      ? JSON.parse(payment.metadata || '{}')
      : (payment.metadata || {});

    await db('transaction_payments')
      .where({ id: payment.id })
      .update({
        status: newStatus,
        external_id: transactionNsu || slug || payment.external_id,
        metadata: JSON.stringify({
          ...existingMetadata,
          infinitepay_webhook: data,
          receipt_url: receiptUrl || undefined,
        })
      });

    logger.info({ paymentId: payment.id, status: newStatus }, 'InfinitePay payment updated');

    if (newStatus === 'approved') {
      // Find the main transaction
      const transaction = await db('transactions')
        .where({ id: payment.transaction_id })
        .first();

      if (!transaction) return;

      // Update main transaction status if all payments are approved
      const allPayments = await db('transaction_payments')
        .where({ transaction_id: payment.transaction_id });

      const allApproved = allPayments.every(
        (p: any) => p.id === payment.id ? true : p.status === 'approved'
      );

      if (allApproved) {
        if (transaction.notes === 'Recarga Online PIX' && transaction.status === 'pending') {
          await db.transaction(async (trx) => {
            const splits = existingMetadata?.splits;
            if (Array.isArray(splits) && splits.length > 0) {
              for (const split of splits) {
                await trx('students')
                  .where({ id: split.studentId })
                  .increment('balance', split.amount);
              }
            } else {
              // Increment student balance
              await trx('students')
                .where({ id: transaction.student_id })
                .increment('balance', payment.amount);
            }

            // Mark transaction as completed
            await trx('transactions')
              .where({ id: transaction.id })
              .update({ status: 'completed', updated_at: new Date() });
          });
          logger.info({ transactionId: transaction.id, amount: payment.amount }, 'Online recharge credited via InfinitePay webhook');
        } else {
          await db('transactions')
            .where({ id: payment.transaction_id })
            .update({ status: 'completed', updated_at: new Date() });
          logger.info({ transactionId: payment.transaction_id }, 'Transaction completed via InfinitePay webhook');
        }
      }
    }
  }

  /**
   * Recharge student balance via payment (Generates PIX QR Code).
   */
  async recharge(schoolId: string, input: RechargeInput): Promise<Record<string, any>> {
    const student = await db('students')
      .where({ id: input.studentId, school_id: schoolId })
      .first();

    if (!student) throw Errors.notFound('Aluno');

    // Create a pending transaction for the recharge
    const transactionId = crypto.randomUUID();
    await db('transactions').insert({
      id: transactionId,
      school_id: schoolId,
      student_id: input.studentId,
      total_amount: input.amount,
      final_amount: input.amount,
      status: 'pending',
      identification_method: 'app',
      notes: 'Recarga Online PIX',
    });

    const paymentId = crypto.randomUUID();
    const metadata = input.splits ? JSON.stringify({ splits: input.splits }) : '{}';
    await db('transaction_payments').insert({
      id: paymentId,
      transaction_id: transactionId,
      payment_method: 'pix',
      amount: input.amount,
      status: 'pending',
      metadata,
    });

    const infinitePayHandle = config.infinitePay.handle;
    const hasInfinitePay = infinitePayHandle && 
      infinitePayHandle !== 'your-infinitepay-tag-handle' && 
      infinitePayHandle !== 'placeholder' && 
      infinitePayHandle.trim() !== '';

    const hasMercadoPago = config.mercadoPago.accessToken && 
      !config.mercadoPago.accessToken.includes('your-mercado-pago') && 
      config.mercadoPago.accessToken.trim() !== '';

    // In development mode (or missing keys), mock the PIX
    if (config.env === 'development' || (!hasMercadoPago && !hasInfinitePay)) {
      const mockData = {
        id: `mock-pix-${Date.now()}`,
        qr_code: '00020126580014br.gov.bcb.pix0136mock-pix-key-cantina-escolar',
        qr_code_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        ticket_url: `https://mock-mp.com/pix/${Date.now()}`,
        amount: input.amount,
        status: 'pending',
      };

      await db('transaction_payments')
        .where({ id: paymentId })
        .update({
          external_id: mockData.id,
          metadata: JSON.stringify(mockData),
        });

      // Auto-approve mock after 10 seconds for testing without webhook
      setTimeout(() => {
        this.handleWebhook({ action: 'payment.updated', data: { id: mockData.id } }).catch(console.error);
      }, 10000);

      logger.info({ studentId: input.studentId }, 'Mock PIX Recharge created (auto-approves in 10s)');
      return { ...mockData, transactionId };
    }

    // Production: Try InfinitePay if configured
    if (hasInfinitePay) {
      try {
        logger.info({ studentId: input.studentId, handle: infinitePayHandle }, 'Generating InfinitePay payment link for Balance Recharge');
        
        // Fetch the details of the guardian user requesting the recharge
        const linkedGuardian = await db('student_guardians as sg')
          .join('guardians as g', 'sg.guardian_id', 'g.id')
          .join('users as u', 'g.user_id', 'u.id')
          .where('sg.student_id', input.studentId)
          .select('u.name', 'u.email', 'u.phone')
          .first();
        
        const customerName = linkedGuardian?.name || '';
        const customerEmail = linkedGuardian?.email || '';
        const rawPhone = linkedGuardian?.phone || '';

        const digits = rawPhone.replace(/\D/g, '');
        const formattedPhone = digits.length > 0 
          ? (digits.startsWith('55') ? `+${digits}` : `+55${digits}`) 
          : undefined;

        const hasCustomerInfo = customerName && customerName.trim() !== '';
        const customerObj = hasCustomerInfo ? {
          name: customerName,
          email: customerEmail || undefined,
          phone_number: formattedPhone || undefined
        } : undefined;

        const amountInCents = Math.round(Number(input.amount) * 100);
        const response = await fetch(config.infinitePay.workerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            handle: infinitePayHandle,
            order_nsu: transactionId,
            webhook_url: config.infinitePay.n8nWebhookUrl || `${config.apiUrl}/api/payments/webhook/infinitepay`,
            customer: customerObj,
            items: [
              {
                quantity: 1,
                price: amountInCents,
                description: `Recarga de Saldo - ${student.enrollment_number}`,
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`InfinitePay API returned error: ${errorText}`);
        }

        const data = await response.json() as any;
        
        // Generate QR code for the InfinitePay checkout link itself
        let qrCodeBase64 = '';
        try {
          qrCodeBase64 = await QRCode.toDataURL(data.url);
        } catch (err) {
          logger.warn({ err }, 'Failed to generate base64 QR code for InfinitePay link');
        }

        const infiniteData = {
          id: data.id,
          qr_code: '', // no static Pix Copy and Paste code since it's a web link
          qr_code_base64: qrCodeBase64,
          ticket_url: data.url,
          amount: input.amount,
          status: 'pending',
        };

        // Update payment record
        await db('transaction_payments')
          .where({ id: paymentId })
          .update({
            external_id: infiniteData.id,
            metadata: JSON.stringify(infiniteData),
          });

        logger.info({ studentId: input.studentId, linkId: data.id }, 'InfinitePay payment link created successfully for Recharge');
        return { ...infiniteData, transactionId };
      } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to call InfinitePay API for Recharge');
        throw Errors.badRequest(`Erro no gateway InfinitePay: ${error.message}`);
      }
    }

    // Production: Call Mercado Pago to create PIX
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          transaction_amount: input.amount,
          description: `Recarga de Saldo - ${student.enrollment_number}`,
          payment_method_id: 'pix',
          payer: { email: input.payerEmail || 'responsavel@cantina.local' },
          external_reference: transactionId
        }),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        throw Errors.internal(`Mercado Pago error: ${JSON.stringify(error)}`);
      }

      const data = await response.json() as any;

      await db('transaction_payments')
        .where({ id: paymentId })
        .update({
          external_id: String(data.id),
          metadata: JSON.stringify({
            qr_code: data.point_of_interaction?.transaction_data?.qr_code,
            qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
            ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
          }),
        });

      logger.info({ studentId: input.studentId, mpId: data.id }, 'PIX Recharge created');

      return {
        id: data.id,
        transactionId,
        qr_code: data.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
        ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
        amount: data.transaction_amount,
        status: data.status,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'PIX Recharge creation failed');
      throw error instanceof Error && 'statusCode' in error
        ? error
        : Errors.internal('Falha ao gerar PIX para recarga');
    }
  }

  /**
   * Get payment history for a student.
   */
  async getHistory(
    schoolId: string,
    studentId: string,
    query: PaymentHistoryQuery
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const baseQuery = db('transaction_payments as tp')
      .join('transactions as t', 'tp.transaction_id', 't.id')
      .where({ 't.student_id': studentId, 't.school_id': schoolId });

    const [{ count }] = await baseQuery.clone().count('* as count');
    const total = Number(count);

    const data = await baseQuery
      .select(
        'tp.id', 'tp.payment_method', 'tp.amount', 'tp.status',
        'tp.created_at', 't.id as transaction_id', 't.final_amount'
      )
      .orderBy('tp.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page, limit, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Manually approve a pending transaction payment (e.g. for Pix Fiado).
   */
  async approvePaymentManually(schoolId: string, transactionId: string): Promise<void> {
    const transaction = await db('transactions')
      .where({ id: transactionId, school_id: schoolId })
      .first();

    if (!transaction) throw Errors.notFound('Transação');
    if (transaction.status === 'completed') return;

    const payments = await db('transaction_payments')
      .where({ transaction_id: transactionId, status: 'pending' });

    await db.transaction(async (trx) => {
      // 1. Approve payments
      await trx('transaction_payments')
        .where({ transaction_id: transactionId, status: 'pending' })
        .update({ status: 'approved' });

      // 2. If online recharge, credit student balance
      if (transaction.notes === 'Recarga Online PIX') {
        let hasSplits = false;
        for (const payment of payments) {
          const meta = typeof payment.metadata === 'string'
            ? JSON.parse(payment.metadata || '{}')
            : (payment.metadata || {});

          if (Array.isArray(meta?.splits) && meta.splits.length > 0) {
            hasSplits = true;
            for (const split of meta.splits) {
              await trx('students')
                .where({ id: split.studentId })
                .increment('balance', split.amount);
              logger.info({ studentId: split.studentId, amount: split.amount }, 'Online split recharge credited manually');
            }
          }
        }

        if (!hasSplits) {
          const totalRecharged = payments.reduce((sum, p) => sum + Number(p.amount), 0);
          await trx('students')
            .where({ id: transaction.student_id })
            .increment('balance', totalRecharged);
          logger.info({ studentId: transaction.student_id, amount: totalRecharged }, 'Online recharge credited manually');
        }
      }

      // 3. Complete transaction
      await trx('transactions')
        .where({ id: transactionId })
        .update({ status: 'completed', updated_at: new Date() });
    });

    logger.info({ transactionId }, 'Transaction approved manually');
  }
}

export const paymentsService = new PaymentsService();

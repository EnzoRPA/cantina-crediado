import { config } from '../../config';
import { db } from '../../shared/database/knex';
import { logger } from '../../shared/utils/logger';
import { Errors } from '../../shared/middlewares/error-handler';

export interface ExtractedSheetItem {
  student_id: string;
  student_name: string;
  grade?: string;
  enrollment_number?: string;
  amount: number;
  raw_text?: string;
  confidence: 'high' | 'medium' | 'low';
}

function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, '')
    .trim();
}

export class VisionService {
  /**
   * Processa uma imagem da folha A4 e extrai os consumos anotados.
   */
  async processSheetImage(
    schoolId: string,
    imageBase64: string,
    customApiKey?: string
  ): Promise<{ items: ExtractedSheetItem[]; totalCount: number; grandTotal: number }> {
    const apiKey = customApiKey || config.gemini.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw Errors.badRequest(
        'Chave de API do Gemini não configurada. Configure a variável GEMINI_API_KEY no .env ou informe a chave nas configurações.'
      );
    }

    // 1. Limpar cabeçalho base64 se presente
    let cleanBase64 = imageBase64;
    let mimeType = 'image/jpeg';

    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      const mimeMatch = parts[0].match(/data:(.*?)$/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
      cleanBase64 = parts[1];
    }

    // 2. Buscar todos os alunos cadastrados desta escola para cruzamento
    const schoolStudents = await db('students as s')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .where('s.school_id', schoolId)
      .andWhere('s.is_active', true)
      .select([
        's.id as student_id',
        'u.name as student_name',
        's.grade',
        's.class_group',
        's.enrollment_number',
      ]);

    // Criar resumo dos alunos para orientar o Gemini se necessário
    const studentSample = schoolStudents
      .map((s) => `Matrícula: "${s.enrollment_number || ''}" | Nome: "${s.student_name}"`)
      .slice(0, 100)
      .join('\n');

    // 3. Montar Prompt para o Gemini Vision
    const systemPrompt = `
Você é um leitor óptico e especialista em reconhecimento de manuscrito (OCR) para folhas de cantina escolar.
A imagem enviada é uma folha impressa intitulada "CANTINA ESCOLAR — FICHA DE CONSUMO FIADO (A PRAZO)".

A folha contém várias linhas, onde cada linha possui:
1. QR Code do aluno
2. Nome do Aluno(a) e Matrícula (ex: "1. Abner Oliveira Amorim", "• Matrícula: 012122")
3. Uma caixa retangular com "VALOR CONSUMIDO (R$)" onde pode ter um número/expressão escrito à mão (ex: "12,50", "15", "5+3", "7.00") ou estar TOTALMENTE EM BRANCO.
4. Linha de Assinatura/Visto.

INSTRUÇÕES IMPORTANTES:
- Identifique CADA linha da folha.
- Verifique se a caixa "VALOR CONSUMIDO (R$)" possui algum valor ou anotação de valor escrito à mão.
- Se a caixa de valor estiver em branco ou sem número, IGNORE essa linha.
- Se houver valor (ex: "12,50", "10", "8,00", "5,50"), extraia:
  * "matricula": número da matrícula se visível na linha (ex: "012122", "000010")
  * "nome": nome do aluno impresso na linha (ex: "Abner Oliveira Amorim")
  * "valor_raw": texto exato do valor manuscrito encontrado (ex: "12,50")
  * "valor": número decimal correspondente (ex: 12.50)

Responda ESTRITAMENTE em formato JSON com o seguinte esquema (sem blocos markdown adicionais):
{
  "consumos": [
    {
      "matricula": "012122",
      "nome": "Abner Oliveira Amorim",
      "valor_raw": "12,50",
      "valor": 12.50
    }
  ]
}
`;

    // 4. Chamada à API do Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json',
      },
    };

    logger.info('🤖 Enviando folha para análise com Gemini Vision...');
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ errorText, status: response.status }, 'Erro na resposta do Gemini API');
      throw Errors.badRequest(`Erro ao consultar API de Visão (Gemini): ${response.statusText}`);
    }

    const data: any = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    logger.info({ rawText }, 'Resposta do Gemini Vision recebida');

    let parsedResult: { consumos: Array<{ matricula?: string; nome?: string; valor_raw?: string; valor?: number }> } = {
      consumos: [],
    };

    try {
      parsedResult = JSON.parse(rawText);
    } catch (parseErr) {
      logger.warn({ parseErr, rawText }, 'Falha ao parsear JSON direto do Gemini, tentando regex...');
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      }
    }

    const rawList = parsedResult.consumos || [];
    const matchedItems: ExtractedSheetItem[] = [];

    // 5. Cruzar cada consumo extraído com a lista de alunos da escola
    for (const item of rawList) {
      const itemMatricula = (item.matricula || '').trim();
      const itemNome = normalizeText(item.nome || '');
      const parsedAmount = typeof item.valor === 'number' ? item.valor : parseFloat(String(item.valor_raw || '0').replace(',', '.'));

      if (isNaN(parsedAmount) || parsedAmount <= 0) continue;

      let foundStudent: any = null;
      let confidence: 'high' | 'medium' | 'low' = 'low';

      // Busca 1: Pela Matrícula
      if (itemMatricula) {
        foundStudent = schoolStudents.find(
          (s) => s.enrollment_number && s.enrollment_number.toLowerCase() === itemMatricula.toLowerCase()
        );
        if (foundStudent) confidence = 'high';
      }

      // Busca 2: Pelo Nome Exato ou Normalizado
      if (!foundStudent && itemNome) {
        foundStudent = schoolStudents.find((s) => normalizeText(s.student_name) === itemNome);
        if (foundStudent) confidence = 'high';
      }

      // Busca 3: Pelo primeiro e último nome
      if (!foundStudent && itemNome) {
        const parts = itemNome.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          const first = parts[0];
          const last = parts[parts.length - 1];
          foundStudent = schoolStudents.find((s) => {
            const norm = normalizeText(s.student_name);
            return norm.includes(first) && norm.includes(last);
          });
          if (foundStudent) confidence = 'medium';
        }
      }

      // Se encontrou o aluno no banco, adiciona aos resultados
      if (foundStudent) {
        matchedItems.push({
          student_id: foundStudent.student_id,
          student_name: foundStudent.student_name,
          grade: foundStudent.grade ? `${foundStudent.grade} ${foundStudent.class_group || ''}`.trim() : undefined,
          enrollment_number: foundStudent.enrollment_number,
          amount: Math.round(parsedAmount * 100) / 100,
          raw_text: item.valor_raw,
          confidence,
        });
      }
    }

    const grandTotal = matchedItems.reduce((acc, item) => acc + item.amount, 0);

    return {
      items: matchedItems,
      totalCount: matchedItems.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }
}

export const visionService = new VisionService();

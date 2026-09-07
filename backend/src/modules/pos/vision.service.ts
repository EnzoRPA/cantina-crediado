import { v4 as uuidv4 } from 'uuid';
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
  match_source?: 'matricula' | 'learned_alias' | 'exact_name' | 'partial_name' | 'first_name_grade' | 'fuzzy';
  billing_type?: 'pix_direto' | 'crediario';
  guardian_name?: string;
  guardian_phone?: string;
  payment_method_sheet?: 'pix' | 'fiado';
}

export interface SuggestedStudent {
  student_id: string;
  student_name: string;
  grade?: string;
  class_group?: string;
  enrollment_number?: string;
  similarity: number;
  billing_type?: 'pix_direto' | 'crediario';
  guardian_name?: string;
  guardian_phone?: string;
}

export interface UnrecognizedSheetItem {
  temp_id: string;
  raw_name: string;
  raw_matricula?: string;
  raw_amount_text?: string;
  amount: number;
  payment_method_sheet?: 'pix' | 'fiado';
  suggested_students: SuggestedStudent[];
}

export interface ProcessSheetResult {
  items: ExtractedSheetItem[];
  unrecognizedItems: UnrecognizedSheetItem[];
  totalCount: number;
  recognizedCount: number;
  unrecognizedCount: number;
  grandTotal: number;
}

export function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula a distância de Levenshtein entre duas strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // remoção
        d[i][j - 1] + 1,      // inserção
        d[i - 1][j - 1] + cost // substituição
      );
    }
  }
  return d[m][n];
}

/**
 * Calcula a similaridade entre 0 (totalmente diferente) e 1 (idêntico)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  // Se uma string contém a outra inteira
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return Math.max(0.78, Math.round((minLen / maxLen) * 100) / 100);
  }

  // Similaridade de tokens (palavras em comum)
  const tokens1 = s1.split(' ').filter(Boolean);
  const tokens2 = s2.split(' ').filter(Boolean);
  let matchingTokens = 0;
  for (const t1 of tokens1) {
    if (tokens2.some(t2 => t2 === t1 || (t1.length >= 4 && t2.startsWith(t1)))) {
      matchingTokens++;
    }
  }
  const tokenScore = matchingTokens / Math.max(tokens1.length, tokens2.length);

  // Levenshtein
  const maxLen = Math.max(s1.length, s2.length);
  const dist = levenshteinDistance(s1, s2);
  const levScore = Math.max(0, 1 - dist / maxLen);

  return Math.round(Math.max(levScore, tokenScore * 0.9) * 100) / 100;
}

export class VisionService {
  /**
   * Processa uma imagem de folha de consumo (impressa ou caderno de fiado)
   * e extrai os consumos anotados, cruzando com alunos e base de conhecimento de grafias.
   */
  async processSheetImage(
    schoolId: string,
    imageBase64: string,
    customApiKey?: string
  ): Promise<ProcessSheetResult> {
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
        's.billing_type',
        's.guardian_name',
        's.guardian_phone',
        'u.phone as student_phone',
      ]);

    // 3. Buscar os aliases e caligrafias/grafias aprendidas anteriormente nesta escola
    let schoolAliases: Array<{ student_id: string; alias: string; raw_alias: string }> = [];
    try {
      const hasAliasesTable = await db.schema.hasTable('student_aliases');
      if (hasAliasesTable) {
        schoolAliases = await db('student_aliases')
          .where('school_id', schoolId)
          .select('student_id', 'alias', 'raw_alias');
      }
    } catch (aliasErr) {
      logger.warn({ aliasErr }, 'Aviso: Tabela student_aliases indisponível ou erro ao consultar aliases');
    }

    // 4. Montar Prompt de altíssima precisão com suporte a folhas impressas e tabelas manuscritas
    const systemPrompt = `
Você é um leitor óptico e especialista de altíssima precisão em OCR de escrita manuscrita em folhas de cantina escolar.
A imagem enviada pode ser:
1. Uma folha intitulada "RELAÇÃO DE VENDAS DA CANTINA" contendo as colunas:
   - ALUNO/FUNCIONARIO: nome manuscrito do aluno, professor ou funcionário (ex: "Ayla", "Helena Lopes", "Isaac Paulo", "Teodoro", "Pr. Rocha", "Benjamin Lima", "Vitor Hugo", "Mateus / Helena Lopes")
   - SERIE: número ou letra da turma/série (ex: "6", "7", "4", "1", "2", "3", "F")
   - VALOR: número ou expressão matemática manuscrita (ex: "10", "9", "21", "5+7", "9+2", "11", "13", "4")
   - PAGAMENTO: caixas de seleção "( ) fiado" e "( ) pix"
OU
2. A folha impressa de ficha de consumo com QR Code ("CANTINA ESCOLAR — FICHA DE CONSUMO FIADO (A PRAZO)").
OU
3. Caderno pautado ou recibos manuais avulsos da cantina.

INSTRUÇÕES CRÍTICAS E OBRIGATÓRIAS:
1. Extraia CADA LINHA onde houver qualquer valor numérico anotado, de cima até o final da folha.
2. NUNCA IGNORE uma linha se houver valor anotado!
3. Se a linha estiver claramente riscada com um traço/caneta azul sobre o nome ou valor (cancelada), marque "riscado": true. Se não estiver riscada, "riscado": false.
4. Se o valor for uma expressão matemática com soma (ex: "5+7", "9+2"), mantenha em "valor_raw" a expressão original (ex: "5+7") e em "valor" o resultado somado (ex: 12.0).
5. Se a coluna PAGAMENTO tiver a caixa [X] pix marcada, marque "pagamento": "pix". Se estiver desmarcada ou fiado, marque "pagamento": "fiado".
6. Extraia a série/turma no campo "serie" (ex: "6", "7", "4", "1").
7. Extraia o nome ou apelido como estiver escrito na folha no campo "nome".

Responda ESTRITAMENTE em formato JSON com o seguinte esquema (sem blocos markdown adicionais):
{
  "consumos": [
    {
      "nome": "Ayla",
      "serie": "6",
      "matricula": "",
      "valor_raw": "10",
      "valor": 10.0,
      "pagamento": "fiado",
      "riscado": false
    }
  ]
}
`;

    // 5. Descobrir dinamicamente os modelos habilitados para a chave informada
    let modelsToTry = [
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ];

    try {
      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listResp.ok) {
        const listData: any = await listResp.json();
        const modelsList: any[] = listData?.models || [];
        const supported = modelsList
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => m.name.replace('models/', ''));

        if (supported.length > 0) {
          const flashModels = supported.filter((m) => m.includes('flash'));
          const otherModels = supported.filter((m) => !m.includes('flash'));
          modelsToTry = [...flashModels, ...otherModels];
        }
      }
    } catch (listErr) {
      logger.warn({ listErr }, 'Não foi possível listar modelos dinamicamente, usando candidatos padrão');
    }

    let lastErrorText = '';
    let responseData: any = null;

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

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        logger.info(`🤖 Enviando folha para análise com modelo ${model}...`);

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          responseData = await response.json();
          logger.info(`✅ Análise concluída com sucesso usando modelo ${model}`);
          break;
        } else {
          lastErrorText = await response.text();
          logger.warn({ model, status: response.status, lastErrorText }, `Falha com modelo ${model}`);
        }
      } catch (reqErr: any) {
        lastErrorText = reqErr.message || String(reqErr);
      }
    }

    if (!responseData) {
      let friendlyMsg = lastErrorText;
      try {
        const parsedErr = JSON.parse(lastErrorText);
        friendlyMsg = parsedErr.error?.message || lastErrorText;
      } catch (_) {}

      if (friendlyMsg.includes('API_KEY_INVALID') || !apiKey.startsWith('AIzaSy')) {
        throw Errors.badRequest(
          'Chave de API do Gemini inválida. A chave oficial do Google AI Studio deve começar com "AIzaSy...". Gere uma chave gratuita em aistudio.google.com/app/apikey'
        );
      }

      throw Errors.badRequest(`Erro ao consultar API de Visão (Gemini): ${friendlyMsg}`);
    }

    const data: any = responseData;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    logger.info({ rawText }, 'Resposta do Gemini Vision recebida');

    let parsedResult: {
      consumos: Array<{
        matricula?: string;
        nome?: string;
        serie?: string;
        valor_raw?: string;
        valor?: number;
        pagamento?: string;
        riscado?: boolean;
      }>;
    } = {
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
    const unrecognizedItems: UnrecognizedSheetItem[] = [];

    // 6. Cruzamento em camadas inteligentes (Matrícula -> Aliases -> Nome Completo -> Primeiro Nome + Série -> Fuzzy)
    for (const item of rawList) {
      // Se a linha foi explicitamente riscada com caneta (cancelada), ignorar
      if (item.riscado) {
        logger.info({ item }, 'Linha riscada/cancelada na folha ignorada');
        continue;
      }

      const rawName = (item.nome || '').trim();
      let itemNome = normalizeText(rawName);
      // Remover prefixos comuns de professores/tios se houver
      itemNome = itemNome.replace(/^(pr|prof|profa|tia|tio)\s+/, '');

      const itemMatricula = (item.matricula || '').trim();
      const itemSerie = normalizeText(item.serie || '');
      const parsedAmount = typeof item.valor === 'number' ? item.valor : parseFloat(String(item.valor_raw || '0').replace(',', '.'));

      // Pular apenas se o valor não for número positivo
      if (isNaN(parsedAmount) || parsedAmount <= 0) continue;

      const roundedAmount = Math.round(parsedAmount * 100) / 100;
      let foundStudent: any = null;
      let confidence: 'high' | 'medium' | 'low' = 'low';
      let matchSource: 'matricula' | 'learned_alias' | 'exact_name' | 'partial_name' | 'first_name_grade' | 'fuzzy' | undefined;

      // Camada 1: Matrícula
      if (itemMatricula) {
        foundStudent = schoolStudents.find(
          (s) => s.enrollment_number && s.enrollment_number.toLowerCase() === itemMatricula.toLowerCase()
        );
        if (foundStudent) {
          confidence = 'high';
          matchSource = 'matricula';
        }
      }

      // Camada 2: Alias / Grafia Memorizada Anteriormente pela Cantina
      if (!foundStudent && itemNome && schoolAliases.length > 0) {
        const matchedAlias = schoolAliases.find(
          (a) => a.alias === itemNome || normalizeText(a.raw_alias) === itemNome
        );
        if (matchedAlias) {
          const studentFromAlias = schoolStudents.find((s) => s.student_id === matchedAlias.student_id);
          if (studentFromAlias) {
            foundStudent = studentFromAlias;
            confidence = 'high';
            matchSource = 'learned_alias';
            logger.info({ rawName, studentName: foundStudent.student_name }, '🎯 Aluno reconhecido via Grafia Memorizada!');
          }
        }
      }

      // Camada 3: Nome Exato Normalizado
      if (!foundStudent && itemNome) {
        foundStudent = schoolStudents.find((s) => normalizeText(s.student_name) === itemNome);
        if (foundStudent) {
          confidence = 'high';
          matchSource = 'exact_name';
        }
      }

      // Camada 4: Primeiro e Último Nome (para anotações com dois nomes, ex: "Helena Lopes", "Isaac Paulo")
      if (!foundStudent && itemNome) {
        const parts = itemNome.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          const first = parts[0];
          const last = parts[parts.length - 1];
          let candidates = schoolStudents.filter((s) => {
            const norm = normalizeText(s.student_name);
            return norm.includes(first) && norm.includes(last);
          });

          // Se tiver mais de um candidato mas a série foi identificada, filtrar pela série
          if (candidates.length > 1 && itemSerie) {
            const gradeFiltered = candidates.filter((s) => {
              const gradeNorm = normalizeText(s.grade || '');
              return gradeNorm.includes(itemSerie) || (s.class_group && normalizeText(s.class_group).includes(itemSerie));
            });
            if (gradeFiltered.length === 1) {
              candidates = gradeFiltered;
            }
          }

          if (candidates.length === 1) {
            foundStudent = candidates[0];
            confidence = 'high';
            matchSource = 'partial_name';
          }
        }
      }

      // Camada 5: Primeiro Nome + Série (Essencial para anotações do dia a dia, ex: "Ayla" série "6", "Teodoro" série "4")
      if (!foundStudent && itemNome) {
        const firstName = itemNome.split(/\s+/)[0];
        if (firstName.length >= 3) {
          const candidatesByFirst = schoolStudents.filter((s) => {
            const norm = normalizeText(s.student_name);
            const firstOfStudent = norm.split(/\s+/)[0];
            return firstOfStudent === firstName || norm.startsWith(firstName + ' ');
          });

          if (candidatesByFirst.length > 0) {
            // Se houver série anotada na folha (ex: "6", "4", "1"), filtrar pela turma
            if (itemSerie) {
              const matchWithGrade = candidatesByFirst.filter((s) => {
                const gradeNorm = normalizeText(s.grade || '');
                return gradeNorm.includes(itemSerie) || (s.class_group && normalizeText(s.class_group).includes(itemSerie));
              });
              if (matchWithGrade.length === 1) {
                foundStudent = matchWithGrade[0];
                confidence = 'high';
                matchSource = 'first_name_grade';
              }
            }

            // Se ainda não achou e só existe 1 único aluno na escola com esse primeiro nome
            if (!foundStudent && candidatesByFirst.length === 1) {
              foundStudent = candidatesByFirst[0];
              confidence = 'high';
              matchSource = 'first_name_grade';
            }
          }
        }
      }

      // Camada 6: Similaridade Direta (Fuzzy Matching para pequenos erros de OCR ou caligrafia)
      if (!foundStudent && itemNome.length >= 3) {
        let bestScore = 0;
        let bestCandidate: any = null;
        let secondBestScore = 0;

        for (const s of schoolStudents) {
          let score = calculateSimilarity(itemNome, s.student_name);
          // Bônus se a série bater com a turma do aluno
          if (itemSerie && s.grade && normalizeText(s.grade).includes(itemSerie)) {
            score = Math.min(1, score + 0.1);
          }

          if (score > bestScore) {
            secondBestScore = bestScore;
            bestScore = score;
            bestCandidate = s;
          } else if (score > secondBestScore) {
            secondBestScore = score;
          }
        }

        // Também testa similaridade contra aliases cadastrados
        for (const a of schoolAliases) {
          let score = calculateSimilarity(itemNome, a.raw_alias);
          if (score > bestScore) {
            const studentFromAlias = schoolStudents.find((s) => s.student_id === a.student_id);
            if (studentFromAlias) {
              secondBestScore = bestScore;
              bestScore = score;
              bestCandidate = studentFromAlias;
            }
          }
        }

        // Se encontrou com boa similaridade (>= 0.82) e boa separação
        if (bestCandidate && bestScore >= 0.82 && (bestScore - secondBestScore >= 0.10 || bestScore >= 0.90)) {
          foundStudent = bestCandidate;
          confidence = 'medium';
          matchSource = 'fuzzy';
        }
      }

      // 7. Resultado do item:
      const paymentFromSheet = item.pagamento === 'pix' ? 'pix' : 'fiado';
      if (foundStudent) {
        // Encontrou aluno com boa confiança
        const isPixDireto = paymentFromSheet === 'pix' || foundStudent.billing_type === 'pix_direto';
        matchedItems.push({
          student_id: foundStudent.student_id,
          student_name: foundStudent.student_name,
          grade: foundStudent.grade ? `${foundStudent.grade} ${foundStudent.class_group || ''}`.trim() : undefined,
          enrollment_number: foundStudent.enrollment_number,
          amount: roundedAmount,
          raw_text: item.valor_raw || rawName,
          confidence,
          match_source: matchSource,
          billing_type: isPixDireto ? 'pix_direto' : 'crediario',
          guardian_name: foundStudent.guardian_name,
          guardian_phone: foundStudent.guardian_phone || foundStudent.student_phone,
          payment_method_sheet: paymentFromSheet,
        });
      } else {
        // NUNCA DESPREZAR: Aluno não reconhecido automaticamente, mas tem valor!
        // Calcular as melhores sugestões entre todos os alunos da escola considerando também a série
        const scoredStudents: SuggestedStudent[] = schoolStudents.map((s) => {
          let sim = calculateSimilarity(itemNome, s.student_name);

          // Bônus se a série/turma bater
          if (itemSerie && s.grade && normalizeText(s.grade).includes(itemSerie)) {
            sim = Math.min(1, sim + 0.15);
          }

          const matchingAlias = schoolAliases.filter((a) => a.student_id === s.student_id);
          for (const al of matchingAlias) {
            const aliasSim = calculateSimilarity(itemNome, al.raw_alias);
            if (aliasSim > sim) sim = aliasSim;
          }

          return {
            student_id: s.student_id,
            student_name: s.student_name,
            grade: s.grade,
            class_group: s.class_group,
            enrollment_number: s.enrollment_number,
            similarity: Math.round(sim * 100) / 100,
            billing_type: s.billing_type,
            guardian_name: s.guardian_name,
            guardian_phone: s.guardian_phone || s.student_phone,
          };
        });

        // Ordenar por similaridade decrescente e pegar os top 4 mais próximos
        const suggestions = scoredStudents
          .filter((s) => s.similarity >= 0.25)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 4);

        unrecognizedItems.push({
          temp_id: uuidv4(),
          raw_name: rawName || 'Não identificado',
          raw_matricula: itemMatricula || (itemSerie ? `Série: ${itemSerie}` : undefined),
          raw_amount_text: item.valor_raw,
          amount: roundedAmount,
          payment_method_sheet: paymentFromSheet,
          suggested_students: suggestions,
        });

        logger.info(
          { rawName, amount: roundedAmount, itemSerie, topSuggestion: suggestions[0]?.student_name },
          '⚠️ Consumo retido como Não Reconhecido para confirmação com 1 clique'
        );
      }
    }

    const grandTotal = matchedItems.reduce((acc, item) => acc + item.amount, 0);

    return {
      items: matchedItems,
      unrecognizedItems,
      totalCount: matchedItems.length + unrecognizedItems.length,
      recognizedCount: matchedItems.length,
      unrecognizedCount: unrecognizedItems.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }
}

export const visionService = new VisionService();

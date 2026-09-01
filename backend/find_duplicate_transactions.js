const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../dev.sqlite3');
const db = new Database(dbPath);

console.log('=== 1. BUSCA POR TRANSAÇÕES DUPLICADAS (MESMO ALUNO, MESMA DATA E MESMO VALOR) ===');

const duplicateQuery = `
  SELECT 
    DATE(t.created_at) as tx_date,
    t.student_id,
    u.name as student_name,
    s.grade,
    s.class_group,
    s.enrollment_number,
    t.final_amount,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(t.id) as transaction_ids,
    GROUP_CONCAT(t.created_at) as created_ats,
    GROUP_CONCAT(COALESCE(t.notes, 'Sem nota')) as notes_list
  FROM transactions t
  JOIN students s ON t.student_id = s.id
  JOIN users u ON s.user_id = u.id
  WHERE t.status != 'cancelled'
  GROUP BY DATE(t.created_at), t.student_id, t.final_amount
  HAVING COUNT(*) > 1
  ORDER BY tx_date DESC, student_name ASC;
`;

const duplicates = db.prepare(duplicateQuery).all();

console.log(`Total de grupos com valores repetidos na mesma data: ${duplicates.length}\n`);

duplicates.forEach((dup, idx) => {
  console.log(`[${idx + 1}] Aluno: ${dup.student_name} (${dup.grade} ${dup.class_group || ''}) - Matrícula: ${dup.enrollment_number}`);
  console.log(`    Data: ${dup.tx_date} | Valor: R$ ${Number(dup.final_amount).toFixed(2)} | Quantidade de lançamentos repetidos: ${dup.duplicate_count}x`);
  console.log(`    IDs das transações: ${dup.transaction_ids}`);
  console.log(`    Timestamps: ${dup.created_ats}`);
  console.log(`    Notas/Descrições: ${dup.notes_list}`);
  console.log('----------------------------------------------------------------------');
});

console.log('\n=== 2. TODAS AS TRANSAÇÕES DO DIA 12/08/2026 (OU CONTENDO 08-12) ===');

const aug12Query = `
  SELECT 
    t.id,
    t.created_at,
    t.final_amount,
    t.status,
    t.notes,
    u.name as student_name,
    s.grade,
    s.class_group,
    s.enrollment_number
  FROM transactions t
  JOIN students s ON t.student_id = s.id
  JOIN users u ON s.user_id = u.id
  WHERE t.created_at LIKE '%08-12%' OR t.created_at LIKE '%12/08%'
  ORDER BY u.name ASC, t.created_at ASC;
`;

const aug12Rows = db.prepare(aug12Query).all();
console.log(`Total de lançamentos encontrados no dia 12/08: ${aug12Rows.length}\n`);

aug12Rows.forEach((r, idx) => {
  console.log(`${idx + 1}. [${r.created_at}] ${r.student_name} (${r.grade} ${r.class_group || ''}) - R$ ${Number(r.final_amount).toFixed(2)} | ID: ${r.id} | Status: ${r.status} | Nota: ${r.notes}`);
});

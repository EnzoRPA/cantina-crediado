import { db } from './src/shared/database/knex/index.js';
import { studentsService } from './src/modules/students/students.service.js';

async function testImport() {
  const schoolId = 'a0000000-0000-0000-0000-000000000001';
  
  // Dummy row simulating spreadsheet
  const rows = [
    ["Header"], // Header row
    [
      "Educação Infantil - EI Maternal (2 anos) - Tarde - A", // 0
      "TEST001", // 1
      "Teste Filho", // 2
      "CPF: 00000000000", // 3
      "01/01/2020", // 4
      "Masculino", // 5
      " ", // 6
      "Rua Teste, 123", // 7
      "Rua Teste", // 8
      "123", // 9
      "Bairro", // 10
      null, // 11
      "Cidade", // 12
      "MA", // 13
      "65900-000", // 14
      "Teste Pai", // 15
      "01/01/1990", // 16
      "Masculino", // 17
      "CPF: 11111111111", // 18
      " ", // 19
      "55 99 999999999", // 20
      "Endereço do pai" // 21
    ]
  ];

  try {
    const result = await studentsService.importStudents(schoolId, rows);
    console.log('Import results:', result);
  } catch (err) {
    console.error('Import crashed entirely:', err);
  }
}

testImport().then(() => process.exit(0)).catch(e => console.error(e));

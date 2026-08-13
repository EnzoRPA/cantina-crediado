process.env.DB_CLIENT = 'pg';

import { db, searchLike } from './src/shared/database/knex';

const query = db('students as s')
  .join('users as u', 's.user_id', 'u.id')
  .where(function () {
    this.where(searchLike('u.name', 'TEST_VALUE'))
      .orWhere(searchLike('s.enrollment_number', 'TEST_VALUE'));
  });

console.log("PostgreSQL SQL:", query.toSQL().toNative());
db.destroy();

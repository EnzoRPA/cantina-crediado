import knex from 'knex';

const pgDb = knex({
  client: 'pg',
  connection: 'postgresql://dummy:dummy@localhost:5432/dummy'
});

function searchLike(column: string, value: string) {
  return (builder: any) => {
    builder.whereRaw('LOWER(??) LIKE ?', [column, `%${value.toLowerCase()}%`]);
  };
}

const query = pgDb('students as s')
  .join('users as u', 's.user_id', 'u.id')
  .where(function () {
    this.where(searchLike('u.name', 'TEST_VALUE'))
      .orWhere(searchLike('s.enrollment_number', 'TEST_VALUE'));
  });

console.log("Guaranteed PG SQL:", query.toSQL().toNative());
pgDb.destroy();

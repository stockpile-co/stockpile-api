const test = require('ava')

const user = require('../controllers/user')

test('Without password', t => {
  const queryBuilder = {
    join: function () { return this },
    select: function () { return this }
  }
  const result = user.removePasswordAddRole(null, null, queryBuilder)
  t.true(result === queryBuilder, 'returns query builder')
})

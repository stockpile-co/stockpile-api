const sinon = require('sinon')
const test = require('ava')

const fixt = require('./fixtures/paginate')
const paginate = require('../services/paginate')

test('Paginate query', t => {
  const queryBuilder = {
    limit: sinon.stub(),
    offset: sinon.spy()
  }
  paginate(queryBuilder, fixt.req)
  t.true(queryBuilder.limit.calledOnce, 'limit is called')
  t.true(queryBuilder.offset.calledOnce, 'offset is called')
})

test('Paginate query with only limit', t => {
  const queryBuilder = {
    limit: sinon.spy(),
    offset: sinon.spy()
  }
  paginate(queryBuilder, fixt.reqOnlyLimit)
  t.true(queryBuilder.limit.calledOnce, 'limit is called')
  t.false(queryBuilder.offset.called, 'offset is not called')
})

test('Paginate query with only offset', t => {
  const queryBuilder = {
    limit: sinon.spy(),
    offset: sinon.spy()
  }
  paginate(queryBuilder, fixt.reqOnlyOffset)
  t.true(queryBuilder.offset.calledOnce, 'offset is called')
  t.false(queryBuilder.limit.called, 'limit is not called')
})

test('Paginate query with no parameters', t => {
  const queryBuilder = {
    limit: sinon.spy(),
    offset: sinon.spy()
  }
  paginate(queryBuilder, null)
  t.false(queryBuilder.limit.called, 'limit is not called')
  t.false(queryBuilder.offset.called, 'offset is not called')
})
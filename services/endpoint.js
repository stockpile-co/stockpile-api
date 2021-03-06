/**
 * Generalized endpoint functions
 *
 * These functions cover the most common use cases for most controllers.
 *
 * @exports services/endpoint
 */

const errors = require('restify-errors')

const db = require('../services/db')
const paginate = require('./paginate')

/**
 * Get all rows from a table, paginating or modifying query if appropriate
 *
 * @apiDefine Search
 *
 * @apiParam (Search) {string} [search] Value to search for
 * @apiParamExample Search
 * ?search=value
 *
 * @param {string} tableName Name of a database table
 * @param {function} [modify] Modify the query
 * @param {object} [messages] Custom messages for endpoint actions and errors
 * @param {boolean} [hasOrganizationID=true] If the table has an
 *   `organizationID` column or not (used in building where clauses)
 * @param {object[]} [sortBy] List of sorting criteria, ordered by priority (first is highest priority)
 * @param {string[]} [searchColumns] List of columns to search
 * @param {string} sortBy.column Column to sort by
 * @param {boolean} sortBy.ascending Whether to sort in ascending or descending order
 * @return {function} Endpoint handler
 */
module.exports.getAll =
  (tableName, {modify, messages, hasOrganizationID = true, sortBy, searchColumns} = {}) => {
    return (req, res, next) => {
      let search
      if (req.params.search) {
        search = {
          columns: searchColumns,
          value: req.params.search
        }
      }

      return db.getAll(tableName, hasOrganizationID && req.user.organizationID,
        module.exports.bindModify(modify, req), sortBy, search)
        .then(results => {
          // Add a sort index to each result
          results = results.map((result, i) => {
            result.sortIndex = i
            return result
          })

          // If pagination parameters in request, add pagination links
          if (req.params && (req.params.limit || req.params.offset)) {
            return paginate.addLinks(req, res, tableName)
              .then(() => res.send({results}))
              .then(next)
          } else {
            res.send({results})
            return next()
          }
        })
        .catch(err => module.exports.handleError(err, messages, next, req))
    }
  }

/**
 * Get a row from a table, identified by a column and value from the request
 * @param {string} tableName Name of a database table
 * @param {string} columnName Name of a column in the table
 * @param {function} [modify] Modify the query
 * @param {object} [messages] Custom messages for endpoint actions and errors
 * @param {boolean} [hasOrganizationID=true] If the table has an
 *   `organizationID` column or not (used in building where clauses)
 * @return {function} Endpoint handler
 */
module.exports.get =
  (tableName, columnName, {modify, messages, hasOrganizationID = true} = {}) => {
    return (req, res, next) => {
      return db.get(tableName, columnName, req.params[columnName],
        hasOrganizationID && req.user.organizationID,
        module.exports.bindModify(modify, req))
        .then(row => res.send(row))
        .then(next)
        .catch(err => module.exports.handleError(err, messages, next, req))
    }
  }

/**
 * Create a row in a table, returning a descriptive message
 * @param {string} tableName Name of a database table
 * @param {string} columnName Name of a column in the table
 * @param {function} [modify] Modify the query
 * @param {function} [resModify] Modify the query to get the created entity
 * @param {object} [messages] Custom messages for endpoint actions and errors
 * @param {boolean} [hasOrganizationID=true] If the table has an
 *   `organizationID` column or not (used in building where clauses)
 * @return {function} Endpoint handler
 */
module.exports.create =
  (tableName, columnName, {modify, resModify, messages, hasOrganizationID = true} = {}) => {
    return (req, res, next) => {
      // Add organization ID if it is missing
      if (hasOrganizationID && !req.body.organizationID && req.user) {
        req.body.organizationID = req.user.organizationID
      }

      return db.create(tableName, columnName, req.body, {
        modify: module.exports.bindModify(modify, req),
        resModify: module.exports.bindModify(resModify, req)
      })
        .then(row => { return res.send(row) })
        .then(next)
        .catch(err => module.exports.handleError(err, messages, next, req))
    }
  }

/**
 * Update a row in a table, returning the updated row
 * @param {string} tableName Name of a database table
 * @param {string} columnName Name of a column in the table
 * @param {function} [modify] Modify the query
 * @param {function} [resModify] Modify the query to get the created entity
 * @param {object} [messages] Custom messages for endpoint actions and errors
 * @param {boolean} [hasOrganizationID=true] If the table has an
 *   `organizationID` column or not (used in building where clauses)
 * @return {function} Endpoint handler
 */
module.exports.update =
  (tableName, columnName, {modify, resModify, messages, hasOrganizationID = true} = {}) => {
    return (req, res, next) => {
      return db.update(tableName, columnName, req.params[columnName], req.body,
        hasOrganizationID && req.user.organizationID, {
          modify: module.exports.bindModify(modify, req),
          resModify: module.exports.bindModify(resModify, req)
        })
        .then(updatedRow => { return res.send(updatedRow) })
        .then(next)
        .catch(err => module.exports.handleError(err, messages, next, req))
    }
  }

/**
 * Delete a row in a table, returning a descriptive message
 *
 * @apiDefine EndpointDelete
 *
 * @apiSuccess (200) {String} message Descriptive message
 * @apiSuccess (200) id ID of deleted entity
 * @apiSuccess (204) empty No body when item was already deleted
 *
 * @param {string} tableName Name of a database table
 * @param {string} columnName Name of a column in the table
 * @param {function} [modify] Modify the query
 * @param {object} [messages] Custom messages for endpoint actions and errors
 * @param {boolean} [hasOrganizationID=true] If the table has an
 *   `organizationID` column or not (used in building where clauses)
 * @return {function} Endpoint handler
 */
module.exports.delete =
  (tableName, columnName, {modify, messages, hasOrganizationID = true} = {}) => {
    return (req, res, next) => {
      return db.delete(tableName, columnName, req.params[columnName],
        hasOrganizationID && req.user.organizationID,
        module.exports.bindModify(modify, req))
        .then((rowsAffected) => {
          if (rowsAffected > 0) {
            res.send({
              message: module.exports.chooseMessage('delete', messages),
              id: req.params[columnName]
            })
          } else {
            res.send(204)
          }
          return next()
        })
        .catch(err => module.exports.handleError(err, messages, next, req))
    }
  }

/**
 * Default endpoint handler for new endpoints
 * @return {function} Endpoint handler
 */
module.exports.default = () => {
  return (req, res, next) => {
    res.send({})
    return next()
  }
}

/**
 * Choose a message from either custom or default messages
 * @param {string} type Type of message to choose
 * @param {object} [messages] Custom messages
 * @param {string} [messages.create] Message when row is created
 * @param {string} [messages.delete] Message when row is deleted
 * @param {string} [messages.conflict] Message when row is missing
 * @param {string} [messages.missing] Message when request is bad
 * @param {string} [messages.badRequest] Message when row is created
 * @param {string} [messages.default] Default message
 * @return {string} Chosen message
 */
module.exports.chooseMessage = (type, messages = {}) => {
  const defaultMessages = {
    create: 'Created',
    delete: 'Deleted',
    conflict: 'Already exists',
    missing: 'Does not exist',
    badRequest: 'Wrong fields',
    default: 'Something went wrong'
  }
  return messages[type] || defaultMessages[type] || defaultMessages.default
}

/**
 * Choose Restify error based on database error
 * @param {error} err Error from database
 * @param {object} [messages] Messages for endpoint events
 * @param {string} [messages.create] Message when row is created
 * @param {string} [messages.delete] Message when row is deleted
 * @param {string} [messages.conflict] Message when row is missing
 * @param {string} [messages.missing] Message when request is bad
 * @param {string} [messages.badRequest] Message when row is created
 * @param {string} [messages.default] Default message
 * @return {error} Restify error
 */
module.exports.chooseError = (err, messages) => {
  switch (err.code) {
    case 'ER_BAD_FIELD_ERROR':
      return new errors.BadRequestError(
        module.exports.chooseMessage('badRequest', messages))
    case 'ER_DUP_ENTRY':
      return new errors.ConflictError(
        module.exports.chooseMessage('conflict', messages))
    case 'ER_NOT_FOUND':
      return new errors.NotFoundError(
        module.exports.chooseMessage('missing', messages))
    case 'ER_SIGNAL_EXCEPTION':
      return new errors.BadRequestError(err.sqlMessage)
    default:
      return new errors.InternalServerError(
        module.exports.chooseMessage('default', messages))
  }
}

/**
 * Handle an error in an endpoint handler chain
 * @param {error} err Error from database
 * @param {object} [messages] Messages for endpoint events
 * @param {string} [messages.create] Message when row is created
 * @param {string} [messages.delete] Message when row is deleted
 * @param {string} [messages.conflict] Message when row is missing
 * @param {string} [messages.missing] Message when request is bad
 * @param {string} [messages.badRequest] Message when row is created
 * @param {string} [messages.default] Default message
 * @param {function} next Next handler in chain; will be given error
 * @param {object} req Restify request
 */
module.exports.handleError = (err, messages, next, req) => {
  req.log.error(err)
  next(module.exports.chooseError(err, messages))
}

/**
 *
 * @param {object} controller A module to define methods on
 * @param {string} table Name of a database table, assumed to also be
 *   name of entity
 * @param {object} [messages] Messages for endpoint events
 * @param {string} [messages.create] Message when row is created
 * @param {string} [messages.delete] Message when row is deleted
 * @param {string} [messages.conflict] Message when row is missing
 * @param {string} [messages.missing] Message when request is bad
 * @param {string} [messages.badRequest] Message when row is created
 * @param {string} [messages.default] Default message
 * @param {string} key Name of a column in a table
 */
module.exports.addAllMethods = (controller, table, key, messages = {}) => {
  controller.getAll = module.exports.getAll(table, {messages})
  controller.get = module.exports.get(table, key, {messages})
  controller.create = module.exports.create(table, key, {messages})
  controller.update = module.exports.update(table, key, {messages})
  controller.delete = module.exports.delete(table, key, {messages})
}

/**
 * Bind modify function if defined
 * @param {function} [modify] Query modifier
 * @param {any} params Parameters to bind
 * @return {function|undefined} Query modifier or 'undefined'
 */
module.exports.bindModify = (modify, ...params) => {
  if (modify) {
    return modify.bind(null, ...params)
  } else {
    return modify
  }
}

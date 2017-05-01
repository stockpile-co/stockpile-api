const bcrypt = require('bcrypt')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const passport = require('passport')
const passportJWT = require('passport-jwt')
const restify = require('restify')

const db = require('../services/db')

const jwtStrategyOptions = {
  jwtFromRequest: passportJWT.ExtractJwt.fromAuthHeaderWithScheme('Bearer'),
  secretOrKey: process.env.JWT_SECRET
}

// Create a token
const makeToken = module.exports.makeToken = (userID, organizationID, roleID) => {
  // Expire in fifteen minutes to propagate account deletion/role change quickly
  const jwtExpirationTime = '15m'
  const payload = {userID, organizationID, roleID}
  return jwt.sign(payload, process.env.JWT_SECRET, {expiresIn: jwtExpirationTime})
}

const auth = module.exports

auth.saltRounds = 10

auth.mount = app => {
  /**
   * @api {post} /auth Authenticate a user
   * @apiName Authenticate
   * @apiGroup Authentication
   *
   * @apiDescription Log a user in and receive a token to use in further
   *   requests.
   *
   * @apiParam {String} email User's email
   * @apiParam {String} password User's password
   *
   * @apiSuccess (200) {Number} id ID of user
   * @apiSuccess (200) {String} token Authorization token for use in requests
   * @apiSuccess (200) {String} refreshToken Refresh token used for getting a
   *   new access token
   * @apiSuccess (200) {String} message Descriptive message
   */
  app.post({name: 'authenticate', path: 'auth'}, auth.authenticate)
  /**
   * @api {post} /auth/refresh Issue a new access token given a valid refresh
   *   token
   * @apiName Refresh
   * @apiGroup Authentication
   *
   * @apiDescription When an access token expires, it is necessary to get a
   *   new access token in order to continue making requests.
   *
   * @apiParam {String} refreshToken Refresh token
   * @apiParam {Number} userID ID of user
   *
   * @apiSuccess (200) {String} token Authorization token for use in requests
   * @apiSuccess (200) {String} message Descriptive message
   */
  app.post({name: 'refresh', path: 'auth/refresh'}, auth.refresh)
  /**
   * @api {post} /auth/register Register a user
   * @apiName Register
   * @apiGroup Authentication
   *
   * @apiDescription See the guide on authentication at the top of these docs
   *   for an explanation of the registration and authentication process.
   *
   * @apiParam {String} email Email address
   * @apiParam {String} password Password
   * @apiParam {String} firstName First name
   * @apiParam {String} lastName Last name
   * @apiParam {Number} organizationID ID of organization that user belongs to
   * @apiParam {Number} [roleID=2] Role, defaults to "Member"
   * @apiParam {String} [archived] Date user was archived (YYYY-MM-DD)
   *
   * @apiSuccess (201) {Number} id ID of user
   * @apiSuccess (201) {String} message Descriptive message
   */
  app.post({name: 'register', path: 'auth/register'}, auth.register)
  /**
   * @api {head} /auth/verify Verify authentication
   * @apiName Verify
   * @apiGroup Authentication
   *
   * @apiDescription This endpoint is for checking whether a token is valid.
   *   Since it uses the `HEAD` method, it cannot take a body or parameters and
   *   will not return anything other than the responses listed below.
   *
   * @apiParam {String} email Email address
   * @apiParam {String} password Password
   *
   * @apiSuccess (200) empty No response body
   * @apiError 401 Token is not valid
   */
  app.head({name: 'verify', path: 'auth/verify'},
           auth.verify, auth.checkUserExists)
}

// Check user credentials and return token if valid
auth.authenticate = (req, res, next) => {
  if (req.body.email && req.body.password) {
    return db.get('user', 'email', req.body.email)
      .then(user => {
        const {password} = user
        return Promise.all([
          user,
          bcrypt.compare(req.body.password, password)
        ])
      })
      .then(([user, valid]) => {
        if (valid === true) {
          const token = makeToken(user.userID, user.organizationID, user.roleID)
          const refreshToken = user.userID +
                crypto.randomBytes(40).toString('hex')

          // Save refresh token for later validation
          return db.create('refreshToken', {userID: user.userID, refreshToken})
            .then(() => {
              return res.send({
                id: user.userID,
                refreshToken,
                token,
                message: 'Authentication successful'
              })
            })
        } else {
          return next(new restify.UnauthorizedError(
            'Email and password combination is incorrect'))
        }
      })
      .catch(() => {
        return next(new restify.UnauthorizedError(
          'Email and password combination is incorrect'))
      })
  } else {
    return next(new restify.BadRequestError('Missing email or password'))
  }
}

// Initialize Passport middleware
module.exports.initialize = passport.initialize()

// Provide a new access token given a valid refresh token
auth.refresh = (req, res, next) => {
  if (req.body.refreshToken && req.body.userID) {
    return db('refreshToken')
      .where('userID', req.body.userID)
      .first()
      .pluck('refreshToken')  // Get just the refresh token column
      .then(([storedToken]) => {
        if (req.body.refreshToken === storedToken) {
          return db('user').where('userID', req.body.userID).first()
            .then(user => {
              const token = makeToken(user.userID, user.organizationID,
                                      user.roleID)
              return res.send({token, message: 'Token refreshed successfully'})
            })
        } else {
          return next(new restify.UnauthorizedError('Refresh token is invalid'))
        }
      })
  } else {
    return next(new restify.BadRequestError(
      'Request must contain refresh token and user ID'))
  }
}

// Register a user
auth.register = (req, res, next) => {
  const required = [
    'firstName', 'lastName', 'email', 'password', 'organizationID'
  ]
  const bodyKeys = Object.keys(req.body)
  // Check request body contains all required keys
  if (required.every(key => bodyKeys.includes(key))) {
    return bcrypt.hash(req.body.password, auth.saltRounds)
      .then(hash => {
        req.body.password = hash
        return db.create('user', req.body)
      })
      .then(([userID]) => {
        return res.send(201, {
          id: userID,
          message: 'User successfully registered'
        })
      })
      .catch(next)
  } else {
    return next(new restify.BadRequestError())
  }
}

// Authenticate a user given a JWT payload
auth.authenticateToken = (payload, done) => {
  return db.get('user', 'userID', payload.userID)
    .then(user => done(null, user))
    .catch(done)
}

passport.use(new passportJWT.Strategy(jwtStrategyOptions, auth.authenticateToken))

// Verify that user is authenticated on a given path
auth.verify = passport.authenticate('jwt', { session: false })

// Check if user is attached to the request object
auth.checkUserExists = function checkUserExists (req, res, next) {
  if (req.user) {
    res.send(200)
  } else {
    return next(new restify.NotFoundError())
  }
}

// Check if user is admin
auth.checkAdmin = function checkAdmin (req, res, next) {
  const adminRoleID = 1
  if (req.user.roleID === adminRoleID) {
    return next()
  } else {
    return next(new restify.ForbiddenError('Must be an administrator'))
  }
}

// Check if user ID in token matches user ID in URL parameters
auth.checkUserMatches = function checkUserMatches (req, res, next) {
  if (req.user.userID === Number.parseInt(req.params.userID, 10)) {
    return next()
  } else {
    return auth.checkAdmin(req, res, next)
  }
}

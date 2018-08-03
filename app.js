"use strict";

var app = require("express")();
var swaggerTools = require("swagger-tools");
var YAML = require("yamljs");
var swaggerConfig = YAML.load("./api/swagger/swagger.yaml");
const cors = require('cors');

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const authenticate = jwt({
  // Dynamically provide a signing key based on the kid in the header and the singing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://digiglu.eu.auth0.com/.well-known/jwks.json`
  }),

  // Validate the audience and the issuer.
  aud: 'http://localhost:80/v1/',
  iss: `https://digiglu.eu.auth0.com/`,
  algorithms: ['RS256']
});

swaggerTools.initializeMiddleware(swaggerConfig, function(middleware) {

  app.use( cors() );
  app.use( authenticate.unless({method: 'GET'} ));

  app.use(middleware.swaggerMetadata());

  var routerConfig = {
    controllers: "./api/controllers",
    useStubs: false
  };

  app.use(middleware.swaggerRouter(routerConfig));

  app.listen(process.env.SRV_PORT, function() {
    console.log("Started server on port", process.env.SRV_PORT);
  });
});

'use strict';
var config = require('./config.json')

// LOGGING with WinstonJS
const winston = require('winston');
const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      json: true,
      timestamp: true,
      handleExceptions: true,
      colorize: false,
    })
  ]
});

var SwaggerParser = require('swagger-parser');
var R = require('ramda');

const axios = require('axios');

const uuidv4 = require('uuid/v4');
var mongoUtils = require('../utilities/mongoUtils')

var util = require('util');

//var mongoUtils = require('../utilities/mongoUtils')

var MongoClient = require('mongodb').MongoClient;

// Mongo URL
const mongourl = process.env.MONGO_STRING;
const dbname = process.env.MONGO_DB_NAME;

module.exports = {
  apiGet,
  apiFind
};

function apiFind(req, res) {
      res.json( [] )
}

function apiGet(req, res) {
  var apiURI = req.swagger.params.uri.value;
  var doc = {
    paths: []
  };

  SwaggerParser.parse(apiURI)
  .then(function(api) {

    //console.log("SPEC", JSON.stringify(api))

    doc.info = api.info;
    doc.host = api.host;
    doc.basePath = api.basePath;
    doc.spec = api;

    // paths
    doc.verbs = [];
    var pathArray = (R.compose(R.map(R.zipObj(['path', 'verbs'])), R.toPairs)(R.path(["paths"], api)))
    pathArray.forEach( p => {
      var path = {
        "name": p.path
      }
      var verbArray = (R.compose(R.map(R.zipObj(['name', 'details'])), R.toPairs)(R.path(["verbs"], p)));
      verbArray.forEach( v => {
        v.path = path.name;
        doc.verbs.push(v);
      })
      path.verbs = verbArray.filter( v => { return (v.name==='get'||v.name==='post'||v.name==='patch'||v.name==='put'||v.name==='delete')})
      doc.paths.push(path);
    });

    // togs [HACK]
    var tags=[];
    doc.verbs.forEach( v => {
      if (R.path(["details", "tags"])) {
        tags = tags.concat(R.path(["details", "tags"], v));
      }
    });
    doc.tags = R.uniq(tags);

    res.json( doc );
  }).catch( err => {
    console.error("ERROR:", err)
    res.json( err )
  });
}

function generateHalDoc( doc, url ) {
  // delete the mongodb _id attribute from the JSON document
  delete doc["_id"]

  // create _links

  doc._links= {
            self: {
                href: url
                }
            }

  // create _actions

  doc._actions = [];

  return doc;
}

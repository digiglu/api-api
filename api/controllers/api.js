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
  MongoClient.connect(mongourl, function(err, client) {
    if (err!=null) {
      res.status(500).send({ error: err });
      return;
    }
    const db = client.db(dbname);

    var pageno = req.swagger.params.page.value ? parseInt(req.swagger.params.page.value) : 1;

    // Fixed page size for now

    const pagesize = 15

    const firstitem = (pageno-1)*pagesize
    const lastitem = firstitem + pagesize

    let baseUrl = req.url;

    if (req.url.indexOf("?")>1) {
      baseUrl = req.url.slice( 0, req.url.indexOf("?") );
    }

    var teamArray = [];
    // Retrieve list of teams the user is member of
    axios.get( config.user_api_url + `/${req.user.sub}/organisation`, {
      headers: {
        Authorization: req.headers.authorization,
        Accept: req.headers.accept
      }
    })
    .then( r => {
      r.data._embedded.item.forEach( o => { teamArray.push(o.id); });
      var collection = db.collection('experiment');
      // Find some documents
      collection.find({ $or: [ {owner: req.user.sub}, {private: false}, {teamRef: { $in: teamArray }} ]},
        mongoUtils.fieldFilter(req.swagger.params.fields.value)).toArray(function(err, docs) {
          if (err!=null) {
            res.status(500).send({ error: err });
            return;
          }

          client.close();

          const totalsize = docs.length

          // slice page
          docs = docs.slice( firstitem, lastitem )

          // Generate experiment doc
          docs.forEach( function( item ) {
            item = generateHalDoc( item, baseUrl.concat( "/" ).concat( item.id ) )
          })

          // create HAL response

          var halresp = {};

          halresp._links = {
              self: { href: req.url },
              item: []
          }
          halresp._embedded = {item: []}
          halresp._embedded.item = docs

          // Add array of links
          docs.forEach( function( item ) {
              halresp._links.item.push( {
                    href: baseUrl.concat( "/" ).concat( item.id )
                  } )
          });

          // Pagination attributes
          halresp.page = pageno
          halresp.totalrecords = totalsize
          halresp.pagesize = pagesize
          halresp.totalpages = Math.ceil(totalsize/pagesize)

          // Create pagination links
          if ( totalsize > (pageno * pagesize) ) {
            halresp._links.next = { href: baseUrl.concat("?page=").concat(pageno+1)}
          }

          halresp._links.first = { href: baseUrl.concat("?page=1")};
          if ( pageno > 1 ) {
            halresp._links.previous = { href: baseUrl.concat("?page=").concat(pageno-1)}
          }

          halresp._links.last = { href: baseUrl.concat("?page=").concat(Math.ceil(totalsize/pagesize)) };

          res.json( halresp );
        });
    }).catch( err => {
      console.error("ERROR:", err)
      res.json( err )
    });
  });
}

function apiGet(req, res) {
  var apiURI = req.swagger.params.uri.value;
  var doc = {
    paths: []
  };

  SwaggerParser.parse(apiURI)
  .then(function(api) {
    // paths
    R.forEach( p => { doc.paths.push( { "name": p }) }, R.keys(api.paths));

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

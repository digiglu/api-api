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
  collectionGet,
  collectionFind,
  collectionCreate
};

function collectionCreate(req, res) {
  var collection = req.swagger.params.collection.value;

  collection.id = uuidv4()
  collection.owner = req.user.sub;
  collection.created = Date.now();
  collection.modified = Date.now();

  let baseUrl = req.url;

  if (req.url.indexOf("?")>1) {
    baseUrl = req.url.slice( 0, req.url.indexOf("?") );
  }
  var self = baseUrl + "/" + collection.id;

  var mongoDoc = Object.assign( {}, collection );

  // Use connect method to connect to the server
  MongoClient.connect(mongourl, function(err, client) {
    if (err!=null) {
      res.status(500).send({ error: err });
      return;
    }
    const db = client.db(dbname);

    // Get the documents collection
    var collection = db.collection('apiCollection');
    // Insert some documents
    collection.insert( mongoDoc, function(err, result) {
      if (err!=null) {
        res.status(500).send({ error: err });
        return;
      }

      client.close();

      });
    });
    res.json( generateHalDoc( collection, self ));
}

function collectionFind(req, res) {
  var refId = req.swagger.params.refId.value;

  MongoClient.connect(mongourl, function(err, client) {
    if (err!=null) {
      logger.warn("collectionFind: DB connection failed", {mongoString: process.env.MONGO_STRING});
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

    var collection = db.collection('apiCollection');
    // Find some documents
    collection.find({refId: refId},
      mongoUtils.fieldFilter(req.swagger.params.fields.value)).toArray(function(err, docs) {
        if (err!=null) {
          logger.warn("collectionFind: DB connection failed", {mongoString: process.env.MONGO_STRING});
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
  });
}

function collectionGet(req, res) {
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

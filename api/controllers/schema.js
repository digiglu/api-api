'use strict';
var config = require('./config.json')
const uuidv1 = require('uuid/v1');
const jsonSchemaDiff = require('json-schema-diff');

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
axios.defaults.headers.common['apikey'] = config.iglu_api_write_key;

const uuidv4 = require('uuid/v4');
var mongoUtils = require('../utilities/mongoUtils')

var util = require('util');

//var mongoUtils = require('../utilities/mongoUtils')

var MongoClient = require('mongodb').MongoClient;

// Mongo URL
const mongourl = process.env.MONGO_STRING;
const dbname = process.env.MONGO_DB_NAME;

module.exports = {
  schemaIgluCreate,
  schemaIgluGet,
  schemaCreate,
  schemaGet,
  schemaGetById,
  schemaFind,
  schemaDiff,
  schemaTransform
};

async function schemaDiff(req, res) {
  var srcId = req.swagger.params.srcId.value;
  var trgId = req.swagger.params.trgId.value;
  
  logger.info(`schemaDiff: ${srcId} <-> ${trgId}`)

  MongoClient.connect(mongourl, {useNewUrlParser: true}, async function(err, client) {
    if (err!=null) {
      res.status(500).send({ error: err });
      return;
    }
    var collection = client.db(dbname).collection('schema');
    try {
      // Get schema refs
      const srcSchemaRef = await collection.findOne( {id: srcId} )
      const trgSchemaRef = await collection.findOne( {id: trgId} )
      // Get schema docs
      const sourceSchema = await axios.get(srcSchemaRef.url)
      const targetSchema = await axios.get(trgSchemaRef.url)
      client.close();
      jsonSchemaDiff.diffSchemas( {sourceSchema: sourceSchema.data, destinationSchema: targetSchema.data})
      .then( result => {
        console.log("R", result)
        res.status(200).send( result );
      })
    } 
    catch(err) {
      logger.warn("schemaDiff: Error", err)
      res.status(500).send(err)
    }
  })
}

function schemaTransform(req, res) {
  var id = req.swagger.params.id.value;
  var transformTask = req.swagger.params.transformTask.value;
  
  logger.info(`schemaTransform: ${id}`)

  res.status(201).send( transformTask );
}

function schemaCreate(req, res) {
var schema = req.swagger.params.schema.value;
logger.info(`schemaCreate`)

schema.id = uuidv1();
schema.status = "Draft";
schema.owner = req.user.sub;
schema.created = Date.now();
schema.modified = Date.now();
schema.userName = req.user["https://experimenz.com/name"];

let baseUrl = req.url;

if (req.url.indexOf("?")>1) {
  baseUrl = req.url.slice( 0, req.url.indexOf("?") );
}
var self = baseUrl + "/" + schema.id;

var mongoDoc = Object.assign( {}, schema );

// Use connect method to connect to the server
MongoClient.connect(mongourl, function(err, client) {
  if (err!=null) {
    res.status(500).send({ error: err });
    return;
  }
  const db = client.db(dbname);

  // Get the documents collection
  var collection = db.collection('schema');
  // Insert some documents
  collection.insert( mongoDoc, function(err, result) {
    if (err!=null) {
      res.status(500).send({ error: err });
      return;
    }

    client.close();

    });
  });
  res.json( generateHalDoc( schema, self ));
}

function schemaGet(req, res) {
  res.json( [] )
}

function schemaFind(req, res) {
  var refId = req.swagger.params.refId.value;
  logger.info("schemaFind", {refId})

  MongoClient.connect(mongourl, function(err, client) {
    if (err!=null) {
      logger.warn("collectionFind: DB connection failed", {mongoString: process.env.MONGO_STRING, dbname: dbname, error: err});
      res.status(500).send({ error: err });
      return;
    }
    const db = client.db(dbname);

    var pageno = req.swagger.params.page.value ? parseInt(req.swagger.params.page.value) : 1;

    // Fixed page size for now

    const pagesize = 1000

    const firstitem = (pageno-1)*pagesize
    const lastitem = firstitem + pagesize

    let baseUrl = req.url;

    if (req.url.indexOf("?")>1) {
      baseUrl = req.url.slice( 0, req.url.indexOf("?") );
    }

    var collection = db.collection('schema');
    // Find some documents
    collection.find({experimentId: refId},
      mongoUtils.fieldFilter(req.swagger.params.fields.value)).toArray(function(err, docs) {
        if (err!=null) {
          logger.warn("collectionFind: DB connection failed", {mongoString: process.env.MONGO_STRING});
          res.status(500).send({ error: err });
          return;
        }

        client.close();

        const totalsize = docs.length

        logger.info("schemaFind", {size: docs.length})
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

function schemaIgluGet(req, res) {
  var id = req.swagger.params.id.value;
  var version  = req.swagger.params.version.value;

  var schemaURI = `https://i-glu.digiglu.io/api/schemas/apiglu/${id}/jsonschema/${version}`;

  axios.get(schemaURI)
  .then( response => {
    delete response.data['$schema'];
    delete response.data['self'];
    res.json( response.data );
  })
  .catch( err => {
    logger.warn("Schema not found", {uri: schemaURI, error: err})
    res.status(404).send();
  })
}

function schemaIgluCreate(req, res) {
  var id = req.swagger.params.id.value;
  var version  = req.swagger.params.version.value;
  var schema = req.swagger.params.schema.value;

  schema["$schema"] = "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#"
	schema.self = {
		"vendor": "apiglu",
		"name": id,
		"format": "jsonschema",
		"version": version
	}

  logger.info("schemaIgluCreate", {schema})

  var schemaURI = `https://i-glu.digiglu.io/api/schemas/apiglu/${id}/jsonschema/${version}`;

  axios.post(schemaURI, schema)
  .then( response => {
    delete response.data['$schema'];
    delete response.data['self'];
    res.json( response.data );
  })
  .catch( err => {
    logger.warn("Schema creation failed", {uri: schemaURI, error: err.message, status: err.status})
    res.status(500).send();
  })
}

function schemaGetById(req, res) {
  // Use connect method to connect to the server
  MongoClient.connect(mongourl, function(err, client) {
    var schemaId = req.swagger.params.id.value;

    if (err!=null) {
      res.status(500).send({ error: err });
      return;
    }

    const db = client.db(dbname);
    var collection = db.collection('schema');
    const query = { id: schemaId }

    // Find one document
    collection.findOne( query,
      mongoUtils.fieldFilter(), function(err, schema) {
        if (err!=null) {
          logger.warn("schemaGetById: DB error", {user: req.user.sub, id: schemaId })
          res.status(500).send({ error: err });
          return;
        }
      client.close();

      // Fetch schema from iglu repository
      axios.get(schema.url)
      .then( response => {
        delete response.data['$schema'];
        delete response.data['self'];
        schema.schema = response.data

        // Base class schemas
        schema.baseSchema = []
        schema.reference = []
        if (schema.schema.allOf) {
          schema.schema.allOf.forEach( b => { schema.baseSchema.push(b["$ref"])})
        }
        // Find references [FIX-ME] - Quick and Dirty Hack
        if (schema.schema.properties) {
          for (var prop in schema.schema.properties) {
            if (Object.prototype.hasOwnProperty.call(schema.schema.properties, prop)) {
                if (schema.schema.properties[prop].items && schema.schema.properties[prop].items["$ref"]) {
                    schema.reference.push(schema.schema.properties[prop].items["$ref"])
                }
            }
          }
        }
        res.json( generateHalDoc( schema, req.url ) )
      })
      .catch( err => {
        logger.warn("schemaGetById: Schema not found", {uri: schema.url, error: err})
        res.status(404).send();
      })
    });
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

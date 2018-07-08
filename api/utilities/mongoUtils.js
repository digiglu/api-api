'use strict';

module.exports = { fieldFilter };

function fieldFilter ( urlString ) {
    var fieldList = []
    if ( urlString != undefined ) {
      fieldList =  urlString.split(",")
    }

    var filter = '{'
    if (fieldList.length > 0) {
      fieldList.forEach( function(item) {
        var filterItem = '"' + item + '": 1,'
        filter = filter.concat( filterItem )
      })
      filter = filter.concat('"id": 1,')
    }
    filter = filter.concat('"_id": 0 }')

    return JSON.parse(filter);
}

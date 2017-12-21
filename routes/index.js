var express = require('express');
var router = express.Router();
var auth = require('basic-auth');
var data = require('../server/data.json');

/**
 * Uses HTTP BASIC authentication to autheticate the request.
 * @param req The request object.
 * @param res The response object.
 * @param next The middleware callback.
 */
function isAuthorized(req, res, next) {
    // If there's no configured HTTP BASIC authentication user name or password, don't worry about authorization
    if (!process.env.HTTP_AUTH_USERNAME || !process.env.HTTP_AUTH_PASSWORD) {
        next();
    }
    // Otherwise authorize the user
    else {
        var user = auth(req);

        // Ensure the user name and password match
        if (!user || user.name !== process.env.HTTP_AUTH_USERNAME || user.pass !== process.env.HTTP_AUTH_PASSWORD) {
            res.status(401);
            res.json({ error: 'Access Denied' });
            res.end();
        }
        else {
            next();
        }
    }
}

/**
 * Index page.
 */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Grafana SimpleJSON Value Mapper' });
});

/**
 * This is the API endpoint that Grafana Simple JSON Datasources uses for metrics and template variables.
 */
router.post('/search', isAuthorized, function(req, res, next) {
    // console.log(req.query);
    // If there was no target to the search, return an empty result
    if (!req.body || !req.body.target || req.body.target.length === 0) {
        res.json([]);
    }
    // Otherwise, parse the target further
    else {
        // If the body isn't JSON, it's a metric search which is unsupported for this implementation
        if (req.body.target[0] !== "{") {
            res.status(400).json({ error: 'query should be a JSON object'});
            return;
        }

        // Try parsing the query
        try {
            // Parse the query
            var query = JSON.parse(req.body.target);

            // Get the contains filter if one exists
            var containsFilter = query.contains ? query.contains.toString().toLowerCase() : null;

            // Prepare the results
            var results = [];

            // Validate
            if (!query.data || typeof(query.data) !== 'string') {
                res.status(400).json({ error: '"data" must be a string' });
                return;
            }

            console.log(query);

            // Get the target data
            var values = data[query.data];

            // Make sure they were found
            if (!values) {
                res.status(400).json({ error: 'no data found for data target: ' + query.data });
                return;
            }

            // Check to see if there is one or more ID filters
            var idFilters = {};
            var hasIdFilters = query.id && query.id.length > 0;

            // Is this an array/list of values?
            // if (typeof(values.length) === 'number') {
            if (Array.isArray(values)) {
                // Go through each value
                for (var i = 0; i < values.length; i++) {
                    var val = values[i];

                    pushResults(results, val, val, containsFilter);
                }
            }
            // Otherwise this is an aliased look-up
            else {
                // If so, construct the ID filters object
                if (hasIdFilters) {
                    // If it starts with parentheses, it's a list of IDs separated by '|' character
                    if (query.id[0] === "(") {
                        var rawIds = query.id.substring(1, query.id.length - 1);
                        var parsedIds = rawIds.split("|");

                        // Add each filter ID
                        for (var i = 0; i < parsedIds.length; i++) {
                            idFilters[parsedIds[i]] = true;
                        }
                    }
                    // Otherwise it's a single ID
                    else {
                        idFilters[query.id] = true;
                    }
                }
                // Go through each value
                for (var id in values) {
                    var val = values[id];

                    if(hasIdFilters){
                        // Make sure the ID is found
                        if (!val) continue;
                    }
                    pushResults(results, val, id, containsFilter);
                }
            }

            console.log(results || []);

            // Return results
            res.json(results || []);
        }
        catch (e) {
            res.status(400).json({ error: e.toString() });
        }
    }
});



function pushResults(results, val, id, containsFilter){
    console.log(values[id]); // ["IS-50529","IS-51150"] of Array type.
    // If there's a contains filter, apply it
    if (!containsFilter || id.toLowerCase().indexOf(containsFilter) !== -1) {
        results.push({ text: val, value: id });
    }
}

module.exports = router;

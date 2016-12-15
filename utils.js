var DigitalOcean = require('do-wrapper');
var CFClient = require('cloudflare');
var async = require('async');
var request = require('request');
var parseDomain = require('parse-domain');

// for now only working using CPU metric
var cpu = "/api/v1/data?chart=system.cpu&format=array&points=60&group=average&options=absolute|jsonwrap|nonzero&after=-50";

// monitor a project
module.exports.check_status = function (name, key) {
	api = new DigitalOcean(key, 1000);
	api.dropletsGetAll({tag_name : name + "-slave"}, function (err, data, body) {
		var num_droplets = body.droplets.length;
		async.map(body.droplets, getInfoDroplet, function (err, results) {
		// all droplets are functioning properly
			console.log(results);
		})
	})
}

// delete all slaves, master and DNS of a certain project
module.exports.deleteProject = function (item, cb) {
	// do client
	api = new DigitalOcean(item.digital_ocean.key, 1000);
	// clouflare cliente
	var client = new CFClient({
		email: item.cloudflare.email,
		key: item.cloudflare.key
	});
	api.dropletsGetAll({tag_name : item.project}, function (err, data, body) {
		// delete all droplets
		body.droplets.forEach(function (drop) {
			var id = drop.id;
			var ip = drop.networks.v4[0].ip_address;
			var tmp = parseDomain(item.cloudflare.domain);
			var root_domain = tmp.domain + '.' + tmp.tld;
			client.browseZones({name : root_domain}).then(function (value) {
				var zone = value.result[0].id;
				// check all DNS records for that zone
				client.browseDNS(zone, {content : ip}).then(function (value) {
					// check if it has a DNS for the droplet
					if(value.result[0]) {
						// delete the DNS
						client.deleteDNS(value.result[0]).then(function (value) {
							// delete the droplet
							api.dropletsDelete(id, function (resp) {
								cb(resp);
							})
						})
					} else {
						// only delete the droplet
						api.dropletsDelete(id, function (resp) {
							cb(resp);
						})
					}

				})
			});
		});
	})
}

// get CPU usage of a certain DROPLET
function getInfoDroplet(droplet, cb) {
	request.get("http://" + droplet.networks.v4[0].ip_address + ":19999" + cpu, function(err, data, body) {
		if(err) {
			cb(null, null);
		} else {
			var resp = JSON.parse(body).result;
			cb(null, resp.reduce(function(a, b) { return a + b; }) / resp.length);
		}
	})
};
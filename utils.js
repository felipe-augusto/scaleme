var DigitalOcean = require('do-wrapper');
var CFClient = require('cloudflare');
var async = require('async');
var request = require('request');
var parseDomain = require('parse-domain');

var cpu = "/api/v1/data?chart=system.cpu&format=array&points=60&group=average&options=absolute|jsonwrap|nonzero&after=-50";

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

module.exports.deleteProject = function (item, cb) {
	// do client
	api = new DigitalOcean(item.digital_ocean.key, 1000);
	// clouflare cliente
	var client = new CFClient({
		email: item.cloudflare.email,
		key: item.cloudflare.key
	});
	api.dropletsGetAll({tag_name : item.project + "-slave"}, function (err, data, body) {
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
					if(value.result[0]) {
						client.deleteDNS(value.result[0]).then(function (value) {
							console.log(value);
							api.dropletsDelete(id, function (resp) {
								cb(resp);
							})
						})
					} else {
						api.dropletsDelete(id, function (resp) {
							cb(resp);
						})
					}

				})
			});
		});
	})
}

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
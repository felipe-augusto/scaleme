var fs = require('fs');
var data = fs.readFileSync('slave.conf', 'utf8');
var request = require('request');
var async = require('async');
var _ = require('lodash')


var CFClient = require('cloudflare');
var client = new CFClient({
    email: 'fesntmail@gmail.com',
    key: ''
});

var cpu = "/api/v1/data?chart=system.cpu&format=array&points=60&group=average&options=absolute|jsonwrap|nonzero&after=-50";

var DigitalOcean = require('do-wrapper');

api = new DigitalOcean("", 1000);

var root_domain = "thamus.com.br";
var domain = "hello.thamus.com.br";

var MIN = 1;

api.dropletsGetAll({tag_name : "test-slave"}, function (err, data, body) {
	var num_droplets = body.droplets.length;
	async.map(body.droplets, getDropletData, function (err, results) {
		// all droplets are functioning properly
		console.log(results);
		if(num_droplets == results.length) {
			// need to check if the droplets has DNS
			client.browseZones({name : root_domain}).then(function (value) {
				// domains does not have ZONE
				if(value.result.length == 0) {
					// throw error
					console.log('Erro: Arquivo de zona nao encontrado. Este dominio esta cadastrado no CloudFlare?');
				} else {
					// domain has zone
					var zone = value.result[0].id;
					// check all DNS records for that zone
					client.browseDNS(zone).then(function (value) {
						value = value.result.map(function(item) {
							return item.name;
						});
						results.map(function (item) {
							// if not on DNS we should put it
							if(!_.includes(value, item)) {
								createDNSRecord(item, zone, function (resp) {
									console.log(resp);
								})
							};
						})
					})
				};
			});
			// check alarms
			async.map(body.droplets, getInfoDroplet, function (err, results) {
				var average = results.reduce(function(a, b) { return a + b; }) / results.length;
				if(average < 10 && body.droplets.length > 1) {
					var droplet_id = body.droplets[body.droplets.length - 1].id;
					var droplet_ip = body.droplets[body.droplets.length - 1].networks.v4[0].ip_address;
					// domains does not have ZONE
					client.browseZones({name : root_domain}).then(function (value) {
						if(value.result.length == 0) {
							// throw error
							console.log('Erro: Arquivo de zona nao encontrado. Este dominio esta cadastrado no CloudFlare?');
						} else {
							// domain has zone
							var zone = value.result[0].id;
							// check all DNS records for that zone
							client.browseDNS(zone, {content : droplet_ip}).then(function (value) {
								client.deleteDNS(value.result[0]).then(function (value) {
									console.log(value);
									api.dropletsDelete(droplet_id, function (resp) {
										console.log(resp);
									})
								})
							})
						};
					});
				}
			})
		} else {
			// some droplet is not functioning properly
			// perhaps is a recent start
			console.log("num diff");
		}
	});

})

function getDropletData(droplet, cb) {
	request.get("http://" + droplet.networks.v4[0].ip_address + ":19999" + cpu, function(err, data, body) {
		if(err) {
			console.log("nao esta pronto");
			cb(null, null);
		} else {
			cb(null, { "server" : "s" + droplet.name.split(".")[1] + "." + root_domain, "ip" : droplet.networks.v4[0].ip_address});
		}
	})
}

function createDNSRecord(item, zone, cb) {
	// ns record
	// var ns = CFClient.DNSRecord.create({ 
	// 	zone_id: zone,
	// 	type: 'NS',
	// 	name: domain,
	// 	content: item.server
	// });
	// a record
	var a = CFClient.DNSRecord.create({ 
		zone_id: zone,
		type: 'A',
		name: domain,
		content: item.ip
	});
	client.addDNS(a).then(function (value) {
			cb(true);
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
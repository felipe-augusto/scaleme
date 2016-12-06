var fs = require('fs');
var data = fs.readFileSync('slave.conf', 'utf8');
var request = require('request');
//console.log(data);

var cpu = "/api/v1/data?chart=system.cpu&format=array&points=10&group=average&options=absolute|jsonwrap|nonzero&after=-10";

var DigitalOcean = require('do-wrapper');

api = new DigitalOcean("", 1000);

api.dropletsGetAll({tag_name : "test-slave"}, function (err, data, body) {
	console.log(body.droplets.length);
	body.droplets.map(function (item) {
		console.log(item.networks.v4[0].ip_address);
		if(err) {
			console.log(err);
		}
		request.get("http://" + item.networks.v4[0].ip_address + ":19999" + cpu, function(err, data, body) {
			if(err) {
				console.log("nao esta pronto");
			} else {
				console.log("estamos prontos");
				// adicionar no balanceador de carga

				// verificar se nao precisa de mais servidores

				// verificar se nao precisa de menos servidores
				console.log(body);
			}
		})
	});
})
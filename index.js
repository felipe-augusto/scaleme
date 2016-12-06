#!/usr/bin/env node

var program = require('commander');
var fs = require('fs');
var DigitalOcean = require('do-wrapper');
 
program
  .version('0.0.1')
  .option('-f, --file [type]', 'Add config file', '')
  .parse(process.argv);
 
 // reads an input file
if (program.file) {
	fs.readFile(program.file, 'utf8', function (err, data) {
		if (err) throw err;
		var obj = JSON.parse(data);
		// check how is the provider
		if(obj.digital_ocean) {
			api = new DigitalOcean(obj.digital_ocean.key, 1000);
			// update file
			var slave_conf = fs.readFileSync('slave.conf', 'utf8');
			slave_conf = slave_conf.replace(/\$\(folder\)/g, splitGit(obj.git));
			slave_conf = slave_conf.replace(/\$\(url\)/g, obj.git);
			slave_conf = slave_conf.replace(/\$\(port\)/g, obj.port);
			console.log(slave_conf);
			//creates a slave droplet
			api.dropletsCreate({
				"name": obj.project + "-slave",
				"region": obj.digital_ocean.region,
				"size": obj.digital_ocean.size,
				"image": "docker",
				"ssh_keys": null,
				"backups": false,
				"ipv6": false,
				"private_networking": false,
				"tags": [
					obj.project + "-slave"
				],
				"user_data": slave_conf
			},function (err, res, body) {
				console.log(err);
				console.log(body);
			});
		}
	});
}

function splitGit(url) {
	var tamanho = url.split("/").length;
	var pre = url.split("/")[tamanho - 1];
	return pre.split(".")[0];
}
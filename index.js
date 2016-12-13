#!/usr/bin/env node

var program = require('commander');
var fs = require('fs');
var DigitalOcean = require('do-wrapper');
var jsonfile = require('jsonfile');
var utils = require('./utils');
var parseDomain = require('parse-domain');
var CFClient = require('cloudflare');

var file = __dirname + '/data/projects.json';

var projects = readProjects();

program
  .version('0.0.1')
  .option('-s, --start [type]', 'Start a new project', '')
  .option('-l, --list', 'List', '')
  .option('-m, --monitor [type]', 'Show monitor of certain project', '')
  .option('-d, --delete [type]', 'Delete a project (terminate)', '')
  .option('-t, --test', 'test', '')
  .parse(process.argv);

if(program.test) {
	var config = JSON.parse(fs.readFileSync('config.sm', 'utf8'));
	var master = fs.readFileSync('master.conf', 'utf8');
	makeMasterConf(config, master);
}
 
// starts a new project
if (program.start) {
	fs.readFile(program.start, 'utf8', function (err, data) {
		if (err) throw err;
		var obj = JSON.parse(data);
		// check if project already exists
		if (getProjectInfo(obj.project) !==  false) {
			console.log('Project already exists - create another');
			return;
		}
		// check if it has a zone file at cloudflare
		var client = new CFClient({
		    email: obj.cloudflare.email,
		    key: obj.cloudflare.key
		});
		var tmp = parseDomain(obj.cloudflare.domain);
		var root_domain = tmp.domain + '.' + tmp.tld;
		client.browseZones({name : root_domain}).then(function (value) {
			if(value.result.length == 0) {
				// throw error
				console.log('Error: Zone file not found. Is ' + root_domain + ' on CloudFlare?');
			} else {
				// zone file OK, create the droplets
				if(obj.digital_ocean) {
					api = new DigitalOcean(obj.digital_ocean.key, 1000);
					// update file
					var slave_conf = fs.readFileSync('slave.conf', 'utf8');
					slave_conf = slave_conf.replace(/\$\(folder\)/g, splitGit(obj.git));
					slave_conf = slave_conf.replace(/\$\(url\)/g, obj.git);
					slave_conf = slave_conf.replace(/\$\(port\)/g, obj.port);
					//creates a slave droplet
					projects.push(obj);
					console.log('Criando slave droplet');
					createDroplet(obj, slave_conf, function (resp) {
						if(resp) {
							console.log("Salvando arquivo de configuraçoes");
							jsonfile.writeFile(file, projects, function (err) {
								console.error(err)
							})
						}
					});
					var master_conf = fs.readFileSync('master.conf', 'utf8');
					master_conf = master_conf.replace(/\$\(INFO\)/g, JSON.stringify(obj));
					console.log('Criando master droplet');
					createMaster(obj, master_conf, function (resp) {
						if(resp) {

						}
					});
				}
			}
		})
	});
}

// list all the projects online
if(program.list) {
	var projects = readProjects();
	projects.forEach(function (item) {
		console.log(item.project);
	})
}

// get information about a particular project
if(program.monitor) {
	getProjectInfo(program.monitor);
}

// delete a particular project
if(program.delete) {
	var projects = readProjects();
	var current = projects.filter(function (item) {
		// need to delete this
		if(item.project == program.delete) {
			utils.deleteProject(item, function () {
				console.log("Tudo certo!");
			});
		} 
		return item.project != program.delete
	});
	jsonfile.writeFile(file, current, function (err) {
		console.error(err)
	})
}

function getProjectInfo(name) {
	var projects = readProjects();
	var current = projects.filter(function (item) { 
		return item.project == name
	});
	if(current.length == 0) {
		return false;
	} else {
		utils.check_status(current[0].project, current[0].digital_ocean.key)
		return true;
	}
}

function createDroplet(obj, slave_conf, cb) {
	api.dropletsCreate({
		"name": obj.project + "-slave." + Math.floor((Math.random() * 1000) + 1),
		"region": obj.digital_ocean.region,
		"size": obj.digital_ocean.size,
		"image": "docker",
		"ssh_keys": null,
		"backups": false,
		"ipv6": false,
		"private_networking": false,
		"tags": [
			obj.project + "-slave",
			obj.project
		],
		"user_data": slave_conf
	},function (err, res, body) {
		cb(body);
	});
}

function createMaster(obj, master_conf, cb) {
	api.dropletsCreate({
		"name": obj.project + "-master",
		"region": obj.digital_ocean.region,
		"size": obj.digital_ocean.size,
		"image": "docker",
		"ssh_keys": null,
		"backups": false,
		"ipv6": false,
		"private_networking": false,
		"tags": [
			obj.project
		],
		"user_data": master_conf
	},function (err, res, body) {
		cb(body);
	});
}

function splitGit(url) {
	var tamanho = url.split("/").length;
	var pre = url.split("/")[tamanho - 1];
	return pre.split(".")[0];
}

function readProjects() {
	var file = 'data/projects.json';
	try {
		return jsonfile.readFileSync(file);
	} catch (err) {
		return [];
	}
}

function makeMasterConf (config, master) {
	console.log(config.cloudflare);
	var tmp = parseDomain(config.cloudflare.domain);
	var root_domain = tmp.domain + '.' + tmp.tld;
	master = master.replace(/\$\(CLOUDFLARE_EMAIL\)/g, config.cloudflare.email)
				.replace(/\$\(PROJECT_NAME\)/g, config.project)
				.replace(/\$\(CLOUDFLARE_KEY\)/g, config.cloudflare.key)
				.replace(/\$\(DO_KEY\)/g, config.digital_ocean.key)
				.replace(/\$\(DOMAIN\)/g, config.cloudflare.domain)
				.replace(/\$\(ROOT_DOMAIN\)/g, root_domain)
				.replace(/\$\(MIN\)/g, config.scaler_rules.min)
				.replace(/\$\(MAX\)/g, config.scaler_rules.max)
				.replace(/\$\(INFO\)/g, JSON.stringify(config));
	console.log(master)
}
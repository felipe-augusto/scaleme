#!/usr/bin/env node

var program = require('commander');
var fs = require('fs');
var DigitalOcean = require('do-wrapper');
var jsonfile = require('jsonfile');
var utils = require('./utils');
var parseDomain = require('parse-domain');
var CFClient = require('cloudflare');

// file that we record all projects
var file = __dirname + '/data/projects.json';

var projects = readProjects();

program
  .version('0.0.1')
  .option('-s, --start [type]', 'Start a new project', '')
  .option('-l, --list', 'List', '')
  .option('-m, --monitor [type]', 'Show monitor of certain project', '')
  .option('-d, --delete [type]', 'Delete a project (terminate)', '')
  .parse(process.argv);
 
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
				// end execution
				console.log('Error: Zone file not found. Is ' + root_domain + ' on CloudFlare?');
			} else {
				// zone file OK, create the droplets
				if(obj.digital_ocean) {
					api = new DigitalOcean(obj.digital_ocean.key, 1000);
					// push project to file
					projects.push(obj);
					var slave_conf = fs.readFileSync('slave.conf', 'utf8');
					// replace conf with input variables from user
					slave_conf = slave_conf.replace(/\$\(folder\)/g, splitGit(obj.git));
					slave_conf = slave_conf.replace(/\$\(url\)/g, obj.git);
					slave_conf = slave_conf.replace(/\$\(port\)/g, obj.port);
					// creates a slave droplet
					console.log('Criando slave droplet');
					createSlave(obj, slave_conf, function (resp) {
						if(resp) {
							console.log("Salvando arquivo de configuraçoes");
							// write to file
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
		// check if need to delete
		if(item.project == program.delete) {
			utils.deleteProject(item, function () {
				console.log("All Good!");
			});
		} 
		return item.project != program.delete
	});
	// remove from the file the project
	jsonfile.writeFile(file, current, function (err) {
		console.error(err)
	})
}

// return if the project exists and shows in the console
// monitoring information
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

// create slave droplet
function createSlave(obj, slave_conf, cb) {
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


// create master droplet (scaler)
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

// get the name of the git project to make the folder
function splitGit(url) {
	var tamanho = url.split("/").length;
	var pre = url.split("/")[tamanho - 1];
	return pre.split(".")[0];
}

// read projects from file
function readProjects() {
	var file = 'data/projects.json';
	try {
		return jsonfile.readFileSync(file);
	} catch (err) {
		return [];
	}
}
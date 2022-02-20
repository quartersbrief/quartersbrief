import { config } from './quartersbrief.conf.js';
import log from 'loglevel';
import { assertInvariants, InvariantError } from './src/quartersbrief.assert.js';
import { BattleController } from './src/core/battlecontroller.js';
import { GameObjectFactory } from './src/model/gameobjectfactory.js';
import { AgendaStore } from './src/briefing/agendastore.js';
import createServers from './src/core/server.js';
import { BriefingMaker } from './src/core/briefingmaker.js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import pug from 'pug';

try {
	config.required([ 'wowsdir' ]);
} catch (err) {
	log.error('Missing required parameter \'wowsdir\'. Either pass it using --wowsdir or set it in your quartersbrief.conf. Exiting.');
	process.exit(1);
}

// Make sure that the replays directory we will be watching actually exists
// If it doesn't, this is a non-recoverable error, because this program is pointless without it.
if (!existsSync(path.join(config.get('wowsdir'), 'replays'))) {
	log.error(`Could not find replays directory at ${path.join(config.get('wowsdir'), 'replays')}.\nReplays must be turned on for this program to work.\nSee https://eu.wargaming.net/support/en/products/wows/article/15038/ for information on how to enable replays.`);
	process.exit(1);
}
// Make sure that GameParams.json is available
if (!existsSync(path.join(config.get('datadir'), 'GameParams.json'))) {
	log.error(`Could not find game data at ${path.join(config.get('datadir'), 'GameParams.json')}`);
	process.exit(1);
}

let data;
{
	let t0 = Date.now();
	data = JSON.parse(readFileSync(path.join(config.get('datadir'),'GameParams.json')));
	log.info(`Loaded game data in ${Date.now() - t0}ms.`);
}

if (!config.get('skipInvariants')) {
	try {
		assertInvariants(data);
	} catch (err) {
		if (err instanceof AggregateError && err.errors.every(error => error instanceof InvariantError)) {
			log.error(`${err.message} ${err.errors.map(e => e.message + '\n')}.\nThis means that an important assumption this app depends upon to function correctly was not true.\nYou can start with the --skip-invariants option to disable invariant checking. Exiting.`);
			process.exit(1);
		} else {
			log.error(`${err} ${err.stack}`);
			process.exit(1);
		}
	}
} else {
	log.warn(`Skipped invariant checking.`);
}

const gameObjectFactory = new GameObjectFactory(data);
const agendaStore = new AgendaStore(config.get('agendasdir'));
const battleController = new BattleController(path.join(config.get('wowsdir'), 'replays')); // No problem to hardcode this, because it is always the same according to https://eu.wargaming.net/support/en/products/wows/article/15038/
const briefingMaker = new BriefingMaker(path.join(config.get('wowsdir'), 'replays'), gameObjectFactory, agendaStore);

const { srv, io } = createServers(config.get('host'), config.get('port'));

const indexTemplate = pug.compileFile('./src/core/index.pug');
srv.get('/', async function(req, res) {
	let briefing = await briefingMaker.makeBriefing();	
	let html = indexTemplate({ briefing: briefing });
	res.send(html);
});

battleController.on('battlestart', function() {
	io.emit('battlestart');
});

battleController.on('battleend', function() {
	io.emit('battleend');
});


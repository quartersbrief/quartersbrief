import { readFile } from 'fs/promises';
import { PlayerFactory } from '../../../model/playerfactory.js';
import { config } from '../../../../quartersbrief.conf.js';
import pug from 'pug';

async function buildHtml(battle, gameObjectFactory, options) {
	let players = await new PlayerFactory(config.apiKey, config.realm).getPlayers(battle.getVehicles().map(vehicle => vehicle.name));	
	
	const allies = battle.getAllies();
	allies.push(battle.getPlayer());
	const enemies = battle.getEnemies();
	allies.forEach(ally => ally.player = players[ally.name]);
	enemies.forEach(enemy => enemy.player = players[enemy.name]);

	const locals = { allies, enemies, player: battle.getPlayer() };
	return pug.renderFile('src/briefing/topics/winrate/winrate.pug', locals);
}

async function buildScss() {
	return readFile('src/briefing/topics/winrate/winrate.scss');
}

export default async function buildTopic(battle, gameObjectFactory, options) {
	return {
		html: await buildHtml(battle, gameObjectFactory, options),
		scss: await buildScss(battle, gameObjectFactory, options)
	}
}
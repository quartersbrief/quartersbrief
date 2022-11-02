import pug from 'pug';
import sass from 'sass';
import { ShipBuilder } from '../../../util/shipbuilder.js';
import { SKILLS } from '../../../model/captain.js';
import { filters, teams } from '../common.js';
import { sassFunctions } from '../common.js';

const BASE_BUILD = {
	modules: 'stock'
}
const HEALTH_BUILD = {
	modules: 'top',
	skills: [ SKILLS.SURVIVABILITY_EXPERT ]
}
const DPM_BUILD = {
	modernizations: [ 'PCM013_MainGun_Mod_III' ]
}

const knifefighting = configuration => configuration.health * configuration.dpm.pertinent;

function buildHtml(battle, gameObjectFactory, options) {
	let shipBuilder = new ShipBuilder(gameObjectFactory);
	let ships = battle.getVehicles()
		.map(vehicle => vehicle.shipId)
		// Filter out duplicates
		.filter(filters.duplicates)
		.map(shipId => shipBuilder.build(shipId, BASE_BUILD))
		// If options.filter.classes is set, filter the ships list accordingly
		.filter(ship => options?.filter?.classes?.includes(ship.getClass()) ?? true);
		
	const entries = ships.map(ship => {
			const entry = { ship, base: {}, max: {} };			

			const guns = ship.get('artillery.mounts.*.numBarrels').reduce((prev, curr) => prev + curr, 0);
			entry.base.health = ship.getHealth();
			entry.base.reload = ship.get('artillery.mounts.*.shotDelay', { collate: true });

			entry.base.dpm = {};
			ship.get('artillery.mounts.*.ammoList')[0].forEach(ammo => {
				let ammoType = ammo.get('ammoType').toLowerCase();
				if (ammoType === 'cs') ammoType = 'sap';
				entry.base.dpm[ammoType] = ammo.get('alphaDamage') * guns * 60 / entry.base.reload;
			});
			entry.base.dpm.pertinent = Math.max(entry.base.dpm.cs ?? 0, entry.base.dpm.he ?? 0) || entry.base.dpm.ap;
			entry.base.knifefighting = knifefighting(entry.base);

			shipBuilder.build(ship, HEALTH_BUILD);
			entry.max.health = ship.getHealth();

			shipBuilder.build(ship, DPM_BUILD);
			entry.max.reload = ship.get('artillery.mounts.*.shotDelay', { collate: true });
			entry.max.dpm = {};
			ship.get('artillery.mounts.*.ammoList')[0].forEach(ammo => {
				entry.max.dpm[ammo.get('ammoType').toLowerCase()] = ammo.get('alphaDamage') * guns * 60 / entry.max.reload;
			});
			entry.max.dpm.pertinent = Math.max(entry.max.dpm.cs ?? 0, entry.max.dpm.he ?? 0) || entry.max.dpm.ap;
			entry.max.knifefighting = knifefighting(entry.max);

			return entry;
		});

	entries.sort((e1, e2) => e1.max.knifefighting - e2.max.knifefighting);

	let locals = {
		teams: teams(battle),
		entries,
		options
	}
	return pug.renderFile('src/briefing/topics/knifefighting/knifefighting.pug', locals);
}

async function buildScss(battle, gameObjectFactory, options) {
	return sass.compile('src/briefing/topics/knifefighting/knifefighting.scss', {
		loadPaths: ['node_modules'],
		functions: {
			...sassFunctions.options(options)
		}
	}).css;
}

export default async function buildTopic(battle, gameObjectFactory, options) {
	return {
		html: buildHtml(battle, gameObjectFactory, options),
		scss: await buildScss(battle, gameObjectFactory, options),
		caption: 'Knife Fighting Value'
	}
}
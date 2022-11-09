import Topic from '../../topic.js';
import { ShipBuilder } from '../../../util/shipbuilder.js';
import { SKILLS } from '../../../model/captain.js';

const HEALTH_BUILD = {
	modules: 'top',
	skills: [ SKILLS.SURVIVABILITY_EXPERT ]
}
const DPM_BUILD = {
	modernizations: [ 'PCM013_MainGun_Mod_III' ]
}

const knifefighting = configuration => configuration.health * configuration.dpm.pertinent;

export default class KnifefightingTopic extends Topic {
	caption = 'Knife Fighting Value';

	async getPugData(battle, options) {
		let shipBuilder = new ShipBuilder(this.gameObjectFactory);

		const locals = await super.getPugData(battle, options);
		const entries = locals.ships.map(ship => {
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
		locals.entries = entries;

		return locals;
	}
}
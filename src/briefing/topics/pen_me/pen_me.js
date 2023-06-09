import Topic from '../../topic.js';
import { ShipBuilder } from '../../../util/shipbuilder.js';
import { SKILLS } from '../../../model/captain.js';
import clone from 'clone';

const TOP_BUILD = {
	modules: 'top'
}

export default class HEPenMeTopic extends Topic {
	caption = 'HE & SAP Vulnerability';

	async getPugData(battle, options) {
		options = clone(options) ?? {};
		options.filter = options.filter ?? {};
		options.filter.teams = [ 'enemies' ];

		const shipBuilder = new ShipBuilder(this.gameObjectFactory);
		const locals = await super.getPugData(battle, options);
		locals.ships = locals.ships.filter(ship => 'artillery' in ship)
			.filter(ship => {
				const ammos = ship.get('artillery.mounts.*.ammoList.*.ammoType');
				return ammos.includes('HE') || ammos.includes('CS');
			})
			.map(ship => shipBuilder.build(ship, TOP_BUILD));

		locals.ownship = shipBuilder.build(locals.teams.player, TOP_BUILD);
		locals.armor = {
			side: await this.armorViewer.view(locals.ownship, 'side'),
			top: await this.armorViewer.view(locals.ownship, 'top'),
		};
		
		locals.pens = {};
		locals.ships.forEach(ship => {
			const pen = { ship, caliber: ship.artillery.getCaliber(), ammos: {} };
			const ammos = ship.get('artillery.mounts.*.ammoList', { collate: true }).filter(ammo => ammo.get('ammoType') !== 'AP');
			ammos.forEach(ammo => {
				const piercing = ammo.get(`alphaPiercing${ammo.get('ammoType')}`);
				let ammoType = ammo.get('ammoType');
				if (ammoType === 'CS') ammoType = 'SAP';
				pen.ammos[ammoType.toLowerCase()] = piercing;
			});
			// Get pen with IFHE:
			ship = shipBuilder.build(ship, { skills: [ SKILLS.INERTIA_FUSE_FOR_HE_SHELLS ]});
			pen.ammos.ifhe = ship.get('artillery.mounts.*.ammoList', { collate: true }).find(ammo => ammo.get('ammoType') === 'HE')?.get('alphaPiercingHE');

			locals.pens[ship.getName()] = pen;			
		});

		return locals;
	}
}
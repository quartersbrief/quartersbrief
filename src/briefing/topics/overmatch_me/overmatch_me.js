import Topic from '../../topic.js';
import { ShipBuilder } from '../../../util/shipbuilder.js';
import clone from 'clone';

const TOP_BUILD = {
	modules: 'top'
}

export default class OvermatchMeTopic extends Topic {
	caption = 'Overmatch Threat';

	async getPugData(battle, options) {
		options = clone(options) ?? {};
		options.filter = options.filter ?? {};
		options.filter.teams = [ 'enemies' ];

		const shipBuilder = new ShipBuilder(this.gameObjectFactory);
		const locals = await super.getPugData(battle, options);
		locals.ships = locals.ships
			.filter(ship => 'artillery' in ship)
			.map(ship => shipBuilder.build(ship, TOP_BUILD))
			.sort((ship1, ship2) => ship2.artillery.getCaliber() - ship1.artillery.getCaliber());

		locals.ownship = shipBuilder.build(locals.teams.player, { modules: 'top' });
		locals.armor = {
			side: await this.armorViewer.view(locals.ownship, 'side'),
		};

		return locals;
	}
}
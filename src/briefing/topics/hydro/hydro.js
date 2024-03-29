import Topic from '../../topic.js';
import ShipBuilder from '../../../util/shipbuilder.js';
import { BW_TO_METERS } from '../../../util/conversions.js';
import { SKILLS } from '../../../model/captain.js';

const BASE_BUILD = {
	modules: 'top'	
}
const HYDRO_BUILD = {
	modernizations: [ 'PCM041_SonarSearch_Mod_I', 'PCM072_AbilityWorktimeBoost_Mod_I' ],
	signals: [ 'PCEF029_Sonar_AirDef_SignalFlag' ],
	skills: [ SKILLS.CONSUMABLES_ENHANCEMENTS ],
}

export default class HydroTopic extends Topic {
	async getPugData(battle, options) {
		let shipBuilder = new ShipBuilder(this.gameObjectProvider);

		const locals = await super.getPugData(battle, options);
		locals.ships = locals.ships.filter(ship => 'sonar' in ship.consumables)

		let hydros = {};
		await Promise.all(locals.ships.map(async ship => {
			ship = await shipBuilder.build(ship, BASE_BUILD)
			// Round range to 50m precision, to avoid drawing separate circles for what is effectively the same range
			// if ships' consumables' distShip is slightly different (which will be magnified by the conversion to meters)
			let range = 50 * Math.round(BW_TO_METERS * ship.consumables.sonar.distShip / 50);
			const hydro = {
				ship: ship,
				baseTime: ship.consumables.sonar.workTime,
				maxTime: (await shipBuilder.build(ship, HYDRO_BUILD)).consumables.sonar.workTime,
				cooldown: ship.consumables.sonar.reloadTime
			};

			hydros[range] ??= [];
			hydros[range].push(hydro);
		}));
		locals.hydros = hydros;

		return locals;
	}
}
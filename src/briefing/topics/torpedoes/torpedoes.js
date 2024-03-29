import Topic from '../../topic.js';
import ShipBuilder from '../../../util/shipbuilder.js';
import { SKILLS } from '../../../model/captain.js';


const CONCEALMENT_BUILD = {
	modernizations: [ 'PCM027_ConcealmentMeasures_Mod_I' ],
	skills: [ SKILLS.CONCEALMENT_EXPERT ]
}
const TORPEDO_BUILD = {
	modernizations: [ 'PCM014_Torpedo_Mod_III', 'PCM070_Torpedo_Mod_IV', 'PCM057_Special_Mod_I_Shimakaze', 'PCM075_Special_Mod_I_Daring' ],
	skills: [ SKILLS.SWIFT_FISH, SKILLS.FILL_THE_TUBES, SKILLS.ENHANCED_TORPEDO_EXPLOSIVE_CHARGE, SKILLS.LIQUIDATOR ],
	signals: [ 'PCEF017_VL_SignalFlag', 'PCEF019_JW1_SignalFlag' ]
}

export default class TorpedoesTopic extends Topic {
	async getPugData(battle, options) {
		let shipBuilder = new ShipBuilder(this.gameObjectProvider);
		const locals = await super.getPugData(battle, options);
		locals.ships = locals.ships.filter(ship => ship.torpedoes)
		
		const entries = await Promise.all(locals.ships.map(async ship => {
			const entry = { 
				ship,
				// Build generation is asynchronous, because shipBuilder.build is asynchronous. Since builds all work on the same
				// ship, we cannot simply do Promise.all here, since this would introduce a race condition on the state of the ship.
				// 
				// Instead, we use reduce here to execute build generation sequentially for each build of the ship. 
				// See https://gist.github.com/anvk/5602ec398e4fdc521e2bf9940fd90f84?permalink_comment_id=2260005#gistcomment-2260005
				// (Notice that the ships themselves are still all handled concurrently).
				// 
				// An alternative would have been to work on independent copies of the ship, but getting new ships is an expensive
				// operation.
				builds: await ship.refits.torpedoes.reduce((acc, module, index) => acc.then(async acc => {
					await shipBuilder.build(ship, { 
						modules: `torpedoes: ${index}, others: top`,
						...TORPEDO_BUILD,
						...CONCEALMENT_BUILD
					});	
				
					const build = {
						tubes: { port: [], center: [], starboard: [] },
						reload: ship.torpedoes.get('mounts.*.reload', { collate: true }),
						torpedoes: Object.values(ship.torpedoes.get('mounts.*.ammos', { collate: true })).map(torpedo => ({
							torpedo: torpedo,
							range: Math.round(torpedo.range / 50) * 50, // Round to 50m precision
							damage: torpedo.damage,
							speed: torpedo.speed,
							visibility: torpedo.visibility,
							flooding: torpedo.floodChance
						}))
					}					
					ship.torpedoes.get('mounts').forEach(mount => {
						let side = [ 'port', 'center', 'starboard' ][Math.sign(mount.get('position')[1] - 1) + 1]; // Any mount position smaller/larger than 1 results in port/stbd (resp.), position 1 is center
						build.tubes[side].push(mount.barrels);
					});

					return acc.concat(build);
				}), Promise.resolve([]))
			};
			
			[ 'range', 'damage', 'speed', 'flooding' ].forEach(property => entry[property] = Math.max(...entry.builds.flatMap(build => build.torpedoes).map(torpedo => torpedo[property])));
			[ 'visibility' ].forEach(property => entry[property] = Math.min(...entry.builds.flatMap(build => build.torpedoes).map(torpedo => torpedo[property])));

			entry.reload = Math.min(...entry.builds.map(build => build.reload));
			// Find the build with largest total number of tubes
			const sum = (arr) => arr.reduce((prev,curr) => prev + curr, 0);
			entry.tubes = entry.builds
				.map(build => Object.values(build.tubes).flat())
				.reduce((prev, curr) => sum(curr) > sum(prev) ? curr : prev);
			return entry;
		}));
		locals.entries = entries;
		locals.ownship = await this.gameObjectProvider.createGameObject(battle.player.shipId);
		return locals;
	}
}
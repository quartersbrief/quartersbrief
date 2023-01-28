import GameObjectFactory from '../../src/model/gameobjectfactory.js';

/**
 * The `SpecificityChooser` selects the agenda that most specifically matches the player's ship in the battle. 
 * Specificity is calculated according to the following rules:
 * - `ships` matched: 100 pts
 * - `classes`, `tiers`, `nations` matched: 10 pts each.
 *
 * This is somewhat inspired by the way CSS selectors work.
 */
export default class SpecificityChooser {	
	static POINTS = {
				ships: 100,
				classes: 10,
				tiers: 10,
				nations: 10		
	}
	static PENALTY = -10000;

	constructor(gameObjectFactory) {
		if (!gameObjectFactory || !(gameObjectFactory instanceof GameObjectFactory))
			throw new TypeError(`Need a GameObjectFactory to create a ${this.constructor.name} but got ${gameObjectFactory}`);

		this.gameObjectFactory = gameObjectFactory;
	}

	/**
	 * Calculates the specificity score of the given `match`, awarding points for each clause as per {@link SpecificityStrategy#POINTS}.
	 * 
	 * @return {number} The specificity score of the match.
	 */
	scoreOf(match) {
		let score = 0;
		for (let prop in match) {
			score += SpecificityChooser.POINTS[prop];
		}

		return score;
	}

	/**
	 * Chooses the highest-scoring agenda that matches the ship. If no agendas match the ship,
	 * `chooseAgendas` returns `null`.
	 * @param  {Ship} ship    The ship for which to match.
	 * @param {Agenda[]} agendas The agendas from which to choose.
	 * @return {Agenda}        Returns the agenda with the highest specificity score that matched
	 * the ship, or `null` if no agendas matched.
	 */
	choose(battle, agendas) {
		const ownship = this.gameObjectFactory.createGameObject(battle.getPlayer().shipId);

		return agendas
			// Map each agenda to an object containing the agenda and all its matchers that matched this battle, if any
			.map(agenda => ({ agenda, matches: agenda.matches(ownship) }))
			// Filter out agendas that didn't match at all
			.filter(entry => entry.matches)
			// For each agenda, find its highest scoring matcher and remember that score
			.map(entry => ({ 
				agenda: entry.agenda, 
				score: Math.max(...entry.matches.map(matcher => this.scoreOf(matcher))) 
			}))
			// Find the highest scoring one, or default to null if no agendas matched
			.reduce((prev, curr) => curr.score > prev.score ? curr : prev, { agenda: null, score: -Infinity})
			// Return the agenda of the highest scorer
			.agenda;
	}
}
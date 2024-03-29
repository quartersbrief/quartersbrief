import Agenda from '../../src/agendas/agenda.js';
import Ship from '../../src/model/ship.js';

describe('Agenda', function() {
	describe('constructor', function() {
		it('should turn a matchers section that is an object into an array', function() {
			const matcher = {};
			const agenda1 = new Agenda(matcher);
			const agenda2 = new Agenda([matcher]);

			expect(agenda1).to.deep.equal(agenda2);
		});
	});

	describe('.matches', function() {
		let ship;

		beforeEach(function() {
			ship = Object.create(Ship, {
				'name': { value: 'PAAA001_Test1' },
				'tier': { value: 8 },
				'class': { value: 'Battleship' }
			});
		});

		it('should return an array of all matchers the ship matches', function() {
			const matchers = [
				{
					classes: [ ship.class ],
					tiers: [ ship.tier ]					
				},
				{
					ships: [ ship.name ]
				}
			];
			const agenda = new Agenda(matchers);

			expect(agenda.matches(ship)).to.have.members(matchers);
		});
		
		it('should return null if the ship matches none of the matchers', function() {
			const matchers = [{
				tiers: [ 0 ]
			}];
			const agenda = new Agenda(matchers);

			expect(agenda.matches(ship)).to.be.null;
		});
	});

	describe('.getTopicNames', function() {
		it('should return the names of all topics of the agenda in the order they were defined', function() {
			expect(new Agenda(null, {
				topic1: {},
				topic2: {}
			}).getTopicNames()).to.be.an('array').with.ordered.members([ 'topic1', 'topic2' ]);
		});		

		it('should reorder the names according to their position attribute', function() {
			expect(new Agenda(null, {
				topic1: {},
				topic2: { position: 0 },
			}).getTopicNames()).to.be.an('array').with.ordered.members([ 'topic2', 'topic1' ]);
		});

		it('should respect the first topic when more than one topic reorders to the same position', function() {
			expect(new Agenda(null, {
				topic1: {},
				topic2: { position: 0 },
				topic3: { position: 0 }
			}).getTopicNames()).to.be.an('array').with.ordered.members([ 'topic2', 'topic3', 'topic1' ]);
		});

		it('should have topic data for all returned topic names', function() {
			let agenda = new Agenda(null, {
				topic1: { prop: 'prop' },
				topic2: { prop: 'prop' }
			});
			agenda.getTopicNames().forEach(topic => expect(agenda.topics[topic]).to.have.property('prop'));
		});
	});
});

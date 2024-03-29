import Captain from '../../src/model/captain.js';
import Ship from '../../src/model/ship.js';
import Modifier from '../../src/model/modifier.js';
import clone from 'lodash/cloneDeep.js';

describe('Captain', function() {
	const SHIP = {
		name: 'PAAA001_Battleship',
		index: 'PAAA001',
		id: 1,
		level: 8,
		typeinfo: { 
			species: 'Battleship',
			type: 'Ship'
		}
	}

	const CAPTAIN = {
		CrewPersonality: {
			ships: {
				groups: [],
				nation: [ 'USA' ],
				peculiarity: [],
				ships: []
			},
		},
		Skills: {
			BattleshipSkill1: {
				modifiers: {
					EngineValue: 2
				},
				skillType: 1
			},
			BattleshipSkill2: {
				modifiers: {
					ArtilleryValue: 3
				},
				skillType: 2
			},
			CruiserSkill: {
				modifiers: {
					EngineValue: 3
				},
				skillType: 3
			}
		},
		id: 3,
		name: 'PAW001_Captain',
		index: 'PAW001',
		typeinfo: {
			nation: 'USA',
			species: null,
			type: 'Crew'
		}
	}

	let ship;
	let captain;
	let classSkills;
	let knownTargets;

	before(function() {
		ship = Object.create(Ship.prototype, Object.getOwnPropertyDescriptors({
			_data: SHIP,
		}));

		classSkills = Captain.CLASS_SKILLS;
		Captain.CLASS_SKILLS = { 
			Battleship: [1,2],
			Cruiser: [2,3]
		}
		knownTargets = Modifier.KNOWN_TARGETS;
		Modifier.KNOWN_TARGETS = { EngineValue: 'engine.value', ArtilleryValue : 'artillery.value' };
	});

	after(function() {
		Captain.CLASS_SKILLS = classSkills;
		Modifier.KNOWN_TARGETS = knownTargets;
	});

	beforeEach(function() {
		captain = new Captain(clone(CAPTAIN));
	});

	describe('.getLearnableForShip', function() {
		it('should return only skills that are in the skill list for the ship\'s species', function() {
			expect(captain.getLearnableForShip(ship)).to
				.be.an('array')
				.with.deep.members([ 
					new Captain.Skill(CAPTAIN.Skills.BattleshipSkill1), 
					new Captain.Skill(CAPTAIN.Skills.BattleshipSkill2)
				]);
		});		
	});

	describe('.learn', function() {
		it('should learn a skill that is provided as an object', function() {
			let skill = captain.skills[0];
			captain.learn(skill);
			expect(captain.skills).to.include(skill);
		});

		it('should learn a skill that is provided by number', function() {
			let skill = 1;
			captain.learn(skill);
			skill = captain.skills.find(s => s.skillNumber === skill);
			expect(captain.learned).to.include(skill);
		});

		it('should not learn the same skill more than once', function() {
			let skill = captain.skills[0];
			expect(captain.learned).to.be.empty;
			captain.learn(skill);
			expect(captain.learned).to.have.lengthOf(1);
			captain.learn(skill); // Learn the same skill again
			expect(captain.learned).to.have.lengthOf(1);
		});

		it('should learn all skills when passed an array of skills or numbers', function() {
			let s1 = captain.skills[0];
			let s2 = captain.skills[1];
			expect(captain.learned).to.be.empty;
			captain.learn([s1, s2.skillNumber]);
			expect(captain.learned).to.be.an('array').with.deep.members([s1, s2]);
		});
	});

	describe('.getLearnedForShip', function() {
		it('should not return skills that have not been learned', function() {
			expect(captain.getLearnedForShip(ship)).to.be.empty;
			captain.learn(CAPTAIN.Skills.BattleshipSkill1.skillType);
			expect(captain.getLearnedForShip(ship)).to.be.an('array').with.lengthOf(1);
			captain.learn(CAPTAIN.Skills.BattleshipSkill2.skillType);
			expect(captain.getLearnedForShip(ship)).to.be.an('array').with.lengthOf(2);
		});

		it('should return a skill that has been learned before', function() {
			let skill = new Captain.Skill(CAPTAIN.Skills.BattleshipSkill1);
			captain.learn(skill);
			expect(captain.getLearnedForShip(ship)).to.deep.include(skill);
		});

		it('should not return any skills that do not match the ship\'s type', function() {
			captain.learned = captain.skills; // Learn all skills
			let learned = captain.getLearnedForShip(ship);
			expect(learned).to.be.an('array');
			learned.forEach(skill => expect(skill.eligible(ship)).to.be.true);
		});
	});

	describe('.eligible', function() {
		// Helper function to overwrite properties in CrewPersonality.ships with those from the traits parameter
		function changeTraits(data, traits) {
			for (let key in traits)
				data.CrewPersonality.ships[key] = traits[key];

			return data;
		}

		it('should always return true when the ship is whitelisted', function() {
			// This test creates a test captain and adds the ship to whitelist. It then
			// checks that this captain is eligible to command the ship regardless of 
			// the values of the other eligiblity traits.

			const data = clone(CAPTAIN);
			data.CrewPersonality.ships.ships = [ ship.name ];

			captain = new Captain(changeTraits(clone(data), {}));
			expect(captain.eligible(ship), 'ships').to.be.true;
			
			captain = new Captain(changeTraits(clone(data), { nation: [ 'Germany' ] }));
			expect(captain.eligible(ship), 'nation').to.be.true;

			captain = new Captain(changeTraits(clone(data), { groups: [ 'somegroup' ] }));			
			expect(captain.eligible(ship), 'groups').to.be.true;

			captain = new Captain(changeTraits(clone(data), { peculiarity: [ 'somepeculiarity' ] }));
			expect(captain.eligible(ship), 'peculiarity').to.be.true;
		});

		it('should return true when nation, group, and peculiarity match, false otherwise', function() {
			let ship = Object.create(Ship.prototype, Object.getOwnPropertyDescriptors({
				peculiarity: 'somepeculiarity',
				group: 'somegroup',
				typeinfo: {
					type: Ship,
					nation: 'USA'
				},				
				get nation() { return this.typeinfo.nation } 
			}));

			captain = new Captain(changeTraits(clone(CAPTAIN), {
				peculiarity: ['somepeculiarity'],
				groups: ['somegroup'],
				nation: [ ship.nation ],
				ships: []
			}));
			expect(captain.eligible(ship)).to.be.true;

			captain = new Captain(changeTraits(clone(CAPTAIN), {
				peculiarity: ['somepeculiarity'],
				groups: ['somegroup'],
				nation: [ 'Germany' ],
				ships: []
			}));			
			expect(captain.eligible(ship)).to.be.false;
			
			captain = new Captain(changeTraits(clone(CAPTAIN), {
				peculiarity: ['somepeculiarity'],
				groups: ['someothergroup'],
				nation: [ ship.nation ],
				ships: []
			}));			
			expect(captain.eligible(ship)).to.be.false;
			
			captain = new Captain(changeTraits(clone(CAPTAIN), {
				peculiarity: ['someotherpeculiarity'],
				groups: ['somegroup'],
				nation: [ ship.nation ],
				ships: []
			}));			
			expect(captain.eligible(ship)).to.be.false;			
		});

		it('should ignore nation, group, peculiarity and ship when they are empty', function() {
			captain = new Captain(changeTraits(clone(CAPTAIN), {
				peculiarity: [],
				groups: [],
				nation: [],
				ships: []
			}));			
			expect(captain.eligible(ship)).to.be.true;
		});
	});

	describe('.isDefault', function() {
		it('should return true if tags is empty, personName is \'\' and peculiarity is \'default\', false otherwise', function() {
			let data = clone(CAPTAIN);
			data.CrewPersonality = {
				peculiarity: 'default',
				personName: '',
				tags: []
			};

			captain = new Captain(data);
			expect(captain.isDefault()).to.be.true;

			data = clone(CAPTAIN);
			data.CrewPersonality.tags = [ 'tag' ];
			captain = new Captain(data);
			expect(captain.isDefault()).to.be.false;

			data = clone(CAPTAIN);
			data.CrewPersonality.peculiarity = 'not-default';
			captain = new Captain(data);
			expect(captain.isDefault()).to.be.false;

			data = clone(CAPTAIN);
			data.CrewPersonality.personName = 'somename';
			captain = new Captain(data);
			expect(captain.isDefault()).to.be.false;
		});
	});

	describe('Captain.Skill', function() {
		describe('.eligible', function() {
			it('should be true for skills that match the ship and false otherwise', function() {
				let skill = new Captain.Skill(CAPTAIN.Skills.BattleshipSkill1);
				expect(skill.eligible(ship), 'matching ship').to.be.true;
				skill = new Captain.Skill(CAPTAIN.Skills.CruiserSkill);
				expect(skill.eligible(ship), 'non-matching ship').to.be.false;
			});
		});

		describe('.getModifiers', function() {
			it('should return modifier objects only for those modifiers where it is known how to deal with them', function() {
				let skill = new Captain.Skill(CAPTAIN.Skills.BattleshipSkill1);
				expect(skill.getModifiers()).to
					.be.an('array')
					.with.lengthOf(1);
			});
		});
	});

});
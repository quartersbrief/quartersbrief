const GameObjectProvider = (await esmock('../../src/providers/gameobjectprovider.js', {}, {
	'fs': vol, 'fs/promises': vol.promisesApi
})).default;

import Consumable from '../../src/model/consumable.js';
import Gun from '../../src/model/gun.js';
import Artillery from '../../src/model/modules/artillery.js';
import Torpedoes from '../../src/model/modules/torpedoes.js';
import Hull from '../../src/model/modules/hull.js';
import Engine from '../../src/model/modules/engine.js';

import { vol } from 'memfs';
import esmock from 'esmock';
import path from 'path';
import omit from 'lodash/omit.js';

describe('GameObjectProvider @integration', function() {
	const SOURCEPATH = '/data';
	
	// Helper function to populate the source path with the game objects in the array `data`.
	// For convenience, if there is only one object, it can be passed directly instead of as an array.
	function populate(data) {
		if (!Array.isArray(data)) data = [ data ];

		for (let obj of data) {
			const master = path.format({
				dir: SOURCEPATH,
				name: obj.name,
				ext: '.json'
			});
			vol.writeFileSync(master, JSON.stringify(obj));
			[ 'index', 'id' ].forEach(link => obj[link] && vol.linkSync(master, path.format({ // For convenience, allow index and/or id to be absent. Then we just won't create that link.
				dir: SOURCEPATH,
				name: obj[link],
				ext: '.json'
			})));
		}
	}

	let gameObjectProvider;

	beforeEach(function() {
		// Mock labeler that just returns the input when asked to label
		const mockLabeler = {
			label: x => x
		}
		gameObjectProvider = new GameObjectProvider(SOURCEPATH, mockLabeler);
	});
	
	describe('.createGameObject', function() {
		const GAME_OBJECT = {
			name: 'PAAA001_Test1',
			index: 'PAAA001',
			id: 1,
			typeinfo: {
				type: 'Ability'
			}
		}
		beforeEach(function() {
			vol.fromNestedJSON({
				[SOURCEPATH]: {}
			});
		});

		afterEach(function() {
			vol.reset();
		});

		// eslint-disable-next-line mocha/no-setup-in-describe
		[ 'name', 'index', 'id'	].forEach(designatorType =>
			it(`should read the game object from disk when requested by ${designatorType}`, async function() {
				populate([ GAME_OBJECT ]);
				
				const gameObject = await gameObjectProvider.createGameObject(GAME_OBJECT[designatorType]);

				expect(gameObject._data).to.deep.equal(GAME_OBJECT);
			})
		);

		it('should return throw an error if the requested object could not be retrieved', function() {
			// Don't populate source path with anything this time
		
			return expect(gameObjectProvider.createGameObject('PAAA001_Test1')).to.be.rejected;
		});

		describe('processing', function() {
			const SHIP = {
				name: 'PAAA001_Test1',
				index: 'PAAA001',
				id: 1,
				ShipUpgradeInfo: {},
				ShipAbilities: { AbilitySlot0: { abils: [] }},
				typeinfo: {
					type: 'Ship'
				}
			};

			describe('gun expansion', function() {
				const GUN = {
					ammoList: [],
					typeinfo: {
						type: 'Gun',
						species: 'Main'
					}
				}
				const ammo = { 
					name: 'PAAA002_Test2',
					ammoType: 'he',
					typeinfo: {
						type: 'Projectile',
						species: 'Artillery'
					}
				}

				it('should expand guns\' ammo defitinions', async function() {
					const artillery = {
						AB1_Artillery: {
							HP_AGM_1: {
								...GUN,
								ammoList: [ 'PAAA002_Test2' ],
							}
						}
					};
					const ship = Object.assign({}, SHIP, artillery);
					populate([ ship, ammo ]);

					const result = (await gameObjectProvider.createGameObject(ship.name))._data
						.AB1_Artillery._data
						.HP_AGM_1._data
						.ammoList;

					expect(result).to.be.an('array').with.lengthOf(1);
					expect(result[0]._data).to.deep.equal(ammo);
				});

				it('should have separate ammo objects for different guns', async function() {
					const artillery = {
						AB1_Artillery: {
							HP_AGM_1: { ...GUN, ammoList: [ 'PAAA002_Test2' ] },
							HP_AGM_2: { ...GUN, ammoList: [ 'PAAA002_Test2' ] }
						}
					};
					const ship = Object.assign({}, SHIP, artillery);
					populate([ ship, ammo ]);

					const result = (await gameObjectProvider.createGameObject(ship.name))._data.AB1_Artillery._data;

					expect(result.HP_AGM_1._data.ammoList[0]).to.not.equal(result.HP_AGM_2._data.ammoList[0]);
				});

				it('should expand inline gun definitions into Gun objects', async function() {
					const artillery = {
						AB1_Artillery: {
							HP_AGM_1: GUN
						}
					};
					const ship = Object.assign({}, SHIP, artillery);
					populate(ship);

					const result = (await gameObjectProvider.createGameObject(ship.name))._data.AB1_Artillery._data;

					expect(result).to.have.property('HP_AGM_1')
					// esmock messes with the constructor references, so the one imported by esmock in GameObjectProvider
					// and the one imported at the top of this file are not identical.
					// As a workaround (aka ugly hack), we just check that their string representations are the same.
					expect(result.HP_AGM_1.constructor.toString()).to.equal(Gun.toString());
					expect(result.HP_AGM_1._data).to
						.deep.equal(artillery.AB1_Artillery.HP_AGM_1);
				});

			});

			describe('module conversion', function() {
				const FIXTURES = {
					Artillery: {
						HP_AGM_1: {
							ammoList: [],
							typeinfo: { type: 'Gun', species: 'Main' }
						}						
					},
					Torpedoes: {
						HP_AGT_1: {
							typeinfo: { type: 'Gun', species: 'Torpedo' }
						}						
					},
					Hull: {
						draft: 10
					},
					Engine: {
						forwardEngineForsag: 2
					}
				};

				// eslint-disable-next-line mocha/no-setup-in-describe
				[
					{ kind: 'Artillery', cls: Artillery },
					{ kind: 'Torpedoes', cls: Torpedoes },
					{ kind: 'Hull', cls: Hull },
					{ kind: 'Engine', cls: Engine }
				].forEach(({ kind, cls }) =>
					it(`should convert ${kind[0].toLowerCase() + kind.slice(1)} modules into ${cls?.name} objects`, async function() {
						const ship = Object.assign({}, SHIP, {
							[kind]: FIXTURES[kind]
						});
						populate(ship);

						const result = (await gameObjectProvider.createGameObject(ship.name))._data;

						expect(result).to.have.property(kind);
						// esmock messes with the constructor references, so the one imported by esmock in GameObjectProvider
						// and the one imported at the top of this file are not identical.
						// As a workaround (aka ugly hack), we just check that their string representations are the same.
						expect(result[kind].constructor.toString()).to.equal(cls.toString());
						expect(result[kind]._data).to.not.be.empty;
					}));					
			});

			describe('consumable flavoring', function() {
				it('should copy the flavor properties onto the consumable', async function() {
					const abil = [ 'PAAA002_Test2', 'flavor' ];
					const ship = Object.assign({}, SHIP, {
						ShipAbilities: { 
							AbilitySlot0: {
								abils: [ abil ]
							}
						}
					});
					const consumable = {
						flavor: { prop: 'testproperty' },
						name: 'PAAA002_Test2',
						typeinfo: { type: 'Ability' }
					}
					populate([ ship, consumable ]);

					const result = (await gameObjectProvider.createGameObject(ship.name))._data.ShipAbilities.AbilitySlot0.abils[0];

					// esmock messes with the constructor references, so the one imported by esmock in GameObjectProvider
					// and the one imported at the top of this file are not identical.
					// As a workaround (aka ugly hack), we just check that their string representations are the same.
					expect(result.constructor.toString()).to.equal(Consumable.toString());
					expect(result._data).to.deep.equal(Object.assign({}, consumable, consumable.flavor));
				});
			});

			describe('ship research lines', function() {
				let stock, top;
				beforeEach(function() {
					stock = {
						components: {
							mockModule: [ 'module0' ]
						},
						prev: '',
						ucType: '_MockModule'
					}
					top = {
						components: {
							mockModule: [ 'module1' ]
						},
						prev: 'MOCK_MODULE_STOCK',
						ucType: '_MockModule'
					}
				});

				it('should build the ship\'s research tree', async function() {
					const ship = Object.assign({}, SHIP, {
						ShipUpgradeInfo: {
							MOCK_MODULE_TOP: top,
							MOCK_MODULE_STOCK: stock,
						}}, {
							module0: {},
							module1: {}							
						});

					populate(ship);
					[ stock, top ].forEach(research => research.ucType = research.ucType[1].toLowerCase() + research.ucType.slice(2));

					const result = (await gameObjectProvider.createGameObject(ship.name))._data.ShipUpgradeInfo;

					// Exclude components from comparison:				
					expect(omit(result, 'mockModule[0].components', 'mockModule[1].components')).to
						.be.an('object').with.property('mockModule')
						.that.is.an('array').with.deep.ordered.members([ stock, top ].map(o => omit(o, 'components')));
				});

				it('should replace module names with their objects in research info component definitions', async function() {
					const module0 = {};
					const module1 = {};
					const ship = Object.assign({}, SHIP, {
						ShipUpgradeInfo: {
							MOCK_MODULE_TOP: top,
							MOCK_MODULE_STOCK: stock,
						}},
						{ 
							module0, 
							module1 
						});
					populate(ship);

					const result = (await gameObjectProvider.createGameObject(ship.name));

					[ 0, 1 ].forEach(i => 
						expect(result._data.ShipUpgradeInfo).to
							.have.nested.property(`mockModule[${i}].components.mockModule`)
							// Strict equality here, because it's important that both the module definition in the ship and the result of the lookup
							// replacement the processor performed are the same object. 
							// Otherwise using ShipUpgradeInfo as a target for modifiers would not work.
							.that.has.members([ result._data[`module${i}`] ]));
						
				});
			});
		});
	});
});
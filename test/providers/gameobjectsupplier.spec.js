import { vol } from 'memfs';
import esmock from 'esmock';
import sinon from 'sinon';
import path from 'path';

describe('GameObjectSupplier', function() {
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
			[ 'index', 'id' ].forEach(link => vol.linkSync(master, path.format({
				dir: SOURCEPATH,
				name: obj[link],
				ext: '.json'
			})));
		}
	}

	let GameObjectSupplier;
	let gameObjectSupplier;

	before(async function() {
		GameObjectSupplier = (await esmock.strict('../../src/providers/gameobjectsupplier.js', {}, {
			'fs': vol, 'fs/promises': vol.promisesApi
		})).default;
	});

	beforeEach(function() {
		gameObjectSupplier = new GameObjectSupplier(SOURCEPATH);
	});
	
	beforeEach(function() {
		vol.fromNestedJSON({
			[SOURCEPATH]: {}
		});
	});

	afterEach(function() { 
		vol.reset();
	});

	describe('recovery', function() {

		// eslint-disable-next-line mocha/no-setup-in-describe
		[ 'name', 'index', 'id'	].forEach(designatorType =>
			it(`should read the game object from disk when requested by ${designatorType}`, async function() {				
				const expected = {
					id: 1,
					index: 'PAAA001',
					name: 'PAAA001_Test1',
					typeinfo: {
						type: 'Type1'
					}
				}
				populate(expected);

				const gameObject = await gameObjectSupplier.recover(expected[designatorType]);
				expect(gameObject).to.deep.equal(expected);
			})
		);

		it('should throw an error if the requested object could not be retrieved', function() {
			// Don't populate source path with anything this time
		
			return expect(gameObjectSupplier.recover('PAAA001_Test1')).to.be.rejected;
		});
	});

	describe('processing', function() {
		let FIXTURE;

		beforeEach(function() {
			FIXTURE = {
				id: 1,
				index: 'PAAA001',
				name: 'PAAA001_Test1',
				typeinfo: {
					type: 'Type1'
				}
			};
			populate(FIXTURE);
		});

		it('should run all processors for the given type', async function() {			
			const processors = {
				'Type1': [
					{ selector: 'id', processors: [ sinon.stub().resolvesArg(0), sinon.stub().resolvesArg(0) ] },
					{ selector: '::root', processors: [ sinon.stub().resolvesArg(0) ] }
				]
			};			
			gameObjectSupplier.processors = processors;

			await gameObjectSupplier.recover(FIXTURE.name);

			processors.Type1
				.flatMap(item => item.processors)
				.forEach(processor => expect(processor).to.have.been.called);
		});

		it('should assign the results of processing to the object\'s property', async function() {
			const expected = 2;
			gameObjectSupplier.processors = {
				'Type1': [
					{ selector: 'id', processors: [ sinon.stub().resolves(expected) ]}
				]
			}

			const result = await gameObjectSupplier.recover(FIXTURE.name);

			expect(result.id).to.equal(expected);
		});

		it('should error as a whole if one of the processors errors', async function() {
			// Test it works with an unambiguous selector
			gameObjectSupplier.processors = {
				'Type1': [ { selector: 'id', processors: [ sinon.stub().rejects() ]} ]
			}
			await expect(gameObjectSupplier.recover(FIXTURE.name), 'unambiguous selector').to.eventually.be.rejected;

			// Test it works with an ambiguous selector
			gameObjectSupplier = new GameObjectSupplier(SOURCEPATH);
			gameObjectSupplier.processors = {
				'Type1': [ { selector: 'i?', processors: [ sinon.stub().rejects() ]} ]
			}
			await expect(gameObjectSupplier.recover(FIXTURE.name), 'ambiguous selector').to.eventually.be.rejected;
		});

		it('should alter the object itself on an empty-selector processor', async function() {
			const expected = {};
			gameObjectSupplier.processors = {
				'Type1': [
					{ selector: '::root', processors: [ sinon.stub().resolves(expected) ]}
				]
			}

			const result = await gameObjectSupplier.recover(FIXTURE.name);

			expect(result).to.equal(expected);
		});
	});

	describe('GameObjectSupplier.Processors', function() {
		it('should be a regular object', function() {
			expect(new GameObjectSupplier.Processors(gameObjectSupplier)).to.not.be.an.instanceOf(GameObjectSupplier.Processors);
		});
	});
});
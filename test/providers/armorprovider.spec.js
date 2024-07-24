import { vol } from 'memfs';
import esmock from 'esmock';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import Ship from '../../src/model/ship.js';

describe('ArmorProvider', function() {

	const ARMOR_DIR = '/armor';
	const CACHE_DIR = '/cache';

	let provider;
	let ArmorProvider;
	let TEST_DATA;


	before(function() {
		TEST_DATA = JSON.parse(fs.readFileSync('test/armor/testdata/armor.json'));
	});

	before(async function() {
		ArmorProvider = (await esmock.strict('../../src/providers/armorprovider.js', {}, {
			'fs': vol,
			'fs/promises': vol.promisesApi
		})).default;
	})

	beforeEach(function() {
		provider = new ArmorProvider(ARMOR_DIR, CACHE_DIR, {
			view: sinon.stub()
		});
	});

	describe('.getArmorView', function() {
		let expected;
		beforeEach(function() {
			expected = {
				metadata: { hash: 'hash' },
				view: Promise.resolve({})
			}
			sinon.stub(provider.supplier, 'get').resolves(expected);
		});

		it('should be callable with a ship object', async function() {			
			const ship = Object.create(Ship.prototype);
			ship.hull = {
				model: 'content/gameplay/usa/ship/battleship/AAA001_Battleship/AAA001_Battleship.model'
			};
			
			return expect(provider.getArmorView(ship, 'front')).to.be.fulfilled;
		});

		it('should be callable with a hull name', function() {
			return expect(provider.getArmorView('hullname', 'front')).to.be.fulfilled;
		});

		it('should error if an illegal view is requested', function() {
			return expect(provider.getArmorView('', 'illegal')).to.be.rejected;
		});
	});

	describe('supplier recovery', function() {
		const baseDesignator = 'AAA001_Battleship';
		
		let CACHE_DATA;

		beforeEach(function() {
			CACHE_DATA = {
				view: {
					1: []
				},
				metadata: TEST_DATA.metadata
			}
		});

		beforeEach(function() {
			vol.fromNestedJSON({
				[ARMOR_DIR]: {
					[`${baseDesignator}.json`]: JSON.stringify(TEST_DATA)
				},
				[CACHE_DIR]: {},
			}, { createCwd: false });
		});

		afterEach(function() {
			vol.reset() 
		});
		
		it('should read a cached view if one is available', async function() {
			const view = 'side';
			const designator = `${baseDesignator}.${view}`;

			vol.writeFileSync(path.format({
				dir: CACHE_DIR,
				name: designator,
				ext: '.json'
			}), JSON.stringify(CACHE_DATA));

			expect(provider.supplier.viewer.view).to.not.have.been.called;
			return expect(provider.supplier.recover(designator)).to.eventually.deep.equal(CACHE_DATA);
		});
		
		it('should read the base armor file when requested', function() {
			let result = provider.supplier.recover(`${baseDesignator}.raw`);
			return expect(result).to.eventually.deep.equal(TEST_DATA);
		});

		it('should create a new view if no cache file is available', async function() {
			const view = 'side';
			const designator = `${baseDesignator}.${view}`;

			provider.supplier.viewer.view.resolves(CACHE_DATA.view);

			let result = await provider.supplier.recover(designator);
			// Wait for view creation to be completed
			result.view = await result.view;

			expect(provider.supplier.viewer.view).to.have.been.called;
			expect(result).to.deep.equal(CACHE_DATA);
		});

		it('should create a new view if the cache file is out of date', async function() {
			const view = 'side';
			const designator = `${baseDesignator}.${view}`;

			vol.writeFileSync(path.format({
				dir: CACHE_DIR,
				name: designator,
				ext: '.json'
			}), JSON.stringify({
				...CACHE_DATA, metadata: { ...CACHE_DATA.metadata, hash: 'outdated hash' }
			}));

			provider.supplier.viewer.view.resolves(CACHE_DATA.view);

			let result = await provider.supplier.recover(designator);
			// Wait for view creation to be completed
			result.view = await result.view;

			expect(provider.supplier.viewer.view).to.have.been.called;
			expect(result).to.deep.equal(CACHE_DATA);			
		});

		it('should write a created view to cache', async function() {
			const view = 'side';
			const designator = `${baseDesignator}.${view}`;

			provider.supplier.viewer.view.resolves(CACHE_DATA.view);

			let result = await provider.supplier.recover(designator);
			// Wait for view creation to be completed
			result.view = await result.view;

			// Check that cache file has been updated
			try {
				const contents = await vol.promises.readFile(path.format({
					dir: CACHE_DIR,
					name: designator,
					ext: '.json'
				}), 'utf8');
				expect(contents).to.equal(JSON.stringify(result));
			} catch (err) {
				if (err.code === 'ENOENT')
					expect.fail('Expected cache file to have been written but it was not');
				else throw err;
			}
		})
	});
});
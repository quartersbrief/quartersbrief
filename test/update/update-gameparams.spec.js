import { vol } from 'memfs';
import esmock from 'esmock';
import path from 'path';
import sinon from 'sinon';
import fs from 'fs/promises';
import os from 'os';

describe('updateGameParams', function() {
	const buildno = 1;
	const wowsdir = '/wows';
	const dest = '/data';

	let data;
	let expected;

	let extract;
	
	let invariants;

	let updateGameParams;

	before(async function() {
		data = await fs.readFile('test/update/testdata/GameParams.data');
		expected = JSON.parse(await fs.readFile('test/update/testdata/GameParams.json'));
	});

	beforeEach(function() {
		extract = sinon.stub().callsFake(function(wows, dest, build, resource) {
			return sinon.stub().callsFake(async function() {
				await vol.promisesApi.mkdir(path.dirname(path.join(os.tmpdir(), resource)), { recursive: true });
				await vol.promisesApi.writeFile(path.join(os.tmpdir(), resource), data);
				return Promise.resolve([ path.join(os.tmpdir(), resource) ]);
			});
		});
	});

	beforeEach(function() {
		invariants = {
			invariant1: sinon.stub(),
			invariant2: sinon.stub()	
		} 
	});
	
	beforeEach(async function() {
		const steps = {
			...await esmock.strict('../../src/update/infra/steps.js', {}, { 'fs': vol, 'fs/promises': vol.promisesApi }),
			extract
		}
		// Use esmock strict mode here, to that invariants get replaced instead of merged
		updateGameParams = (await esmock.strict('../../src/update/update-gameparams.js', {
				'../../src/update/infra/steps.js': steps,
				'../../src/update/invariants-gameparams.js': invariants
			}, {
				'fs': vol,
				'fs/promises': vol.promisesApi
		})).default;		
	});

	afterEach(function() {
		vol.reset();
	});

	it('should throw if not exactly one file was extracted', async function() {
		extract.returns(sinon.stub().resolves([]));		
		await expect(updateGameParams(wowsdir, dest, buildno), `extracted no files`).to.be.rejected;
		
		extract.returns(sinon.stub().resolves([ 'GameParams-1.data', 'GameParams-2.data' ]));
		await expect(updateGameParams(wowsdir, dest, buildno), `extracted too many files`).to.be.rejected;
	});

	it('should check every game object against all invariants', async function() {
		vol.fromNestedJSON({
			[path.join(wowsdir, 'bin', String(buildno))]: {},
			[dest]: {},
		});

		await updateGameParams(wowsdir, dest, buildno);
		Object.entries(expected).forEach(([ gameObjectName, gameObject ]) => 
			Object.values(invariants)
				.filter(invariant => typeof invariant === 'function') // esmock always adds a 'default' key
				.forEach((invariant, index) => expect(invariant, `invariant ${index} on ${gameObjectName}`).to.have.been.calledWith(gameObject)));
	});

	it('should turn GameParams.data from the game directory into .json', async function() {		
		vol.fromNestedJSON({
			[path.join(wowsdir, 'bin', String(buildno))]: {},
			[dest]: {},
		});

		expect(await updateGameParams(wowsdir, dest, buildno)).to.be.ok;
		for (let go of Object.values(expected)) {
			await expect(vol.promisesApi.readFile(path.join(dest, 'params', `${go.name}.json`), 'utf8'), go.name).to.eventually.equal(JSON.stringify(go));
			await expect(vol.promisesApi.readFile(path.join(dest, 'params', `${go.index}.json`), 'utf8'), go.index).to.eventually.equal(JSON.stringify(go));
			await expect(vol.promisesApi.readFile(path.join(dest, 'params', `${go.id}.json`), 'utf8'), go.id).to.eventually.equal(JSON.stringify(go));
		}
	});

	it('should delete the extracted files from the tmp folder', async function() {
		vol.fromNestedJSON({
			[path.join(wowsdir, 'bin', String(buildno))]: {},
			[dest]: {},
		});
		await updateGameParams(wowsdir, dest, buildno);
		
		await expect(vol.promisesApi.stat(path.join(os.tmpdir(), 'content'))).to.be.rejectedWith(/ENOENT/);
	});
});
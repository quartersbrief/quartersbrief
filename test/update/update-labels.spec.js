import { vol } from 'memfs';
import esmock from 'esmock';
import path from 'path';
import fs from 'fs/promises';

describe('updateLabels', function() {
	const buildno = 1;
	const wowsdir = '/wows';
	const dest = '/data';

	let updateLabels;	
	let expected;

	before(async function() {
		expected = JSON.parse(await fs.readFile('test/update/testdata/global.json'));
	});

	before(async function() {
		updateLabels = (await esmock('../../src/update/update-labels.js', {}, {
			'fs': vol, 'fs/promises': vol.promisesApi
		})).default;
	});

	afterEach(function() {
		vol.reset();
	});

	it('should turn labels from the game directory into global-en.json', async function() {		
		vol.fromNestedJSON({
			[path.join(wowsdir, `/bin/${buildno}/res/texts/en/LC_MESSAGES/global.mo`)]: await fs.readFile('test/update/testdata/global.mo'),
		});
		expect(await updateLabels(wowsdir, dest, buildno)).to.be.ok;

		const file = path.join(dest, 'global-en.json');
		await expect(vol.promisesApi.stat(file)).to.be.fulfilled;		

		const actual = JSON.parse(await vol.promisesApi.readFile(file));
		// Delete metadata because we are not interested in that part
		delete actual[''];
		expect(actual).to.deep.equal(expected);		
	});
});
import { extract } from '../../../src/update/infra/steps.js';
import os from 'os';
import path from 'path';
import { join } from 'path';
import esmock from 'esmock';
import { vol } from 'memfs';
import sinon from 'sinon';

describe('extract', function() {
	
	it('should return a function', function() {
		expect(extract()).to.be.a('function');
	});

	describe('extractor function', function() {
		let execa;
		let extract;
		let extractor;

		const wowsdir = '/wows'
		const dest = '/data';
		const buildno = 1;

		// Convenience function that generates a sinon matcher that looks for the sequence '--<option> <value>' in the args array
		function hasParam(option, value) {
			return args => {
				for (let i = 0; i < args.length; i++)
					if (args[i] === `--${option}` && args[i + 1] === value) return true;
				return false;
			}
		}

		beforeEach(function() {
			sinon.stub(os, 'type').returns('Windows_NT');
		});

		beforeEach(async function() {		
			this.timeout(3000); // Loading of the modules sometimes takes a while, so increase the timeout to 3s
			
			execa = sinon.stub().resolves({ stdout: '', stderr: '' });

			extract = (await esmock('../../../src/update/infra/steps.js', {}, {
				execa: { execa },				
			})).extract;
			extractor = extract(wowsdir, dest, buildno)
		});

		afterEach(function() {
			execa.reset();
		});

		afterEach(function() {
			os.type.restore();
		});

		// eslint-disable-next-line mocha/no-setup-in-describe
		[ 'Linux', 'Windows_NT' ].forEach(sys => {
			it(`should call wowsunpack.exe ${sys === 'Linux' ? 'with wine ' : ''}on ${sys}`, async function() {
				const command = {
					'Linux': cmd => cmd.toLowerCase().includes('wine'),
					'Windows_NT': cmd => !cmd.toLowerCase().includes('wine') && cmd.toLowerCase().includes('wowsunpack.exe')
				}
				const argument0 = {
					'Linux': args => args[0].toLowerCase().includes('wowsunpack.exe'),
					'Windows_NT': () => true
				}

				os.type.returns(sys);

				await extractor('*');

				// Check commands of the execa calls
				expect(execa).to.have.been.calledWith(sinon.match(command[sys]), sinon.match(argument0[sys]));
			});
		});

		it('should have the correct path to wowsunpack.exe', async function() {
			await extractor('*');
			let wowsunpack = execa.firstCall.firstArg;
			expect(wowsunpack).to.be.a.file();
		});

		it('should extract to the specified destination', async function() {
			await extractor('*');
			expect(execa).to.have.been.calledWith(sinon.match.any, sinon.match(hasParam('output', dest)));
		});

		it('should extract for the specified build number', async function() {
			const hasBuild = args => args[0].includes(`bin/${buildno}/idx`);

			await extractor('*');
			expect(execa).to.have.been.calledWith(sinon.match.any, sinon.match(hasBuild));
		});

		it('should extract the resource if one was supplied when created', async function() {
			const resource = '/abc';
			extractor = extract(wowsdir, dest, buildno, resource)
			await extractor();
			expect(execa).to.have.been.calledWith(sinon.match.any, sinon.match(hasParam('include', resource)));			
		});

		it('should extract the resource when specified as a string', async function() {
			const resource = '/abc';
			
			await extractor(resource);
			expect(execa).to.have.been.calledWith(sinon.match.any, sinon.match(hasParam('include', resource)));
		});

		it('should extract the resources when specified as a list of inclusion and exclusion patterns', async function() {
			const resources = {
				include: [
					'*.a', 'b.c'
				],
				exclude: [
					'*.x', 'y.z'
				]
			}
			
			await extractor(resources);
			resources.include.forEach(incl => expect(execa, `include ${incl}`).to.have.been.calledWith(sinon.match.any, sinon.match(hasParam('include', incl))));
			resources.exclude.forEach(excl => expect(execa, `exclude ${excl}`).to.have.been.calledWith(sinon.match.any, sinon.match(hasParam('exclude', excl))));
		});

		it('should return a list of paths for all extracted files', async function() {
			const resources = [ 'folder/fileA', 'folder/fileB']
			execa.resolves({ stdout: resources.join('\r\n') }); // Simulate output of wowsunpack - a Windows program, so we have Windows line separators

			let result = await extractor('*');
			expect(result).to.be.an('array').with.members(resources.map(resource => path.join(dest, resource)));
		});
	});	
});

describe('readFile', function() {
	let readFile;

	before(async function() {
		readFile = (await esmock.strict('../../../src/update/infra/steps.js', {}, {
			'fs': vol, 'fs/promises': vol.promisesApi
		})).readFile;
	});

	it('should return a function', function() {
		expect(readFile()).to.be.a('function');
	});

	describe('reader function', function() {
		let reader;

		const file = '/abc/def';
		const contents = 'xyz';

		beforeEach(function() {
			vol.fromNestedJSON({ [file]: contents });
		});

		beforeEach(function() {
			reader = readFile();
		});

		afterEach(function() {
			vol.reset();
		});

		it('should read the file if one was supplied when created', function() {
			reader = readFile('utf8', file);
			return expect(reader(file)).to.eventually.equal(contents);
		});

		it('should read the specified file', function() {
			return expect(reader(file)).to.eventually.equal(contents);
		});

		it('should return a Buffer when using encoding=null', async function() {
			reader = readFile(null);
			let result = await reader(file);
			expect(result).to.be.an.instanceof(Buffer);
			expect(result.toString()).to.equal(contents);
		});
	});
});

describe('writeJSON', function() {
	let writeJSON;

	before(async function() {
		writeJSON = (await esmock.strict('../../../src/update/infra/steps.js', {}, {
			'fs': vol, 'fs/promises': vol.promisesApi
		})).writeJSON;
	});

	it('should return a function', function() {
		expect(writeJSON()).to.be.a('function');
	});

	describe('writer function', function() {
		let writer;

		const path = '/abc';
		const basename = 'def';
		// eslint-disable-next-line mocha/no-setup-in-describe
		const file = join(path, basename);
		const contents = { key: 'value' };

		beforeEach(function() {
			vol.fromNestedJSON({ [path]: {} });
		});

		beforeEach(function() {
			writer = writeJSON(file);
		});

		afterEach(function() {
			vol.reset();
		});

		it('should create the specified file if it doesn\'t exist and write the data as JSON', async function() {
			expect(await writer(contents)).to.equal(file);
			await expect(vol.promisesApi.readFile(file, 'utf8')).to.eventually.equal(JSON.stringify(contents));
		});

		it('should overwrite the specified file if it exists and write the data as JSON', async function() {
			vol.fromNestedJSON({ [file]: JSON.stringify({})});
			await expect(vol.promisesApi.stat(file)).to.be.fulfilled;

			expect(await writer(contents)).to.equal(file);
			await expect(vol.promisesApi.readFile(file, 'utf8')).to.eventually.equal(JSON.stringify(contents));
		});

		it('should create parent directories if necessary', async function() {
			const dirs = '/create/us';
			writer = writeJSON(join(path, dirs, basename));
			await writer({});
			
			const stats = vol.promisesApi.stat(join(path, dirs));
			await expect(stats).to.be.fulfilled;
			await expect((await stats).isDirectory()).to.be.true;
		});

		it('should support specifying the file as a function, and call that function with the data', async function() {
			let fn = sinon.stub().returns(file);
			writer = writeJSON(fn);
			await writer(contents);
					
			await expect(vol.promisesApi.readFile(file, 'utf8')).to.eventually.equal(JSON.stringify(contents));
			expect(fn).to.have.been.calledWith(contents);
		});
	});
});
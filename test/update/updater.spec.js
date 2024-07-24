import path from 'path';
import esmock from 'esmock';
import { vol } from 'memfs';
import sinon from 'sinon';
import { setImmediate } from 'timers/promises';

describe('Updater', function() {
	const wowsdir = '/wows';
	const dest = '/data';

	let Updater;
	let updater;

	before(async function() {
		Updater = (await esmock.strict('../../src/update/updater.js', {}, {
			'fs': vol,
			'fs/promises': vol.promisesApi
		})).default;
	});

	beforeEach(function() {
		updater = new Updater(wowsdir, dest);
	});

	afterEach(function() {
		vol.reset();
	});

	describe('.detectVersion', function() {
		const dir = '/dir';
		it('should return the name of the subdirectory with the highest number', async function() {
			const builds = [ 1, 2, 3 ];
			const expected = Math.max(...builds);
			const bin = {};
			builds
				.map(buildno => ({ [`${dir}/${buildno}`]: {} }))
				.forEach(buildDir => Object.assign(bin, buildDir));
			vol.fromNestedJSON(bin);
			return expect(updater.detectVersion(dir)).to.eventually.equal(expected);
		});

		it('should ignore files and subfolders not consisting only of digits', function() {
			const buildno = 1;
			vol.fromNestedJSON({
				[`${dir}/${buildno}`]: {},
				[`${dir}/alphanumeric dir`]: {},
				[`${dir}/alphanumeric file`]: '',
				[`${dir}/${2 * buildno}`]: 'numeric file' // * 2 to make sure this is the highest
			});
			return expect(updater.detectVersion(dir)).to.eventually.equal(buildno);
		});

		it('should return undefined if there are no numerically-named subfolders', async function() {
			vol.fromNestedJSON({
				[dir]: {}
			});
			return expect(updater.detectVersion(dir)).to.eventually.be.undefined;
		});

		it('should throw if it can\'t read the bin folder', function() {
			return expect(updater.detectVersion(dir)).to.be.rejected;
		});		
	});

	describe('.needsUpdate', function() {		
		it('should return true when the remembered version is lower than the current detected one', function() {
			const detected = 2;
			const remembered = 1;
			expect(updater.needsUpdate(detected, remembered)).to.be.true;
		});

		it('should return false when the remembered version is equal to the current detected one', function() {
			const detected = 2;
			const remembered = 2;
			expect(updater.needsUpdate(detected, remembered)).to.be.false;			
		});

		it('should return true if the remembered version is unknown', function() {
			const detected = 1;
			const remembered = undefined;
			expect(updater.needsUpdate(detected, remembered)).to.be.true;
		});

				it('should return false when the update option is set to "false"', function() {
			const detected = 2;
			const remembered = 1;
			expect(updater.needsUpdate(detected, remembered, { allowUpdates: false })).to.be.false;
		});
	});

	describe('.commit', function() {
		it('should remove the data directory of the old version and keep the data directory for the new version', async function() {
			const oldVersion = 1;
			const newVersion = 2;
			vol.fromNestedJSON({ 
				[path.join(dest, String(oldVersion))]: {}, 
				[path.join(dest, String(newVersion))]: {}, 
			});
	
			await updater.commit(oldVersion);
			await expect(vol.promisesApi.stat(path.join(dest, String(oldVersion)))).to.be.rejectedWith(/ENOENT/);
			await expect(vol.promisesApi.stat(path.join(dest, String(newVersion)))).to.be.fulfilled;
		});

		it('should not error if there is no data directory for the old version', async function() {
			const oldVersion = 1;
			vol.fromNestedJSON({
				[dest]: {}
			});
			return expect(updater.commit(oldVersion)).to.be.fulfilled;
		});
	});

	describe('.rollback', function() {
		it('should remove the data directory for the new version and keep the data directory for the old version', async function() {
			const newVersion = 2;
			const oldVersion = 1;
			vol.fromNestedJSON({ 
				[path.join(dest, String(oldVersion))]: {}, 
				[path.join(dest, String(newVersion))]: {}, 
			});

			await updater.rollback(newVersion);
			
			await expect(vol.promisesApi.stat(path.join(dest, String(oldVersion)))).to.be.fulfilled;
			await expect(vol.promisesApi.stat(path.join(dest, String(newVersion)))).to.be.rejectedWith(/ENOENT/);
		});
	});

	describe('.update', function() {
		const remembered = 1;
		const detected = 2;

		beforeEach(function() {
			sinon.stub(updater, 'needsUpdate').resolves(true);
		});

		beforeEach(function() {
			vol.fromNestedJSON({
				[path.join(wowsdir, 'bin', String(detected), 'idx')]: {},
				[path.join(dest, String(remembered))]: {}
			});
		})

		it('should check if an update is needed', async function() {
			const options = {};
			await updater.update(options);
			expect(updater.needsUpdate).to.have.been.calledWith(detected, remembered, options);
		});

		it('should call all update functions', async function() {
			const updates = [
				sinon.stub().resolves(),
				sinon.stub().resolves()
			];
			updates.forEach(update => updater.register(update));
			await updater.update();
			updates.forEach(update => expect(update).to.have.been.called);
		});

		it('should wait until an update function has completed before calling the next', async function() {
			const updates = [ 			
				sinon.spy(async function() {
					// Push resolution of this promise to the end of this turn of the event loop.
					// This is so there is an opportunity for update() to call the next update function, even though
					// it shouldn't. 
					// If we tested directly (without setImmediate), the test would always pass.
					// (Not this is setImmediate imported from 'timers/promises')
					return setImmediate().then(function() {
						// Resolve the promise with the answer to the question: had the next update function already been
						// called when this one resolved?
						return Promise.resolve(updates[1].called); 
					})
				}),
				sinon.spy()
			];
			updates.forEach(update => updater.register(update));

			await updater.update();
			await expect(updates[0].firstCall.returnValue, 'second update function was called before first finished').to.eventually.be.false;
			expect(updates[1], 'second update function was never called at all').to.have.been.called;
		});

		it('should commit after all update functions complete normally', async function() {
			sinon.spy(updater, 'commit');
			sinon.spy(updater, 'rollback');
			try {
				updater.register(sinon.stub().resolves());
				await updater.update();
				expect(updater.commit).to.have.been.called;
				expect(updater.rollback).to.not.have.been.called;
			} finally {
				updater.commit.restore();
				updater.rollback.restore();
			}
		});

		it('should rollback if any update function throws', async function() {
			sinon.spy(updater, 'commit');
			sinon.spy(updater, 'rollback');
			try {
				updater.register(sinon.stub().rejects());
				await updater.update();
				expect(updater.commit).to.not.have.been.called;
				expect(updater.rollback).to.have.been.called;
			} finally {
				updater.commit.restore();
				updater.rollback.restore();
			}
		});

		it('should return the latest version if no update was necessary, the previous version if the update was rolled back, and the new version if it was successful', async function() {
			const update = sinon.stub();
			updater.register(update);

			updater.needsUpdate.returns(false);
			await expect(updater.update()).to.eventually.equal(remembered);
			
			updater.needsUpdate.returns(true);
			update.rejects();
			await expect(updater.update()).to.eventually.equal(remembered);

			update.resolves();
			await expect(updater.update()).to.eventually.equal(detected);
		});
	});
});
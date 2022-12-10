import { interconnect, label, splitHybrids, fuse, separate, clean } from '../../src/armor/recover.js';

describe.only('occlude zero-length recovery', function() {
	let subject;
	beforeEach(function() {
		subject = [
			{ vertex: [ 1, 1 ] },
			{ vertex: [ 3, 1 ] },
			{ vertex: [ 3, 3 ] },
			{ vertex: [ 1, 3 ] }
		];
	});

	describe('interconnect', function() {
		it('should insert intersections into both polygons', function() {			
			// +----------+
			// |          |
			// |    +-----+-----+
			// |    |     |     |
			// +----+-----+     |
			//      |           |
			//      +-----------+
			const clip = [
				{ vertex: [ 2, 0 ] },
				{ vertex: [ 4, 0 ] },
				{ vertex: [ 4, 2 ] },
				{ vertex: [ 2, 2 ] }
			];

			const result = interconnect(subject, clip);
		
			expect(result).to.be.an('object').with.keys(['subject','clip']);

			expect(result.subject).to.be.an('array').with.lengthOf(6);
			expect(result.subject.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1, 1 ], // bottom left
				[ 2, 1 ], // intersection
				[ 3, 1 ], // bottom right
				[ 3, 2 ], // intersection
				[ 3, 3 ], // top right
				[ 1, 3 ], // top left
			]);
			expect(result.subject[1]).to.have.property('intersection', true);
			expect(result.subject[1]).to.have.property('corresponding', result.clip[5]);
			expect(result.subject[3]).to.have.property('intersection', true);
			expect(result.subject[3]).to.have.property('corresponding', result.clip[3]);

			expect(result.clip).to.be.an('array').with.lengthOf(6);
			expect(result.clip.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 2, 0 ], // bottom left
				[ 4, 0 ], // bottom right
				[ 4, 2 ], // top right
				[ 3, 2 ], // intersection
				[ 2, 2 ], // top left
				[ 2, 1 ], // intersection
			]);
			expect(result.clip[3]).to.have.property('intersection', true);
			expect(result.clip[3]).to.have.property('corresponding', result.subject[3]);
			expect(result.clip[5]).to.have.property('intersection', true);
			expect(result.clip[5]).to.have.property('corresponding', result.subject[1]);
		});

		it('should insert both endpoints of completely shared common segments into the containing polygon', function() {
			// +----------+
			// |          |
			// |          |
			// |          |
			// +---+==+---+
			//     |  |
			//     +--+
			const clip = [
				{ vertex: [ 1.5, 0 ] },
				{ vertex: [ 2.5, 0 ] },
				{ vertex: [ 2.5, 1 ] },
				{ vertex: [ 1.5, 1 ] }
			];

			const result = interconnect(subject, clip);

			expect(result).to.be.an('object').with.keys(['subject','clip']);

			expect(result.subject).to.be.an('array').with.lengthOf(6);
			expect(result.subject.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1, 1 ],   // bottom left
				[ 1.5, 1 ], // intersection
				[ 2.5, 1 ], // intersection
				[ 3, 1 ],   // bottom right
				[ 3, 3 ],   // top right
				[ 1, 3 ]    // top left
			]);
			expect(result.subject[1]).to.have.property('intersection', true);
			expect(result.subject[1]).to.have.property('corresponding', result.clip[3]);
			expect(result.subject[2]).to.have.property('intersection', true);
			expect(result.subject[2]).to.have.property('corresponding', result.clip[2]);

			expect(result.clip).to.be.an('array').with.lengthOf(4);
			expect(result.clip.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1.5, 0 ], // bottom left
				[ 2.5, 0 ], // bottom right
				[ 2.5, 1 ], // top right, intersection
				[ 1.5, 1 ]  // top left, intersection
			]);
			expect(result.clip[2]).to.have.property('intersection', true);
			expect(result.clip[2]).to.have.property('corresponding', result.subject[2]);
			expect(result.clip[3]).to.have.property('intersection', true);
			expect(result.clip[3]).to.have.property('corresponding', result.subject[1]);
		});

		it('should insert the endpoints of partially shared common segments into both polygons', function() {
			// +----------+
			// |          |
			// |          |
			// |          |
			// +---+======+------+
			//     |             |
			//     +-------------+
			let clip = [
				{ vertex: [ 2, 0 ] },
				{ vertex: [ 4, 0 ] },
				{ vertex: [ 4, 1 ] },
				{ vertex: [ 2, 1 ] }
			];

			let result = interconnect(subject, clip);

			expect(result).to.be.an('object').with.keys(['subject','clip']);

			expect(result.subject).to.be.an('array').with.lengthOf(5);
			expect(result.subject.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1, 1 ], // bottom left
				[ 2, 1 ], // intersection
				[ 3, 1 ], // bottom right, intersection
				[ 3, 3 ], // top right
				[ 1, 3 ]  // top left
			]);
			expect(result.subject[1]).to.have.property('intersection', true);
			expect(result.subject[1]).to.have.property('corresponding', result.clip[4]);
			expect(result.subject[2]).to.have.property('intersection', true);
			expect(result.subject[2]).to.have.property('corresponding', result.clip[3]);

			expect(result.clip).to.be.an('array').with.lengthOf(5);
			expect(result.clip.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 2, 0 ], // bottom left
				[ 4, 0 ], // bottom right
				[ 4, 1 ], // top right
				[ 3, 1 ], // intersection
				[ 2, 1 ]  // top left, intersection
			]);
			expect(result.clip[3]).to.have.property('intersection', true);
			expect(result.clip[3]).to.have.property('corresponding', result.subject[2]);
			expect(result.clip[4]).to.have.property('intersection', true);
			expect(result.clip[4]).to.have.property('corresponding', result.subject[1]);

			//     +----------+
			//     |          |
			//     |          |
			//     |          |
			// +---+======+---+
			// |          |
			// +----------+
			// This is different from the previous scenario in that in this case, the start points of 
			// the segments are mutually included in the other polygon's segment.
			clip = [
				{ vertex: [ 0, 0 ] },
				{ vertex: [ 2, 0 ] },
				{ vertex: [ 2, 1 ] },
				{ vertex: [ 0, 1 ] }
			];

			result = interconnect(subject, clip);

			expect(result).to.be.an('object').with.keys(['subject','clip']);

			expect(result.subject).to.be.an('array').with.lengthOf(5);
			expect(result.subject.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1, 1 ], // bottom left, intersection
				[ 2, 1 ], // intersection
				[ 3, 1 ], // bottom right
				[ 3, 3 ], // top right
				[ 1, 3 ]  // top left
			]);
			expect(result.subject[0]).to.have.property('intersection', true);
			expect(result.subject[0]).to.have.property('corresponding', result.clip[3]);
			expect(result.subject[1]).to.have.property('intersection', true);
			expect(result.subject[1]).to.have.property('corresponding', result.clip[2]);

			expect(result.clip).to.be.an('array').with.lengthOf(5);
			expect(result.clip.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 0, 0 ], // bottom left
				[ 2, 0 ], // bottom right
				[ 2, 1 ], // top right, intersection
				[ 1, 1 ], // intersection
				[ 0, 1 ]  // top left
			]);
			expect(result.clip[2]).to.have.property('intersection', true);
			expect(result.clip[2]).to.have.property('corresponding', result.subject[1]);
			expect(result.clip[3]).to.have.property('intersection', true);
			expect(result.clip[3]).to.have.property('corresponding', result.subject[0]);
		});

		it('should mark a vertex on an edge as an intersection and insert it into the edge', function() {
			// +----------+ +
			// |          |/ \
			// |          +   +
			// |          |\ /
			// +----------+ +
			const clip = [
				{ vertex: [ 4, 1 ] },
				{ vertex: [ 5, 2 ] },
				{ vertex: [ 4, 3 ] },
				{ vertex: [ 3, 2 ] }
			];
			const result = interconnect(subject, clip);

			expect(result).to.be.an('object').with.keys(['subject','clip']);

			expect(result.subject).to.be.an('array').with.lengthOf(5);
			expect(result.subject.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1, 1 ], // bottom left
				[ 3, 1 ], // bottom right
				[ 3, 2 ], // intersection
				[ 3, 3 ], // top right
				[ 1, 3 ]  // top left
			]);
			expect(result.subject[2]).to.have.property('intersection', true);
			expect(result.subject[2]).to.have.property('corresponding', result.clip[3]);

			expect(result.clip).to.be.an('array').with.lengthOf(4);
			expect(result.clip.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 4, 1 ], // bottom
				[ 5, 2 ], // right
				[ 4, 3 ], // top
				[ 3, 2 ], // left, intersection
			]);
			expect(result.clip[3]).to.have.property('intersection', true);
			expect(result.clip[3]).to.have.property('corresponding', result.subject[2]);
		});

		it('should mark a shared vertex as an intersection in both polygons', function() {
			// +----------+
			// |          |
			// |          |
			// |          |
			// +----------+-------+
			//            |       |
			//            +-------+
			const clip = [
				{ vertex: [ 3, 0 ] },
				{ vertex: [ 5, 0 ] },
				{ vertex: [ 5, 1 ] },
				{ vertex: [ 3, 1 ] }
			];
			const result = interconnect(subject, clip);

			expect(result).to.be.an('object').with.keys(['subject','clip']);

			expect(result.subject).to.be.an('array').with.lengthOf(4);
			expect(result.subject.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 1, 1 ], // bottom left
				[ 3, 1 ], // bottom right, intersection
				[ 3, 3 ], // top right
				[ 1, 3 ]  // top left
			]);
			expect(result.subject[1]).to.have.property('intersection', true);
			expect(result.subject[1]).to.have.property('corresponding', result.clip[3]);

			expect(result.clip).to.be.an('array').with.lengthOf(4);
			expect(result.clip.map(item => item.vertex)).to.have.ordered.deep.members([
				[ 3, 0 ], // bottom left
				[ 5, 0 ], // bottom right
				[ 5, 1 ], // top right
				[ 3, 1 ]  // top left, intersection
			]);
			expect(result.clip[3]).to.have.property('intersection', true);
			expect(result.clip[3]).to.have.property('corresponding', result.subject[1]);
		});
	});

	describe('label', function() {
		describe('non-chain', function() {
			it('should mark a crossing intersection as an entry when coming from outside, and an exit when coming from inside', function() {
				// +----------+
				// |          |
				// |    +-----+-----+
				// |    |     |     |
				// +----+-----+     |
				//      |           |
				//      +-----------+
				const clip = [
					{ vertex: [ 2, 0 ] },
					{ vertex: [ 4, 0 ] },
					{ vertex: [ 4, 2 ] },
					{ vertex: [ 3, 2 ], intersection: true },
					{ vertex: [ 2, 2 ] },
					{ vertex: [ 2, 1 ], intersection: true }
				];
				subject.splice(1, 0, {
					vertex: [ 2, 1 ], intersection: true
				});
				subject.splice(3, 0, {
					vertex: [ 3, 2 ], intersection: true
				});
				subject[1].corresponding = clip[5];
				clip[5].corresponding = subject[1];
				subject[3].corresponding = clip[3];
				clip[3].corresponding = subject[3];

				label(subject, clip);
				expect(subject[1]).to.have.property('entry', true);
				expect(subject[1]).to.not.have.property('exit');

				expect(subject[3]).to.have.property('exit', true);
				expect(subject[3]).to.not.have.property('entry');
			});

			it('should mark an exterior bouncing intersection as neither an entry nor an exit', function() {
				// +----------+ +
				// |          |/ \
				// |          +   +
				// |          |\ /
				// +----------+ +
				const clip = [
					{ vertex: [ 4, 1 ] },
					{ vertex: [ 5, 2 ] },
					{ vertex: [ 4, 3 ] },
					{ vertex: [ 3, 2 ], intersection: true }
				];
				subject.splice(2, 0, {
					vertex: [ 3, 2 ], intersection: true
				});
				subject[2].corresponding = clip[3];
				clip[3].corresponding = subject[2];

				label(subject, clip);

				expect(subject[2]).to.not.have.property('entry');
				expect(subject[2]).to.not.have.property('exit');
			});

			it('should mark an interior bouncing intersection as both an entry and an exit', function() {
				// +--------------+
				// |              |
				// |            /\|
				// |           +  +
				// |            \/|
				// |              |
				// +--------------+
				const clip = [
					{ vertex: [ 3, 2 ], intersection: true },
					{ vertex: [ 2.5, 2.5 ] },
					{ vertex: [ 2, 2 ] },
					{ vertex: [ 2.5, 1.5 ]}
				];
				subject.splice(2, 0, {
					vertex: [ 3, 2 ], intersection: true
				});
				subject[2].corresponding = clip[0];
				clip[0].corresponding = subject[2];

				// Need to do it the other way around this time (because clip is contained in subject and not the other way around)
				label(clip, subject);

				expect(clip[0]).to.have.property('entry', true);
				expect(clip[0]).to.have.property('exit', true);
			});			
		});

		describe('chain', function() {
			it('should mark the start of a delayed crossing chain as neither an entry nor an exit and the end as an entry when coming from outside', function() {
				// +--------------+
				// |              |
				// |         +----+--+
				// |         |    |  |
				// +-----+===+----+  |
				//       |           |
				//       +-----------+
				const clip = [
					{ vertex: [ 1.5, 0 ] },
					{ vertex: [ 4, 0 ] },
					{ vertex: [ 4, 2 ] },
					{ vertex: [ 3, 2 ], intersection : true },
					{ vertex: [ 2.5, 2 ] },
					{ vertex: [ 2.5, 1 ], intersection: true },
					{ vertex: [ 1.5, 1 ], intersection: true }
				];
				subject.splice(1, 0, 
					{ vertex: [ 1.5, 1 ], intersection: true },
					{ vertex: [ 2.5, 1 ], intersection: true });
				subject.splice(4, 0, {
					vertex: [ 3, 2 ], intersection: true
				});
				subject[1].corresponding = clip[6];
				clip[6].corresponding = subject[1];
				subject[2].corresponding = clip[5];
				clip[5].corresponding = subject[2];
				subject[4].corresponding = clip[3];
				clip[3].corresponding = subject[4];

				label(subject, clip);

				expect(subject[1]).to.not.have.property('entry');
				expect(subject[1]).to.not.have.property('exit');

				expect(subject[2]).to.have.property('entry', true);
				expect(subject[2]).to.not.have.property('exit');
			});

			it('should mark the start of a delayed crossing chain as an exit and the end as neither an entry nor an exit when coming from inside', function() {
				// +--------------+
				// |              |
				// |         +----+--+
				// |         |    |  |
				// +-----+===+----+  |
				//       |           |
				//       +-----------+
				const clip = [
					{ vertex: [ 1.5, 0 ] },
					{ vertex: [ 4, 0 ] },
					{ vertex: [ 4, 2 ] },
					{ vertex: [ 3, 2 ], intersection : true },
					{ vertex: [ 2.5, 2 ] },
					{ vertex: [ 2.5, 1 ], intersection: true },
					{ vertex: [ 1.5, 1 ], intersection: true }
				];
				subject.splice(1, 0, 
					{ vertex: [ 1.5, 1 ], intersection: true },
					{ vertex: [ 2.5, 1 ], intersection: true });
				subject.splice(4, 0, {
					vertex: [ 3, 2 ], intersection: true
				});
				subject[1].corresponding = clip[6];
				clip[6].corresponding = subject[1];
				subject[2].corresponding = clip[5];
				clip[5].corresponding = subject[2];
				subject[4].corresponding = clip[3];
				clip[3].corresponding = subject[4];

				label(clip, subject);

				expect(clip[5]).to.not.have.property('entry');
				expect(clip[5]).to.have.property('exit', true);

				expect(clip[6]).to.not.have.property('entry');
				expect(clip[6]).to.not.have.property('exit');				
			});

			it('should mark the start and end of a delayed exterior bouncing chain as neither entries nor exits', function() {
				// +--------------+
				// |              |
				// |              |
				// |              |
				// +-----+===+----+
				//       |   |
				//       +---+
				const clip = [
					{ vertex: [ 1.5, 0 ] },
					{ vertex: [ 2.5, 0 ] },
					{ vertex: [ 2.5, 1 ], intersection: true },
					{ vertex: [ 1.5, 1 ], intersection: true }
				];
				subject.splice(1, 0,
					{ vertex: [ 1.5, 1 ], intersection: true },
					{ vertex: [ 2.5, 1 ], intersection: true });
				subject[1].corresponding = clip[3];
				clip[3].corresponding = subject[1];
				subject[2].corresponding = clip[2];
				clip[2].corresponding = subject[2];

				label(subject, clip);

				expect(subject[1]).to.not.have.property('entry');
				expect(subject[1]).to.not.have.property('exit');

				expect(subject[2]).to.not.have.property('entry');
				expect(subject[2]).to.not.have.property('exit');
			});

			it('should mark the start of a delayed interior bouncing chain as an exit and the end as an entry', function() {
				// +--------------+
				// |              |
				// |     +---+    |
				// |     |   |    |
				// +-----+===+----+
				const clip = [
					{ vertex: [ 1.5, 1 ], intersection: true },
					{ vertex: [ 2.5, 1 ], intersection: true },
					{ vertex: [ 2.5, 2 ] },
					{ vertex: [ 1.5, 2 ] }					
				];
				subject.splice(1, 0, 
					{ vertex: [ 1.5, 1 ], intersection: true },
					{ vertex: [ 2.5, 1 ], intersection: true });
				subject[1].corresponding = clip[0];
				clip[0].corresponding = subject[1];
				subject[2].corresponding = clip[1];
				clip[1].corresponding = subject[2];

				label(clip, subject);

				expect(clip[0]).to.not.have.property('entry');
				expect(clip[0]).to.have.property('exit', true);

				expect(clip[1]).to.have.property('entry', true);
				expect(clip[1]).to.not.have.property('exit');
			});

			it('should throw when subject and clip are identical', function() {
				const clip = subject.slice();
				for (let i = 0; i < subject.length; i++) {
					subject[i].intersection = true;
					clip[i].intersection = true;
					subject[i].corresponding = clip[i];
					clip[i].corresponding = subject[i];
				}

				expect(label.bind(null, subject, clip)).to.throw(TypeError);
			});
		});		
	});

	describe('splitHybrid', function() {
		it('should split vertices marked as both an entry and an exit', function() {
			const clip = [
				{ vertex: [ 0, 0 ] },
				{ vertex: [ 3, 1 ], intersection: true, corresponding: subject[1], crossing: false },
				{ vertex: [ 6, 2 ] }
			]
			Object.assign(subject[1], { 
				intersection: true,
				corresponding: clip[1],
				crossing: false,
				entry: true,
				exit: true
			});
			
			splitHybrids(subject, clip);

			expect(subject).to.have.lengthOf(5);
			expect(subject[1]).to.have.property('exit', true);
			expect(subject[1].entry).to.not.be.ok;

			expect(subject[2]).to.have.property('vertex').that.deep.equals(subject[1].vertex);
			expect(subject[2]).to.have.property('entry', true);
			expect(subject[2].exit).to.not.be.ok;

			expect(subject[1].corresponding).to.not.equal(subject[2].corresponding);
			expect(subject[1].corresponding).to.deep.equal(subject[2].corresponding);
		});
	});

	describe('fuse', function() {
		const MIN_LENGTH = 1.0e-4;

		let correspondingEntry;
		let correspondingExit;

		beforeEach(function() {
			correspondingEntry = {
				vertex: [ 2 - 0.49 * MIN_LENGTH, 1 ],
				intersection: true,
				crossing: true,
				entry: true
			};
			correspondingExit = {
				vertex: [ 2 + 0.49 * MIN_LENGTH, 1 ],
				intersection: true,
				crossing: true,
				exit: true
			};
			subject.splice(1, 0, 
				{ vertex: correspondingEntry.vertex, intersection: true, crossing: true, entry: true, corresponding: correspondingEntry },
				{ vertex: correspondingExit.vertex, intersection: true, crossing: true, exit: true, corresponding: correspondingExit });
		});

		it('should fuse entry and subsequent exit if they are closer together than √MIN_LENGTH_SQ', function() {
			fuse(subject, MIN_LENGTH**2);

			expect(correspondingEntry.vertex).to.equal(correspondingExit.vertex);
			expect(correspondingEntry).to.have.property('fused', correspondingExit);
			expect(correspondingExit).to.have.property('fused', correspondingEntry);
		});

		it('should not fuse entry and subsequent exit if their distance is at least √MIN_LENGTH_SQ', function() {
			fuse(subject, (correspondingEntry.vertex[0] - correspondingExit.vertex[0])**2);

			expect(correspondingEntry.vertex).to.not.equal(correspondingExit.vertex);
		});

		it('should fuse even if there are vertices between a fusable entry and exit', function() {
			subject.splice(2, 0,
				{ vertex: [ 2, 1 ] },
				{ vertex: [ 1, 0 ] },
				{ vertex: [ 3, 0 ] },
				{ vertex: [ 2, 1 ] });

			fuse(subject, MIN_LENGTH**2);

			expect(correspondingEntry.vertex).to.equal(correspondingExit.vertex);
			expect(correspondingEntry).to.have.property('fused', correspondingExit);
			expect(correspondingExit).to.have.property('fused', correspondingEntry);
		});
	});

	describe('separate', function() {
		it('should work regardless of whether tracing starts at a fused vertex or not', function() {
			//      +   +
			//     / \ / \
			//    +---+---+
			//      start 
			let subject = [
				{ vertex: [ 3, 1 ] },
				{ vertex: [ 4, 2 ] },
				{ vertex: [ 5, 1 ] },
				{ vertex: [ 3, 1 ] },
				{ vertex: [ 1, 1 ] },
				{ vertex: [ 2, 2 ] },
			];
			subject[0].fused = subject[3];
			subject[3].fused = subject[0];

			let result = separate(subject);

			expect(result).to.be.an('array').with.lengthOf(2);
			expect(result[0].map(item => item.vertex)).to.deep.equal(subject.slice(0, 3).map(item => item.vertex));
			expect(result[1].map(item => item.vertex)).to.deep.equal(subject.slice(3).map(item => item.vertex));

			//      +   +
			//     / \ / \
			//    +---+---+
			// start 
			subject = subject.slice(4).concat(subject.slice(0, 4));

			result = separate(subject);

			expect(result).to.be.an('array').with.lengthOf(2);
			expect(result[0].map(item => item.vertex)).to.deep.equal(subject.slice(2, 5).map(item => item.vertex));
			expect(result[1].map(item => item.vertex)).to.deep.equal(subject.slice(0, 3).map(item => item.vertex));
		});

		it('should break the polygon into two at a fused vertex', function() {
			//   +   +
			//  / \ / \
			// +   +---+
			//  \ /
			//   +  <---- This vertex is there to see that the left polygon gets finished correctly even though it was "interrupted" by the right
			const subject = [
				{ vertex: [ 1, 1 ] },
				{ vertex: [ 2, 2 ] },
				{ vertex: [ 3, 1 ] },
				{ vertex: [ 4, 2 ] },
				{ vertex: [ 5, 1 ] },
				{ vertex: [ 3, 1 ] },
				{ vertex: [ 2, 0 ] }
			];
			subject[2].fused = subject[5];
			subject[5].fused = subject[2];

			const result = separate(subject);

			expect(result).to.be.an('array').with.lengthOf(2);

			expect(result[0].map(item => item.vertex)).to.deep.equal(subject.slice(2, 5).map(item => item.vertex));			
			expect(result[1].map(item => item.vertex)).to.deep.equal(subject.slice(0, 3).concat([subject[6]]).map(item => item.vertex));
		});
	});

	describe('clean', function() {
		it('should remove collinear vertices', function() {
			//   +
			//  / \
			// +-+-+
			const poly = [
				{ vertex: [ 1, 1 ] },
				{ vertex: [ 2, 1 ] },
				{ vertex: [ 3, 1 ] },
				{ vertex: [ 2, 2 ] }
			]

			const result = clean([ poly ]);

			expect(result).to.be.an('array').with.lengthOf(1);
			expect(result[0]).to.deep.equal(poly.filter((_, index) => index !== 1));
		});

		it('should remove polygons with less than three vertices', function() {
			// +--+--+
			const poly = [
				{ vertex: [ 1, 1 ] },
				{ vertex: [ 2, 1 ] },
				{ vertex: [ 3, 1 ] }
			];

			const result = clean([ poly ]);
			
			expect(result).to.be.an('array').that.is.empty;
		});
	});
});
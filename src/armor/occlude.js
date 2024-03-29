import * as Vector from 'geometry-3d/vector';
import * as geom from 'geometry-3d';
import polybool from 'polybooljs';
import recover from './recover.js';
import rootlog from 'loglevel';

const dedicatedlog = rootlog.getLogger('Projector');

// At what angle to consider a triangle perpendicular to the view plane
export const MAX_ANGLE = 89.5;
// How long a segment can be in zero-length recovery before it is fused
export const MIN_LENGTH  = 1.0e-6;

// How many times to attempt error recovery before giving up
export const MAX_RETRIES = 3;

const ANGLE_EPSILON = Math.cos(MAX_ANGLE * Math.PI/180) ** 2;
const MIN_LENGTH_SQ = MIN_LENGTH ** 2;

// Helper function that calculates the bounding box of the passed polygon. It works in any number of dimensions.
// The result is an array of objects { min, max } for each dimension.
// E.g. a two-dimensional polygon would have a result like this: 
// [
// 		{ min: <left>, max: <right> },
// 		{ min: <bottom>, max: <top> }
// ]
function getBoundingBox(poly) {
	const dims = poly[0]?.length;
	const result = new Array(dims);
	for (let i = 0; i < dims; i++) {
		const values = poly.map(vertex => vertex[i]);
		result[i] = {
			min: Math.min(...values),
			max: Math.max(...values)
		};
	}
	return result;
}

/**
 * Helper class that holds cached bounding boxes for triangles.
 */
class BBoxCache {
	/**
	 * Constructs a new BBoxCache and populates it with the bounding boxes of `mesh`.
	 */
	constructor(mesh) {
		this.cache = new Map();
		for (const tri of mesh) 
			this.cache.set(tri, getBoundingBox(tri));
	}

	/** 
	 * Gets the cached bounding box for `tri`. On cache miss, the bounding box is constructed and the cache is updated.
	 * (This can happen if the underlying mesh changes, e.g. when comparing meshes against themselves.) 
	 */
	get(tri) {
		let result = this.cache.get(tri);
		if (!result) {
			result = getBoundingBox(tri);
			this.cache.set(tri, result);
		}
		return result;
	}
}

export default function occlude(subject, other, viewAxis) {
	const view = [0,1,2].map(dim => dim === viewAxis ? 1 : 0);
	let i = 0;

	const bboxes = new BBoxCache(other);

	while (i < subject.length) {
		dedicatedlog.debug(`Checking triangle ${i} of mesh ${subject.id} against mesh ${other.id}`);

		// The triangle of the subject we are currently handling
		let T = subject[i];
		// That triangle's normal vector and distance from zero. 
		// Together these describe the triangle's plane
		const normal = geom.normal(T);
		const d = Vector.dot(normal, T[0]);

		// Find the largest coordinate of T's normal vector. This is the dimension in which T is smallest.
		// It follows that out of all axis-aligned projections of T, this is the one with the largest area. (This will
		// improve accuracy.)
		// Note that depending on T's orientation in the 3D space, axis need not be the same as the view axis.
		const axis = [ 0, 1, 2 ].reduce((prev, curr) => Math.abs(normal[curr]) >= Math.abs(normal[prev]) ? curr : prev);

		// Do a preliminary check to see if T is (almost) perpendicular to the view axis.
		// If it is, we can remove it and save a lot of expensive computations.
		// In addition, if it is ALMOST perpendicular, its projection along the view axis will be very small,
		// and this tends to make the computations numerically unstable/lead to zero-length segment errors.
		//
		// Remove T if its angle to the view vector is close to 90 degrees
		if (Math.abs(Vector.dot(normal, view)) < ANGLE_EPSILON) {
			// Remove T and do not increase i
			subject.splice(i, 1);
			// Only construct error message if we are actually displaying this log. 
			// Normally, this is discouraged. We do it here because constructing the log message 
			// involves computationally expensive operations in itself (two calls to Math.sqrt() and one to Math.acos())
			if (dedicatedlog.getLevel() <= dedicatedlog.levels.DEBUG)
				dedicatedlog.debug(`Removed triangle ${i} because it was at angle ${Math.acos(Vector.dot(normal, view) / (Vector.length(normal) * Vector.length(view))) * 180/Math.PI} to the view vector\n`);
			continue;
		}

		// Create the list of (potentially) occluding polygons
		// This is done by projecting all triangles of other onto T's plane and then subtracting them from T
		const bboxT = getBoundingBox(T);
		let occluders = other
			// Do not occlude T with itself, because the result would always be empty
			// (This will happen when checking a mesh against itself)
			.filter(tri => tri !== T)
			// Filter out triangles whose bounding boxes do not overlap T's bounding box
			.filter(tri => {
				const bboxTri = bboxes.get(tri);
				// Compare the bounding boxes in all dimensions except the view axis. 
				// If the bounding boxes do not overlap, the triangles cannot intersect
				for (let i = 0; i < bboxT.length; i++) {
					if (i === viewAxis)
						continue;
					// This dimension of the bounding boxes does not overlap if
					// - tri's smallest coordinate is larger than T's largest, or
					// - tri's largest coordinate is smaller than T's smallest
					// E.g. in the "x" dimension, they do not overlap if
					// - tri's right edge is to the left of T's left edge, or
					// - tri's left edge is to the right of T's right edge 
					else if (bboxTri[i].min > bboxT[i].max || bboxTri[i].max < bboxT[i].min)
						return false;
				}
				return true;
			})
			// Do not occlude with triangles that are (almost) perpendicular to the view axis.
			// Their impact would be negligible, and the computations tend to be numerically unstable/lead to zero-length segment errors.
			.filter(tri => Math.abs(Vector.dot(geom.normal(tri), view)) > ANGLE_EPSILON)
			// Project onto T's plane along the view axis
			.map(tri => {
				let selector = Vector.dot(normal, view) > 0 ? 'above' : 'below';
				tri = geom.cut(tri, normal, d)[selector];
				if (tri.length > 0)
					tri = geom.project(tri, normal, d, viewAxis);
				return tri;
			})
			// Reduce to 2D in the same dimensions as for T. 
			.map(poly => geom.convertDown(poly, axis))
			// Filter out very small triangles
			.map(poly => geom.fuse(poly, MIN_LENGTH_SQ))
			.filter(poly => poly.length >= 3)
			// Convert to polybooljs' format
			.map(poly => ({
				inverted: false,
				regions: [ poly ]
			}));

		// Convert T into polybooljs' format
		T = {
			regions: [ geom.convertDown(T, axis) ], 
			inverted: false
		};

		let errorPolys;
		let retries = MAX_RETRIES;
		do {
			errorPolys = [];
			retries--;

			// Since we will be performing a whole sequence of operations on T, we will use the core API of polybooljs
			// for efficiency reasons. See https://www.npmjs.com/package/polybooljs?activeTab=readme#advanced-example-1
			// 
			// Convert T to a list of segments.
			let segments = polybool.segments(T);
			// Convert every polygon in occluders to segments, intersect them with T's segments and select
			// the subtraction.
			for (let poly of occluders) {
				try {
					let polySegments = polybool.segments(poly);
					let combined = polybool.combine(segments, polySegments);
					segments = polybool.selectDifference(combined);
					if (segments.segments.length === 0) {
						dedicatedlog.debug(`Stopping early because the triangle is completely occluded`);
						// We can stop now, because there is nothing left to subtract further occluders from
						errorPolys = [];
						break;
					}
				} catch(err) {
					// Sometimes polybooljs will throw a "zero-length segment" error. According to the docs, this happens
					// when the epsilon it uses for floating-point comparisons is "either too large or too small". (See
					// https://www.npmjs.com/package/polybooljs?activeTab=readme#epsilon)
					// 
					// Since this is not terribly helpful in choosing a more appropriate epsilon, we will just collect all
					// error-generating occluders and deal with them separately later.
					errorPolys.push(poly);
				}
			}
			dedicatedlog.debug(`Polygon ${i} generated ${errorPolys.length || 'no'} errors`);
	
			// Convert segments back to a polygon
			T = polybool.polygon(segments);
	
			if (errorPolys.length > 0) {
				// Project T to its regions
				T = T.regions;
				// Project error polygons to a flat list of their regions. errorPolys is now an array of polygons.
				errorPolys = errorPolys.flatMap(poly => poly.regions);

				// Loop over all regions of T and errorPolys. Loop backward because we will be deleting from those arrays.
				for (let i = T.length - 1; i >= 0; i--) {
					for (let j = errorPolys.length - 1; j >= 0; j--) {
						let recovered = recover(T[i], errorPolys[j]);
						// Filter out very small polygons from the results of recover().
						// This is in preparation of the next round of the main loop. 
						recovered.subject = recovered.subject
							.map(poly => geom.fuse(poly, MIN_LENGTH_SQ))
							.filter(poly => poly.length >= 3);
						recovered.clip = recovered.clip
							.map(poly => geom.fuse(poly, MIN_LENGTH_SQ))
							.filter(poly => poly.length >= 3);

						// Replace the current error polygon with the results of error recovery (this may be several polygons)
						// There is no need to adjust j here, because this is the inner loop: running recover again with the same
						// i (same region of T) and one of the just-recovered polygons can give no new results.
						errorPolys.splice(j, 1, ...recovered.clip);

						// Replace the current region of T with the results of the recovery (this may be several polygons)
						T.splice(i, 1, ...recovered.subject);
						// If the current region has vanished, continuing recovery of this region with the remaining error polygons
						// is pointless. Continue with the next region.
						// Otherwise, adjust i so we don't miss any regions in the next iteration.
						// 
						// Note: There is no need to check if T is completely empty for an early break, because at most one region
						// can be removed in each iteration of the outer loop. Therefore, T's region cannot be emptied before the
						// loop runs out. 
						if (recovered.subject.length === 0)
							break;
						else
							i += recovered.subject.length - 1;
					}
				}
				dedicatedlog.debug(`Error recovery on polygon ${i} yielded ${T.length} regions and ${errorPolys.length} new occluders`);
				T = {
					regions: T,
					inverted: false
				};
				occluders = errorPolys.map(poly => ({
					regions: [ poly ],
					inverted: false
				}));
			}
		} while (errorPolys.length > 0 && retries > 0);

		if (retries === 0 && errorPolys.length > 0) 
			dedicatedlog.debug(`Gave up error recovery for polygon ${i} after ${MAX_RETRIES} attempts`);

		T = T.regions
			.map(region => geom.fuse(region, MIN_LENGTH_SQ))
			.filter(region => region.length >= 3)
			// Break the result up into triangles again
			.flatMap(geom.triangulate)
			// Extrude T from its axis-aligned state back onto the original triangle's plane
			.map(tri => geom.project(geom.convertUp(tri, axis), normal, d, axis))
		dedicatedlog.debug(`Polygon ${i} broken up into ${T.length} triangles`);

		// Replace T with its remaining triangles in subject.
		subject.splice(i, 1, ...T);
		/// For the next iteration, skip all triangles we just inserted.
		i += T.length;
	}
	return subject;
}
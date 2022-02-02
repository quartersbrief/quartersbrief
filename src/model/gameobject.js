import clone from 'just-clone';
import { autocreate } from '../util/autocreate-getters.js';

/**
 * This is a thin wrapper around game object definitions as they can be read from
 * `GameParams.data`. 
 *
 * `GameObject` provides easy access to even nested and array properties using dot
 * notation. {@link #get}
 *
 * All game objects have a `name`, `index`, and `id` property, as well as a `typeinfo` 
 * object. (This is checked at application startup through invariant assertion checking.)
 */
class GameObject {
	/**
	 * Definitions for autocreated getters
	 */
	static #LOOKUP_DEFINITIONS = {
		Name: 'name',
		Refcode: 'index',
		Index: 'index', // Alias
		ID: 'id',
		TypeInfo: 'typeinfo',
		Type: 'typeinfo.type'
	};

	/**
	 * Regex to find game object reference codes.
	 * References all start with the capital letter P, followed
	 * by two or three more capital letters and three digits. 
	 * 
	 * Example: PASC206, PAD049
	 * @type {RegExp}
	 */
	static REFERENCE_CODE_REGEX = new RegExp('^P[A-Z]{2,3}[0-9]{2,3}$');
	/**
	 * Regex to find reference names. A reference name is either just a
	 * reference code, or a reference code follwoed by an underscore and at least one 
	 * character.
	 *
	 * Example: PASC206_Dallas (note that PASC206 - the reference code - is also a valid
	 * reference name)
	 * @type {RegExp}
	 */
	static REFERENCE_NAME_REGEX = new RegExp(GameObject.REFERENCE_CODE_REGEX.source.slice(0,-1) + '(?:_\\w+)?$');
	/**
	 * Creates a new GameObject and copies all properties
	 * from data to it.
	 * @param  {Object} data The source to copy from
	 */
	constructor(data) {
		let self = this;

		// Copy over everything from data
		Object.assign(self, clone(data));

		autocreate(self, GameObject.#LOOKUP_DEFINITIONS);
	}

	/**
	 * Gets the value that is stored under the provided key name, if any.
	 *
	 * The key supports dot notation to gain access to nested properties and
	 * array entries. Array indices need to be expressed in dot notation as well.
	 * Examples, where `go` is a `GameObject`:
	 * - `go.get('prop')`` is the same as `go.prop`
	 * - `go.get('nested.prop)` is the same as `go.nested.prop`
	 * - `go.get('arr.0')` is the same as `go.arr[0]`
	 * @param  {string} key The key to look up
	 * @return {*}     The value for that key.
	 * @throws
	 * Throws an error if the property does not exist, or
	 * any intermediate levels are missing when using dot notation.
	 */
	get(key) {
		let self = this;

		// Split the key into its parts. These can be thought of as "path elements"
		// to traverse along the data object
		let path = key.split('.');
		let target = self;
		while(path.length > 0) {
			let currKey = path.shift();
			target = target[currKey];
			if (!target) 
				throw new Error(`Trying to read unknown property ${key} of ${self}`);
		}
		return target;
	}

	/**
	 * Sets the given key name to the passed value. 
	 *
	 * The key supports dot notation. If any intermediate levels are missing,
	 * they will be created. For example, `new GameObject({a: {}).set('a.b.c', 5)` 
	 * will result in `{a: b: 5}}`.
	 * @param {string} key   The key to set.
	 * @param {*} value The value to set it to.
	 */
	set(key, value) {
		let self = this;

		let path = key.split('.');
		let target = self;
		// Traverse the path except for the last key. 
		// The last one needs to be kept so we can assign
		// a value to it 
		while (path.length > 1) {
			let currKey = path.shift(); // Remove first element			
			if (!target[currKey]) 
				target[currKey] = {}; // Create intermediate levels if they are missing
			target = target[currKey];
		}
		target[path.shift()] = value;
	}
}

export { GameObject }
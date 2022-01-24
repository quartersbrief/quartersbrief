var log = require('loglevel');

/**
 * Regex to find reference codes (including a ship's code).
 * References all start with the capital letter P, followed
 * by two or three more capital letters and three digits. 
 * 
 * Example: PASC206, PAD049
 * @type {String}
 */
const REFERENCE_CODE_REGEX = '^P[A-Z]{2,3}[0-9]{3}';
/**
 * Regex to find reference names. A reference name is a
 * reference code, followed by an underscore and at least one 
 * character. 
 *
 * Example: PASC206_Dallas
 * @type {String}
 */
const REFERENCE_NAME_REGEX = REFERENCE_CODE_REGEX + '_\w+';

class ShipFactory {

	/**
	 * A list of keys that will be ignored during reference resolution.
	 * 
	 * The reason for this is that expanding some references will enlarge the 
	 * result unnecessarily in the best case and, in the worst case, crash the 
	 * program when the call stack exceeds its maximum size. 
	 * 
	 * For example, following the "nextShip" reference on a tech tree ship's upgrade path 
	 * will result in the ship containing full expansions of all ships that are 
	 * researchable (directly or indirectly) from this ship.
	 * In the case of a tier I ship, that means the _entire_ tech tree will be contained.
	 * 
	 * @type {Array}
	 */
	static IGNORED_KEYS = [
			// Blacklisted to prevent full inclusion of following ships in the tech tree
			'nextShips', 
			// Blacklisted to prevent infinite nesting of requested ship when resolving
			// (Requested ship itself will have a "name" property, which would otherwise
			// get resolved)
			'name', 
			// Actual WoWS name for what we call a reference code. 
			// Blacklisted for the same reason as "name" (see above)
			'index', 
		];

	/**
	 * Private property that holds the loaded
	 * GameParams data in toto.
	 * @private
	 */
	#everything;

	#knownShipsByID = {};
	#knownShipsByCode = {};

	build(designator) {
		var self = this;

		// Helper function that resolves all the references (i.e., any of its properties
		// that are a string value matching the REFERENCE_CODE_REGEX) with the data for
		// that value as read from the #everything property.
		function resolveReferences(data) {						
			// Iterate over all keys in the current object
			for (let key of Object.keys(data)) {
				// Therefore, omit certain keys from reference resolution. See
				// JSDoc comment for IGNORED_KEYS.
				if (ShipFactory.IGNORED_KEYS.includes(key)) {
					log.debug(`Ignored key ${key} because it is blacklisted`);	
					continue;
				}

				// If the current key's value is a reference code, replace the code with
				// its actual content.
				if (typeof data[key] === 'string' && data[key].match(REFERENCE_CODE_REGEX)) {				
					// Only replace if the reference could actually be expanded
					// If not, just keep the reference in there
					// This can be the case with some unfortunately-named components
					// in game files.
					// See e.g. PASA010_Ranger_1944, where the planes are called
					// PAUB002_Grumman_TBF, and then referenced as such in the
					// shipUpgradeInfo fields, rather than the AB1_DiveBomber scheme
					// most other files use. This matches the regex, obviously, but
					// no data of that refcode will be found in #everything.
					let expanded = self.#everything[data[key]];
					if (expanded) {
						log.debug(`Expanded reference ${data[key]}`);
						data[key] = expanded;
					} else {
						log.debug(`Unable to expand reference ${data[key]}, target unknown. The reference has been ignored.`);
					}	
				}
				// If the current key's value is an...
				switch (typeof data[key]) {
					// ...  object: resolve it recursively.
					case 'object': 
						// Because typeof null === 'object'
						if (data[key] === null) break;
						data[key] = resolveReferences(data[key]);
						break;
					// ... array: resolve each of its entries recursively.
					case 'array': 
						for (let i = 0; i< data[key].length; i++)
							data[key][i] = resolveReferences(data[key][i]);
					// Otherwise keep everything as is.						
					default:
				}
			}
			return data;
		}

		var ship;

		// Step 1: Get the right data object from #everything
		// To find that object, it must either have a property 'id' that equals
		// the designator value if the designator was a number,
		// or have a property 'index' that equals the designator value if the
		// designator was a refcode.
		let findFn;
		if (typeof designator === 'number') 
			findFn = (obj => obj.id && obj.id === designator);
		else if (typeof designator === 'string' && designator.match(REFERENCE_CODE_REGEX)) 
			findFn = (obj => obj.index && obj.index === designator)

		ship = Object.values(self.#everything).find(findFn)

		// Step 2: Resolve all references in the ship
		ship = resolveReferences(ship);

		// Put ship in the caches
		self.#knownShipsByID[ship.id] = ship;
		self.#knownShipsByCode[ship.index] = ship;

		return ship;
	}

	/**
	 * Creates a Ship object for the ship with the given designator. 
	 * If the ship was requested before, it will be read from cache. 
	 * Otherwise, it will be constructed.
	 * @param  {Number|String} designator The designator for the ship
	 * to get. This can either be a number, in which case it will be assumed
	 * to be the ship's ID. Or it can be a string, in which case it will
	 * be assumed to be the ship's reference code.
	 * @return {Ship} The ship for that designator.
	 * @throws Will throw an error ("No data set") if the ShipFactory's data has not
	 * been set using {@link setEverything}.
	 * @throws Will throw an error ("Invalid argument") if a malformed
	 * designator is passed.
	 */
	createShip(designator) {
		var self = this;

		var t0 = Date.now();

		log.debug('Create ship for designator ' + designator)
		
		if (!self.#everything)
			throw new Error('No data set. Make sure to set data using setEverything before requesting.');

		var ship;
		
		// Check if a ship of that designator is already known.
		// If so, return it.
		// If designator is a number, it is the ID of the requested ship
		if (typeof designator === 'number') {
			ship = self.#knownShipsByID[designator];
		} else if (typeof designator === 'string' && designator.match(REFERENCE_CODE_REGEX)) {
			ship = self.#knownShipsByCode[designator];
		} else
			throw new Error(`Invalid argument. ${designator} is not a valid designator. Provide either a numeric ID or a reference code.`);


		if (!ship) {		
			// Ship is not yet known, construct it.
			log.debug('Ship was not in cache, constructing');
			ship = self.build(designator);
		}

		log.info('Retrieved ship ' + ship.name + ' in ' + (Date.now() - t0) + 'ms');
		return ship; 
	}

	setEverything(everything) {
		var self = this;

		// Reset caches:
		self.#knownShipsByID = {}; 
		self.#knownShipsByCode = {};

		self.#everything = everything;
	}
}



module.exports = new ShipFactory();
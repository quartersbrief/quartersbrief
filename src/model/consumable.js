import { GameObject } from './gameobject.js';

class Consumable extends GameObject {

	#flavor;

	setFlavor(flavor) {
		if (typeof this[flavor] !== 'object')
			throw new Error(`Trying to set unknown flavor ${flavor} on consumable ${this.name}`);
				
		this.#flavor = flavor;
	}

	isType(type) {
		return this.get('consumableType') === type;
	}

	/**
	 * Reads through to the set flavor except for typeinfo.*, name, index and id.
	 * @throws
	 * Throws an error if trying to read through before a flavor is set.
	 * @override
	 */
	get(key, options) {
		// key might be in dot notation, so we need check against only the first part
		// If the first part is typeinfo, name, index or id, read it from this object
		// Otherwise read through to the flavor
		if (!['typeinfo', 'name', 'index', 'id'].includes(key.split('.')[0]))
			if (!this.#flavor)
				throw new Error(`Trying to get property ${key} on consumable ${this.name} while no flavor is set`);
			else
				key = this.#flavor + '.' + key;
		
		return super.get(key, options);
	}

}

export { Consumable }
import { EventEmitter } from 'events';
import DataObject from '../model/dataobject.js';
import pug from 'pug';
import * as sass from 'sass';
import rootlog from 'loglevel';
import clone from 'lodash/cloneDeepWith.js';
import * as topics from './topics/index.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const renderBriefing = pug.compileFile(join(dirname(fileURLToPath(import.meta.url)), 'briefing.pug'));

/**
 * The `BriefingBuilder` constructs a briefing for a given battle and agenda. It dynamically imports the 
 * topic builder for each topic of the agenda, then calls this with the battle and a `GameObjectFactory`.
 * If no topic builder could be found, it constructs a special `error topic` for that topic, but finishes
 * the briefing otherwise.
 *
 * Topic content is constructed by getting each topic's dedicated topic builder. Topic builders are functions
 * of length 2 that return an object with properties `html` and `css` containing the briefing's content 
 * and styling respectively. 
 *
 * Topic builders are retrieved by calling `{@link #getTopic}`, which in turn attempts a dynamic import of
 * the module for the topic builder. Topic builder modules are expected to be found in `topics/<topicname>/<topicname>.js`
 * and export a function as described above as default. The function may be `async`.
 */
export default class BriefingBuilder {
	static EVT_BRIEFING_START = 'briefingstart';
	static EVT_BRIEFING_TOPIC = 'briefingtopic';
	static EVT_BRIEFING_FINISH = 'briefingfinish';
	
	/**
	 * Creates a new `BriefingBuilder`.
	 * @param  {Object} [providers] A hash of data providers to be passed to each `Topic`'s constructor.
	 * It is possible to create a briefing builder without providers, but note that topics will then also 
	 * not have any available.
	 */
	constructor(providers) {
		this.providers = providers;
	}

	/**
	 * Dynamically imports the topic for the given `topic`. Topics will be expected
	 * to be a file with the topic's name and extension '.js' in a subdirectory of the topic's name,
	 * exporting a class with the `Topic` interface as default.
	 * Topics do not need to worry about polluting other topic's styles, as topic styles
	 * are automatically scoped.
	 * @param  {String} topic The topic for which to get a topic builder.
	 * @return {Topic}       The `Topic` class for the given `topic` name.
	 */
	getTopic(topic) {
		const topicClassName = topic
			.split('_')
			.map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
			.join('') + 'Topic';
		return topics[topicClassName];
	}

	/**
	 * Constructs an error topic for missing topic builders.
	 * @param  {Error} err The error that prevented a topic builder from being available.
	 * @return {String}     A string containing the HTML for the error topic.
	 */
	buildErrorTopic(err) {
		return {
			html: `<p>There was an error while making the topic.</p>`,
			css: `p { color: red; }`
		};
	}

	/**
	 * Builds a briefing using the battle and the agenda. This method examines the passed
	 * agenda and optains topic builders for each topic the agenda requests. These topic
	 * builders are then (asynchronously) executed. 
	 *
	 * This method returns an object `{ html, css, topics }` where `html` and `css` contain the
	 * content and styling for the briefing "scaffolding", respectively. The briefing scaffolding
	 * is the briefing with only empty placeholders for each topic to be built. `topics` will
	 * receive the results of the topic builder executions as they become available, but note
	 * that `html` and `css` will not be updated accordingly.
	 *
	 * The returned briefing object is an instance of `EventEmitter`. It emits 
	 * - `BriefingBuilder.EVT_BRIEFING_START` when it has constructed the scaffolding and is beginning to build the topics.
	 * - `BriefingBuilder.EVT_BRIEFING_TOPIC` when a topic builder has finished rendering its topic. This event passes the 
	 * topic's index and the result of the topic builder into attached listeners.
	 * - `BriefingBuilder.EVT_BRIEFING_FINISH` when all topic builders have finished. For convenience, this also passes the
	 * entire briefing into listeners again.
	 *
	 * This method returns synchronously.
	 * @param  {Battle} battle            The battle for which to build the briefing.
	 * @param  {Agenda} agenda            The agenda by which to build the briefing.
	 * @return {Object} An object containing the HTML for the briefing scaffoldd in `html`
	 * and the scoped styling for the briefing in `css`. This object is an event emitter,
	 * as described above.
	 */
	build(battle, agenda) {
		const t0 = Date.now();
		const dedicatedlog = rootlog.getLogger(this.constructor.name);

		const topics = agenda.getTopicNames().map(topicName => new (this.getTopic(topicName))(topicName, this.providers));

		const briefing = new EventEmitter();

		briefing.id = t0;
		briefing.topics = topics;
		
		const briefingReady = Promise.all(battle
					.vehicles
					.map(vehicle => vehicle.shipId)
					.map(shipId => this.providers.gameObjectProvider.createGameObject(shipId)))
				.then(ships => ships.map(ship => ship.tier))
				.then(async tiers => ({
					tier: Math.max(...tiers),
					ownship: (await this.providers.gameObjectProvider.createGameObject(battle.player.shipId)).label,
					map: this.providers.gameObjectProvider.labeler?.labels[`IDS_${battle.mapName}`.toUpperCase()] 				
				}))
				.then(battleinfo => {
					briefing.battleinfo = battleinfo;
					briefing.html = renderBriefing(briefing);
					briefing.css = sass.compile(join(dirname(fileURLToPath(import.meta.url)), 'briefing.scss')).css;
					return briefing;
				})
				.catch(err => {
					rootlog.error(`Could not create briefing: ${err.message}`);

					// @todo: Replace this with a nicer version
					briefing.html = pug.renderFile(join(dirname(fileURLToPath(import.meta.url)), 'error.pug'), err);
					briefing.css = sass.compile(join(dirname(fileURLToPath(import.meta.url)), 'error.scss')).css;
					return briefing;
				})
				.then(briefing => {
					// Defer emission so there is a chance to attach event listeners
					setImmediate(() => briefing.emit(BriefingBuilder.EVT_BRIEFING_START, briefing));
					return briefing;
				});

		// Do NOT return or await this Promise, because we need to return briefing synchronously.
		// The async nature of the building process is reflected through event emissions.
		Promise.all(topics.map(async (topic, index) => {
			const topicName = agenda.getTopicNames()[index];
			rootlog.debug(`Building topic ${topicName}`);

			let rendered;

			try {				
				rendered = await topic.render(
					clone(battle, function cloneDataObject(obj) {
						if (obj instanceof DataObject)
							return new obj.constructor(clone(obj._data, cloneDataObject))
					}), // Pass a separate copy of the battle to each topic builder
					agenda.topics[topicName]
				);

				// rendered.html = renderTopic({ index, caption, html: rendered.html });
				rendered.css = sass.compileString(`#topic-${index}, #topic-${index}-overlay { ${rendered.css ?? ''} }`).css;

				briefing.topics[index] = rendered;
				dedicatedlog.debug(`Built topic ${topicName} in ${Date.now() - t0}ms`);
			} catch (err) {
				rootlog.error(`Building topic ${topicName} failed: ${err} ${err.stack}`);
				rendered = this.buildErrorTopic(err);
			}
			// Make sure EVT_BRIEFING_START gets issued first
			await briefingReady;			
			setImmediate(() => briefing.emit(BriefingBuilder.EVT_BRIEFING_TOPIC, briefing.id, index, rendered));
			return rendered;
		})).then(() => {
			rootlog.info(`Created briefing using ${agenda.name ? `agenda ${agenda.name}` : 'unnamed agenda'} in ${Date.now() - t0}ms`);
			setImmediate(() => briefing.emit(BriefingBuilder.EVT_BRIEFING_FINISH, briefing));
		}).catch(err => rootlog.error(`Error while building briefing: ${err}`)); // This should really never happen, because all "dangerous" parts are wrappen in try-catch up above

		return briefing;
	}
}
import config, { paths } from './config.js';
import Updater from '../update/updater.js';
import updateLabels from '../update/update-labels.js';
import updateGameParams from '../update/update-gameparams.js';

export default async function update() {
	const updater = new Updater(config.wowsdir, paths.data);
	updater.register(updateLabels)
	updater.register(updateGameParams);
	updater.update(config);
}
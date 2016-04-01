import path from 'path';
import debug from 'debug';
import watch from 'node-watch';
import childProcess from 'child_process';

import { getSettings } from 'roc';

import { parseStats } from 'roc-package-webpack-dev';

import { invokeHook } from '../roc/util';

/**
 * Server watcher.
 *
 * @param {object} compiler - a Webpack compiler instance
 * @returns {Promise} Resolves after it has completed.
 */
export default function server(compiler) {
    const settings = getSettings('dev');
    debug.enable(settings.debug);

    const watcherLogger = debug('roc:dev:node:watcher');
    const builderLogger = debug('roc:dev:node:builder');

    let initiated = false;

    /*
    * We only want to init this function once, however it will be called everytime the builder has created a new build.
    * Because of this reason we have a flag that makes sure the function only runs once, the first time we have a
    * completed build.
    */
    const initServer = (bundlePath) => {
        if (initiated) {
            return;
        }

        initiated = true;

        let serverProcess;
        let startServer;
        let once = false;

        const restartServer = () => {
            serverProcess.kill('SIGTERM');
            return startServer();
        };

        const watchForChanges = () => {
            watch([bundlePath].concat(settings.watch), (file) => {
                watcherLogger(`Server restarting due to: ${file}`);
                restartServer();
            });
        };

        const listenForInput = (key = 'rs') => {
            watcherLogger(`You can restart the server by entering "${key}" and pressing enter"`);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', function(data) {
                const parsedData = (data + '').trim().toLowerCase();
                if (parsedData === key) {
                    watcherLogger(`Server restarting due to user input [${key}]`);
                    restartServer();
                }
            });
        };

        /*
        * This function runs everytime the server is restarted, which could be because of user input or a file that has
        * been changed. To make sure we only start with one input listner and one file
        * watcher we have a flag, once.
        */
        startServer = () => {
            const env = {
                ...process.env,
                ROC_INITAL_ARGV: JSON.stringify(process.argv),
                ROC_INITAL_SETTINGS: JSON.stringify(getSettings()),
                ROC_NODE_DEV_ENTRY: bundlePath
            };
            // env - use it for the entry file
            serverProcess = childProcess.fork(require.resolve('./wrapper'), { env });

            // Make sure or node process is terminated when the main process is
            process.on('exit', () => serverProcess.kill('SIGTERM'));

            if (!once) {
                once = true;
                listenForInput();
                watchForChanges();
            }

            // Hook for adding things that integrates with the node process
            invokeHook('dev-process-created', serverProcess);
        };

        startServer();
    };

    return new Promise((resolve, reject) => {
        compiler.watch({
            poll: false
        }, (serverErr, serverStats) => {
            if (serverErr) {
                return reject(serverErr);
            }

            if (!compiler) {
                return reject(new Error('A compiler instance must be defined in order to start watch!'));
            }

            const statsJson = serverStats.toJson();
            builderLogger(`Server rebuilt ${statsJson.time} ms`);

            // FIXME
            if (statsJson.errors.length > 0) {
                statsJson.errors.map(err => console.log(err));
            }

            // FIXME
            if (statsJson.warnings.length > 0) {
                statsJson.warnings.map(wrn => console.log(wrn));
            }

            let bundleName = 'app.server.bundle.js';

            if (statsJson.assets && statsJson.assets.length > 0) {
                const stats = parseStats(statsJson);
                bundleName = stats.script[0];
            }

            const artifact = path.join(compiler.outputPath, '/', bundleName);

            // start first time
            initServer(artifact);
            return resolve();
        });
    });
}
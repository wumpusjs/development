import chokidar from 'chokidar';
import path from 'path';
import { pathToFileURL } from 'url';
import Bot from '@utils/bot';
import BaseModule from '@modules/base.module';
import { Logger } from '@utils/core/logger';

const logger = new Logger('HMR');

function guessModuleName(filePath: string): string {
    const fileName = path.basename(filePath, path.extname(filePath));
    const className = fileName
        .split(/[-.]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return className.endsWith('Module') ? className : `${className}Module`;
}

async function handleReload(filePath: string, bot: Bot): Promise<void> {
    if (initialScanDone)
        logger.info(`Detected change in: ${filePath}. Attempting to reload...`);

    try {
        const fileUrl = `${pathToFileURL(filePath).href}?v=${Date.now()}`;
        const importedModule = await import(fileUrl);
        const ModuleClass = importedModule.default;

        if (typeof ModuleClass !== 'function' || !ModuleClass.name) {
            logger.warn(
                `Skipped ${filePath}: default export is not a named function/class.`,
            );
            return;
        }

        if (ModuleClass.name === BaseModule.name) {
            logger.info(
                `Skipping HMR for ${BaseModule.name} itself from file ${filePath}.`,
            );
            return;
        }

        const parentClass = Object.getPrototypeOf(ModuleClass);

        if (
            typeof parentClass !== 'function' ||
            !parentClass.name ||
            parentClass.name !== BaseModule.name
        ) {
            logger.warn(
                `Skipped ${filePath} (module: ${ModuleClass.name}): does not directly extend ${BaseModule.name}. ` +
                    `Actual parent class: ${
                        parentClass && parentClass.name
                            ? parentClass.name
                            : 'N/A'
                    }.`,
            );
            return;
        }

        const moduleName = ModuleClass.name;

        if (bot.modules.has(moduleName)) {
            const oldModule = bot.modules.get(moduleName);
            if (oldModule && typeof oldModule.stop === 'function') {
                await oldModule.stop();
            }
            bot.modules.delete(moduleName);
            logger.info(`Unloaded existing module: ${moduleName}`);
        }

        bot.register(ModuleClass);
        const newModuleInstance = bot.get(ModuleClass);

        if (newModuleInstance) {
            if (typeof newModuleInstance.init === 'function') {
                await newModuleInstance.init(bot);
            }
            if (typeof newModuleInstance.start === 'function') {
                await newModuleInstance.start();
            }
            logger.info(`Successfully reloaded module: ${moduleName}`);
        }
    } catch (error) {
        logger.error(`Failed to reload module for file: ${filePath}`, error);
    }
}

async function handleUnload(filePath: string, bot: Bot): Promise<void> {
    logger.info(`Detected file deletion: ${filePath}. Attempting to unload...`);

    const moduleName = guessModuleName(filePath);

    if (bot.modules.has(moduleName)) {
        const moduleInstance = bot.modules.get(moduleName);
        if (moduleInstance && typeof moduleInstance.stop === 'function') {
            await moduleInstance.stop();
        }
        bot.modules.delete(moduleName);
        logger.info(`Successfully unloaded module: ${moduleName}`);
    } else {
        logger.warn(
            `Could not find a loaded module corresponding to deleted file: ${filePath}`,
        );
    }
}

let initialScanDone = false;

export function initializeHMR(bot: Bot, modulesPath: string): void {
    // initialScanDone is now set by the watcher's 'ready' event
    // if (bot.options.modules === 'register') {
    // initialScanDone = true;
    // }
    logger.info('Hot Module Replacement is enabled.');
    const watcher = chokidar.watch(modulesPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: bot.options.modules === 'register',
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100,
        },
    });

    logger.info(`Watching for changes in: ${modulesPath}`);

    watcher
        .on('add', (filePath) => handleReload(filePath, bot))
        .on('change', (filePath) => handleReload(filePath, bot))
        .on('unlink', (filePath) => handleUnload(filePath, bot))
        .on('error', (error) => logger.error('Watcher error:', error))
        .on('ready', () => {
            initialScanDone = true;
            logger.info('Initial scan complete. HMR is fully active.');
        });

    bot.on('stop', () => {
        logger.info('Stopping file watcher.');
        watcher.close();
    });
}

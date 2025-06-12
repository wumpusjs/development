import chokidar from 'chokidar';
import path from 'path';
import { pathToFileURL } from 'url';
import Bot from '@utils/bot';
import BaseModule from '@modules/base.module';

function guessModuleName(filePath: string): string {
    const fileName = path.basename(filePath, path.extname(filePath));
    const className = fileName
        .split(/[-.]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return className.endsWith('Module') ? className : `${className}Module`;
}

async function handleReload(filePath: string, bot: Bot): Promise<void> {
    console.log(
        `[HMR] Detected change in: ${filePath}. Attempting to reload...`,
    );

    try {
        const fileUrl = `${pathToFileURL(filePath).href}?v=${Date.now()}`;
        const { default: ModuleClass } = await import(fileUrl);

        if (!(ModuleClass.prototype instanceof BaseModule)) {
            console.warn(
                `[HMR] Skipped ${filePath}: does not export a class extending BaseModule.`,
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
            console.log(`[HMR] Unloaded existing module: ${moduleName}`);
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
            console.log(`[HMR] Successfully reloaded module: ${moduleName}`);
        }
    } catch (error) {
        console.error(
            `[HMR] Failed to reload module for file: ${filePath}`,
            error,
        );
    }
}

async function handleUnload(filePath: string, bot: Bot): Promise<void> {
    console.log(
        `[HMR] Detected file deletion: ${filePath}. Attempting to unload...`,
    );

    const moduleName = guessModuleName(filePath);

    if (bot.modules.has(moduleName)) {
        const moduleInstance = bot.modules.get(moduleName);
        if (moduleInstance && typeof moduleInstance.stop === 'function') {
            await moduleInstance.stop();
        }
        bot.modules.delete(moduleName);
        console.log(`[HMR] Successfully unloaded module: ${moduleName}`);
    } else {
        console.warn(
            `[HMR] Could not find a loaded module corresponding to deleted file: ${filePath}`,
        );
    }
}

export function initializeHMR(bot: Bot, modulesPath: string): void {
    const watcher = chokidar.watch(modulesPath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100,
        },
    });

    console.log(`[HMR] Watching for changes in: ${modulesPath}`);

    watcher
        .on('add', (filePath) => handleReload(filePath, bot))
        .on('change', (filePath) => handleReload(filePath, bot))
        .on('unlink', (filePath) => handleUnload(filePath, bot))
        .on('error', (error) => console.error('[HMR] Watcher error:', error));

    bot.on('stop', () => {
        console.log('[HMR] Stopping file watcher.');
        watcher.close();
    });
}

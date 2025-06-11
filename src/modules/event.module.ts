import path from 'path';
import { pathToFileURL } from 'url';
import BaseModule from '@modules/base.module';
import fs from 'fs/promises';
import { readFolderRecursively } from '@utils/modules/event';
import Event from '@utils/core/event';

export const EVENTS_DIRECTORY = 'events';

export default class EventModule extends BaseModule {
    listeners: Map<string, Function[]> = new Map();

    public async init(): Promise<void> {
        const folder = path.join(process.cwd(), 'src', EVENTS_DIRECTORY);
        const filePaths = await readFolderRecursively(
            folder,
            (fileName) => fileName.endsWith('.js') || fileName.endsWith('.ts'),
        );

        for (const fullPath of filePaths) {
            let resolvedPath: string | null = null;
            try {
                const stats = await fs.lstat(fullPath);
                if (stats.isSymbolicLink()) {
                    resolvedPath = await fs.realpath(fullPath);
                } else if (stats.isFile()) {
                    resolvedPath = fullPath;
                }

                if (resolvedPath) {
                    resolvedPath = pathToFileURL(resolvedPath).href;
                }
            } catch (error) {
                console.error(`Error processing file ${fullPath}:`, error);
                continue;
            }

            if (!resolvedPath) {
                console.warn(
                    `Skipping unsupported file type or error for: ${fullPath}`,
                );
                continue;
            }

            const exported: Event | unknown = (await import(resolvedPath))
                ?.default;

            if (
                !exported ||
                typeof exported !== 'object' ||
                !(exported instanceof Event) ||
                !exported.event ||
                !exported.context ||
                !exported.context.handler ||
                typeof exported.context.handler !== 'function'
            ) {
                console.warn(`Skipping invalid event file: ${resolvedPath}`);
                continue;
            }

            const eventName = exported.event;

            if (this.listeners.has(eventName)) {
                const listeners = this.listeners.get(eventName) || [];
                this.listeners.set(eventName, [
                    ...listeners,
                    exported.context.handler,
                ]);
            } else {
                this.listeners.set(eventName, [exported.context.handler]);
            }
        }
    }

    public start(): void | Promise<void> {
        for (const [eventName, handlers] of this.listeners.entries()) {
            for (const handler of handlers) {
                this.bot.client.on(eventName, (...args: unknown[]) => {
                    handler(this.bot, eventName, args);
                });
            }
        }
    }

    public stop(): void | Promise<void> {
        for (const [eventName, handlers] of this.listeners.entries()) {
            for (const handler of handlers) {
                this.bot.client.removeListener(
                    eventName,
                    handler as () => void,
                );
            }
        }
    }
}

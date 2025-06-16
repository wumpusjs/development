import path from 'path';
import { pathToFileURL } from 'url';
import BaseModule from '@modules/base.module';
import fs from 'fs/promises';
import { readFolderRecursively } from '@utils/modules/event';
import Event from '@utils/core/event';
import { Logger } from '@utils/core/logger';

export const EVENTS_DIRECTORY = 'events';

export default class EventModule extends BaseModule {
    listeners: Map<string, Function[]> = new Map();
    logger = new Logger('EventModule');

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
                this.logger.error(`Error processing file ${fullPath}:`, error);
                continue;
            }

            if (!resolvedPath) {
                this.logger.warn(
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
                this.logger.warn(
                    `Skipping invalid event file: ${resolvedPath}`,
                );
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

            this.logger.info(`Loaded event: ${eventName}`);
        }
    }

    public start(): void | Promise<void> {
        for (const [eventName, handlers] of this.listeners.entries()) {
            for (const handler of handlers) {
                this.bot.client.on(eventName, (...args) => {
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

    public addEventListener(event: Event<any>): void {
        const eventName = event.event;
        const handler = event.context.handler;

        if (this.listeners.has(eventName)) {
            this.listeners.get(eventName)?.push(handler);
        } else {
            this.listeners.set(eventName, [handler]);
        }

        this.bot.client.on(eventName, (...args) => {
            handler(this.bot, eventName, args);
        });
    }
}

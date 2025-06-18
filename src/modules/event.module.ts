import path from 'path';
import { pathToFileURL } from 'url';
import BaseModule from '@modules/base.module';
import fs from 'fs/promises';
import { readFolderRecursively } from '@utils/modules/event';
import Event from '@utils/core/event';
import { Logger } from '@utils/core/logger';

export const EVENTS_DIRECTORY = 'events';

export default class EventModule extends BaseModule {
    eventHandlers: Map<string, Function[]> = new Map();
    activeHandlerWrappers: Map<string, Map<Function, Function>> = new Map();

    logger = new Logger('EventModule');

    public async init(): Promise<void> {
        this.eventHandlers.clear();

        const eventsDirectoryPath = path.join(
            process.cwd(),
            'src',
            EVENTS_DIRECTORY,
        );
        const filePaths = await readFolderRecursively(
            eventsDirectoryPath,
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

            const eventInstance: unknown = (await import(resolvedPath))
                ?.default;

            if (
                !eventInstance ||
                typeof eventInstance !== 'object' ||
                !(eventInstance instanceof Event) ||
                !eventInstance.event ||
                !eventInstance.context ||
                !eventInstance.context.handler ||
                typeof eventInstance.context.handler !== 'function'
            ) {
                this.logger.warn(
                    `Skipping invalid event file: ${resolvedPath}`,
                );
                continue;
            }

            const { event: eventName, context } = eventInstance;

            const existingHandlers = this.eventHandlers.get(eventName) || [];
            this.eventHandlers.set(eventName, [
                ...existingHandlers,
                context.handler,
            ]);

            this.logger.info(`Loaded event: ${eventName}`);
        }
    }

    public start(): void | Promise<void> {
        for (const [eventName, handlers] of this.eventHandlers.entries()) {
            if (!this.activeHandlerWrappers.has(eventName)) {
                this.activeHandlerWrappers.set(eventName, new Map());
            }
            const eventWrappers = this.activeHandlerWrappers.get(eventName)!;

            for (const handler of handlers) {
                if (eventWrappers.has(handler)) {
                    continue;
                }

                const wrapper = (...args: any[]) => {
                    handler(this.bot, eventName, args);
                };

                eventWrappers.set(handler, wrapper);
                this.bot.client.on(eventName, wrapper);
            }
        }
    }

    public stop(): void | Promise<void> {
        for (const [
            eventName,
            eventWrappers,
        ] of this.activeHandlerWrappers.entries()) {
            for (const wrapper of eventWrappers.values()) {
                this.bot.client.removeListener(
                    eventName,
                    wrapper as () => void,
                );
            }
        }
        this.activeHandlerWrappers.clear();
        this.eventHandlers.clear();
    }

    public addEventListener(event: Event<any>): void {
        const { event: eventName, context } = event;
        const { handler } = context;

        const handlers = this.eventHandlers.get(eventName) || [];
        if (!handlers.includes(handler)) {
            handlers.push(handler);
            this.eventHandlers.set(eventName, handlers);
        }

        if (!this.activeHandlerWrappers.has(eventName)) {
            this.activeHandlerWrappers.set(eventName, new Map());
        }
        const eventWrappers = this.activeHandlerWrappers.get(eventName)!;

        if (!eventWrappers.has(handler)) {
            const wrapper = (...args: any[]) => {
                handler(this.bot, eventName, args);
            };

            eventWrappers.set(handler, wrapper);
            this.bot.client.on(eventName, wrapper);
        }
    }

    public removeEventListener(event: Event<any>): void {
        const { event: eventName, context } = event;
        const { handler } = context;

        if (this.eventHandlers.has(eventName)) {
            const handlers = this.eventHandlers.get(eventName)!;
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
            if (handlers.length === 0) {
                this.eventHandlers.delete(eventName);
            }
        }

        if (this.activeHandlerWrappers.has(eventName)) {
            const eventWrappers = this.activeHandlerWrappers.get(eventName)!;
            const wrapper = eventWrappers.get(handler);

            if (wrapper) {
                this.bot.client.removeListener(
                    eventName,
                    wrapper as () => void,
                );
                eventWrappers.delete(handler);

                if (eventWrappers.size === 0) {
                    this.activeHandlerWrappers.delete(eventName);
                }
            }
        }
    }
}

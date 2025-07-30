import path from 'node:path';
import BaseModule from '@modules/base.module';
import Event from '@utils/core/event';
import Loader from '@utils/core/loader';
import { Logger } from '@utils/core/logger';
import type { ClientEvents } from 'discord.js';

export const EVENTS_DIRECTORY = 'events';

type UnknownFunction = (...args: unknown[]) => unknown;

export default class EventModule extends BaseModule {
	eventHandlers: Map<string, UnknownFunction[]> = new Map();
	activeHandlerWrappers: Map<string, Map<UnknownFunction, UnknownFunction>> =
		new Map();

	logger = new Logger('EventModule');

	public async init(): Promise<void> {
		this.eventHandlers.clear();

		const loader = new Loader<Event>(
			path.join(process.cwd(), 'src', EVENTS_DIRECTORY),
			{
				filter: (fileName) =>
					fileName.endsWith('.js') || fileName.endsWith('.ts'),
				loggerContext: 'EventLoader',
			}
		);

		const events = await loader.load();

		for (const event of events) {
			if (
				!event ||
				typeof event !== 'object' ||
				!(event instanceof Event) ||
				!event.event ||
				!event.context ||
				!event.context.handler ||
				typeof event.context.handler !== 'function'
			) {
				this.logger.warn('Skipping invalid event file.');
				continue;
			}

			const { event: eventName, context } = event;

			const existingHandlers = this.eventHandlers.get(eventName) || [];
			this.eventHandlers.set(eventName, [
				...existingHandlers,
				context.handler as UnknownFunction,
			]);

			this.logger.info(`Loaded event: ${eventName}`);
		}
	}

	public start(): void | Promise<void> {
		for (const [eventName, handlers] of this.eventHandlers.entries()) {
			if (!this.activeHandlerWrappers.has(eventName)) {
				this.activeHandlerWrappers.set(eventName, new Map());
			}
			const eventWrappers =
				this.activeHandlerWrappers.get(eventName) ?? new Map();

			for (const handler of handlers) {
				if (eventWrappers.has(handler)) {
					continue;
				}

				const wrapper = (...args: unknown[]) => {
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
					wrapper as () => void
				);
			}
		}
		this.activeHandlerWrappers.clear();
		this.eventHandlers.clear();
	}

	public addEventListener(event: Event<keyof ClientEvents>): void {
		const { event: eventName, context } = event;
		const handler = context?.handler as UnknownFunction;

		const handlers = this.eventHandlers.get(eventName) || [];
		if (!handlers.includes(handler)) {
			handlers.push(handler);
			this.eventHandlers.set(eventName, handlers);
		}

		if (!this.activeHandlerWrappers.has(eventName)) {
			this.activeHandlerWrappers.set(eventName, new Map());
		}
		const eventWrappers =
			this.activeHandlerWrappers.get(eventName) ?? new Map();

		if (!eventWrappers.has(handler)) {
			const wrapper = (...args: unknown[]) => {
				handler(this.bot, eventName, args);
			};

			eventWrappers.set(handler, wrapper);
			this.bot.client.on(eventName, wrapper);
		}
	}

	public removeEventListener(event: Event<keyof ClientEvents>): void {
		const { event: eventName, context } = event;
		const handler = context?.handler as UnknownFunction;

		const handlers = this.eventHandlers.get(eventName);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
			if (handlers.length === 0) {
				this.eventHandlers.delete(eventName);
			}
		}

		const eventWrappers = this.activeHandlerWrappers.get(eventName);
		if (eventWrappers) {
			const wrapper = eventWrappers.get(handler);

			if (wrapper) {
				this.bot.client.removeListener(
					eventName,
					wrapper as () => void
				);
				eventWrappers.delete(handler);

				if (eventWrappers.size === 0) {
					this.activeHandlerWrappers.delete(eventName);
				}
			}
		}
	}
}

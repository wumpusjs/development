import path from 'node:path';
import BaseModule from '@modules/base.module';
import Event from '@utils/core/event';
import Loader from '@utils/core/loader';
import { Logger } from '@utils/core/logger';
import { BaseState } from '@utils/state';
import type { ClientEvents } from 'discord.js';

export const EVENTS_DIRECTORY = 'events';

type UnknownFunction = (...args: unknown[]) => unknown;

export class EventModuleState extends BaseState {
	eventHandlers: Map<string, UnknownFunction[]> = new Map();
	activeHandlerWrappers: Map<string, Map<UnknownFunction, UnknownFunction>> =
		new Map();
}

export default class EventModule extends BaseModule {
	logger = new Logger('EventModule');

	public async init(): Promise<void> {
		const loader = new Loader<Event>(
			path.join(process.cwd(), 'src', EVENTS_DIRECTORY),
			{
				filter: (fileName) =>
					fileName.endsWith('.js') || fileName.endsWith('.ts'),
				loggerContext: 'EventLoader',
			}
		);

		const events = await loader.load();
		const eventModuleState = this.bot.state.get(EventModuleState);

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

			const existingHandlers =
				eventModuleState.eventHandlers.get(eventName) || [];
			eventModuleState.eventHandlers.set(eventName, [
				...existingHandlers,
				context.handler as UnknownFunction,
			]);

			this.logger.info(`Loaded event: ${eventName}`);
		}
	}

	public start(): void | Promise<void> {
		const eventModuleState = this.bot.state.get(EventModuleState);
		for (const [
			eventName,
			handlers,
		] of eventModuleState.eventHandlers.entries()) {
			if (!eventModuleState.activeHandlerWrappers.has(eventName)) {
				eventModuleState.activeHandlerWrappers.set(
					eventName,
					new Map()
				);
			}
			const eventWrappers =
				eventModuleState.activeHandlerWrappers.get(eventName) ??
				new Map();

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
		const eventModuleState = this.bot.state.get(EventModuleState);
		for (const [
			eventName,
			eventWrappers,
		] of eventModuleState.activeHandlerWrappers.entries()) {
			for (const wrapper of eventWrappers.values()) {
				this.bot.client.removeListener(
					eventName,
					wrapper as () => void
				);
			}
		}
		eventModuleState.activeHandlerWrappers.clear();
		eventModuleState.eventHandlers.clear();
	}

	public addEventListener(event: Event<keyof ClientEvents>): void {
		const eventModuleState = this.bot.state.get(EventModuleState);
		const { event: eventName, context } = event;
		const handler = context?.handler as UnknownFunction;

		const handlers = eventModuleState.eventHandlers.get(eventName) || [];
		if (!handlers.includes(handler)) {
			handlers.push(handler);
			eventModuleState.eventHandlers.set(eventName, handlers);
		}

		if (!eventModuleState.activeHandlerWrappers.has(eventName)) {
			eventModuleState.activeHandlerWrappers.set(eventName, new Map());
		}
		const eventWrappers =
			eventModuleState.activeHandlerWrappers.get(eventName) ?? new Map();

		if (!eventWrappers.has(handler)) {
			const wrapper = (...args: unknown[]) => {
				handler(this.bot, eventName, args);
			};

			eventWrappers.set(handler, wrapper);
			this.bot.client.on(eventName, wrapper);
		}
	}

	public removeEventListener(event: Event<keyof ClientEvents>): void {
		const eventModuleState = this.bot.state.get(EventModuleState);
		const { event: eventName, context } = event;
		const handler = context?.handler as UnknownFunction;

		const handlers = eventModuleState.eventHandlers.get(eventName);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
			if (handlers.length === 0) {
				eventModuleState.eventHandlers.delete(eventName);
			}
		}

		const eventWrappers =
			eventModuleState.activeHandlerWrappers.get(eventName);
		if (eventWrappers) {
			const wrapper = eventWrappers.get(handler);

			if (wrapper) {
				this.bot.client.removeListener(
					eventName,
					wrapper as () => void
				);
				eventWrappers.delete(handler);

				if (eventWrappers.size === 0) {
					eventModuleState.activeHandlerWrappers.delete(eventName);
				}
			}
		}
	}
}

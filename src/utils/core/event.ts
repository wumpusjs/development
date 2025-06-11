import { ClientEvents } from 'discord.js';
import Bot from '@utils/bot';

declare global {
    namespace Wumpus {
        export interface IEventContext<
            T extends keyof ClientEvents = keyof ClientEvents,
        > {
            handler: (bot: Bot, event: T, args: ClientEvents[T]) => void;
        }
    }
}

export default class Event<
    EventName extends keyof ClientEvents = keyof ClientEvents,
> {
    constructor(
        public event: EventName,
        public context: Wumpus.IEventContext<EventName>,
    ) {}
}

export type EventContext = Wumpus.IEventContext;

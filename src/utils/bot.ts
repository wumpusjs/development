import EventEmitter from 'events';
import { Client, ClientOptions } from 'discord.js';
import path from 'path';

import BaseModule from '@modules/base.module';
import { initializeHMR } from '@utils/core/hmr';

interface BotOptions extends ClientOptions {
    token: string;
    hmr?: boolean;
}

type ModuleConstructor<T extends BaseModule = BaseModule> = new (bot: Bot) => T;

export default class Bot extends EventEmitter {
    modules: Map<string, BaseModule> = new Map();
    client: Client;

    constructor(private readonly options: BotOptions) {
        super();
        this.client = new Client(this.options);
        if (options?.hmr) {
            console.log('[HMR] Hot Module Replacement is enabled.');
            initializeHMR(this, path.join(process.cwd(), 'src', 'modules'));
        }
    }

    register<T extends BaseModule>(ModuleClass: ModuleConstructor<T>): void {
        const moduleName = ModuleClass.name;

        if (this.modules.has(moduleName)) {
            throw new Error(`Module ${moduleName} is already registered.`);
        }

        const moduleInstance = new ModuleClass(this);

        this.modules.set(moduleName, moduleInstance);
    }

    get<T extends BaseModule>(
        ModuleClass: ModuleConstructor<T>,
    ): T | undefined {
        const moduleName = ModuleClass.name;
        const moduleInstance = this.modules.get(moduleName);
        return moduleInstance as T | undefined;
    }

    async init(): Promise<void> {
        for (const module of this.modules.values()) {
            if (typeof module.init === 'function') {
                await module.init(this);
            }
        }

        this.client = new Client(this.options);

        this.emit('initialized', this.client);
    }

    async start(): Promise<void> {
        for (const module of this.modules.values()) {
            if (typeof module.start === 'function') {
                await module.start();
            }
        }

        this.client.login(this.options.token).catch((error) => {
            console.error('Failed to login:', error);
            this.emit('error', error);
        });

        this.emit('started', this.client);
    }

    async stop(): Promise<void> {
        for (const module of this.modules.values()) {
            if (typeof module.stop === 'function') {
                await module.stop();
            }
        }

        this.client.destroy();

        this.emit('stop', this.client);
    }
}

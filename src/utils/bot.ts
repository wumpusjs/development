import EventEmitter from 'node:events';
import path from 'node:path';
import type BaseModule from '@modules/base.module';
import type { ModuleConstructor } from '@modules/base.module';
import { initializeHMR } from '@utils/core/hmr';
import { Logger } from '@utils/core/logger';
import { State } from '@utils/state';
import { Client, type ClientOptions } from 'discord.js';

interface BotOptions extends ClientOptions {
	token: string;
	hmr?: boolean;
	modules?: 'register' | 'auto';
}

export default class Bot extends EventEmitter {
	modules: Map<string, BaseModule> = new Map();
	client: Client;
	logger: Logger = new Logger('Bot');
	state: State;

	constructor(public readonly options: BotOptions) {
		super();
		this.options.modules = ['register', 'auto'].includes(
			options?.modules ?? ''
		)
			? options.modules
			: 'register';
		this.client = new Client(this.options);
		this.state = new State();
		if (options?.hmr) {
			initializeHMR(this, path.join(process.cwd(), 'src', 'modules'));
		}
	}

	register<TB extends BaseModule>(ModuleClass: ModuleConstructor<TB>): void {
		const moduleName = ModuleClass.name;

		if (this.modules.has(moduleName)) {
			throw new Error(`Module ${moduleName} is already registered.`);
		}

		const moduleInstance = new ModuleClass(this);

		this.modules.set(moduleName, moduleInstance);
	}

	get<TB extends BaseModule>(
		ModuleClass: ModuleConstructor<TB>
	): TB | undefined {
		const moduleName = ModuleClass.name;
		const moduleInstance = this.modules.get(moduleName);
		return moduleInstance as TB | undefined;
	}

	async init(): Promise<void> {
		const initPromises = Array.from(this.modules.values()).map((module) => {
			if (typeof module.init === 'function') {
				return module.init(this);
			}
			return Promise.resolve();
		});

		await Promise.all(initPromises);

		this.client = new Client(this.options);

		this.emit('initialized', this.client);
	}

	async start(): Promise<void> {
		// Ensure all required modules are loaded and set before starting
		for (const module of this.modules.values()) {
			if (module.requirements?.modules) {
				for (const requiredModule of module.requirements.modules) {
					if (!this.get(requiredModule)) {
						this.logger.error(
							`Required module ${requiredModule.name} is not registered.`
						);
						process.exit(1);
					}
				}
			}
		}

		const startPromises = Array.from(this.modules.values()).map(
			(module) => {
				if (typeof module.start === 'function') {
					return module.start();
				}
				return Promise.resolve();
			}
		);

		await Promise.all(startPromises);

		this.client.login(this.options.token).catch((error) => {
			this.logger.error('Failed to login:', error);
			this.emit('error', error);
		});

		this.emit('started', this.client);
	}

	async stop(): Promise<void> {
		const stopPromises = Array.from(this.modules.values()).map((module) => {
			if (typeof module.stop === 'function') {
				return module.stop();
			}
			return Promise.resolve();
		});

		await Promise.all(stopPromises);

		this.client.destroy();

		this.emit('stop', this.client);
	}
}

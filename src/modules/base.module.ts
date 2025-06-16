import type Bot from '@utils/bot';

export interface IModuleRequirements {
    modules: ModuleConstructor[];
}

export interface IModule<
    InitialArguments extends [Bot, ...unknown[]] = [Bot, ...unknown[]],
    StartArguments extends unknown[] = unknown[],
    StopArguments extends unknown[] = unknown[],
> {
    readonly bot: Bot;

    init(...args: InitialArguments): void | Promise<void>;
    start(...args: StartArguments): void | Promise<void>;
    stop(...args: StopArguments): void | Promise<void>;

    requirements?:  IModuleRequirements;
}

export type ModuleConstructor<T extends BaseModule = BaseModule> = new (bot: Bot) => T;

export default class BaseModule<
    InitialArguments extends [Bot, ...unknown[]] = [Bot, ...unknown[]],
    StartArguments extends unknown[] = unknown[],
    StopArguments extends unknown[] = unknown[],
> implements IModule<InitialArguments, StartArguments, StopArguments>
{
    requirements?: IModuleRequirements;

    constructor(public readonly bot: Bot) {}

    public init(...args: InitialArguments): void | Promise<void> {}
    public start(...args: StartArguments): void | Promise<void> {}
    public stop(...args: StopArguments): void | Promise<void> {}
}

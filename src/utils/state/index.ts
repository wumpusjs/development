type StateConstructor<T> = new (...args: unknown[]) => T;

export class State {
	private state: Map<StateConstructor<unknown>, unknown> = new Map();

	public get<T>(key: StateConstructor<T>): T {
		if (!this.state.has(key)) {
			this.state.set(key, new key());
		}
		return this.state.get(key) as T;
	}

	public set<T>(key: StateConstructor<T>, value: T): void {
		this.state.set(key, value);
	}
}

export abstract class BaseState {}

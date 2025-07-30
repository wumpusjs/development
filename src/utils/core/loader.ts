import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from '@utils/core/logger';

export type TFileFilter = (fileName: string) => boolean;

export interface ILoaderOptions {
	filter?: TFileFilter;
	loggerContext?: string;
}

export default class Loader<T> {
	private readonly logger: Logger;

	constructor(
		public readonly directory: string,
		public readonly options?: ILoaderOptions
	) {
		this.logger = new Logger(this.options?.loggerContext ?? 'Loader');
	}

	public async load(): Promise<T[]> {
		const resolvedPaths = await this.resolvePaths();
		const modulePromises = resolvedPaths.map(async (resolvedPath) => {
			try {
				const importedModule: T | unknown = (
					await import(`${resolvedPath}?v=${Date.now()}`)
				)?.default;
				return importedModule as T;
			} catch (error) {
				this.logger.error(
					`Error loading module from ${resolvedPath}:`,
					error
				);
				return null;
			}
		});

		const loadedModules = (await Promise.all(modulePromises)).filter(
			(module: T | null): module is T => module !== null
		);

		return loadedModules as T[];
	}

	private async resolvePaths(): Promise<string[]> {
		const filePaths = await this.readFolderRecursively(this.directory);
		const pathPromises = filePaths.map(async (fullPath) => {
			try {
				const stats = await fs.lstat(fullPath);
				let resolvedPath: string | null = null;

				if (stats.isSymbolicLink()) {
					resolvedPath = await fs.realpath(fullPath);
				} else if (stats.isFile()) {
					resolvedPath = fullPath;
				}

				if (resolvedPath) {
					return pathToFileURL(resolvedPath).href;
				}
			} catch (error) {
				this.logger.error(`Error processing file ${fullPath}:`, error);
			}
			return null;
		});

		return (await Promise.all(pathPromises)).filter(
			(entityPath): entityPath is string => entityPath !== null
		);
	}

	private async readFolderRecursively(folder: string): Promise<string[]> {
		const entries = await fs.readdir(folder, { withFileTypes: true });
		const filePromises = entries.map(async (entry) => {
			const fullPath = path.join(folder, entry.name);
			if (entry.isDirectory()) {
				return this.readFolderRecursively(fullPath);
			}

			if (
				entry.isFile() &&
				(this.options?.filter ?? (() => true))(entry.name)
			) {
				return [fullPath];
			}
			return [];
		});

		return (await Promise.all(filePromises)).flat();
	}
}

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
	private readonly resolvedPaths: string[] = [];
	private readonly logger: Logger;

	constructor(
		public readonly directory: string,
		public readonly options?: ILoaderOptions
	) {
		this.logger = new Logger(this.options?.loggerContext ?? 'Loader');
	}

	public async load(): Promise<T[]> {
		const loadedModules: T[] = [];
		await this.resolvePaths();

		for (const resolvedPath of this.resolvedPaths) {
			try {
				const importedModule: T | unknown = (
					await import(`${resolvedPath}?v=${Date.now()}`)
				)?.default;

				if (importedModule) {
					loadedModules.push(importedModule as T);
				}
			} catch (error) {
				this.logger.error(
					`Error loading module from ${resolvedPath}:`,
					error
				);
			}
		}

		return loadedModules;
	}

	private async resolvePaths(): Promise<void> {
		this.resolvedPaths.length = 0;
		const filePaths = await this.readFolderRecursively(this.directory);

		for (const fullPath of filePaths) {
			try {
				const stats = await fs.lstat(fullPath);
				let resolvedPath: string | null = null;

				if (stats.isSymbolicLink()) {
					resolvedPath = await fs.realpath(fullPath);
				} else if (stats.isFile()) {
					resolvedPath = fullPath;
				}

				if (resolvedPath) {
					this.resolvedPaths.push(pathToFileURL(resolvedPath).href);
				}
			} catch (error) {
				this.logger.error(`Error processing file ${fullPath}:`, error);
			}
		}
	}

	private async readFolderRecursively(folder: string): Promise<string[]> {
		const entries = await fs.readdir(folder, { withFileTypes: true });
		const files: string[] = [];

		for (const entry of entries) {
			const fullPath = path.join(folder, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await this.readFolderRecursively(fullPath)));
			} else if (
				entry.isFile() &&
				(this.options?.filter ?? (() => true))(entry.name)
			) {
				files.push(fullPath);
			}
		}

		return files;
	}
}

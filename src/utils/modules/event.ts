import * as fs from 'fs/promises';
import * as path from 'path';

export async function readFolderRecursively(
    folder: string,
    filter: (file: string) => boolean = () => true,
): Promise<string[]> {
    async function readDir(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...(await readDir(fullPath)));
            } else if (entry.isFile() && filter(entry.name)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    return readDir(folder);
}

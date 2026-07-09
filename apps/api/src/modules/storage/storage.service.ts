import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class StorageService {
  private storagePath: string;

  constructor(private config: ConfigService) {
    this.storagePath = path.resolve(this.config.get('storage.path', './data/storage'));
  }

  private assertContained(resolvedPath: string) {
    if (!resolvedPath.startsWith(this.storagePath + path.sep) && resolvedPath !== this.storagePath) {
      throw new BadRequestException('Access to path outside storage directory is not allowed');
    }
  }

  async saveFile(directory: string, filename: string, data: Buffer | string): Promise<string> {
    const dir = path.resolve(path.join(this.storagePath, directory));
    this.assertContained(dir);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    this.assertContained(path.resolve(filePath));
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async saveScreenshot(jobId: string, base64Data: string, url?: string): Promise<string> {
    const buffer = Buffer.from(base64Data, 'base64');
    // Use URL-based filename for crawls (multiple screenshots per job)
    const filename = url
      ? `${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 100)}.png`
      : 'screenshot.png';
    return this.saveFile(`screenshots/${jobId}`, filename, buffer);
  }

  async readFile(filePath: string): Promise<Buffer> {
    // If path is already absolute and under storagePath, use it directly
    // Otherwise treat as relative to storagePath
    const resolved = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(path.join(this.storagePath, filePath));
    this.assertContained(resolved);
    return fs.readFile(resolved);
  }

  async deleteDirectory(directory: string): Promise<void> {
    const dir = path.resolve(path.join(this.storagePath, directory));
    this.assertContained(dir);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

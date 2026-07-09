import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// Mock fs/promises before importing StorageService
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn(),
}));

import * as fs from 'fs/promises';
import { StorageService } from '../storage.service';

const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockRm = fs.rm as jest.MockedFunction<typeof fs.rm>;

// Fixed storage path for predictable tests
const TEST_STORAGE_PATH = '/tmp/test-storage';

const mockConfigService = {
  get: jest.fn().mockReturnValue(TEST_STORAGE_PATH),
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue(TEST_STORAGE_PATH);
    service = new StorageService(mockConfigService as any);

    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from('file content') as never);
    mockRm.mockResolvedValue(undefined);
  });

  describe('saveFile', () => {
    it('creates the directory with recursive flag', async () => {
      await service.saveFile('jobs/job-1', 'result.json', '{}');

      expect(mockMkdir).toHaveBeenCalledWith(
        path.resolve(path.join(TEST_STORAGE_PATH, 'jobs/job-1')),
        { recursive: true },
      );
    });

    it('writes the file data to disk', async () => {
      const data = Buffer.from('binary content');
      await service.saveFile('screenshots/job-1', 'screenshot.png', data);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('screenshot.png'),
        data,
      );
    });

    it('writes string data to disk', async () => {
      await service.saveFile('results', 'data.json', '{"key":"value"}');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        '{"key":"value"}',
      );
    });

    it('returns the absolute file path after writing', async () => {
      const result = await service.saveFile('jobs', 'output.json', '{}');

      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain('output.json');
      expect(result).toContain(TEST_STORAGE_PATH);
    });

    it('throws BadRequestException on path traversal via directory', async () => {
      await expect(
        service.saveFile('../../etc', 'passwd', 'malicious'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on path traversal via filename', async () => {
      await expect(
        service.saveFile('jobs', '../../../etc/passwd', 'malicious'),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not write file when directory is outside storage path', async () => {
      await expect(
        service.saveFile('../../outside', 'file.txt', 'data'),
      ).rejects.toThrow();

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('rejects with message about path outside storage directory', async () => {
      await expect(
        service.saveFile('../../etc', 'passwd', 'data'),
      ).rejects.toThrow('outside storage directory');
    });
  });

  describe('readFile', () => {
    it('reads a file by relative path within storage', async () => {
      await service.readFile('jobs/job-1/result.json');

      const expectedPath = path.resolve(
        path.join(TEST_STORAGE_PATH, 'jobs/job-1/result.json'),
      );
      expect(mockReadFile).toHaveBeenCalledWith(expectedPath);
    });

    it('reads a file by absolute path when it is within storagePath', async () => {
      const absolutePath = path.join(TEST_STORAGE_PATH, 'jobs/output.json');
      await service.readFile(absolutePath);

      expect(mockReadFile).toHaveBeenCalledWith(absolutePath);
    });

    it('returns the file buffer', async () => {
      const expectedBuffer = Buffer.from('test file content');
      mockReadFile.mockResolvedValue(expectedBuffer as never);

      const result = await service.readFile('jobs/result.json');
      expect(result).toEqual(expectedBuffer);
    });

    it('throws BadRequestException on relative path traversal (../../etc/passwd)', async () => {
      await expect(service.readFile('../../etc/passwd')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException on absolute path outside storage', async () => {
      await expect(service.readFile('/etc/passwd')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with message about outside storage directory', async () => {
      await expect(service.readFile('../../etc/passwd')).rejects.toThrow(
        'outside storage directory',
      );
    });

    it('does not call fs.readFile when path is outside storage', async () => {
      await expect(service.readFile('../../etc/shadow')).rejects.toThrow();
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteDirectory', () => {
    it('deletes a directory within storage path', async () => {
      await service.deleteDirectory('jobs/job-1');

      expect(mockRm).toHaveBeenCalledWith(
        path.resolve(path.join(TEST_STORAGE_PATH, 'jobs/job-1')),
        { recursive: true, force: true },
      );
    });

    it('uses recursive and force flags for deletion', async () => {
      await service.deleteDirectory('screenshots/job-abc');

      expect(mockRm).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true, force: true },
      );
    });

    it('throws BadRequestException on path traversal (../../etc)', async () => {
      await expect(service.deleteDirectory('../../etc')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws with message about outside storage directory', async () => {
      await expect(service.deleteDirectory('../outside')).rejects.toThrow(
        'outside storage directory',
      );
    });

    it('does not call fs.rm when directory is outside storage path', async () => {
      await expect(service.deleteDirectory('../../sensitive')).rejects.toThrow();
      expect(mockRm).not.toHaveBeenCalled();
    });

    it('resolves successfully for nested subdirectory', async () => {
      await expect(
        service.deleteDirectory('screenshots/2024/01/job-abc'),
      ).resolves.toBeUndefined();
    });
  });

  describe('storagePath initialization', () => {
    it('reads storage path from config service', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'storage.path',
        './data/storage',
      );
    });

    it('resolves the storage path to an absolute path', () => {
      // Service internally resolves the path — we verify this by checking
      // that operations use an absolute path derived from the config value
      const service2 = new StorageService(mockConfigService as any);
      // We verify indirectly: saveFile should build paths starting from
      // the absolute resolved storage path
      return expect(
        service2.saveFile('test', 'file.txt', 'content'),
      ).resolves.toEqual(expect.stringContaining(path.resolve(TEST_STORAGE_PATH)));
    });
  });
});

import fs from 'fs';
import * as os from 'os';
import path from 'path';
import * as tmp from 'tmp';
import * as uuid from 'uuid';
import * as buildx from './buildx';
import * as core from '@actions/core';
import {issueCommand} from '@actions/core/lib/command';

let _tmpDir: string;
export const osPlat: string = os.platform();
export const osArch: string = os.arch();

export function tmpDir(): string {
  if (!_tmpDir) {
    _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-setup-buildx-')).split(path.sep).join(path.posix.sep);
  }
  return _tmpDir;
}

export function tmpNameSync(options?: tmp.TmpNameOptions): string {
  return tmp.tmpNameSync(options);
}

export interface Inputs {
  version: string;
  name: string;
  driver: string;
  driverOpts: string[];
  buildkitdFlags: string;
  install: boolean;
  use: boolean;
  endpoint: string;
  config: string;
  configInline: string;
}

export async function getInputs(): Promise<Inputs> {
  return {
    version: core.getInput('version'),
    name: getBuilderName(core.getInput('driver') || 'docker-container'),
    driver: core.getInput('driver') || 'docker-container',
    driverOpts: await getInputList('driver-opts', true),
    buildkitdFlags: core.getInput('buildkitd-flags') || '--allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host',
    install: core.getBooleanInput('install'),
    use: core.getBooleanInput('use'),
    endpoint: core.getInput('endpoint'),
    config: core.getInput('config'),
    configInline: core.getInput('config-inline')
  };
}

export function getBuilderName(driver: string): string {
  return driver == 'docker' ? 'default' : `builder-${uuid.v4()}`;
}

export async function getCreateArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  const args: Array<string> = ['create', '--name', inputs.name, '--driver', inputs.driver];
  if (buildx.satisfies(buildxVersion, '>=0.3.0')) {
    await asyncForEach(inputs.driverOpts, async driverOpt => {
      args.push('--driver-opt', driverOpt);
    });
    if (inputs.driver != 'remote' && inputs.buildkitdFlags) {
      args.push('--buildkitd-flags', inputs.buildkitdFlags);
    }
  }
  if (inputs.use) {
    args.push('--use');
  }
  if (inputs.driver != 'remote') {
    if (inputs.config) {
      args.push('--config', await buildx.getConfigFile(inputs.config));
    } else if (inputs.configInline) {
      args.push('--config', await buildx.getConfigInline(inputs.configInline));
    }
  }
  if (inputs.endpoint) {
    args.push(inputs.endpoint);
  }
  return args;
}

export async function getInspectArgs(inputs: Inputs, buildxVersion: string): Promise<Array<string>> {
  const args: Array<string> = ['inspect', '--bootstrap'];
  if (buildx.satisfies(buildxVersion, '>=0.4.0')) {
    args.push('--builder', inputs.name);
  }
  return args;
}

export async function getInputList(name: string, ignoreComma?: boolean): Promise<string[]> {
  const items = core.getInput(name);
  if (items == '') {
    return [];
  }
  return items
    .split(/\r?\n/)
    .filter(x => x)
    .reduce<string[]>((acc, line) => acc.concat(!ignoreComma ? line.split(',').filter(x => x) : line).map(pat => pat.trim()), []);
}

export const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

// FIXME: Temp fix https://github.com/actions/toolkit/issues/777
export function setOutput(name: string, value: unknown): void {
  issueCommand('set-output', {name}, value);
}

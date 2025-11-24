import { spawn } from 'child_process';
import fs from 'fs';
import {fileURLToPath} from "url";
import path from "path";
import {getLlama, LlamaChatSession} from "node-llama-cpp";

const __dirname = process.cwd();

// Example: Spawning a Node.js script in the background
const out = fs.openSync('./out.log', 'a');
const err = fs.openSync('./err.log', 'a');

const child = spawn(process.execPath, ['.src/utils/startupUtil.ts'], {
  detached: true,
  stdio: ['ignore', out, err], // Redirect stdout and stderr to files
});

//child.unref();

console.log('Child process spawned in the background.');